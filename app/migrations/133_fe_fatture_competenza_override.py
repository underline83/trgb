"""
Migrazione 133 — fe_fatture: campo override competenza (G.3.1b, 2026-05-16)

CONTESTO:
  Marco 2026-05-16: capita che una fattura datata es. 2 febbraio sia in
  realtà di gennaio (fornitore non ha fatturato il 31 dicembre, era festa).
  In modalità competenza il CE oggi la conta a febbraio (data_fattura), ma
  semanticamente è di gennaio.

SOLUZIONE:
  Campo opzionale `competenza_anno_mese TEXT` (formato 'YYYY-MM') su
  `fe_fatture`. Logica nel service CE:
    - NULL → usa `strftime('%Y-%m', data_fattura)` come oggi (default)
    - valorizzato → la fattura viene conteggiata in quel mese

  La `data_fattura` resta INALTERATA (dato fiscale, deve restare quello del
  documento SDI). Solo la classificazione P&L del CE viene spostata.

DB: foodcost.db. Idempotente (try/except colonna).
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner)."""
    cur = conn.cursor()

    # Verifica se la colonna esiste già (idempotenza)
    cols = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}
    if "competenza_anno_mese" in cols:
        print("  [133] colonna fe_fatture.competenza_anno_mese già presente — no-op")
        return

    cur.execute("ALTER TABLE fe_fatture ADD COLUMN competenza_anno_mese TEXT")
    print("  [133] aggiunta colonna fe_fatture.competenza_anno_mese (TEXT, NULL ammesso)")

    # Indice opzionale per query veloce nel CE
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_fe_fatture_competenza_override "
        "ON fe_fatture(competenza_anno_mese)"
    )
    print("  [133] creato indice idx_fe_fatture_competenza_override")
    print("  [133] DONE")
