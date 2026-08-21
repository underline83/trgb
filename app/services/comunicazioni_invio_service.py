# @version: v1.0-comunicazioni
# -*- coding: utf-8 -*-
# Modulo: comunicazioni
# Classificazione: [core]
"""
Motore di invio delle campagne — modulo Comunicazioni.

Prepara la coda, manda a scaglioni, e si ferma da solo se la campagna sta
andando male. Il provider è intercambiabile (`comunicazioni_provider`).

IL KILL SWITCH — la ragione per cui questo file non è un ciclo for
-------------------------------------------------------------------
Mandare 6.000 email è facile. Il difficile è accorgersi al 1.500esimo che sta
andando male e fermarsi. Fra uno scaglione e l'altro si guardano due numeri:

    segnalazioni spam / consegnate   → oltre soglia, si ferma
    rimbalzi / inviate               → oltre soglia, si ferma

Soglie in `comm_impostazioni`, non nel codice: 0,1% e 5% di partenza, cioè i
limiti oltre i quali un provider serio sospende l'account. Meglio una campagna
a metà che restare senza canale.

C'è anche un minimo di invii sotto il quale le soglie non si valutano
(`stop_minimo_invii`): su 50 invii una sola segnalazione fa il 2% e bloccherebbe
tutto per niente.

I dati arrivano in ritardo: le segnalazioni le sappiamo dai webhook, che
tornano minuti dopo. Il controllo guarda quello che si sa in quel momento, ed è
il motivo per cui gli scaglioni hanno una pausa in mezzo invece di correre.

L'ORDINE DEGLI SCAGLIONI NON È CASUALE
---------------------------------------
Si parte dai clienti più recenti. Chi ha mangiato da te il mese scorso apre e
non segnala; chi è in lista dal 2019 è più probabile che faccia danni. Se la
campagna deve fermarsi, meglio che si fermi dopo aver raggiunto i primi.
"""

from __future__ import annotations

import html
import logging
import re
import time
from typing import Any, Dict, List, Optional

from app.models.comm_db import get_comm_conn, get_impostazione
from app.services import comunicazioni_service as svc
from app.services.comunicazioni_provider import get_provider

logger = logging.getLogger("trgb.comunicazioni.invio")


# ══════════════════════════════════════════════════════════════════
#  Preparazione
# ══════════════════════════════════════════════════════════════════

def _imposta_int(chiave: str, default: int) -> int:
    try:
        return int(float(get_impostazione(chiave, str(default))))
    except (TypeError, ValueError):
        return default


def _imposta_float(chiave: str, default: float) -> float:
    try:
        return float(get_impostazione(chiave, str(default)))
    except (TypeError, ValueError):
        return default


def url_disiscrizione(token: str) -> str:
    base = (get_impostazione("unsub_url_base", "") or "").rstrip("/")
    return f"{base}/comunicazioni/disiscriviti/{token}" if base else ""


