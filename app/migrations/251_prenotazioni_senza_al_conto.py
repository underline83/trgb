# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
251 — «Al conto» non si usa (Marco 2026-11-26): «in TRGB non lo usiamo (ma anche su TheFork);
se mai ti arrivasse, tu consideralo libero».

- prenotazioni_stati_transizioni: si toglie il passaggio Seduto → Al conto (il tasto sparisce
  da Planning, Servizio e Mappa). Lo stato BILL resta in tabella con le sue uscite, per non
  rompere niente se una riga ci finisse.
- clienti_prenotazioni: le prenotazioni rimaste «Al conto» (poche, tutte passate) diventano
  «Completata» (LEFT). Nelle statistiche i due stati contano già allo stesso modo (venuti).

Da qui in poi TheFork: uno stato BILL in arrivo si scrive LEFT (thefork_service.mappa_prenotazione).
Nessun cambio di schema. Idempotente: rieseguita non trova più niente da cambiare.
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
        tolte = righe = 0
        if "prenotazioni_stati_transizioni" in tabelle:
            tolte = c.execute("DELETE FROM prenotazioni_stati_transizioni WHERE a = 'BILL'").rowcount
        if "clienti_prenotazioni" in tabelle:
            righe = c.execute("UPDATE clienti_prenotazioni SET stato = 'LEFT' WHERE stato = 'BILL'").rowcount
        c.commit()
        print(f"  + [251] «Al conto» tolto: {tolte} passaggi, {righe} prenotazioni portate a «Completata»")
    finally:
        c.close()
