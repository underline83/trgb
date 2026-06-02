# Modulo: banca (sub-modulo carta_credito)
"""
Migration 141 — Tabella settings per il matching carta ↔ uscite CG.

Singleton table (1 sola riga, id=1 sempre). Contiene:
  - tolerance_importo_eur     pre-filter: |totale_uscita − importo_mov| < tol
  - tolerance_data_days       pre-filter: |data_pagamento − data_carta| < tol
  - weight_importo / data / fornitore   pesi del score finale (somma = 1.0)
  - auto_apply_threshold      soglia sopra la quale la checkbox del modale
                              auto-match è spuntata di default

Default coerenti con il primo design CC.4 (2026-06-02). Modificabili in
futuro da UI (CC.4.e) o direttamente via SQL.

Razionale: vietato hardcodare soglie operative. Il match service legge la
riga al primo accesso (o ritorna default in codice se per qualche motivo la
tabella è vuota — fallback safety).
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS carta_match_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            tolerance_importo_eur REAL NOT NULL DEFAULT 0.50,
            tolerance_data_days   INTEGER NOT NULL DEFAULT 10,
            weight_importo        REAL NOT NULL DEFAULT 0.50,
            weight_data           REAL NOT NULL DEFAULT 0.30,
            weight_fornitore      REAL NOT NULL DEFAULT 0.20,
            auto_apply_threshold  REAL NOT NULL DEFAULT 0.85,
            updated_at TEXT DEFAULT (datetime('now')),
            updated_by TEXT
        )
    """)
    # Singleton: assicura riga id=1 (idempotente)
    cur.execute("""
        INSERT OR IGNORE INTO carta_match_settings (id) VALUES (1)
    """)
    conn.commit()
