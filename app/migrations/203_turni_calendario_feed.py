# Modulo: dipendenti (sotto-modulo turni) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 203 — Turni: calendario personale per iPhone/Android (2026-10-20)

Contesto (Marco): in «I miei turni» il dipendente aggiunge i propri turni al
calendario del telefono, in due modi: abbonamento (il telefono si aggiorna da
solo) oppure file .ics da scaricare.

Il calendario del telefono non sa mandare il login JWT: l'abbonamento passa da
un link personale con un codice segreto, uno per dipendente, rigenerabile
(il vecchio smette di funzionare).

dipendenti_calendario_feed
  dipendente_id    PK — un link per dipendente
  token            codice segreto nell'URL (UNIQUE)
  creato_il        quando è stato generato
  creato_da        username che l'ha generato
  ultimo_accesso   ultima lettura del telefono (per sapere se è in uso)

dipendenti_settings
  calendario_giorni_indietro   giorni passati inclusi nel calendario (30)
  calendario_giorni_avanti     giorni futuri inclusi nel calendario (90)

Solo CREATE IF NOT EXISTS + INSERT OR IGNORE: idempotente.
DB toccato: dipendenti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    dip_path = locale_data_path("dipendenti.sqlite3")
    dconn = sqlite3.connect(dip_path)
    try:
        dconn.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_calendario_feed (
                dipendente_id  INTEGER PRIMARY KEY,
                token          TEXT NOT NULL UNIQUE,
                creato_il      TEXT NOT NULL DEFAULT (datetime('now')),
                creato_da      TEXT,
                ultimo_accesso TEXT
            )
        """)
        dconn.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        for k, v in (("calendario_giorni_indietro", "30"), ("calendario_giorni_avanti", "90")):
            dconn.execute(
                "INSERT OR IGNORE INTO dipendenti_settings (key, value) VALUES (?, ?)", (k, v)
            )
        dconn.commit()
        print("  [203] dipendenti_calendario_feed + settings calendario pronti")
    finally:
        dconn.close()
