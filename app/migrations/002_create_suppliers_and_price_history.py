# @version: v1.0-suppliers-history
# Migration 002 — suppliers + ingredient_price_history

def upgrade(conn):
    cur = conn.cursor()

    # FORNITORI
    cur.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            codice_fiscale TEXT,
            partita_iva TEXT,
            email TEXT,
            telefono TEXT,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # STORICO PREZZI INGREDIENTI
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingredient_price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ingrediente_id INTEGER NOT NULL,
            fornitore_id INTEGER,
            data_prezzo DATE DEFAULT CURRENT_DATE,
            prezzo_unitario REAL NOT NULL,
            unita_misura TEXT,
            quantita_lotto REAL,
            valuta TEXT DEFAULT 'EUR',
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ingrediente_id) REFERENCES ingredients(id),
            FOREIGN KEY (fornitore_id) REFERENCES suppliers(id)
        )
    """)