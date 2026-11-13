# Modulo: platform (ponte preventivi → prenotazioni + avvisi staff) — [core]
# -*- coding: utf-8 -*-
"""
Evento confermato — cosa succede quando un preventivo è confermato (2026-10-20).

Decisione di Marco: alla conferma
  1. la prenotazione si aggiorna: quella da cui è nato il preventivo, o quella
     del cliente in quel giorno; se non c'è si crea. Ci si scrive il menù scelto
     (`menu_evento`, mig 204) e il collegamento (`preventivo_id`);
  2. sala e cucina ricevono l'avviso nel campanello (M.A notifiche);
  3. si prepara il messaggio per i gruppi WhatsApp di sala e cucina (lo manda
     Marco dal pannello: WhatsApp non lascia scrivere nei gruppi da fuori).

Perché un servizio platform: il preventivo è del modulo clienti, la prenotazione
del modulo prenotazioni; regola 4, niente import tra router.
`menu_evento` e non `menu_preset`/`nota_ristorante`: sulle prenotazioni TheFork
quei campi li riscrive la sincronizzazione.
"""

from __future__ import annotations

import logging
import secrets

from app.models.clienti_db import get_clienti_conn

logger = logging.getLogger("trgb.evento_confermato")

STATI_SPENTI = ("CANCELED", "NO_SHOW", "REFUSED")
# Chi riceve l'avviso nel campanello (ruoli di sala e di cucina)
RUOLI_AVVISO = ("sala", "sommelier", "capo_sala", "chef", "sous_chef", "commis")


def _turno(conn, ora: str | None) -> str:
    """Pranzo/cena con la soglia delle impostazioni prenotazioni (come il Planning)."""
    try:
        r = conn.execute(
            "SELECT valore FROM prenotazioni_config WHERE chiave = 'soglia_pranzo_cena'"
        ).fetchone()
        soglia = (r[0] if r else None) or "15:00"
    except Exception:                                   # noqa: BLE001
        soglia = "15:00"
    return "pranzo" if ora and ora[:5] < soglia else "cena"


# Stati del preventivo che non tengono più una prenotazione (per l'aggancio automatico)
STATI_PREVENTIVO_MORTI = ("rifiutato", "scaduto")
# Stati della prenotazione «prima della conferma» (2026-11-13): richiesta, opzione, lista d'attesa
PRE_PRENOTAZIONE = ("REQUESTED", "OPTION", "WAITLIST")


def _etichetta(stato: str) -> str:
    try:
        from app.services.prenotazioni_stati import etichetta
        return etichetta(stato)
    except Exception:                                   # noqa: BLE001
        return stato


def cerca_prenotazione(conn, cliente_id: int, data: str, ora: str | None = None,
                       escludi_preventivo_id: int | None = None) -> int | None:
    """La prenotazione attiva del cliente in quel giorno, la più vicina all'ora.
    Con escludi_preventivo_id (aggancio automatico, 2026-11-08) salta quelle già
    tenute da un ALTRO preventivo vivo, così due preventivi non si contendono un tavolo."""
    altri = ""
    params: list = [cliente_id, data, *STATI_SPENTI]
    if escludi_preventivo_id is not None:
        altri = f"""AND NOT EXISTS (
                        SELECT 1 FROM clienti_preventivi q
                        WHERE q.prenotazione_id = p.id AND q.id != ?
                          AND COALESCE(q.is_bozza_auto, 0) = 0
                          AND q.stato NOT IN ({",".join("?" * len(STATI_PREVENTIVO_MORTI))}))"""
        params += [escludi_preventivo_id, *STATI_PREVENTIVO_MORTI]
    params.append(ora)
    r = conn.execute(
        f"""SELECT p.id FROM clienti_prenotazioni p
            WHERE p.cliente_id = ? AND p.data_pasto = ?
              AND p.stato NOT IN ({",".join("?" * len(STATI_SPENTI))})
              {altri}
            ORDER BY ABS(strftime('%s', '2000-01-01 ' || COALESCE(p.ora_pasto, '20:00'))
                         - strftime('%s', '2000-01-01 ' || COALESCE(?, '20:00'))), p.id
            LIMIT 1""",
        params,
    ).fetchone()
    return r["id"] if r else None


