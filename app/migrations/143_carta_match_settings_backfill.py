# Modulo: banca (sub-modulo carta_credito)
"""
Migration 143 — Safety net per backfill carta_match_settings.

Fix retroattivo del problema causato dalla mig 142 (2026-06-02 notte):
ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT X non popola le righe esistenti
in SQLite — le lascia NULL, violando il vincolo NOT NULL → integrity_check
fallisce. Sul VPS Tre Gobbi è stato fixato manualmente; questa migration
copre qualunque altro deploy (locale nuovo, staging) dove mig 142 girerebbe
di nuovo.

Idempotente: COALESCE non sovrascrive valori già popolati. No-op su VPS già
fixato.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    # Verifica che la tabella esista (potrebbe essere assente in stato strano)
    exists = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='carta_match_settings'"
    ).fetchone()
    if not exists:
        return

    # Backfill idempotente — COALESCE mantiene i valori già non-NULL
    cur.execute("""
        UPDATE carta_match_settings
        SET tolerance_cc_importo_eur = COALESCE(tolerance_cc_importo_eur, 0.10),
            tolerance_cc_data_days   = COALESCE(tolerance_cc_data_days, 3)
        WHERE id = 1
    """)
    conn.commit()
