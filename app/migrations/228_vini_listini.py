# Modulo: vini (multi-fornitore) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 228 — Vini multi-fornitore VMF.4: listini dei fornitori (2026-11-04)

PERCHE'
Fino a oggi i listini (0,75 ottobre 2026, Marenzi novembre 2026) si
confrontavano a mano con Claude. Ora si carica il PDF in Vini › Listini:
TRGB legge le righe, propone il vino della cantina, e quello che confermi
diventa un prezzo `listino` di quel fornitore (decisione D5: riferimento,
il costo in carta resta l'ultimo pagato).

COSA FA (vini_magazzino.sqlite3)
- `vini_listini`: un listino caricato (fornitore, data di validità, file PDF).
- `vini_listini_righe`: le righe lette, la proposta di abbinamento e il suo
  stato (proposta | confermata | scartata | nessuna). Le righe confermate
  fanno da memoria per il listino dopo dello stesso fornitore.
- settings `vmf_listino_soglia_sicuri` (80), `vmf_listino_soglia_min` (55),
  `vmf_listino_scarto_max_pct` (60).

Idempotente. Solo CREATE IF NOT EXISTS.
"""

import sqlite3

from app.models.vini_magazzino_db import get_magazzino_connection

_CHIAVI = ("vmf_listino_soglia_sicuri", "vmf_listino_soglia_min", "vmf_listino_scarto_max_pct")


def _table(cur, t):
    return cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    v = get_magazzino_connection()
    try:
        cur = v.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vini_listini (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                fornitore_id  INTEGER NOT NULL,
                data          TEXT NOT NULL,
                nome_file     TEXT,
                file_path     TEXT,
                righe_lette   INTEGER DEFAULT 0,
                utente        TEXT,
                created_at    TEXT DEFAULT (datetime('now','localtime'))
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vini_listini_righe (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                listino_id    INTEGER NOT NULL,
                pagina        INTEGER,
                produttore    TEXT,
                descrizione   TEXT NOT NULL,
                chiave        TEXT,
                prezzo        REAL NOT NULL,
                bottiglia_id  INTEGER,
                punteggio     INTEGER,
                stato         TEXT NOT NULL DEFAULT 'nessuna'
                              CHECK (stato IN ('proposta','confermata','scartata','nessuna')),
                prezzo_id     INTEGER,
                utente        TEXT,
                updated_at    TEXT
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_listini_righe_listino ON vini_listini_righe(listino_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_listini_righe_chiave ON vini_listini_righe(chiave)")
        v.commit()
        print("  [228] listini fornitori pronti (vini_listini, vini_listini_righe)")
    finally:
        v.close()

    from app.utils.locale_data import locale_data_path
    from app.services.vini_widget_settings_service import WIDGET_DEFAULTS, invalidate_cache
    db = locale_data_path("vini_settings.sqlite3")
    if db.exists():
        s = sqlite3.connect(db, timeout=30)
        try:
            c = s.cursor()
            if _table(c, "vini_widget_settings"):
                for key, value, tipo, descr in WIDGET_DEFAULTS:
                    if key in _CHIAVI:
                        c.execute("INSERT OR IGNORE INTO vini_widget_settings (key, value, tipo, descrizione) "
                                  "VALUES (?, ?, ?, ?)", (key, value, tipo, descr))
                s.commit()
        finally:
            s.close()
        invalidate_cache()
