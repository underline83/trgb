# Modulo: vini (sub-modulo carta bevande) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 183 — Carta Bevande: calcolo prezzo a dose dal costo bottiglia (2026-10-10)

Su bevande_voci (DB separato bevande.sqlite3) tre colonne nuove:
- costo_bottiglia REAL → costo della bottiglia in €, IVA esclusa (accisa compresa,
                         è già nel prezzo del fornitore). Riservato: mai in carta.
- bottiglia_cl    REAL → contenuto in cl; NULL = default della sezione (70).
- dose_cl         REAL → dose servita in cl; NULL = default tipologia/sezione.

Su bevande_sezioni:
- calcolo_prezzo  TEXT → JSON parametri (incidenza obiettivo, IVA, arrotondamento,
                         formato e dose di default, dosi per tipologia, miscelati).

Attiva il calcolo sulla sezione 'distillati' con i parametri di default (25% di
incidenza, IVA 22, arrotondamento 0,50, 70 cl, 4 cl) e il G&T come miscelato del
Gin (5 cl, costo tonica da impostare dalla UI). Solo se la sezione non ha già
parametri: rieseguire non sovrascrive quelli scelti da Marco.

Idempotente: ADD COLUMN protetto da PRAGMA table_info. Solo ADD COLUMN.
DB toccato: bevande.sqlite3 (NON foodcost.db). conn ricevuta non usata.
Logica di calcolo: app/services/bevande_prezzi_service.py
"""

import json
import sqlite3

from app.models.bevande_db import get_bevande_conn, init_bevande_db


def _column_exists(cur: sqlite3.Cursor, table: str, column: str) -> bool:
    return any(r[1] == column for r in cur.execute(f"PRAGMA table_info({table})").fetchall())


_COLONNE = [
    ("bevande_voci", "costo_bottiglia", "REAL"),
    ("bevande_voci", "bottiglia_cl", "REAL"),
    ("bevande_voci", "dose_cl", "REAL"),
    ("bevande_sezioni", "calcolo_prezzo", "TEXT"),
]

# Copia esplicita: questa migrazione resta il punto di verità di "com'era a 183".
_DISTILLATI_183 = {
    "attivo": True,
    "incidenza_pct": 25.0,
    "iva_pct": 22.0,
    "arrotondamento": 0.5,
    "bottiglia_cl": 70.0,
    "dose_cl": 4.0,
    "dose_per_tipologia": {},
    "miscelati": {"Gin": {"etichetta": "G&T", "dose_cl": 5.0, "costo_extra": 0.0}},
}


def upgrade(conn: sqlite3.Connection) -> None:
    init_bevande_db()
    bconn = get_bevande_conn()
    try:
        cur = bconn.cursor()
        for table, col, tipo in _COLONNE:
            if not _column_exists(cur, table, col):
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {tipo}")
                print(f"  [183] {table}.{col} aggiunta")
            else:
                print(f"  [183] {table}.{col} già presente, skip")

        cur.execute(
            """
            UPDATE bevande_sezioni
               SET calcolo_prezzo = ?, updated_at = datetime('now','localtime')
             WHERE key = 'distillati' AND (calcolo_prezzo IS NULL OR calcolo_prezzo = '')
            """,
            (json.dumps(_DISTILLATI_183, ensure_ascii=False),),
        )
        print(f"  [183] calcolo prezzo attivato su distillati: {cur.rowcount} riga/e")
        bconn.commit()
    finally:
        bconn.close()
