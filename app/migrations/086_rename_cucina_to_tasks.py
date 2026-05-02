"""
Migrazione 086 — Rename modulo Cucina → Task Manager (Phase B, sessione 46)

1. Rinomina il file DB: app/data/cucina.sqlite3 → app/data/tasks.sqlite3
   (shutil.move, solo se sorgente esiste e destinazione non esiste)
2. Rinomina la tabella cucina_alert_log → task_alert_log (scaffold V1)

Idempotente: rilanciabile senza errore.
Pattern di riferimento: 085_reparto_task.py.

DB: app/data/tasks.sqlite3 (dopo la migrazione).
"""

import shutil
import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
CUCINA_DB = locale_data_path("cucina.sqlite3")
TASKS_DB = locale_data_path("tasks.sqlite3")


def _table_exists(cur: sqlite3.Cursor, table: str) -> bool:
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    """Riceve conn di foodcost.db dal runner ma lavora sul DB dedicato Tasks."""
    # Step 1: rename file DB se presente solo quello vecchio
    if CUCINA_DB.exists() and not TASKS_DB.exists():
        # Muovi anche eventuali sidecar WAL/SHM, se presenti
        shutil.move(str(CUCINA_DB), str(TASKS_DB))
        for suffix in ("-wal", "-shm", ".prev"):
            sidecar_old = DATA_DIR / f"cucina.sqlite3{suffix}"
            sidecar_new = DATA_DIR / f"tasks.sqlite3{suffix}"
            if sidecar_old.exists() and not sidecar_new.exists():
                shutil.move(str(sidecar_old), str(sidecar_new))
        print("  [086] rinominato cucina.sqlite3 → tasks.sqlite3")
    elif CUCINA_DB.exists() and TASKS_DB.exists():
        # Entrambi presenti: situazione anomala (doppio run concorrente?).
        # Rispetta la nuova canonical form (tasks.sqlite3) e non sovrascrive.
        print("  [086] warning: sia cucina.sqlite3 che tasks.sqlite3 esistono — mantengo tasks.sqlite3 come canonical")
    else:
        # Solo tasks.sqlite3 o nessuno dei due: nulla da spostare.
        pass

    # Step 2: rename tabella (solo se tasks.sqlite3 esiste)
    if not TASKS_DB.exists():
        print("  [086] tasks.sqlite3 non esiste ancora, skip rename tabella (sara' creata da init_tasks_db)")
        return

    cu = sqlite3.connect(TASKS_DB)
    try:
        cur = cu.cursor()
        has_old = _table_exists(cur, "cucina_alert_log")
        has_new = _table_exists(cur, "task_alert_log")
        if has_old and not has_new:
            cur.execute("ALTER TABLE cucina_alert_log RENAME TO task_alert_log")
            cu.commit()
            # Indici: i vecchi idx_cucina_alert_log_* restano col vecchio nome,
            # SQLite li mantiene associati alla tabella rinominata senza problemi.
            print("  [086] rinominata tabella cucina_alert_log → task_alert_log")
        elif has_old and has_new:
            # Entrambe: edge case (errore manuale). Meglio non auto-fondere:
            # segnala e non fa nulla. Marco puo' decidere a mano.
            print("  [086] warning: entrambe cucina_alert_log e task_alert_log esistono — skip")
        else:
            # Solo la nuova o nessuna: nulla da fare.
            pass
    finally:
        cu.close()
