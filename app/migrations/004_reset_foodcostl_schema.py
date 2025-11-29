#!/usr/bin/env python3
# @version: v1.0-004-reset-foodcost
# Migrazione 004
# RESET COMPLETO foodcost.db e creazione schema unificato:
#   - suppliers
#   - ingredient_categories
#   - ingredients
#   - ingredient_prices
#   - invoices
#   - invoice_lines
#   - recipes
#   - recipe_items

import sqlite3


def upgrade(conn: sqlite3.Connection):
    cur = conn.cursor()

    print("⚠️  [004] RESET COMPLETO SCHEMA foodcost.db (eccetto schema_migrations)")

    # 1) Disattivo foreign_keys per poter droppare in qualsiasi ordine
    cur.execute("PRAGMA foreign_keys = OFF;")

    # 2) Droppo TUTTE le tabelle tranne schema_migrations
    cur.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name != 'schema_migrations'
    """)
    tables = [row[0] for row in cur.fetchall()]

    for name in tables:
        print(f"   - DROP TABLE IF EXISTS {name}")
        cur.execute(f"DROP TABLE IF EXISTS {name};")

    # 3) Ricreo lo schema pulito e definitivo

    # SUPPLIERS (fornitori)
    cur.execute(
        """
        CREATE TABLE suppliers (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL,
            codice_fiscale  TEXT,
            partita_iva     TEXT,
            codice_sdi      TEXT,
            pec             TEXT,
            note            TEXT,
            created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    # CATEGORIE INGREDIENTI
    cur.execute(
        """
        CREATE TABLE ingredient_categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            description TEXT
        );
        """
    )

    # INGREDIENTI (anagrafica unificata – usata da foodcost_router)
    cur.execute(
        """
        CREATE TABLE ingredients (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            codice_interno  TEXT UNIQUE,
            category_id     INTEGER,
            default_unit    TEXT NOT NULL,           -- es. kg, g, l, pezzo
            allergeni       TEXT,                    -- stringa libera per ora
            note            TEXT,
            is_active       INTEGER DEFAULT 1,
            created_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES ingredient_categories(id)
        );
        """
    )

    # STORICO PREZZI (multi-fornitore, multi-fattura)
    cur.execute(
        """
        CREATE TABLE ingredient_prices (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient_id INTEGER NOT NULL,
            supplier_id   INTEGER NOT NULL,
            price_date    TEXT    NOT NULL DEFAULT CURRENT_DATE,
            unit_price    REAL    NOT NULL,       -- prezzo per default_unit
            quantity      REAL,                   -- quantità confezione (es. 1, 5, 10 kg)
            unit          TEXT,                   -- unità confezione (es. kg, l, pezzo)
            invoice_id    INTEGER,                -- riferimento facoltativo a invoices.id
            note          TEXT,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (invoice_id)  REFERENCES invoices(id)
        );
        """
    )

    # FATTURE (metadati + filename XML)
    cur.execute(
        """
        CREATE TABLE invoices (
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

    # RIGHE FATTURA (collegabili agli ingredienti)
    cur.execute(
        """
        CREATE TABLE invoice_lines (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id      INTEGER NOT NULL,
            ingredient_id   INTEGER,          -- NULL se non ancora mappato
            descrizione     TEXT NOT NULL,
            qty             REAL,
            unit            TEXT,
            unit_price      REAL,
            total_line      REAL,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (invoice_id)    REFERENCES invoices(id),
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
        );
        """
    )

    # RICETTE (master)
    cur.execute(
        """
        CREATE TABLE recipes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            category    TEXT,
            yield_qty   REAL,          -- es. 16
            yield_unit  TEXT,          -- es. porzioni, kg, ecc.
            notes       TEXT,
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT
        );
        """
    )

    # RIGHE RICETTA → ingredienti
    cur.execute(
        """
        CREATE TABLE recipe_items (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id     INTEGER NOT NULL,
            ingredient_id INTEGER,        -- per ora opzionale (in futuro anche sotto-ricette)
            qty           REAL NOT NULL,
            unit          TEXT,
            note          TEXT,
            sort_order    INTEGER,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipe_id)     REFERENCES recipes(id),
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
        );
        """
    )

    # 4) INDICI UTILI
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredient_prices_ing ON ingredient_prices(ingredient_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredient_prices_sup ON ingredient_prices(supplier_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredient_prices_date ON ingredient_prices(price_date);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);")

    # 5) Riattivo foreign_keys
    cur.execute("PRAGMA foreign_keys = ON;")

    conn.commit()
    print("✅ [004] Schema foodcost.db ricreato con successo.")