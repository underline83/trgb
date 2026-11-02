# @version: v1.1 (2026-11-02) — sezioni, campi del debito, «in attesa di mezzi»
# -*- coding: utf-8 -*-
"""
Database Pratiche — TRGB Gestionale. Modulo: pratiche.

Una pratica è uno scambio formale con qualcuno di esterno (ente, fornitore,
studio, creditore) che aspetta un esito. Doc: docs/modulo_pratiche.md.

Contiene:
- pratiche               — testata: titolo, controparte, stato, termine, esito,
                           sezione, atto e importi del debito, «in attesa di mezzi»
- pratiche_passi         — storia della pratica, SOLO aggiunte (nessun UPDATE/DELETE)
- pratiche_collegamenti  — rimandi ad altri moduli (modulo, tipo, id, etichetta)
- pratiche_sezioni       — le sezioni (Agenzia Entrate, Riscossione…), le decide Marco
- pratiche_tipi_atto     — i tipi d'atto con il loro gradino nella scala
- pratiche_config        — valori regolabili (giorni fra una revisione e l'altra)

DB separato `pratiche.sqlite3` nella cartella dati del locale. Niente
migrazioni numerate: lo schema nasce al boot (CREATE TABLE IF NOT EXISTS),
come tasks_db.py. Le colonne nuove si aggiungono con ADD COLUMN idempotente,
SEMPRE nullable, e solo dopo una copia di backup del file (v1.1).
"""

import sqlite3
from datetime import datetime
from pathlib import Path

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("pratiche.sqlite3")

STATI = ("tocca_a_me", "tocca_a_loro", "chiusa")

# v1.1 (2026-11-02): colonne aggiunte alla testata e ai passi. Tutte nullable:
# NULL = «non scritto» (in_attesa_mezzi NULL vale 0).
COLONNE_PRATICHE_V11 = (
    ("sezione_id", "INTEGER"),
    ("tipo_atto_id", "INTEGER"),
    ("rif_atto", "TEXT"),
    ("periodo", "TEXT"),
    ("importo_dovuto", "REAL"),
    ("importo_residuo", "REAL"),
    ("in_attesa_mezzi", "INTEGER"),
    ("revisione_il", "TEXT"),
)
COLONNE_PASSI_V11 = (
    ("modifiche", "TEXT"),   # JSON: [{"campo","da","a"}] dei campi cambiati dal passo
)

# Valori di partenza, scritti UNA volta (chiave seed_v11 in pratiche_config);
# da lì in poi li cambia Marco dalla pagina.
SEZIONI_INIZIALI = (
    "Agenzia Entrate",
    "Riscossione (ADER)",
    "Enti e fondi",
    "Tributi locali",
    "Fornitori e recupero crediti",
    "Legale",
)
# (nome, gradino, sezione in cui di solito sta)
TIPI_ATTO_INIZIALI = (
    ("Comunicazione di irregolarità", 1, "Agenzia Entrate"),
    ("Avviso bonario", 2, "Agenzia Entrate"),
    ("Cartella", 3, "Riscossione (ADER)"),
    ("Avviso di intimazione", 4, "Riscossione (ADER)"),
    ("Pignoramento", 5, "Riscossione (ADER)"),
)
CONFIG_INIZIALE = {"giorni_revisione": "30"}


def get_pratiche_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _colonne(cur, tabella: str) -> set:
    return {r[1] for r in cur.execute(f"PRAGMA table_info({tabella})").fetchall()}


