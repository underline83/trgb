# Modulo: prenotazioni (integrazione TheFork) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 189 — Registro eventi webhook TheFork (2026-10-16)

TheFork (B2B API) manda un POST per ogni prenotazione o cliente creato/aggiornato
in TheFork Manager. Il payload ha solo tipo + uuid: i dettagli si leggono dopo
con l'API. Ogni evento entra qui PRIMA di essere elaborato, così:
- si risponde 200 a TheFork subito (non riprova dopo un 200);
- un evento che fallisce (API giù, credenziali non ancora arrivate) resta in
  'in_attesa' / 'errore' e si riprova dalle Impostazioni Prenotazioni.

prenotazioni_thefork_eventi:
  ricevuto_at       TEXT  quando è arrivato (ora locale)
  event_type        TEXT  reservationCreated, reservationUpdated, customerCreated, …
  entity_type       TEXT  reservation | customer | review
  uuid              TEXT  uuid dell'entità (prenotazione o cliente)
  group_uuid, restaurant_uuid, reservation_uuid  TEXT  dal payload, se presenti
  payload           TEXT  JSON grezzo ricevuto
  stato             TEXT  ricevuto | fatto | ignorato | in_attesa | errore
  tentativi         INTEGER
  esito             TEXT  cosa è stato fatto («prenotazione inserita #123 …»)
  ultimo_errore     TEXT
  elaborato_at      TEXT

Solo CREATE TABLE IF NOT EXISTS + indici. DB toccato: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")

_INDICI = {
    "idx_ptfe_stato": "CREATE INDEX idx_ptfe_stato ON prenotazioni_thefork_eventi(stato)",
    "idx_ptfe_uuid": "CREATE INDEX idx_ptfe_uuid ON prenotazioni_thefork_eventi(uuid)",
    "idx_ptfe_ricevuto": "CREATE INDEX idx_ptfe_ricevuto ON prenotazioni_thefork_eventi(ricevuto_at)",
}


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS prenotazioni_thefork_eventi (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                ricevuto_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                event_type       TEXT,
                entity_type      TEXT,
                uuid             TEXT,
                group_uuid       TEXT,
                restaurant_uuid  TEXT,
                reservation_uuid TEXT,
                payload          TEXT,
                stato            TEXT NOT NULL DEFAULT 'ricevuto',
                tentativi        INTEGER NOT NULL DEFAULT 0,
                esito            TEXT,
                ultimo_errore    TEXT,
                elaborato_at     TEXT
            )
        """)
        for nome, sql in _INDICI.items():
            if not cconn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (nome,)
            ).fetchone():
                cconn.execute(sql)
        cconn.commit()
        print("  + [189] prenotazioni_thefork_eventi")
    finally:
        cconn.close()
