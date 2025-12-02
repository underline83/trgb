# @version: v1.20-brutale-index
# -*- coding: utf-8 -*-
"""
Model util — import, normalizzazione e insert per 'vini'.

Versione "brutale": non ci fidiamo più dei nomi delle colonne Excel,
ma SOLO DELLA POSIZIONE (indice colonna).

La struttura attesa del foglio Excel "VINI" è:

 0  ID
 1  TIPOLOGIA
 2  NAZIONE
 3  CODICE
 4  REGIONE
 5  CARTA
 6  IPRATICO
 7  DENOMINAZIONE
 8  FORMATO
 9  N (frigo)              -> N_FRIGO
10  FRIGORIFERO
11  N (loc1)               -> N_LOC1
12  LOCAZIONE 1            -> LOCAZIONE_1
13  N (loc2)               -> N_LOC2
14  LOCAZIONE 2            -> LOCAZIONE_2
15  Q.TA                   -> QTA
16  V                      -> FLAG_V (non nel DB)
17  DESCRIZIONE
18  ANNATA
19  PRODUTTORE
20  PREZZO
21  NOTA PREZZO            -> ignorata
22  F                      -> ignorata
23  DISTRIBUTORE
24  LISTINO                -> EURO_LISTINO   *** IMPORTANTE ***
25  PREZZO IVA             -> ignorata
26  CALCOLO PREZZO         -> ignorata
27  PREZZO VENDITA         -> ignorata
28  Sconto                 -> SCONTO
29  PREZZO SCOTATO         -> ignorata
30  NOME CONCATENATO       -> ignorata
31  COSTO C / col. tecnica -> ignorata
32  NUM                    -> ignorata
33  VALORIZZAZIONE         -> ignorata
34  COSTO                  -> ignorata

Il DB 'vini' ha schema:

id, TIPOLOGIA, NAZIONE, CODICE, REGIONE,
CARTA, DESCRIZIONE, ANNATA, PRODUTTORE, PREZZO,
FORMATO, N_FRIGO, N_LOC1, N_LOC2, QTA,
IPRATICO, DENOMINAZIONE, FRIGORIFERO, LOCAZIONE_1,
LOCAZIONE_2, DISTRIBUTORE, EURO_LISTINO, SCONTO
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
    if x is None:
        return None
    s = str(x).strip()
    return s if s != "" and s.upper() != "NAN" else None


def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Versione BRUTALE:
    - NON usa i nomi delle colonne
    - Usa SOLO gli indici (posizione) per costruire un DF "pulito"
      con i nomi già allineati al DB.
    """
    df = df.copy()

    # Mappa: NOME_COLONNA_DB -> indice colonna nel file Excel
    COL_MAP = {
        "TIPOLOGIA": 1,
        "NAZIONE": 2,
        "CODICE": 3,
        "REGIONE": 4,
        "CARTA": 5,
        "IPRATICO": 6,
        "DENOMINAZIONE": 7,
        "FORMATO": 8,
        "N_FRIGO": 9,
        "FRIGORIFERO": 10,
        "N_LOC1": 11,
        "LOCAZIONE_1": 12,
        "N_LOC2": 13,
        "LOCAZIONE_2": 14,
        "QTA": 15,
        "FLAG_V": 16,  # non va nel DB, ma lo teniamo per debug se serve
        "DESCRIZIONE": 17,
        "ANNATA": 18,
        "PRODUTTORE": 19,
        "PREZZO": 20,
        "NOTA_PREZZO": 21,  # ignorata in insert
        "FLAG_F": 22,       # ignorata
        "DISTRIBUTORE": 23,
        "EURO_LISTINO": 24,
        "EURO_IVATO": 25,        # ignorata
        "EURO_RISTORANTE": 26,   # ignorata
        "EURO_VENDITA": 27,      # ignorata
        "SCONTO": 28,
        "EURO_SCONTATO": 29,     # ignorata
        "NOME_CONCATENATO": 30,  # ignorata
        "RAW_31": 31,            # ignorata
        "NUM": 32,               # ignorata
        "VALORIZZAZIONE": 33,    # ignorata
        "COSTO": 34,             # ignorata
    }

    out = pd.DataFrame()

    n_cols = df.shape[1]

    for name, idx in COL_MAP.items():
        if idx < n_cols:
            out[name] = df.iloc[:, idx]
        else:
            out[name] = pd.NA

    # --- Pulizia campi stringa importanti ---
    for col in (
        "TIPOLOGIA", "NAZIONE", "CODICE", "REGIONE", "CARTA", "IPRATICO",
        "DENOMINAZIONE", "FORMATO", "FRIGORIFERO", "LOCAZIONE_1", "LOCAZIONE_2",
        "DESCRIZIONE", "ANNATA", "PRODUTTORE", "DISTRIBUTORE",
    ):
        if col in out.columns:
            out[col] = out[col].map(_clean_str)

    # Normalizza tipologia (come versione precedente)
    if "TIPOLOGIA" in out.columns:
        out["TIPOLOGIA"] = (
            out["TIPOLOGIA"]
            .astype(object)
            .map(_clean_str)
        )
        out["TIPOLOGIA"] = (
            out["TIPOLOGIA"]
            .astype(str)
            .str.strip()
            .str.replace("VINI DEALCOLIZZATI", "VINI ANALCOLICI", regex=False)
            .str.replace("VINI DEALCOLATI", "VINI ANALCOLICI", regex=False)
        )

    # Coercioni soft su interi
    for col_int in ("N_FRIGO", "N_LOC1", "N_LOC2", "QTA"):
        if col_int in out.columns:
            out[col_int] = pd.to_numeric(out[col_int], errors="coerce").fillna(0).astype(int)

    # Coercioni soft su real
    for col_real in ("PREZZO", "EURO_LISTINO", "SCONTO"):
        if col_real in out.columns:
            out[col_real] = pd.to_numeric(out[col_real], errors="coerce")

    return out


def insert_vini_rows(conn: sqlite3.Connection, df: pd.DataFrame):
    """
    Inserisce le righe nel DB.
    Ritorna: (count_inserite, errori:list[str], conteggio_tipologie:dict)
    """
    cur = conn.cursor()
    inserite = 0
    errori: list[str] = []

    # Conteggio per report
    tip_count = (
        df["TIPOLOGIA"].value_counts(dropna=False).to_dict()
        if "TIPOLOGIA" in df.columns
        else {}
    )

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
    Ritorna le righe pronte per la Carta Vini.
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
    Vini per la carta con ordinamento basato sulle tabelle settings.
    """
    conn = get_connection()
    sconn = get_settings_conn()

    cur = conn.cursor()
    scur = sconn.cursor()

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