"""
Migrazione 088 — Livello Cucina (Phase A.2, sessione 46)

Aggiunge colonna `livello_cucina TEXT NULL` su 3 tabelle in tasks.sqlite3:
- task_singolo
- checklist_template
- checklist_instance

Valori ammessi: 'chef', 'sous_chef', 'commis', NULL.
NULL = tutta la brigata cucina (backward-compat con task esistenti).

Pattern self-heal stile 087: PRAGMA table_info check prima di ALTER.
Idempotente: secondo run = "0 tabelle toccate".

DB: app/data/tasks.sqlite3
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
TASKS_DB = locale_data_path("tasks.sqlite3")

TABLES = ["task_singolo", "checklist_template", "checklist_instance"]


def _has_column(cur: sqlite3.Cursor, table: str, col: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cur.fetchall())


def _table_exists(cur: sqlite3.Cursor, table: str) -> bool:
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    """Aggiunge livello_cucina su task_singolo, checklist_template, checklist_instance."""
    if not TASKS_DB.exists():
        print("  [088] tasks.sqlite3 non esiste, skip")
        return

    cu = sqlite3.connect(TASKS_DB)
    try:
        cur = cu.cursor()
        toccate = 0

        for table in TABLES:
            if not _table_exists(cur, table):
                continue
            if _has_column(cur, table, "livello_cucina"):
                continue
            cur.execute(
                f"ALTER TABLE {table} ADD COLUMN livello_cucina TEXT NULL"
            )
            cur.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{table}_livello_cucina"
                f" ON {table}(livello_cucina)"
            )
            toccate += 1

        cu.commit()
        print(f"  [088] livello_cucina: {toccate} tabelle toccate su tasks.sqlite3")
    finally:
        cu.close()
