# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 237 — Stella oro automatica per i VIP di TheFork (2026-11-16)

Marco (16/11/2026): «i VIP di TheFork hanno la stella oro in automatico».
Stella oro effettiva = messa a mano (clienti.stella_oro = 1) OPPURE VIP su
TheFork (clienti.vip = 1), a meno che Marco non l'abbia tolta a mano a quel VIP:

clienti:
  stella_oro_tolta  INTEGER 0/1 — 1 = Marco ha tolto la stella oro a un VIP
                    di TheFork (resta tolta anche se TheFork lo tiene VIP)

Solo ADD COLUMN, idempotente. DB toccato: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cols = {r[1] for r in cconn.execute("PRAGMA table_info(clienti)").fetchall()}
        if "stella_oro_tolta" not in cols:
            cconn.execute("ALTER TABLE clienti ADD COLUMN stella_oro_tolta INTEGER NOT NULL DEFAULT 0")
            cconn.execute("UPDATE clienti SET stella_oro_tolta = 0 WHERE stella_oro_tolta IS NULL")
            print("  + [237] clienti.stella_oro_tolta")
        cconn.commit()
    finally:
        cconn.close()