def prenotazioni_del_giorno(data: str, cliente_id: int | None, preventivo_id: int) -> list[dict]:
    """Le prenotazioni attive di un giorno, per scegliere a mano quella del preventivo
    (tasto «Collega prenotazione», 2026-11-08). Quelle del cliente del preventivo per prime;
    per ognuna l'eventuale altro preventivo vivo che la tiene già."""
    conn = get_clienti_conn()
    try:
        righe = conn.execute(
            f"""SELECT p.id, p.data_pasto, p.ora_pasto, p.pax, p.stato, p.tavolo, p.fonte, p.canale,
                       p.cliente_id,
                       COALESCE(NULLIF(c.cognome, ''), p.cognome_ospite) AS cognome,
                       COALESCE(NULLIF(c.nome, ''), p.nome_ospite) AS nome,
                       (SELECT q.numero FROM clienti_preventivi q
                         WHERE q.prenotazione_id = p.id AND q.id != ?
                           AND COALESCE(q.is_bozza_auto, 0) = 0
                           AND q.stato NOT IN ({",".join("?" * len(STATI_PREVENTIVO_MORTI))})
                         ORDER BY q.id DESC LIMIT 1) AS altro_preventivo
                FROM clienti_prenotazioni p
                LEFT JOIN clienti c ON c.id = p.cliente_id
                WHERE p.data_pasto = ?
                  AND p.stato NOT IN ({",".join("?" * len(STATI_SPENTI))})
                ORDER BY CASE WHEN p.cliente_id = ? THEN 0 ELSE 1 END, p.ora_pasto, p.id""",
            (preventivo_id, *STATI_PREVENTIVO_MORTI, data, *STATI_SPENTI, cliente_id or -1),
        ).fetchall()
        out = []
        for r in righe:
            d = dict(r)
            d["stesso_cliente"] = bool(cliente_id and d["cliente_id"] == cliente_id)
            out.append(d)
        return out
    finally:
        conn.close()


def collega_prenotazione(prev: dict, menu_evento: str, username: str) -> dict:
    """Trova (o crea) la prenotazione dell'evento e ci scrive il menù.
    Ritorna {prenotazione_id, azione, avvisi}: azione = aggiornata | creata | nessuna."""
    avvisi: list[str] = []
    data = prev.get("data_evento")
    conn = get_clienti_conn()
    try:
        pid = None
        if prev.get("prenotazione_id"):
            r = conn.execute(
                "SELECT id, stato FROM clienti_prenotazioni WHERE id = ?", (prev["prenotazione_id"],)
            ).fetchone()
            if r and r["stato"] not in STATI_SPENTI:
                pid = r["id"]
            elif r:
                avvisi.append(f"La prenotazione collegata è «{r['stato']}»: ne cerco un'altra.")
        if not pid and prev.get("cliente_id") and data:
            pid = cerca_prenotazione(conn, prev["cliente_id"], data, prev.get("ora_evento"))

        azione = "aggiornata"
        if not pid:
            if not (prev.get("cliente_id") and data):
                avvisi.append("Prenotazione non creata: al preventivo mancano il cliente o la data.")
                return {"prenotazione_id": None, "azione": "nessuna", "avvisi": avvisi}
            ora = (prev.get("ora_evento") or "20:00")[:5]
            cur = conn.execute(
                """INSERT INTO clienti_prenotazioni (
                       cliente_id, data_pasto, ora_pasto, stato, pax, canale, nota_ristorante,
                       data_prenotazione, prenotato_da, turno, fonte, creato_da, token_cancellazione,
                       menu_evento, preventivo_id)
                   VALUES (?, ?, ?, 'RECORDED', ?, 'Preventivo', ?, datetime('now','localtime'),
                           ?, ?, 'manuale', ?, ?, ?, ?)""",
                (prev["cliente_id"], data, ora, prev.get("n_persone") or 2,
                 f"Da preventivo {prev.get('numero') or ''}".strip(),
                 username, _turno(conn, ora), username, secrets.token_urlsafe(16),
                 menu_evento, prev["id"]),
            )
            pid = cur.lastrowid
            azione = "creata"
        else:
            r = conn.execute(
                "SELECT pax, ora_pasto FROM clienti_prenotazioni WHERE id = ?", (pid,)
            ).fetchone()
            conn.execute(
                "UPDATE clienti_prenotazioni SET menu_evento = ?, preventivo_id = ? WHERE id = ?",
                (menu_evento, prev["id"], pid),
            )
            # Pre-prenotazione (in opzione / da confermare / lista d'attesa): col preventivo
            # confermato diventa Confermata (decisione di Marco 2026-11-13)
            st = conn.execute("SELECT stato FROM clienti_prenotazioni WHERE id = ?", (pid,)).fetchone()["stato"]
            if st in PRE_PRENOTAZIONE:
                conn.execute(
                    "UPDATE clienti_prenotazioni SET stato = 'RECORDED', updated_at = datetime('now','localtime') WHERE id = ?",
                    (pid,),
                )
                avvisi.append(f"La prenotazione era «{_etichetta(st)}»: ora è Confermata.")
            if prev.get("n_persone") and r["pax"] and int(r["pax"]) != int(prev["n_persone"]):
                avvisi.append(f"Coperti diversi: prenotazione {r['pax']}, preventivo {prev['n_persone']}.")
            if prev.get("ora_evento") and r["ora_pasto"] and r["ora_pasto"][:5] != prev["ora_evento"][:5]:
                avvisi.append(f"Ora diversa: prenotazione {r['ora_pasto'][:5]}, preventivo {prev['ora_evento'][:5]}.")
        conn.execute(
            "UPDATE clienti_preventivi SET prenotazione_id = ? WHERE id = ?", (pid, prev["id"])
        )
        conn.commit()
        return {"prenotazione_id": pid, "azione": azione, "avvisi": avvisi}
    finally:
        conn.close()


