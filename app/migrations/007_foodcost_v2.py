"""
Migration 007 — Food Cost v2: schema ricette + sub-ricette + matching fatture

Operazioni:
1. DROP tabelle vecchie: invoices, invoice_lines, recipes, recipe_items
2. ALTER ingredient_prices: colonne per tracciare prezzo originale + link fe_righe
3. CREATE ingredient_supplier_map: mapping fornitore→ingrediente (auto-matching)
4. CREATE recipes v2: con is_base, selling_price, prep_time
5. CREATE recipe_items v2: con sub_recipe_id per sub-ricette
6. CREATE recipe_categories: categorie ricetta configurabili da UI
"""


def upgrade(conn):
    cur = conn.cursor()

    # ─────────────────────────────────────────────
    # 1. DROP tabelle vecchie (duplicati di fe_fatture/fe_righe)
    # ─────────────────────────────────────────────
    cur.execute("DROP TABLE IF EXISTS invoice_lines;")
    cur.execute("DROP TABLE IF EXISTS invoices;")
    cur.execute("DROP TABLE IF EXISTS recipe_items;")
    cur.execute("DROP TABLE IF EXISTS recipes;")

    # ─────────────────────────────────────────────
    # 2. ALTER ingredient_prices — nuove colonne
    # ─────────────────────────────────────────────
    # SQLite non supporta IF NOT EXISTS su ALTER TABLE,
    # quindi usiamo try/except per ogni colonna
    new_cols = [
        ("original_price", "REAL"),
        ("original_unit", "TEXT"),
        ("original_qty", "REAL"),
        ("fattura_id", "INTEGER"),
        ("riga_fattura_id", "INTEGER"),
    ]
    for col_name, col_type in new_cols:
        try:
            cur.execute(
                f"ALTER TABLE ingredient_prices ADD COLUMN {col_name} {col_type};"
            )
        except Exception:
            pass  # colonna già esiste

    # ─────────────────────────────────────────────
    # 3. CREATE ingredient_supplier_map
    # ─────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingredient_supplier_map (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient_id         INTEGER NOT NULL,
            supplier_id           INTEGER NOT NULL,
            codice_fornitore      TEXT,
            descrizione_fornitore TEXT NOT NULL,
            unita_fornitore       TEXT,
            fattore_conversione   REAL DEFAULT 1.0,
            is_default            INTEGER DEFAULT 0,
            confirmed_by          TEXT,
            created_at            TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );
    """)

    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ism_ingredient ON ingredient_supplier_map(ingredient_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ism_supplier ON ingredient_supplier_map(supplier_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ism_desc ON ingredient_supplier_map(descrizione_fornitore);"
    )

    # ─────────────────────────────────────────────
    # 4. CREATE recipe_categories
    # ─────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recipe_categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            sort_order  INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Inserisci categorie di default
    default_cats = [
        ("Antipasto", 1),
        ("Primo", 2),
        ("Secondo", 3),
        ("Contorno", 4),
        ("Dolce", 5),
        ("Base", 10),
        ("Salsa", 11),
        ("Impasto", 12),
    ]
    for name, order in default_cats:
        cur.execute(
            "INSERT OR IGNORE INTO recipe_categories (name, sort_order) VALUES (?, ?);",
            (name, order),
        )

    # ─────────────────────────────────────────────
    # 5. CREATE recipes v2
    # ─────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recipes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            category_id     INTEGER,
            is_base         INTEGER DEFAULT 0,
            yield_qty       REAL,
            yield_unit      TEXT,
            selling_price   REAL,
            prep_time       INTEGER,
            note            TEXT,
            is_active       INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT,
            FOREIGN KEY (category_id) REFERENCES recipe_categories(id)
        );
    """)

    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_recipes_base ON recipes(is_base);"
    )

    # ─────────────────────────────────────────────
    # 6. CREATE recipe_items v2 (con sub_recipe_id)
    # ─────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recipe_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id       INTEGER NOT NULL,
            ingredient_id   INTEGER,
            sub_recipe_id   INTEGER,
            qty             REAL NOT NULL,
            unit            TEXT NOT NULL,
            sort_order      INTEGER DEFAULT 0,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY (sub_recipe_id) REFERENCES recipes(id)
        );
    """)

    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ritems_recipe ON recipe_items(recipe_id);"
    )

    conn.commit()
