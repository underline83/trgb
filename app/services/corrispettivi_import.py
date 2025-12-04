# app/services/corrispettivi_import.py
# @version: v1.3
import re
import pandas as pd
import numpy as np
import sqlite3

from pathlib import Path
from datetime import datetime
from typing import Optional

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
    if value is None:
        return 0.0

    # Se è già numero
    if isinstance(value, (int, float)):
        return float(value)

    s = str(value)
    if s.strip() == "":
        return 0.0

    # rimuove simboli non numerici tipici
    s = s.replace("€", "").replace(" ", "").replace("\u00a0", "")  # spazio non-breaking
    # migliaia "." in italiano -> rimuovi
    s = s.replace(".", "")
    # decimale "," -> "."
    s = s.replace(",", ".")

    try:
        return float(s)
    except ValueError:
        return 0.0


def load_corrispettivi_from_excel(path: Path, year: str) -> pd.DataFrame:
    """
    Carica un file Excel corrispettivi con lo schema standard:

    DATA, GIORNO, CORRISPETTIVI-TOT, CORRISPETTIVI, IVA 10%, IVA 22%, FATTURE,
    CONTANTI, POS BPM, POS SELLA, THEFORKPAY, PAYPAL/STRIPE, BONIFICI,
    MANCE DIG, CASH, TOTALE, ...

    Regole:
    - se year == "archivio" (case-insensitive) -> usa foglio 'archivio',
      importa TUTTE le date presenti (2021, 2022, 2023, ...).
    - se year è ad es. "2024" -> usa foglio '2024' e importa SOLO righe con
      DATA di anno 2024.

    Ritorna un DataFrame con colonne pronte per import_df_into_db():
      date (YYYY-MM-DD), weekday, corrispettivi, iva_10, iva_22, fatture,
      contanti_finali, pos, sella, stripe_pay, bonifici, mance,
      totale_incassi, cash_diff, note, is_closed
    """
    year_str = str(year)
    is_archivio = year_str.lower() == "archivio"

    # Se non è archivio, ci aspettiamo qualcosa tipo "2024"
    target_year: Optional[int] = None
    if not is_archivio:
        try:
            target_year = int(year_str)
        except ValueError:
            raise ValueError(
                f"Valore year non valido: {year!r}. Usa 'archivio' oppure un anno, es. 2025."
            )

    sheet_name = "archivio" if is_archivio else year_str

    try:
        # dtype=object per evitare problemi di misto numeri/stringhe
        raw = pd.read_excel(path, sheet_name=sheet_name, dtype=object)
    except Exception as e:
        raise ValueError(f"Errore apertura foglio '{sheet_name}': {e}")

    if raw.empty:
        raise ValueError(f"Il foglio '{sheet_name}' è vuoto.")

    # Mappa le colonne in base al nome normalizzato
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
            colmap["cash"] = col   # non usato per il DB, ma lo mappo se serve debug
        elif norm == "TOTALE":
            colmap["totale"] = col # non necessario, ricalcoliamo totale_incassi

    # Controlli minimi obbligatori
    required_keys = ["date"]
    missing_required = [k for k in required_keys if k not in colmap]
    if missing_required:
        raise ValueError(
            f"Colonne obbligatorie mancanti nel foglio '{sheet_name}': {missing_required}"
        )

    # Costruiamo i record normalizzati
    records = []

    for _, row in raw.iterrows():
        # --- FIX IMPORT DATE dd/mm/yy (es. "05/01/25") ---
        raw_val = row.get(colmap["date"])

        # 1) Primo tentativo
        parsed = pd.to_datetime(raw_val, dayfirst=True, errors="coerce")

        # 2) Se fallisce, prova conversione manuale dd/mm/yy → dd/mm/yyyy
        if pd.isna(parsed) and isinstance(raw_val, str):
            m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2})$", raw_val.strip())
            if m:
                d, mth, yy = m.groups()
                yyyy = int(yy)
                # scegli se 20xx o 19xx
                yyyy = 2000 + yyyy if yyyy < 50 else 1900 + yyyy
                fixed = f"{d}/{mth}/{yyyy}"
                parsed = pd.to_datetime(fixed, dayfirst=True, errors="coerce")

        # 3) Se ancora NaT → numero Excel (seriale)
        if pd.isna(parsed) and isinstance(raw_val, (int, float)):
            parsed = pd.to_datetime("1899-12-30") + pd.to_timedelta(int(raw_val), unit="D")

        # Se ancora NaT → riga da ignorare
        if pd.isna(parsed):
            continue

        # se non è una data valida -> righe totali/riquadri vari -> ignora
        if pd.isna(parsed):
            continue

        # Se year specifico, filtra solo quell'anno
        if not is_archivio and target_year is not None:
            if parsed.year != target_year:
                continue

        date_iso = parsed.strftime("%Y-%m-%d")

        # weekday: se presente in colonna GIORNO uso quella, altrimenti calcolo
        weekday_val = None
        if "weekday" in colmap:
            weekday_val = row.get(colmap["weekday"])
        weekday = str(weekday_val).strip() if weekday_val not in (None, float("nan")) else ""
        if not weekday:
            weekday = parsed.strftime("%A")  # inglese, verrà usato poi nelle regole di chiusura

        # valori fiscali
        iva10 = _parse_euro(row.get(colmap.get("iva10"))) if "iva10" in colmap else 0.0
        iva22 = _parse_euro(row.get(colmap.get("iva22"))) if "iva22" in colmap else 0.0
        fatture = _parse_euro(row.get(colmap.get("fatture"))) if "fatture" in colmap else 0.0

        if "corr_tot" in colmap:
            corrispettivi_tot = _parse_euro(row.get(colmap["corr_tot"]))
        else:
            # fallback: somma corrispettivi + fatture
            corr_base = _parse_euro(row.get(colmap.get("corr"))) if "corr" in colmap else (iva10 + iva22)
            corrispettivi_tot = corr_base + fatture

        # pagamenti
        contanti = _parse_euro(row.get(colmap.get("contanti"))) if "contanti" in colmap else 0.0
        pos_bpm = _parse_euro(row.get(colmap.get("pos_bpm"))) if "pos_bpm" in colmap else 0.0
        pos_sella = _parse_euro(row.get(colmap.get("pos_sella"))) if "pos_sella" in colmap else 0.0
        thefork = _parse_euro(row.get(colmap.get("thefork"))) if "thefork" in colmap else 0.0
        paypal_stripe = _parse_euro(row.get(colmap.get("paypal_stripe"))) if "paypal_stripe" in colmap else 0.0
        bonifici = _parse_euro(row.get(colmap.get("bonifici"))) if "bonifici" in colmap else 0.0
        mance_dig = _parse_euro(row.get(colmap.get("mance"))) if "mance" in colmap else 0.0

        pos = pos_bpm
        sella = pos_sella
        stripe_pay = thefork + paypal_stripe

        totale_incassi = contanti + pos + sella + stripe_pay + bonifici + mance_dig

        cash_diff = totale_incassi - corrispettivi_tot

        record = {
            "date": date_iso,
            "weekday": weekday,
            "corrispettivi": corrispettivi_tot,
            "iva_10": iva10,
            "iva_22": iva22,
            "fatture": fatture,
            "contanti_finali": contanti,
            "pos": pos,
            "sella": sella,
            "stripe_pay": stripe_pay,
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

    # Ordina per data, giusto per sicurezza
    df = df.sort_values("date").reset_index(drop=True)
    return df 
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