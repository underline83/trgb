# @version: v1.18-stable
# -*- coding: utf-8 -*-
"""
Model util — import, normalizzazione e insert per 'vini'.
- Mappa le colonne dall'Excel 'VINI' verso lo schema DB ufficiale
- Inserisce QTA come da Excel (nessuna colonna generata)
- Raccoglie errori riga per riga (con anteprima vino)
"""

from __future__ import annotations

import sqlite3
import pandas as pd

from app.core.database import get_connection, get_settings_conn

# Valori ammessi
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
    return s if s != "" and s.upper() != "NAN" else None


def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    - Uppercase & strip intestazioni
    - Rinomina colonne Excel -> DB
    - Pulisce valori (strip, None)
    - Non tocca i numerici, salvo coercizioni sicure
    """
    df = df.copy()

    # 1) Uniforma intestazioni: STRIP + UPPER
    df.columns = [c.strip().upper() for c in df.columns]

    # 2) Mappa intestazioni (GIÀ uppercased) -> nomi DB
    #    Qui le chiavi DEVONO essere già UPPER e senza spazi ai lati.
    rename_map = {
        # Locazioni / quantità
        "N": "N_FRIGO",
        "N.1": "N_LOC1",
        "N.2": "N_LOC2",
        "LOCAZIONE 1": "LOCAZIONE_1",
        "LOCAZIONE 2": "LOCAZIONE_2",
        "Q.TA": "QTA",

        # Colonne prezzi (dal file reale 'vini-gestione-22.xlsx')
        "€/LISTINO": "EURO_LISTINO",
        "SCONTO": "SCONTO",

        # Colonne da ignorare (ma che ESISTONO nel file)
        "NOTA PREZZO": None,
        "F": None,
        "€/IVATO": None,
        "€/RISTORANTE": None,
        "€/VENDITA": None,
        "€/SCONTATO": None,
        "NOME CONCATENATO": None,
        "UNNAMED: 31": None,
        "NUM": None,
        "VALORIZZAZIONE": None,
        "COSTO": None,
    }

    keep_cols = []
    for c in list(df.columns):
        if c in rename_map:
            newc = rename_map[c]
            if newc is None:
                df.drop(columns=[c], inplace=True)
            else:
                df.rename(columns={c: newc}, inplace=True)
                keep_cols.append(newc)
        else:
            keep_cols.append(c)

    # 3) Normalizza tipologia
    if "TIPOLOGIA" in df.columns:
        df["TIPOLOGIA"] = (
            df["TIPOLOGIA"]
            .astype(str)
            .str.strip()
            .str.replace("VINI DEALCOLIZZATI", "VINI ANALCOLICI", regex=False)
            .str.replace("VINI DEALCOLATI", "VINI ANALCOLICI", regex=False)
        )

    # 4) Coercioni soft sui numeri interi
    for col_int in ("N_FRIGO", "N_LOC1", "N_LOC2", "QTA"):
        if col_int in df.columns:
            df[col_int] = pd.to_numeric(df[col_int], errors="coerce").fillna(0).astype(int)

    # 5) Coercioni soft sui real
    for col_real in ("PREZZO", "EURO_LISTINO", "SCONTO"):
        if col_real in df.columns:
            df[col_real] = pd.to_numeric(df[col_real], errors="coerce")

    # 6) Pulizia stringhe chiave (se presenti)
    for col in (
        "TIPOLOGIA", "NAZIONE", "CODICE", "REGIONE", "CARTA", "IPRATICO",
        "DENOMINAZIONE", "FORMATO", "FRIGORIFERO", "LOCAZIONE_1", "LOCAZIONE_2",
        "DESCRIZIONE", "ANNATA", "PRODUTTORE", "DISTRIBUTORE",
    ):
        if col in df.columns:
            df[col] = df[col].map(_clean_str)

    return df


def insert_vini_rows(conn: sqlite3.Connection, df: pd.DataFrame):
    """
    Inserisce le righe nel DB.
    Ritorna: (count_inserite, errori:list[str], conteggio_tipologie:dict)
    """
    cur = conn.cursor()
    inserite = 0
    errori: list[str] = []

    tip_count = df["TIPOLOGIA"].value_counts(dropna=False).to_dict() if "TIPOLOGIA" in df.columns else {}

    for ridx, row in df.iterrows():
        try:
            tip = row.get("TIPOLOGIA")
            if tip and tip not in TIPOLOGIA_VALIDE:
                raise ValueError(f"TIPOLOGIA non ammessa: {tip}")

            fmt = row.get("FORMATO")
            if fmt and fmt not in FORMATO_VALIDI:
                raise ValueError(f"FORMATO non ammesso: {fmt}")

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
            desc = row.get("DESCRIZIONE") or ""
            prod = row.get("PRODUTTORE") or ""
            ann = row.get("ANNATA") or ""
            preview = f"{desc} — {prod} ({ann})"
            errori.append(f"riga Excel {ridx}: {e} — {preview}")

    conn.commit()
    return inserite, errori, tip_count


def fetch_carta_vini(conn: sqlite3.Connection):
    """
    Ritorna le righe pronte per la Carta Vini, già ordinate:
    TIPOLOGIA → REGIONE → PRODUTTORE → DESCRIZIONE → ANNATA
    Filtrate per:
    - CARTA = 'SI'
    - TIPOLOGIA non nulla e diversa da 'ERRORE'
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


def load_vini_ordinati():
    """
    Ritorna i vini per la carta, con ordinamento basato sulle
    tabelle di ordinamento tipologie/regioni nel DB settings.
    """
    conn = get_connection()
    sconn = get_settings_conn()

    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT v.*,
               t.ordine AS ord_tip,
               r.ordine AS ord_reg
        FROM vini v
        LEFT JOIN tipologia_order t ON t.nome = v.TIPOLOGIA
        LEFT JOIN regioni_order r   ON r.nome = v.REGIONE
        WHERE v.CARTA='SI' AND v.TIPOLOGIA!='ERRORE'
        ORDER BY
            ord_tip ASC,
            ord_reg ASC,
            v.PRODUTTORE ASC,
            v.DESCRIZIONE ASC,
            v.ANNATA ASC;
        """
    ).fetchall()

    conn.close()
    sconn.close()
    return rows