# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 204 — Prenotazioni: menù dell'evento confermato (2026-10-20)

Contesto (Marco): quando un preventivo è confermato, la sua prenotazione deve
riportare il menù scelto, così la sala lo vede nel Planning. Non si usa
`menu_preset` né `nota_ristorante`: per le prenotazioni TheFork la
sincronizzazione li riscrive a ogni aggiornamento e il menù sparirebbe.

clienti_prenotazioni:
  menu_evento    TEXT     menù scelto nel preventivo (nome, prezzo, portate)
  preventivo_id  INTEGER  preventivo da cui arriva (clienti_preventivi.id)

Solo ADD COLUMN senza NOT NULL, idempotente. DB toccato: clienti.sqlite3.
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
        if not cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_prenotazioni'"
        ).fetchone():
            print("  · [204] clienti_prenotazioni non esiste, skip")
            return
        esistenti = {r[1] for r in cconn.execute("PRAGMA table_info(clienti_prenotazioni)")}
        for nome, tipo in (("menu_evento", "TEXT"), ("preventivo_id", "INTEGER")):
            if nome not in esistenti:
                cconn.execute(f"ALTER TABLE clienti_prenotazioni ADD COLUMN {nome} {tipo}")
                print(f"  + [204] clienti_prenotazioni.{nome}")
        cconn.commit()
    finally:
        cconn.close()
