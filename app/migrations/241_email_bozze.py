# Modulo: platform (mattone M.D, posta) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 241 — Bozze e invii delle caselle del locale (2026-11-20)

Marco (20/11/2026): il connettore deve poter anche SCRIVERE le mail. Decisione: di norma
Q prepara una bozza (nella cartella Bozze della casella, così la si apre in Mail e la si
manda da lì; per la casella del gestionale nella pagina Posta); l'invio diretto da TRGB
solo dopo un «manda» esplicito di Marco in chat. La PEC solo bozza.

DB: email.sqlite3, tabella nuova email_bozze (schema in app/models/email_db.py).
Solo CREATE TABLE IF NOT EXISTS + indice se manca: rieseguirla non fa niente.
"""

from app.models.email_db import init_email_db


def upgrade(conn):
    """conn è foodcost.db (ignorato): lo schema sta in email.sqlite3."""
    init_email_db()
    print("  · email.sqlite3: email_bozze pronta")
