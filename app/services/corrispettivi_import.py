# app/services/corrispettivi_import.py
# @version: v1.0

from pathlib import Path
import sqlite3
from typing import Tuple

import pandas as pd

DB_PATH = Path("app/data/admin_finance.db") 


def ensure_table(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            weekday TEXT NOT NULL,
            corrispettivi REAL NOT NULL DEFAULT 0,
            iva_10 REAL NOT NULL DEFAULT 0,
            iva_22 REAL NOT NULL DEFAULT 0,
            fatture REAL NOT NULL DEFAULT 0,
            contanti_finali REAL NOT NULL DEFAULT 0,
            pos REAL NOT NULL DEFAULT 0,
            sella REAL NOT NULL DEFAULT 0,
            stripe_pay REAL NOT NULL DEFAULT 0,
            bonifici REAL NOT NULL DEFAULT 0,
            mance REAL NOT NULL DEFAULT 0,
            totale_incassi REAL NOT NULL DEFAULT 0,
            cash_diff REAL NOT NULL DEFAULT 0,
            note TEXT,
            is_closed INTEGER NOT NULL DEFAULT 0,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # Se la tabella esisteva da prima senza is_closed, prova ad aggiungerla
    try:
        cur.execute(
            "ALTER TABLE daily_closures ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0"
        )
    except sqlite3.OperationalError:
        # colonna già esistente: ok
        pass

    conn.commit()



def load_corrispettivi_from_excel(path: Path, year: int) -> pd.DataFrame:
    """
    Carica il foglio Excel corrispondente all'anno indicato.

    - Per .xlsb usa engine 'pyxlsb'
    - Per .xlsx / .xls usa il reader standard
    - Il nome del foglio deve essere esattamente la stringa dell'anno, es. "2025", "2024", ecc.
    """
    suffix = path.suffix.lower()
    sheet_name = str(year)  # <-- QUI usiamo l'anno passato, NON fisso "2025"

    if suffix == ".xlsb":
        # Richiede pyxlsb installato
        df = pd.read_excel(path, sheet_name=sheet_name, engine="pyxlsb")
    elif suffix in (".xlsx", ".xls"):
        df = pd.read_excel(path, sheet_name=sheet_name)
    else:
        raise ValueError(f"Estensione file non supportata: {suffix}")

    if "date" not in df.columns:
        # o la colonna che avevamo deciso per la data
        raise ValueError("Nel foglio non è presente la colonna 'date'")

    # eventuale pulizia / normalizzazione che avevamo già:
    df["date"] = pd.to_datetime(df["date"]).dt.date

    return df
    
def import_df_into_db(
    df: pd.DataFrame,
    conn: sqlite3.Connection,
    created_by: str = "import-excel",
) -> Tuple[int, int]:
    """
    Importa il DataFrame nella tabella daily_closures.
    Ritorna (inserted, updated).
    """
    cur = conn.cursor()
    inserted = 0
    updated = 0

    for _, row in df.iterrows():
        totale_incassi = (
            row["Contanti Finali"]
            + row["POS"]
            + row["SELLA"]
            + row["STRIPE/PAY"]
            + row["BONIFICI"]
            + row["MANCE"]
        )
        cash_diff = totale_incassi - row["Corrispettivi"]

        date_str = row["date"].strftime("%Y-%m-%d")
        weekday = str(row["weekday"])

        # controlla se esiste già
        cur.execute("SELECT id FROM daily_closures WHERE date = ?", (date_str,))
        existing = cur.fetchone()

        cur.execute(
            """
            INSERT OR REPLACE INTO daily_closures
            (id, date, weekday,
             corrispettivi, iva_10, iva_22, fatture,
             contanti_finali, pos, sella, stripe_pay, bonifici, mance,
             totale_incassi, cash_diff,
             note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                existing[0] if existing else None,
                date_str,
                weekday,
                float(row["Corrispettivi"]),
                float(row["Iva 10%"]),
                float(row["Iva 22%"]),
                float(row["Fatture"]),
                float(row["Contanti Finali"]),
                float(row["POS"]),
                float(row["SELLA"]),
                float(row["STRIPE/PAY"]),
                float(row["BONIFICI"]),
                float(row["MANCE"]),
                float(totale_incassi),
                float(cash_diff),
                None,               # note
                created_by,
            ),
        )

        if existing:
            updated += 1
        else:
            inserted += 1

    conn.commit()
    return inserted, updated
