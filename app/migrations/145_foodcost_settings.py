# Modulo: ricette (food cost)
"""
Migration 145 — Impostazioni food cost: finestra prezzo corrente (2026-06-08).

Problema (caso Sedano, Marco 2026-06-07): il "prezzo attuale" e il food cost
usavano l'ULTIMO prezzo in ordine di data. Un acquisto occasionale/retail
(es. "cuore di sedano" Esselunga 8,27 €/kg) scavalcava il fornitore abituale
(Milesi ~2 €/kg) e inquinava sia il KPI sia il costo delle ricette.

Soluzione scelta da Marco: prezzo corrente = MEDIANA dei prezzi degli ultimi
N giorni (default 90, configurabile). Robusto agli outlier, segue la
stagionalità. Questa migration crea la tabella di config (riga unica id=1).

Idempotente: CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS foodcost_settings (
            id                     INTEGER PRIMARY KEY CHECK (id = 1),
            prezzo_strategia       TEXT    NOT NULL DEFAULT 'mediana',
            prezzo_finestra_giorni INTEGER NOT NULL DEFAULT 90,
            updated_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
        """
    )
    cur.execute("INSERT OR IGNORE INTO foodcost_settings (id) VALUES (1)")
    conn.commit()
