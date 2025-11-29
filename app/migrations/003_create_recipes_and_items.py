# @version: v1.0-recipes
# Migration 003 — recipes + recipe_items

def upgrade(conn):
    cur = conn.cursor()

    # RICETTE
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            categoria TEXT,
            resa_qta REAL,
            resa_unita TEXT,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # RIGHE INGREDIENTI DELLA RICETTA
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recipe_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ricetta_id INTEGER NOT NULL,
            ingrediente_id INTEGER NOT NULL,
            qty REAL NOT NULL,
            unit TEXT,
            note TEXT,
            FOREIGN KEY (ricetta_id) REFERENCES recipes(id),
            FOREIGN KEY (ingrediente_id) REFERENCES ingredients(id)
        )
    """)