# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
252 — Riconferma su WhatsApp: quando è stato toccato il tasto (Marco 2026-11-26).

Toccare «Riconferma su WhatsApp» apre WhatsApp col messaggio pronto, ma non vuol dire averlo
mandato: «ho provato a cliccare, ha flaggato, ma non ho continuato e si è bloccata lì».
clienti_prenotazioni.reminder_at (TEXT) tiene l'ora del tocco; la spunta verde compare solo se
l'archivio WhatsApp (clienti_wa_messaggi) ha visto uscire un messaggio verso quel numero da
quell'ora in poi. Senza, la riconferma risulta «aperta, non mandata».

Solo ADD COLUMN senza NOT NULL: idempotente.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn è foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    c = sqlite3.connect(str(CLIENTI_DB))
    try:
        tabelle = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "clienti_prenotazioni" in tabelle:
            colonne = {r[1] for r in c.execute("PRAGMA table_info(clienti_prenotazioni)")}
            if "reminder_at" not in colonne:
                c.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN reminder_at TEXT")
                c.commit()
                print("  + [252] clienti_prenotazioni.reminder_at")
    finally:
        c.close()
