# Modulo: platform (mattone M.D, posta in arrivo) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 239 — Le altre caselle del locale in sola lettura (2026-11-19)

Contesto (Marco, 19/11/2026): il giro mail di Claude leggeva info@, marco@,
prenotazioni@ e la PEC dall'archivio di Apple Mail sul Mac; col Mac addormentato
il giro era cieco. Ora TRGB legge quelle caselle via IMAP in sola lettura
(email_caselle_service), come fa già per la casella del gestionale, e Q le legge
dal connettore (posta_elenco, posta_leggi).

DB: email.sqlite3 nella cartella dati del locale, tabelle nuove email_posta,
email_posta_cursore, email_posta_giri (schema e commenti in app/models/email_db.py).
Solo CREATE TABLE IF NOT EXISTS + indici se mancano: rieseguirla non fa niente.
Lo stesso schema si crea anche al boot (main.py), per le installazioni nuove.
Le caselle si aggiungono da Impostazioni › Email (nessun dato scritto qui).
"""

from app.models.email_db import init_email_db


def upgrade(conn):
    """conn è foodcost.db (ignorato): lo schema sta in email.sqlite3."""
    init_email_db()
    print("  · email.sqlite3: email_posta, email_posta_cursore, email_posta_giri pronte")
