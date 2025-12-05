# app/services/admin_finance_import.py
# @version: v1.0
#
# Modulo responsabile del caricamento, parsing e normalizzazione
# dei corrispettivi da file Excel (.xlsx / .xlsb / .xls).
#
# Output finale: DataFrame con colonne perfettamente allineate allo schema DB:
#   date, weekday,
#   corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
#   contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
#   bonifici, mance,
#   totale_incassi, cash_diff,
#   note, is_closed
#
# Nessun contatto con il database – questo modulo produce solo il DataFrame.

import re
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


# ==============================================================
# NORMALIZZAZIONE NOMI COLONNA
# ==============================================================

def _normalize_col(col: str) -> str:
    """
    Normalizza il nome della colonna:
    - rimuove spazi multipli
    - uppercase
    - rimuove simboli euro
    - elimina spazi invisibili
    """
    if col is None:
        return ""

    s = str(col)
    s = s.replace("€", "").replace("\u00a0", "")
    s = re.sub(r"\s+", " ", s)

    return s.strip().upper()


# ==============================================================
# PARSING EURO → FLOAT
# ==============================================================

def _parse_euro(value) -> float:
    """Converte formati:
        '1.234,56 €'  -> 1234.56
         1234,56      -> 1234.56
         numeri       -> float
         celle vuote  -> 0.0
    """
    if value is None:
        return 0.0

    # numerico diretto
    if isinstance(value, (int, float, np.number)):
        if pd.isna(value):
            return 0.0
        return float(value)

    s = str(value).strip()
    if s == "":
        return 0.0

    s = s.replace("€", "").replace(" ", "").replace("\u00a0", "")
    s = s.replace(".", "")   # migliaia
    s = s.replace(",", ".")  # decimali

    try:
        return float(s)
    except:
        return 0.0


# ==============================================================
# PARSING DATE (STRINGHE / NUMERICHE EXCEL)
# ==============================================================

from datetime import datetime, timedelta

def _parse_excel_date(val):
    """
    Supporta:
    - stringhe '01/01/2024'
    - datetime già formati
    - seriali Excel (circa 30000–60000)
    """
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None

    if isinstance(val, datetime):
        return val

    # numerico → tentativo seriale Excel
    if isinstance(val, (int, float)):
        fv = float(val)
        if 30000 <= fv <= 60000:
            try:
                return datetime(1899, 12, 30) + timedelta(days=fv)
            except:
                pass

    # stringa → parsing europeo
    try:
        return pd.to_datetime(val, dayfirst=True, errors="coerce")
    except:
        return None


# ==============================================================
# LOADER UNIVERSALE — Ricerca foglio per archivio / anni
# ==============================================================

def _select_sheet(path: Path, year: str) -> str:
    """
    Ritorna il nome del foglio corretto
    - year == "archivio" → foglio 'archivio'
    - altrimenti → foglio '2025', ecc.
    """
    year_str = str(year)
    is_archivio = year_str.lower() == "archivio"

    xls = pd.ExcelFile(path)
    sheets = xls.sheet_names
    norm = {s: _normalize_col(s) for s in sheets}

    if is_archivio:
        # match esatto o "contiene archivio"
        for s, ns in norm.items():
            if ns == "ARCHIVIO" or "ARCHIVIO" in ns:
                return s
        return sheets[0]   # fallback

    # anno esatto
    for s in sheets:
        if s.strip() == year_str:
            return s

    # sheet che contiene anno
    candidates = [s for s in sheets if year_str in s]
    if len(candidates) == 1:
        return candidates[0]

    raise ValueError(
        f"Nessun foglio compatibile con year={year_str}. Presenti: {sheets}"
    )


# ==============================================================
# LOADER COMPLETO
# ==============================================================

