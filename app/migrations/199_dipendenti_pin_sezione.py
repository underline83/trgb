# Modulo: dipendenti — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 199 — Dipendenti: blocco PIN della sezione (2026-10-18)

Contesto (Marco): l'iPad del ristorante resta loggato; chi entra in Dipendenti
(o in «Le mie buste paga») deve ridigitare il PIN dell'utente loggato.
Il blocco torna quando si esce dalla sezione o dopo N minuti senza toccare
lo schermo dentro la sezione.

dipendenti_settings
  pin_sezione_minuti   minuti di inattività prima che la sezione si richiuda
                       (default 5; 0 = si richiude solo uscendo dalla sezione)

Solo CREATE IF NOT EXISTS + INSERT OR IGNORE: idempotente, non tocca un valore
già impostato. DB toccato: dipendenti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    dip_path = locale_data_path("dipendenti.sqlite3")
    dconn = sqlite3.connect(dip_path)
    try:
        dconn.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        dconn.execute(
            "INSERT OR IGNORE INTO dipendenti_settings (key, value) VALUES ('pin_sezione_minuti', '5')"
        )
        dconn.commit()
        print("  [199] dipendenti_settings.pin_sezione_minuti pronto")
    finally:
        dconn.close()
