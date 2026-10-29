# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 219 — Posizioni dei tavoli per giorno e turno (2026-10-29)

Durante il servizio la sala si sposta: nella mappa, in assegnazione o con «✏️ Sposta»,
i tavoli (e le tavolate unite) si trascinano. La posizione vale solo per quel turno;
la piantina dell'Editor non cambia.

tavoli_posizioni_turno  data_pasto, turno, chiave (id del tavolo, «11A» per una metà,
                        «Lu<id>» per un'unione, «Lp<id>» per i tavoli di una prenotazione),
                        x, y, aggiornato_da, updated_at — PK(data_pasto, turno, chiave)

tavoli_unioni.staccata   1 = unione fatta da TheFork e staccata dalla sala: non si rifà da sola

Solo CREATE IF NOT EXISTS / ADD COLUMN se manca. DB: clienti.sqlite3.
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
            CREATE TABLE IF NOT EXISTS tavoli_posizioni_turno (
                data_pasto    TEXT NOT NULL,
                turno         TEXT NOT NULL,
                chiave        TEXT NOT NULL,
                x             REAL NOT NULL,
                y             REAL NOT NULL,
                aggiornato_da TEXT,
                updated_at    TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (data_pasto, turno, chiave)
            )
        """)
        try:  # unione arrivata da TheFork e staccata dalla sala: resta segnata, così non torna da sola
            colonne = {r[1] for r in c.execute("PRAGMA table_info(tavoli_unioni)")}
            if colonne and "staccata" not in colonne:
                c.execute("ALTER TABLE tavoli_unioni ADD COLUMN staccata INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        c.commit()
        print("  + [219] tavoli_posizioni_turno, tavoli_unioni.staccata")
    finally:
        c.close()
