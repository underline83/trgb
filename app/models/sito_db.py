# @version: v1.0 (2026-10-23) — nascita del modulo Sito (visite del sito, mig 210)
# -*- coding: utf-8 -*-
"""
Database Visite del sito — TRGB Gestionale. Modulo: sito — [core].

DB separato `sito.sqlite3` nella cartella dati del locale. Doc: docs/modulo_sito.md.

  sito_eventi         una riga per evento («vista» o «clic») arrivato dal sito.
                      Niente IP, niente User-Agent. `visitatore` è un hash valido un
                      giorno solo (sale in memoria, mai salvato) e si azzera quando
                      il giorno si chiude. Righe più vecchie di 13 mesi: cancellate.
  sito_giorni         totali per giorno × dimensione × valore (restano per sempre).
  sito_giorni_chiusi  giorni già riassunti in sito_giorni.
  sito_stato          chiave/valore di servizio (ultima pulizia).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("sito.sqlite3")


def get_sito_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_sito_db() -> None:
    """Crea lo schema se manca. Idempotente (lo chiama la migrazione 210 e il router al boot)."""
    conn = get_sito_conn()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sito_eventi (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                giorno        TEXT NOT NULL,              -- AAAA-MM-GG, ora del locale
                ora           INTEGER NOT NULL,           -- 0..23
                tipo          TEXT NOT NULL CHECK (tipo IN ('vista','clic')),
                pagina        TEXT NOT NULL,
                lingua        TEXT,
                provenienza   TEXT,                       -- dominio, 'diretto' o 'interno'
                utm_source    TEXT,
                utm_medium    TEXT,
                utm_campaign  TEXT,
                dispositivo   TEXT,                       -- 'mobile' | 'desktop'
                obiettivo     TEXT,                       -- solo per i clic
                visitatore    TEXT                        -- hash del giorno, NULL a giorno chiuso
            );
            CREATE INDEX IF NOT EXISTS idx_sito_eventi_giorno ON sito_eventi(giorno, tipo);

            CREATE TABLE IF NOT EXISTS sito_giorni (
                giorno      TEXT NOT NULL,
                dimensione  TEXT NOT NULL,   -- viste, unici, pagina, lingua, provenienza, dispositivo, utm, ora, clic
                valore      TEXT NOT NULL DEFAULT '',
                n           INTEGER NOT NULL,
                PRIMARY KEY (giorno, dimensione, valore)
            );
            CREATE TABLE IF NOT EXISTS sito_giorni_chiusi (
                giorno     TEXT PRIMARY KEY,
                chiuso_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS sito_stato (
                chiave  TEXT PRIMARY KEY,
                valore  TEXT
            );
        """)
        conn.commit()
    finally:
        conn.close()
