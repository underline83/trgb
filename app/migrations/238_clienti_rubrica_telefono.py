# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 238 — Rubrica dei clienti sul telefono (CardDAV) (2026-11-16)

Marco (16/11/2026): prima esportava i contatti da TheFork a mano su un account
Gmail per averli sul telefono (riconoscere chi chiama, nomi su WhatsApp
Business). Ora il telefono si abbona alla rubrica di TRGB (CardDAV, sola
lettura): entrano i clienti attivi con un telefono valido e almeno una stella
del rank TRGB. Nome sul telefono = prefisso + nome + stelle.

clienti_rubrica_accessi — un accesso per telefono (si revoca da solo):
  nome           descrizione del telefono («iPhone sala»)
  utente         nome utente CardDAV (unico)
  password_hash  pbkdf2-sha256 (la password si vede una volta sola)
  creato_il / creato_da / ultimo_accesso / attivo (0 = revocato, resta per storico)
La password NON sta in clienti_impostazioni: quella tabella la leggono e la
scrivono tutti i ruoli del modulo (GET/PUT /clienti/impostazioni).

clienti_impostazioni:
  rubrica_prefisso   'TG'  — davanti al nome, per distinguere i clienti dai contatti personali
  rubrica_stelle_min '1'   — stelle (somma di nere, argento, oro) per entrare in rubrica

Solo CREATE TABLE IF NOT EXISTS e INSERT OR IGNORE, idempotente. DB: clienti.sqlite3.
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
        if not cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_rubrica_accessi'"
        ).fetchone():
            cconn.execute("""
                CREATE TABLE IF NOT EXISTS clienti_rubrica_accessi (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome            TEXT NOT NULL,
                    utente          TEXT NOT NULL UNIQUE,
                    password_hash   TEXT NOT NULL,
                    creato_il       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                    creato_da       TEXT,
                    ultimo_accesso  TEXT,
                    attivo          INTEGER NOT NULL DEFAULT 1
                )
            """)
            print("  + [238] clienti_rubrica_accessi")
        if cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_impostazioni'"
        ).fetchone():
            cconn.executemany(
                "INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)",
                [
                    ("rubrica_prefisso", "TG",
                     "Rubrica telefono: prefisso davanti al nome, per distinguere i clienti dai contatti personali"),
                    ("rubrica_stelle_min", "1",
                     "Rubrica telefono: stelle (nere + argento + oro) per entrare in rubrica"),
                ],
            )
        cconn.commit()
    finally:
        cconn.close()
