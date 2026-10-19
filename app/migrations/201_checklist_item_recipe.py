"""
Migrazione 201 — checklist_item.recipe_id: voce collegata a una ricetta (2026-10-19)

Modulo: task_manager  ·  [core]

Contesto: Marco vuole che ogni voce delle checklist di linea punti alla sua
ricetta (base o piatto). Due cose ne derivano:
  1. spunta condivisa — le voci con la stessa ricetta nelle checklist dello
     stesso giorno e dello stesso turno si spuntano insieme (es. la gremolada
     di ossobuco e rognone, la taragna di antipasti e contorni);
  2. dalla voce si apre la scheda della ricetta (/ricette/{id}).

`recipe_id INTEGER NULL` — riferimento LOGICO a foodcost.db.recipes.id (DB
diverso, quindi niente FK). NULL = voce senza ricetta, come prima.
Il nome si legge via app/services/ricette_lookup.py (platform, read-only).

Idempotente. Doppio binario come la 182: colonna anche in tasks_db.py
(CREATE + HEAL_COLUMNS).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

TASKS_DB = locale_data_path("tasks.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (ignorato) — lavora su tasks.sqlite3."""
    if not TASKS_DB.exists():
        print("  [201] tasks.sqlite3 non esiste (ambiente fresco), skip")
        return
    tk = sqlite3.connect(TASKS_DB)
    try:
        cur = tk.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='checklist_item'")
        if cur.fetchone() is None:
            print("  [201] checklist_item non esiste, skip")
            return
        cols = {r[1] for r in cur.execute("PRAGMA table_info(checklist_item)")}
        if "recipe_id" in cols:
            print("  [201] checklist_item.recipe_id gia' presente")
            return
        cur.execute("ALTER TABLE checklist_item ADD COLUMN recipe_id INTEGER NULL")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_checklist_item_recipe_id ON checklist_item(recipe_id)")
        tk.commit()
        print("  [201] + checklist_item.recipe_id aggiunta (+ indice)")
    finally:
        tk.close()
