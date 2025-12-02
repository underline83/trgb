# @version: v2.0-raw-import-stable
# -*- coding: utf-8 -*-
"""
Model util — import Excel per:
1) vini_raw → copia 1:1 del foglio Excel (nessuna pulizia)
2) vini → versione normalizzata per Carta Vini

Il frontend non cambia: importi l’Excel e vengono generate entrambe.
"""

from __future__ import annotations

import sqlite3
import pandas as pd

from app.core.database import get_connection, get_settings_conn


# --------------------------------------------------------------------------------------
# RAW IMPORT — COPIA 1:1 DELL’EXCEL
# --------------------------------------------------------------------------------------
def import_raw_excel_exact(df: pd.DataFrame):
    """
    Crea una tabella 'vini_raw' identica al foglio Excel:
    - Stesse colonne (anche con spazi, simboli, ecc.)
    - Stessi valori
    - Zero modifiche, zero pulizia
    """

    conn = get_connection()
    cur = conn.cursor()

    # 1) Remove old table
    cur.execute("DROP TABLE IF EXISTS vini_raw;")
    conn.commit()

    # 2) Build schema dynamically
    excel_columns = df.columns.tolist()

    col_defs = []
    for col in excel_columns:
        col_clean = col.replace('"', '')
        col_defs.append(f'"{col_clean}" TEXT')

    schema_sql = ", ".join(col_defs)

    cur.execute(
        f"""
        CREATE TABLE vini_raw (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            {schema_sql}
        );
        """
    )
    conn.commit()

    # 3) Insert rows EXACTLY as loaded
    df.to_sql("vini_raw", conn, if_exists="append", index=False)

    conn.commit()
    conn.close()

    print(f"[RAW IMPORT] Creato vini_raw con {len(df)} righe e {len(excel_columns)} colonne.")


# --------------------------------------------------------------------------------------
# NORMAL IMPORT — PER CARTA VINI
# --------------------------------------------------------------------------------------

TIPOLOGIA_VALIDE = {
    "GRANDI FORMATI",
    "BOLLICINE FRANCIA",
    "BOLLICINE STRANIERE",
    "BOLLICINE ITALIA",
    "BIANCHI ITALIA",
    "BIANCHI FRANCIA",
    "BIANCHI STRANIERI",
    "ROSATI",
    "ROSSI ITALIA",
    "ROSSI FRANCIA",
    "ROSSI STRANIERI",
    "PASSITI E VINI DA MEDITAZIONE",
    "VINI ANALCOLICI",
    "ERRORE",
}

FORMATO_VALIDI = {
    "MN", "QP", "ME", "DM", "CL", "BT", "BN", "MG", "MJ",
    "JB", "RH", "JBX", "MS", "SM", "BZ", "NB", "ML", "PR", "MZ",
}


