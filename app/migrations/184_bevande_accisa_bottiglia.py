# Modulo: vini (sub-modulo carta bevande) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 184 — Carta Bevande: accisa per bottiglia (2026-10-10)

Il fornitore mette l'accisa su una riga separata della fattura, sotto la
bottiglia. Invece di sommarla a mano al costo, si inserisce nel suo campo:

- accisa_bottiglia REAL → accisa della bottiglia in € (riga «Accisa» della
                          fattura). Il calcolo usa costo_bottiglia + accisa.

Riservato come costo_bottiglia: mai in carta. Solo ADD COLUMN, idempotente.
DB toccato: bevande.sqlite3 (NON foodcost.db). conn ricevuta non usata.
"""

import sqlite3

from app.models.bevande_db import get_bevande_conn, init_bevande_db


def upgrade(conn: sqlite3.Connection) -> None:
    init_bevande_db()
    bconn = get_bevande_conn()
    try:
        cur = bconn.cursor()
        cols = [r[1] for r in cur.execute("PRAGMA table_info(bevande_voci)").fetchall()]
        if "accisa_bottiglia" not in cols:
            cur.execute("ALTER TABLE bevande_voci ADD COLUMN accisa_bottiglia REAL")
            print("  [184] bevande_voci.accisa_bottiglia aggiunta")
        else:
            print("  [184] bevande_voci.accisa_bottiglia già presente, skip")
        bconn.commit()
    finally:
        bconn.close()
