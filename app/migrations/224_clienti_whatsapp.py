# Modulo: clienti (check WhatsApp in sola lettura) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 224 — Archivio WhatsApp in sola lettura (2026-11-02)

Contesto (Marco): il giro del mattino deve sapere chi aspetta una risposta su
WhatsApp e se una proposta è già partita. Il numero del locale resta sull'app
WhatsApp Business del telefono; con la «coexistence» di Meta (Cloud API sullo
stesso numero) una copia dei messaggi arriva al webhook di TRGB. TRGB LEGGE
soltanto: non manda niente ai clienti.

clienti_wa_messaggi — un messaggio (in arrivo o mandato dall'app)
  wamid       TEXT UNIQUE  id del messaggio WhatsApp (niente doppioni fra
                           webhook, eco e storico)
  numero      TEXT         numero del cliente, solo cifre con prefisso (wa_id)
  direzione   TEXT         'in' (dal cliente) | 'out' (dal locale)
  tipo        TEXT         text, image, document, audio, reaction, media_placeholder…
  testo       TEXT         testo o didascalia (niente file: i media non si scaricano)
  ts          INTEGER      orario del messaggio (unix, secondi)
  fonte       TEXT         'webhook' | 'eco' | 'storico'
  ricevuto_at TEXT

clienti_wa_contatti — chi c'è dietro un numero
  numero        TEXT PK
  nome_profilo  TEXT  il nome che il cliente si è dato su WhatsApp
  nome_rubrica  TEXT  il nome in rubrica dell'app Business (sincronizzazione contatti)
  aggiornato_at TEXT

clienti_wa_eventi — registro dei webhook ricevuti, SENZA contenuto dei messaggi
  (il payload grezzo si tiene solo se l'elaborazione fallisce, per capire perché)

La conservazione (giorni) sta in clienti_impostazioni.wa_conservazione_giorni,
il collegamento (waba, numero) in clienti_impostazioni.wa_* — nessun segreto nel DB.

Solo CREATE TABLE IF NOT EXISTS + indici + INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")

_INDICI = {
    "idx_cwm_numero_ts": "CREATE INDEX idx_cwm_numero_ts ON clienti_wa_messaggi(numero, ts)",
    "idx_cwm_ts": "CREATE INDEX idx_cwm_ts ON clienti_wa_messaggi(ts)",
    "idx_cwe_ricevuto": "CREATE INDEX idx_cwe_ricevuto ON clienti_wa_eventi(ricevuto_at)",
}


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_wa_messaggi (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                wamid       TEXT NOT NULL UNIQUE,
                numero      TEXT NOT NULL,
                direzione   TEXT NOT NULL CHECK (direzione IN ('in','out')),
                tipo        TEXT,
                testo       TEXT,
                ts          INTEGER NOT NULL,
                fonte       TEXT NOT NULL,
                ricevuto_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_wa_contatti (
                numero        TEXT PRIMARY KEY,
                nome_profilo  TEXT,
                nome_rubrica  TEXT,
                aggiornato_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_wa_eventi (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ricevuto_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                campo       TEXT,
                messaggi    INTEGER NOT NULL DEFAULT 0,
                esito       TEXT,
                errore      TEXT,
                payload     TEXT
            )
        """)
        for nome, sql in _INDICI.items():
            if not cconn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (nome,)
            ).fetchone():
                cconn.execute(sql)
        cconn.execute("""
            INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione) VALUES
            ('wa_conservazione_giorni', '90',
             'WhatsApp: per quanti giorni si tengono i messaggi letti dal numero del locale (poi si cancellano da soli)')
        """)
        cconn.commit()
        print("  + [224] clienti_wa_messaggi, clienti_wa_contatti, clienti_wa_eventi")
    finally:
        cconn.close()
