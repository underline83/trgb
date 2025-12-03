# @version: v2.0
# app/services/corrispettivi_import_v2.py

import pandas as pd
from datetime import datetime
from pathlib import Path
import sqlite3

DB_PATH = "app/data/admin_finance.sqlite3"


# ---------------------------------------------------------
# SAFE PARSING NUMERICA
# ---------------------------------------------------------

def _parse_num(v):
    """
    Converte valori tipo "1.234,00 €", " -   € ", ecc.
    Restituisce 0 se vuoto/non valido.
    """
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("€", "").replace(".", "").replace(" ", "").replace("\u00A0", "")
    s = s.replace(",", ".")
    if s == "" or s == "-":
        return 0.0
    try:
        return float(s)
    except:
        return 0.0


# ---------------------------------------------------------
# SAFE PARSING DATA
# ---------------------------------------------------------

def _parse_date(v):
    """
    Accetta formati:
    - dd/mm/yy
    - dd/mm/yyyy
    - timestamp Excel (float) → pandas to_datetime
    - yyyy-mm-dd
    """
    if isinstance(v, datetime):
        return v.date()

    if isinstance(v, float) or isinstance(v, int):
        try:
            return pd.to_datetime(v, unit="D", origin="1899-12-30").date()
        except:
            pass

    s = str(v).strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except:
            pass

    # fallback pandas
    try:
        return pd.to_datetime(s).date()
    except:
        raise ValueError(f"Formato data non riconosciuto: {v}")


# ---------------------------------------------------------
# MAPPATURA COLONNE per qualunque anno
# ---------------------------------------------------------

COLUMN_MAP = {
    "corrispettivi": ["corrispettivi", "corrispettivo", "totale corrispettivi"],
    "iva_10": ["iva 10%", "iva10", "10%", "iva10%"],
    "iva_22": ["iva 22%", "iva22", "22%", "iva22%"],
    "fatture": ["fatture", "fattura"],
    "contanti": ["contanti finali", "contanti", "cassa"],
    "pos": ["pos"],
    "paypal": ["paypal", "pay pal"],
    "stripe": ["stripe"],
    "bonifici": ["bonifici", "bonifico"],
    "cash_ignore": ["cash"],
    "totale": ["totale"],
    "giorno": ["giorno", "day"],
}


def _find_col(df, names):
    for n in names:
        for col in df.columns:
            if col.strip().lower() == n.lower():
                return col
    return None


# ---------------------------------------------------------
# CARICA EXCEL da qualunque anno
# ---------------------------------------------------------

