# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 195 — Fasce orarie del servizio (2026-10-16)

Copia (e allarga) «Modifica servizio › Andamento per fascia oraria» di TheFork
Manager. TRGB diventa il posto dove si decide il servizio: TheFork resta un
canale di vendita online.

prenotazioni_fasce — una riga solo per le fasce di un giorno cambiate rispetto
al default (le fasce sono gli slot di prenotazioni_config.slot_pranzo/cena):
  data_pasto    TEXT   YYYY-MM-DD
  ora           TEXT   HH:MM
  turno         TEXT   pranzo | cena
  aperta        INTEGER 1/0 — 0 = fascia chiusa anche al telefono (solo TRGB)
  online_aperta INTEGER 1/0 — 0 = niente prenotazioni online (→ TheFork)
  max_coperti   INTEGER NULL = default del turno
  max_online    INTEGER NULL = default del turno
  thefork_esito TEXT   esito dell'ultima scrittura su TheFork
  aggiornato_da, updated_at
  UNIQUE(data_pasto, ora)

prenotazioni_fasce_log — registro di chi ha cambiato cosa (e cosa ha risposto TheFork).

Config (prenotazioni_config), default dei limiti per fascia, vuoto = nessun limite:
  fascia_max_coperti_pranzo / _cena, fascia_max_online_pranzo / _cena

Solo CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS prenotazioni_fasce (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pasto    TEXT NOT NULL,
                ora           TEXT NOT NULL,
                turno         TEXT NOT NULL,
                aperta        INTEGER NOT NULL DEFAULT 1,
                online_aperta INTEGER NOT NULL DEFAULT 1,
                max_coperti   INTEGER,
                max_online    INTEGER,
                thefork_esito TEXT,
                aggiornato_da TEXT,
                updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(data_pasto, ora)
            )
        """)
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS prenotazioni_fasce_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pasto    TEXT NOT NULL,
                ore           TEXT NOT NULL,
                modifica      TEXT NOT NULL,
                thefork_esito TEXT,
                utente        TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_fasce_log_data ON prenotazioni_fasce_log(data_pasto)")
        try:
            cconn.execute("""
                INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
                ('fascia_max_coperti_pranzo', '', 'Coperti massimi per fascia oraria, pranzo (vuoto = nessun limite)'),
                ('fascia_max_coperti_cena',   '', 'Coperti massimi per fascia oraria, cena (vuoto = nessun limite)'),
                ('fascia_max_online_pranzo',  '', 'Coperti online massimi per fascia oraria, pranzo (vuoto = nessun limite)'),
                ('fascia_max_online_cena',    '', 'Coperti online massimi per fascia oraria, cena (vuoto = nessun limite)')
            """)
        except sqlite3.OperationalError:
            pass  # prenotazioni_config la crea init_clienti_db: al primo avvio la si rilegge
        cconn.commit()
        print("  + [195] prenotazioni_fasce, prenotazioni_fasce_log")
    finally:
        cconn.close()
