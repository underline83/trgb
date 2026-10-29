# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 217 — Posti di una prolunga (2026-10-29)

La prolunga è facoltativa: una combinazione salvata con N prolunghe il motore per
tavoli la usa anche con meno prolunghe, togliendo `posti_prolunga` posti per ognuna
(Marco: «se la collego la prolunga aggiunge 2 posti, se non mi serve posso non metterla»).

prenotazioni_config.posti_prolunga  '2'

Solo INSERT OR IGNORE. DB: clienti.sqlite3.
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
            c.execute("""
                INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
                ('posti_prolunga', '2', 'Posti che aggiunge una prolunga (il motore può non metterla e toglierli)')
            """)
        except sqlite3.OperationalError:
            pass
        c.commit()
        print("  + [217] prenotazioni_config.posti_prolunga")
    finally:
        c.close()
