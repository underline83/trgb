# app/services/corrispettivi_import.py
# @version: v1.3

import pandas as pd
import numpy as np
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = "app/data/admin_finance.sqlite3"


# ==============================================================
# DB CREATION / MIGRATION
# ==============================================================

def ensure_table(conn: sqlite3.Connection):
    """
    Crea la tabella daily_closures se non esiste.
    Versione moderna, colonne allineate al modello ufficiale.
    """
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            weekday TEXT,
            corrispettivi REAL DEFAULT 0,
            iva_10 REAL DEFAULT 0,
            iva_22 REAL DEFAULT 0,
            fatture REAL DEFAULT 0,
            contanti_finali REAL DEFAULT 0,
            pos REAL DEFAULT 0,
            sella REAL DEFAULT 0,
            stripe_pay REAL DEFAULT 0,
            bonifici REAL DEFAULT 0,
            mance REAL DEFAULT 0,
            totale_incassi REAL DEFAULT 0,
            cash_diff REAL DEFAULT 0,
            note TEXT,
            is_closed INTEGER DEFAULT 0,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT
        );
        """
    )
    conn.commit()


# ==============================================================
# HELPER: NORMALIZZAZIONE CAMPI
# ==============================================================

def _clean_value(x):
    """
    Converte valori Excel contenenti:
    - numeri
    - stringhe con "€" o "."
    - NaN / None → 0
    """
    if pd.isna(x) or x is None:
        return 0.0

    if isinstance(x, (int, float, np.number)):
        return float(x)

    if isinstance(x, str):
        x = x.replace("€", "").replace(".", "").replace(",", ".").strip()
        if x in ("", "-", "--"):
            return 0.0
        try:
            return float(x)
        except:
            return 0.0

    return 0.0


# ==============================================================
# LOADER DI FILE EXCEL (tutte le versioni 2021-2024)
# ==============================================================

def load_corrispettivi_from_excel(path: Path, year: int):
    """
    Legge file Excel 2021–2024 (formati diversi).
    Auto-seleziona il foglio giusto (con anno nel nome, oppure primo valido).
    Converte tutte le colonne in un dataframe standardizzato.
    """
    xls = pd.ExcelFile(path)
    sheet = None

    # 1) CERCA FOGLIO ES: "2024", "2023", ecc.
    yn = str(year)
    for s in xls.sheet_names:
        if yn in s:
            sheet = s
            break

    # 2) Se non trovato, prendi il primo foglio con una colonna tipo "Giorno", "Corrispettivi"
    if sheet is None:
        for s in xls.sheet_names:
            df_test = pd.read_excel(path, sheet_name=s, nrows=3)
            low = [str(x).lower() for x in df_test.columns]
            if any(k in low for k in ["corrispettivi", "giorno", "iva"]):
                sheet = s
                break

    if sheet is None:
        sheet = xls.sheet_names[0]  # fallback assoluto

    df = pd.read_excel(path, sheet_name=sheet)

    # ==========================================================
    # NORMALIZZAZIONE NOMI COLONNE
    # ==========================================================
    # Normalizzazione sicura: converte tutto in stringa
    df.columns = [str(c).strip().lower() for c in df.columns]
    # tutte le varianti viste nei file vecchi/nuovi
    colmap = {
        "data": ["data", "giorno", "date"],
        "corrispettivi": ["corrispettivi", "corrispettivo"],
        "iva_10": ["iva 10%", "iva 10", "iva10"],
        "iva_22": ["iva 22%", "iva 22", "iva22"],
        "fatture": ["fatture"],
        "contanti_finali": ["contanti finali", "contanti", "cash"],
        "pos": ["pos"],
        "sella": ["sella"],
        "stripe_pay": ["stripe", "paypal", "stripe/paypal", "paypal/stripe"],
        "bonifici": ["bonifici", "bonifico"],
        "mance": ["mance"],
    }

    # output dataframe
    out = {
        "date": [],
        "weekday": [],
        "corrispettivi": [],
        "iva_10": [],
        "iva_22": [],
        "fatture": [],
        "contanti_finali": [],
        "pos": [],
        "sella": [],
        "stripe_pay": [],
        "bonifici": [],
        "mance": [],
    }

    # ==========================================================
    # ESTRAZIONE RIGA PER RIGA
    # ==========================================================

    for _, row in df.iterrows():
        # ------ DATA ------
        date_val = None
        for cname in colmap["data"]:
            if cname in df.columns:
                date_val = row.get(cname, None)
                break

        if pd.isna(date_val) or date_val is None:
            continue

        try:
            d = pd.to_datetime(date_val).date()
        except:
            continue

        # ------ ESTRAZIONE VALORI ------
        def extract(key):
            for cname in colmap[key]:
                if cname in df.columns:
                    return _clean_value(row.get(cname))
            return 0.0

        iva10 = extract("iva_10")
        iva22 = extract("iva_22")
        fatt = extract("fatture")

        # VALORE CORRISPETTIVI (anche se il file ha corrispettivi propri)
        corr = iva10 + iva22 + fatt
        # Se il file ha “corrispettivi”, usalo come override
        if "corrispettivi" in df.columns:
            override = extract("corrispettivi")
            if override > 0:
                corr = override

        total_stripe = extract("stripe_pay")  # include PayPal in automatico

        totale_incassi = (
            extract("contanti_finali")
            + extract("pos")
            + extract("sella")
            + total_stripe
            + extract("bonifici")
            + extract("mance")
        )

        out["date"].append(d.isoformat())
        out["weekday"].append(d.strftime("%A"))
        out["corrispettivi"].append(corr)
        out["iva_10"].append(iva10)
        out["iva_22"].append(iva22)
        out["fatture"].append(fatt)
        out["contanti_finali"].append(extract("contanti_finali"))
        out["pos"].append(extract("pos"))
        out["sella"].append(extract("sella"))
        out["stripe_pay"].append(total_stripe)
        out["bonifici"].append(extract("bonifici"))
        out["mance"].append(extract("mance"))

    out_df = pd.DataFrame(out)
    return out_df


# ==============================================================
# IMPORT NEL DATABASE
# ==============================================================

def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="import"):
    """
    Inserisce/aggiorna i record in daily_closures.
    """
    ensure_table(conn)
    cur = conn.cursor()

    inserted = 0
    updated = 0

    for _, row in df.iterrows():
        date_str = row["date"]

        totale_incassi = (
            row["contanti_finali"]
            + row["pos"]
            + row["sella"]
            + row["stripe_pay"]
            + row["bonifici"]
            + row["mance"]
        )
        cash_diff = totale_incassi - row["corrispettivi"]

        cur.execute("SELECT id FROM daily_closures WHERE date=?", (date_str,))
        existing = cur.fetchone()

        if existing:
            updated += 1
            cur.execute(
                """
                UPDATE daily_closures
                SET
                    weekday=?,
                    corrispettivi=?, iva_10=?, iva_22=?, fatture=?,
                    contanti_finali=?, pos=?, sella=?, stripe_pay=?, bonifici=?, mance=?,
                    totale_incassi=?, cash_diff=?,
                    updated_at=CURRENT_TIMESTAMP
                WHERE date=?
                """,
                (
                    row["weekday"],
                    row["corrispettivi"], row["iva_10"], row["iva_22"], row["fatture"],
                    row["contanti_finali"], row["pos"], row["sella"], row["stripe_pay"],
                    row["bonifici"], row["mance"],
                    totale_incassi, cash_diff,
                    date_str,
                ),
            )
        else:
            inserted += 1
            cur.execute(
                """
                INSERT INTO daily_closures (
                    date, weekday,
                    corrispettivi, iva_10, iva_22, fatture,
                    contanti_finali, pos, sella, stripe_pay, bonifici, mance,
                    totale_incassi, cash_diff,
                    is_closed, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    date_str, row["weekday"],
                    row["corrispettivi"], row["iva_10"], row["iva_22"], row["fatture"],
                    row["contanti_finali"], row["pos"], row["sella"], row["stripe_pay"],
                    row["bonifici"], row["mance"],
                    totale_incassi, cash_diff,
                    created_by,
                ),
            )

    conn.commit()
    return inserted, updated