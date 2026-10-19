# Modulo: clienti (sub-modulo preventivi) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 200 — Preventivi: registro degli invii al cliente (2026-10-19)

Contesto (Marco): il preventivo si manda dal gestionale, su WhatsApp (testo
completo + PDF) o via email (PDF allegato, mattone M.D). Ogni invio resta
nella scheda: canale, a chi, quando, chi l'ha mandato, esito. Il primo invio
riuscito porta il preventivo da «bozza» a «inviato».

clienti_preventivi_invii:
  preventivo_id  INTEGER  FK clienti_preventivi (CASCADE)
  canale         TEXT     'whatsapp' | 'email'
  destinatario   TEXT     telefono o indirizzo email
  oggetto        TEXT     solo email
  esito          TEXT     'ok' | 'errore'
  errore         TEXT
  message_id     TEXT     Message-ID dell'email (per ritrovarla)
  inviato_da     TEXT     username
  created_at     TEXT

Solo CREATE TABLE IF NOT EXISTS: idempotente, non tocca tabelle esistenti.
DB toccato: clienti.sqlite3.
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
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_preventivi_invii (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id  INTEGER NOT NULL
                               REFERENCES clienti_preventivi(id) ON DELETE CASCADE,
                canale         TEXT NOT NULL,
                destinatario   TEXT,
                oggetto        TEXT,
                esito          TEXT NOT NULL DEFAULT 'ok',
                errore         TEXT,
                message_id     TEXT,
                inviato_da     TEXT,
                created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cpi_preventivo "
            "ON clienti_preventivi_invii(preventivo_id)"
        )
        cconn.commit()
        print("  + [200] clienti_preventivi_invii")
    finally:
        cconn.close()
