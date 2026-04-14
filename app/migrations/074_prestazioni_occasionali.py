"""
Migrazione 074: Prestazioni Occasionali

CONTESTO:
Marco vuole gestire nel gestionale i collaboratori assunti come
"prestazione occasionale" (art. 54-bis DL 50/2017 - PrestO / Libretto
Famiglia). Rispetto al dipendente normale:
- NON hanno contratto 40h né busta paga
- Pagamento tramite portale INPS (PrestO/LF) con comunicazione
  preventiva obbligatoria
- Soglia €2.500/anno stesso committente-prestatore
- Soglia €10.000/anno totale committente
- Soglia 280 ore/anno stesso prestatore-committente

NUOVA COLONNA `forma_rapporto` su `dipendenti` (NON uso la colonna
`tipo_rapporto` esistente, che è già occupata dai valori LUL
"indeterminato"/"determinato"). Valori `forma_rapporto`:
  - 'DIPENDENTE'        (default — busta paga, CCNL Turismo)
  - 'OCCASIONALE'       (prestazione occasionale INPS — PrestO/LF)
  - 'COLLABORATORE'     (P.IVA / collaborazione esterna)
  - 'STAGISTA'          (tirocinio)

AZIONI:
1) ALTER TABLE dipendenti ADD COLUMN forma_rapporto TEXT DEFAULT 'DIPENDENTE'
2) Backfill: tutti i dipendenti esistenti → forma_rapporto='DIPENDENTE'
3) Indice su dipendenti(forma_rapporto) per filtri veloci
4) Nuova tabella prestazioni_occasionali_log per tracciare le
   ricevute PrestO/Libretto Famiglia associate ai pagamenti

Idempotente. Lavora su dipendenti.sqlite3.
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DIP_DB = BASE_DIR / "app" / "data" / "dipendenti.sqlite3"


def upgrade(conn: sqlite3.Connection) -> None:
    """Riceve conn di foodcost.db (dal runner) ma lavora su dipendenti.sqlite3."""
    if not DIP_DB.exists():
        print("  [074] dipendenti.sqlite3 non esiste ancora, skip")
        return

    dip = sqlite3.connect(DIP_DB)
    try:
        cur = dip.cursor()

        # 1) Nuova colonna forma_rapporto
        try:
            cur.execute(
                "ALTER TABLE dipendenti ADD COLUMN "
                "forma_rapporto TEXT DEFAULT 'DIPENDENTE'"
            )
            print("  [074] colonna forma_rapporto aggiunta")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("  [074] forma_rapporto già presente")
            else:
                raise

        # 2) Backfill: tutti i dipendenti senza forma_rapporto → DIPENDENTE
        cur.execute(
            "UPDATE dipendenti SET forma_rapporto='DIPENDENTE' "
            "WHERE forma_rapporto IS NULL OR TRIM(forma_rapporto)=''"
        )
        print(f"  [074] backfill forma_rapporto: {cur.rowcount} righe")

        # 3) Indice
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_dipendenti_forma_rapporto "
            "ON dipendenti(forma_rapporto)"
        )
        print("  [074] indice idx_dipendenti_forma_rapporto ok")

        # 4) Tabella log ricevute PrestO / Libretto Famiglia
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS prestazioni_occasionali_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              dipendente_id INTEGER NOT NULL REFERENCES dipendenti(id),
              data_prestazione TEXT NOT NULL,      -- "YYYY-MM-DD"
              ore REAL NOT NULL,
              importo_lordo REAL NOT NULL,          -- compenso concordato
              importo_netto REAL,                    -- dopo trattenute INPS/INAIL
              canale TEXT NOT NULL DEFAULT 'PRESTO',-- 'PRESTO' | 'LIBRETTO_FAMIGLIA'
              ricevuta_numero TEXT,                  -- numero ricevuta INPS
              ricevuta_data TEXT,                    -- data registrazione INPS
              uscita_contanti_id INTEGER,            -- FK opzionale a admin_finance.cash_expenses
              note TEXT,
              stato TEXT NOT NULL DEFAULT 'REGISTRATO', -- REGISTRATO | ANNULLATO
              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
            """
        )
        print("  [074] tabella prestazioni_occasionali_log ok")

        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_presto_log_dip "
            "ON prestazioni_occasionali_log(dipendente_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_presto_log_data "
            "ON prestazioni_occasionali_log(data_prestazione)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_presto_log_dip_data "
            "ON prestazioni_occasionali_log(dipendente_id, data_prestazione)"
        )

        dip.commit()
    finally:
        dip.close()