def allergie_prenotazione(prenotazione_id: int | None) -> str:
    if not prenotazione_id:
        return ""
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            """SELECT p.allergie_segnalate, c.allergie FROM clienti_prenotazioni p
               LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = ?""",
            (prenotazione_id,),
        ).fetchone()
        if not r:
            return ""
        return " · ".join(x.strip() for x in (r[0], r[1]) if x and x.strip())
    finally:
        conn.close()


def avvisa_staff(titolo: str, messaggio: str, link: str, entity_id: int) -> int:
    """Campanello (M.A) ai ruoli di sala e cucina. Ritorna quante notifiche."""
    from app.services.notifiche_service import crea_notifica
    n = 0
    for ruolo in RUOLI_AVVISO:
        try:
            crea_notifica(tipo="evento_confermato", titolo=titolo, messaggio=messaggio,
                          link=link, icona="✅", modulo="preventivi", entity_id=entity_id,
                          dest_ruolo=ruolo)
            n += 1
        except Exception:                               # noqa: BLE001 — un avviso non blocca la conferma
            logger.exception("Notifica evento confermato fallita per %s", ruolo)
    return n


# ─────────────────────────────────────────────────────────────────────────
# Scadenza della conferma (2026-11-03): tavolo da liberare e vista nel Planning
# ─────────────────────────────────────────────────────────────────────────

def libera_prenotazione(prenotazione_id: int, motivo: str) -> dict:
    """Cancella la prenotazione (stato CANCELED) col motivo. Non manda niente al
    cliente. Se è di TheFork lo segnala: TRGB non scrive le cancellazioni su
    TheFork, va cancellata anche lì."""
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            "SELECT id, stato, data_pasto, thefork_booking_id FROM clienti_prenotazioni WHERE id = ?",
            (prenotazione_id,),
        ).fetchone()
        if not r:
            return {"cancellata": False, "stato": "non trovata"}
        out = {"id": r["id"], "data": r["data_pasto"], "thefork": bool(r["thefork_booking_id"]),
               "stato": r["stato"], "stato_prima": r["stato"], "cancellata": False}
        if r["stato"] in STATI_SPENTI:
            return out
        colonne = {c[1] for c in conn.execute("PRAGMA table_info(clienti_prenotazioni)")}
        if "motivo_cancellazione" in colonne:
            conn.execute(
                """UPDATE clienti_prenotazioni SET stato = 'CANCELED', motivo_cancellazione = ?,
                   updated_at = datetime('now','localtime') WHERE id = ?""",
                (motivo, prenotazione_id),
            )
        else:
            conn.execute(
                "UPDATE clienti_prenotazioni SET stato = 'CANCELED', updated_at = datetime('now','localtime') WHERE id = ?",
                (prenotazione_id,),
            )
        conn.commit()
        out.update(stato="CANCELED", cancellata=True)
    finally:
        conn.close()
    if out.get("cancellata"):  # posto liberato: avviso a chi è in lista d'attesa (2026-11-13)
        from app.services.prenotazioni_attese_service import avvisa_posto_liberato_sicuro
        avvisa_posto_liberato_sicuro(prenotazione_id, out["stato_prima"], "CANCELED")
    return out


