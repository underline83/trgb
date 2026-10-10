# Modulo: vini (sub-moduli carta bevande + ipratico) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 186 — Carta Bevande ↔ iPratico: categorie per sezione (2026-10-10)

Le voci della Carta Bevande diventano prodotti iPratico uno a uno, come i vini
(codice nel nome: «B0123 …», id di bevande_voci). La sincronizzazione passa da
iPratico Sync (export vini + bevande nello stesso file).

bevande_sezioni.ipratico TEXT (JSON):
  {"attivo": true, "categoria": "Amari e liquori", "per_tipologia": {"Grappa": "Grappe", …}}

Seed dei nomi categoria solo dove la colonna è vuota, poi si cambiano da
iPratico Sync. La categoria iPratico «Alcolici» (prodotti generici a fascia di
prezzo) non viene toccata: le categorie nuove hanno nomi diversi.
Solo ADD COLUMN, idempotente. DB toccato: bevande.sqlite3.
"""

import json
import sqlite3

from app.models.bevande_db import get_bevande_conn, init_bevande_db

_SEED_186 = {
    "aperitivi":     {"attivo": True, "categoria": "Aperitivi", "per_tipologia": {}},
    "birre":         {"attivo": True, "categoria": "Birre", "per_tipologia": {}},
    "amari_casa":    {"attivo": True, "categoria": "Amari della casa", "per_tipologia": {}},
    "amari_liquori": {"attivo": True, "categoria": "Amari e liquori", "per_tipologia": {}},
    "distillati":    {"attivo": True, "categoria": "Distillati", "per_tipologia": {
        "Grappa": "Grappe", "Rum": "Rum", "Whisky": "Whisky", "Gin": "Gin",
        "Vodka": "Vodka", "Cognac": "Cognac e Armagnac", "Altro": "Distillati",
    }},
    "tisane":        {"attivo": True, "categoria": "Tisane", "per_tipologia": {}},
    "te":            {"attivo": True, "categoria": "Tè", "per_tipologia": {}},
}


def upgrade(conn: sqlite3.Connection) -> None:
    init_bevande_db()
    bconn = get_bevande_conn()
    try:
        cur = bconn.cursor()
        cols = [r[1] for r in cur.execute("PRAGMA table_info(bevande_sezioni)").fetchall()]
        if "ipratico" not in cols:
            cur.execute("ALTER TABLE bevande_sezioni ADD COLUMN ipratico TEXT")
            print("  [186] bevande_sezioni.ipratico aggiunta")
        n = 0
        for key, conf in _SEED_186.items():
            cur.execute(
                "UPDATE bevande_sezioni SET ipratico = ? WHERE key = ? AND (ipratico IS NULL OR ipratico = '')",
                (json.dumps(conf, ensure_ascii=False), key),
            )
            n += cur.rowcount
        print(f"  [186] categorie iPratico impostate su {n} sezioni")
        bconn.commit()
    finally:
        bconn.close()
