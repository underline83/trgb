# @version: v1.0 (2026-10-08) — nascita del connettore MCP (mattone M.K)
# -*- coding: utf-8 -*-
"""
Database del connettore MCP — TRGB Gestionale. Modulo: platform (M.K).

Le autorizzazioni OAuth con cui claude.ai entra in /mcp. Doc: docs/connettore_mcp.md.

- connettore_oauth_clienti — i client registrati da soli (Dynamic Client Registration)
- connettore_oauth_codici  — i codici dopo utente+PIN: 5 minuti, una volta sola
- connettore_oauth_token   — accesso (1 ora) e rinnovo (30 giorni, ruota a ogni uso)

Codici e token si salvano come sha256, mai in chiaro. Ogni codice e token porta
lo username di chi ha autorizzato: gli strumenti rileggono il suo ruolo a ogni chiamata.

DB separato `connettore.sqlite3` nella cartella dati del locale, schema creato al
boot (CREATE TABLE IF NOT EXISTS), niente migrazioni numerate.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("connettore.sqlite3")


def get_connettore_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_connettore_db() -> None:
    conn = get_connettore_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS connettore_oauth_clienti (
            client_id   TEXT PRIMARY KEY,
            nome        TEXT,
            dati        TEXT NOT NULL,
            creato_il   TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS connettore_oauth_codici (
            hash        TEXT PRIMARY KEY,
            client_id   TEXT NOT NULL,
            username    TEXT NOT NULL,
            dati        TEXT NOT NULL,
            scade       REAL NOT NULL,
            creato_il   TEXT NOT NULL,
            usato_il    TEXT,
            famiglia    TEXT
        );
        CREATE TABLE IF NOT EXISTS connettore_oauth_token (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            hash        TEXT NOT NULL UNIQUE,
            tipo        TEXT NOT NULL CHECK (tipo IN ('accesso','rinnovo')),
            client_id   TEXT NOT NULL,
            username    TEXT NOT NULL,
            famiglia    TEXT NOT NULL,
            scade       INTEGER NOT NULL,
            creato_il   TEXT NOT NULL,
            usato_il    TEXT,
            revocato_il TEXT,
            motivo      TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_conn_token_famiglia ON connettore_oauth_token(famiglia);
    """)
    conn.commit()
    conn.close()
