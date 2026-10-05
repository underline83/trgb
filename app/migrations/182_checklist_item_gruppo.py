"""
Migrazione 182 — checklist_item.gruppo: voce padre con sotto-voci (2026-10-04)

Modulo: task_manager  ·  [core]

Contesto:
  Marco vuole le checklist di linea (es. «Linea Antipasti») a due livelli:
  una voce padre per piatto («Rosa di zucca») e sotto di lei le singole
  verifiche («6 rose scongelate in linea», «scorta gelo min 18», ...).

Modello scelto (il piu' piccolo che basta):
  - colonna `gruppo TEXT NULL` su `checklist_item`;
  - le voci CONSECUTIVE con lo stesso `gruppo` sono le sotto-voci di
    quel padre; il padre NON e' una voce a se' (non ha execution, non
    entra nello score): e' spuntato quando tutte le sotto-voci sono OK;
  - gruppo NULL = voce semplice, come prima. Nessun template esistente
    cambia comportamento.

Idempotente: PRAGMA table_info -> ADD COLUMN solo se manca.
Doppio binario come la 155: la stessa colonna e' anche in
app/models/tasks_db.py (CREATE + HEAL_COLUMNS), cosi' un DB ricreato
dall'init difensivo la ha comunque.

DB: tasks.sqlite3 (locale_data_path).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

TASKS_DB = locale_data_path("tasks.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (ignorato) — lavora su tasks.sqlite3."""
    if not TASKS_DB.exists():
        print("  [182] tasks.sqlite3 non esiste (ambiente fresco), skip")
        return

    tk = sqlite3.connect(TASKS_DB)
    try:
        cur = tk.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='checklist_item'"
        )
        if cur.fetchone() is None:
            print("  [182] checklist_item non esiste, skip")
            return
        cols = {r[1] for r in cur.execute("PRAGMA table_info(checklist_item)")}
        if "gruppo" in cols:
            print("  [182] checklist_item.gruppo gia' presente")
            return
        cur.execute("ALTER TABLE checklist_item ADD COLUMN gruppo TEXT NULL")
        tk.commit()
        print("  [182] + checklist_item.gruppo aggiunta")
    finally:
        tk.close()
