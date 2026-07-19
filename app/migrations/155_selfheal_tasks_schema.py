"""
Migrazione 155 — Self-heal schema tasks.sqlite3: livello_cucina (2026-07-19)

Contesto (incidente scoperto generando i MEP del menu Estate 2026):
  Il tasks.sqlite3 vivo in produzione (locali/tregobbi/data/) NON e' il file
  storico passato dalle migrazioni 084->088: e' stato ricreato da zero da
  `init_tasks_db()` (init difensivo, schema PRE-088) quasi certamente nel giro
  dell'incidente R6.5 di inizio maggio (S60-INC1: il file non fu spostato da
  app/data/ e l'init ne ha creato uno nuovo nel path canonico).

  Risultato: mancano le colonne `livello_cucina` (mig 088, Phase A.2) su
  checklist_template / checklist_instance / task_singolo. Ogni INSERT che le
  passa esplode con OperationalError:
    - POST /menu-carta/editions/{id}/generate-mep  (generatore MEP carta)
    - POST /tasks/templates                        (creazione template da UI)

  La 088 e' marcata applicata in schema_migrations -> non rigira mai piu'.
  Regola TRGB: mai modificare una migrazione gia' girata -> nuova migrazione
  che rifa' il self-heal. (Vedi anche hardening parallelo in
  app/models/tasks_db.py v1.3: init difensivo ora include le colonne e ha un
  self-heal post-CREATE, cosi' questa classe di drift non si ripresenta.)

Cosa fa:
  Per ciascuna di [task_singolo, checklist_template, checklist_instance]:
    - PRAGMA table_info -> se manca `livello_cucina` -> ALTER TABLE ADD COLUMN
      livello_cucina TEXT NULL + indice (stessa semantica della 088).
  Idempotente: secondo run = "0 tabelle toccate".

DB: tasks.sqlite3 (path canonico locale_data_path — stesso file che apre il
backend a runtime, quindi risana esattamente il DB che dava errore).

NB: NON ripristina i dati persi (template MEP fissi mig 097, checklist HACCP
configurate ad aprile): quelli non sono recuperabili da migrazione — vedi
docs/problemi.md e sessione 2026-07-19.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

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
    """conn = foodcost.db (ignorato) — lavora su tasks.sqlite3."""
    if not TASKS_DB.exists():
        # Ambiente fresco: il DB nasce da init_tasks_db() v1.3 che ha gia'
        # le colonne. Niente da fare.
        print("  [155] tasks.sqlite3 non esiste (ambiente fresco), skip")
        return

    tk = sqlite3.connect(TASKS_DB)
    try:
        cur = tk.cursor()
        toccate = 0
        for table in TABLES:
            if not _table_exists(cur, table):
                print(f"  · {table}: non esiste, skip")
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
            print(f"  + {table}.livello_cucina aggiunta (+ indice)")
            toccate += 1

        tk.commit()
        print(f"  [155] self-heal tasks.sqlite3: {toccate} tabelle toccate")
    finally:
        tk.close()
