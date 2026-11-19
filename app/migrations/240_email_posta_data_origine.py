# Modulo: platform (mattone M.D, posta in arrivo) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 240 — email_posta.data_origine (2026-11-20)

Prima lettura vera delle caselle (20/11): le copie dei preventivi che TRGB mandava in cc a
prenotazioni@ non avevano l'intestazione Date (bug di email_service, sistemato nello stesso
push) e risultavano «arrivate adesso». Ora la data di una mail senza Date è quella in cui il
server l'ha ricevuta (INTERNALDATE) e la colonna dice da dove viene: intestazione | server.
Le righe già lette restano NULL e il giro ripara quelle con la data uguale all'ora di lettura.

Solo ADD COLUMN, nullable, solo se manca (init_email_db): rieseguirla non fa niente.
"""

from app.models.email_db import init_email_db


def upgrade(conn):
    """conn è foodcost.db (ignorato): lo schema sta in email.sqlite3."""
    init_email_db()
    print("  · email.sqlite3: email_posta.data_origine pronta")
