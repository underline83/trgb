# @version: v2.2 (2026-11-24) — traccia di ciò che il conto scrive in Prenotazioni (walk-in creati, stato e tavolo di prima); 2.1: ospite; 2.0: uscite
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
- comande_config           — impostazioni del modulo (uscite, reparti di default, coperto)
- comande_tasti_rapidi     — tasti a 0 € che avvisano un reparto («Stuzzico», «Pane»):
                             non sono articoli, sono segnali (v1.1); dalla v2.0 ognuno
                             può avere la sua uscita fissa (stuzzico nella 1, pane nella 2)
- comande_uscite           — stato di ogni uscita di un conto: attende o è andata,
                             quando, e quante volte è stata sollecitata (v2.0)

DB separato `comande.sqlite3` nella cartella dati del locale. Niente
migrazioni numerate: schema al boot (CREATE TABLE IF NOT EXISTS), come
pratiche_db.py e cassa_conti_db.py. Orari in ora italiana.

Seme del locale (v1.1): se esiste `locali/<locale>/seeds/comande.json`, alla
prima partenza dà i valori del locale (nome e prezzo del coperto, tasti rapidi)
al posto di quelli neutri qui sotto. Vale solo per ciò che ancora non c'è: dopo,
comanda Impostazioni. Nel codice non c'è niente di un locale preciso.
"""

import json
import logging
import sqlite3

from app.utils.locale_data import locale_data_dir, locale_data_path

logger = logging.getLogger(__name__)

DB_PATH = locale_data_path("comande.sqlite3")

# Valori iniziali: si cambiano da Impostazioni (comande_config), mai nel codice.
CONFIG_INIZIALE = {
    # Le quattro chiavi delle uscite fisse (1.x) non le legge più nessuno dalla 2.0, dove le
    # uscite sono libere: restano nel seme per non cambiare i DB già nati.
    "uscite_numero": "4",
    "uscita_food": "1",
    "uscita_beverage": "0",
    "uscita_servizio": "0",
    "reparto_food": "cucina",    # dove va il cibo se il gruppo non dice altro
    "reparto_beverage": "sala",  # dove vanno le bevande se il gruppo non dice altro
    "reparto_servizio": "sala",  # caffè, acqua, tè (sezione «servizio» della carta)
    # Coperto messo in conto da solo all'apertura (quantità = coperti). Neutro e
    # spento: nome e prezzo li dà il seme del locale o Impostazioni.
    "coperto_attivo": "0",
    "coperto_nome": "Coperto",
    "coperto_prezzo": "0",
    # Legare un tavolo a qualcuno aggiorna anche Prenotazioni (walk-in creati, «Seduto»,
    # «Completata», tavolo). Spento = il nome resta solo sul conto.
    "prenotazioni_aggiorna": "1",
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


def _colonna(cur, tabella: str, colonna: str, tipo: str) -> bool:
    """Aggiunge una colonna NULLABLE se manca (solo ADD COLUMN, mai NOT NULL). True se l'ha aggiunta."""
    if colonna in {r[1] for r in cur.execute(f"PRAGMA table_info({tabella})")}:
        return False
    cur.execute(f"ALTER TABLE {tabella} ADD COLUMN {colonna} {tipo}")
    return True


def _seme_locale() -> dict:
    """locali/<locale>/seeds/comande.json, se c'è: {config: {...}, tasti_rapidi: [...]}."""
    try:
        f = locale_data_dir().parent / "seeds" / "comande.json"
        if not f.exists():
            return {}
        dati = json.loads(f.read_text(encoding="utf-8"))
        return dati if isinstance(dati, dict) else {}
    except Exception as e:  # un seme rotto non ferma l'avvio
        logger.warning("Seme comande del locale non leggibile: %s", e)
        return {}


