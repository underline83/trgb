"""
Migration 020 — iPratico Products Mapping
Tabella per mappare prodotti iPratico (export Excel) ↔ vini TRGB (magazzino).

Tabella ipratico_product_map:
  - ipratico_uuid: ID univoco iPratico (product:UUID)
  - ipratico_wine_id: codice 4 cifre estratto dal campo Name
  - vino_id: FK → vini_magazzino.id
  - match_status: auto / manual / unmatched
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ipratico_product_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ipratico_uuid TEXT NOT NULL UNIQUE,
            ipratico_wine_id TEXT,
            ipratico_name TEXT,
            ipratico_category TEXT,
            vino_id INTEGER,
            match_status TEXT DEFAULT 'unmatched'
                CHECK (match_status IN ('auto','manual','unmatched')),
            last_sync_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id)
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_ipm_wine_id
        ON ipratico_product_map(ipratico_wine_id)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_ipm_vino_id
        ON ipratico_product_map(vino_id)
    """)

    # Log delle sincronizzazioni export
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ipratico_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            direction TEXT NOT NULL CHECK (direction IN ('import','export')),
            filename TEXT,
            n_matched INTEGER DEFAULT 0,
            n_updated_qty INTEGER DEFAULT 0,
            n_updated_price INTEGER DEFAULT 0,
            n_unmatched INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    conn.commit()
