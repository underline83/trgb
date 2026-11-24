# Modulo: clienti (WhatsApp del locale) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 245 — Messaggi WhatsApp scritti da TRGB (2026-11-24)

Contesto (Marco, 24/11, dopo la pagina «💬 WhatsApp» della 244): «possiamo inviare
messaggi da lì?» → sì, via API YCloud dal numero dell'osteria, solo dentro le 24 ore
dall'ultimo messaggio del cliente (regola di WhatsApp). Ogni invio si registra qui,
anche quelli non partiti; quello partito entra anche in clienti_wa_messaggi (fonte «trgb»).

clienti_wa_invii
  id            INTEGER PK  → externalId «trgb-<id>» verso YCloud
  numero        TEXT        destinatario (solo cifre, come clienti_wa_messaggi.numero)
  testo         TEXT
  da            TEXT        chi l'ha scritto (username)
  at            TEXT        quando
  esito         TEXT        in_invio | inviato | errore
  errore        TEXT        perché non è partito o non è stato consegnato
  ycloud_id     TEXT        id del messaggio in YCloud
  wamid         TEXT        id WhatsApp (arriva con la risposta o col webhook)
  stato         TEXT        accepted | sent | delivered | read | failed (da YCloud)
  aggiornato_at TEXT

Solo CREATE TABLE/INDEX IF NOT EXISTS. DB: clienti.sqlite3.
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
            CREATE TABLE IF NOT EXISTS clienti_wa_invii (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                numero        TEXT NOT NULL,
                testo         TEXT NOT NULL,
                da            TEXT,
                at            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                esito         TEXT NOT NULL DEFAULT 'in_invio',
                errore        TEXT,
                ycloud_id     TEXT,
                wamid         TEXT,
                stato         TEXT,
                aggiornato_at TEXT
            )
        """)
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_clienti_wa_invii_numero ON clienti_wa_invii(numero)")
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_clienti_wa_invii_ycloud ON clienti_wa_invii(ycloud_id)")
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_clienti_wa_invii_wamid ON clienti_wa_invii(wamid)")
        cconn.commit()
        print("  + [245] clienti_wa_invii")
    finally:
        cconn.close()
