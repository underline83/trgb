"""
Migrazione 085 — Phase A multi-reparto (sessione 45)

Aggiunge il campo `reparto` (lowercase) alle tabelle del modulo Cucina che
ancora non lo hanno: checklist_instance, task_singolo, cucina_alert_log.
Su checklist_template la colonna esiste gia' dalla 084 (default 'CUCINA'
maiuscolo) — qui la normalizza a lowercase.

Idempotente: rilanciabile senza errori. Ogni step verifica con PRAGMA.

DB: app/data/cucina.sqlite3 (separato da foodcost.db).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware (cucina.sqlite3 storico, rinominato a tasks.sqlite3 da mig 086)
CUCINA_DB = locale_data_path("cucina.sqlite3")

# Tabelle target. Ordine importante per la print finale (devono esistere).
TABLES = ["checklist_template", "checklist_instance", "task_singolo", "cucina_alert_log"]


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
    """Riceve conn di foodcost.db dal runner ma lavora su cucina.sqlite3."""
    if not CUCINA_DB.exists():
        print("  [085] cucina.sqlite3 non esiste, skip")
        return

    cu = sqlite3.connect(CUCINA_DB)
    try:
        cur = cu.cursor()
        toccate = 0
        for t in TABLES:
            if not _table_exists(cur, t):
                print(f"  [085] tabella {t} assente, skip")
                continue

            if _has_column(cur, t, "reparto"):
                # Colonna gia' presente: normalizza i valori esistenti a lowercase.
                # I template seed della 084 hanno 'CUCINA'/'BAR'/'SALA' maiuscoli;
                # da Phase A in poi usiamo solo lowercase per coerenza con la
                # config FE (REPARTI key minuscole).
                cur.execute(
                    f"UPDATE {t} "
                    f"   SET reparto = LOWER(reparto) "
                    f" WHERE reparto IS NOT NULL "
                    f"   AND reparto != LOWER(reparto)"
                )
            else:
                cur.execute(
                    f"ALTER TABLE {t} "
                    f"ADD COLUMN reparto TEXT NOT NULL DEFAULT 'cucina'"
                )

            cur.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{t}_reparto ON {t}(reparto)"
            )
            toccate += 1

        cu.commit()
        print(f"  [085] aggiunto campo reparto a {toccate} tabelle")
    finally:
        cu.close()
