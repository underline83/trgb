# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
250 — Il giro di una prenotazione in sala: Prenotato → Confermato → Seduto → andato via,
con la possibilità di tornare indietro (Marco 2026-11-26).

- clienti_prenotazioni.riconfermata_at (TEXT): quando il cliente ha confermato che viene.
  NON è uno stato nuovo: la prenotazione resta RECORDED (così sincronizzazione TheFork, invio,
  motore tavoli e statistiche non cambiano); è un segno in più, che si mette e si toglie.
- prenotazioni_stati: l'etichetta di RECORDED passa da «Confermata» a «Prenotato»
  (solo se è ancora quella di prima: una personalizzazione non si tocca).
- prenotazioni_stati_transizioni: i passi all'indietro (Seduto → Prenotato, Completata → Seduto,
  Arrivato → Prenotato, Al conto → Seduto).

Solo ADD COLUMN senza NOT NULL, INSERT OR IGNORE e un UPDATE di etichetta: idempotente.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")

INDIETRO = [("SEATED", "RECORDED"), ("LEFT", "SEATED"), ("ARRIVED", "RECORDED"), ("BILL", "SEATED")]


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
            if "riconfermata_at" not in colonne:
                c.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN riconfermata_at TEXT")
                print("  + [250] clienti_prenotazioni.riconfermata_at")
        if "prenotazioni_stati" in tabelle:
            c.execute("UPDATE prenotazioni_stati SET etichetta = 'Prenotato' WHERE codice = 'RECORDED' AND etichetta = 'Confermata'")
        if "prenotazioni_stati_transizioni" in tabelle:
            c.executemany(
                "INSERT OR IGNORE INTO prenotazioni_stati_transizioni (da, a, ordine) VALUES (?, ?, 90)", INDIETRO)
        c.commit()
        print("  + [250] riconfermata_at, «Prenotato», passi all'indietro degli stati")
    finally:
        c.close()
