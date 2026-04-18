"""
Migrazione 089 — Inizializzazione Carta Bevande (sessione 2026-04-19)

Crea il DB separato app/data/bevande.sqlite3 con:
- bevande_sezioni  (8 sezioni seed: aperitivi, birre, vini, amari_casa,
                    amari_liquori, distillati, tisane, te)
- bevande_voci     (tabella piatta per tutte le voci, indicizzata per sezione)

Il lavoro pesante è in app/models/bevande_db.py (init_bevande_db + seed).
Questa migration è solo un trigger idempotente + log.

Riferimento design: docs/carta_bevande_design.md
DB: app/data/bevande.sqlite3 (isolato da foodcost.db, pattern notifiche.sqlite3).
"""

import sqlite3

from app.models.bevande_db import (
    DB_PATH as BEVANDE_DB,
    init_bevande_db,
    list_sezioni,
)


def upgrade(conn: sqlite3.Connection) -> None:
    """Crea tabelle e seed sezioni. Non tocca foodcost.db (riceve conn ma non la usa)."""
    existed = BEVANDE_DB.exists()

    # init è idempotente: CREATE IF NOT EXISTS + seed con check di esistenza
    init_bevande_db()

    sezioni = list_sezioni()
    if not existed:
        print(f"  [089] bevande.sqlite3 creato → {BEVANDE_DB.name}")
    print(f"  [089] sezioni presenti: {len(sezioni)}")
    for s in sezioni:
        print(f"         - {s['ordine']:3d} {s['key']:<15} layout={s['layout']}")
