# app/services/corrispettivi_import.py
# @version: v1.4
import re
import pandas as pd
import numpy as np
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

DB_PATH = "app/data/admin_finance.sqlite3"

# ==============================================================
# CREATE TABLE
# ==============================================================

def ensure_table(conn: sqlite3.Connection):
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
# HELPERS
# ==============================================================

def _parse_euro(value) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    s = str(value).strip()
    if s == "":
        return 0.0

    s = s.replace("€", "").replace(" ", "").replace("\u00a0", "")
    s = s.replace(".", "").replace(",", ".")

    try:
        return float(s)
    except:
        return 0.0


def _normalize_colname(col: str) -> str:
    if col is None:
        return ""
    s = str(col).replace("€", "")
    s = re.sub(r"\s+", " ", s)
    return s.strip().upper()


# ==============================================================
# DATE PARSING SUPER ROBUST
# ==============================================================

def _parse_date(raw_date):
    """
    Supporta:
    - "05/01/25"
    - "05/01/2025"
    - seriale Excel (numero)
    - datetime già corretto
    """
    if raw_date is None:
        return None

    # Se già datetime
    if isinstance(raw_date, (datetime, pd.Timestamp)):
        return raw_date

    # Se numero Excel seriale
    if isinstance(raw_date, (int, float)):
        try:
            return datetime(1899, 12, 30) + timedelta(days=int(raw_date))
        except:
            return None

    raw_s = str(raw_date).strip()

    # Prova to_datetime standard
    dt = pd.to_datetime(raw_s, dayfirst=True, errors="coerce")
    if not pd.isna(dt):
        return dt

    # Regex dd/mm/yy
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2})$", raw_s)
    if m:
        d, mth, yy = m.groups()
        yy = int(yy)
        yyyy = 2000 + yy if yy < 50 else 1900 + yy
        fixed = f"{d}/{mth}/{yyyy}"
        dt2 = pd.to_datetime(fixed, dayfirst=True, errors="coerce")
        if not pd.isna(dt2):
            return dt2

    return None


# ==============================================================
# LOADER MAIN
# ==============================================================

