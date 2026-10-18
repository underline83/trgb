# @version: v1.0 (2026-10-18) — conti chiusi scaricati da iPratico Cloud
# -*- coding: utf-8 -*-
"""
Database Conti di cassa — TRGB Gestionale. Modulo: cassa. [core]

Un «conto» è un tavolo (o un banco) chiuso in cassa: in iPratico è un ORDER.
Se il conto è pagato alla romana, all'ordine corrispondono più scontrini
(payment session) con lo stesso order_id: qui restano UNA riga di conto, con i
numeri degli scontrini in `documenti`. Doc: docs/analisi_ipratico_cloud.md.

Contiene:
- cassa_conti         — testata: tavolo, sala, coperti, orari, totale, pagamenti
- cassa_conti_righe   — cosa è stato servito: piatto, categoria, portata, prezzo
- cassa_import_log    — ogni scarico (giorno, esito, quanti conti), per il controllo
- cassa_tavoli_alias  — nomi dei tavoli della cassa → tavoli TRGB, quando non bastano le regole
- cassa_config        — impostazioni del modulo (es. finestra di abbinamento)

DB separato `cassa_conti.sqlite3` nella cartella dati del locale. Niente
migrazioni numerate: schema al boot (CREATE TABLE IF NOT EXISTS), come
pratiche_db.py. Gli orari sono salvati in ora ITALIANA (iPratico li dà in UTC).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("cassa_conti.sqlite3")


def get_cassa_conti_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_cassa_conti_db() -> None:
    """Crea lo schema se manca. Idempotente."""
    conn = get_cassa_conti_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cassa_conti (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            fonte             TEXT NOT NULL DEFAULT 'ipratico',
            order_id          TEXT NOT NULL UNIQUE,      -- id dell'ordine nella cassa
            data_rif          TEXT NOT NULL,             -- giorno contabile (AAAA-MM-GG)
            aperto_at         TEXT,                      -- apertura tavolo, ora italiana
            chiuso_at         TEXT,                      -- ultimo pagamento, ora italiana
            durata_min        INTEGER,
            tavolo            TEXT,                      -- nome com'è in cassa ("Tavolo 10", "18")
            sala              TEXT,                      -- sala com'è in cassa ("Sala", "Giardino")
            coperti           INTEGER,
            totale            REAL NOT NULL DEFAULT 0,   -- somma dei pagamenti
            sconti            REAL NOT NULL DEFAULT 0,
            n_documenti       INTEGER NOT NULL DEFAULT 1,
            documenti         TEXT,                      -- "19" o "8, 9, 10" o "2026/203"
            tipi_documento    TEXT,                      -- "fiscal.bill", "invoice", …
            romana            INTEGER NOT NULL DEFAULT 0,
            pagamenti_json    TEXT,                      -- [{"metodo": "credit-card", "importo": 800}]
            cliente_cassa_id  TEXT,                      -- cliente associato in cassa (di solito per fattura)
            chiusura_id       TEXT,                      -- chiusura Z della cassa
            -- Abbinamento al cliente (ponte cassa ↔ prenotazioni, app/services/abbinamento_conti_service.py)
            turno             TEXT,                      -- pranzo / cena (soglia delle prenotazioni)
            abbinamento       TEXT NOT NULL DEFAULT 'da_fare'
                              CHECK (abbinamento IN ('da_fare','proposto','auto','manuale','passaggio','banco')),
            prenotazione_id   INTEGER,                   -- clienti_prenotazioni.id (altro DB: niente FK)
            cliente_id        INTEGER,                   -- clienti.id (altro DB: niente FK)
            abbinato_da       TEXT,
            abbinato_at       TEXT,
            importato_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            aggiornato_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cassa_conti_data ON cassa_conti(data_rif)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cassa_conti_tavolo ON cassa_conti(data_rif, tavolo)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cassa_conti_cliente ON cassa_conti(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cassa_conti_pren ON cassa_conti(prenotazione_id)")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cassa_conti_righe (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            conto_id        INTEGER NOT NULL REFERENCES cassa_conti(id) ON DELETE CASCADE,
            riga_id         TEXT,                        -- id della riga nella cassa
            prodotto_id     TEXT,                        -- id del prodotto nella cassa
            nome            TEXT NOT NULL,
            categoria       TEXT,                        -- Antipasti, Primi, Calici, Bottiglie…
            famiglia        TEXT,                        -- food / beverage
            portata         INTEGER,                     -- 0 = subito, poi 1, 2, 3…
            quantita        REAL NOT NULL DEFAULT 1,
            prezzo_unitario REAL,
            totale          REAL NOT NULL DEFAULT 0,
            servizio        INTEGER NOT NULL DEFAULT 0,  -- 1 = coperto/servizio
            inviata_at      TEXT,                        -- invio in cucina/bar, ora italiana
            battuta_da      TEXT                         -- dispositivo/operatore ("SALA", "Cassa")
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cassa_righe_conto ON cassa_conti_righe(conto_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cassa_righe_prodotto ON cassa_conti_righe(prodotto_id)")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cassa_import_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            fonte        TEXT NOT NULL DEFAULT 'ipratico',
            giorno       TEXT NOT NULL,
            esito        TEXT NOT NULL CHECK (esito IN ('ok','errore')),
            conti        INTEGER NOT NULL DEFAULT 0,
            righe        INTEGER NOT NULL DEFAULT 0,
            totale       REAL NOT NULL DEFAULT 0,
            errore       TEXT,
            avviato_da   TEXT,                           -- 'notte' o username
            fatto_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cassa_import_giorno ON cassa_import_log(giorno)")

    # Nomi dei tavoli della cassa che non si capiscono da soli ("Tavolone" → "T1").
    # I casi normali ("Tavolo 04C" = "4C") li risolve la normalizzazione nel codice.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cassa_tavoli_alias (
            nome_cassa   TEXT PRIMARY KEY,               -- com'è in cassa, es. "Tavolone"
            nome_trgb    TEXT,                           -- tavolo TRGB; NULL = da ignorare (banco, conti a nome)
            aggiornato_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # Impostazioni del modulo (chiave/valore), con i default al primo avvio.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cassa_config (
            chiave  TEXT PRIMARY KEY,
            valore  TEXT
        )
    """)
    cur.execute(
        "INSERT OR IGNORE INTO cassa_config (chiave, valore) VALUES ('abbinamento_finestra_minuti', '150')"
    )

    conn.commit()
    conn.close()
