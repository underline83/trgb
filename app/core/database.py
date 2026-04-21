# @version: v1.1-wal-protected
# -*- coding: utf-8 -*-
"""
Connessioni SQLite per il gestionale TRGB.

- DB principale: app/data/vini.sqlite3
- DB impostazioni: app/data/vini_settings.sqlite3

Fornisce:
- get_connection()      -> connessione al DB vini.sqlite3
- get_settings_conn()   -> connessione al DB vini_settings.sqlite3
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # app/
DATA_DIR = BASE_DIR / "data"

MAIN_DB_PATH = DATA_DIR / "vini.sqlite3"
SETTINGS_DB_PATH = DATA_DIR / "vini_settings.sqlite3"


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _apply_wal_pragmas(conn: sqlite3.Connection) -> None:
    """
    Fix 1.11.2 (sessione 52) — WAL + synchronous=NORMAL + busy_timeout
    per resistere a SIGTERM mid-write e prevenire corruzioni sqlite_master.
    Applicato simmetricamente a tutti i DB vivi a runtime.
    """
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")


def get_connection() -> sqlite3.Connection:
    """
    Connessione al DB principale 'vini.sqlite3'.
    """
    _ensure_data_dir()
    conn = sqlite3.connect(MAIN_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    _apply_wal_pragmas(conn)
    return conn


def get_settings_conn() -> sqlite3.Connection:
    """
    Connessione al DB impostazioni 'vini_settings.sqlite3'.
    (usato per ordinamenti tipologie/regioni, ecc.)
    """
    _ensure_data_dir()
    conn = sqlite3.connect(SETTINGS_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    _apply_wal_pragmas(conn)
    return conn