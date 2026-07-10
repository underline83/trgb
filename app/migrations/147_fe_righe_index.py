"""
Migrazione 147: indice su fe_righe(fattura_id)

fe_righe (11.392 righe al 2026-06, in crescita) veniva scansionata interamente
a ogni riga dell'elenco fatture / conto economico / matching ricette, perché
priva di qualsiasi indice sulla colonna di join fattura_id (la FOREIGN KEY in
SQLite NON crea un indice). Additiva e idempotente, nessun dato toccato.

fe_righe è creata dal self-heal di app/routers/fe_import.py (non da una
migrazione), quindi qui la creiamo solo se la tabella esiste già; sulle
installazioni nuove l'indice viene creato dallo stesso self-heal (che ora lo
include). Audit 2026-06-12 A7-02 / A2-03.
"""


def upgrade(conn):
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='fe_righe'"
    ).fetchone()
    if not row:
        print("  fe_righe non ancora presente — indice creato dal self-heal di fe_import")
        return
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_fe_righe_fattura ON fe_righe(fattura_id)"
    )
    conn.commit()
    print("  ✔ indice idx_fe_righe_fattura garantito")
