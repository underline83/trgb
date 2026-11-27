# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
253 — Riconferma WhatsApp: «domani» scritto fisso nel testo (Marco 2026-11-27).

Il testo della riconferma diceva «…la prenotazione per domani alle {ora}…» anche quando si manda
il giorno stesso («ho scoperto che ha mandato dicendo domani invece che stasera»).
Nasce il segnaposto {quando}, che il server riempie da solo: «stasera», «oggi a pranzo»,
«domani sera», «domani a pranzo», oppure «sabato 5 dicembre».

Qui si tocca solo prenotazioni_config.template_wa_reminder, e solo se contiene ancora «per domani»
e non usa già {quando}: «per domani» diventa «per {quando}». Un testo riscritto da Marco in altro
modo non si tocca. Nessun cambio di schema. Idempotente.
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
        if "prenotazioni_config" not in tabelle:
            return
        r = c.execute("SELECT valore FROM prenotazioni_config WHERE chiave = 'template_wa_reminder'").fetchone()
        testo = (r[0] if r else "") or ""
        if "per domani" in testo and "{quando}" not in testo:
            c.execute("UPDATE prenotazioni_config SET valore = ? WHERE chiave = 'template_wa_reminder'",
                      (testo.replace("per domani", "per {quando}"),))
            c.commit()
            print("  + [253] template_wa_reminder: «per domani» → «per {quando}»")
    finally:
        c.close()
