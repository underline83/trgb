# Modulo: vini (multi-fornitore) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 225 — Vini multi-fornitore, VMF.1 (2026-11-02)

PERCHE'
Marco 2026-11-02: «è anche ora che iniziamo a gestire il multi fornitore».
Fino a oggi un vino aveva un solo distributore (`vini_madre.fornitore_id`) e
un solo costo per annata (`vini_bottiglie.EURO_LISTINO`) senza sapere da chi
venisse. Caso reale: Scavino comprato diretto dalla cantina (11,125 €) o
tramite 0,75 (13,00 €). Spec: docs/spec_vini_multifornitore.md.

COSA FA
1. `vini_madre_fornitori`: i fornitori da cui un vino si compra. Il
   preferito resta `vini_madre.fornitore_id` (ordini e carta non cambiano).
2. `vini_prezzi_fornitore`: prezzi di un'annata presso un fornitore,
   `tipo` pagato | listino, con data, fonte e collegamenti (movimento,
   ordine, riga fattura).
3. Dati di oggi (decisione D6): il distributore di ogni vino diventa il suo
   primo fornitore; l'EURO_LISTINO di ogni annata diventa un `pagato` di quel
   fornitore con fonte `storico`, datato all'ultimo cambio registrato nello
   storico prezzi (se c'è) o a oggi. Il costo in uso non cambia.

Idempotente: CREATE TABLE IF NOT EXISTS; il backfill parte solo se
`vini_prezzi_fornitore` è vuota e usa INSERT OR IGNORE sui fornitori.

DB toccato: vini_magazzino.sqlite3. La conn ricevuta dal runner non è usata.
"""

import sqlite3
from datetime import date

from app.models.vini_magazzino_db import get_magazzino_connection


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    return cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def _index(cur: sqlite3.Cursor, nome: str, sql: str) -> None:
    if not cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (nome,)
    ).fetchone():
        cur.execute(sql)


def upgrade(conn: sqlite3.Connection) -> None:
    vconn = get_magazzino_connection()
    try:
        cur = vconn.cursor()
        if not (_table_exists(cur, "vini_madre") and _table_exists(cur, "vini_bottiglie")):
            print("  [225] anagrafiche vini assenti, skip")
            return

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vini_madre_fornitori (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                madre_id      INTEGER NOT NULL,
                fornitore_id  INTEGER NOT NULL,
                note          TEXT,
                created_at    TEXT DEFAULT (datetime('now','localtime')),
                UNIQUE (madre_id, fornitore_id)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS vini_prezzi_fornitore (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                bottiglia_id  INTEGER NOT NULL,
                fornitore_id  INTEGER NOT NULL,
                tipo          TEXT NOT NULL CHECK (tipo IN ('pagato','listino')),
                prezzo        REAL NOT NULL,
                data          TEXT NOT NULL,
                fonte         TEXT NOT NULL,
                movimento_id  INTEGER,
                ordine_id     INTEGER,
                fe_riga_id    INTEGER,
                stato         TEXT NOT NULL DEFAULT 'ok'
                              CHECK (stato IN ('ok','da_verificare','scartato')),
                note          TEXT,
                utente        TEXT,
                created_at    TEXT DEFAULT (datetime('now','localtime'))
            )
            """
        )
        _index(cur, "idx_vmf_madre", "CREATE INDEX idx_vmf_madre ON vini_madre_fornitori(madre_id)")
        _index(cur, "idx_vpf_bottiglia",
               "CREATE INDEX idx_vpf_bottiglia ON vini_prezzi_fornitore(bottiglia_id, tipo, stato, data)")
        _index(cur, "idx_vpf_fornitore", "CREATE INDEX idx_vpf_fornitore ON vini_prezzi_fornitore(fornitore_id)")
        _index(cur, "idx_vpf_fe_riga", "CREATE INDEX idx_vpf_fe_riga ON vini_prezzi_fornitore(fe_riga_id)")

        # --- backfill (D6) ---
        cur.execute(
            "INSERT OR IGNORE INTO vini_madre_fornitori (madre_id, fornitore_id, note) "
            "SELECT id, fornitore_id, 'distributore al 2026-11-02' FROM vini_madre "
            "WHERE fornitore_id IS NOT NULL"
        )
        n_forn = cur.rowcount

        gia = cur.execute("SELECT COUNT(*) FROM vini_prezzi_fornitore").fetchone()[0]
        n_prezzi = 0
        if gia == 0:
            oggi = date.today().isoformat()
            has_storico = _table_exists(cur, "vini_prezzi_storico")
            righe = cur.execute(
                """
                SELECT b.id, b.EURO_LISTINO, m.fornitore_id
                  FROM vini_bottiglie b
                  JOIN vini_madre m ON m.id = b.madre_id
                 WHERE m.fornitore_id IS NOT NULL
                   AND b.EURO_LISTINO IS NOT NULL AND b.EURO_LISTINO > 0
                """
            ).fetchall()
            for bid, prezzo, fid in righe:
                data = oggi
                if has_storico:
                    r = cur.execute(
                        "SELECT substr(MAX(created_at),1,10) FROM vini_prezzi_storico "
                        "WHERE vino_id = ? AND campo = 'EURO_LISTINO'",
                        (bid,),
                    ).fetchone()
                    if r and r[0]:
                        data = r[0]
                cur.execute(
                    "INSERT INTO vini_prezzi_fornitore "
                    "(bottiglia_id, fornitore_id, tipo, prezzo, data, fonte, note, utente) "
                    "VALUES (?, ?, 'pagato', ?, ?, 'storico', "
                    "'costo al passaggio al multi-fornitore', 'migrazione 225')",
                    (bid, fid, float(prezzo), data),
                )
                n_prezzi += 1

        vconn.commit()
        print(f"  [225] multi-fornitore vini pronto: {n_forn} fornitori collegati, "
              f"{n_prezzi} costi storici")
    finally:
        vconn.close()

    _seed_soglia()


def _seed_soglia() -> None:
    """Soglia fattura/carico (D4) nelle impostazioni Vini, come la mig 165."""
    from app.utils.locale_data import locale_data_path
    from app.services.vini_widget_settings_service import WIDGET_DEFAULTS, invalidate_cache

    db = locale_data_path("vini_settings.sqlite3")
    if not db.exists():
        print("  [225] vini_settings.sqlite3 assente, soglia dal fallback")
        return
    sett = sqlite3.connect(db, timeout=30)
    try:
        cur = sett.cursor()
        if not _table_exists(cur, "vini_widget_settings"):
            return
        for key, value, tipo, descr in WIDGET_DEFAULTS:
            if key == "vmf_soglia_fattura_pct":
                cur.execute(
                    "INSERT OR IGNORE INTO vini_widget_settings (key, value, tipo, descrizione) "
                    "VALUES (?, ?, ?, ?)",
                    (key, value, tipo, descr),
                )
        sett.commit()
    finally:
        sett.close()
    invalidate_cache()
