# Modulo: clienti (WhatsApp in sola lettura) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 244 — Chat WhatsApp «gestite» a mano (2026-11-24)

Contesto (Marco, 24/11): nella pagina «💬 WhatsApp» serve un tasto «✓ Gestita»
per togliere da «da rispondere» una chat risolta in altro modo (telefonata, di
persona). Se il cliente riscrive, la chat torna da rispondere da sola. Vale anche
per il giro del mattino (whatsapp_conversazioni).

clienti_wa_gestite — una riga per chat segnata gestita
  numero      TEXT PK  numero del cliente (solo cifre, come clienti_wa_messaggi.numero)
  fino_ts     INTEGER  gestita fino a questo messaggio del cliente (unix): un messaggio
                       del cliente più nuovo la rimette «da rispondere»
  da          TEXT     chi l'ha segnata (username)
  at          TEXT     quando

Solo CREATE TABLE IF NOT EXISTS. DB: clienti.sqlite3.
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
            CREATE TABLE IF NOT EXISTS clienti_wa_gestite (
                numero  TEXT PRIMARY KEY,
                fino_ts INTEGER NOT NULL,
                da      TEXT,
                at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        cconn.commit()
        print("  + [244] clienti_wa_gestite")
    finally:
        cconn.close()
