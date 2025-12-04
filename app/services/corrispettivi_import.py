# app/services/corrispettivi_import.py
# @version: v2.1
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
    """
    Crea la tabella daily_closures se non esiste.
    Versione allineata al modello confermato con Marco.
    """
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            weekday TEXT,

            -- Fiscale
            corrispettivi REAL DEFAULT 0,      -- IVA10 + IVA22
            iva_10 REAL DEFAULT 0,
            iva_22 REAL DEFAULT 0,
            fatture REAL DEFAULT 0,
            corrispettivi_tot REAL DEFAULT 0,  -- corrispettivi + fatture

            -- Incassi (solo incassi reali, SENZA mance)
            contanti_finali REAL DEFAULT 0,
            pos_bpm REAL DEFAULT 0,
            pos_sella REAL DEFAULT 0,
            theforkpay REAL DEFAULT 0,
            other_e_payments REAL DEFAULT 0,   -- Paypal + Stripe
            bonifici REAL DEFAULT 0,

            -- Mance (NON incluse negli incassi)
            mance REAL DEFAULT 0,

            -- Riepilogo
            totale_incassi REAL DEFAULT 0,     -- contanti + pos_bpm + pos_sella + theforkpay + other_e_payments + bonifici
            cash_diff REAL DEFAULT 0,          -- totale_incassi - corrispettivi_tot

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
# HELPER: PARSING VALORI
# ==============================================================

def _normalize_colname(col: str) -> str:
    """
    Normalizza il nome colonna:
    - rimuove spazi multipli
    - porta in maiuscolo
    - toglie simboli euro
    """
    if col is None:
        return ""
    s = str(col)
    s = s.replace("€", "")
    s = re.sub(r"\s+", " ", s)
    return s.strip().upper()


