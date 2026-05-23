"""
Migrazione 136 — ingredients: flag placeholder (import ricette, 2026-05-23)

CONTESTO:
  Nuova feature "Importa ricetta" (modulo Ricette). Il file JSON importato
  cita gli ingredienti per NOME. Quando un nome non corrisponde a nessun
  ingrediente in archivio, l'utente puo' scegliere di creare un
  "placeholder": un ingrediente con il solo nome + unita', da completare
  in seguito (categoria, prezzi, allergeni).

SOLUZIONE:
  Colonna `placeholder INTEGER DEFAULT 0` su `ingredients`.
    - 0 = ingrediente normale
    - 1 = placeholder creato da import, ancora da completare
  Permette una lista filtrabile "ingredienti da completare" e un badge
  nell'anagrafica ingredienti.

DB: foodcost.db. Idempotente (try/except colonna).
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner)."""
    cur = conn.cursor()

    cols = {r[1] for r in cur.execute("PRAGMA table_info(ingredients)").fetchall()}
    if "placeholder" in cols:
        print("  [136] colonna ingredients.placeholder gia' presente — no-op")
        return

    cur.execute("ALTER TABLE ingredients ADD COLUMN placeholder INTEGER DEFAULT 0")
    print("  [136] aggiunta colonna ingredients.placeholder (INTEGER DEFAULT 0)")

    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ingredients_placeholder "
        "ON ingredients(placeholder)"
    )
    print("  [136] creato indice idx_ingredients_placeholder")
    print("  [136] DONE")
