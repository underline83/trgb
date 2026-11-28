# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
256 — L'ora mandata a TheFork, quando non è quella vera (Marco 2026-11-28).

TheFork non accetta via API una prenotazione con l'orario già passato (INVALID_MEALDATE): Zavaglio,
segnato alle 12:20 per le 12:15, è rimasto solo in TRGB. Ora a TheFork parte il primo quarto d'ora
utile e in TRGB resta l'ora vera. clienti_prenotazioni.ora_thefork (TEXT, «HH:MM») tiene l'ora
mandata: se TheFork la ripete alla sincronizzazione non è una notizia e resta l'ora di TRGB; se ne
dice un'altra (cambiata su TheFork Manager) passa. Stessa regola di tavolo_thefork e stato_thefork.

Solo ADD COLUMN senza NOT NULL: idempotente.
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
        tabelle = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "clienti_prenotazioni" in tabelle:
            colonne = {r[1] for r in c.execute("PRAGMA table_info(clienti_prenotazioni)")}
            if "ora_thefork" not in colonne:
                c.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN ora_thefork TEXT")
                c.commit()
                print("  + [256] clienti_prenotazioni.ora_thefork")
    finally:
        c.close()
