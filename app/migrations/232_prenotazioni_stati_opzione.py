# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 232 — Stati delle prenotazioni in tabella + «In opzione» e «Lista d'attesa» (2026-11-13)

Contesto (Marco, 13/11/2026): servono stati per le pre-prenotazioni (richieste di
tavolo e preventivi in attesa):
  - OPTION  «In opzione»: tocca al cliente, il tavolo è tenuto fino a una data
            (tenuto_fino_al, o la scadenza del preventivo collegato). Alla
            scadenza niente di automatico: avviso e decide lui. I coperti si
            contano a parte («48 coperti + 12 in opzione»).
  - WAITLIST «Lista d'attesa»: non occupa tavoli, avviso quando nel turno si
            libera un posto.
E gli stati smettono di essere copiati a mano nel codice: stanno qui
(servizio app/services/prenotazioni_stati.py).

clienti.sqlite3:
  prenotazioni_stati (nuova)              codice PK, etichetta, emoji, tono, ordine,
                                          occupa, venuto, fuori, incerta, solo_trgb
  prenotazioni_stati_transizioni (nuova)  da, a, ordine — passaggi permessi a mano
  clienti_prenotazioni                    + tenuto_fino_al TEXT (AAAA-MM-GG)
                                          + opzione_avvisata TEXT (scadenza già avvisata)
  prenotazioni_config                     + opzione_giorni_default, avvisi_prenotazioni_ruoli

Solo CREATE TABLE IF NOT EXISTS, ADD COLUMN senza NOT NULL e INSERT OR IGNORE:
rieseguirla non cambia niente (e non tocca etichette già modificate).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn è foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    from app.services.prenotazioni_stati import DEFAULT_STATI, DEFAULT_TRANSIZIONI

    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    c = sqlite3.connect(str(CLIENTI_DB))
    try:
        c.execute("""
            CREATE TABLE IF NOT EXISTS prenotazioni_stati (
                codice     TEXT PRIMARY KEY,
                etichetta  TEXT NOT NULL,
                emoji      TEXT,
                tono       TEXT,
                ordine     INTEGER NOT NULL DEFAULT 0,
                occupa     INTEGER NOT NULL DEFAULT 1,
                venuto     INTEGER NOT NULL DEFAULT 0,
                fuori      INTEGER NOT NULL DEFAULT 0,
                incerta    INTEGER NOT NULL DEFAULT 0,
                solo_trgb  INTEGER NOT NULL DEFAULT 0
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS prenotazioni_stati_transizioni (
                da      TEXT NOT NULL,
                a       TEXT NOT NULL,
                ordine  INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (da, a)
            )
        """)
        c.executemany(
            """INSERT OR IGNORE INTO prenotazioni_stati
               (codice, etichetta, emoji, tono, ordine, occupa, venuto, fuori, incerta, solo_trgb)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            DEFAULT_STATI,
        )
        c.executemany(
            "INSERT OR IGNORE INTO prenotazioni_stati_transizioni (da, a, ordine) VALUES (?, ?, ?)",
            [(da, a, i) for da, lista in DEFAULT_TRANSIZIONI.items() for i, a in enumerate(lista)],
        )
        if c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_prenotazioni'").fetchone():
            esistenti = {r[1] for r in c.execute("PRAGMA table_info(clienti_prenotazioni)")}
            for nome in ("tenuto_fino_al", "opzione_avvisata"):
                if nome not in esistenti:
                    c.execute(f"ALTER TABLE clienti_prenotazioni ADD COLUMN {nome} TEXT")
                    print(f"  + [232] clienti_prenotazioni.{nome}")
            c.execute("CREATE INDEX IF NOT EXISTS idx_cp_stato_data ON clienti_prenotazioni(stato, data_pasto)")
        if c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prenotazioni_config'").fetchone():
            c.executemany(
                "INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES (?, ?, ?)",
                [
                    ("opzione_giorni_default", "7",
                     "In opzione: giorni proposti per «tenuto fino al» (prenotazioni senza preventivo; con il preventivo vale la sua scadenza)"),
                    ("avvisi_prenotazioni_ruoli", "admin,capo_sala",
                     "Ruoli che ricevono nel campanello gli avvisi di opzioni scadute e di posti liberati per la lista d'attesa"),
                ],
            )
        c.commit()
        print("  + [232] prenotazioni_stati, prenotazioni_stati_transizioni (OPTION, WAITLIST)")
    finally:
        c.close()
