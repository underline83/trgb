"""
Migration 037 — Storico adeguamenti spese fisse (ISTAT, variazioni canone, ecc.)
"""

def run(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cg_spese_fisse_adeguamenti (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            spesa_fissa_id  INTEGER NOT NULL REFERENCES cg_spese_fisse(id) ON DELETE CASCADE,
            importo_vecchio REAL NOT NULL,
            importo_nuovo   REAL NOT NULL,
            data_decorrenza TEXT NOT NULL,
            variazione_pct  REAL,
            motivo          TEXT,
            uscite_aggiornate INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_adeguamenti_spesa
        ON cg_spese_fisse_adeguamenti(spesa_fissa_id)
    """)

    conn.commit()
