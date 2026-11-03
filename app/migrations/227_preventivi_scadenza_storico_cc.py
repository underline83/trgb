# Modulo: clienti (sub-modulo preventivi) + prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 227 — Preventivi: storico, scadenza conferma col tavolo, CC nelle email (2026-11-03)

Contesto (Marco):
  - la scadenza di conferma del preventivo tiene il tavolo: avvisi prima e il
    giorno della scadenza, proroga, «Libera tavolo» che cancella la prenotazione
    col motivo «preventivo scaduto». Tutto scritto nello storico del preventivo;
  - le email al cliente partono con lo staff in CC visibile e un Reply-To: il
    registro invii li salva.

clienti_preventivi_storico (nuova):
  preventivo_id, tipo (proroga | scadenza_modificata | avviso_anticipo |
  avviso_scadenza | tavolo_liberato | stato), testo, utente, created_at
clienti_preventivi_invii:  + cc TEXT, + reply_to TEXT
clienti_prenotazioni:      + motivo_cancellazione TEXT

CREATE TABLE IF NOT EXISTS + ADD COLUMN senza NOT NULL: idempotente.
DB toccato: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def _add(cconn, tabella, colonne):
    if not cconn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tabella,)
    ).fetchone():
        print(f"  · [227] {tabella} non esiste, skip")
        return
    esistenti = {r[1] for r in cconn.execute(f"PRAGMA table_info({tabella})")}
    for nome, tipo in colonne:
        if nome not in esistenti:
            cconn.execute(f"ALTER TABLE {tabella} ADD COLUMN {nome} {tipo}")
            print(f"  + [227] {tabella}.{nome}")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_preventivi_storico (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id  INTEGER NOT NULL
                               REFERENCES clienti_preventivi(id) ON DELETE CASCADE,
                tipo           TEXT NOT NULL,
                testo          TEXT,
                utente         TEXT,
                created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cps_preventivo ON clienti_preventivi_storico(preventivo_id)"
        )
        _add(cconn, "clienti_preventivi_invii", [("cc", "TEXT"), ("reply_to", "TEXT")])
        _add(cconn, "clienti_prenotazioni", [("motivo_cancellazione", "TEXT")])
        cconn.commit()
        print("  + [227] clienti_preventivi_storico")
    finally:
        cconn.close()
