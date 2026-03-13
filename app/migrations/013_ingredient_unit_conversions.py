#!/usr/bin/env python3
"""
Migration 013: Conversioni unità personalizzate per ingrediente

Tabella per definire equivalenze non-standard tra unità per un singolo ingrediente.
Es: 1 uovo (pz) = 60g, 1 mazzetto basilico = 30g, 1 bottiglia = 0.75L

Le conversioni standard (kg↔g↔mg, L↔ml↔cl) sono già gestite in codice.
Questa tabella copre i casi particolari.
"""

def upgrade(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingredient_unit_conversions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient_id INTEGER NOT NULL,
            from_unit TEXT NOT NULL,
            to_unit TEXT NOT NULL,
            factor REAL NOT NULL,
            note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            UNIQUE(ingredient_id, from_unit, to_unit)
        )
    """)

    conn.commit()
