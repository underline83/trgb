# Modulo: clienti (sub-modulo preventivi) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 231 — Menu template dei preventivi anche su iPratico (2026-11-13)

Contesto (Marco, 13/11/2026): i menu template (es. i menù gruppi) diventano
articoli iPratico, così il prezzo battuto in cassa è quello del preventivo.
TRGB comanda, stesso export Excel di vini e bevande (codice nello SKU: M0012,
M0012V per la versione con vino).

clienti_menu_template:
  ipratico  INTEGER 0/1, default 1 — il template va su iPratico (interruttore,
            acceso di default come per i vini)
clienti_impostazioni:
  ipratico_categoria_menu = 'Degustazioni' (categoria iPratico degli articoli,
            modificabile da Clienti › Impostazioni › Menu Template)

Solo ADD COLUMN + INSERT OR IGNORE, idempotente. DB toccato: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        if cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_menu_template'"
        ).fetchone():
            cols = {r[1] for r in cconn.execute("PRAGMA table_info(clienti_menu_template)").fetchall()}
            if "ipratico" not in cols:
                cconn.execute(
                    "ALTER TABLE clienti_menu_template ADD COLUMN ipratico INTEGER NOT NULL DEFAULT 1"
                )
                # SQLite non popola sempre le righe esistenti con ADD COLUMN NOT NULL DEFAULT
                cconn.execute("UPDATE clienti_menu_template SET ipratico = 1 WHERE ipratico IS NULL")
                print("  + [231] clienti_menu_template.ipratico")
        else:
            print("  · [231] clienti_menu_template non esiste, skip colonna")

        if cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_impostazioni'"
        ).fetchone():
            cconn.execute(
                "INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione) VALUES "
                "('ipratico_categoria_menu', 'Degustazioni', "
                "'Categoria iPratico dei menu template (export iPratico)')"
            )
        cconn.commit()
    finally:
        cconn.close()
