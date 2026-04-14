"""
Migrazione 075: Preventivi — snapshot menu righe + sconto/subtotale.

Contesto (sessione 35/36, feedback Marco):
- Il menu del preventivo va composto pescando piatti dalla Gestione Cucina
  (`recipes` via mig 074), ma una volta salvato sul preventivo deve essere
  IMMUTABILE: se il cuoco rinomina un piatto o ne cambia il prezzo, i
  preventivi gia' firmati non devono cambiare.
- Serve quindi una tabella snapshot: clienti_preventivi_menu_righe.
- Il prezzo visibile al cliente e' uno solo: subtotale - sconto.

Passi:
  1. ALTER clienti_preventivi:
     - ADD menu_sconto    REAL DEFAULT 0  (sconto in euro sul menu)
     - ADD menu_subtotale REAL DEFAULT 0  (somma prezzi righe snapshot)
  2. CREATE clienti_preventivi_menu_righe (snapshot immutabile):
     - id, preventivo_id, recipe_id (ref opzionale al piatto madre),
       sort_order, category_name, name, description, price, created_at
     - FK preventivo_id ON DELETE CASCADE (se il preventivo sparisce, spariscono le righe)
     - recipe_id: SET NULL se il piatto viene eliminato in Cucina (ma il nome
       resta nello snapshot — e' lo scopo di questa tabella)

NOTA: clienti_preventivi vive in clienti.sqlite3, non in foodcost.db.
"""

import sqlite3
from pathlib import Path

CLIENTI_DB = Path(__file__).resolve().parent.parent / "data" / "clienti.sqlite3"


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return

    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        # ── 1. ALTER clienti_preventivi ──
        check = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_preventivi'"
        ).fetchone()
        if check:
            existing_cols = {
                row[1] for row in cconn.execute("PRAGMA table_info(clienti_preventivi)").fetchall()
            }
            nuove = [
                ("menu_sconto",    "REAL DEFAULT 0"),
                ("menu_subtotale", "REAL DEFAULT 0"),
            ]
            for col_name, col_type in nuove:
                if col_name not in existing_cols:
                    try:
                        cconn.execute(f"ALTER TABLE clienti_preventivi ADD COLUMN {col_name} {col_type}")
                        print(f"  + clienti_preventivi.{col_name} aggiunta")
                    except sqlite3.OperationalError as e:
                        print(f"  ⚠ {col_name}: {e}")
        else:
            print("  · clienti_preventivi non esiste ancora, skip ALTER")

        # ── 2. CREATE clienti_preventivi_menu_righe ──
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_preventivi_menu_righe (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id   INTEGER NOT NULL,
                recipe_id       INTEGER,
                sort_order      INTEGER NOT NULL DEFAULT 0,
                category_name   TEXT,
                name            TEXT    NOT NULL,
                description     TEXT,
                price           REAL    NOT NULL DEFAULT 0,
                created_at      TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (preventivo_id) REFERENCES clienti_preventivi(id) ON DELETE CASCADE
            )
        """)
        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cpmr_preventivo ON clienti_preventivi_menu_righe(preventivo_id, sort_order)"
        )
        print("  + clienti_preventivi_menu_righe (tabella snapshot + index)")

        cconn.commit()
    finally:
        cconn.close()
