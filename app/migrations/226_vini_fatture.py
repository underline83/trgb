# Modulo: vini (multi-fornitore) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 226 — Vini multi-fornitore VMF.3: fatture → vini (2026-11-03)

PERCHE'
Decisioni Marco 2026-11-02 (spec docs/spec_vini_multifornitore.md D4, D7):
la fattura elettronica è il prezzo vero e DECIDE IL FORNITORE in base a chi
la emette: un distributore (0,75 dal suo magazzino, Marenzi, Sebina…) oppure
una cantina, e allora l'acquisto è «Diretto» (anche se l'ordine è passato da
un agente). Confrontata col carico: entro ±soglia% corregge da sola, oltre
va in «da verificare».

COSA FA (vini_magazzino.sqlite3)
- `vini_fe_emittenti`: chi emette le fatture del vino, per P.IVA:
  `tipo` distributore (→ `fornitore_id`) | cantina (→ Diretto) | non_vini.
- `vini_fe_righe`: lo stato di ogni riga di fattura letta (da_abbinare,
  abbinata, ignorata) e l'annata a cui è stata abbinata.
- `vini_fe_mappa`: abbinamenti imparati (P.IVA + descrizione normalizzata →
  bottiglia), così la stessa riga la volta dopo si abbina da sola.
- `vini_prezzi_fornitore.confronto_id`: il prezzo (carico/ordine/storico)
  con cui la fattura è stata confrontata.
- setting `vmf_fatture_dal` (2026-01-01, Marco 03/11: «considera il 2026»).

Idempotente. Solo CREATE IF NOT EXISTS / ADD COLUMN.
"""

import sqlite3

from app.models.vini_magazzino_db import get_magazzino_connection


def _col(cur, t, c):
    return any(r[1] == c for r in cur.execute(f"PRAGMA table_info({t})").fetchall())


def _table(cur, t):
    return cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    v = get_magazzino_connection()
    try:
        cur = v.cursor()
        if not _table(cur, "vini_prezzi_fornitore"):
            print("  [226] vini_prezzi_fornitore assente (mig 225 non applicata), skip")
            return
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vini_fe_emittenti (
                piva          TEXT PRIMARY KEY,
                nome          TEXT,
                tipo          TEXT NOT NULL CHECK (tipo IN ('distributore','cantina','non_vini')),
                fornitore_id  INTEGER,
                utente        TEXT,
                updated_at    TEXT DEFAULT (datetime('now','localtime'))
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vini_fe_righe (
                fe_riga_id    INTEGER PRIMARY KEY,
                fattura_id    INTEGER,
                piva          TEXT,
                stato         TEXT NOT NULL DEFAULT 'da_abbinare'
                              CHECK (stato IN ('da_abbinare','abbinata','ignorata')),
                bottiglia_id  INTEGER,
                prezzo_id     INTEGER,
                utente        TEXT,
                updated_at    TEXT DEFAULT (datetime('now','localtime'))
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vini_fe_mappa (
                piva          TEXT NOT NULL,
                chiave        TEXT NOT NULL,
                bottiglia_id  INTEGER,
                ignora        INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (piva, chiave)
            )
            """
        )
        if not _col(cur, "vini_prezzi_fornitore", "confronto_id"):
            cur.execute("ALTER TABLE vini_prezzi_fornitore ADD COLUMN confronto_id INTEGER")
        if not cur.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_vfr_stato'").fetchone():
            cur.execute("CREATE INDEX idx_vfr_stato ON vini_fe_righe(stato)")

        # I «pagato» sono NETTI (= fattura). Quelli scritti finora (storico della
        # mig 225, ordini, carichi, a mano) venivano da EURO_LISTINO, che in TRGB è
        # il listino a cui si applica SCONTO: si portano al netto, una volta sola.
        cur.execute(
            """
            UPDATE vini_prezzi_fornitore
               SET prezzo = ROUND(prezzo * (1 - (SELECT b.SCONTO FROM vini_bottiglie b
                                                  WHERE b.id = vini_prezzi_fornitore.bottiglia_id) / 100.0), 4),
                   note = TRIM(COALESCE(note,'') || ' [netto: listino − sconto, mig 226]')
             WHERE tipo = 'pagato'
               AND fonte IN ('storico','ordine','carico','manuale')
               AND COALESCE(note,'') NOT LIKE '%mig 226%'
               AND (SELECT b.SCONTO FROM vini_bottiglie b WHERE b.id = vini_prezzi_fornitore.bottiglia_id) > 0
               AND (SELECT b.SCONTO FROM vini_bottiglie b WHERE b.id = vini_prezzi_fornitore.bottiglia_id) < 100
            """
        )
        n_netti = cur.rowcount
        v.commit()
        print(f"  [226] fatture → vini pronto (emittenti, righe, mappa); {n_netti} prezzi portati al netto")
    finally:
        v.close()

    # setting vmf_fatture_dal (come mig 165/225)
    from app.utils.locale_data import locale_data_path
    from app.services.vini_widget_settings_service import WIDGET_DEFAULTS, invalidate_cache
    db = locale_data_path("vini_settings.sqlite3")
    if db.exists():
        s = sqlite3.connect(db, timeout=30)
        try:
            c = s.cursor()
            if _table(c, "vini_widget_settings"):
                for key, value, tipo, descr in WIDGET_DEFAULTS:
                    if key == "vmf_fatture_dal":
                        c.execute("INSERT OR IGNORE INTO vini_widget_settings (key, value, tipo, descrizione) "
                                  "VALUES (?, ?, ?, ?)", (key, value, tipo, descr))
                s.commit()
        finally:
            s.close()
        invalidate_cache()
