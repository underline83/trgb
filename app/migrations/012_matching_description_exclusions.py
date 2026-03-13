#!/usr/bin/env python3
"""
Migration 012: Tabelle per esclusione descrizioni dal matching

- matching_description_exclusions: descrizioni normalizzate da ignorare (es. "Trasporto", "Costi Spedizione")
- matching_ignored_righe: singole righe fattura marcate come ignorate (per filtro veloce in SQL)
"""

def upgrade(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS matching_description_exclusions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descrizione_normalizzata TEXT NOT NULL UNIQUE,
            raw_examples TEXT,
            motivo TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS matching_ignored_righe (
            riga_id INTEGER PRIMARY KEY,
            exclusion_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (exclusion_id) REFERENCES matching_description_exclusions(id)
        )
    """)

    conn.commit()
