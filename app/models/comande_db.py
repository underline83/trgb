# @version: v1.0 (2026-11-24) — comande prese da TRGB, in prova
# -*- coding: utf-8 -*-
"""
Database Comande — TRGB Gestionale. Modulo: comande. [core]

Un «conto» è un tavolo aperto in sala: si apre col numero di coperti, si
riempie di righe (cosa è stato ordinato, per uscita) e si manda ai reparti
(cucina, sala). Il conto lo chiude la Cassa, che arriverà dopo: finché non c'è,
ogni conto nasce IN PROVA (`prova = 1`) e non vale niente fuori da TRGB
(decisione di Marco del 24/11/2026). Doc: docs/modulo_comande.md.

Contiene:
- comande_conti            — testata: tavolo, coperti, stato, uscita in corso
- comande_righe            — righe battute: articolo, quantità, prezzo, uscita, reparto, stato
- comande_invii            — ogni invio a un reparto (comanda, via, storno), con la
                             fotografia delle righe: è quello che il ponte stamperà
- comande_reparti          — dove vanno le comande (seme: cucina e sala, come le stampanti)
- comande_gruppi_reparto   — gruppo del catalogo → reparto, quando la regola
                             cibo/bevande/servizio non basta
- comande_config           — impostazioni del modulo (uscite, reparti di default)

DB separato `comande.sqlite3` nella cartella dati del locale. Niente
migrazioni numerate: schema al boot (CREATE TABLE IF NOT EXISTS), come
pratiche_db.py e cassa_conti_db.py. Orari in ora italiana.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("comande.sqlite3")

# Valori iniziali: si cambiano da Impostazioni (comande_config), mai nel codice.
CONFIG_INIZIALE = {
    "uscite_numero": "4",        # uscite proposte in sala (1ª … 4ª), oltre a «subito»
    "uscita_food": "1",          # uscita di partenza per i piatti
    "uscita_beverage": "0",      # 0 = «subito»: da bere esce appena inviato
    "uscita_servizio": "0",      # caffè, acqua, coperto: «subito»
    "reparto_food": "cucina",    # dove va il cibo se il gruppo non dice altro
    "reparto_beverage": "sala",  # dove vanno le bevande se il gruppo non dice altro
    "reparto_servizio": "sala",  # caffè, acqua, tè (sezione «servizio» della carta)
}
# I reparti seguono le due stampanti comande dell'osteria (SALA e CUCINA).
REPARTI_INIZIALI = (
    ("cucina", "Cucina", 1),
    ("sala", "Sala", 2),
)


def get_comande_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _indice(cur, nome: str, sql: str) -> None:
    """Crea l'indice solo se manca: a regime niente scritture su sqlite_master."""
    if not cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (nome,)
    ).fetchone():
        cur.execute(sql)


