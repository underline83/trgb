────────────────────────────────────────
FILE 1 — app/models/dipendenti_db.py
────────────────────────────────────────
# @version: v1.0-dipendenti-db
# -*- coding: utf-8 -*-
"""
Database Dipendenti & Turni — TRGB Gestionale

- File DB: app/data/dipendenti.sqlite3
- Tabelle:
  - dipendenti
  - turni_tipi
  - turni_calendario

Il DB viene creato e inizializzato automaticamente alla prima chiamata
tramite la funzione init_dipendenti_db().
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from datetime import datetime


BASE_DIR = Path(__file__).resolve().parent.parent  # app/
DATA_DIR = BASE_DIR / "data"

DIPENDENTI_DB_PATH = DATA_DIR / "dipendenti.sqlite3"


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_dipendenti_conn() -> sqlite3.Connection:
    """
    Restituisce una connessione al DB dipendenti.sqlite3.
    Attiva anche le foreign key.
    """
    _ensure_data_dir()
    conn = sqlite3.connect(DIPENDENTI_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_dipendenti_db() -> None:
    """
    Crea le tabelle se non esistono e inserisce i tipi di turno di base
    se la tabella turni_tipi è vuota.
    """
    conn = get_dipendenti_conn()
    cur = conn.cursor()

    # Tabelle principali
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS dipendenti (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            codice      TEXT UNIQUE NOT NULL,
            nome        TEXT NOT NULL,
            cognome     TEXT NOT NULL,
            ruolo       TEXT NOT NULL,
            telefono    TEXT,
            email       TEXT,
            note        TEXT,
            attivo      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TRIGGER IF NOT EXISTS dipendenti_set_updated_at
        AFTER UPDATE ON dipendenti
        FOR EACH ROW
        BEGIN
          UPDATE dipendenti
          SET updated_at = datetime('now')
          WHERE id = NEW.id;
        END;

        CREATE TABLE IF NOT EXISTS turni_tipi (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            codice        TEXT UNIQUE NOT NULL,
            nome          TEXT NOT NULL,
            ruolo         TEXT NOT NULL,
            colore_bg     TEXT NOT NULL,
            colore_testo  TEXT NOT NULL,
            ora_inizio    TEXT NOT NULL,  -- "HH:MM"
            ora_fine      TEXT NOT NULL,  -- "HH:MM"
            ordine        INTEGER NOT NULL DEFAULT 0,
            attivo        INTEGER NOT NULL DEFAULT 1,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TRIGGER IF NOT EXISTS turni_tipi_set_updated_at
        AFTER UPDATE ON turni_tipi
        FOR EACH ROW
        BEGIN
          UPDATE turni_tipi
          SET updated_at = datetime('now')
          WHERE id = NEW.id;
        END;

        CREATE TABLE IF NOT EXISTS turni_calendario (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            dipendente_id  INTEGER NOT NULL,
            turno_tipo_id  INTEGER NOT NULL,
            data           TEXT NOT NULL,       -- "YYYY-MM-DD"
            ora_inizio     TEXT,                -- se NULL usa quella del tipo turno
            ora_fine       TEXT,                -- se NULL usa quella del tipo turno
            stato          TEXT NOT NULL DEFAULT 'CONFERMATO',
            note           TEXT,
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id) ON DELETE CASCADE,
            FOREIGN KEY (turno_tipo_id) REFERENCES turni_tipi(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_turni_calendario_data
            ON turni_calendario (data);

        CREATE INDEX IF NOT EXISTS idx_turni_calendario_dipendente
            ON turni_calendario (dipendente_id);

        CREATE TRIGGER IF NOT EXISTS turni_calendario_set_updated_at
        AFTER UPDATE ON turni_calendario
        FOR EACH ROW
        BEGIN
          UPDATE turni_calendario
          SET updated_at = datetime('now')
          WHERE id = NEW.id;
        END;
        """
    )

    # Inserimento tipi turno base se tabella vuota
    cur.execute("SELECT COUNT(*) AS c FROM turni_tipi;")
    row = cur.fetchone()
    count = row["c"] if row else 0

    if count == 0:
        now = datetime.utcnow().isoformat(timespec="seconds")

        default_shifts = [
            # PRANZO SALA
            {
                "codice": "PRANZO_SALA",
                "nome": "Pranzo Sala",
                "ruolo": "Sala",
                "colore_bg": "#F6C177",
                "colore_testo": "#78350F",
                "ora_inizio": "10:00",
                "ora_fine": "15:00",
                "ordine": 10,
            },
            # CENA SALA
            {
                "codice": "CENA_SALA",
                "nome": "Cena Sala",
                "ruolo": "Sala",
                "colore_bg": "#E6815D",
                "colore_testo": "#FFFFFF",
                "ora_inizio": "18:00",
                "ora_fine": "23:30",
                "ordine": 20,
            },
            # PREP CUCINA
            {
                "codice": "PREP_CUCINA",
                "nome": "Prep Cucina",
                "ruolo": "Cucina",
                "colore_bg": "#7FB8D4",
                "colore_testo": "#111827",
                "ora_inizio": "09:00",
                "ora_fine": "12:00",
                "ordine": 30,
            },
            # SERVIZIO CUCINA
            {
                "codice": "SERVIZIO_CUCINA",
                "nome": "Servizio Cucina",
                "ruolo": "Cucina",
                "colore_bg": "#4D8894",
                "colore_testo": "#FFFFFF",
                "ora_inizio": "10:00",
                "ora_fine": "15:00",
                "ordine": 40,
            },
            # BAR / CAFFETTERIA MATTINO
            {
                "codice": "BAR_MATTINO",
                "nome": "Bar / Caffetteria Mattino",
                "ruolo": "Caffetteria / Bar",
                "colore_bg": "#D7BCE8",
                "colore_testo": "#111827",
                "ora_inizio": "07:30",
                "ora_fine": "12:00",
                "ordine": 50,
            },
            # BAR / CAFFETTERIA SERA
            {
                "codice": "BAR_SERA",
                "nome": "Bar / Caffetteria Sera",
                "ruolo": "Caffetteria / Bar",
                "colore_bg": "#B794F4",
                "colore_testo": "#111827",
                "ora_inizio": "17:00",
                "ora_fine": "23:00",
                "ordine": 55,
            },
            # LAVAPIATTI
            {
                "codice": "LAVAPIATTI",
                "nome": "Lavapiatti",
                "ruolo": "Lavapiatti",
                "colore_bg": "#9CA3AF",
                "colore_testo": "#FFFFFF",
                "ora_inizio": "11:00",
                "ora_fine": "15:00",
                "ordine": 60,
            },
            # DOPPIO TURNO SALA
            {
                "codice": "DOPPIO_SALA",
                "nome": "Doppio turno Sala",
                "ruolo": "Sala",
                "colore_bg": "#C25C5C",
                "colore_testo": "#FFFFFF",
                "ora_inizio": "10:00",
                "ora_fine": "23:00",
                "ordine": 70,
            },
            # DOPPIO TURNO CUCINA
            {
                "codice": "DOPPIO_CUCINA",
                "nome": "Doppio turno Cucina",
                "ruolo": "Cucina",
                "colore_bg": "#924040",
                "colore_testo": "#FFFFFF",
                "ora_inizio": "10:00",
                "ora_fine": "23:00",
                "ordine": 80,
            },
        ]

        for s in default_shifts:
            cur.execute(
                """
                INSERT INTO turni_tipi (
                    codice, nome, ruolo, colore_bg, colore_testo,
                    ora_inizio, ora_fine, ordine, attivo, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    s["codice"],
                    s["nome"],
                    s["ruolo"],
                    s["colore_bg"],
                    s["colore_testo"],
                    s["ora_inizio"],
                    s["ora_fine"],
                    s["ordine"],
                    now,
                    now,
                ),
            )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    # Utilità: esegui questo file per inizializzare il DB manualmente
    init_dipendenti_db()
    print(f"Inizializzazione completata: {DIPENDENTI_DB_PATH}")
