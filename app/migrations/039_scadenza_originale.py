"""
Migration 039 — Aggiunge data_scadenza_originale a cg_uscite.
Serve per tracciare spostamenti scadenza: se la nuova data dista >10gg
dall'originale, l'uscita diventa 'arretrato'.
"""


def upgrade(conn):
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE cg_uscite ADD COLUMN data_scadenza_originale TEXT")
    except Exception:
        pass  # Colonna gia esistente

    # Popola le righe esistenti: originale = attuale
    cur.execute("""
        UPDATE cg_uscite
        SET data_scadenza_originale = data_scadenza
        WHERE data_scadenza_originale IS NULL AND data_scadenza IS NOT NULL
    """)
    conn.commit()
