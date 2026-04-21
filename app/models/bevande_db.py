# @version: v1.1-bevande-wal-protected
# -*- coding: utf-8 -*-
"""
Database Carta Bevande — TRGB Gestionale (sub-modulo del modulo Vini)

Gestisce le sezioni "statiche" della Carta delle Bevande:
Aperitivi, Birre, Amari fatti in casa, Amari & Liquori,
Distillati, Tisane, Tè. I Vini restano gestiti da fe_magazzino_vini;
qui esiste una sezione logica "vini" solo per l'ordinamento master.

Tabelle:
- bevande_sezioni  — configurazione sezione (layout, schema_form, ordine, intro)
- bevande_voci     — voci della carta (nome, descrizione, prezzo, campi specifici)

DB separato: app/data/bevande.sqlite3 (isolato da foodcost.db, come notifiche.sqlite3).
Riferimento design: docs/carta_bevande_design.md
"""

import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # .../trgb/
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "bevande.sqlite3"


def get_bevande_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Fix 1.11.2 (sessione 52) — WAL + synchronous=NORMAL + busy_timeout per
    # resistere a SIGTERM mid-write e prevenire corruzioni sqlite_master.
    # Applicato simmetricamente a tutti i DB vivi a runtime.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


# ─────────────────────────────────────────────
# SCHEMA INIT
# ─────────────────────────────────────────────

