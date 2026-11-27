# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
254 — Lo stato cambiato in sala non viene rimesso da TheFork (Marco 2026-11-27).

Marco liberava i tavoli in TRGB («Libero») e dopo poco «sono ricomparsi»: su TheFork Manager quei
clienti risultavano ancora seduti e alla sincronizzazione successiva TRGB tornava a «Seduto».
clienti_prenotazioni.stato_thefork (TEXT) tiene l'ultimo stato detto da TheFork: se TheFork ripete
quello, non è una notizia e resta lo stato di TRGB; se ne dice uno nuovo (cancellata, no-show,
andato via…) passa. È la stessa regola di tavolo_thefork.

Solo ADD COLUMN senza NOT NULL: idempotente. Le righe già presenti restano col campo vuoto e si
riempiono alla prima sincronizzazione.
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
            if "stato_thefork" not in colonne:
                c.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN stato_thefork TEXT")
                c.commit()
                print("  + [254] clienti_prenotazioni.stato_thefork")
    finally:
        c.close()
