"""
Migration 021 — iPratico: aggiunge stato 'ignored' al match_status
Permette di ignorare prodotti iPratico che non hanno corrispondenza TRGB.
"""


def upgrade(conn):
    cur = conn.cursor()

    # SQLite non supporta ALTER CHECK constraint.
    # Ricreiamo la tabella con il nuovo CHECK.
    cur.execute("PRAGMA table_info(ipratico_product_map)")
    cols = [r[1] for r in cur.fetchall()]
    if not cols:
        return  # tabella non esiste ancora, skip

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ipratico_product_map_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ipratico_uuid TEXT NOT NULL UNIQUE,
            ipratico_wine_id TEXT,
            ipratico_name TEXT,
            ipratico_category TEXT,
            vino_id INTEGER,
            match_status TEXT DEFAULT 'unmatched'
                CHECK (match_status IN ('auto','manual','unmatched','ignored')),
            last_sync_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id)
        )
    """)

    cur.execute("""
        INSERT INTO ipratico_product_map_new
            (id, ipratico_uuid, ipratico_wine_id, ipratico_name, ipratico_category,
             vino_id, match_status, last_sync_at, created_at, updated_at)
        SELECT id, ipratico_uuid, ipratico_wine_id, ipratico_name, ipratico_category,
               vino_id, match_status, last_sync_at, created_at, updated_at
        FROM ipratico_product_map
    """)

    cur.execute("DROP TABLE ipratico_product_map")
    cur.execute("ALTER TABLE ipratico_product_map_new RENAME TO ipratico_product_map")

    # Ricrea indici
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ipm_wine_id ON ipratico_product_map(ipratico_wine_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ipm_vino_id ON ipratico_product_map(vino_id)")

    conn.commit()
