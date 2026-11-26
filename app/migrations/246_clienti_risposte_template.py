# Modulo: clienti (template di risposta ai clienti) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 246 — Template di risposta ai clienti (2026-11-26)

Contesto (Marco, 25-26/11): «creiamo dei template di risposta alle mail (poi in futuro
anche per WhatsApp); il primo è per la richiesta sul menù / prenotazione di Natale:
ringrazia, espone menù e prezzo, se ho disponibilità avvisa che è possibile prenotare
dando il link diretto». Fra tre strade ha scelto la B: testi con blocchi vivi, cioè
pezzi che TRGB riempie al momento (menù e prezzo dalla libreria menù, «c'è posto» /
«siamo pieni» guardando i tavoli dell'occasione, link di prenotazione dalle impostazioni).

clienti_risposte_template
  id               INTEGER PK
  nome             TEXT        come lo si sceglie in Posta («Pranzo di Natale 2026»)
  attivo           INTEGER     1 = si può scegliere
  occasione_data   TEXT        AAAA-MM-GG, vuoto = template senza occasione
  occasione_turno  TEXT        pranzo | cena
  pax_prova        INTEGER     «c'è posto» = entra ancora un tavolo da N persone
  menu_template_id INTEGER     menù della libreria (clienti_menu_template.id), per {menu} e {prezzo}
  oggetto          TEXT        oggetto di una mail nuova (una risposta tiene «RE: …»)
  testo_mail       TEXT        testo coi blocchi fra graffe
  testo_wa         TEXT        versione corta per WhatsApp
  disp_posto       TEXT        paragrafo del blocco {disponibilita} quando c'è posto
  disp_pieno       TEXT        paragrafo quando il turno è pieno
  creato_da, creato_at, aggiornato_at

clienti_impostazioni: chiave `risposte_link_prenotazione` (vuota: la scrive Marco dalla pagina).

Solo CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE. DB: clienti.sqlite3.
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
            CREATE TABLE IF NOT EXISTS clienti_risposte_template (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                nome             TEXT NOT NULL,
                attivo           INTEGER NOT NULL DEFAULT 1,
                occasione_data   TEXT,
                occasione_turno  TEXT,
                pax_prova        INTEGER NOT NULL DEFAULT 2,
                menu_template_id INTEGER,
                oggetto          TEXT,
                testo_mail       TEXT,
                testo_wa         TEXT,
                disp_posto       TEXT,
                disp_pieno       TEXT,
                creato_da        TEXT,
                creato_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                aggiornato_at    TEXT
            )
        """)
        try:
            cconn.execute(
                "INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)",
                ("risposte_link_prenotazione", "",
                 "Link diretto alla prenotazione messo nei template di risposta (blocco {link_prenotazione})"))
        except sqlite3.OperationalError:
            print("  · clienti_impostazioni non c'è ancora: la chiave nasce al primo salvataggio")
        cconn.commit()
        print("  + [246] clienti_risposte_template")
    finally:
        cconn.close()
