#!/usr/bin/env python3
"""
Migration 014: Modulo Banca — movimenti bancari, categorie custom, cross-ref fatture

Tabelle:
- banca_movimenti: singolo movimento bancario importato da CSV Banco BPM
- banca_categorie_map: mappa categorie banca → categorie custom dell'utente
- banca_fatture_link: collegamento movimenti bancari ↔ fatture XML (pagamenti)
- banca_import_log: log degli import CSV per dedup e tracciabilità
"""


def upgrade(conn):
    cur = conn.cursor()

    # ── Log import CSV ─────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS banca_import_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            num_rows INTEGER DEFAULT 0,
            num_new INTEGER DEFAULT 0,
            num_duplicates INTEGER DEFAULT 0,
            date_from TEXT,
            date_to TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── Movimenti bancari ──────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS banca_movimenti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_id INTEGER,
            ragione_sociale TEXT,
            data_contabile TEXT NOT NULL,
            data_valuta TEXT,
            banca TEXT,
            rapporto TEXT,
            importo REAL NOT NULL,
            divisa TEXT DEFAULT 'EUR',
            descrizione TEXT,
            categoria_banca TEXT,
            sottocategoria_banca TEXT,
            hashtag TEXT,
            -- dedup key: data_contabile + importo + descrizione
            dedup_hash TEXT UNIQUE,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (import_id) REFERENCES banca_import_log(id)
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_banca_mov_data
        ON banca_movimenti(data_contabile)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_banca_mov_cat
        ON banca_movimenti(categoria_banca)
    """)

    # ── Categorie custom mapping ───────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS banca_categorie_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_banca TEXT NOT NULL,
            sottocategoria_banca TEXT,
            categoria_custom TEXT NOT NULL,
            colore TEXT DEFAULT '#6b7280',
            icona TEXT DEFAULT '📁',
            tipo TEXT DEFAULT 'uscita',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(categoria_banca, sottocategoria_banca)
        )
    """)

    # ── Cross-reference con fatture XML ────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS banca_fatture_link (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            movimento_id INTEGER NOT NULL,
            fattura_id INTEGER NOT NULL,
            tipo_match TEXT DEFAULT 'manuale',
            note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(movimento_id, fattura_id),
            FOREIGN KEY (movimento_id) REFERENCES banca_movimenti(id),
            FOREIGN KEY (fattura_id) REFERENCES fe_fatture(id)
        )
    """)

    conn.commit()
