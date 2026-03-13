"""
Migrazione 016 — Regole di categorizzazione automatica per Finanza
Mappa pattern di descrizione → Cat.1 / Cat.2 (per entrambe le viste)
+ link opzionale a fornitore acquisti (fe_fatture)
"""

MIGRATION_ID = 16


def upgrade(conn):
    cur = conn.cursor()

    # Regole di auto-categorizzazione
    # Quando la descrizione di un movimento contiene 'pattern', assegna le categorie
    cur.execute("""
        CREATE TABLE IF NOT EXISTS finanza_regole_cat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            /* Pattern da cercare nella descrizione (LIKE %pattern%) */
            pattern TEXT NOT NULL,

            /* Fornitore collegato (opzionale, da fe_fatture) */
            fornitore_nome TEXT DEFAULT '',
            fornitore_piva TEXT DEFAULT '',

            /* Categorie vista ANALITICA */
            cat1 TEXT DEFAULT '',
            cat2 TEXT DEFAULT '',
            tipo_analitico TEXT DEFAULT '',

            /* Categorie vista FINANZIARIA */
            cat1_fin TEXT DEFAULT '',
            cat2_fin TEXT DEFAULT '',
            tipo_finanziario TEXT DEFAULT '',
            descrizione_finanziaria TEXT DEFAULT '',

            /* Cat debito */
            cat_debito TEXT DEFAULT '',

            /* Metadata */
            num_match INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_regole_pattern ON finanza_regole_cat(pattern)")

    conn.commit()
    return True
