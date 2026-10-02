# Modulo: banca (sub-modulo carta_credito)
"""
Migration 178 — Tolleranza "commissione" per il match carta ↔ uscita CG.

## Perché

I pagamenti con carta via PagoPA (rate Abaco, tributi) addebitano la rata più
una commissione: rata 211,00 € → movimento carta 211,95 €. Con la sola
`tolerance_importo_eur` (0,50 €, simmetrica) il matcher non li proponeva mai.

`tolerance_commissione_eur`: scarto massimo IN ECCESSO (movimento carta >
uscita) accettato come commissione. Solo in eccesso: una carta che addebita
MENO del documento non è una commissione.

Colonna nullable + backfill esplicito (ADD COLUMN NOT NULL DEFAULT non popola
le righe esistenti in modo affidabile su SQLite).
"""

import sqlite3

TOLLERANZA_COMMISSIONE_DEFAULT = 2.00


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    try:
        exists = _column_exists(cur, "carta_match_settings", "tolerance_commissione_eur")
    except sqlite3.OperationalError:
        return  # tabella assente: il service usa i DEFAULTS
    if not exists:
        cur.execute(
            "ALTER TABLE carta_match_settings ADD COLUMN tolerance_commissione_eur REAL"
        )
        print("  + carta_match_settings.tolerance_commissione_eur")
    cur.execute(
        "UPDATE carta_match_settings SET tolerance_commissione_eur = ? "
        "WHERE tolerance_commissione_eur IS NULL",
        (TOLLERANZA_COMMISSIONE_DEFAULT,),
    )
    conn.commit()