def init_bevande_db() -> None:
    """
    Crea tabelle e seed iniziale sezioni. Idempotente.
    Chiamata dalla migration 089 e da main.py al boot (safety net).
    """
    conn = get_bevande_conn()
    cur = conn.cursor()

    # ── TABELLA SEZIONI ──
    # Configurazione delle sezioni della carta (aperitivi, birre, vini, …).
    # La sezione 'vini' è logica: esiste per l'ordinamento master ma i dati
    # vengono letti da fe_magazzino_vini (nessuna duplicazione).
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bevande_sezioni (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            key          TEXT    NOT NULL UNIQUE,   -- 'aperitivi','birre','vini',…
            nome         TEXT    NOT NULL,
            intro_html   TEXT,                       -- testo introduttivo sopra sezione
            ordine       INTEGER NOT NULL DEFAULT 100,
            attivo       INTEGER NOT NULL DEFAULT 1,
            layout       TEXT    NOT NULL DEFAULT 'scheda_estesa',
                                                     -- 'tabella_4col' | 'scheda_estesa' | 'nome_badge_desc'
            schema_form  TEXT,                       -- JSON: elenco campi form per SezioneEditor dinamico
            created_at   TEXT DEFAULT (datetime('now','localtime')),
            updated_at   TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── TABELLA VOCI ──
    # Tabella piatta per tutte le voci di tutte le sezioni (no vini).
    # I campi non pertinenti a una sezione restano NULL.
    # 'extra' è catch-all JSON per campi futuri o inusuali.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bevande_voci (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            sezione_key   TEXT    NOT NULL,          -- FK logica a bevande_sezioni.key
            nome          TEXT    NOT NULL,
            sottotitolo   TEXT,                      -- 'IPA','TE NERO','TISANA DIGESTIVA','Riserva 18 mesi'
            descrizione   TEXT,                      -- blocco testo principale
            produttore    TEXT,                      -- 'DOMENIS','NONINO','CAPOVILLA','KOVAL'
            regione       TEXT,                      -- 'FRIULI-VENEZIA-GIULIA','SCOZIA - ISLAY'
            formato       TEXT,                      -- '33ml','70ml','a partire da 8€'
            gradazione    REAL,                      -- 5.0, 7.5 (% alc)
            ibu           INTEGER,                   -- solo birre
            tipologia     TEXT,                      -- 'Grappa','Rum','Whisky'; 'nero','verde','oolong'; 'digestiva','calmante'
            paese_origine TEXT,                      -- 'CINA','INDIA','GIAPPONE','SCOZIA'
            prezzo_eur    REAL,                      -- NULL se "a voce"
            prezzo_label  TEXT,                      -- override testuale ('a voce','da concordare')
            tags          TEXT,                      -- JSON array: ['bio','limited_edition']
            extra         TEXT,                      -- JSON catch-all per campi extra
            ordine        INTEGER NOT NULL DEFAULT 100,
            attivo        INTEGER NOT NULL DEFAULT 1,
            note_interne  TEXT,                      -- visibili solo nel PDF-staff
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            updated_at    TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_bevande_voci_sezione
            ON bevande_voci(sezione_key, ordine)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_bevande_voci_attivo
            ON bevande_voci(attivo)
    """)

    conn.commit()
    _seed_sezioni(cur)
    conn.commit()
    conn.close()


# ─────────────────────────────────────────────
# SEED
# ─────────────────────────────────────────────

# Schemi form per ogni sezione. Usati dall'editor per generare i form dinamici.
# Il render (layout PDF) è indipendente: guidato da bevande_sezioni.layout.
_SCHEMA_FORM = {
    "aperitivi": {
        "fields": [
            {"key": "nome",        "label": "Nome",         "type": "text",     "required": True},
            {"key": "descrizione", "label": "Descrizione",  "type": "textarea", "rows": 3},
            {"key": "prezzo_eur",  "label": "Prezzo €",     "type": "number",   "step": 0.5},
            {"key": "note_interne","label": "Note interne (solo staff)", "type": "textarea", "rows": 2},
        ]
    },
    "birre": {
        "fields": [
            {"key": "nome",        "label": "Nome",               "type": "text",     "required": True},
            {"key": "sottotitolo", "label": "Stile (IPA, Stout…)","type": "text"},
            {"key": "produttore",  "label": "Birrificio",         "type": "text"},
            {"key": "formato",     "label": "Formato",            "type": "text", "placeholder": "33ml"},
            {"key": "gradazione",  "label": "Gradazione % alc",   "type": "number", "step": 0.1},
            {"key": "ibu",         "label": "IBU",                "type": "number"},
            {"key": "descrizione", "label": "Descrizione",        "type": "textarea", "rows": 3},
            {"key": "prezzo_eur",  "label": "Prezzo €",           "type": "number", "step": 0.5},
            {"key": "note_interne","label": "Note interne",       "type": "textarea", "rows": 2},
        ]
    },
    "amari_casa": {
        "fields": [
            {"key": "nome",        "label": "Nome",         "type": "text", "required": True},
            {"key": "descrizione", "label": "Ingredienti / descrizione", "type": "textarea", "rows": 3},
            {"key": "gradazione",  "label": "Gradazione % alc (opz)", "type": "number", "step": 0.1},
            {"key": "prezzo_eur",  "label": "Prezzo €",     "type": "number", "step": 0.5},
            {"key": "note_interne","label": "Note interne", "type": "textarea", "rows": 2},
        ]
    },
    "amari_liquori": {
        "fields": [
            {"key": "nome",        "label": "Nome",                        "type": "text", "required": True},
            {"key": "produttore",  "label": "Produttore",                  "type": "text"},
            {"key": "regione",     "label": "Regione / Paese (opz)",       "type": "text"},
            {"key": "prezzo_eur",  "label": "Prezzo €",                    "type": "number", "step": 0.5},
            {"key": "descrizione", "label": "Note (opz)",                  "type": "textarea", "rows": 2},
            {"key": "note_interne","label": "Note interne",                "type": "textarea", "rows": 2},
        ]
    },
    "distillati": {
        "fields": [
            {"key": "tipologia",   "label": "Tipo",                        "type": "select",
             "options": [
                 {"value": "Grappa",  "label": "Grappa"},
                 {"value": "Rum",     "label": "Rum"},
                 {"value": "Whisky",  "label": "Whisky"},
                 {"value": "Cognac",  "label": "Cognac / Armagnac"},
                 {"value": "Altro",   "label": "Altro distillato"},
             ], "required": True},
            {"key": "regione",     "label": "Regione / Paese",             "type": "text"},
            {"key": "produttore",  "label": "Produttore",                  "type": "text"},
            {"key": "nome",        "label": "Nome / Annata",               "type": "text", "required": True},
            {"key": "prezzo_eur",  "label": "Prezzo €",                    "type": "number", "step": 0.5},
            {"key": "descrizione", "label": "Note (opz)",                  "type": "textarea", "rows": 2},
            {"key": "note_interne","label": "Note interne",                "type": "textarea", "rows": 2},
        ]
    },
    "tisane": {
        "fields": [
            {"key": "nome",        "label": "Nome",                        "type": "text", "required": True},
            {"key": "sottotitolo", "label": "Categoria (anti-stress, digestiva…)", "type": "text"},
            {"key": "descrizione", "label": "Ingredienti",                 "type": "textarea", "rows": 3},
            {"key": "prezzo_eur",  "label": "Prezzo € (opz)",              "type": "number", "step": 0.5},
            {"key": "note_interne","label": "Note interne",                "type": "textarea", "rows": 2},
        ]
    },
    "te": {
        "fields": [
            {"key": "nome",          "label": "Nome",                      "type": "text", "required": True},
            {"key": "tipologia",     "label": "Tipologia",                 "type": "select",
             "options": [
                 {"value": "nero",    "label": "Tè nero"},
                 {"value": "verde",   "label": "Tè verde"},
                 {"value": "oolong",  "label": "Tè oolong"},
                 {"value": "rosso",   "label": "Tè rosso"},
                 {"value": "puer",    "label": "Tè pu'er"},
                 {"value": "bianco",  "label": "Tè bianco"},
                 {"value": "tisana",  "label": "Altro / Infuso"},
             ], "required": True},
            {"key": "descrizione",   "label": "Descrizione",               "type": "textarea", "rows": 3},
            {"key": "paese_origine", "label": "Prodotto in",               "type": "text"},
            {"key": "prezzo_eur",    "label": "Prezzo € (opz)",            "type": "number", "step": 0.5},
            {"key": "note_interne",  "label": "Note interne",              "type": "textarea", "rows": 2},
        ]
    },
}

# Seed sezioni. L'ordine è quello del PDF vecchio (v17.23) con piccoli aggiustamenti.
# NB: 'vini' è presente come sezione logica per l'ordinamento master, ma layout='vini_dinamico'
#     segnala al renderer di chiamare il carta_vini_service anziché leggere da bevande_voci.
_SEED_SEZIONI = [
    {
        "key": "aperitivi", "nome": "Aperitivi",
        "intro_html": None,
        "ordine": 10, "layout": "scheda_estesa",
    },
    {
        "key": "birre", "nome": "Birre",
        "intro_html": None,
        "ordine": 20, "layout": "scheda_estesa",
    },
    {
        "key": "vini", "nome": "Vini",
        "intro_html": None,
        "ordine": 30, "layout": "vini_dinamico",  # renderer chiama carta_vini_service
    },
    {
        "key": "amari_casa", "nome": "Amari fatti in casa",
        "intro_html": None,
        "ordine": 40, "layout": "scheda_estesa",
    },
    {
        "key": "amari_liquori", "nome": "Amari & Liquori",
        "intro_html": None,
        "ordine": 50, "layout": "tabella_4col",
    },
    {
        "key": "distillati", "nome": "Distillati",
        "intro_html": (
            "<p>Grappe, Rum, Whisky e altri distillati. "
            "La grappa è una bevanda alcolica ottenuta dalla distillazione di vinacce; "
            "si presenta di colore neutro, l'eventuale colorazione deriva dal legno in cui è stata affinata. "
            "Nascono nello stesso modo altri distillati che talvolta chiamiamo comunemente grappa, "
            "che in realtà sono Distillati di frutta, di mosto d'uva, di miele, ecc.</p>"
        ),
        "ordine": 60, "layout": "tabella_4col",
    },
    {
        "key": "tisane", "nome": "Tisane",
        "intro_html": None,
        "ordine": 70, "layout": "nome_badge_desc",
    },
    {
        "key": "te", "nome": "Tè",
        "intro_html": None,
        "ordine": 80, "layout": "nome_badge_desc",
    },
]


def _seed_sezioni(cur: sqlite3.Cursor) -> None:
    """
    Inserisce le 8 sezioni seed se non esistono (no UPDATE su quelle esistenti:
    una volta create, Marco le edita dall'UI).
    """
    for s in _SEED_SEZIONI:
        cur.execute("SELECT 1 FROM bevande_sezioni WHERE key = ?", (s["key"],))
        if cur.fetchone():
            continue
        schema_form = _SCHEMA_FORM.get(s["key"])
        cur.execute("""
            INSERT INTO bevande_sezioni (key, nome, intro_html, ordine, layout, schema_form, attivo)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        """, (
            s["key"],
            s["nome"],
            s.get("intro_html"),
            s["ordine"],
            s["layout"],
            json.dumps(schema_form, ensure_ascii=False) if schema_form else None,
        ))


# ─────────────────────────────────────────────
# UTILITY QUERY (low-level, usate da router)
# ─────────────────────────────────────────────

def get_sezione_by_key(key: str) -> sqlite3.Row | None:
    conn = get_bevande_conn()
    try:
        row = conn.execute(
            "SELECT * FROM bevande_sezioni WHERE key = ?", (key,)
        ).fetchone()
        return row
    finally:
        conn.close()


def list_sezioni(only_active: bool = False) -> list[sqlite3.Row]:
    conn = get_bevande_conn()
    try:
        if only_active:
            rows = conn.execute(
                "SELECT * FROM bevande_sezioni WHERE attivo = 1 ORDER BY ordine, id"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM bevande_sezioni ORDER BY ordine, id"
            ).fetchall()
        return list(rows)
    finally:
        conn.close()


def count_voci_by_sezione() -> dict[str, dict[str, int]]:
    """Ritorna dict {sezione_key: {'totale':N, 'attive':M}}."""
    conn = get_bevande_conn()
    try:
        rows = conn.execute("""
            SELECT sezione_key,
                   COUNT(*)                      AS totale,
                   SUM(CASE WHEN attivo=1 THEN 1 ELSE 0 END) AS attive
              FROM bevande_voci
             GROUP BY sezione_key
        """).fetchall()
        return {
            r["sezione_key"]: {
                "totale": r["totale"] or 0,
                "attive": r["attive"] or 0,
            }
            for r in rows
        }
    finally:
        conn.close()


def get_version_timestamp() -> str | None:
    """
    Ritorna il MAX(updated_at) su bevande_sezioni + bevande_voci.
    Usato per costruire la stringa 'v{YYYY}.{MM}.{seq}' nel footer del PDF.
    """
    conn = get_bevande_conn()
    try:
        row = conn.execute("""
            SELECT MAX(ts) AS ts FROM (
                SELECT MAX(updated_at) AS ts FROM bevande_sezioni
                UNION ALL
                SELECT MAX(updated_at) AS ts FROM bevande_voci
            )
        """).fetchone()
        return row["ts"] if row and row["ts"] else None
    finally:
        conn.close()
