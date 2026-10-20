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
RUOLI_AVVISO = ("sala", "sommelier", "chef", "sous_chef", "commis")


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
            r = conn.execute(
                f"""SELECT id FROM clienti_prenotazioni
                    WHERE cliente_id = ? AND data_pasto = ?
                      AND stato NOT IN ({",".join("?" * len(STATI_SPENTI))})
                    ORDER BY ABS(strftime('%s', '2000-01-01 ' || COALESCE(ora_pasto, '20:00'))
                                 - strftime('%s', '2000-01-01 ' || COALESCE(?, '20:00'))), id
                    LIMIT 1""",
                (prev["cliente_id"], data, *STATI_SPENTI, prev.get("ora_evento")),
            ).fetchone()
            if r:
                pid = r["id"]

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
