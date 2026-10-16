# Modulo: clienti (sub-modulo preventivi) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 187 — Preventivi: prezzo «a corpo» per menu + stagione template (2026-10-16)

Contesto (Marco): per i menu gruppi serve un prezzo fisso a persona deciso a mano,
indipendente dai piatti, con doppio prezzo opzionale vino escluso / vino incluso
(es. 50/55). I piatti restano come composizione (portate).

clienti_preventivi_menu:
  pricing_mode         TEXT    'somma' (default, comportamento attuale) | 'corpo'
  prezzo_corpo         REAL    prezzo a persona (vino escluso, o prezzo unico)
  prezzo_corpo_vino    REAL    prezzo a persona vino incluso (se doppio_prezzo)
  doppio_prezzo        INTEGER 0/1
  prezzo_corpo_scelta  TEXT    'escluso' | 'incluso' — quale entra nel totale
clienti_menu_template: pricing_mode, prezzo_corpo, prezzo_corpo_vino, doppio_prezzo, stagione
clienti_preventivi:    menu_scelto_id INTEGER (NULL = il cliente non ha ancora scelto)

Default neutri: i preventivi e i template esistenti restano in modalità 'somma',
nessun totale cambia. Solo ADD COLUMN, idempotente. DB toccato: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")

_MENU_COLS = [
    ("pricing_mode",        "TEXT NOT NULL DEFAULT 'somma'"),
    ("prezzo_corpo",        "REAL NOT NULL DEFAULT 0"),
    ("prezzo_corpo_vino",   "REAL NOT NULL DEFAULT 0"),
    ("doppio_prezzo",       "INTEGER NOT NULL DEFAULT 0"),
    ("prezzo_corpo_scelta", "TEXT NOT NULL DEFAULT 'escluso'"),
]
_TEMPLATE_COLS = [
    ("pricing_mode",      "TEXT NOT NULL DEFAULT 'somma'"),
    ("prezzo_corpo",      "REAL NOT NULL DEFAULT 0"),
    ("prezzo_corpo_vino", "REAL NOT NULL DEFAULT 0"),
    ("doppio_prezzo",     "INTEGER NOT NULL DEFAULT 0"),
    ("stagione",          "TEXT"),
]
_PREVENTIVI_COLS = [
    ("menu_scelto_id", "INTEGER"),
]


def _add_cols(cconn, tabella: str, colonne: list) -> None:
    if not cconn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tabella,)
    ).fetchone():
        print(f"  · [187] {tabella} non esiste, skip")
        return
    esistenti = {r[1] for r in cconn.execute(f"PRAGMA table_info({tabella})").fetchall()}
    for nome, tipo in colonne:
        if nome in esistenti:
            continue
        try:
            cconn.execute(f"ALTER TABLE {tabella} ADD COLUMN {nome} {tipo}")
            print(f"  + [187] {tabella}.{nome}")
        except sqlite3.OperationalError as e:
            print(f"  ⚠ [187] {tabella}.{nome}: {e}")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        _add_cols(cconn, "clienti_preventivi_menu", _MENU_COLS)
        _add_cols(cconn, "clienti_menu_template", _TEMPLATE_COLS)
        _add_cols(cconn, "clienti_preventivi", _PREVENTIVI_COLS)
        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cmt_stagione ON clienti_menu_template(stagione)"
        )
        cconn.commit()
    finally:
        cconn.close()
