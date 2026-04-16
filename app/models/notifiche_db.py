# @version: v1.0-notifiche-db
# -*- coding: utf-8 -*-
"""
Database Notifiche — TRGB Gestionale (mattone M.A)

Contiene:
- Tabella notifiche (notifiche automatiche dal sistema + broadcast admin)
- Tabella notifiche_lettura (tracciamento lettura per utente)
- Tabella comunicazioni (bacheca ordini di servizio admin → staff)

DB separato: app/data/notifiche.sqlite3
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # .../trgb/
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "notifiche.sqlite3"


def get_notifiche_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_notifiche_db() -> None:
    """
    Inizializza il DB notifiche.
    Crea le tabelle con IF NOT EXISTS per sicurezza.
    """
    conn = get_notifiche_conn()
    cur = conn.cursor()

    # ── TABELLA NOTIFICHE ──
    # Notifiche automatiche generate dal sistema (preventivo confermato, scadenza, ecc.)
    # Ogni notifica ha un tipo (modulo sorgente), un link per navigare al contesto,
    # e puo' essere destinata a un utente specifico o a un ruolo intero.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notifiche (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,

            -- Destinatario: uno dei due (o entrambi)
            dest_username   TEXT,
            dest_ruolo      TEXT,

            -- Contenuto
            tipo            TEXT NOT NULL DEFAULT 'sistema',
            titolo          TEXT NOT NULL,
            messaggio       TEXT,
            link            TEXT,
            icona           TEXT,
            urgenza         TEXT NOT NULL DEFAULT 'normale',

            -- Sorgente (modulo che ha generato la notifica)
            modulo          TEXT,
            entity_id       INTEGER,

            -- Meta
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            scadenza        TEXT
        )
    """)

    # ── TABELLA LETTURA ──
    # Traccia quale utente ha letto quale notifica
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notifiche_lettura (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            notifica_id     INTEGER NOT NULL,
            username        TEXT NOT NULL,
            letta_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (notifica_id) REFERENCES notifiche(id) ON DELETE CASCADE,
            UNIQUE(notifica_id, username)
        )
    """)

    # ── TABELLA COMUNICAZIONI (Bacheca staff — 9.2) ──
    # Messaggi broadcast da admin/superadmin verso lo staff.
    # Monodirezionale: admin scrive, staff legge.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comunicazioni (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,

            -- Chi scrive
            autore          TEXT NOT NULL,

            -- Contenuto
            titolo          TEXT NOT NULL,
            messaggio       TEXT NOT NULL,
            urgenza         TEXT NOT NULL DEFAULT 'normale',

            -- Destinatari (ruolo o 'tutti')
            dest_ruolo      TEXT NOT NULL DEFAULT 'tutti',

            -- Validita'
            attiva          INTEGER NOT NULL DEFAULT 1,
            scadenza        TEXT,

            -- Meta
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── TABELLA LETTURA COMUNICAZIONI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comunicazioni_lettura (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            comunicazione_id INTEGER NOT NULL,
            username        TEXT NOT NULL,
            letta_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (comunicazione_id) REFERENCES comunicazioni(id) ON DELETE CASCADE,
            UNIQUE(comunicazione_id, username)
        )
    """)

    # ── TABELLA CONFIG ALERT ENGINE (M.F) ──
    # Configurazione per ogni checker dell'alert engine.
    # Una riga per checker (es. 'fatture_scadenza', 'dipendenti_scadenze', 'vini_sottoscorta').
    cur.execute("""
        CREATE TABLE IF NOT EXISTS alert_config (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            checker         TEXT NOT NULL UNIQUE,

            -- On/off
            attivo          INTEGER NOT NULL DEFAULT 1,

            -- Soglie (interpretazione specifica per checker)
            soglia_giorni   INTEGER NOT NULL DEFAULT 7,
            antidup_ore     INTEGER NOT NULL DEFAULT 24,

            -- Destinatari
            dest_ruolo      TEXT DEFAULT 'admin',
            dest_username   TEXT,

            -- Canali abilitati
            canale_app      INTEGER NOT NULL DEFAULT 1,
            canale_wa       INTEGER NOT NULL DEFAULT 0,
            canale_email    INTEGER NOT NULL DEFAULT 0,

            -- Meta
            updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # Seed defaults per i 3 checker iniziali
    for checker, soglia, antidup, label in [
        ("fatture_scadenza", 7, 12, "Fatture in scadenza"),
        ("dipendenti_scadenze", 30, 24, "Documenti dipendenti"),
        ("vini_sottoscorta", 0, 24, "Vini sotto scorta"),
    ]:
        cur.execute("""
            INSERT OR IGNORE INTO alert_config (checker, soglia_giorni, antidup_ore)
            VALUES (?, ?, ?)
        """, (checker, soglia, antidup))

    # ── INDICI ──
    cur.execute("CREATE INDEX IF NOT EXISTS idx_notifiche_dest_username ON notifiche(dest_username)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_notifiche_dest_ruolo ON notifiche(dest_ruolo)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_notifiche_created ON notifiche(created_at DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_notifiche_tipo ON notifiche(tipo)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_notifiche_lettura_user ON notifiche_lettura(username)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comunicazioni_attiva ON comunicazioni(attiva)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comunicazioni_lettura_user ON comunicazioni_lettura(username)")

    # ── TRIGGER updated_at ──
    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_comunicazioni_updated
        AFTER UPDATE ON comunicazioni
        FOR EACH ROW
        BEGIN
            UPDATE comunicazioni SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
        END
    """)

    conn.commit()
    conn.close()
