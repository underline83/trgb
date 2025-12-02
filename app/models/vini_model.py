# @version: v2.0-RAW-IMPORT
# -*- coding: utf-8 -*-
"""
IMPORT EXCEL — MODALITÀ GREZZA
=================================

Nuovo comportamento:

1) L’Excel viene letto e copiato così com’è in una tabella grezza:
      vini_raw(col0, col1, col2, ...)
2) Da quella tabella grezza vengono estratte le colonne corrette
   tramite INDICE (non tramite nome colonna).
3) La tabella ufficiale `vini` viene ricostruita interamente.


In questo modo:
- Non dipendiamo dai titoli delle colonne
- Funziona con ogni Excel reale
- Evitiamo errori come EURO_LISTINO mancante
"""

from __future__ import annotations
import sqlite3
import pandas as pd
from pathlib import Path

from app.core.database import get_connection, get_settings_conn


RAW_COLS = 35   # quante colonne vogliamo accettare dal file Excel


def ensure_vini_raw_exists(conn: sqlite3.Connection):
    """
    Crea la tabella grezza se non esiste.
    """
    cur = conn.cursor()

    cols = ", ".join([f"col{i} TEXT" for i in range(RAW_COLS)])

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS vini_raw (
            row_id INTEGER PRIMARY KEY AUTOINCREMENT,
            {cols}
        );
    """)

    conn.commit()


def import_excel_to_raw(df: pd.DataFrame, conn: sqlite3.Connection):
    """
    Copia BRUTALMENTE tutto il contenuto dell’Excel nella tabella `vini_raw`.
    """
    df = df.fillna("").astype(str)

    cur = conn.cursor()

    # svuota tabella grezza
    cur.execute("DELETE FROM vini_raw;")

    for idx, row in df.iterrows():
        values = []
        for i in range(RAW_COLS):
            if i < len(row):
                values.append(row.iloc[i])
            else:
                values.append("")

        placeholders = ",".join(["?"] * RAW_COLS)
        colnames = ",".join([f"col{i}" for i in range(RAW_COLS)])

        cur.execute(
            f"INSERT INTO vini_raw ({colnames}) VALUES ({placeholders})",
            values
        )

    conn.commit()


def migrate_raw_to_vini(conn: sqlite3.Connection):
    """
    Legge da vini_raw e popola la tabella ufficiale `vini`.
    """
    cur = conn.cursor()

    rows = cur.execute("SELECT * FROM vini_raw").fetchall()

    # svuota tabella principale
    cur.execute("DELETE FROM vini;")

    for r in rows:
        # 🔥 MAPPATURA PER INDICE — VERSIONE TESTATA
        tipologia     = r["col1"]
        nazione       = r["col2"]
        codice        = r["col3"]
        regione       = r["col4"]
        carta         = r["col5"]
        ipratico      = r["col6"]
        denominazione = r["col7"]
        formato       = r["col8"]
        n_frigo       = r["col9"]
        frigorifero   = r["col10"]
        n_loc1        = r["col11"]
        loc1          = r["col12"]
        n_loc2        = r["col13"]
        loc2          = r["col14"]
        qta           = r["col15"]
        descrizione   = r["col16"]  # ATTENZIONE: colonna corretta
        annata        = r["col17"]
        produttore    = r["col18"]
        prezzo        = r["col19"]
        distr         = r["col22"]
        euro_listino  = r["col23"]   # ← Finalmente LISTINO OK
        sconto        = r["col27"]

        cur.execute("""
            INSERT INTO vini (
                TIPOLOGIA, NAZIONE, CODICE, REGIONE,
                CARTA, IPRATICO, DENOMINAZIONE, FORMATO,
                N_FRIGO, FRIGORIFERO, N_LOC1, LOCAZIONE_1,
                N_LOC2, LOCAZIONE_2, QTA,
                DESCRIZIONE, ANNATA, PRODUTTORE,
                PREZZO, DISTRIBUTORE, EURO_LISTINO, SCONTO
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            tipologia, nazione, codice, regione,
            carta, ipratico, denominazione, formato,
            n_frigo, frigorifero, n_loc1, loc1,
            n_loc2, loc2, qta,
            descrizione, annata, produttore,
            prezzo, distr, euro_listino, sconto
        ))

    conn.commit()


def import_excel(df: pd.DataFrame):
    """
    Funzione chiamata dal router Excel.
    """
    conn = get_connection()

    ensure_vini_raw_exists(conn)
    import_excel_to_raw(df, conn)
    migrate_raw_to_vini(conn)

    conn.close()


def fetch_carta_vini(conn: sqlite3.Connection):
    """
    Identico da prima.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            TIPOLOGIA,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA,
            PREZZO
        FROM vini
        WHERE
            TIPOLOGIA IS NOT NULL
            AND TIPOLOGIA <> 'ERRORE'
            AND CARTA = 'SI'
        ORDER BY
            TIPOLOGIA,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA
        ;
        """
    )
    return cur.fetchall()