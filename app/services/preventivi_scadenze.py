# Modulo: clienti (sub-modulo preventivi) — [core]
# -*- coding: utf-8 -*-
"""
Preventivi — impostazioni, storico, scadenza di conferma e tavolo (2026-11-03).

Decisioni di Marco (2026-11-03):
  - un preventivo nuovo nasce con scadenza di conferma = oggi + N giorni
    (Impostazioni › Preventivi), modificabile a mano;
  - X giorni prima e il giorno della scadenza, se non è confermato, avviso allo
    staff (campanello + email all'indirizzo staff), una volta sola per scadenza;
  - alla scadenza NIENTE di automatico sul tavolo: «Libera tavolo» a mano cancella
    la prenotazione col motivo «preventivo scaduto» e mette il preventivo in
    «scaduto». Al cliente non parte mai niente da qui;
  - confermato / rifiutato / annullato prima: gli avvisi si spengono da soli;
  - «Proroga» sposta la scadenza e lo scrive nello storico.

Valori in `clienti_impostazioni` (nessun numero fisso nel codice: quelli sotto
sono solo il primo valore se la chiave non c'è ancora).
Il controllo gira da solo ogni ora (thread, come le fasce online): non dipende
da qualcuno che apre la Home.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta

from app.models.clienti_db import get_clienti_conn

logger = logging.getLogger("trgb.preventivi.scadenze")

# chiave → (valore iniziale, descrizione per la tabella impostazioni)
CONFIG = {
    "preventivi_email_copia": ("", "Indirizzo staff: in CC nelle email dei preventivi al cliente, copia col PDF dei preventivi mandati su WhatsApp, avvisi di scadenza"),
    "preventivi_reply_to": ("", "Rispondi a: indirizzo a cui vanno le risposte dei clienti ai preventivi (vuoto = la casella che manda)"),
    "preventivi_scadenza_giorni": ("10", "Giorni per confermare: scadenza proposta su un preventivo nuovo (oggi + N)"),
    "preventivi_avviso_giorni": ("2", "Avviso allo staff N giorni prima della scadenza di conferma (0 = solo il giorno stesso)"),
    "preventivi_proroga_giorni": ("5", "Giorni proposti per la proroga della scadenza"),
    "preventivi_avviso_ruoli": ("admin,capo_sala", "Ruoli che ricevono nel campanello gli avvisi di scadenza dei preventivi"),
}
NUMERICI = ("preventivi_scadenza_giorni", "preventivi_avviso_giorni", "preventivi_proroga_giorni")
# Stati in cui il preventivo aspetta ancora la risposta del cliente
STATI_IN_ATTESA = ("bozza", "inviato", "in_attesa")


# ─────────────────────────── impostazioni ───────────────────────────

def get_config() -> dict:
    conn = get_clienti_conn()
    try:
        righe = {r["chiave"]: r["valore"] for r in conn.execute(
            f"SELECT chiave, valore FROM clienti_impostazioni WHERE chiave IN ({','.join('?' * len(CONFIG))})",
            tuple(CONFIG),
        )}
    finally:
        conn.close()
    out = {}
    for k, (default, _) in CONFIG.items():
        v = righe.get(k, default)
        out[k] = int(v) if k in NUMERICI and str(v).strip().lstrip("-").isdigit() else (v or "")
    return out


def _valida_email(valore: str) -> str:
    indirizzi = [x.strip() for x in (valore or "").replace(";", ",").split(",") if x.strip()]
    for x in indirizzi:
        if "@" not in x or "." not in x.split("@")[-1]:
            raise ValueError(f"Indirizzo non valido: {x}")
    return ", ".join(indirizzi)


def set_config(dati: dict) -> dict:
    conn = get_clienti_conn()
    try:
        for k, v in dati.items():
            if k not in CONFIG or v is None:
                continue
            if k in NUMERICI:
                try:
                    v = int(v)
                except (TypeError, ValueError):
                    raise ValueError(f"{k}: serve un numero di giorni")
                if v < 0 or v > 365:
                    raise ValueError(f"{k}: giorni fuori misura ({v})")
                v = str(v)
            elif k in ("preventivi_email_copia", "preventivi_reply_to"):
                v = _valida_email(v)
            else:
                v = ",".join(x.strip() for x in str(v).split(",") if x.strip())
            conn.execute(
                """INSERT INTO clienti_impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)
                   ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore""",
                (k, v, CONFIG[k][1]),
            )
        conn.commit()
    finally:
        conn.close()
    return get_config()


def scadenza_proposta(oggi: date | None = None) -> str:
    giorni = get_config()["preventivi_scadenza_giorni"]
    return ((oggi or date.today()) + timedelta(days=int(giorni))).isoformat()


# ─────────────────────────── storico ───────────────────────────

def _storico_esiste(conn) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_preventivi_storico'"
    ).fetchone())


def scrivi_storico(preventivo_id: int, tipo: str, testo: str, utente: str | None, conn=None) -> None:
    proprio = conn is None
    conn = conn or get_clienti_conn()
    try:
        if not _storico_esiste(conn):
            return
        conn.execute(
            "INSERT INTO clienti_preventivi_storico (preventivo_id, tipo, testo, utente) VALUES (?, ?, ?, ?)",
            (preventivo_id, tipo, testo, utente),
        )
        if proprio:
            conn.commit()
    finally:
        if proprio:
            conn.close()


def lista_storico(preventivo_id: int) -> list:
    conn = get_clienti_conn()
    try:
        if not _storico_esiste(conn):
            return []
        return [dict(r) for r in conn.execute(
            "SELECT * FROM clienti_preventivi_storico WHERE preventivo_id = ? ORDER BY id DESC",
            (preventivo_id,),
        )]
    finally:
        conn.close()


def _gg_mm(iso: str | None) -> str:
    try:
        return datetime.strptime(iso or "", "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return iso or "—"


# ─────────────────────────── proroga e tavolo ───────────────────────────

def proroga(preventivo_id: int, giorni: int | None, utente: str) -> dict | None:
    """Sposta la scadenza di N giorni (dalla scadenza, o da oggi se è già passata)."""
    giorni = int(giorni if giorni is not None else get_config()["preventivi_proroga_giorni"])
    if giorni <= 0 or giorni > 365:
        raise ValueError("Giorni di proroga fuori misura")
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            "SELECT stato, scadenza_conferma FROM clienti_preventivi WHERE id = ?", (preventivo_id,)
        ).fetchone()
        if not r:
            return None
        if r["stato"] not in STATI_IN_ATTESA + ("scaduto",):
            raise ValueError(f"Un preventivo «{r['stato']}» non ha una scadenza da prorogare")
        oggi = date.today()
        try:
            base = max(datetime.strptime(r["scadenza_conferma"], "%Y-%m-%d").date(), oggi)
        except (TypeError, ValueError):
            base = oggi
        nuova = (base + timedelta(days=giorni)).isoformat()
        stato = r["stato"]
        if stato == "scaduto":                     # riapre l'attesa
            stato = "in_attesa"
        conn.execute(
            "UPDATE clienti_preventivi SET scadenza_conferma = ?, stato = ? WHERE id = ?",
            (nuova, stato, preventivo_id),
        )
        scrivi_storico(preventivo_id, "proroga",
                       f"Scadenza prorogata di {giorni} giorni: dal {_gg_mm(r['scadenza_conferma'])} al {_gg_mm(nuova)}",
                       utente, conn)
        conn.commit()
        return {"scadenza_conferma": nuova, "stato": stato}
    finally:
        conn.close()


def libera_tavolo(preventivo_id: int, utente: str) -> dict | None:
    """Cancella la prenotazione collegata (motivo «preventivo scaduto») e mette il
    preventivo in «scaduto». Al cliente non parte niente."""
    from app.services import evento_confermato_service as ev
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            "SELECT stato, prenotazione_id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)
        ).fetchone()
    finally:
        conn.close()
    if not r:
        return None
    if r["stato"] not in STATI_IN_ATTESA + ("scaduto",):
        raise ValueError(f"Un preventivo «{r['stato']}» non libera il tavolo")
    pren = ev.libera_prenotazione(r["prenotazione_id"], "preventivo scaduto") if r["prenotazione_id"] else None
    conn = get_clienti_conn()
    try:
        conn.execute("UPDATE clienti_preventivi SET stato = 'scaduto' WHERE id = ?", (preventivo_id,))
        if pren and pren.get("cancellata"):
            testo = f"Tavolo liberato: prenotazione del {_gg_mm(pren.get('data'))} cancellata (preventivo scaduto)"
            if pren.get("thefork"):
                testo += " — è di TheFork: va cancellata anche in TheFork Manager"
        elif pren:
            testo = f"Prenotazione già «{pren.get('stato')}»: niente da cancellare"
        else:
            testo = "Nessuna prenotazione collegata: preventivo segnato scaduto"
        scrivi_storico(preventivo_id, "tavolo_liberato", testo, utente, conn)
        conn.commit()
    finally:
        conn.close()
    return {"stato": "scaduto", "prenotazione": pren}


# ─────────────────────────── avvisi di scadenza ───────────────────────────

def _avviso_gia_mandato(conn, preventivo_id: int, tipo: str, scadenza: str) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM clienti_preventivi_storico WHERE preventivo_id = ? AND tipo = ? AND testo LIKE ?",
        (preventivo_id, tipo, f"%[{scadenza}]%"),
    ).fetchone())


def _url_app() -> str:
    """Indirizzo del gestionale per i link nelle email: locale.json «dominio_app»."""
    try:
        from app.utils.locale_data import locale_info
        dom = (locale_info().get("dominio_app") or "").strip().rstrip("/")
        return f"https://{dom}" if dom and not dom.startswith("http") else dom
    except Exception:                               # noqa: BLE001
        return ""


def controlla_scadenze(oggi: date | None = None, dry_run: bool = False) -> dict:
    """Manda gli avvisi del giorno: X giorni prima e il giorno della scadenza, per i
    preventivi ancora in attesa. Ogni avviso una volta sola per quella scadenza."""
    from app.services.notifiche_service import crea_notifica
    from app.services import email_service
    oggi = oggi or date.today()
    cfg = get_config()
    anticipo = int(cfg["preventivi_avviso_giorni"])
    ruoli = [x.strip() for x in cfg["preventivi_avviso_ruoli"].split(",") if x.strip()]
    staff = [x.strip() for x in cfg["preventivi_email_copia"].split(",") if x.strip()]
    base = _url_app()

    conn = get_clienti_conn()
    try:
        if not _storico_esiste(conn):
            return {"avvisi": 0, "nota": "migrazione 227 non applicata"}
        righe = conn.execute(
            f"""SELECT p.id, p.numero, p.titolo, p.data_evento, p.ora_evento, p.n_persone,
                       p.scadenza_conferma, p.prenotazione_id,
                       c.nome AS cliente_nome, c.cognome AS cliente_cognome
                FROM clienti_preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id
                WHERE p.stato IN ({','.join('?' * len(STATI_IN_ATTESA))})
                  AND COALESCE(p.is_bozza_auto, 0) = 0
                  AND COALESCE(p.scadenza_conferma, '') != ''""",
            STATI_IN_ATTESA,
        ).fetchall()
        fatti = []
        for p in righe:
            try:
                sc = datetime.strptime(p["scadenza_conferma"], "%Y-%m-%d").date()
            except ValueError:
                continue
            mancano = (sc - oggi).days
            if mancano == 0:
                tipo = "avviso_scadenza"
            elif anticipo > 0 and mancano == anticipo:
                tipo = "avviso_anticipo"
            else:
                continue
            if _avviso_gia_mandato(conn, p["id"], tipo, p["scadenza_conferma"]):
                continue
            cliente = " ".join(x for x in [(p["cliente_cognome"] or "").strip(),
                                            (p["cliente_nome"] or "").strip()] if x) or (p["titolo"] or "")
            quando = "oggi" if mancano == 0 else f"tra {mancano} giorni ({_gg_mm(p['scadenza_conferma'])})"
            titolo = f"⏳ Preventivo {p['numero']} — {cliente}: la conferma scade {quando}"
            link_prev = f"/clienti/preventivi/{p['id']}"
            link_plan = f"/prenotazioni/planning/{p['data_evento']}" if p["data_evento"] else ""
            righe_testo = [
                f"Cliente: {cliente}",
                f"Evento: {_gg_mm(p['data_evento'])}" + (f" ore {p['ora_evento']}" if p["ora_evento"] else ""),
                f"Coperti: {p['n_persone'] or '—'}",
                f"Scadenza conferma: {_gg_mm(p['scadenza_conferma'])}",
                "Se non conferma, il tavolo si libera a mano: «Libera tavolo» nel preventivo o nel Planning.",
                "Al cliente non è partito niente.",
                "",
                f"Preventivo: {base}{link_prev}",
            ]
            if link_plan:
                righe_testo.append(f"Planning: {base}{link_plan}")
            testo = "\n".join(righe_testo)
            if not dry_run:
                for ruolo in ruoli:
                    try:
                        crea_notifica(tipo="preventivo_scadenza", titolo=titolo, messaggio=testo,
                                      link=link_prev, icona="⏳", urgenza="alta" if mancano == 0 else "normale",
                                      modulo="preventivi", entity_id=p["id"], dest_ruolo=ruolo)
                    except Exception:               # noqa: BLE001
                        logger.exception("Campanello scadenza preventivo %s fallito", p["id"])
                esito_mail = None
                if staff:
                    esito = email_service.invia_email(to=staff, subject=titolo.replace("⏳ ", ""), body=testo)
                    esito_mail = "ok" if esito.ok else f"non partita: {esito.errore}"
                scrivi_storico(p["id"], tipo,
                               f"Avviso allo staff: scadenza {quando} [{p['scadenza_conferma']}]"
                               + (f" — email {esito_mail}" if esito_mail else " — senza email (indirizzo staff vuoto)"),
                               "sistema", conn)
                conn.commit()
            fatti.append({"id": p["id"], "numero": p["numero"], "tipo": tipo})
        return {"avvisi": len(fatti), "dettaglio": fatti}
    finally:
        conn.close()


_avviato = {"ok": False}


def avvia_periodico(minuti: int = 60) -> None:
    """Controllo delle scadenze ogni ora, in un thread (parte al boot)."""
    if _avviato["ok"]:
        return
    _avviato["ok"] = True

    def _ciclo():
        time.sleep(180)
        while True:
            try:
                r = controlla_scadenze()
                if r.get("avvisi"):
                    logger.info("Scadenze preventivi: %s avvisi", r["avvisi"])
            except Exception as e:                  # noqa: BLE001
                logger.warning("Scadenze preventivi: %s", e)
            time.sleep(minuti * 60)

    threading.Thread(target=_ciclo, name="preventivi-scadenze", daemon=True).start()
