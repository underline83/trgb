# @version: v1.1-ingredients
# Migration 001 — create ingredients table (foodcost.db)

def upgrade(conn):
    cur = conn.cursor()

    # Tabella ingredienti base
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingredients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            categoria TEXT,
            unita_misura TEXT,
            prezzo_unitario REAL,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)