# @version: v1.0 (2026-10-08) — nascita del modulo Pratiche
# -*- coding: utf-8 -*-
"""
Database Pratiche — TRGB Gestionale. Modulo: pratiche.

Una pratica è uno scambio formale con qualcuno di esterno (ente, fornitore,
studio, creditore) che aspetta un esito. Doc: docs/modulo_pratiche.md.

Contiene:
- pratiche               — testata: titolo, controparte, stato, termine, esito
- pratiche_passi         — storia della pratica, SOLO aggiunte (nessun UPDATE/DELETE)
- pratiche_collegamenti  — rimandi ad altri moduli (modulo, tipo, id, etichetta)

DB separato `pratiche.sqlite3` nella cartella dati del locale. Niente
migrazioni numerate: lo schema nasce al boot (CREATE TABLE IF NOT EXISTS),
come tasks_db.py.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("pratiche.sqlite3")

STATI = ("tocca_a_me", "tocca_a_loro", "chiusa")


def get_pratiche_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_pratiche_db() -> None:
    """Crea lo schema se manca. Idempotente."""
    conn = get_pratiche_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            titolo                TEXT NOT NULL,
            controparte           TEXT NOT NULL,
            controparte_contatto  TEXT,
            stato                 TEXT NOT NULL
                                  CHECK (stato IN ('tocca_a_me','tocca_a_loro','chiusa')),
            termine               TEXT,
            esito                 TEXT,
            aperta_il             TEXT NOT NULL,
            chiusa_il             TEXT,
            ultimo_passo_il       TEXT NOT NULL,
            creata_da             TEXT,
            creata_at             TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            aggiornata_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_passi (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pratica_id      INTEGER NOT NULL REFERENCES pratiche(id),
            data            TEXT NOT NULL,
            testo           TEXT NOT NULL,
            stato_da        TEXT,
            stato_a         TEXT,
            termine_da      TEXT,
            termine_a       TEXT,
            automatico      INTEGER NOT NULL DEFAULT 0,
            allegato_path   TEXT,
            allegato_nome   TEXT,
            autore          TEXT,
            creato_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_collegamenti (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            pratica_id  INTEGER NOT NULL REFERENCES pratiche(id),
            modulo      TEXT NOT NULL,
            tipo        TEXT NOT NULL,
            ref_id      TEXT NOT NULL,
            etichetta   TEXT NOT NULL,
            link        TEXT,
            creato_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_pratiche_stato ON pratiche(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pratiche_passi_pratica ON pratiche_passi(pratica_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pratiche_coll_pratica ON pratiche_collegamenti(pratica_id)")

    conn.commit()
    conn.close()