def html_in_testo(testo_html: str) -> str:
    """
    Versione testuale del messaggio. Grezza ma sufficiente: serve ai client che
    non leggono HTML e — soprattutto — ai filtri antispam, che guardano male i
    messaggi con la sola parte HTML.
    """
    t = re.sub(r"<br\s*/?>", "\n", testo_html or "", flags=re.I)
    t = re.sub(r"</(p|div|h[1-6]|li|tr)>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def personalizza(testo: str, contatto: Dict[str, Any], unsub_url: str) -> str:
    """
    Segnaposto ammessi: {{nome}} {{cognome}} {{unsub_url}}
    Il nome viene messo in escape: finisce dentro HTML e arriva da un import.
    """
    if not testo:
        return ""
    sostituzioni = {
        "{{nome}}": html.escape(contatto.get("nome") or ""),
        "{{cognome}}": html.escape(contatto.get("cognome") or ""),
        "{{unsub_url}}": unsub_url,
    }
    for segnaposto, valore in sostituzioni.items():
        testo = testo.replace(segnaposto, valore)
    return testo


def prepara_coda(campagna_id: int) -> Dict[str, Any]:
    """
    Risolve i destinatari e crea le righe in `comm_invii`.

    I destinatari si risolvono ORA, non quando la campagna è stata scritta: se
    qualcuno si è disiscritto nel frattempo non deve entrare in coda.
    """
    conn = get_comm_conn()
    try:
        camp = conn.execute("SELECT * FROM comm_campagne WHERE id = ?", (campagna_id,)).fetchone()
        if not camp:
            return {"ok": False, "errore": "campagna inesistente"}
        if camp["stato"] not in ("bozza", "programmata"):
            return {"ok": False, "errore": f"campagna in stato {camp['stato']}, non preparabile"}

        import json as _json
        filtro = _json.loads(camp["destinatari_filtro"]) if camp["destinatari_filtro"] else {}
        destinatari = svc.risolvi_destinatari(filtro, canale=camp["canale"] or "email")

        dimensione = max(1, _imposta_int("scaglione_dimensione", 500))
        cur = conn.cursor()
        cur.execute("DELETE FROM comm_invii WHERE campagna_id = ? AND stato = 'in_coda'",
                    (campagna_id,))

        inseriti = 0
        for i, d in enumerate(destinatari):
            cur.execute(
                """INSERT OR IGNORE INTO comm_invii
                   (campagna_id, contatto_id, email_usata, stato, scaglione)
                   VALUES (?,?,?,'in_coda',?)""",
                (campagna_id, d["id"], d["email"], i // dimensione + 1),
            )
            inseriti += cur.rowcount
        cur.execute("UPDATE comm_campagne SET destinatari_stimati = ? WHERE id = ?",
                    (len(destinatari), campagna_id))
        conn.commit()

        return {
            "ok": True,
            "destinatari": len(destinatari),
            "in_coda": inseriti,
            "scaglioni": (len(destinatari) + dimensione - 1) // dimensione,
            "dimensione_scaglione": dimensione,
        }
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════
#  Kill switch
# ══════════════════════════════════════════════════════════════════

def salute_campagna(campagna_id: int) -> Dict[str, Any]:
    """
    Come sta andando. Chiamata fra uno scaglione e l'altro.

    `deve_fermarsi` è True solo se si è superata una soglia E si è sopra il
    numero minimo di invii: sotto quella soglia i tassi non dicono niente.
    """
    conn = get_comm_conn()
    try:
        r = conn.execute(
            """SELECT
                 COUNT(*)                                             AS totali,
                 SUM(stato != 'in_coda')                              AS lavorate,
                 SUM(inviata_at IS NOT NULL)                          AS inviate,
                 SUM(stato = 'rimbalzata')                            AS rimbalzate,
                 SUM(segnalata_at IS NOT NULL)                        AS segnalate,
                 SUM(disiscritta_at IS NOT NULL)                      AS disiscritte,
                 SUM(stato = 'in_coda')                               AS residue,
                 SUM(aperta_at IS NOT NULL)                           AS aperte
               FROM comm_invii WHERE campagna_id = ?""",
            (campagna_id,),
        ).fetchone()
    finally:
        conn.close()

    inviate = r["inviate"] or 0
    consegnate = max(0, inviate - (r["rimbalzate"] or 0))
    minimo = _imposta_int("stop_minimo_invii", 300)
    soglia_spam = _imposta_float("stop_soglia_spam_pct", 0.1)
    soglia_bounce = _imposta_float("stop_soglia_bounce_pct", 5.0)

    pct_spam = ((r["segnalate"] or 0) / consegnate * 100) if consegnate else 0.0
    pct_bounce = ((r["rimbalzate"] or 0) / inviate * 100) if inviate else 0.0

    motivi: List[str] = []
    if inviate >= minimo:
        if pct_spam > soglia_spam:
            motivi.append(
                f"segnalazioni spam al {pct_spam:.2f}% (limite {soglia_spam}%)")
        if pct_bounce > soglia_bounce:
            motivi.append(
                f"rimbalzi al {pct_bounce:.2f}% (limite {soglia_bounce}%)")

    return {
        "totali": r["totali"] or 0,
        "lavorate": r["lavorate"] or 0,
        "inviate": inviate,
        "consegnate": consegnate,
        "residue": r["residue"] or 0,
        "rimbalzate": r["rimbalzate"] or 0,
        "segnalate": r["segnalate"] or 0,
        "disiscritte": r["disiscritte"] or 0,
        "aperte": r["aperte"] or 0,
        "pct_spam": round(pct_spam, 3),
        "pct_bounce": round(pct_bounce, 3),
        "sotto_minimo": inviate < minimo,
        "deve_fermarsi": bool(motivi),
        "motivi": motivi,
    }


def ferma_campagna(campagna_id: int, motivo: str) -> None:
    conn = get_comm_conn()
    try:
        conn.execute(
            """UPDATE comm_campagne
               SET stato = 'fermata', motivo_stop = ?, conclusa_at = datetime('now','localtime')
               WHERE id = ?""",
            (motivo, campagna_id),
        )
        conn.commit()
    finally:
        conn.close()
    logger.warning("comunicazioni: campagna %s FERMATA — %s", campagna_id, motivo)

    try:
        from app.services.notifiche_service import crea_notifica
        crea_notifica(
            titolo="Campagna fermata automaticamente",
            messaggio=f"La campagna #{campagna_id} si è fermata da sola: {motivo}",
            tipo="alert",
        )
    except Exception as exc:  # la notifica non deve mai far fallire lo stop
        logger.error("comunicazioni: notifica di stop non inviata (%s)", exc)


# ══════════════════════════════════════════════════════════════════
#  Invio
# ══════════════════════════════════════════════════════════════════

def _messaggio_base(camp) -> Dict[str, Any]:
    return {
        "oggetto": camp["oggetto"] or camp["titolo"],
        "mittente_nome": camp["mittente_nome"] or get_impostazione("mittente_nome", ""),
        "mittente_email": camp["mittente_email"] or get_impostazione("mittente_email", ""),
        "rispondi_a": camp["rispondi_a"] or get_impostazione("rispondi_a", "") or None,
        "campagna_id": camp["id"],
    }


def invia_scaglione(campagna_id: int, scaglione: Optional[int] = None,
                    dry_run: bool = False, pausa_fra_invii: float = 0.1) -> Dict[str, Any]:
    """
    Manda un blocco. Se `scaglione` è None prende il primo ancora in coda.

    Prima di partire ricontrolla la salute: se il blocco precedente ha prodotto
    troppe segnalazioni, questo non parte proprio.
    """
    salute = salute_campagna(campagna_id)
    if salute["deve_fermarsi"]:
        motivo = "; ".join(salute["motivi"])
        if not dry_run:
            ferma_campagna(campagna_id, motivo)
        return {"ok": False, "fermata": True, "motivo": motivo, "salute": salute}

    conn = get_comm_conn()
    try:
        camp = conn.execute("SELECT * FROM comm_campagne WHERE id = ?", (campagna_id,)).fetchone()
        if not camp:
            return {"ok": False, "errore": "campagna inesistente"}
        if camp["stato"] == "fermata":
            return {"ok": False, "errore": "campagna fermata", "salute": salute}
        if not (camp["mittente_email"] or get_impostazione("mittente_email", "")):
            return {"ok": False, "errore": "mittente non configurato"}

        if scaglione is None:
            riga = conn.execute(
                "SELECT MIN(scaglione) AS s FROM comm_invii "
                "WHERE campagna_id = ? AND stato = 'in_coda'", (campagna_id,)
            ).fetchone()
            scaglione = riga["s"] if riga and riga["s"] is not None else None
        if scaglione is None:
            conn.execute(
                """UPDATE comm_campagne SET stato = 'inviata',
                   conclusa_at = datetime('now','localtime') WHERE id = ?""", (campagna_id,))
            conn.commit()
            return {"ok": True, "concluso": True, "salute": salute_campagna(campagna_id)}

        righe = conn.execute(
            """SELECT i.id, i.contatto_id, i.email_usata,
                      c.nome, c.cognome, c.unsub_token
               FROM comm_invii i JOIN comm_contatti c ON c.id = i.contatto_id
               WHERE i.campagna_id = ? AND i.scaglione = ? AND i.stato = 'in_coda'""",
            (campagna_id, scaglione),
        ).fetchall()

        if camp["stato"] != "in_invio" and not dry_run:
            conn.execute(
                """UPDATE comm_campagne SET stato = 'in_invio',
                   iniziata_at = COALESCE(iniziata_at, datetime('now','localtime'))
                   WHERE id = ?""", (campagna_id,))
            conn.commit()

        provider = get_provider(camp["provider"])
        base = _messaggio_base(camp)
        esiti = {"inviate": 0, "fallite": 0, "scartate": 0, "soppresse": 0}
        cur = conn.cursor()

        for r in righe:
            # Ricontrollo all'ultimo istante: fra la preparazione della coda e
            # adesso il contatto può essersi disiscritto.
            stato_ora = cur.execute(
                "SELECT stato_email FROM comm_contatti WHERE id = ?", (r["contatto_id"],)
            ).fetchone()
            if not stato_ora or stato_ora["stato_email"] != "iscritto":
                cur.execute(
                    "UPDATE comm_invii SET stato = 'scartata', errore = ? WHERE id = ?",
                    (f"non più iscritto ({stato_ora['stato_email'] if stato_ora else 'assente'})",
                     r["id"]),
                )
                esiti["scartate"] += 1
                continue

            unsub = url_disiscrizione(r["unsub_token"])
            contatto = {"nome": r["nome"], "cognome": r["cognome"], "email": r["email_usata"]}
            corpo_html = personalizza(camp["corpo_html"] or "", contatto, unsub)
            corpo_testo = personalizza(camp["corpo_testo"] or "", contatto, unsub) \
                or html_in_testo(corpo_html)

            messaggio = dict(base, html=corpo_html, testo=corpo_testo, unsub_url=unsub)

            if dry_run:
                esiti["inviate"] += 1
                continue

            esito = provider.invia(contatto, messaggio)

            if esito.ok:
                cur.execute(
                    """UPDATE comm_invii SET stato = 'inviata', provider_msg_id = ?,
                       inviata_at = datetime('now','localtime'), errore = NULL
                       WHERE id = ?""",
                    (esito.provider_msg_id, r["id"]),
                )
                esiti["inviate"] += 1
            elif esito.permanente:
                # Indirizzo inesistente: rimbalzo duro. Si chiude il canale
                # subito e non si ritenta mai più.
                cur.execute(
                    """UPDATE comm_invii
                       SET stato = 'rimbalzata', tipo_rimbalzo = 'hard', errore = ?,
                           rimbalzata_at = datetime('now','localtime')
                       WHERE id = ?""",
                    (esito.errore, r["id"]),
                )
                svc.chiudi_canale(
                    r["contatto_id"], "soppresso", canale="email",
                    motivo="hard_bounce", fonte="provider",
                    dettagli={"errore": esito.errore}, conn=conn,
                )
                esiti["soppresse"] += 1
                esiti["fallite"] += 1
            else:
                # Errore temporaneo (rete, quota, 5xx). NON resta 'in_coda':
                # lo scaglione successivo la ripescherebbe all'infinito.
                # Si marca 'fallita' e la si rimette in coda a mano, se serve.
                cur.execute(
                    """UPDATE comm_invii
                       SET stato = 'fallita', tipo_rimbalzo = 'soft', errore = ?
                       WHERE id = ?""",
                    (esito.errore, r["id"]),
                )
                esiti["fallite"] += 1

            if pausa_fra_invii:
                time.sleep(pausa_fra_invii)

        conn.commit()
    finally:
        conn.close()

    salute_dopo = salute_campagna(campagna_id)
    if salute_dopo["deve_fermarsi"] and not dry_run:
        ferma_campagna(campagna_id, "; ".join(salute_dopo["motivi"]))

    return {
        "ok": True,
        "scaglione": scaglione,
        "esiti": esiti,
        "salute": salute_dopo,
        "fermata": salute_dopo["deve_fermarsi"],
        "residue": salute_dopo["residue"],
    }


def invia_campagna(campagna_id: int, max_scaglioni: Optional[int] = None,
                   dry_run: bool = False) -> Dict[str, Any]:
    """
    Manda tutti gli scaglioni, con la pausa configurata in mezzo.

    Si interrompe da sola se il kill switch scatta. `max_scaglioni` serve per
    partire piano sul dominio nuovo: si mandano 2 blocchi, si guarda come va,
    si riprende.
    """
    pausa = _imposta_int("scaglione_pausa_minuti", 15) * 60
    fatti: List[Dict[str, Any]] = []

    while True:
        esito = invia_scaglione(campagna_id, dry_run=dry_run)
        fatti.append(esito)

        if not esito.get("ok") or esito.get("concluso") or esito.get("fermata"):
            break
        if max_scaglioni and len(fatti) >= max_scaglioni:
            break
        if esito.get("residue", 0) <= 0:
            break
        if pausa and not dry_run:
            logger.info("comunicazioni: pausa di %s minuti prima del prossimo scaglione",
                        pausa // 60)
            time.sleep(pausa)

    return {
        "scaglioni_eseguiti": len(fatti),
        "ultimo": fatti[-1] if fatti else None,
        "salute": salute_campagna(campagna_id),
    }
