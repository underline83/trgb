# @version: v1.1-dipendenti-db
# -*- coding: utf-8 -*-
"""
Database Dipendenti & Turni — TRGB Gestionale

v1.1 - 2025-12-05
- DB dedicato app/data/dipendenti.sqlite3
- Tabelle:
  - dipendenti (anagrafica estesa con IBAN + indirizzo)
  - turni_tipi
  - turni_calendario
  - dipendenti_documenti (allegati per dipendente)
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # app/
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "dipendenti.sqlite3"


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_dipendenti_conn() -> sqlite3.Connection:
    """
    Ritorna una connessione al DB dipendenti.sqlite3
    (row_factory = sqlite3.Row).
    """
    _ensure_data_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_dipendenti_db() -> None:
    """
    Crea lo schema se il file non esiste oppure è vuoto.
    Puoi tranquillamente cancellare dipendenti.sqlite3:
    al prossimo avvio viene ricreato con queste tabelle.
    """
    _ensure_data_dir()
    need_init = not DB_PATH.exists()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    if need_init:
        # --------------------------------------------------
        # TABELLA dipendenti
        # --------------------------------------------------
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS dipendenti (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              codice          TEXT NOT NULL UNIQUE,
              nome            TEXT NOT NULL,
              cognome         TEXT NOT NULL,
              ruolo           TEXT NOT NULL,
              telefono        TEXT,
              email           TEXT,
              iban            TEXT,
              indirizzo_via   TEXT,
              indirizzo_cap   TEXT,
              indirizzo_citta TEXT,
              indirizzo_provincia TEXT,
              note            TEXT,
              attivo          INTEGER NOT NULL DEFAULT 1,
              created_at      TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )

        # trigger aggiornamento updated_at
        cur.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_dipendenti_updated_at
            AFTER UPDATE ON dipendenti
            FOR EACH ROW
            BEGIN
              UPDATE dipendenti
              SET updated_at = datetime('now')
              WHERE id = NEW.id;
            END;
            """
        )

        # --------------------------------------------------
        # TABELLA turni_tipi
        # --------------------------------------------------
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS turni_tipi (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              codice          TEXT NOT NULL UNIQUE,
              nome            TEXT NOT NULL,
              ruolo           TEXT NOT NULL,
              colore_bg       TEXT NOT NULL,
              colore_testo    TEXT NOT NULL,
              ora_inizio      TEXT NOT NULL,
              ora_fine        TEXT NOT NULL,
              ordine          INTEGER NOT NULL DEFAULT 0,
              attivo          INTEGER NOT NULL DEFAULT 1,
              created_at      TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )

        cur.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_turni_tipi_updated_at
            AFTER UPDATE ON turni_tipi
            FOR EACH ROW
            BEGIN
              UPDATE turni_tipi
              SET updated_at = datetime('now')
              WHERE id = NEW.id;
            END;
            """
        )

        # --------------------------------------------------
        # TABELLA turni_calendario
        # --------------------------------------------------
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS turni_calendario (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              dipendente_id   INTEGER NOT NULL,
              turno_tipo_id   INTEGER NOT NULL,
              data            TEXT NOT NULL,   -- YYYY-MM-DD
              ora_inizio      TEXT,
              ora_fine        TEXT,
              stato           TEXT NOT NULL DEFAULT 'CONFERMATO',
              note            TEXT,
              created_at      TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id),
              FOREIGN KEY (turno_tipo_id) REFERENCES turni_tipi(id)
            );
            """
        )

        cur.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_turni_calendario_updated_at
            AFTER UPDATE ON turni_calendario
            FOR EACH ROW
            BEGIN
              UPDATE turni_calendario
              SET updated_at = datetime('now')
              WHERE id = NEW.id;
            END;
            """
        )

        # --------------------------------------------------
        # TABELLA dipendenti_documenti (allegati)
        # --------------------------------------------------
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS dipendenti_documenti (
              id                 INTEGER PRIMARY KEY AUTOINCREMENT,
              dipendente_id      INTEGER NOT NULL,
              categoria          TEXT NOT NULL,   -- es: 'CONTRATTO', 'CORSO', 'ALTRO'
              descrizione        TEXT,
              filename_originale TEXT NOT NULL,
              filepath           TEXT NOT NULL,
              uploaded_at        TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id)
            );
            """
        )

        conn.commit()

    conn.close()