def _parse_euro(value) -> float:
    """
    Converte valori tipo '1.234,56 €' oppure numeri puri in float.
    Se vuoto / NaN / None -> 0.0
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0.0

    # Già numerico
    if isinstance(value, (int, float, np.number)):
        try:
            return float(value)
        except Exception:
            return 0.0

    s = str(value)
    if s.strip() == "":
        return 0.0

    s = s.replace("€", "").replace(" ", "").replace("\u00a0", "")
    s = s.replace(".", "")      # migliaia
    s = s.replace(",", ".")     # decimali

    try:
        return float(s)
    except ValueError:
        return 0.0


# ==============================================================
# SCELTA FOGLIO EXCEL
# ==============================================================

def _select_sheet_name(path: Path, year: str) -> str:
    """
    Sceglie il foglio corretto in base a year e ai nomi reali del file.

    - year == 'archivio'  -> cerca un foglio che contenga 'archivio';
                            se non lo trova usa il primo.
    - year == '2025' ecc. -> prova:
        1) match esatto '2025'
        2) se c'è un solo foglio non-archivio -> usa quello
        3) se c'è un foglio che contiene '2025' -> usa quello
        4) altrimenti solleva errore con elenco fogli.
    """
    xls = pd.ExcelFile(path)
    sheets = xls.sheet_names

    norm_sheets = {s: _normalize_colname(s) for s in sheets}
    year_str = str(year)
    is_archivio = year_str.lower() == "archivio"

    if is_archivio:
        # cerca foglio 'archivio'
        for s, ns in norm_sheets.items():
            if "ARCHIVIO" == ns or "ARCHIVIO" in ns:
                return s
        # fallback: primo foglio
        return sheets[0]

    # tentativo 1: match esatto '2025'
    for s in sheets:
        if s.strip() == year_str:
            return s

    # lista fogli non-archivio
    non_archivio = [s for s, ns in norm_sheets.items() if "ARCHIVIO" not in ns]

    # tentativo 2: se c'è un solo foglio non-archivio, uso quello
    if len(non_archivio) == 1:
        return non_archivio[0]

    # tentativo 3: fogli che contengono l'anno nel nome
    candidates = [s for s in sheets if year_str in s]
    if len(candidates) == 1:
        return candidates[0]

    # fallimento: elenco i fogli trovati
    raise ValueError(
        f"Worksheet compatibile con year='{year_str}' non trovato. "
        f"Fogli disponibili: {', '.join(sheets)}"
    )


# ==============================================================
# LOADER DI FILE EXCEL (archivio + anni singoli)
# ==============================================================

def load_corrispettivi_from_excel(path: Path, year: str) -> pd.DataFrame:
    """
    Loader definitivo con supporto a:
    - foglio archivio / foglio anno
    - date stringa
    - date numeriche seriali Excel
    - colonne mancanti → 0
    """

    # -----------------------------
    # 1) Determina foglio
    # -----------------------------
    year_str = str(year)
    is_archivio = year_str.lower() == "archivio"

    target_year: Optional[int] = None
    if not is_archivio:
        try:
            target_year = int(year_str)
        except ValueError:
            raise ValueError(f"Anno non valido: {year!r}")

    sheet_name = "archivio" if is_archivio else year_str

    # -----------------------------
    # 2) Lettura Excel
    # -----------------------------
    try:
        raw = pd.read_excel(path, sheet_name=sheet_name, dtype=object)
    except Exception as e:
        raise ValueError(f"Errore apertura foglio '{sheet_name}': {e}")

    if raw.empty:
        raise ValueError(f"Foglio '{sheet_name}' vuoto.")

    # -----------------------------
    # 3) Normalizzazione nomi colonne
    # -----------------------------
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
        elif norm in ("IVA 10%", "IVA10%", "IVA 10"):
            colmap["iva10"] = col
        elif norm in ("IVA 22%", "IVA22%", "IVA 22"):
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

    # -----------------------------
    # 4) Helper: parsing date
    # -----------------------------
    from datetime import datetime, timedelta

    def parse_excel_date(val):
        """Gestisce:
        - stringhe '01/01/2025'
        - datetime già formati
        - seriali excel (>= 30000 e <= 60000)
        """
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None

        # Caso datetime già pronto
        if isinstance(val, datetime):
            return val

        # Caso seriale Excel
        if isinstance(val, (int, float)):
            if 30000 <= float(val) <= 60000:
                try:
                    return datetime(1899, 12, 30) + timedelta(days=float(val))
                except Exception:
                    pass

        # Caso stringa
        try:
            return pd.to_datetime(val, dayfirst=True, errors="coerce")
        except Exception:
            return None

    # -----------------------------
    # 5) Parsing righe
    # -----------------------------
    records = []

    for _, row in raw.iterrows():

        raw_date = row.get(colmap["date"])
        parsed = parse_excel_date(raw_date)

        # skip righe non-data
        if parsed is None or pd.isna(parsed):
            continue

        # filtra l'anno se non archivio
        if not is_archivio and parsed.year != target_year:
            continue

        date_iso = parsed.strftime("%Y-%m-%d")

        # weekday
        weekday_val = None
        if "weekday" in colmap:
            weekday_val = row.get(colmap["weekday"])
        weekday = (str(weekday_val).strip()
                   if weekday_val not in (None, float("nan"))
                   else parsed.strftime("%A"))

        # fiscali
        iva10 = _parse_euro(row.get(colmap.get("iva10"))) if "iva10" in colmap else 0.0
        iva22 = _parse_euro(row.get(colmap.get("iva22"))) if "iva22" in colmap else 0.0
        fatture = _parse_euro(row.get(colmap.get("fatture"))) if "fatture" in colmap else 0.0

        # corrispettivi
        if "corr" in colmap:
            corr_val = _parse_euro(row.get(colmap["corr"]))
            if corr_val == 0.0:
                corr_val = iva10 + iva22
        else:
            corr_val = iva10 + iva22

        if "corr_tot" in colmap:
            corr_tot = _parse_euro(row.get(colmap["corr_tot"]))
            if corr_tot == 0.0:
                corr_tot = corr_val + fatture
        else:
            corr_tot = corr_val + fatture

        # pagamenti
        contanti = _parse_euro(row.get(colmap.get("contanti"))) if "contanti" in colmap else 0.0
        pos_bpm = _parse_euro(row.get(colmap.get("pos_bpm"))) if "pos_bpm" in colmap else 0.0
        pos_sella = _parse_euro(row.get(colmap.get("pos_sella"))) if "pos_sella" in colmap else 0.0
        thefork = _parse_euro(row.get(colmap.get("thefork"))) if "thefork" in colmap else 0.0
        paypal_stripe = _parse_euro(row.get(colmap.get("paypal_stripe"))) if "paypal_stripe" in colmap else 0.0
        bonifici = _parse_euro(row.get(colmap.get("bonifici"))) if "bonifici" in colmap else 0.0
        mance_dig = _parse_euro(row.get(colmap.get("mance"))) if "mance" in colmap else 0.0

        other_e_payments = paypal_stripe

        # totale incassi (senza mance)
        totale_incassi = contanti + pos_bpm + pos_sella + thefork + other_e_payments + bonifici
        cash_diff = totale_incassi - corr_tot

        record = {
            "date": date_iso,
            "weekday": weekday,
            "corrispettivi": corr_val,
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
            "is_closed": 0,
        }

        records.append(record)

    if not records:
        raise ValueError(f"Nessuna riga valida trovata nel foglio '{sheet_name}' (year={year}).")

    df = pd.DataFrame.from_records(records).sort_values("date").reset_index(drop=True)
    return df

# ==============================================================
# IMPORT NEL DATABASE
# ==============================================================

def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="import"):
    """
    Inserisce/aggiorna i record in daily_closures con schema allineato:

    id | date | weekday |
    corrispettivi | iva_10 | iva_22 | fatture | corrispettivi_tot |
    contanti_finali | pos_bpm | pos_sella | theforkpay | other_e_payments |
    bonifici | mance |
    totale_incassi | cash_diff |
    note | is_closed | created_by | created_at | updated_at
    """
    ensure_table(conn)
    cur = conn.cursor()

    inserted = 0
    updated = 0

    def _num(row, key):
        if key not in row or row[key] is None:
            return 0.0
        try:
            return float(row[key])
        except:
            return 0.0

    for _, row in df.iterrows():

        date_str = row["date"]
        weekday = row.get("weekday", "") or ""

        corrispettivi = _num(row, "corrispettivi")
        iva_10 = _num(row, "iva_10")
        iva_22 = _num(row, "iva_22")
        fatture = _num(row, "fatture")
        corrispettivi_tot = _num(row, "corrispettivi_tot")

        contanti_finali = _num(row, "contanti_finali")
        pos_bpm = _num(row, "pos_bpm")
        pos_sella = _num(row, "pos_sella")
        theforkpay = _num(row, "theforkpay")
        other_e_payments = _num(row, "other_e_payments")
        bonifici = _num(row, "bonifici")
        mance = _num(row, "mance")

        totale_incassi = _num(row, "totale_incassi")
        cash_diff = _num(row, "cash_diff")

        note = row.get("note", None)
        is_closed = int(row.get("is_closed", 0))

        # verifica esistenza record
        cur.execute("SELECT id FROM daily_closures WHERE date=?", (date_str,))
        existing = cur.fetchone()

        if existing:
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
                    contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
                    bonifici, mance, totale_incassi, cash_diff,
                    note, is_closed,
                    date_str,
                ),
            )
        else:
            inserted += 1
            cur.execute(
                """
                INSERT INTO daily_closures
                (date, weekday,
                 corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
                 contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
                 bonifici, mance, totale_incassi, cash_diff,
                 note, is_closed, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str, weekday,
                    corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
                    contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
                    bonifici, mance, totale_incassi, cash_diff,
                    note, is_closed, created_by
                ),
            )

    conn.commit()
    return inserted, updated