def init_comande_db() -> None:
    """Crea lo schema se manca e semina reparti e impostazioni. Idempotente."""
    conn = get_comande_conn()
    try:
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_conti (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                tavolo_id        INTEGER,                    -- tavoli.id (DB clienti: niente FK)
                tavolo           TEXT NOT NULL,              -- nome del tavolo al momento dell'apertura
                zona             TEXT,                       -- sala del tavolo (Osteria, Dehor…)
                coperti          INTEGER NOT NULL DEFAULT 0,
                stato            TEXT NOT NULL DEFAULT 'aperto'
                                 CHECK (stato IN ('aperto','chiuso','annullato')),
                prova            INTEGER NOT NULL DEFAULT 1, -- 1 = conto di prova (finché non c'è la Cassa)
                uscita_corrente  INTEGER NOT NULL DEFAULT 0, -- ultima uscita mandata «via»
                nota             TEXT,
                prenotazione_id  INTEGER,                    -- clienti_prenotazioni.id (altro DB)
                cliente_id       INTEGER,                    -- clienti.id (altro DB)
                aperto_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                aperto_da        TEXT,
                chiuso_at        TEXT,
                chiuso_da        TEXT,
                aggiornato_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        _indice(cur, "idx_comande_conti_stato",
                "CREATE INDEX idx_comande_conti_stato ON comande_conti(stato, aperto_at)")
        # Un tavolo ha al massimo un conto aperto.
        _indice(cur, "uq_comande_conti_tavolo_aperto",
                "CREATE UNIQUE INDEX uq_comande_conti_tavolo_aperto "
                "ON comande_conti(tavolo_id) WHERE stato = 'aperto' AND tavolo_id IS NOT NULL")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_righe (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                conto_id         INTEGER NOT NULL REFERENCES comande_conti(id) ON DELETE CASCADE,
                articolo_codice  TEXT,                       -- codice del catalogo (0123, 0123C, B0045, C0012…)
                articolo_tipo    TEXT,                       -- vino_bottiglia, bevanda, piatto_carta…
                nome             TEXT NOT NULL,              -- come appare in comanda e sul conto
                gruppo           TEXT,                       -- gruppo del catalogo (Antipasti, Bottiglie…)
                famiglia         TEXT,                       -- food / beverage / servizio
                reparto          TEXT,                       -- comande_reparti.key; NULL = non va a nessun reparto
                prezzo_unitario  REAL NOT NULL DEFAULT 0,
                quantita         INTEGER NOT NULL DEFAULT 1 CHECK (quantita > 0),
                uscita           INTEGER NOT NULL DEFAULT 1, -- 0 = subito, 1…n = uscite
                varianti         TEXT,                       -- JSON: ["senza cipolla", …]
                nota             TEXT,
                stato            TEXT NOT NULL DEFAULT 'da_inviare'
                                 CHECK (stato IN ('da_inviare','inviata','stornata')),
                invio_id         INTEGER,                    -- comande_invii.id dell'invio che l'ha portata
                creata_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                creata_da        TEXT,
                aggiornata_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                stornata_at      TEXT,
                stornata_da      TEXT,
                motivo_storno    TEXT
            )
        """)
        _indice(cur, "idx_comande_righe_conto",
                "CREATE INDEX idx_comande_righe_conto ON comande_righe(conto_id, uscita, id)")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_invii (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                conto_id      INTEGER NOT NULL REFERENCES comande_conti(id) ON DELETE CASCADE,
                tipo          TEXT NOT NULL CHECK (tipo IN ('comanda','via','storno')),
                reparto       TEXT NOT NULL,
                uscita        INTEGER,                       -- per «via»: l'uscita che parte
                righe_json    TEXT,                          -- fotografia delle righe al momento dell'invio
                creato_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                creato_da     TEXT,
                stampato_at   TEXT,                          -- lo scrive il ponte (prossima versione)
                stampa_esito  TEXT
            )
        """)
        _indice(cur, "idx_comande_invii_reparto",
                "CREATE INDEX idx_comande_invii_reparto ON comande_invii(reparto, creato_at)")
        _indice(cur, "idx_comande_invii_conto",
                "CREATE INDEX idx_comande_invii_conto ON comande_invii(conto_id)")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_reparti (
                key     TEXT PRIMARY KEY,
                nome    TEXT NOT NULL,
                ordine  INTEGER NOT NULL DEFAULT 0,
                attivo  INTEGER NOT NULL DEFAULT 1
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_gruppi_reparto (
                gruppo       TEXT PRIMARY KEY,               -- nome del gruppo del catalogo
                reparto_key  TEXT                            -- NULL = il gruppo non va a nessun reparto
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_config (
                chiave  TEXT PRIMARY KEY,
                valore  TEXT
            )
        """)

        if not cur.execute("SELECT 1 FROM comande_reparti LIMIT 1").fetchone():
            cur.executemany(
                "INSERT INTO comande_reparti (key, nome, ordine) VALUES (?, ?, ?)", REPARTI_INIZIALI
            )
        for chiave, valore in CONFIG_INIZIALE.items():
            cur.execute(
                "INSERT OR IGNORE INTO comande_config (chiave, valore) VALUES (?, ?)", (chiave, valore)
            )
        conn.commit()
    finally:
        conn.close()