def load_corrispettivi_from_excel(path: Path, year: str) -> pd.DataFrame:
    year_str = str(year)
    is_archivio = year_str.lower() == "archivio"

    if not is_archivio:
        try:
            target_year = int(year_str)
        except:
            raise ValueError("year deve essere 'archivio' oppure un intero tipo 2025")
    else:
        target_year = None

    sheet_name = "archivio" if is_archivio else year_str

    try:
        raw = pd.read_excel(path, sheet_name=sheet_name, dtype=object)
    except Exception as e:
        raise ValueError(f"Errore apertura foglio '{sheet_name}': {e}")

    if raw.empty:
        raise ValueError(f"Il foglio '{sheet_name}' è vuoto.")

    # ==== MAPPATURA COLONNE ====
    colmap = {}
    for c in raw.columns:
        n = _normalize_colname(c)
        if n == "DATA":
            colmap["date"] = c
        elif n == "GIORNO":
            colmap["weekday"] = c
        elif n in ("CORRISPETTIVI-TOT", "CORRISPETTIVI TOT"):
            colmap["corr_tot"] = c
        elif n == "CORRISPETTIVI":
            colmap["corr"] = c
        elif n.startswith("IVA 10"):
            colmap["iva10"] = c
        elif n.startswith("IVA 22"):
            colmap["iva22"] = c
        elif n == "FATTURE":
            colmap["fatture"] = c
        elif n == "CONTANTI":
            colmap["contanti"] = c
        elif n.startswith("POS BPM") or n == "POS":
            colmap["pos_bpm"] = c
        elif n.startswith("POS SELLA"):
            colmap["pos_sella"] = c
        elif "THEFORK" in n:
            colmap["thefork"] = c
        elif "PAYPAL" in n or "STRIPE" in n:
            colmap["paypal_stripe"] = c
        elif n == "BONIFICI":
            colmap["bonifici"] = c
        elif n.startswith("MANCE"):
            colmap["mance"] = c
        elif n == "TOTALE":
            colmap["totale"] = c

    if "date" not in colmap:
        raise ValueError("Colonna DATA mancante.")

    # ==== COSTRUZIONE RECORD ====
    records = []

    for _, row in raw.iterrows():
        raw_date = row.get(colmap["date"])
        dt = _parse_date(raw_date)
        if dt is None:
            continue

        if target_year and dt.year != target_year:
            continue

        date_iso = dt.strftime("%Y-%m-%d")

        # weekday
        weekday = ""
        if "weekday" in colmap:
            w = row.get(colmap["weekday"])
            if isinstance(w, str):
                weekday = w.strip()

        if weekday == "":
            weekday = dt.strftime("%A")

        iva10 = _parse_euro(row.get(colmap.get("iva10")))
        iva22 = _parse_euro(row.get(colmap.get("iva22")))
        fatture = _parse_euro(row.get(colmap.get("fatture")))

        if "corr_tot" in colmap:
            corr_tot = _parse_euro(row.get(colmap["corr_tot"]))
        else:
            corr_base = _parse_euro(row.get(colmap.get("corr"))) if "corr" in colmap else (iva10 + iva22)
            corr_tot = corr_base + fatture

        contanti = _parse_euro(row.get(colmap.get("contanti")))
        pos = _parse_euro(row.get(colmap.get("pos_bpm")))
        sella = _parse_euro(row.get(colmap.get("pos_sella")))
        thefork = _parse_euro(row.get(colmap.get("thefork")))
        paypal_stripe = _parse_euro(row.get(colmap.get("paypal_stripe")))
        bonifici = _parse_euro(row.get(colmap.get("bonifici")))
        mance = _parse_euro(row.get(colmap.get("mance")))

        stripe_pay = thefork + paypal_stripe

        totale_incassi = contanti + pos + sella + stripe_pay + bonifici + mance
        cash_diff = totale_incassi - corr_tot

        records.append(
            {
                "date": date_iso,
                "weekday": weekday,
                "corrispettivi": corr_tot,
                "iva_10": iva10,
                "iva_22": iva22,
                "fatture": fatture,
                "contanti_finali": contanti,
                "pos": pos,
                "sella": sella,
                "stripe_pay": stripe_pay,
                "bonifici": bonifici,
                "mance": mance,
                "totale_incassi": totale_incassi,
                "cash_diff": cash_diff,
                "note": None,
                "is_closed": 0,
            }
        )

    if not records:
        raise ValueError(f"Nessuna riga valida trovata nel foglio '{sheet_name}' (year={year}).")

    df = pd.DataFrame.from_records(records)
    df = df.sort_values("date").reset_index(drop=True)
    return df


# ==============================================================
# IMPORT DB
# ==============================================================

def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="import"):
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
                SET weekday=?, corrispettivi=?, iva_10=?, iva_22=?, fatture=?,
                    contanti_finali=?, pos=?, sella=?, stripe_pay=?, bonifici=?, mance=?,
                    totale_incassi=?, cash_diff=?,
                    updated_at=CURRENT_TIMESTAMP
                WHERE date=?
                """,
                (
                    row["weekday"], row["corrispettivi"], row["iva_10"], row["iva_22"], row["fatture"],
                    row["contanti_finali"], row["pos"], row["sella"], row["stripe_pay"],
                    row["bonifici"], row["mance"],
                    totale_incassi, cash_diff,
                    date_str,
                )
            )
        else:
            inserted += 1
            cur.execute(
                """
                INSERT INTO daily_closures (
                    date, weekday, corrispettivi, iva_10, iva_22, fatture,
                    contanti_finali, pos, sella, stripe_pay, bonifici, mance,
                    totale_incassi, cash_diff,
                    is_closed, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    date_str, row["weekday"],
                    row["corrispettivi"], row["iva_10"], row["iva_22"], row["fatture"],
                    row["contanti_finali"], row["pos"], row["sella"], row["stripe_pay"],
                    row["bonifici"], row["mance"],
                    totale_incassi, cash_diff,
                    created_by,
                )
            )

    conn.commit()
    return inserted, updated