def _uscita_seme(t) -> "int | None":
    try:
        n = int((t or {}).get("uscita"))
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 20 else None


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

        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_tasti_rapidi (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                nome          TEXT NOT NULL,                 -- come esce in comanda («Stuzzico»)
                reparto_key   TEXT,                          -- comande_reparti.key; NULL = nessun reparto
                ogni_coperti  INTEGER NOT NULL DEFAULT 0,    -- quantità proposta: 0 = una; 1 = una a coperto;
                                                             -- 2 = una ogni due coperti (per difetto, almeno una)…
                ordine        INTEGER NOT NULL DEFAULT 0,
                attivo        INTEGER NOT NULL DEFAULT 1
            )
        """)

        # v2.0 — «vai e attendi»: un'uscita inviata o è andata o attende la chiamata.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS comande_uscite (
                conto_id        INTEGER NOT NULL REFERENCES comande_conti(id) ON DELETE CASCADE,
                numero          INTEGER NOT NULL,
                stato           TEXT NOT NULL DEFAULT 'attende' CHECK (stato IN ('attende','andata')),
                andata_at       TEXT,
                andata_da       TEXT,
                solleciti       INTEGER NOT NULL DEFAULT 0,
                sollecitata_at  TEXT,
                PRIMARY KEY (conto_id, numero)
            )
        """)
        # Gli invii di tipo «via» dicono cosa chiedono: vai, attendi, sollecito (NULL sugli altri).
        _colonna(cur, "comande_invii", "azione", "TEXT")
        # Chi è al tavolo (2.1): il nome della prenotazione legata al conto, scritto al momento
        # del collegamento così resta anche se la prenotazione poi cambia. prenotazione_id e
        # cliente_id ci sono dalla 1.0.
        _colonna(cur, "comande_conti", "ospite", "TEXT")
        # Cosa il conto ha scritto in Prenotazioni (2.2), per poterlo rimettere com'era se il
        # collegamento si toglie o il conto si annulla: la prenotazione l'ha creata lui (walk-in)?
        # Che stato e che tavolo aveva prima di sedersi?
        _colonna(cur, "comande_conti", "pren_creata", "INTEGER")
        _colonna(cur, "comande_conti", "pren_stato_prima", "TEXT")
        _colonna(cur, "comande_conti", "pren_tavolo_prima", "TEXT")
        # Uscita fissa di un tasto rapido (NULL = l'uscita in cui si sta battendo).
        tasti_senza_uscita = _colonna(cur, "comande_tasti_rapidi", "uscita", "INTEGER")

        if not cur.execute("SELECT 1 FROM comande_reparti LIMIT 1").fetchone():
            cur.executemany(
                "INSERT INTO comande_reparti (key, nome, ordine) VALUES (?, ?, ?)", REPARTI_INIZIALI
            )

        # Il seme del locale passa PRIMA dei valori neutri: riempie solo ciò che manca.
        seme = _seme_locale()
        for chiave, valore in (seme.get("config") or {}).items():
            if chiave in CONFIG_INIZIALE and valore is not None:
                cur.execute(
                    "INSERT OR IGNORE INTO comande_config (chiave, valore) VALUES (?, ?)",
                    (chiave, str(valore)),
                )
        if not cur.execute("SELECT 1 FROM comande_tasti_rapidi LIMIT 1").fetchone():
            for i, t in enumerate(seme.get("tasti_rapidi") or [], start=1):
                nome = " ".join(str((t or {}).get("nome") or "").split())
                if not nome:
                    continue
                try:
                    ogni = max(0, min(int(t.get("ogni_coperti") or 0), 20))
                except (TypeError, ValueError):
                    ogni = 0
                cur.execute(
                    "INSERT INTO comande_tasti_rapidi (nome, reparto_key, ogni_coperti, ordine, uscita) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (nome[:60], (str(t.get("reparto") or "").strip().lower() or None), ogni, i,
                     _uscita_seme(t)),
                )
        elif tasti_senza_uscita:
            # Tasti nati con la 1.1, prima che esistesse l'uscita fissa: la prendono dal seme, per nome.
            for t in seme.get("tasti_rapidi") or []:
                if _uscita_seme(t) is not None:
                    cur.execute(
                        "UPDATE comande_tasti_rapidi SET uscita = ? WHERE nome = ? AND uscita IS NULL",
                        (_uscita_seme(t), " ".join(str(t.get("nome") or "").split())[:60]),
                    )

        for chiave, valore in CONFIG_INIZIALE.items():
            cur.execute(
                "INSERT OR IGNORE INTO comande_config (chiave, valore) VALUES (?, ?)", (chiave, valore)
            )
        conn.commit()
    finally:
        conn.close()
