# Modulo: prenotazioni (preventivi) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 206 — Copia degli invii dei preventivi (2026-10-22)

Quando un preventivo parte verso il cliente (email o WhatsApp) TRGB manda una
copia col PDF a un indirizzo dell'osteria (Marco: prenotazioni@tregobbi.it) e
prepara il messaggio per i gruppi WhatsApp di sala e cucina.

clienti_impostazioni.preventivi_email_copia — indirizzi separati da virgola
(vuoto = nessuna copia), si cambia da Clienti › Impostazioni › Luoghi preventivi.
Solo INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    if not CLIENTI_DB.exists():
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        try:
            cconn.execute("""
                INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione)
                VALUES ('preventivi_email_copia', 'prenotazioni@tregobbi.it',
                        'Copia (col PDF) di ogni preventivo inviato al cliente; vuoto = nessuna copia')
            """)
        except sqlite3.OperationalError:
            pass
        cconn.commit()
        print("  + [206] preventivi_email_copia")
    finally:
        cconn.close()
