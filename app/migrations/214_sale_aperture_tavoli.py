# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 214 — Sale aperte per giorno, combinazioni con posti minimi,
regole di durata del tavolo (2026-10-28)

Primo passo della disponibilità PER TAVOLI (decisione di Marco: «dobbiamo già
lavorare per tavoli»). Contano solo i tavoli delle sale aperte quel giorno e turno.

sale_config     zona PK, aperta_default 1/0 (es. Dehor non più usato, Veranda solo col bel tempo)
sale_aperture   eccezioni per giorno e turno: data_pasto, turno, zona, aperta 1/0
                UNIQUE(data_pasto, turno, zona)
tavoli_combinazioni + posti_min, zona

Config (prenotazioni_config), regole del motore per tavoli:
  durata_pranzo_lungo      120   durata del pranzo nei giorni «lunghi» (come la sera)
  giorni_pranzo_lungo      [5,6] giorni (0=lun … 6=dom) col pranzo lungo: sabato e domenica
  gruppo_turno_intero      10    da questi coperti in su il tavolo non gira: occupato tutto il turno
  soglia_online_tavolo     6     TheFork resta aperto in una fascia finché c'è un tavolo per almeno N persone

Solo CREATE IF NOT EXISTS / ADD COLUMN se manca / INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    if not CLIENTI_DB.exists():
        return
    c = sqlite3.connect(str(CLIENTI_DB))
    try:
        c.execute("""
            CREATE TABLE IF NOT EXISTS sale_config (
                zona            TEXT PRIMARY KEY,
                aperta_default  INTEGER NOT NULL DEFAULT 1,
                updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS sale_aperture (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pasto    TEXT NOT NULL,
                turno         TEXT NOT NULL,
                zona          TEXT NOT NULL,
                aperta        INTEGER NOT NULL,
                aggiornato_da TEXT,
                updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(data_pasto, turno, zona)
            )
        """)
        try:
            colonne = {r[1] for r in c.execute("PRAGMA table_info(tavoli_combinazioni)")}
            if colonne and "posti_min" not in colonne:
                c.execute("ALTER TABLE tavoli_combinazioni ADD COLUMN posti_min INTEGER")
            if colonne and "zona" not in colonne:
                c.execute("ALTER TABLE tavoli_combinazioni ADD COLUMN zona TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("""
                INSERT OR IGNORE INTO sale_config (zona, aperta_default)
                SELECT DISTINCT zona, 1 FROM tavoli WHERE attivo = 1 AND zona IS NOT NULL AND zona != ''
            """)
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("""
                INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
                ('durata_pranzo_lungo', '120', 'Durata del tavolo a pranzo nei giorni col pranzo lungo (minuti)'),
                ('giorni_pranzo_lungo', '[5,6]', 'Giorni col pranzo lungo come la sera (0=lun … 6=dom)'),
                ('gruppo_turno_intero', '10', 'Da questi coperti in su il tavolo resta occupato tutto il turno'),
                ('soglia_online_tavolo', '6', 'Online aperto su TheFork finché c''è un tavolo libero per almeno queste persone')
            """)
        except sqlite3.OperationalError:
            pass
        c.commit()
        print("  + [214] sale_config, sale_aperture, combinazioni posti_min/zona, regole durata")
    finally:
        c.close()
