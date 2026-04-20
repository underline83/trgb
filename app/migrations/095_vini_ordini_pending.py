"""
Migrazione 095 — Vini Widget Riordini Fase 3 (sessione 2026-04-20)

Crea la tabella `vini_ordini_pending` nel DB separato
`app/data/vini_magazzino.sqlite3`.

Scopo: tracciare gli ordini aperti (un record per vino, UNIQUE su vino_id).
Popola la colonna "Riordino" del widget "📦 Riordini per fornitore" nella
DashboardVini. Quando arriva la merce, il record viene cancellato e al suo
posto si registra un movimento CARICO standard (vedi Fase 5).

Il lavoro pesante è in `app.models.vini_magazzino_db.init_magazzino_database`
che è idempotente (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).
Questa migration è solo un trigger + log.

Riferimento design: docs/modulo_vini_riordini.md §3.1
DB: app/data/vini_magazzino.sqlite3 (pattern notifiche/bevande,
    isolato da foodcost.db).
"""

import sqlite3

from app.models.vini_magazzino_db import (
    DB_MAG_PATH as VINI_MAG_DB,
    init_magazzino_database,
    get_magazzino_connection,
)


def upgrade(conn: sqlite3.Connection) -> None:
    """
    Trigger idempotente su vini_magazzino.sqlite3.
    Non tocca foodcost.db (riceve conn ma non la usa).
    """
    existed = VINI_MAG_DB.exists()

    # init è idempotente: crea tutte le tabelle del magazzino se mancano,
    # inclusa la nuova vini_ordini_pending.
    init_magazzino_database()

    # Verifica che la tabella target esista davvero dopo l'init.
    mag_conn = get_magazzino_connection()
    try:
        cur = mag_conn.cursor()
        row = cur.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='vini_ordini_pending';"
        ).fetchone()
        if row is None:
            raise RuntimeError(
                "[095] Tabella vini_ordini_pending NON creata — "
                "init_magazzino_database non ha funzionato come previsto."
            )

        # Verifica che il vincolo UNIQUE su vino_id sia presente
        idx_rows = cur.execute(
            "PRAGMA index_list('vini_ordini_pending');"
        ).fetchall()
        has_unique = any(bool(r[2]) for r in idx_rows)  # col 2 = unique flag

        n_righe = cur.execute(
            "SELECT COUNT(*) FROM vini_ordini_pending;"
        ).fetchone()[0]
    finally:
        mag_conn.close()

    if not existed:
        print(f"  [095] vini_magazzino.sqlite3 creato → {VINI_MAG_DB.name}")
    print(f"  [095] vini_ordini_pending pronta (unique_on_vino_id={has_unique}, righe={n_righe})")
