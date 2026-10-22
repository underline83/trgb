"""
Migrazione 207 — Linea cucina, fase L2: checklist generate dal menu (2026-10-22)

Modulo: cucina + task_manager  ·  [core]  ·  Spec: docs/spec_linea_cucina.md §5

foodcost.db (conn):
  - cucina_linea_elementi.generale  INTEGER NULL — la voce sta nel gruppo
    «Generale» della partita (c'e' sempre, anche se nessun piatto la usa).
  - config: linea_sezioni, linea_ora_pranzo, linea_ora_sera,
    linea_lotti_avviso_gg (seed non distruttivo).

tasks.sqlite3:
  - checklist_template.generato_da  TEXT NULL — 'linea:<partita>:<turno>'
  - checklist_item.articolo_id      INTEGER NULL — articolo in Scorte (logico)
  - checklist_item.linea_ref        TEXT NULL — chiave stabile del generatore
  - checklist_item.disattivo_at     TEXT NULL — voce uscita dal menu: non si
    mostra piu' nelle istanze nuove, resta in quelle che l'hanno spuntata.

Tutto ADD COLUMN nullable, idempotente. Le stesse colonne sono negli init
difensivi (cucina_scorte_db.HEAL_COLUMNS, tasks_db.HEAL_COLUMNS).
"""

import sqlite3

from app.models.cucina_scorte_db import apply_schema
from app.utils.locale_data import locale_data_path

TASKS_DB = locale_data_path("tasks.sqlite3")

_TASKS_COLS = {
    "checklist_template": [("generato_da", "TEXT")],
    "checklist_item": [("articolo_id", "INTEGER"), ("linea_ref", "TEXT"),
                       ("disattivo_at", "TEXT")],
}


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db. Le colonne task le aggiunge su tasks.sqlite3."""
    apply_schema(conn)
    print("  [207] cucina_linea_elementi.generale + config linea_*")

    if not TASKS_DB.exists():
        print("  [207] tasks.sqlite3 non esiste (ambiente fresco), skip: ci pensa l'init")
        return
    tk = sqlite3.connect(TASKS_DB, timeout=30)
    try:
        for tab, cols in _TASKS_COLS.items():
            presenti = {r[1] for r in tk.execute(f"PRAGMA table_info({tab})")}
            if not presenti:
                print(f"  [207] {tab} non esiste, skip")
                continue
            for col, tipo in cols:
                if col not in presenti:
                    tk.execute(f"ALTER TABLE {tab} ADD COLUMN {col} {tipo}")
                    print(f"  [207] + {tab}.{col}")
        tk.execute("CREATE INDEX IF NOT EXISTS idx_checklist_item_articolo_id ON checklist_item(articolo_id)")
        tk.execute("CREATE INDEX IF NOT EXISTS idx_checklist_item_linea_ref ON checklist_item(template_id, linea_ref)")
        tk.commit()
    finally:
        tk.close()
