# @version: v2.1-schema-extended
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
    """
    Inizializza il DB vini garantendo che:
    - la tabella `vini` esista
    - lo schema sia allineato alle colonne usate da insert_vini_rows()
      (IPRATICO, DENOMINAZIONE, FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2,
       DISTRIBUTORE, EURO_LISTINO, SCONTO, oltre alle colonne base).
    """
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

    # Schema completo, per nuove installazioni
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS vini (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            TIPOLOGIA   TEXT CHECK (TIPOLOGIA IN ({tipo_check})),
            NAZIONE     TEXT,
            CODICE      TEXT,
            REGIONE     TEXT,
            CARTA       TEXT CHECK (CARTA IN ('SI','NO') OR CARTA IS NULL),
            -- colonne gestionali / import
            IPRATICO    TEXT,
            DENOMINAZIONE TEXT,
            FORMATO     TEXT CHECK (FORMATO IS NULL OR FORMATO IN ({formato_check})),
            N_FRIGO     INTEGER DEFAULT 0,
            FRIGORIFERO TEXT,
            N_LOC1      INTEGER DEFAULT 0,
            LOCAZIONE_1 TEXT,
            N_LOC2      INTEGER DEFAULT 0,
            LOCAZIONE_2 TEXT,
            QTA         INTEGER DEFAULT 0,
            DESCRIZIONE TEXT,
            ANNATA      TEXT,
            PRODUTTORE  TEXT,
            PREZZO      REAL,
            DISTRIBUTORE TEXT,
            EURO_LISTINO REAL,
            SCONTO      REAL
        );
        """
    )

    # MIGRAZIONE: aggiunge eventuali colonne mancanti su tabelle già esistenti
    cur.execute("PRAGMA table_info(vini);")
    existing_cols = {row["name"] for row in cur.fetchall()}

    needed_columns = {
        "IPRATICO": "TEXT",
        "DENOMINAZIONE": "TEXT",
        "FRIGORIFERO": "TEXT",
        "LOCAZIONE_1": "TEXT",
        "LOCAZIONE_2": "TEXT",
        "DISTRIBUTORE": "TEXT",
        "EURO_LISTINO": "REAL",
        "SCONTO": "REAL",
    }

    for col_name, col_type in needed_columns.items():
        if col_name not in existing_cols:
            cur.execute(f"ALTER TABLE vini ADD COLUMN {col_name} {col_type};")

    conn.commit()
    conn.close()