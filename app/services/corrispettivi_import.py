# app/services/corrispettivi_import.py
# @version: v1.3

from pathlib import Path
import pandas as pd
import sqlite3

DB_PATH = Path("app/data/admin_finance.db")


# ---------------------------------------------------------
# CARICAMENTO EXCEL (usa foglio corrispondente a "year")
# ---------------------------------------------------------

def load_corrispettivi_from_excel(path: Path, year: int) -> pd.DataFrame:
    """
    Carica i corrispettivi dal file Excel.
    Il foglio viene scelto usando il parametro 'year' (es. "2024", "2025").
    """
    suffix = path.suffix.lower()
    sheet_name = str(year)  # <-- FINALE: usa l’anno selezionato dal frontend

    # Se è xlsb
    if suffix == ".xlsb":
        df = pd.read_excel(path, sheet_name=sheet_name, engine="pyxlsb")
    # Se è xlsx / xls
    elif suffix in (".xlsx", ".xls"):
        df = pd.read_excel(path, sheet_name=sheet_name)
    else:
        raise ValueError(f"Formato file non supportato: {suffix}")

    # Controllo colonne minime
    if "date" not in df.columns:
        raise ValueError("Colonna 'date' mancante nel foglio Excel.")

    # Normalizzazione della data
    df["date"] = pd.to_datetime(df["date"]).dt.date

    return df


# ---------------------------------------------------------
# CREA TABELLA SE NON ESISTE
# ---------------------------------------------------------

def ensure_table(conn: sqlite3.Connection):
    conn.execute(
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    conn.commit()


# ---------------------------------------------------------
# IMPORT DATAFRAME NEL DB
# ---------------------------------------------------------

def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="admin"):
    """
    Importa/aggiorna i dati giornalieri dal DataFrame.
    Ritorna #inseriti e #aggiornati.
    """
    inserted = 0
    updated = 0

    cur = conn.cursor()

    for _, r in df.iterrows():
        date_str = str(r["date"])

        # Prepara valori (metti 0 se manca)
        vals = {
            "weekday": r.get("weekday", ""),
            "corrispettivi": float(r.get("corrispettivi", 0) or 0),
            "iva_10": float(r.get("iva_10", 0) or 0),
            "iva_22": float(r.get("iva_22", 0) or 0),
            "fatture": float(r.get("fatture", 0) or 0),
            "contanti_finali": float(r.get("contanti_finali", 0) or 0),
            "pos": float(r.get("pos", 0) or 0),
            "sella": float(r.get("sella", 0) or 0),
            "stripe_pay": float(r.get("stripe_pay", 0) or 0),
            "bonifici": float(r.get("bonifici", 0) or 0),
            "mance": float(r.get("mance", 0) or 0),
            "note": r.get("note", None),
        }

        totale_incassi = (
            vals["contanti_finali"]
            + vals["pos"]
            + vals["sella"]
            + vals["stripe_pay"]
            + vals["bonifici"]
            + vals["mance"]
        )
        cash_diff = totale_incassi - vals["corrispettivi"]

        cur.execute("SELECT id FROM daily_closures WHERE date = ?", (date_str,))
        existing = cur.fetchone()

        if existing:
            updated += 1
            cur.execute(
                """
                UPDATE daily_closures
                SET weekday=?, corrispettivi=?, iva_10=?, iva_22=?, fatture=?,
                    contanti_finali=?, pos=?, sella=?, stripe_pay=?, bonifici=?,
                    mance=?, totale_incassi=?, cash_diff=?, note=?, updated_at=CURRENT_TIMESTAMP
                WHERE date=?
                """,
                (
                    vals["weekday"], vals["corrispettivi"], vals["iva_10"], vals["iva_22"], vals["fatture"],
                    vals["contanti_finali"], vals["pos"], vals["sella"], vals["stripe_pay"],
                    vals["bonifici"], vals["mance"], totale_incassi, cash_diff,
                    vals["note"], date_str
                ),
            )
        else:
            inserted += 1
            cur.execute(
                """
                INSERT INTO daily_closures (
                    date, weekday, corrispettivi, iva_10, iva_22, fatture,
                    contanti_finali, pos, sella, stripe_pay, bonifici, mance,
                    totale_incassi, cash_diff, note, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str, vals["weekday"], vals["corrispettivi"], vals["iva_10"], vals["iva_22"],
                    vals["fatture"], vals["contanti_finali"], vals["pos"], vals["sella"],
                    vals["stripe_pay"], vals["bonifici"], vals["mance"],
                    totale_incassi, cash_diff, vals["note"], created_by
                ),
            )

    conn.commit()
    return inserted, updated