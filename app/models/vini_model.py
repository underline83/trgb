# @version: v1.18-index-import
# -*- coding: utf-8 -*-
"""
Model util — import, normalizzazione e insert per 'vini'.

- Import diretto da Excel (foglio VINI) in app/data/vini.sqlite3
- Mappatura basata sulla POSIZIONE delle colonne (index 0-based),
  così non dipendiamo più dai nomi esatti delle intestazioni.
- Inserisce QTA come da Excel (nessuna colonna generata)
- Raccoglie errori riga per riga (con anteprima vino)
"""

from __future__ import annotations

import sqlite3
import pandas as pd

from app.core.database import get_connection, get_settings_conn

# ---------------------------------------------------------
# COSTANTI DI VALIDAZIONE
# ---------------------------------------------------------
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


# ---------------------------------------------------------
# UTILITÀ BASE
# ---------------------------------------------------------
def clear_vini_table(conn: sqlite3.Connection) -> None:
    """
    Svuota completamente la tabella 'vini'.
    Usata prima di un import completo da Excel.
    """
    cur = conn.cursor()
    cur.execute("DELETE FROM vini;")
    conn.commit()


def _clean_str(x):
    """Strip + converte ""/NaN in None."""
    s = str(x).strip()
    return s if s != "" and s.upper() != "NAN" else None


# ---------------------------------------------------------
# NORMALIZZAZIONE DATAFRAME DA EXCEL (per INDICE DI COLONNA)
# ---------------------------------------------------------
def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalizza il DataFrame dei vini partendo dalla POSIZIONE DELLE COLONNE
    (index 0-based) invece che dal nome dell'intestazione Excel.

    Mappa (0-based):

      0  -> ID (ignorato, non inserito nel DB)
      1  -> TIPOLOGIA
      2  -> NAZIONE
      3  -> CODICE
      4  -> REGIONE
      5  -> CARTA
      6  -> IPRATICO
      7  -> DENOMINAZIONE
      8  -> FORMATO
      9  -> N_FRIGO
      10 -> FRIGORIFERO
      11 -> N_LOC1
      12 -> LOCAZIONE_1
      13 -> N_LOC2
      14 -> LOCAZIONE_2
      15 -> QTA
      16 -> V (stato vendita; per ora non usato nel DB)
      17 -> DESCRIZIONE
      18 -> ANNATA
      19 -> PRODUTTORE
      20 -> PREZZO
      21 -> NOTA_PREZZO
      22 -> F
      23 -> DISTRIBUTORE
      24 -> EURO_LISTINO      <-- LISTINO da Excel
      25 -> PREZZO_IVA
      26 -> CALCOLO_PREZZO
      27 -> PREZZO_VENDITA
      28 -> SCONTO            <-- SCONTO da Excel
      29 -> PREZZO_SCONTATO
      30 -> NOME_CONCATENATO
      31 -> COSTO_C
      32 -> NUM
      33 -> VALORIZZAZIONE
      34 -> COSTO
    """

    df = df.copy()

    # Salvo l'ordine originale delle colonne così come lette da pandas
    original_cols = list(df.columns)

    # Mappa posizione -> nome canonico che vogliamo usare nel DB
    POS_TO_NAME = {
        1: "TIPOLOGIA",
        2: "NAZIONE",
        3: "CODICE",
        4: "REGIONE",
        5: "CARTA",
        6: "IPRATICO",
        7: "DENOMINAZIONE",
        8: "FORMATO",
        9: "N_FRIGO",
        10: "FRIGORIFERO",
        11: "N_LOC1",
        12: "LOCAZIONE_1",
        13: "N_LOC2",
        14: "LOCAZIONE_2",
        15: "QTA",
        16: "V",
        17: "DESCRIZIONE",
        18: "ANNATA",
        19: "PRODUTTORE",
        20: "PREZZO",
        21: "NOTA_PREZZO",
        22: "F",
        23: "DISTRIBUTORE",
        24: "EURO_LISTINO",
        25: "PREZZO_IVA",
        26: "CALCOLO_PREZZO",
        27: "PREZZO_VENDITA",
        28: "SCONTO",
        29: "PREZZO_SCONTATO",
        30: "NOME_CONCATENATO",
        31: "COSTO_C",
        32: "NUM",
        33: "VALORIZZAZIONE",
        34: "COSTO",
    }

    # Costruisco la mappa di rinomina usando l’INDICE, NON il nome header
    col_rename = {}
    for idx, target_name in POS_TO_NAME.items():
        if idx < len(original_cols):
            src_name = original_cols[idx]
            col_rename[src_name] = target_name

    # Rinomina colonne in base alla posizione
    df.rename(columns=col_rename, inplace=True)

    # Da qui in poi lavoriamo sempre con nomi UPPER case
    df.columns = [str(c).strip().upper() for c in df.columns]

    # Normalizza tipologia: sostituzioni “storiche” verso i nuovi standard
    if "TIPOLOGIA" in df.columns:
        df["TIPOLOGIA"] = (
            df["TIPOLOGIA"]
            .astype(str)
            .str.strip()
            .str.replace("VINI DEALCOLIZZATI", "VINI ANALCOLICI", regex=False)
            .str.replace("VINI DEALCOLATI", "VINI ANALCOLICI", regex=False)
        )

    # Coercioni soft sui numeri interi
    for col_int in ("N_FRIGO", "N_LOC1", "N_LOC2", "QTA"):
        if col_int in df.columns:
            df[col_int] = (
                pd.to_numeric(df[col_int], errors="coerce")
                .fillna(0)
                .astype(int)
            )

    # Coercioni soft sui real (prezzi e sconto)
    for col_real in ("PREZZO", "EURO_LISTINO", "SCONTO"):
        if col_real in df.columns:
            df[col_real] = pd.to_numeric(df[col_real], errors="coerce")

    # Pulizia stringhe chiave (se presenti)
    for col in (
        "TIPOLOGIA", "NAZIONE", "CODICE", "REGIONE", "CARTA", "IPRATICO",
        "DENOMINAZIONE", "FORMATO", "FRIGORIFERO", "LOCAZIONE_1", "LOCAZIONE_2",
        "DESCRIZIONE", "ANNATA", "PRODUTTORE", "DISTRIBUTORE",
    ):
        if col in df.columns:
            df[col] = df[col].map(_clean_str)

    return df


# ---------------------------------------------------------
# INSERT NEL DB 'vini'
# ---------------------------------------------------------
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
            # Validazioni minime in memoria (per errori più leggibili)
            tip = row.get("TIPOLOGIA")
            if tip and tip not in TIPOLOGIA_VALIDE:
                raise ValueError(f"TIPOLOGIA non ammessa: {tip}")

            fmt = row.get("FORMATO")
            if fmt and fmt not in FORMATO_VALIDI:
                # il DB consente NULL o uno dei codici; se diverso avviso
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
            # Messaggio leggibile con anteprima vino
            desc = row.get("DESCRIZIONE") or ""
            prod = row.get("PRODUTTORE") or ""
            ann = row.get("ANNATA") or ""
            preview = f"{desc} — {prod} ({ann})"
            errori.append(f"riga Excel {ridx}: {e} — {preview}")

    conn.commit()
    return inserite, errori, tip_count


# ---------------------------------------------------------
# FUNZIONI DI LETTURA PER CARTA VINI
# ---------------------------------------------------------
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
    scur = sconn.cursor()  # non usato direttamente qui, ma lasciato per simmetria

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