# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 196 — Tavoli dividibili (2026-10-16)

Alcuni tavoli (all'osteria il 4 e il 10) si spezzano in due per una sera, così
si mettono due prenotazioni. TheFork Manager non lo fa: è solo di TRGB.

tavoli.dividibile  INTEGER 0/1 — si flagga dall'Editor Tavoli
tavoli_divisioni   un tavolo diviso per giorno e turno: sulla mappa e nei menu
                   diventa «<nome>A» e «<nome>B», metà posti ciascuno.
  data_pasto, turno, tavolo_id, creato_da, created_at
  UNIQUE(data_pasto, turno, tavolo_id)

Solo ADD COLUMN (se manca) e CREATE TABLE IF NOT EXISTS. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        colonne = {r[1] for r in cconn.execute("PRAGMA table_info(tavoli)")}
        if colonne and "dividibile" not in colonne:
            cconn.execute("ALTER TABLE tavoli ADD COLUMN dividibile INTEGER DEFAULT 0")
            cconn.execute("UPDATE tavoli SET dividibile = 0 WHERE dividibile IS NULL")
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS tavoli_divisioni (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pasto  TEXT NOT NULL,
                turno       TEXT NOT NULL,
                tavolo_id   INTEGER NOT NULL,
                creato_da   TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(data_pasto, turno, tavolo_id)
            )
        """)
        cconn.commit()
        print("  + [196] tavoli.dividibile, tavoli_divisioni")
    finally:
        cconn.close()