def preventivi_in_attesa(prenotazione_ids: list[int]) -> dict[int, dict]:
    """Per il Planning: {prenotazione_id: {preventivo_id, numero, scadenza, stato}}
    dei preventivi collegati che aspettano ancora la conferma del cliente."""
    ids = [int(i) for i in prenotazione_ids if i]
    if not ids:
        return {}
    conn = get_clienti_conn()
    try:
        rows = conn.execute(
            f"""SELECT id, numero, scadenza_conferma, stato, prenotazione_id
                FROM clienti_preventivi
                WHERE prenotazione_id IN ({','.join('?' * len(ids))})
                  AND stato IN ('bozza', 'inviato', 'in_attesa', 'scaduto')
                  AND COALESCE(is_bozza_auto, 0) = 0
                ORDER BY id DESC""",
            ids,
        ).fetchall()
        out: dict[int, dict] = {}
        for r in rows:
            out.setdefault(r["prenotazione_id"], {
                "preventivo_id": r["id"], "numero": r["numero"],
                "scadenza": r["scadenza_conferma"], "stato": r["stato"],
            })
        return out
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────
# Preventivo → stato della prenotazione (2026-11-13, decisione di Marco)
#   inviato / collegato a un preventivo in attesa  → «In opzione» (tocca al cliente)
#   confermato                                     → «Confermata» (lo fa collega_prenotazione)
#   rifiutato / scaduto                            → «Cancellata» se era in opzione
# Le prenotazioni di TheFork non si toccano (la sincronizzazione riscrive lo stato).
# ─────────────────────────────────────────────────────────────────────────

def allinea_prenotazione(preventivo_id: int, evento: str, username: str | None = None) -> dict | None:
    """Porta la prenotazione collegata nello stato che segue il preventivo.
    evento: inviato | collegato | rifiutato | scaduto. Ritorna {da, a} se ha cambiato."""
    from app.services import prenotazioni_stati as stati_srv
    conn = get_clienti_conn()
    try:
        prev = conn.execute(
            "SELECT id, numero, stato, prenotazione_id, scadenza_conferma FROM clienti_preventivi WHERE id = ?",
            (preventivo_id,),
        ).fetchone()
        if not prev or not prev["prenotazione_id"]:
            return None
        colonne = {c[1] for c in conn.execute("PRAGMA table_info(clienti_prenotazioni)")}
        if "tenuto_fino_al" not in colonne:             # mig 232 non applicata
            return None
        p = conn.execute(
            "SELECT id, stato, thefork_booking_id FROM clienti_prenotazioni WHERE id = ?",
            (prev["prenotazione_id"],),
        ).fetchone()
        if not p or p["thefork_booking_id"]:
            return None
        incerte = stati_srv.gruppo("incerta")
        da, a, motivo = p["stato"], None, None
        if evento in ("inviato", "collegato"):
            if prev["stato"] in ("inviato", "in_attesa") and da in ("RECORDED", "REQUESTED", "WAITLIST"):
                a = "OPTION"
        elif evento in ("rifiutato", "scaduto"):
            if da in incerte:
                a, motivo = "CANCELED", f"preventivo {evento}"
        if not a or a == da:
            return None
        if a == "OPTION":
            conn.execute(
                """UPDATE clienti_prenotazioni SET stato = 'OPTION', tenuto_fino_al = ?, opzione_avvisata = NULL,
                   updated_at = datetime('now','localtime') WHERE id = ?""",
                (prev["scadenza_conferma"] or None, p["id"]),
            )
        else:
            conn.execute(
                """UPDATE clienti_prenotazioni SET stato = ?, motivo_cancellazione = ?,
                   updated_at = datetime('now','localtime') WHERE id = ?""",
                (a, motivo, p["id"]),
            )
        try:
            from app.services.preventivi_scadenze import scrivi_storico
            scrivi_storico(preventivo_id, "stato",
                           f"Prenotazione collegata: {_etichetta(da)} → {_etichetta(a)}", username or "sistema", conn)
        except Exception:                               # noqa: BLE001 — lo storico non blocca
            logger.exception("storico allinea prenotazione")
        conn.commit()
    finally:
        conn.close()
    if a == "CANCELED":
        from app.services.prenotazioni_attese_service import avvisa_posto_liberato_sicuro
        avvisa_posto_liberato_sicuro(p["id"], da, a)
    return {"prenotazione_id": p["id"], "da": da, "a": a}


def allinea_prenotazione_sicuro(preventivo_id: int, evento: str, username: str | None = None) -> None:
    """Non solleva mai: il preventivo non deve rompersi per la prenotazione."""
    try:
        allinea_prenotazione(preventivo_id, evento, username)
    except Exception as e:                              # noqa: BLE001
        logger.warning("allinea prenotazione (preventivo %s, %s): %s", preventivo_id, evento, e)
