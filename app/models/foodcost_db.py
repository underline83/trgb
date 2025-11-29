#!/usr/bin/env python3
# @version: v1.1-foodcost-db
# -*- coding: utf-8 -*-

"""
TRGB — Modulo database FOODCOST

Database unico:
    app/data/foodcost.db

Tabelle principali:
    - suppliers             (fornitori)
    - ingredient_categories (categorie)
    - ingredients           (anagrafica ingredienti)
    - ingredient_prices     (storico prezzi)
    - invoices              (fatture XML)
    - invoice_lines         (righe fattura collegate)
    - recipes               (ricette)
    - recipe_items          (ingredienti ricette)
"""

import sqlite3
from pathlib import Path

# Percorso root progetto
BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

FOODCOST_DB_PATH = DATA_DIR / "foodcost.db"


# ─────────────────────────────────────────────────────────────
# CONNESSIONE
# ─────────────────────────────────────────────────────────────
def get_foodcost_connection():
    conn = sqlite3.connect(FOODCOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─────────────────────────────────────────────────────────────
# CREAZIONE DB BASE (idempotente)
# ─────────────────────────────────────────────────────────────
def init_foodcost_db():
    conn = get_foodcost_connection()
    cur = conn.cursor()

    # 1) SUPPLIERS
    cur.execute(
        """
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
        """
    )

    # 2) CATEGORY
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ingredient_categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            description TEXT
        );
        """
    )

    # 3) INGREDIENTS
    cur.execute(
        """
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
        """
    )

    # 4) PRICE HISTORY
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ingredient_prices (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient_id INTEGER NOT NULL,
            supplier_id   INTEGER NOT NULL,
            price_date    TEXT NOT NULL DEFAULT CURRENT_DATE,
            unit_price    REAL NOT NULL,
            quantity      REAL,
            unit          TEXT,
            invoice_id    INTEGER,
            note          TEXT,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (invoice_id)  REFERENCES invoices(id)
        );
        """
    )

    # 5) INVOICES
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id    INTEGER NOT NULL,
            numero         TEXT,
            data_fattura   TEXT,
            imponibile     REAL,
            totale         REAL,
            currency       TEXT DEFAULT 'EUR',
            xml_filename   TEXT,
            created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );
        """
    )

    # 6) INVOICE LINES
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS invoice_lines (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id      INTEGER NOT NULL,
            ingredient_id   INTEGER,
            descrizione     TEXT NOT NULL,
            qty             REAL,
            unit            TEXT,
            unit_price      REAL,
            total_line      REAL,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (invoice_id) REFERENCES invoices(id),
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
        );
        """
    )

    # 7) RECIPES
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS recipes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            category        TEXT,
            yield_qty       REAL,
            yield_unit      TEXT,
            notes           TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    # 8) RECIPE ITEMS
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id       INTEGER NOT NULL,
            ingredient_id   INTEGER NOT NULL,
            qty             REAL NOT NULL,
            unit            TEXT,
            note            TEXT,
            FOREIGN KEY (recipe_id)    REFERENCES recipes(id),
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
        );
        """
    )

    # 9) INDICI UTILI
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prices_ingredient ON ingredient_prices(ingredient_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prices_supplier ON ingredient_prices(supplier_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prices_date ON ingredient_prices(price_date);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);")

    conn.commit()
    conn.close()