def load_corrispettivi_excel(path: Path, year: str) -> pd.DataFrame:
    """
    Legge file Excel e restituisce DataFrame pronto per insert/update nel DB.
    """
    year_str = str(year)
    is_archivio = (year_str.lower() == "archivio")
    target_year = None if is_archivio else int(year_str)

    # 1) scegli foglio
    sheet = _select_sheet(path, year_str)

    # 2) carica Excel
    try:
        raw = pd.read_excel(path, sheet_name=sheet, dtype=object)
    except Exception as e:
        raise ValueError(f"Errore apertura foglio '{sheet}': {e}")

    if raw.empty:
        raise ValueError(f"Foglio '{sheet}' vuoto.")

    # 3) mappa colonne → nostro schema
    colmap = {}
    for col in raw.columns:
        norm = _normalize_col(col)

        if norm == "DATA":
            colmap["date"] = col
        elif norm == "GIORNO":
            colmap["weekday"] = col
        elif norm in ("CORRISPETTIVI-TOT", "CORRISPETTIVI TOT"):
            colmap["corr_tot"] = col
        elif norm == "CORRISPETTIVI":
            colmap["corr"] = col
        elif norm in ("IVA 10%", "IVA10%", "IVA 10"):
            colmap["iva10"] = col
        elif norm in ("IVA 22%", "IVA22%", "IVA 22"):
            colmap["iva22"] = col
        elif norm == "FATTURE":
            colmap["fatture"] = col
        elif norm == "CONTANTI":
            colmap["contanti"] = col
        elif norm in ("POS BPM", "POSBPM", "POS", "POS RISTO"):
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

    # 4) costruzione records
    records = []

    for _, row in raw.iterrows():
        raw_date = row.get(colmap["date"])
        parsed = _parse_excel_date(raw_date)

        if parsed is None or pd.isna(parsed):
            continue

        # filtra anno se non archivio
        if target_year and parsed.year != target_year:
            continue

        date_iso = parsed.strftime("%Y-%m-%d")

        weekday = ""
        if "weekday" in colmap:
            w = row.get(colmap["weekday"])
            weekday = str(w).strip() if w not in (None, float("nan")) else ""
        if not weekday:
            weekday = parsed.strftime("%A")

        # fiscali
        iva10 = _parse_euro(row.get(colmap.get("iva10"))) if "iva10" in colmap else 0.0
        iva22 = _parse_euro(row.get(colmap.get("iva22"))) if "iva22" in colmap else 0.0
        fatture = _parse_euro(row.get(colmap.get("fatture"))) if "fatture" in colmap else 0.0

        # corrispettivi
        if "corr" in colmap:
            corr = _parse_euro(row.get(colmap["corr"]))
            if corr == 0.0:
                corr = iva10 + iva22
        else:
            corr = iva10 + iva22

        # corrispettivi totali
        if "corr_tot" in colmap:
            corr_tot = _parse_euro(row.get(colmap["corr_tot"]))
            if corr_tot == 0.0:
                corr_tot = corr + fatture
        else:
            corr_tot = corr + fatture

        # pagamenti
        contanti = _parse_euro(row.get(colmap.get("contanti"))) if "contanti" in colmap else 0.0
        pos_bpm = _parse_euro(row.get(colmap.get("pos_bpm"))) if "pos_bpm" in colmap else 0.0
        pos_sella = _parse_euro(row.get(colmap.get("pos_sella"))) if "pos_sella" in colmap else 0.0
        thefork   = _parse_euro(row.get(colmap.get("thefork"))) if "thefork" in colmap else 0.0
        paypal_stripe = _parse_euro(row.get(colmap.get("paypal_stripe"))) if "paypal_stripe" in colmap else 0.0
        bonifici  = _parse_euro(row.get(colmap.get("bonifici"))) if "bonifici" in colmap else 0.0
        mance_dig = _parse_euro(row.get(colmap.get("mance"))) if "mance" in colmap else 0.0

        other_e_payments = paypal_stripe

        totale_incassi = contanti + pos_bpm + pos_sella + thefork + other_e_payments + bonifici
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
            "other_e_payments": other_e_payments,
            "bonifici": bonifici,
            "mance": mance_dig,
            "totale_incassi": totale_incassi,
            "cash_diff": cash_diff,
            "note": None,
            "is_closed": 0
        })

    if not records:
        raise ValueError(f"Nessuna riga valida trovata nel foglio '{sheet}' (year={year_str}).")

    return pd.DataFrame.from_records(records).sort_values("date").reset_index(drop=True)