"""
Migrazione 044: tabella cg_entrate per registrare entrate da movimenti bancari.

Permette di riconciliare anche le entrate (POS, contanti, bonifici entrata, ecc.)
nel controllo di gestione, completando il quadro uscite + entrate.

Struttura analoga a cg_uscite ma per flussi in ingresso.
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cg_entrate (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            descrizione     TEXT NOT NULL,
            categoria       TEXT NOT NULL DEFAULT 'ALTRO',
            importo         REAL NOT NULL DEFAULT 0,
            data_entrata    TEXT,
            banca_movimento_id INTEGER UNIQUE,
            note            TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (banca_movimento_id) REFERENCES banca_movimenti(id)
        )
    """)

    # Indice per join veloce con banca_movimenti
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_cg_entrate_banca_mov
        ON cg_entrate(banca_movimento_id)
    """)

    conn.commit()
    print("  -> Creata tabella cg_entrate")
