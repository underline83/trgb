# Modulo: banca (sub-modulo carta_credito)
"""
Migration 142 — Estende carta_match_settings con tolleranze per il match B
(estratto carta ↔ addebito mensile sul CC bancario).

Il match B è 1:1 esatto (un estratto carta = un unico bonifico/addebito sul CC),
quindi le tolleranze sono molto più strette di quelle del match A:
  - importo: ±0.10€ (solo arrotondamenti banca, normalmente match esatto)
  - data:    ±3 giorni (la valuta_addebito dichiarata vs la data effettiva su CC
                       può differire di 1-2 giorni per il ciclo banca)

ALTER TABLE idempotente: skip se la colonna esiste già.
"""

import sqlite3


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def _add_column_if_missing(cur, table: str, column: str, ddl: str) -> None:
    if not _column_exists(cur, table, column):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    _add_column_if_missing(
        cur, "carta_match_settings",
        "tolerance_cc_importo_eur", "REAL NOT NULL DEFAULT 0.10",
    )
    _add_column_if_missing(
        cur, "carta_match_settings",
        "tolerance_cc_data_days", "INTEGER NOT NULL DEFAULT 3",
    )
    conn.commit()
