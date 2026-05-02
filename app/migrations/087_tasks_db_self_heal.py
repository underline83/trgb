"""
Migrazione 087 — Self-heal tasks.sqlite3 (sessione 46, fix incidente prod 18/04 18:56)

Contesto: la 086 sposta cucina.sqlite3 → tasks.sqlite3 con `shutil.move`, ma solo
se `not TASKS_DB.exists()`. In produzione e' capitato che `init_tasks_db` (chiamato
su import del router al boot di uvicorn) abbia creato un tasks.sqlite3 vuoto
PRIMA che la migrazione 086 girasse. La 086 ha quindi rispettato la guardia
("entrambi esistono, mantengo tasks canonical"), lasciando il DB popolato in
cucina.sqlite3 orfano. Risultato: il backend leggeva tasks.sqlite3 schema-only,
senza la colonna `reparto` aggiunta dalla 085 su cucina.sqlite3.

Questa 087:
1. Se esistono entrambi cucina.sqlite3 e tasks.sqlite3:
   - confronta il numero di righe in checklist_template + task_singolo + checklist_instance
   - se tasks.sqlite3 e' vuoto (0 righe in tutte e 3 le tabelle) e cucina.sqlite3
     ha almeno una riga → backup del tasks.sqlite3 vuoto + swap
   - altrimenti (caso anomalo: entrambi popolati) logga e lascia stare
2. Garantisce la colonna `reparto` su tutte le 4 tabelle del modulo Tasks
   (ripete il lavoro della 085 ma su tasks.sqlite3, con check PRAGMA).
3. Garantisce la rinomina cucina_alert_log → task_alert_log (idempotente).

Idempotente. Sicura da rilanciare n volte.

DB: app/data/tasks.sqlite3 (post-rename).
"""

import shutil
import sqlite3
import time
from pathlib import Path

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
CUCINA_DB = locale_data_path("cucina.sqlite3")
TASKS_DB = locale_data_path("tasks.sqlite3")

TABLES_REPARTO = ["checklist_template", "checklist_instance", "task_singolo", "cucina_alert_log", "task_alert_log"]
TABLES_DATA_CHECK = ["checklist_template", "task_singolo", "checklist_instance"]


def _has_column(cur: sqlite3.Cursor, table: str, col: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cur.fetchall())


def _table_exists(cur: sqlite3.Cursor, table: str) -> bool:
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def _rowcount(db_path: Path, tables: list[str]) -> int:
    """Somma le righe presenti nelle tabelle specificate (se esistono)."""
    if not db_path.exists():
        return 0
    tot = 0
    cu = sqlite3.connect(db_path)
    try:
        cur = cu.cursor()
        for t in tables:
            if _table_exists(cur, t):
                cur.execute(f"SELECT COUNT(*) FROM {t}")
                tot += cur.fetchone()[0]
    finally:
        cu.close()
    return tot


def _add_reparto_if_missing(cur: sqlite3.Cursor, table: str) -> bool:
    """Aggiunge reparto se manca. Normalizza lowercase se presente ma maiuscolo.
    Ritorna True se ha modificato qualcosa."""
    if not _table_exists(cur, table):
        return False
    if _has_column(cur, table, "reparto"):
        # Normalizza eventuali valori maiuscoli residui (heritage 084 seed)
        cur.execute(
            f"UPDATE {table} "
            f"   SET reparto = LOWER(reparto) "
            f" WHERE reparto IS NOT NULL AND reparto != LOWER(reparto)"
        )
        changed = cur.rowcount > 0
        cur.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_reparto ON {table}(reparto)"
        )
        return changed
    cur.execute(
        f"ALTER TABLE {table} "
        f"ADD COLUMN reparto TEXT NOT NULL DEFAULT 'cucina'"
    )
    cur.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{table}_reparto ON {table}(reparto)"
    )
    return True


def upgrade(conn: sqlite3.Connection) -> None:
    """Self-heal tasks.sqlite3 post-rename."""
    # --- Step 1: swap se tasks.sqlite3 e' vuoto e cucina.sqlite3 popolato ---
    if CUCINA_DB.exists() and TASKS_DB.exists():
        tasks_rows = _rowcount(TASKS_DB, TABLES_DATA_CHECK)
        cucina_rows = _rowcount(CUCINA_DB, TABLES_DATA_CHECK)
        if tasks_rows == 0 and cucina_rows > 0:
            # tasks.sqlite3 e' schema-only, cucina.sqlite3 ha i dati: swap.
            ts = int(time.time())
            bak = DATA_DIR / f"tasks.sqlite3.empty-bak-{ts}"
            shutil.move(str(TASKS_DB), str(bak))
            shutil.move(str(CUCINA_DB), str(TASKS_DB))
            # Sposta anche eventuali sidecar residui di cucina.sqlite3
            for suffix in ("-wal", "-shm", ".prev"):
                sidecar_old = DATA_DIR / f"cucina.sqlite3{suffix}"
                sidecar_new = DATA_DIR / f"tasks.sqlite3{suffix}"
                if sidecar_old.exists() and not sidecar_new.exists():
                    shutil.move(str(sidecar_old), str(sidecar_new))
            print(
                f"  [087] swap: tasks.sqlite3 (vuoto, {tasks_rows} righe) archiviato in "
                f"{bak.name}, cucina.sqlite3 ({cucina_rows} righe) promosso a tasks.sqlite3"
            )
        elif tasks_rows > 0 and cucina_rows > 0:
            print(
                f"  [087] warning: entrambi popolati (tasks={tasks_rows}, cucina={cucina_rows}) — "
                f"skip swap, intervento manuale richiesto"
            )
        elif tasks_rows > 0 and cucina_rows == 0:
            # cucina.sqlite3 orfano e vuoto: e' cosa buona liberarsene (opzionale, ma
            # evita confusione in futuri backup). Sposta in .orphan-bak per sicurezza.
            ts = int(time.time())
            bak = DATA_DIR / f"cucina.sqlite3.orphan-bak-{ts}"
            shutil.move(str(CUCINA_DB), str(bak))
            print(f"  [087] cucina.sqlite3 orfano e vuoto → archiviato in {bak.name}")
        else:
            # Entrambi vuoti: situazione nuova installazione, nulla da fare.
            pass

    # --- Step 2: garantisci colonna reparto su tasks.sqlite3 ---
    if not TASKS_DB.exists():
        print("  [087] tasks.sqlite3 non esiste, skip step 2/3")
        return

    cu = sqlite3.connect(TASKS_DB)
    try:
        cur = cu.cursor()

        # --- Step 3 (first): garantisci rinomina cucina_alert_log → task_alert_log ---
        # Ordine invertito rispetto al docstring: farlo prima semplifica il loop
        # dello step 2 (non dobbiamo preoccuparci della tabella vecchia).
        if _table_exists(cur, "cucina_alert_log") and not _table_exists(cur, "task_alert_log"):
            cur.execute("ALTER TABLE cucina_alert_log RENAME TO task_alert_log")
            print("  [087] rinominata cucina_alert_log → task_alert_log")

        toccate = 0
        for t in TABLES_REPARTO:
            # Salta le tabelle del vecchio/nuovo alert_log quando l'altra non c'e'
            if t == "cucina_alert_log" and not _table_exists(cur, t):
                continue
            if t == "task_alert_log" and not _table_exists(cur, t):
                continue
            if _add_reparto_if_missing(cur, t):
                toccate += 1

        cu.commit()
        print(f"  [087] reparto: {toccate} tabelle toccate su tasks.sqlite3")
    finally:
        cu.close()
