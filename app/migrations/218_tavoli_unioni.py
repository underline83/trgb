# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 218 — Unioni di tavoli per giorno e turno (2026-10-29)

La sala cambia mentre si lavora: dalla mappa «🔗 Unisci» e si toccano i tavoli
(anche mentre si assegna una prenotazione) → per quel turno diventano un tavolo
solo, disegnato come un rettangolo unico. Il motore per tavoli lo usa intero (si
può allungare con altri tavoli, non usarne un pezzo da solo). «Stacca» lo toglie.

tavoli_unioni  id, data_pasto, turno, tavoli_ids (JSON: id o metà «11A»), nome,
               posti_min, posti_max, prolunghe, combinazione_id (se è una salvata),
               creato_da, created_at

Solo CREATE IF NOT EXISTS. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    if not CLIENTI_DB.exists():
        return
    c = sqlite3.connect(str(CLIENTI_DB))
    try:
        c.execute("""
            CREATE TABLE IF NOT EXISTS tavoli_unioni (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pasto     TEXT NOT NULL,
                turno          TEXT NOT NULL,
                tavoli_ids     TEXT NOT NULL,
                nome           TEXT NOT NULL,
                posti_min      INTEGER,
                posti_max      INTEGER,
                prolunghe      INTEGER NOT NULL DEFAULT 0,
                combinazione_id INTEGER,
                creato_da      TEXT,
                created_at     TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_tavoli_unioni_turno ON tavoli_unioni (data_pasto, turno)")
        c.commit()
        print("  + [218] tavoli_unioni")
    finally:
        c.close()
