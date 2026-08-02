# Modulo: vini (anagrafiche) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 160 — Flag `attivo` sui distributori (2026-08-02)

Aggiunge `vini_fornitori.attivo INTEGER NOT NULL DEFAULT 1`.

PERCHE'
Marco: "così posso togliere il flag a quelli inattivi da cui non sto comprando".
In cantina restano i vini di distributori con cui non si lavora più: le loro
bottiglie continuano a comparire nella lista "da ordinare" della pagina Ordini
e sporcano la colonna dei fornitori, dove al 2026-08-02 ci sono 38 nomi.

Un flag e non una cancellazione: i vini vecchi restano collegati al loro
distributore (lo storico degli ordini deve restare leggibile) e riattivarlo è
un click, se si ricomincia a comprare.

DEFAULT 1: tutti i distributori esistenti nascono attivi. Disattivare è una
scelta esplicita di Marco, non qualcosa che decide una migrazione.

NB: `attivo` NON è denormalizzato sulle bottiglie, quindi non entra in
`FORNITORE_CAMPI_DENORMALIZZATI` (vini_anagrafiche_sync) e patcharlo non fa
partire il cascade sync — che è quello che vogliamo, visto che si cambia dalla
tabella con un click.

Idempotente: ADD COLUMN protetto da PRAGMA table_info (sqlite3 non ha
"IF NOT EXISTS" su ALTER TABLE).

DB toccato: vini_magazzino.sqlite3. La conn ricevuta dal runner non è usata.
"""

import sqlite3

from app.models.vini_magazzino_db import get_magazzino_connection


def _column_exists(cur: sqlite3.Cursor, table: str, column: str) -> bool:
    return any(r[1] == column for r in cur.execute(f"PRAGMA table_info({table})").fetchall())


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    return cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    vconn = get_magazzino_connection()
    try:
        cur = vconn.cursor()

        if not _table_exists(cur, "vini_fornitori"):
            print("  [160] vini_fornitori assente, skip")
            return

        if _column_exists(cur, "vini_fornitori", "attivo"):
            print("  [160] vini_fornitori.attivo già presente, skip")
            return

        cur.execute(
            "ALTER TABLE vini_fornitori ADD COLUMN attivo INTEGER NOT NULL DEFAULT 1"
        )
        n = cur.execute("SELECT COUNT(*) FROM vini_fornitori").fetchone()[0]
        print(f"  [160] vini_fornitori.attivo aggiunta ({n} distributori, tutti attivi)")

        vconn.commit()
    finally:
        vconn.close()
