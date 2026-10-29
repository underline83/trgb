# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 216 — Vendita online automatica per fascia (2026-10-29)

Passo 3 della disponibilità per tavoli: il motore per tavoli decide, fascia per
fascia, se TheFork (e il sito) possono ancora vendere. Online aperto finché in
quella fascia entra un tavolo da `soglia_online_tavolo` persone (default 6).

prenotazioni_fasce.online_modo   NULL = decide il motore; 'manuale' = deciso a mano
                                 dalla sala (il motore non lo tocca); 'auto' = scritto dal motore
prenotazioni_fasce_auto          cosa vuole il motore per ogni fascia (anche in prova):
                                 data_pasto, ora, turno, vuole_aperto 1/0, motivo, updated_at
                                 PK(data_pasto, ora)

tavoli.nomi_meta                 nomi delle due metà di un tavolo dividibile, es. «4, 4C»
                                 (vuoto = «4A, 4B»): il motore usa anche le metà da sole

Config (prenotazioni_config):
  online_automatico         'prova'  spento | prova (calcola e mostra, non tocca TheFork) | attivo
  online_automatico_giorni  14       quanti giorni avanti controlla

Solo ADD COLUMN se manca / CREATE IF NOT EXISTS / INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    if not CLIENTI_DB.exists():
        return
    c = sqlite3.connect(str(CLIENTI_DB))
    try:
        try:
            colonne = {r[1] for r in c.execute("PRAGMA table_info(prenotazioni_fasce)")}
            if colonne and "online_modo" not in colonne:
                c.execute("ALTER TABLE prenotazioni_fasce ADD COLUMN online_modo TEXT")
        except sqlite3.OperationalError:
            pass
        try:  # nomi delle due metà di un tavolo dividibile («4, 4C»); vuoto = «4A, 4B»
            colonne = {r[1] for r in c.execute("PRAGMA table_info(tavoli)")}
            if colonne and "nomi_meta" not in colonne:
                c.execute("ALTER TABLE tavoli ADD COLUMN nomi_meta TEXT")
        except sqlite3.OperationalError:
            pass
        c.execute("""
            CREATE TABLE IF NOT EXISTS prenotazioni_fasce_auto (
                data_pasto   TEXT NOT NULL,
                ora          TEXT NOT NULL,
                turno        TEXT NOT NULL,
                vuole_aperto INTEGER NOT NULL DEFAULT 1,
                motivo       TEXT,
                updated_at   TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (data_pasto, ora)
            )
        """)
        try:
            c.execute("""
                INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
                ('online_automatico', 'prova', 'Vendita online per fascia decisa dal motore per tavoli: spento | prova | attivo'),
                ('online_automatico_giorni', '14', 'Quanti giorni avanti il motore controlla la vendita online')
            """)
        except sqlite3.OperationalError:
            pass
        c.commit()
        print("  + [216] prenotazioni_fasce.online_modo, prenotazioni_fasce_auto, online_automatico, tavoli.nomi_meta")
    finally:
        c.close()
