#!/usr/bin/env python3
# Modulo: cucina
# @version: v1.0 — registro delle produzioni e dei codici lotto (2026-11-26, mig 248)
# -*- coding: utf-8 -*-
"""
Schema del registro produzioni — modulo cucina. DB: foodcost.db.

cucina_produzioni_persone   il numero (1-90) che entra nel codice lotto, uno per
                            utente di TRGB. Assegnato la prima volta che la persona
                            compare in una produzione; MAI riusato, MAI cambiato:
                            e' scritto dentro i codici gia' stampati.
cucina_produzioni           una riga per produzione registrata = un codice lotto.
                            `numero` e' il progressivo del giorno su tutta la cucina
                            (1-99). Una produzione annullata tiene codice e numero:
                            l'etichetta potrebbe essere gia' su un barattolo.

Solo CREATE TABLE IF NOT EXISTS: `apply_schema` si puo' richiamare quante volte si vuole.
"""

from __future__ import annotations

import sqlite3

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS cucina_produzioni_persone (
        numero      INTEGER PRIMARY KEY,
        username    TEXT    NOT NULL UNIQUE,
        nome        TEXT,
        creato_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cucina_produzioni (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        codice          TEXT    NOT NULL UNIQUE,
        data            TEXT    NOT NULL,
        numero          INTEGER NOT NULL,
        persona_numero  INTEGER NOT NULL,
        nome            TEXT    NOT NULL,
        recipe_id       INTEGER,
        data_scadenza   TEXT,
        etichette       INTEGER NOT NULL DEFAULT 1,
        note            TEXT,
        creato_da       TEXT,
        creato_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        aggiornato_at   TEXT,
        annullata_at    TEXT,
        annullata_da    TEXT,
        UNIQUE (data, numero)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuc_prod_data ON cucina_produzioni(data DESC, numero DESC)",
]


def apply_schema(conn: sqlite3.Connection) -> None:
    for sql in SCHEMA:
        conn.execute(sql)


def init_cucina_produzioni_db() -> None:
    """Init difensivo al boot, come `init_cucina_scorte_db()`."""
    from app.models.foodcost_db import get_foodcost_connection

    conn = get_foodcost_connection()
    try:
        apply_schema(conn)
        conn.commit()
    finally:
        conn.close()
