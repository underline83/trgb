# @version: v2.0-stable
# -*- coding: utf-8 -*-

from __future__ import annotations
import sqlite3
from pathlib import Path

DB_PATH = Path("app/data/vini.sqlite3")

def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    conn = get_connection()
    cur = conn.cursor()

    tipo_check = (
        "'GRANDI FORMATI','BOLLICINE FRANCIA','BOLLICINE STRANIERE','BOLLICINE ITALIA',"
        "'BIANCHI ITALIA','BIANCHI FRANCIA','BIANCHI STRANIERI','ROSATI',"
        "'ROSSI ITALIA','ROSSI FRANCIA','ROSSI STRANIERI','PASSITI E VINI DA MEDITAZIONE',"
        "'VINI ANALCOLICI','ERRORE'"
    )

    formato_check = (
        "'MN','QP','ME','DM','CL','BT','BN','MG','MJ','JB','RH','JBX','MS','SM','BZ','NB','ML','PR','MZ'"
    )

    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS vini (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            TIPOLOGIA TEXT CHECK (TIPOLOGIA IN ({tipo_check})),
            NAZIONE TEXT,
            CODICE TEXT,
            REGIONE TEXT,
            CARTA TEXT CHECK (CARTA IN ('SI','NO') OR CARTA IS NULL),
            DESCRIZIONE TEXT,
            ANNATA TEXT,
            PRODUTTORE TEXT,
            PREZZO REAL,
            FORMATO TEXT CHECK (FORMATO IS NULL OR FORMATO IN ({formato_check})),
            N_FRIGO INTEGER DEFAULT 0,
            N_LOC1 INTEGER DEFAULT 0,
            N_LOC2 INTEGER DEFAULT 0,
            QTA INTEGER DEFAULT 0
        );
        """
    )

    conn.commit()
    conn.close()