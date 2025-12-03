# app/services/corrispettivi_import.py
# @version: v1.0

from pathlib import Path
import sqlite3
from typing import Tuple

import pandas as pd

DB_PATH = Path("app/data/admin_finance.db")  # puoi cambiare il nome se vuoi


def ensure_table(conn: sqlite3.Connection) -> None:
    """Crea la tabella daily_closures se non esiste."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_closures (
            id                INTEGER PRIMARY KEY,
            date              TEXT NOT NULL UNIQUE,
            weekday           TEXT NOT NULL,
            corrispettivi     REAL NOT NULL,
            iva_10            REAL NOT NULL DEFAULT 0,
            iva_22            REAL NOT NULL DEFAULT 0,
            fatture           REAL NOT NULL DEFAULT 0,
            contanti_finali   REAL NOT NULL DEFAULT 0,
            pos               REAL NOT NULL DEFAULT 0,
            sella             REAL NOT NULL DEFAULT 0,
            stripe_pay        REAL NOT NULL DEFAULT 0,
            bonifici          REAL NOT NULL DEFAULT 0,
            mance             REAL NOT NULL DEFAULT 0,
            totale_incassi    REAL NOT NULL,
            cash_diff         REAL NOT NULL,
            note              TEXT,
            created_by        TEXT,
            created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at        TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    conn.commit()


def load_corrispettivi_from_excel(path: Path, year: int = 2025) -> pd.DataFrame:
    """
    Legge il file Excel (.xlsb / .xlsx / .xls) e restituisce un DataFrame
    con le colonne necessarie per la tabella daily_closures.
    """
    # Foglio con nome = anno (es. "2025")
    df = pd.read_excel(path, engine="pyxlsb" if path.suffix == ".xlsb" else None, sheet_name=str(year))

    # DATA deve essere numerica (numero Excel della data)
    data_num = pd.to_numeric(df["DATA"], errors="coerce")
    df = df[data_num.notna()].copy()
    df["DATA_num"] = data_num[data_num.notna()]
    df["date"] = pd.to_datetime(df["DATA_num"], unit="D", origin="1899-12-30")

    # Colonne numeriche del tuo file
    num_cols = [
        "Corrispettivi",
        "Iva 10%",
        "Iva 22%",
        "Fatture",
        "Contanti Finali",
        "POS",
        "SELLA",
        "STRIPE/PAY",
        "BONIFICI",
        "MANCE",
        "CASH",
        "TOTALE",
    ]

    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Giorno: uso la colonna "Giorno" se piena, altrimenti ricavo dal datetime
    if "Giorno" in df.columns:
        df["weekday"] = df["Giorno"].fillna(df["date"].dt.day_name())
    else:
        df["weekday"] = df["date"].dt.day_name()

    # filtro anno
    df = df[df["date"].dt.year == year].copy()

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
