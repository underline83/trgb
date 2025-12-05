# @version: v1.1-dipendenti-db
# -*- coding: utf-8 -*-
"""
Database Dipendenti & Turni — TRGB Gestionale

Contiene:
- Tabella dipendenti (anagrafica + indirizzo + IBAN)
- Tabella turni_tipi (tipologie di turno)
- Tabella turni_calendario (calendario turni)
- Tabella dipendenti_allegati (documenti/corsi allegati)
"""

import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # .../trgb/
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "dipendenti.sqlite3"


def get_dipendenti_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_dipendenti_db() -> None:
    """
    Inizializza il DB dipendenti se non esiste.
    Se il file è già presente, NON modifica lo schema (niente migrazioni qui).
    Per modifiche strutturali importanti preferiamo cancellare il file
    quando non ci sono dati, come nel tuo caso.
    """
    need_init = not DB_PATH.exists()

    conn = get_dipendenti_conn()
    cur = conn.cursor()

    if need_init:
        # ------------------------------------------------------------
        # TABELLA DIPENDENTI — anagrafica + indirizzo + IBAN
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE dipendenti (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              codice TEXT NOT NULL UNIQUE,
              nome TEXT NOT NULL,
              cognome TEXT NOT NULL,
              ruolo TEXT NOT NULL,

              telefono TEXT,
              email TEXT,
              note TEXT,

              -- Indirizzo completo
              indirizzo_via TEXT,
              indirizzo_civico TEXT,
              indirizzo_cap TEXT,
              indirizzo_citta TEXT,
              indirizzo_provincia TEXT,
              indirizzo_paese TEXT,

              -- IBAN per pagamenti/stipendi
              iban TEXT,

              attivo INTEGER NOT NULL DEFAULT 1,

              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            """
        )

        # Trigger per aggiornare updated_at
        cur.execute(
            """
            CREATE TRIGGER dipendenti_update_ts
            AFTER UPDATE ON dipendenti
            FOR EACH ROW
            BEGIN
              UPDATE dipendenti
              SET updated_at = datetime('now','localtime')
              WHERE id = OLD.id;
            END;
            """
        )

        # ------------------------------------------------------------
        # TABELLA TURNI_TIPI — definizione tipologie di turno
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE turni_tipi (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              codice TEXT NOT NULL UNIQUE,
              nome TEXT NOT NULL,
              ruolo TEXT NOT NULL,
              colore_bg TEXT NOT NULL,
              colore_testo TEXT NOT NULL,
              ora_inizio TEXT NOT NULL,  -- "HH:MM"
              ora_fine   TEXT NOT NULL,  -- "HH:MM"
              ordine INTEGER NOT NULL DEFAULT 0,
              attivo INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            """
        )

        cur.execute(
            """
            CREATE TRIGGER turni_tipi_update_ts
            AFTER UPDATE ON turni_tipi
            FOR EACH ROW
            BEGIN
              UPDATE turni_tipi
              SET updated_at = datetime('now','localtime')
              WHERE id = OLD.id;
            END;
            """
        )

        # ------------------------------------------------------------
        # TABELLA TURNI_CALENDARIO — turni assegnati per giorno
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE turni_calendario (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              dipendente_id INTEGER NOT NULL,
              turno_tipo_id INTEGER NOT NULL,
              data TEXT NOT NULL,            -- "YYYY-MM-DD"
              ora_inizio TEXT,               -- opzionale: override
              ora_fine TEXT,                 -- opzionale: override
              stato TEXT NOT NULL DEFAULT 'CONFERMATO',
              note TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id),
              FOREIGN KEY (turno_tipo_id) REFERENCES turni_tipi(id)
            );
            """
        )

        cur.execute(
            """
            CREATE TRIGGER turni_calendario_update_ts
            AFTER UPDATE ON turni_calendario
            FOR EACH ROW
            BEGIN
              UPDATE turni_calendario
              SET updated_at = datetime('now','localtime')
              WHERE id = OLD.id;
            END;
            """
        )

        # ------------------------------------------------------------
        # TABELLA DIPENDENTI_ALLEGATI — documenti/corsi allegati
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE dipendenti_allegati (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              dipendente_id INTEGER NOT NULL,
              filename TEXT NOT NULL,       -- nome file memorizzato (es. su NAS / storage)
              label TEXT,                   -- nome leggibile: "Contratto 2025", "Corso HACCP", ...
              note TEXT,
              uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id)
            );
            """
        )

        conn.commit()

    conn.close()
