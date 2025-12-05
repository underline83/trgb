# app/services/admin_finance_db.py
# @version v1.0
import sqlite3
import pandas as pd


# ==============================================================
# CREAZIONE TABELLA (SCHEMA UFFICIALE TRGB)
# ==============================================================

def ensure_table(conn: sqlite3.Connection):
    """
    Crea la tabella daily_closures se non esiste.
    Schema allineato (2024/2025) e confermato.
    """
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            weekday TEXT,

            -- Fiscale
            corrispettivi REAL DEFAULT 0,
            iva_10 REAL DEFAULT 0,
            iva_22 REAL DEFAULT 0,
            fatture REAL DEFAULT 0,
            corrispettivi_tot REAL DEFAULT 0,

            -- Incassi (senza mance)
            contanti_finali REAL DEFAULT 0,
            pos_bpm REAL DEFAULT 0,
            pos_sella REAL DEFAULT 0,
            theforkpay REAL DEFAULT 0,
            other_e_payments REAL DEFAULT 0,
            bonifici REAL DEFAULT 0,

            -- Mance
            mance REAL DEFAULT 0,

            -- Riepilogo
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
# IMPORT IN DB: INSERT + UPDATE
# ==============================================================

def import_df_into_db(df: pd.DataFrame, conn: sqlite3.Connection, created_by="import"):
    """
    Inserisce o aggiorna le righe provenienti dal DataFrame già normalizzato.

    Campi accettati dal DF:
    - date, weekday
    - corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot
    - contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments
    - bonifici, mance
    - totale_incassi, cash_diff
    - note, is_closed
    """
    ensure_table(conn)
    cur = conn.cursor()

    inserted = 0
    updated = 0

    def _num(row, key):
        try:
            v = row.get(key, 0)
            if v is None:
                return 0.0
            return float(v)
        except:
            return 0.0

    for _, row in df.iterrows():

        date_str = row["date"]
        weekday = row.get("weekday", "") or ""

        # Fiscale
        corrispettivi = _num(row, "corrispettivi")
        iva_10 = _num(row, "iva_10")
        iva_22 = _num(row, "iva_22")
        fatture = _num(row, "fatture")
        corrispettivi_tot = _num(row, "corrispettivi_tot")

        # Incassi
        contanti_finali = _num(row, "contanti_finali")
        pos_bpm = _num(row, "pos_bpm")
        pos_sella = _num(row, "pos_sella")
        theforkpay = _num(row, "theforkpay")
        other_e_payments = _num(row, "other_e_payments")
        bonifici = _num(row, "bonifici")

        # Mance
        mance = _num(row, "mance")

        # Riepilogo
        totale_incassi = _num(row, "totale_incassi")
        cash_diff = _num(row, "cash_diff")

        # Altro
        note = row.get("note", None)
        is_closed = int(row.get("is_closed", 0) or 0)

        # Verifica esistenza
        cur.execute("SELECT id FROM daily_closures WHERE date=?", (date_str,))
        existing = cur.fetchone()

        if existing:
            updated += 1
            cur.execute(
                """
                UPDATE daily_closures
                SET weekday=?, corrispettivi=?, iva_10=?, iva_22=?, fatture=?,
                    corrispettivi_tot=?, contanti_finali=?, pos_bpm=?, pos_sella=?,
                    theforkpay=?, other_e_payments=?, bonifici=?, mance=?,
                    totale_incassi=?, cash_diff=?, note=?, is_closed=?,
                    updated_at=CURRENT_TIMESTAMP
                WHERE date=?
                """,
                (
                    weekday, corrispettivi, iva_10, iva_22, fatture,
                    corrispettivi_tot, contanti_finali, pos_bpm, pos_sella,
                    theforkpay, other_e_payments, bonifici, mance,
                    totale_incassi, cash_diff, note, is_closed,
                    date_str
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
                    bonifici, mance,
                    totale_incassi, cash_diff,
                    note, is_closed, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str, weekday,
                    corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
                    contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
                    bonifici, mance,
                    totale_incassi, cash_diff,
                    note, is_closed, created_by
                ),
            )

    conn.commit()
    return inserted, updated