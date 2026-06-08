# Modulo: cassa
"""
Migrazione 146 — Scontrini annullati / resi (2026-06-09).

Problema (caso cena 8/6/2026, Marco): uno scontrino battuto e poi ANNULLATO
resta dentro il totale fiscale del registratore (Chiusura RT), ma nessun
metodo di incasso lo copre perché i soldi non sono mai entrati. Conseguenze:
  1. Quadratura fine turno → ammanco fittizio pari allo scontrino annullato
     (caso 8/6: saldo −460,00 € = scontrino annullato 460 €).
  2. Contanti da versare → sovrastima (contanti_fiscali = corrispettivi −
     elettronici, e i corrispettivi includono l'annullato).

Soluzione scelta da Marco: campo dedicato `annulli_resi` sulla chiusura,
sottratto dal giustificato (quadratura) e dal corrispettivo (contanti fiscali).

Questa migrazione aggiunge la colonna `annulli_resi REAL DEFAULT 0` a:
  - shift_closures  (fine turno)
  - daily_closures  (import Excel corrispettivi)
entrambe in admin_finance.sqlite3.

Idempotente: PRAGMA table_info check prima di ALTER (stile 088).
Colonna nullable con DEFAULT 0 → niente violazioni integrity_check su righe
esistenti (vedi feedback_sqlite_alter_add_column_not_null).

DB: locali/<locale>/data/admin_finance.sqlite3
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
ADMIN_FINANCE_DB = locale_data_path("admin_finance.sqlite3")

TABLES = ["shift_closures", "daily_closures"]


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
    """Aggiunge annulli_resi su shift_closures e daily_closures."""
    if not ADMIN_FINANCE_DB.exists():
        print("  [146] admin_finance.sqlite3 non esiste, skip")
        return

    cu = sqlite3.connect(ADMIN_FINANCE_DB)
    try:
        cur = cu.cursor()
        toccate = 0

        for table in TABLES:
            if not _table_exists(cur, table):
                continue
            if _has_column(cur, table, "annulli_resi"):
                continue
            cur.execute(
                f"ALTER TABLE {table} ADD COLUMN annulli_resi REAL DEFAULT 0"
            )
            toccate += 1

        cu.commit()
        print(f"  [146] annulli_resi: {toccate} tabelle toccate su admin_finance.sqlite3")
    finally:
        cu.close()
