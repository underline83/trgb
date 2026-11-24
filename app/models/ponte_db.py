# @version: v1.0 (2026-11-24) — stampanti, impostazioni e coda del ponte di stampa
# -*- coding: utf-8 -*-
"""
Database del ponte di stampa — TRGB Gestionale. Platform, mattone M.M. [core]

Il ponte è un programma che gira su un computer nella rete del locale: chiede a TRGB cosa
c'è da stampare e lo porta alle stampanti (docs/architettura_mattoni.md, M.M).

Contiene:
- ponte_stampanti   — le stampanti del locale: chiave, nome, indirizzo, porta, colonne, accesa
- ponte_config      — impostazioni (ogni quanto chiede il ponte, dopo quanto si avvisa, oltre
                      quanto un foglio non esce più da solo), impronta del token, ultimo contatto
- ponte_lavori      — fogli messi in coda da TRGB stesso (il foglio di prova); i moduli che
                      hanno una coda loro (le comande) la tengono nelle loro tabelle

DB separato `ponte.sqlite3` nella cartella dati del locale. Schema al boot (CREATE TABLE IF
NOT EXISTS), niente migrazioni numerate. Orari in ora italiana.

Seme del locale: `locali/<locale>/seeds/ponte.json` ({config: {...}, stampanti: [...]}) dà
indirizzi e valori del locale alla prima partenza. Riempie solo ciò che manca: dopo comandano
le Impostazioni. Nel codice non c'è l'indirizzo di nessuna stampante.
"""
import json
import logging
import sqlite3

from app.utils.locale_data import locale_data_dir, locale_data_path

logger = logging.getLogger(__name__)

DB_PATH = locale_data_path("ponte.sqlite3")

# Valori iniziali: si cambiano dalle Impostazioni (ponte_config), mai nel codice.
CONFIG_INIZIALE = {
    "ogni_secondi": "2",       # ogni quanto il ponte chiede se c'è da stampare
    "avviso_minuti": "1",      # dopo quanto silenzio del ponte TRGB dice che la stampa è ferma
    "scadenza_minuti": "10",   # oltre quanto un foglio non esce più da solo (si ristampa a mano)
    "presa_secondi": "30",     # quanto si aspetta l'esito di un foglio consegnato al ponte prima di ridarlo
}


def get_ponte_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _seme_locale() -> dict:
    try:
        f = locale_data_dir().parent / "seeds" / "ponte.json"
        if not f.exists():
            return {}
        dati = json.loads(f.read_text(encoding="utf-8"))
        return dati if isinstance(dati, dict) else {}
    except Exception as e:  # un seme rotto non ferma l'avvio
        logger.warning("Seme ponte del locale non leggibile: %s", e)
        return {}


def init_ponte_db() -> None:
    """Crea lo schema se manca e semina impostazioni e stampanti. Idempotente."""
    conn = get_ponte_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ponte_stampanti (
                chiave   TEXT PRIMARY KEY,               -- «cucina», «sala»: è ciò che i moduli ricordano
                nome     TEXT NOT NULL,
                host     TEXT,                           -- indirizzo nella rete del locale
                porta    INTEGER NOT NULL DEFAULT 9100,
                colonne  INTEGER NOT NULL DEFAULT 48,    -- colonne a carattere normale
                attiva   INTEGER NOT NULL DEFAULT 0,     -- spenta finché qualcuno non l'accende
                ordine   INTEGER NOT NULL DEFAULT 0
            )
        """)
        cur.execute("CREATE TABLE IF NOT EXISTS ponte_config (chiave TEXT PRIMARY KEY, valore TEXT)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ponte_lavori (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                stampante    TEXT NOT NULL,              -- ponte_stampanti.chiave
                titolo       TEXT,
                dati         BLOB NOT NULL,              -- i byte da mandare alla stampante
                stato        TEXT NOT NULL DEFAULT 'attesa' CHECK (stato IN ('attesa','stampato')),
                tentativi    INTEGER NOT NULL DEFAULT 0,
                esito        TEXT,                       -- ultimo errore, o «ok»
                creato_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                creato_da    TEXT,
                presa_at     TEXT,                       -- quando è stato consegnato al ponte
                stampato_at  TEXT
            )
        """)
        seme = _seme_locale()
        iniziali = {**CONFIG_INIZIALE, **{str(k): str(v) for k, v in (seme.get("config") or {}).items() if k in CONFIG_INIZIALE}}
        for chiave, valore in iniziali.items():
            cur.execute("INSERT OR IGNORE INTO ponte_config (chiave, valore) VALUES (?, ?)", (chiave, valore))
        if not cur.execute("SELECT 1 FROM ponte_stampanti LIMIT 1").fetchone():
            for i, s in enumerate(seme.get("stampanti") or []):
                chiave = str(s.get("chiave") or "").strip().lower()
                if not chiave:
                    continue
                cur.execute(
                    "INSERT OR IGNORE INTO ponte_stampanti (chiave, nome, host, porta, colonne, attiva, ordine) "
                    "VALUES (?, ?, ?, ?, ?, 0, ?)",
                    (chiave, str(s.get("nome") or chiave), (s.get("host") or None),
                     int(s.get("porta") or 9100), int(s.get("colonne") or 48), i))
        conn.commit()
    finally:
        conn.close()
