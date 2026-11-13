# Modulo: platform (mattone M.D, posta in arrivo) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 230 — Posta in arrivo della casella del gestionale (2026-11-13)

Contesto (Marco): le risposte dei clienti ai preventivi mandati da TRGB finiscono
nella casella del gestionale e nessuno le legge. TRGB ora la legge via IMAP in sola
lettura, archivia le mail e le abbina ai preventivi (email_in_service +
preventivi_email_risposte).

DB nuovo: email.sqlite3 nella cartella dati del locale, tabelle email_in,
email_in_cursore, email_in_giri (schema e commenti in app/models/email_db.py).
Solo CREATE TABLE IF NOT EXISTS + indici se mancano: rieseguirla non fa niente.
Lo stesso schema si crea anche al boot (main.py), per le installazioni nuove.
"""

from app.models.email_db import init_email_db


def upgrade(conn):
    """conn è foodcost.db (ignorato): lo schema sta in email.sqlite3."""
    init_email_db()
    print("  · email.sqlite3: email_in, email_in_cursore, email_in_giri pronte")
