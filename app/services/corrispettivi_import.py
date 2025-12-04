# app/services/corrispettivi_import.py
# @version: v2.2

import re
import pandas as pd
import numpy as np
import sqlite3

from pathlib import Path
from typing import Optional

DB_PATH = "app/data/admin_finance.sqlite3"

# ==============================================================
# DB CREATION / MIGRATION
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
            corrispettivi_tot REAL DEFAULT 0,

            contanti_finali REAL DEFAULT 0,
            pos_bpm REAL DEFAULT 0,
            pos_sella REAL DEFAULT 0,
            theforkpay REAL DEFAULT 0,
            other_e_payments REAL DEFAULT 0,
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
# PARSING
# ==============================================================

def _normalize_colname(col: str) -> str:
    if col is None:
        return ""
    s = str(col)
    s = s.replace("€", "")
    s = re.sub(r"\s+", " ", s)
    return s.strip().upper()


def _parse_euro(val) -> float:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0

    if isinstance(val, (int, float, np.number)):
        return float(val)

    s = str(val)
    if s.strip() == "":
        return 0.0

    s = s.replace("€", "").replace(" ", "").replace("\u00a0", "")
    s = s.replace(".", "")
    s = s.replace(",", ".")

    try:
        return float(s)
    except:
        return 0.0


# ==============================================================
# LOAD EXCEL
# ==============================================================

def load_corrispettivi_from_excel(path: Path, year: str) -> pd.DataFrame:
    year_str = str(year)
    is_archivio = (year_str.lower() == "archivio")

    target_year: Optional[int] = None
    if not is_archivio:
        target_year = int(year_str)

    sheet_name = "archivio" if is_archivio else year_str

    try:
        raw = pd.read_excel(path, sheet_name=sheet_name, dtype=object)
    except Exception as e:
        raise ValueError(f"Errore apertura foglio '{sheet_name}': {e}")

    if raw.empty:
        raise ValueError(f"Foglio '{sheet_name}' vuoto.")

    # mapping
    colmap = {}
    for col in raw.columns:
        norm = _normalize_colname(col)

        if norm == "DATA":
            colmap["date"] = col
        elif norm == "GIORNO":
            colmap["weekday"] = col
        elif norm in ("CORRISPETTIVI-TOT", "CORRISPETTIVI TOT"):
            colmap["corr_tot"] = col
        elif norm == "CORRISPETTIVI":
            colmap["corr"] = col
        elif norm in ("IVA 10%", "IVA 10", "IVA10%"):
            colmap["iva10"] = col
        elif norm in ("IVA 22%", "IVA 22", "IVA22%"):
            colmap["iva22"] = col
        elif norm == "FATTURE":
            colmap["fatture"] = col
        elif norm == "CONTANTI":
            colmap["contanti"] = col
        elif norm in ("POS BPM", "POS", "POSBPM", "POS RISTO"):
            colmap["pos_bpm"] = col
        elif norm in ("POS SELLA", "SELLA", "POSSELLA"):
            colmap["pos_sella"] = col
        elif norm.startswith("THEFORK"):
            colmap["thefork"] = col
        elif "PAYPAL" in norm or "STRIPE" in norm:
            colmap["paypal_stripe"] = col
        elif norm == "BONIFICI":
            colmap["bonifici"] = col
        elif "MANCE" in norm:
            colmap["mance"] = col

    if "date" not in colmap:
        raise ValueError("Colonna DATA mancante.")

    from datetime import datetime, timedelta

    def parse_excel_date(v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, (int, float)) and 30000 <= float(v) <= 60000:
            return datetime(1899, 12, 30) + timedelta(days=float(v))
        try:
            return pd.to_datetime(v, dayfirst=True, errors="coerce")
        except:
            return None

    records = []

    for _, row in raw.iterrows():

        parsed = parse_excel_date(row.get(colmap["date"]))
        if parsed is None or pd.isna(parsed):
            continue

        if (not is_archivio) and parsed.year != target_year:
            continue

        date_iso = parsed.strftime("%Y-%m-%d")

        weekday_val = row.get(colmap.get("weekday")) if "weekday" in colmap else None
        weekday = str(weekday_val).strip() if weekday_val else parsed.strftime("%A")

        iva10 = _parse_euro(row.get(colmap.get("iva10"))) if "iva10" in colmap else 0.0
        iva22 = _parse_euro(row.get(colmap.get("iva22"))) if "iva22" in colmap else 0.0
        fatture = _parse_euro(row.get(colmap.get("fatture"))) if "fatture" in colmap else 0.0

        if "corr" in colmap:
            corr = _parse_euro(row.get(colmap["corr"]))
            if corr == 0:
                corr = iva10 + iva22
        else:
            corr = iva10 + iva22

        if "corr_tot" in colmap:
            corr_tot = _parse_euro(row.get(colmap["corr_tot"]))
            if corr_tot == 0:
                corr_tot = corr + fatture
        else:
            corr_tot = corr + fatture

        contanti = _parse_euro(row.get(colmap.get("contanti"))) if "contanti" in colmap else 0.0
        pos_bpm = _parse_euro(row.get(colmap.get("pos_bpm"))) if "pos_bpm" in colmap else 0.0
        pos_sella = _parse_euro(row.get(colmap.get("pos_sella"))) if "pos_sella" in colmap else 0.0
        thefork = _parse_euro(row.get(colmap.get("thefork"))) if "thefork" in colmap else 0.0
        paypal_stripe = _parse_euro(row.get(colmap.get("paypal_stripe"))) if "paypal_stripe" in colmap else 0.0
        bonifici = _parse_euro(row.get(colmap.get("bonifici"))) if "bonifici" in colmap else 0.0
        mance = _parse_euro(row.get(colmap.get("mance"))) if "mance" in colmap else 0.0

        other_e = paypal_stripe

        totale_incassi = contanti + pos_bpm + pos_sella + thefork + other_e + bonifici
        cash_diff = totale_incassi - corr_tot

        records.append({
            "date": date_iso,
            "weekday": weekday,
            "corrispettivi": corr,
            "iva_10": iva10,
            "iva_22": iva22,
            "fatture": fatture,
            "corrispettivi_tot": corr_tot,
            "contanti_finali": contanti,
            "pos_bpm": pos_bpm,
            "pos_sella": pos_sella,
            "theforkpay": thefork,
            "other_e_payments": other_e,
            "bonifici": bonifici,
            "mance": mance,
            "totale_incassi": totale_incassi,
            "cash_diff": cash_diff,
            "note": None,
            "is_closed": 0,
        })

    if not records:
        raise ValueError(f"Nessuna riga valida trovata nel foglio '{sheet_name}'")

    return pd.DataFrame.from_records(records).sort_values("date").reset_index(drop=True)


