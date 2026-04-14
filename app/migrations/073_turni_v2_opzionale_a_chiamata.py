"""
Migrazione 073: Turni v2 — rinomina stato CHIAMATA→OPZIONALE e aggiunge
flag `a_chiamata` sull'anagrafica dipendenti.

CONTESTO:
- Il vecchio concetto "stato=CHIAMATA" sul turno (erroneamente chiamato
  così in v1) indica un turno **opzionale**: viene eventualmente
  confermato/annullato all'ultimo e non pesa nel conteggio ore.
- Il **vero** concetto "a chiamata" è una proprietà del dipendente:
  persona pagata a ore senza contratto fisso di 40h.

AZIONI:
1) dipendenti.sqlite3 → ALTER TABLE dipendenti ADD COLUMN a_chiamata
   INTEGER DEFAULT 0
2) dipendenti.sqlite3 → UPDATE turni_calendario
   SET stato='OPZIONALE' WHERE UPPER(stato)='CHIAMATA'

Idempotente.
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DIP_DB = BASE_DIR / "app" / "data" / "dipendenti.sqlite3"


def upgrade(conn: sqlite3.Connection) -> None:
    """Riceve conn di foodcost.db (dal runner) ma lavora su dipendenti.sqlite3."""
    if not DIP_DB.exists():
        print("  [073] dipendenti.sqlite3 non esiste ancora, skip")
        return

    dip = sqlite3.connect(DIP_DB)
    try:
        cur = dip.cursor()

        # 1) Aggiungi colonna a_chiamata su dipendenti
        try:
            cur.execute(
                "ALTER TABLE dipendenti ADD COLUMN a_chiamata INTEGER DEFAULT 0"
            )
            print("  [073] colonna a_chiamata aggiunta a dipendenti")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("  [073] a_chiamata già presente")
            else:
                raise

        # 2) Rinomina stato CHIAMATA → OPZIONALE nei turni esistenti
        cur.execute(
            "UPDATE turni_calendario SET stato='OPZIONALE' "
            "WHERE UPPER(COALESCE(stato,''))='CHIAMATA'"
        )
        n = cur.rowcount
        print(f"  [073] turni CHIAMATA→OPZIONALE: {n}")

        dip.commit()
    finally:
        dip.close()
