# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 215 — Prolunghe nelle combinazioni di tavoli (2026-10-28)

Oltre a unire tavoli, Marco allunga i tavoli con le prolunghe (anche un tavolo
solo: «4 + prolunga» = 6). Una combinazione può quindi avere un solo tavolo se
usa almeno una prolunga, e dice quante ne usa: le prolunghe sono poche e il
motore per tavoli non deve usarne più di quante ce ne sono nello stesso momento.

tavoli_combinazioni.prolunghe   INTEGER (0 = nessuna)
prenotazioni_config.prolunghe_disponibili  quante prolunghe ha il locale ('' = non contare)

Solo ADD COLUMN se manca / INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    if not CLIENTI_DB.exists():
        return
    c = sqlite3.connect(str(CLIENTI_DB))
    try:
        try:
            colonne = {r[1] for r in c.execute("PRAGMA table_info(tavoli_combinazioni)")}
            if colonne and "prolunghe" not in colonne:
                c.execute("ALTER TABLE tavoli_combinazioni ADD COLUMN prolunghe INTEGER DEFAULT 0")
                c.execute("UPDATE tavoli_combinazioni SET prolunghe = 0 WHERE prolunghe IS NULL")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("""
                INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
                ('prolunghe_disponibili', '', 'Prolunghe che ha il locale (vuoto = non contarle)')
            """)
        except sqlite3.OperationalError:
            pass
        c.commit()
        print("  + [215] tavoli_combinazioni.prolunghe, prolunghe_disponibili")
    finally:
        c.close()
