# Modulo: banca
"""
Migration 140 — Schema modulo Carta di Credito

Aggiunge:
1. Tabella `carte_credito` — anagrafica multi-carta (oggi 1 carta, predisposto N).
2. Tabella `carta_estratti` — un record per PDF estratto importato.
3. Colonne carta-specifiche su `banca_movimenti` (ALTER TABLE idempotenti):
     carta_codice_riferimento, carta_mcc, carta_estratto_id,
     valuta_estera, importo_estero, cambio_valuta,
     magg_circuito, magg_cambio
4. Indici per dedup e per le query carta.

Convenzione storage: i movimenti carta vivono dentro `banca_movimenti`
(decisione architetturale 2026-06-02) con `banca = 'CARTA_<EMITT>_<ULT3>'`
(es. `CARTA_BPM_623`) e `rapporto = <codice_posizione>` (es. `9000856980`).
Vanno esclusi dal saldo CC via `WHERE banca NOT LIKE 'CARTA_%'`.

Razionale del riuso (vs nuova tabella `carta_movimenti`):
- Schema banca_movimenti già coperto per ~95% dei campi necessari.
- Riconciliazione (banca_fatture_link, riconciliazione_chiusa) gratis.
- Worklist unica matching uscite ↔ pagamenti.
- Le colonne carta-specifiche sono NULL per i movimenti bancari normali, OK.

Vedi anche: app/services/carta_pdf_parser.py (parsing PDF Banco BPM).
"""

import sqlite3


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def _add_column_if_missing(cur, table: str, column: str, ddl: str) -> None:
    """ALTER TABLE ADD COLUMN idempotente. Skip silenzioso se la colonna esiste."""
    if not _column_exists(cur, table, column):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()

    # ─────────────────────────────────────────────────────────────────
    # 1. Anagrafica carte di credito (multi-carta ready)
    # ─────────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS carte_credito (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL,                       -- "Banco BPM Marco *623"
            emittente TEXT,                               -- "BANCO BPM"
            codice_posizione TEXT NOT NULL UNIQUE,        -- PK funzionale lato emittente
            carta_numero_mask TEXT,                       -- "5534 35** **** *623"
            ultime_visibili TEXT,                         -- "623"
            intestatario TEXT,                            -- "CARMINATI MARCO"
            titolare TEXT,                                -- "TRE GOBBI S.R.L."
            codice_titolare TEXT,
            cc_addebito TEXT,                             -- CC su cui addebita l'estratto
            abi TEXT,
            cab TEXT,
            piva TEXT,
            limite_utilizzo REAL,
            -- nome "banca" usato in banca_movimenti.banca per questi movimenti
            -- es. "CARTA_BPM_623" — usato in query saldo per ESCLUDERE la carta
            banca_tag TEXT NOT NULL UNIQUE,
            attiva INTEGER NOT NULL DEFAULT 1,
            note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_carte_credito_attiva ON carte_credito(attiva)"
    )

    # ─────────────────────────────────────────────────────────────────
    # 2. Estratti carta (un record per PDF importato)
    # ─────────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS carta_estratti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            carta_id INTEGER NOT NULL,
            data_chiusura TEXT NOT NULL,                  -- ISO YYYY-MM-DD
            data_valuta_addebito TEXT,                    -- ISO — data dell'addebito sul CC
            debito_residuo_precedente REAL DEFAULT 0,
            totale_addebitato_precedente REAL DEFAULT 0,
            totale_movimenti REAL NOT NULL,               -- somma dettaglio operazioni
            imposta_bollo REAL DEFAULT 0,
            spese_invio REAL DEFAULT 0,
            addebito_totale_cc REAL NOT NULL,             -- = ADDEBITO IN CONTO CORRENTE
            -- Match livello B: addebito mensile sul CC bancario
            banca_movimento_id INTEGER,                   -- FK banca_movimenti, NULL = non matchato
            -- Metadati PDF
            pdf_filename TEXT,
            pdf_sha256 TEXT UNIQUE,                       -- dedup su contenuto file
            n_movimenti INTEGER DEFAULT 0,
            quadra INTEGER DEFAULT 1,                     -- 0/1 sanity check chiusura
            warnings TEXT,                                -- JSON array di warning del parser
            imported_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (carta_id) REFERENCES carte_credito(id),
            FOREIGN KEY (banca_movimento_id) REFERENCES banca_movimenti(id)
        )
    """)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_carta_estratti_carta ON carta_estratti(carta_id, data_chiusura DESC)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_carta_estratti_valuta ON carta_estratti(data_valuta_addebito)"
    )

    # ─────────────────────────────────────────────────────────────────
    # 3. Estensione banca_movimenti con campi carta-specifici
    # ─────────────────────────────────────────────────────────────────
    # codice_riferimento (23 cifre BPM) — dedup naturale, UNIQUE quando non-NULL
    _add_column_if_missing(cur, "banca_movimenti", "carta_codice_riferimento", "TEXT")
    # MCC merchant category code (8 cifre BPM — i primi 4 sono la categoria standard)
    _add_column_if_missing(cur, "banca_movimenti", "carta_mcc", "TEXT")
    # FK estratto carta di appartenenza (NULL per movimenti bancari normali)
    _add_column_if_missing(cur, "banca_movimenti", "carta_estratto_id", "INTEGER")
    # Valuta estera + cambio (per movimenti USD/GBP/CHF/etc — NULL per EUR)
    _add_column_if_missing(cur, "banca_movimenti", "valuta_estera", "TEXT")
    _add_column_if_missing(cur, "banca_movimenti", "importo_estero", "REAL")
    _add_column_if_missing(cur, "banca_movimenti", "cambio_valuta", "REAL")
    _add_column_if_missing(cur, "banca_movimenti", "magg_circuito", "REAL")
    _add_column_if_missing(cur, "banca_movimenti", "magg_cambio", "REAL")

    # Indici per le query carta (idempotenti)
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_banca_mov_carta_rif "
        "ON banca_movimenti(carta_codice_riferimento) "
        "WHERE carta_codice_riferimento IS NOT NULL"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_banca_mov_carta_estratto "
        "ON banca_movimenti(carta_estratto_id) "
        "WHERE carta_estratto_id IS NOT NULL"
    )

    conn.commit()
