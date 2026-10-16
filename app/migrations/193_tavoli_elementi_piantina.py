# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 193 — Piantina sale: elementi non prenotabili (2026-10-16)

Per copiare la piantina di TheFork Manager servono, oltre ai tavoli, gli
elementi che non si prenotano: bancone, colonne, scale, fioriere. Stanno in una
tabella a parte così non finiscono mai nei menu di assegnazione tavolo.

tavoli_elementi:
  zona        TEXT  sala in cui sta (stesso valore di tavoli.zona: Osteria, Dehor…)
  forma       TEXT  rect | circle
  posizione_x, posizione_y, larghezza, altezza  REAL (coordinate della piantina)
  colore      TEXT  colore di riempimento (default grigio)
  etichetta   TEXT  facoltativa (es. «Bancone»)
  ordine      INTEGER

I tavoli usano già tavoli.zona come sala; da oggi tavoli.forma accetta anche
«diamond» (rombo). Solo CREATE TABLE IF NOT EXISTS. DB: clienti.sqlite3.
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
            CREATE TABLE IF NOT EXISTS tavoli_elementi (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                zona        TEXT NOT NULL DEFAULT 'sala',
                forma       TEXT NOT NULL DEFAULT 'rect',
                posizione_x REAL NOT NULL DEFAULT 0,
                posizione_y REAL NOT NULL DEFAULT 0,
                larghezza   REAL NOT NULL DEFAULT 60,
                altezza     REAL NOT NULL DEFAULT 60,
                colore      TEXT,
                etichetta   TEXT,
                ordine      INTEGER NOT NULL DEFAULT 0
            )
        """)
        cconn.commit()
        print("  + [193] tavoli_elementi")
    finally:
        cconn.close()
