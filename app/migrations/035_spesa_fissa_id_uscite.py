"""
Migrazione 035: aggiunge spesa_fissa_id e tipo_uscita a cg_uscite.

tipo_uscita: 'FATTURA' (default, da acquisti) o 'SPESA_FISSA' (generata da cg_spese_fisse)
spesa_fissa_id: FK verso cg_spese_fisse.id (NULL per fatture)
periodo_riferimento: mese di riferimento 'YYYY-MM' (per evitare duplicati spese fisse)
"""


def upgrade(conn):
    for col, typ in [
        ("tipo_uscita", "TEXT DEFAULT 'FATTURA'"),
        ("spesa_fissa_id", "INTEGER"),
        ("periodo_riferimento", "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE cg_uscite ADD COLUMN {col} {typ}")
        except Exception:
            pass  # colonna già esistente

    # Indice per evitare duplicati spese fisse nello stesso mese
    try:
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cg_uscite_spesa_periodo
            ON cg_uscite(spesa_fissa_id, periodo_riferimento)
            WHERE spesa_fissa_id IS NOT NULL
        """)
    except Exception:
        pass

    conn.commit()
