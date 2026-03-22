#!/usr/bin/env python3
# @version: v2.0-foodcost-db
# -*- coding: utf-8 -*-

"""
TRGB — Modulo database FOODCOST v2

Database: app/data/foodcost.db

Tabelle principali:
    - suppliers               (fornitori — da fatture XML)
    - ingredient_categories   (categorie ingredienti)
    - ingredients             (anagrafica ingredienti)
    - ingredient_prices       (storico prezzi da fatture)
    - ingredient_supplier_map (mapping fornitore→ingrediente per auto-matching)
    - fe_fatture              (fatture XML importate)
    - fe_righe                (righe fatture XML)
    - recipe_categories       (categorie ricette, configurabili)
    - recipes                 (ricette con sub-ricette)
    - recipe_items            (righe ricetta: ingrediente O sub-ricetta)
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

FOODCOST_DB_PATH = DATA_DIR / "foodcost.db"


# ─────────────────────────────────────────────────────────────
# CONNESSIONE
# ─────────────────────────────────────────────────────────────
def get_foodcost_connection():
    conn = sqlite3.connect(FOODCOST_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


# ─────────────────────────────────────────────────────────────
# CREAZIONE DB BASE (idempotente — il grosso è nelle migrazioni)
# ─────────────────────────────────────────────────────────────
def init_foodcost_db():
    """Crea le tabelle base se non esistono. Le migrazioni aggiungono il resto."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    # 1) SUPPLIERS
    cur.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            codice_fiscale  TEXT,
            partita_iva     TEXT,
            codice_sdi      TEXT,
            pec             TEXT,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 2) INGREDIENT CATEGORIES
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingredient_categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            description TEXT
        );
    """)

    # 3) INGREDIENTS
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingredients (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            codice_interno  TEXT UNIQUE,
            category_id     INTEGER,
            default_unit    TEXT NOT NULL,
            allergeni       TEXT,
            note            TEXT,
            is_active       INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT,
            FOREIGN KEY (category_id) REFERENCES ingredient_categories(id)
        );
    """)

    # 4) INGREDIENT PRICES (schema base — migration 007 aggiunge colonne extra)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingredient_prices (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient_id   INTEGER NOT NULL,
            supplier_id     INTEGER NOT NULL,
            price_date      TEXT NOT NULL DEFAULT CURRENT_DATE,
            unit_price      REAL NOT NULL,
            quantity         REAL,
            unit            TEXT,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );
    """)

    # 5) INDICI UTILI
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prices_ingredient ON ingredient_prices(ingredient_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prices_supplier ON ingredient_prices(supplier_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prices_date ON ingredient_prices(price_date);")

    conn.commit()
    conn.close()
