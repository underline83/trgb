# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
258 — L'ora del secondo turno di cena (Marco 2026-11-28).

Nel form la «Durata» diventa: Nessuna limitazione (vale la durata di regola) · Primo turno, libera
entro le HH:MM · Secondo turno, dalle HH:MM. L'ora sta in prenotazioni_config.secondo_turno_cena
(si cambia in Impostazioni › Turni e chiusura; vuota = niente primo e secondo turno).

Solo INSERT OR IGNORE: idempotente, non tocca un valore già impostato.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn è foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    c = sqlite3.connect(str(CLIENTI_DB))
    try:
        if c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prenotazioni_config'").fetchone():
            c.execute(
                "INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES (?, ?, ?)",
                ("secondo_turno_cena", "21:30",
                 "Cena: ora in cui il primo turno libera il tavolo e comincia il secondo (form, «Durata»). Vuota = non si usa"))
            c.commit()
            print("  + [258] prenotazioni_config.secondo_turno_cena")
    finally:
        c.close()
