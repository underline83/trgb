# Modulo: prenotazioni (durata del tavolo sulla singola prenotazione) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 249 — Durata sulla singola prenotazione (2026-11-26)

Contesto (Marco, 26/11, guardando il form di TheFork Manager: «guarda se c'è qualcosa da
copiare» → «vai con le prime 4»): su TheFork ogni prenotazione ha la sua durata. In TRGB la
durata era solo una regola (pranzo, cena, pranzo lungo, gruppi tutto il turno).

clienti_prenotazioni.durata_min  INTEGER  minuti che il tavolo resta occupato per QUESTA
                                          prenotazione; NULL = vale la regola di sempre.
La usano il motore per tavoli (prenotazioni_tavoli_service._intervallo) e la barra «in sala».

Solo ADD COLUMN. DB: clienti.sqlite3.
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
        presenti = {r[1] for r in cconn.execute("PRAGMA table_info(clienti_prenotazioni)")}
        if presenti and "durata_min" not in presenti:
            cconn.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN durata_min INTEGER")
            cconn.commit()
            print("  + [249] clienti_prenotazioni.durata_min")
    finally:
        cconn.close()
