# @version: v1.0-sqlite-backend
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Connessione SQLite centralizzata

Questo modulo fornisce le funzioni di utilità per ottenere:
- connessione principale al DB 'vini.sqlite3'
- connessione al DB impostazioni 'vini_settings.sqlite3'

Viene usato da:
- app/models/vini_model.py
- app/routers/vini_router.py
- altri moduli che importano get_connection / get_settings_conn
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

# Base: cartella 'app'
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

DB_MAIN_PATH = DATA_DIR / "vini.sqlite3"
DB_SETTINGS_PATH = DATA_DIR / "vini_settings.sqlite3"


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    """
    Connessione al DB principale vini.sqlite3
    """
    _ensure_data_dir()
    conn = sqlite3.connect(DB_MAIN_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_settings_conn() -> sqlite3.Connection:
    """
    Connessione al DB impostazioni vini_settings.sqlite3
    (tipologie, ordine regioni, ecc.)
    """
    _ensure_data_dir()
    conn = sqlite3.connect(DB_SETTINGS_PATH)
    conn.row_factory = sqlite3.Row
    return conn