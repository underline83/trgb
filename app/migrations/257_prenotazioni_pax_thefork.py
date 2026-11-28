# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
257 — Le persone dette da TheFork (Marco 2026-11-28).

Levati, nata su TheFork Manager da 6, in TRGB era stata portata a 4: ogni quarto d'ora la
sincronizzazione rimetteva 6. Ora la modifica di persone, giorno e ora fatta in TRGB parte anche per
TheFork; clienti_prenotazioni.pax_thefork (INTEGER) tiene l'ultimo numero detto da TheFork: se lo
ripete non è una notizia e resta quello di TRGB (serve quando TheFork rifiuta la modifica o non
risponde), se ne dice uno nuovo passa. Stessa regola di tavolo_thefork, stato_thefork e ora_thefork.

Solo ADD COLUMN senza NOT NULL: idempotente. Le righe già presenti si riempiono alla prima sincronizzazione.
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
            if "pax_thefork" not in colonne:
                c.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN pax_thefork INTEGER")
                c.commit()
                print("  + [257] clienti_prenotazioni.pax_thefork")
    finally:
        c.close()
