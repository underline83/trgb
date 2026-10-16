# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 194 — Tavoli bloccati per turno (2026-10-16)

Come «Blocca questo tavolo» di TheFork Manager: dalla mappa serale un tavolo si
rende non disponibile per un giorno e un turno (rotto, tenuto per un ospite,
riservato allo staff). Vale solo in TRGB: l'API TheFork non blocca i tavoli.

tavoli_blocchi:
  data_pasto  TEXT     YYYY-MM-DD
  turno       TEXT     pranzo | cena
  tavolo_id   INTEGER  tavoli.id
  motivo      TEXT     facoltativo
  creato_da   TEXT     username
  created_at  TEXT
  UNIQUE(data_pasto, turno, tavolo_id)

Solo CREATE TABLE IF NOT EXISTS. DB: clienti.sqlite3.
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
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS tavoli_blocchi (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pasto  TEXT NOT NULL,
                turno       TEXT NOT NULL,
                tavolo_id   INTEGER NOT NULL,
                motivo      TEXT,
                creato_da   TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(data_pasto, turno, tavolo_id)
            )
        """)
        cconn.commit()
        print("  + [194] tavoli_blocchi")
    finally:
        cconn.close()
