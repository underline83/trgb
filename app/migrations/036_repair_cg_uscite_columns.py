"""
Migrazione 036: Repair — assicura che le colonne aggiunte in 034/035
esistano effettivamente nella tabella cg_uscite.

Motivo: la migrazione 035 era stata registrata come applicata in schema_migrations
ma le ALTER TABLE erano fallite silenziosamente (try/except pass).
"""


def upgrade(conn):
    # Legge le colonne attuali di cg_uscite
    cursor = conn.execute("PRAGMA table_info(cg_uscite)")
    existing_cols = {row[1] for row in cursor.fetchall()}

    needed = {
        "metodo_pagamento": "TEXT",
        "tipo_uscita": "TEXT DEFAULT 'FATTURA'",
        "spesa_fissa_id": "INTEGER",
        "periodo_riferimento": "TEXT",
    }

    for col, typ in needed.items():
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE cg_uscite ADD COLUMN {col} {typ}")
            print(f"  + Added column: {col}")
        else:
            print(f"  ✓ Column already exists: {col}")

    # Indice unique per spese fisse
    try:
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cg_uscite_spesa_periodo
            ON cg_uscite(spesa_fissa_id, periodo_riferimento)
            WHERE spesa_fissa_id IS NOT NULL
        """)
    except Exception:
        pass

    conn.commit()