def load_corrispettivi_any_excel(path: Path):
    """
    Restituisce DataFrame pulito, pronto per l'import.
    Funziona con file 2021–2025.
    """
    try:
        xls = pd.ExcelFile(path)
    except Exception as e:
        raise Exception(f"Errore apertura Excel: {e}")

    # Ordine preferenziale fogli:
    for candidate in ["2025", "2024", "2023", "2022", "2021"]:
        if candidate in xls.sheet_names:
            sheet = candidate
            break
    else:
        # Prendi il primo foglio valido
        sheet = xls.sheet_names[0]

    try:
        df = pd.read_excel(path, sheet_name=sheet, header=0)
    except Exception as e:
        raise Exception(f"Errore lettura foglio '{sheet}': {e}")

    # Rimuovi colonne completamente vuote
    df = df.dropna(axis=1, how="all")

    clean_rows = []

    for idx, row in df.iterrows():

        # DATA
        date = None
        for col in df.columns:
            try:
                date = _parse_date(row[col])
                break
            except:
                continue
        if not date:
            # riga inutile
            continue

        # GIORNO TESTUALE (opzionale)
        weekday = None
        col_g = _find_col(df, COLUMN_MAP["giorno"])
        if col_g:
            weekday = str(row[col_g]).strip()
        else:
            weekday = date.strftime("%A")

        # VALORI NUMERICI
        corr = _parse_num(row.get(_find_col(df, COLUMN_MAP["corrispettivi"]), 0))
        iva10 = _parse_num(row.get(_find_col(df, COLUMN_MAP["iva_10"]), 0))
        iva22 = _parse_num(row.get(_find_col(df, COLUMN_MAP["iva_22"]), 0))
        fatt = _parse_num(row.get(_find_col(df, COLUMN_MAP["fatture"]), 0))

        cont = _parse_num(row.get(_find_col(df, COLUMN_MAP["contanti"]), 0))
        pos = _parse_num(row.get(_find_col(df, COLUMN_MAP["pos"]), 0))
        paypal = _parse_num(row.get(_find_col(df, COLUMN_MAP["paypal"]), 0))
        stripe = _parse_num(row.get(_find_col(df, COLUMN_MAP["stripe"]), 0))
        bon = _parse_num(row.get(_find_col(df, COLUMN_MAP["bonifici"]), 0))

        totale_excel = _parse_num(row.get(_find_col(df, COLUMN_MAP["totale"]), 0))

        # UNIFICA PAYPAL+STRIPE
        stripe_pay = paypal + stripe

        # CALCOLA CORRISPETTIVI se mancanti
        if corr == 0 and (iva10 or iva22 or fatt):
            corr = iva10 + iva22 + fatt

        # Se tutto è zero → CHIUSO
        if all(v == 0 for v in [corr, iva10, iva22, fatt, cont, pos, stripe_pay, bon, totale_excel]):
            is_closed = True
            totale_incassi = 0
        else:
            is_closed = False

            # INCASSI
            if cont == 0 and pos == 0 and stripe_pay == 0 and bon == 0 and totale_excel > 0:
                # file vecchi con solo TOTALE
                totale_incassi = totale_excel
            else:
                totale_incassi = cont + pos + stripe_pay + bon

        cash_diff = totale_incassi - corr

        clean_rows.append(
            {
                "date": date.isoformat(),
                "weekday": weekday,
                "corrispettivi": corr,
                "iva_10": iva10,
                "iva_22": iva22,
                "fatture": fatt,
                "contanti_finali": cont,
                "pos": pos,
                "stripe_pay": stripe_pay,
                "bonifici": bon,
                "sella": 0.0,   # anni vecchi non hanno SELLA
                "mance": 0.0,
                "totale_incassi": totale_incassi,
                "cash_diff": cash_diff,
                "is_closed": 1 if is_closed else 0,
                "note": "import automatico multi-anno",
            }
        )

    return pd.DataFrame(clean_rows)


# ---------------------------------------------------------
# IMPORT NEL DB
# ---------------------------------------------------------

def ensure_table(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE,
            weekday TEXT,
            corrispettivi REAL,
            iva_10 REAL,
            iva_22 REAL,
            fatture REAL,
            contanti_finali REAL,
            pos REAL,
            sella REAL,
            stripe_pay REAL,
            bonifici REAL,
            mance REAL,
            totale_incassi REAL,
            cash_diff REAL,
            note TEXT,
            is_closed INTEGER DEFAULT 0,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT
        )
        """
    )
    conn.commit()


def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="import"):
    cur = conn.cursor()
    inserted = 0
    updated = 0

    for _, row in df.iterrows():
        date = row["date"]

        cur.execute("SELECT id FROM daily_closures WHERE date = ?", (date,))
        exists = cur.fetchone()

        values = (
            row["weekday"],
            row["corrispettivi"],
            row["iva_10"],
            row["iva_22"],
            row["fatture"],
            row["contanti_finali"],
            row["pos"],
            row["sella"],
            row["stripe_pay"],
            row["bonifici"],
            row["mance"],
            row["totale_incassi"],
            row["cash_diff"],
            row["note"],
            row["is_closed"],
            created_by,
        )

        if exists:
            cur.execute(
                """
                UPDATE daily_closures
                SET weekday=?, corrispettivi=?, iva_10=?, iva_22=?, fatture=?,
                    contanti_finali=?, pos=?, sella=?, stripe_pay=?, bonifici=?, mance=?,
                    totale_incassi=?, cash_diff=?, note=?, is_closed=?, updated_at=CURRENT_TIMESTAMP
                WHERE date=?
                """,
                (*values, date),
            )
            updated += 1
        else:
            cur.execute(
                """
                INSERT INTO daily_closures 
                (date, weekday, corrispettivi, iva_10, iva_22, fatture,
                 contanti_finali, pos, sella, stripe_pay, bonifici, mance,
                 totale_incassi, cash_diff, note, is_closed, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (date, *values),
            )
            inserted += 1

    conn.commit()
    return inserted, updated