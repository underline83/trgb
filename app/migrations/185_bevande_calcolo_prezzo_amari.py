# Modulo: vini (sub-modulo carta bevande) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 185 — Carta Bevande: calcolo prezzo anche su «Amari & Liquori» (2026-10-10)

Attiva il calcolo prezzo a dose (mig 183/184, bevande_prezzi_service) sulla
sezione 'amari_liquori' con gli stessi default dei distillati: incidenza 25%,
IVA 22, arrotondamento 0,50, bottiglia 70 cl, dose 4 cl. Niente dose per
tipologia né miscelati: la sezione non ha il campo tipologia.

Solo se la sezione non ha già parametri. Nessuna colonna nuova.
DB toccato: bevande.sqlite3 (NON foodcost.db). conn ricevuta non usata.
"""

import json
import sqlite3

from app.models.bevande_db import get_bevande_conn, init_bevande_db

_AMARI_185 = {
    "attivo": True,
    "incidenza_pct": 25.0,
    "iva_pct": 22.0,
    "arrotondamento": 0.5,
    "bottiglia_cl": 70.0,
    "dose_cl": 4.0,
    "dose_per_tipologia": {},
    "miscelati": {},
}


def upgrade(conn: sqlite3.Connection) -> None:
    init_bevande_db()
    bconn = get_bevande_conn()
    try:
        cur = bconn.cursor()
        cols = [r[1] for r in cur.execute("PRAGMA table_info(bevande_sezioni)").fetchall()]
        if "calcolo_prezzo" not in cols:
            print("  [185] colonna calcolo_prezzo assente (mig 183 non applicata?) — salto")
            return
        cur.execute(
            """
            UPDATE bevande_sezioni
               SET calcolo_prezzo = ?, updated_at = datetime('now','localtime')
             WHERE key = 'amari_liquori' AND (calcolo_prezzo IS NULL OR calcolo_prezzo = '')
            """,
            (json.dumps(_AMARI_185, ensure_ascii=False),),
        )
        print(f"  [185] calcolo prezzo attivato su amari_liquori: {cur.rowcount} riga/e")
        bconn.commit()
    finally:
        bconn.close()