# ==============================================================
# IMPORT IN DB
# ==============================================================

def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="import"):

    ensure_table(conn)
    cur = conn.cursor()

    inserted = 0
    updated = 0

    def _num(row, key):
        v = row.get(key)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return 0.0
        try:
            return float(v)
        except:
            return 0.0

    for _, row in df.iterrows():

        date_str = row["date"]
        weekday = row.get("weekday", "")

        corrispettivi = _num(row, "corrispettivi")
        iva_10 = _num(row, "iva_10")
        iva_22 = _num(row, "iva_22")
        fatture = _num(row, "fatture")
        corrispettivi_tot = _num(row, "corrispettivi_tot")

        contanti_finali = _num(row, "contanti_finali")
        pos_bpm = _num(row, "pos_bpm")
        pos_sella = _num(row, "pos_sella")
        theforkpay = _num(row, "theforkpay")
        other_e = _num(row, "other_e_payments")
        bonifici = _num(row, "bonifici")
        mance = _num(row, "mance")

        totale_incassi = _num(row, "totale_incassi")
        cash_diff = _num(row, "cash_diff")

        note = row.get("note")
        is_closed = int(row.get("is_closed", 0))

        cur.execute("SELECT id FROM daily_closures WHERE date=?", (date_str,))
        exists = cur.fetchone()

        if exists:
            updated += 1
            cur.execute(
                """
                UPDATE daily_closures
                SET weekday=?, corrispettivi=?, iva_10=?, iva_22=?, fatture=?, corrispettivi_tot=?,
                    contanti_finali=?, pos_bpm=?, pos_sella=?, theforkpay=?, other_e_payments=?,
                    bonifici=?, mance=?, totale_incassi=?, cash_diff=?, note=?, is_closed=?,
                    updated_at=CURRENT_TIMESTAMP
                WHERE date=?
                """,
                (
                    weekday, corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
                    contanti_finali, pos_bpm, pos_sella, theforkpay, other_e,
                    bonifici, mance, totale_incassi, cash_diff,
                    note, is_closed,
                    date_str,
                ),
            )
        else:
            inserted += 1
            cur.execute(
                """
                INSERT INTO daily_closures (
                    date, weekday,
                    corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
                    contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
                    bonifici, mance, totale_incassi, cash_diff,
                    note, is_closed, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str, weekday,
                    corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
                    contanti_finali, pos_bpm, pos_sella, theforkpay, other_e,
                    bonifici, mance, totale_incassi, cash_diff,
                    note, is_closed, created_by
                ),
            )

    conn.commit()
    return inserted, updated