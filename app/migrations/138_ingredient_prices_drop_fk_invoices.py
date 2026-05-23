"""
Migrazione 138 — ingredient_prices: rimuove la FK verso la tabella `invoices`
eliminata (2026-05-23)

CONTESTO (bug critico):
  `ingredient_prices` aveva ancora `FOREIGN KEY (invoice_id) REFERENCES
  invoices(id)`, residuo del vecchio schema v1. La tabella `invoices` è stata
  eliminata tempo fa, ma il vincolo FK è rimasto nella definizione.
  La connessione foodcost gira con `PRAGMA foreign_keys = ON`, quindi OGNI
  INSERT in `ingredient_prices` falliva con "no such table: main.invoices".
  Effetto: nessun prezzo è mai stato salvato (matching fatture e collegamenti
  ingrediente non funzionavano — `ingredient_prices` sempre vuota).

SOLUZIONE:
  Ricostruzione di `ingredient_prices` con lo stesso identico schema MENO la
  FK verso `invoices`. La colonna `invoice_id` resta (legacy, inutilizzata),
  perde solo il vincolo. Le FK valide verso `ingredients` e `suppliers`
  restano.

DB: foodcost.db. Idempotente (no-op se la FK non c'è più).
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner, foreign_keys OFF di default)."""
    cur = conn.cursor()

    row = cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='ingredient_prices'"
    ).fetchone()
    if not row:
        print("  [138] tabella ingredient_prices assente — no-op")
        return
    if "invoices" not in (row[0] or ""):
        print("  [138] ingredient_prices senza FK verso invoices — no-op")
        return

    n = cur.execute("SELECT COUNT(*) FROM ingredient_prices").fetchone()[0]

    cur.executescript(
        """
        CREATE TABLE ingredient_prices_new (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient_id INTEGER NOT NULL,
            supplier_id   INTEGER NOT NULL,
            price_date    TEXT    NOT NULL DEFAULT CURRENT_DATE,
            unit_price    REAL    NOT NULL,
            quantity      REAL,
            unit          TEXT,
            invoice_id    INTEGER,
            note          TEXT,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
            original_price REAL,
            original_unit  TEXT,
            original_qty   REAL,
            fattura_id     INTEGER,
            riga_fattura_id INTEGER,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );
        INSERT INTO ingredient_prices_new SELECT * FROM ingredient_prices;
        DROP TABLE ingredient_prices;
        ALTER TABLE ingredient_prices_new RENAME TO ingredient_prices;
        """
    )

    # Ricrea gli indici
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredient_prices_ing ON ingredient_prices(ingredient_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredient_prices_sup ON ingredient_prices(supplier_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ingredient_prices_date ON ingredient_prices(price_date)")

    print(f"  [138] ingredient_prices ricostruita senza FK verso invoices ({n} righe preservate)")
    print("  [138] DONE")
