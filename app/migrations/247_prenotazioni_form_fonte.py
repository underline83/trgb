# Modulo: prenotazioni + clienti (il form di TRGB come fonte delle prenotazioni) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 247 — Il form «Nuova prenotazione» come fonte, persone della scheda (2026-11-26)

Contesto (Marco, 26/11): «il form di inserimento dati… da ora vorrei che diventasse la
nostra fonte, non inseriremo più da TheFork». TRGB manda a TheFork le prenotazioni prese
a mano (provato il 26/11: creare, modificare e cancellare funzionano con lo scope base).

clienti_persone                       i «parenti stretti» nella stessa scheda cliente
  id, cliente_id, nome, relazione, creato_da, created_at     (UNIQUE cliente_id + nome)

clienti_prenotazioni
  persona_nome        TEXT   chi ha prenotato, se non è il titolare della scheda
  thefork_invio       TEXT   NULL = non riguarda TheFork · da_mandare · inviata · no · errore
  thefork_invio_nota  TEXT   perché (orario chiuso online, manca l'email, da confermare…)
  thefork_invio_at    TEXT   ultimo tentativo

prenotazioni_config
  thefork_invio_attivo        0/1   nasce SPENTO: lo accende Marco da Impostazioni › TheFork
  thefork_email_servizio      modello dell'email per chi non ne ha una, con {numero}
                              (vuoto: senza email vera la prenotazione resta solo in TRGB)
  thefork_titolo_predefinito  titolo mandato a TheFork quando la scheda non ne ha uno

Solo CREATE TABLE IF NOT EXISTS, ADD COLUMN, INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")

COLONNE = (
    ("persona_nome", "TEXT"),
    ("thefork_invio", "TEXT"),
    ("thefork_invio_nota", "TEXT"),
    ("thefork_invio_at", "TEXT"),
)
CONFIG = (
    ("thefork_invio_attivo", "0",
     "1 = le prenotazioni prese a mano in TRGB partono anche per TheFork"),
    ("thefork_email_servizio", "",
     "Email mandata a TheFork per chi non ne ha una: un indirizzo vostro con {numero} (es. casella+{numero}@dominio)"),
    ("thefork_titolo_predefinito", "mx",
     "Titolo mandato a TheFork quando la scheda cliente non ne ha uno (mr, mrs, ms, mx…)"),
)


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_persone (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id  INTEGER NOT NULL,
                nome        TEXT NOT NULL,
                relazione   TEXT,
                creato_da   TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE (cliente_id, nome)
            )
        """)
        try:
            presenti = {r[1] for r in cconn.execute("PRAGMA table_info(clienti_prenotazioni)")}
            for nome, tipo in COLONNE:
                if presenti and nome not in presenti:
                    cconn.execute(f"ALTER TABLE clienti_prenotazioni ADD COLUMN {nome} {tipo}")
        except sqlite3.OperationalError as e:
            print(f"  · clienti_prenotazioni: {e}")
        try:
            for chiave, valore, descr in CONFIG:
                cconn.execute(
                    "INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES (?, ?, ?)",
                    (chiave, valore, descr))
        except sqlite3.OperationalError:
            print("  · prenotazioni_config non c'è ancora")
        cconn.commit()
        print("  + [247] clienti_persone, clienti_prenotazioni.thefork_invio*, config invio TheFork")
    finally:
        cconn.close()
