# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 192 — Bollino cliente sulle prenotazioni (2026-10-16)

Come TheFork Manager, il Planning mostra accanto al nome «Prima visita»,
«Occasionale» o «Frequente», contando le visite fatte PRIMA di quel giorno
(stati SEATED/LEFT/ARRIVED/BILL). La soglia sta in config, non nel codice:

  cliente_frequente_visite = 5   da 5 visite precedenti in su → «Frequente»
                                 1..4 → «Occasionale», 0 → «Prima visita»

Solo INSERT OR IGNORE in prenotazioni_config (clienti.sqlite3).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        if not cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='prenotazioni_config'"
        ).fetchone():
            return
        cconn.execute(
            "INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES (?, ?, ?)",
            ("cliente_frequente_visite", "5", "Visite precedenti da cui un cliente è «Frequente» (sotto: Occasionale; 0: Prima visita)"),
        )
        cconn.commit()
        print("  + [192] prenotazioni_config.cliente_frequente_visite")
    finally:
        cconn.close()