def clear_vini_table(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("DELETE FROM vini;")
    conn.commit()


def _clean_str(x):
    s = str(x).strip()
    return s if s not in ("", "NAN", "nan", None) else None


def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """ Normalizzazione leggera per CARTA VINI (non per magazzino) """

    df = df.copy()
    df.columns = [c.strip().upper() for c in df.columns]

    # mapping colonne Excel → DB
    rename_map = {
        "N": "N_FRIGO",
        "N.1": "N_LOC1",
        "N.2": "N_LOC2",
        "LOCAZIONE 1": "LOCAZIONE_1",
        "LOCAZIONE 2": "LOCAZIONE_2",
        "Q.TA": "QTA",

        # LISTINO (fix definitivo)
        "€/LISTINO": "EURO_LISTINO",
        "€ /LISTINO": "EURO_LISTINO",
        " €/LISTINO": "EURO_LISTINO",
        "€/Listino": "EURO_LISTINO",
        " LISTINO ": "EURO_LISTINO",

        # ignored
        "NOTA PREZZO": None,
        "F": None,
        "€/RISTORANTE": None,
        "€/VENDITA": None,
        "€/IVATO": None,
        "€/SCONTATO": None,
        "NOME CONCATENATO": None,
        "UNNAMED: 31": None,
        "NUM": None,
        "VALORIZZAZIONE": None,
        "COSTO": None,
    }

    # apply rename
    keep_cols = []
    for col in list(df.columns):
        if col in rename_map:
            newc = rename_map[col]
            if newc is None:
                df.drop(columns=[col], inplace=True)
            else:
                df.rename(columns={col: newc}, inplace=True)
                keep_cols.append(newc)
        else:
            keep_cols.append(col)

    # int fields
    for col in ("N_FRIGO", "N_LOC1", "N_LOC2", "QTA"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    # float fields
    for col in ("PREZZO", "EURO_LISTINO", "SCONTO"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # clean strings
    for col in (
        "TIPOLOGIA", "NAZIONE", "CODICE", "REGIONE", "CARTA", "IPRATICO",
        "DENOMINAZIONE", "FORMATO", "FRIGORIFERO", "LOCAZIONE_1", "LOCAZIONE_2",
        "DESCRIZIONE", "ANNATA", "PRODUTTORE", "DISTRIBUTORE",
    ):
        if col in df.columns:
            df[col] = df[col].map(_clean_str)

    return df


def insert_vini_rows(conn: sqlite3.Connection, df: pd.DataFrame):
    """ Inserisce i vini puliti nella tabella ufficiale (per CARTA VINI). """

    cur = conn.cursor()
    inserite = 0
    errori = []

    for ridx, row in df.iterrows():
        try:
            cur.execute(
                """
                INSERT INTO vini (
                    TIPOLOGIA, NAZIONE, CODICE, REGIONE,
                    CARTA, IPRATICO, DENOMINAZIONE, FORMATO,
                    N_FRIGO, FRIGORIFERO, N_LOC1, LOCAZIONE_1,
                    N_LOC2, LOCAZIONE_2, QTA,
                    DESCRIZIONE, ANNATA, PRODUTTORE,
                    PREZZO, DISTRIBUTORE, EURO_LISTINO, SCONTO
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    row.get("TIPOLOGIA"),
                    row.get("NAZIONE"),
                    row.get("CODICE"),
                    row.get("REGIONE"),
                    row.get("CARTA"),
                    row.get("IPRATICO"),
                    row.get("DENOMINAZIONE"),
                    row.get("FORMATO"),
                    int(row.get("N_FRIGO", 0) or 0),
                    row.get("FRIGORIFERO"),
                    int(row.get("N_LOC1", 0) or 0),
                    row.get("LOCAZIONE_1"),
                    int(row.get("N_LOC2", 0) or 0),
                    row.get("LOCAZIONE_2"),
                    int(row.get("QTA", 0) or 0),
                    row.get("DESCRIZIONE"),
                    row.get("ANNATA"),
                    row.get("PRODUTTORE"),
                    row.get("PREZZO"),
                    row.get("DISTRIBUTORE"),
                    row.get("EURO_LISTINO"),
                    row.get("SCONTO"),
                ),
            )
            inserite += 1

        except Exception as e:
            errori.append(f"Errore riga {ridx}: {e}")

    conn.commit()
    return inserite, errori


# --------------------------------------------------------------------------------------
# FUNZIONE PRINCIPALE USATA DAL ROUTER /vini/upload
# --------------------------------------------------------------------------------------
def process_excel_to_db(filepath: str):
    """ Richiamata dal router quando si carica l’Excel """

    df = pd.read_excel(filepath)

    # 1) CREA COPIA CRUDA 1:1
    import_raw_excel_exact(df)

    # 2) CREA VERSIONE NORMALIZZATA PER CARTA
    df_norm = normalize_dataframe(df)

    conn = get_connection()
    clear_vini_table(conn)
    ok, errors = insert_vini_rows(conn, df_norm)
    conn.close()

    return ok, errors