def _backup(conn: sqlite3.Connection, motivo: str) -> str:
    """Copia coerente del DB (API backup di SQLite, gestisce il WAL) accanto al file."""
    dest = Path(DB_PATH).with_name(
        f"pratiche.sqlite3.bak-{motivo}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    )
    out = sqlite3.connect(str(dest))
    try:
        conn.backup(out)
    finally:
        out.close()
    return str(dest)


def init_pratiche_db() -> None:
    """Crea lo schema se manca. Idempotente."""
    conn = get_pratiche_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            titolo                TEXT NOT NULL,
            controparte           TEXT NOT NULL,
            controparte_contatto  TEXT,
            stato                 TEXT NOT NULL
                                  CHECK (stato IN ('tocca_a_me','tocca_a_loro','chiusa')),
            termine               TEXT,
            esito                 TEXT,
            aperta_il             TEXT NOT NULL,
            chiusa_il             TEXT,
            ultimo_passo_il       TEXT NOT NULL,
            creata_da             TEXT,
            creata_at             TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            aggiornata_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_passi (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pratica_id      INTEGER NOT NULL REFERENCES pratiche(id),
            data            TEXT NOT NULL,
            testo           TEXT NOT NULL,
            stato_da        TEXT,
            stato_a         TEXT,
            termine_da      TEXT,
            termine_a       TEXT,
            automatico      INTEGER NOT NULL DEFAULT 0,
            allegato_path   TEXT,
            allegato_nome   TEXT,
            autore          TEXT,
            creato_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_collegamenti (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            pratica_id  INTEGER NOT NULL REFERENCES pratiche(id),
            modulo      TEXT NOT NULL,
            tipo        TEXT NOT NULL,
            ref_id      TEXT NOT NULL,
            etichetta   TEXT NOT NULL,
            link        TEXT,
            creato_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── v1.1: sezioni, tipi d'atto, config ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_sezioni (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            ordine      INTEGER NOT NULL DEFAULT 0,
            attiva      INTEGER NOT NULL DEFAULT 1,
            creata_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_tipi_atto (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            gradino     INTEGER,
            sezione_id  INTEGER REFERENCES pratiche_sezioni(id),
            attivo      INTEGER NOT NULL DEFAULT 1,
            creato_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_config (
            chiave  TEXT PRIMARY KEY,
            valore  TEXT
        )
    """)

    # ── v1.1: colonne nuove, con backup prima ──
    mancano_p = [(c, t) for c, t in COLONNE_PRATICHE_V11 if c not in _colonne(cur, "pratiche")]
    mancano_s = [(c, t) for c, t in COLONNE_PASSI_V11 if c not in _colonne(cur, "pratiche_passi")]
    if mancano_p or mancano_s:
        n = cur.execute("SELECT COUNT(*) FROM pratiche").fetchone()[0]
        if n:
            conn.commit()
            print(f"  [pratiche] backup prima delle colonne v1.1: {_backup(conn, 'v11')}")
        for c, t in mancano_p:
            cur.execute(f"ALTER TABLE pratiche ADD COLUMN {c} {t}")
        for c, t in mancano_s:
            cur.execute(f"ALTER TABLE pratiche_passi ADD COLUMN {c} {t}")

    # ── v1.1: valori di partenza, una volta sola ──
    seed = cur.execute("SELECT valore FROM pratiche_config WHERE chiave = 'seed_v11'").fetchone()
    if not seed:
        for i, nome in enumerate(SEZIONI_INIZIALI, start=1):
            cur.execute("INSERT OR IGNORE INTO pratiche_sezioni (nome, ordine) VALUES (?, ?)",
                        (nome, i * 10))
        for nome, gradino, sezione in TIPI_ATTO_INIZIALI:
            sid = cur.execute("SELECT id FROM pratiche_sezioni WHERE nome = ?", (sezione,)).fetchone()
            cur.execute(
                "INSERT OR IGNORE INTO pratiche_tipi_atto (nome, gradino, sezione_id) VALUES (?, ?, ?)",
                (nome, gradino, sid[0] if sid else None),
            )
        for k, v in CONFIG_INIZIALE.items():
            cur.execute("INSERT OR IGNORE INTO pratiche_config (chiave, valore) VALUES (?, ?)", (k, v))
        cur.execute("INSERT INTO pratiche_config (chiave, valore) VALUES ('seed_v11', ?)",
                    (datetime.now().strftime("%Y-%m-%d %H:%M:%S"),))

    cur.execute("CREATE INDEX IF NOT EXISTS idx_pratiche_stato ON pratiche(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pratiche_sezione ON pratiche(sezione_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pratiche_passi_pratica ON pratiche_passi(pratica_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pratiche_coll_pratica ON pratiche_collegamenti(pratica_id)")

    conn.commit()
    conn.close()
