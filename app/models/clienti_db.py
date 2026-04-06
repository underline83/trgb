# @version: v1.2-clienti-db
# -*- coding: utf-8 -*-
"""
Database Clienti — TRGB Gestionale (modulo CRM)

Contiene:
- Tabella clienti (anagrafica importata da TheFork + campi extra CRM)
- Tabella clienti_tag (categorie personalizzabili: VIP, abituale, ecc.)
- Tabella clienti_tag_assoc (associazione many-to-many cliente ↔ tag, con flag auto/manuale)
- Tabella clienti_note (diario interazioni: telefonate, preferenze, eventi)
- Tabella clienti_prenotazioni (storico prenotazioni da TheFork)
- Tabella clienti_alias (merge duplicati: mappa thefork_id secondari al cliente principale)
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # .../trgb/
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "clienti.sqlite3"


def get_clienti_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_clienti_db() -> None:
    """
    Inizializza il DB clienti.
    Crea le tabelle con IF NOT EXISTS per sicurezza su DB nuovi e vecchi.
    """
    conn = get_clienti_conn()
    cur = conn.cursor()

    # ── TABELLA CLIENTI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            thefork_id      TEXT UNIQUE,

            -- Anagrafica
            titolo          TEXT,
            nome            TEXT NOT NULL,
            cognome         TEXT NOT NULL,
            email           TEXT,
            telefono        TEXT,
            telefono2       TEXT,
            data_nascita    TEXT,
            lingua          TEXT DEFAULT 'it_IT',

            -- Indirizzo
            indirizzo       TEXT,
            cap             TEXT,
            citta           TEXT,
            paese           TEXT DEFAULT 'Italy',

            -- CRM
            vip             INTEGER NOT NULL DEFAULT 0,
            rank            TEXT,
            promoter        INTEGER NOT NULL DEFAULT 0,
            newsletter      INTEGER NOT NULL DEFAULT 0,
            risk_level      TEXT,
            spending_behaviour REAL,

            -- Preferenze ristorante
            pref_cibo       TEXT,
            pref_bevande    TEXT,
            pref_posto      TEXT,
            restrizioni_dietetiche TEXT,
            allergie        TEXT,

            -- Note generali (importate da TheFork)
            note_thefork    TEXT,

            -- Stato
            attivo          INTEGER NOT NULL DEFAULT 1,
            origine         TEXT DEFAULT 'thefork',

            -- Date
            thefork_created TEXT,
            thefork_updated TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # Trigger per aggiornare updated_at
    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS clienti_update_ts
        AFTER UPDATE ON clienti
        FOR EACH ROW
        BEGIN
          UPDATE clienti
          SET updated_at = datetime('now','localtime')
          WHERE id = OLD.id;
        END
    """)

    # ── TABELLA TAG (categorie personalizzabili) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_tag (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            nome    TEXT NOT NULL UNIQUE,
            colore  TEXT NOT NULL DEFAULT '#0d9488',
            ordine  INTEGER NOT NULL DEFAULT 0
        )
    """)

    # Tag di default
    cur.execute("""
        INSERT OR IGNORE INTO clienti_tag (nome, colore, ordine) VALUES
        ('VIP',        '#7c3aed', 1),
        ('Abituale',   '#0d9488', 2),
        ('Occasionale','#6b7280', 3),
        ('Aziendale',  '#2563eb', 4),
        ('Turista',    '#d97706', 5),
        ('Stampa',     '#dc2626', 6),
        ('Amico',      '#059669', 7)
    """)

    # ── ASSOCIAZIONE CLIENTE ↔ TAG ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_tag_assoc (
            cliente_id  INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            tag_id      INTEGER NOT NULL REFERENCES clienti_tag(id) ON DELETE CASCADE,
            PRIMARY KEY (cliente_id, tag_id)
        )
    """)

    # ── DIARIO NOTE / INTERAZIONI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_note (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id  INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            tipo        TEXT NOT NULL DEFAULT 'nota',
            testo       TEXT NOT NULL,
            data        TEXT NOT NULL DEFAULT (date('now','localtime')),
            autore      TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── PRENOTAZIONI (storico TheFork) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_prenotazioni (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id      INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
            thefork_customer_id TEXT,
            thefork_booking_id  TEXT UNIQUE,

            -- Dettagli prenotazione
            data_pasto      TEXT NOT NULL,
            ora_pasto       TEXT,
            stato           TEXT NOT NULL,
            pax             INTEGER NOT NULL DEFAULT 2,
            tavolo          TEXT,
            canale          TEXT,
            occasione       TEXT,

            -- Note
            nota_ristorante TEXT,
            nota_cliente    TEXT,

            -- Booking info
            data_prenotazione TEXT,
            prenotato_da    TEXT,

            -- Economico
            importo_conto   TEXT,
            sconto          REAL,
            menu_preset     TEXT,
            offerta_speciale INTEGER DEFAULT 0,

            -- Yums / Imprint
            yums            INTEGER DEFAULT 0,
            imprint         INTEGER DEFAULT 0,
            importo_imprint TEXT,

            -- Risposte form personalizzati
            degustazione    TEXT,
            allergie_segnalate TEXT,
            tavolo_esterno  INTEGER DEFAULT 0,
            seggioloni      TEXT,

            -- Waiting list / walk-in
            waiting_list    INTEGER DEFAULT 0,

            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── ALIAS per merge duplicati ──
    # Quando mergiamo due clienti, il thefork_id del "secondario" finisce qui
    # così l'import TheFork continua a riconoscere entrambi gli ID
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_alias (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id      INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            thefork_id      TEXT NOT NULL UNIQUE,
            merged_from_id  INTEGER,
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── ESCLUSIONI DUPLICATI ──
    # Coppie di clienti che l'utente ha esplicitamente marcato come "non duplicati"
    # (es. marito e moglie con stesso telefono)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_no_duplicato (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_a   INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            cliente_b   INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            motivo      TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(cliente_a, cliente_b)
        )
    """)

    # ── ALTER TABLE sicuri per DB esistenti ──

    # Campo 'protetto' su clienti: se 1, l'import TheFork NON sovrascrive i campi anagrafica
    try:
        cur.execute("ALTER TABLE clienti ADD COLUMN protetto INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # colonna già esistente

    # Campo 'auto' su clienti_tag_assoc: 0=manuale (CRM), 1=automatico (import)
    # I tag manuali NON vengono toccati dall'import
    try:
        cur.execute("ALTER TABLE clienti_tag_assoc ADD COLUMN auto INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # colonna già esistente

    # ── INDICI ──
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_cognome ON clienti(cognome)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_telefono ON clienti(telefono)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_email ON clienti(email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_vip ON clienti(vip)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_nascita ON clienti(data_nascita)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_thefork ON clienti(thefork_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_note_cliente ON clienti_note(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_tag_assoc_cliente ON clienti_tag_assoc(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_tag_assoc_tag ON clienti_tag_assoc(tag_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_cliente ON clienti_prenotazioni(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_data ON clienti_prenotazioni(data_pasto)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_stato ON clienti_prenotazioni(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_thefork_cust ON clienti_prenotazioni(thefork_customer_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_thefork_book ON clienti_prenotazioni(thefork_booking_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alias_cliente ON clienti_alias(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alias_thefork ON clienti_alias(thefork_id)")

    conn.commit()
    conn.close()
