"""
Migrazione 049: Aggiunge spese_legali e importo_originale a cg_spese_fisse

Per le rateizzazioni con spese legali aggiuntive:
- importo_originale: importo base (fattura)
- spese_legali: spese aggiuntive
- importo: rimane la rata (o importo medio per piano rate variabile)
"""


def upgrade(conn):
    cur = conn.cursor()

    cols_to_add = [
        ("importo_originale", "REAL"),
        ("spese_legali", "REAL DEFAULT 0"),
    ]

    existing_cols = [row[1] for row in cur.execute("PRAGMA table_info(cg_spese_fisse)").fetchall()]

    for col_name, col_type in cols_to_add:
        if col_name not in existing_cols:
            try:
                cur.execute(f"ALTER TABLE cg_spese_fisse ADD COLUMN {col_name} {col_type}")
            except Exception:
                pass
