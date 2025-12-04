# app/services/corrispettivi_import.py
# @version: v2.0
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

            -- Incassi
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
    s = s.replace(".", "")  # migliaia
    s = s.replace(",", ".")  # decimali

    try:
        return float(s)
    except ValueError:
        return 0.0


# ==============================================================
# LOADER DI FILE EXCEL (archivio + anni singoli)
# ==============================================================

def load_corrispettivi_from_excel(path: Path, year: str) -> pd.DataFrame:
    """
    Carica un file Excel corrispettivi con lo schema standard:

    DATA, GIORNO, CORRISPETTIVI-TOT, CORRISPETTIVI, IVA 10%, IVA 22%, FATTURE,
    CONTANTI, POS BPM, POS SELLA, THEFORKPAY, PAYPAL/STRIPE, BONIFICI,
    MANCE DIG, CASH, TOTALE, ...

    Regole:
    - se year == "archivio" (case-insensitive) -> usa foglio 'archivio',
      importa TUTTE le date presenti.
    - se year è ad es. "2025" -> usa foglio '2025' e importa TUTTE le righe
      con DATA valida del foglio (non filtriamo più su parsed.year).

    Output: DataFrame con colonne pronte per import_df_into_db():
      date, weekday,
      corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
      contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
      bonifici, mance, totale_incassi, cash_diff, note, is_closed
    """
    year_str = str(year)
    is_archivio = year_str.lower() == "archivio"

    # Per ora manteniamo target_year solo per eventuali debug futuri,
    # ma NON lo usiamo più per filtrare le righe.
    if not is_archivio:
        try:
            int(year_str)
        except ValueError:
            raise ValueError(
                f"Valore year non valido: {year!r}. Usa 'archivio' oppure un anno, es. 2025."
            )

    sheet_name = "archivio" if is_archivio else year_str

    try:
        raw = pd.read_excel(path, sheet_name=sheet_name, dtype=object)
    except Exception as e:
        raise ValueError(f"Errore apertura foglio '{sheet_name}': {e}")

    if raw.empty:
        raise ValueError(f"Il foglio '{sheet_name}' è vuoto.")

    # Mappa nomi colonne
    colmap = {}
    for col in raw.columns:
        norm = _normalize_colname(col)

        if norm == "DATA":
            colmap["date"] = col
        elif norm == "GIORNO":
            colmap["weekday"] = col
        elif norm in ("CORRISPETTIVI-TOT", "CORRISPETTIVI TOT", "CORRISPETTIVI_TOT"):
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
        elif norm in ("POS BPM", "POSBPM", "POS RISTO", "POS"):
            colmap["pos_bpm"] = col
        elif norm in ("POS SELLA", "POSSELLA", "SELLA"):
            colmap["pos_sella"] = col
        elif norm in ("THEFORKPAY", "THE FORK PAY", "THEFORK PAY"):
            colmap["thefork"] = col
        elif norm in ("PAYPAL/STRIPE", "PAYPAL STRIPE", "STRIPE/PAYPAL"):
            colmap["paypal_stripe"] = col
        elif norm == "BONIFICI":
            colmap["bonifici"] = col
        elif norm in ("MANCE DIG", "MANCE DIGITALI", "MANCE"):
            colmap["mance"] = col
        elif norm == "CASH":
            colmap["cash"] = col      # solo per debug
        elif norm == "TOTALE":
            colmap["totale"] = col   # solo eventuale debug

    # Colonne minime necessarie
    if "date" not in colmap:
        raise ValueError(
            f"Colonna DATA mancante nel foglio '{sheet_name}'."
        )

    records = []

    for _, row in raw.iterrows():
        raw_date = row.get(colmap["date"])

        try:
            parsed = pd.to_datetime(raw_date, dayfirst=True, errors="coerce")
        except Exception:
            parsed = pd.NaT

        # Salta righe non data (totali, note, ecc.)
        if pd.isna(parsed):
            continue

        # NON filtriamo più per anno: per il foglio '2025' ci fidiamo che
        # contenga solo il 2025.
        date_iso = parsed.strftime("%Y-%m-%d")

        # weekday: se presente nel file uso quello, altrimenti calcolo
        weekday_val = None
        if "weekday" in colmap:
            weekday_val = row.get(colmap["weekday"])
        weekday = (str(weekday_val).strip()
                   if weekday_val not in (None, float("nan"))
                   else "")
        if not weekday:
            weekday = parsed.strftime("%A")

        # valori fiscali
        iva10 = _parse_euro(row.get(colmap.get("iva10"))) if "iva10" in colmap else 0.0
        iva22 = _parse_euro(row.get(colmap.get("iva22"))) if "iva22" in colmap else 0.0
        fatture = _parse_euro(row.get(colmap.get("fatture"))) if "fatture" in colmap else 0.0

        # corrispettivi "base": IVA10 + IVA22 o colonna CORRISPETTIVI
        if "corr" in colmap:
            corr_val = _parse_euro(row.get(colmap["corr"]))
            if corr_val == 0.0:
                corr_val = iva10 + iva22
        else:
            corr_val = iva10 + iva22

        # corrispettivi_tot: colonna CORRISPETTIVI-TOT se presente,
        # altrimenti corr_val + fatture
        if "corr_tot" in colmap:
            corrispettivi_tot = _parse_euro(row.get(colmap["corr_tot"]))
            if corrispettivi_tot == 0.0:
                corrispettivi_tot = corr_val + fatture
        else:
            corrispettivi_tot = corr_val + fatture

        # Pagamenti
        contanti = _parse_euro(row.get(colmap.get("contanti"))) if "contanti" in colmap else 0.0
        pos_bpm = _parse_euro(row.get(colmap.get("pos_bpm"))) if "pos_bpm" in colmap else 0.0
        pos_sella = _parse_euro(row.get(colmap.get("pos_sella"))) if "pos_sella" in colmap else 0.0
        thefork = _parse_euro(row.get(colmap.get("thefork"))) if "thefork" in colmap else 0.0
        paypal_stripe = _parse_euro(row.get(colmap.get("paypal_stripe"))) if "paypal_stripe" in colmap else 0.0
        bonifici = _parse_euro(row.get(colmap.get("bonifici"))) if "bonifici" in colmap else 0.0
        mance_dig = _parse_euro(row.get(colmap.get("mance"))) if "mance" in colmap else 0.0

        other_e_payments = paypal_stripe

        # TOT incassi (senza mance)
        totale_incassi = contanti + pos_bpm + pos_sella + thefork + other_e_payments + bonifici

        cash_diff = totale_incassi - corrispettivi_tot

        record = {
            "date": date_iso,
            "weekday": weekday,
            "corrispettivi": corr_val,
            "iva_10": iva10,
            "iva_22": iva22,
            "fatture": fatture,
            "corrispettivi_tot": corrispettivi_tot,
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
        raise ValueError(
            f"Nessuna riga valida trovata nel foglio '{sheet_name}' (year={year})."
        )

    df = pd.DataFrame.from_records(records)
    df = df.sort_values("date").reset_index(drop=True)
    return df
# ==============================================================
# IMPORT NEL DATABASE
# ==============================================================

# ==============================================================
# IMPORT NEL DATABASE
# ==============================================================

def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="import"):
    """
    Inserisce/aggiorna i record in daily_closures.

    Allineato alla struttura:
    id, date, weekday,
    corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
    contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
    bonifici, mance,
    totale_incassi, cash_diff,
    note, is_closed, created_by, created_at, updated_at
    """
    ensure_table(conn)
    cur = conn.cursor()

    inserted = 0
    updated = 0

    def _get_num(row, key: str) -> float:
        """
        Legge un valore numerico da una riga pandas in sicurezza:
        - se la colonna non esiste -> 0.0
        - se il valore è None/NaN -> 0.0
        - altrimenti prova a convertirlo a float
        """
        if key not in row.index:
            return 0.0
        v = row.get(key, 0)
        if v is None:
            return 0.0
        if isinstance(v, float) and np.isnan(v):
            return 0.0
        try:
            return float(v)
        except Exception:
            return 0.0

    for _, row in df.iterrows():
        date_str = row["date"]

        weekday = row.get("weekday", "") or ""

        corrispettivi = _get_num(row, "corrispettivi")
        iva_10 = _get_num(row, "iva_10")
        iva_22 = _get_num(row, "iva_22")
        fatture = _get_num(row, "fatture")
        corrispettivi_tot = _get_num(row, "corrispettivi_tot")
        if corrispettivi_tot == 0.0:
            corrispettivi_tot = corrispettivi + fatture

        contanti_finali = _get_num(row, "contanti_finali")
        pos_bpm = _get_num(row, "pos_bpm")
        pos_sella = _get_num(row, "pos_sella")
        theforkpay = _get_num(row, "theforkpay")
        other_e_payments = _get_num(row, "other_e_payments")
        bonifici = _get_num(row, "bonifici")
        mance = _get_num(row, "mance")

        # Totale incassi ESCLUSO mance (come deciso)
        totale_incassi = (
            contanti_finali
            + pos_bpm
            + pos_sella
            + theforkpay
            + other_e_payments
            + bonifici
        )

        cash_diff = totale_incassi - corrispettivi_tot

        note = row.get("note", None)
        is_closed_val = int(row.get("is_closed", 0) or 0)

        # Esiste già la riga per quella data?
        cur.execute("SELECT id FROM daily_closures WHERE date = ?", (date_str,))
        existing = cur.fetchone()

        if existing:
            updated += 1
            cur.execute(
                """
                UPDATE daily_closures
                SET
                    weekday = ?,
                    corrispettivi = ?,
                    iva_10 = ?,
                    iva_22 = ?,
                    fatture = ?,
                    corrispettivi_tot = ?,
                    contanti_finali = ?,
                    pos_bpm = ?,
                    pos_sella = ?,
                    theforkpay = ?,
                    other_e_payments = ?,
                    bonifici = ?,
                    mance = ?,
                    totale_incassi = ?,
                    cash_diff = ?,
                    note = ?,
                    is_closed = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE date = ?
                """,
                (
                    weekday,
                    corrispettivi,
                    iva_10,
                    iva_22,
                    fatture,
                    corrispettivi_tot,
                    contanti_finali,
                    pos_bpm,
                    pos_sella,
                    theforkpay,
                    other_e_payments,
                    bonifici,
                    mance,
                    totale_incassi,
                    cash_diff,
                    note,
                    is_closed_val,
                    date_str,
                ),
            )
        else:
            inserted += 1
            cur.execute(
                """
                INSERT INTO daily_closures (
                    date,
                    weekday,
                    corrispettivi,
                    iva_10,
                    iva_22,
                    fatture,
                    corrispettivi_tot,
                    contanti_finali,
                    pos_bpm,
                    pos_sella,
                    theforkpay,
                    other_e_payments,
                    bonifici,
                    mance,
                    totale_incassi,
                    cash_diff,
                    note,
                    is_closed,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str,
                    weekday,
                    corrispettivi,
                    iva_10,
                    iva_22,
                    fatture,
                    corrispettivi_tot,
                    contanti_finali,
                    pos_bpm,
                    pos_sella,
                    theforkpay,
                    other_e_payments,
                    bonifici,
                    mance,
                    totale_incassi,
                    cash_diff,
                    note,
                    is_closed_val,
                    created_by,
                ),
            )

    conn.commit()
    return inserted, updated