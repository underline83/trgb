"""
Migrazione 137 — recipes: campo procedimento (2026-05-23)

CONTESTO:
  Feature "Importa ricetta". Il procedimento di preparazione (il metodo, i
  passaggi) finiva nel campo generico `note`. Il `note` deve restare per
  annotazioni brevi; il procedimento è un dato di prima classe della ricetta.

SOLUZIONE:
  Colonna `procedimento TEXT` su `recipes`. Separata da `note` (annotazioni)
  e da `istruzioni_impiattamento` (impiattamento). Usata dall'import ricette,
  dalla scheda ricetta e dai form nuova/modifica.

DB: foodcost.db. Idempotente (try/except colonna).
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner)."""
    cur = conn.cursor()

    cols = {r[1] for r in cur.execute("PRAGMA table_info(recipes)").fetchall()}
    if "procedimento" in cols:
        print("  [137] colonna recipes.procedimento gia' presente — no-op")
        return

    cur.execute("ALTER TABLE recipes ADD COLUMN procedimento TEXT")
    print("  [137] aggiunta colonna recipes.procedimento (TEXT, NULL ammesso)")
    print("  [137] DONE")
