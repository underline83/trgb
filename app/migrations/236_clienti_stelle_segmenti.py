# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 236 — Stelle e segmenti dei clienti calcolati da TRGB (2026-11-16)

Decisione di Marco (16/11/2026): il rank di TheFork resta in scheda come
informazione ma non si usa più; TRGB ha un rank suo a stelle (massimo 6):
  - fino a 3 stelle NERE dalle visite (punti: visite recenti e vecchie, eventi
    confermati da preventivo, meno i no-show);
  - 1 o 2 stelle ARGENTO dallo scontrino medio a coperto (conti di cassa abbinati);
  - 1 stella ORO che mette solo Marco (superadmin), a mano.
I segmenti si ritarano sui dati veri: Di casa, Affezionato, Nuovo, Una volta,
In calo, Dormiente, Perso, Mai venuto.

clienti:
  stella_oro     INTEGER 0/1 (solo superadmin la cambia)
  stella_oro_da  chi l'ha messa · stella_oro_il quando
clienti_profilo (nuova): segmento e stelle calcolati, uno per cliente attivo,
  ricalcolati ogni notte e su richiesta (clienti_profilo_service).
clienti_impostazioni: le soglie (nessun valore operativo nel codice).

Solo ADD COLUMN, CREATE TABLE IF NOT EXISTS e INSERT OR IGNORE: idempotente.
DB toccato: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")

SOGLIE = [
    # segmenti
    ("seg_dicasa_visite", "3", "Di casa: visite minime negli ultimi N mesi (seg_dicasa_mesi)"),
    ("seg_dicasa_mesi", "12", "Di casa: finestra in mesi"),
    ("seg_affezionato_visite", "2", "Affezionato: visite minime negli ultimi N mesi (seg_affezionato_mesi)"),
    ("seg_affezionato_mesi", "24", "Affezionato: finestra in mesi"),
    ("seg_attivo_mesi", "12", "Affezionato: ultima visita entro N mesi (oltre, chi tornava è In calo)"),
    ("seg_recente_mesi", "24", "Una volta / In calo: ultima visita entro N mesi (oltre: Dormiente)"),
    ("seg_perso_anni", "5", "Perso: ultima visita oltre N anni"),
    ("seg_nuovo_giorni", "90", "Nuovo: prima e unica visita negli ultimi N giorni"),
    # stelle nere (punti)
    ("stelle_mesi_recenti", "24", "Stelle: quali visite contano come recenti (ultimi N mesi)"),
    ("stelle_punti_recente", "10", "Stelle: punti per ogni visita recente"),
    ("stelle_max_recenti", "60", "Stelle: tetto ai punti delle visite recenti"),
    ("stelle_punti_vecchia", "3", "Stelle: punti per ogni visita più vecchia"),
    ("stelle_max_vecchie", "15", "Stelle: tetto ai punti delle visite vecchie"),
    ("stelle_punti_evento", "15", "Stelle: punti per ogni evento confermato da preventivo"),
    ("stelle_malus_noshow", "15", "Stelle: punti tolti per ogni no-show"),
    ("stelle_soglia_1", "10", "Stelle: punti per la prima stella nera"),
    ("stelle_soglia_2", "20", "Stelle: punti per la seconda stella nera"),
    ("stelle_soglia_3", "40", "Stelle: punti per la terza stella nera"),
    # stelle argento (scontrino medio a coperto)
    ("argento_soglia_1", "75", "Stella argento: scontrino medio a coperto (euro) per la prima"),
    ("argento_soglia_2", "90", "Stella argento: scontrino medio a coperto (euro) per la seconda"),
    # attenzione
    ("attenzione_noshow", "2", "Etichetta Attenzione: dai N no-show in su"),
]


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cols = {r[1] for r in cconn.execute("PRAGMA table_info(clienti)").fetchall()}
        if "stella_oro" not in cols:
            cconn.execute("ALTER TABLE clienti ADD COLUMN stella_oro INTEGER NOT NULL DEFAULT 0")
            # SQLite non sempre popola le righe esistenti con ADD COLUMN NOT NULL DEFAULT
            cconn.execute("UPDATE clienti SET stella_oro = 0 WHERE stella_oro IS NULL")
            print("  + [236] clienti.stella_oro")
        if "stella_oro_da" not in cols:
            cconn.execute("ALTER TABLE clienti ADD COLUMN stella_oro_da TEXT")
        if "stella_oro_il" not in cols:
            cconn.execute("ALTER TABLE clienti ADD COLUMN stella_oro_il TEXT")

        if not cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_profilo'"
        ).fetchone():
            cconn.execute("""
                CREATE TABLE IF NOT EXISTS clienti_profilo (
                    cliente_id      INTEGER PRIMARY KEY,
                    segmento        TEXT NOT NULL,
                    punti           INTEGER NOT NULL DEFAULT 0,
                    stelle_nere     INTEGER NOT NULL DEFAULT 0,
                    stelle_argento  INTEGER NOT NULL DEFAULT 0,
                    scontrino_medio REAL,
                    conti_cassa     INTEGER NOT NULL DEFAULT 0,
                    visite          INTEGER NOT NULL DEFAULT 0,
                    visite_recenti  INTEGER NOT NULL DEFAULT 0,
                    prima_visita    TEXT,
                    ultima_visita   TEXT,
                    no_show         INTEGER NOT NULL DEFAULT 0,
                    eventi          INTEGER NOT NULL DEFAULT 0,
                    attenzione      INTEGER NOT NULL DEFAULT 0,
                    aggiornato_at   TEXT
                )
            """)
            print("  + [236] clienti_profilo")
        for nome, sql in (
            ("idx_profilo_segmento", "CREATE INDEX idx_profilo_segmento ON clienti_profilo(segmento)"),
            ("idx_profilo_stelle", "CREATE INDEX idx_profilo_stelle ON clienti_profilo(stelle_nere, stelle_argento)"),
        ):
            if not cconn.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (nome,)).fetchone():
                cconn.execute(sql)

        if cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_impostazioni'"
        ).fetchone():
            cconn.executemany(
                "INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)",
                SOGLIE,
            )
            # seg_nuovo_giorni esisteva già: cambia solo il significato (prima e UNICA visita)
            cconn.execute(
                "UPDATE clienti_impostazioni SET descrizione = ? WHERE chiave = 'seg_nuovo_giorni'",
                ("Nuovo: prima e unica visita negli ultimi N giorni",),
            )
        cconn.commit()
    finally:
        cconn.close()
