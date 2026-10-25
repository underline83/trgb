# Modulo: cucina (sub-modulo pranzo) — letto dal food cost (modulo ricette)
"""
Migration 212 — Valore di vendita del piatto del pranzo per il food cost.

## Perché

I piatti del pranzo di lavoro (tipo servizio «Pranzo di lavoro») non hanno un
prezzo proprio: il cliente paga il Menù Business (1/2/3 portate). Il food cost
di questi piatti risultava «n/d» (112 piatti attivi, quasi tutti senza prezzo).
Decisione Marco 2026-10-25: a ogni piatto del pranzo si attribuisce un valore
di vendita fisso (default 10 €), configurabile in Impostazioni → Menu Pranzo;
il resto del prezzo del menu copre le altre spese. Se il piatto ha un prezzo
suo (es. sta anche in carta) vince quello; il food cost «pranzo» si mostra in
più solo nella scheda ricetta.

## Cosa fa

ADD COLUMN `pranzo_settings.valore_piatto_fc REAL` e la valorizza a 10.0 sulla
riga id=1 se è NULL. Idempotente: se la colonna c'è già non fa niente.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    exists = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pranzo_settings'"
    ).fetchone()
    if not exists:
        # Tabella creata più avanti da pranzo_repository._ensure_schema,
        # che ha già la colonna nello schema.
        return
    cols = {r[1] for r in cur.execute("PRAGMA table_info(pranzo_settings)").fetchall()}
    if "valore_piatto_fc" not in cols:
        cur.execute("ALTER TABLE pranzo_settings ADD COLUMN valore_piatto_fc REAL")
    cur.execute(
        "UPDATE pranzo_settings SET valore_piatto_fc = 10.0 WHERE id = 1 AND valore_piatto_fc IS NULL"
    )
    print("  = pranzo_settings.valore_piatto_fc pronta (default 10 €)")
    conn.commit()
