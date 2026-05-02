"""
Migrazione 081: Dipendenti — aggiunge colonna `nickname`.

CONTESTO (sessione 40, richiesta Marco):
- In Osteria tutti si chiamano per nome o soprannome — "Pace", "Tango", "Bea",
  non "Giovanni Pacetti". Sul foglio settimana e nelle stampe turno quello
  che serve vedere e' il nome corto che lo staff usa davvero.
- Nome + cognome restano in anagrafica per scopi formali (buste paga, contratti).

AZIONI:
1) dipendenti.sqlite3 → ALTER TABLE dipendenti ADD COLUMN nickname TEXT
   (nullable, default NULL: quando manca si usa il nome come fallback lato FE)

Idempotente.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
DIP_DB = locale_data_path("dipendenti.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """Riceve conn di foodcost.db (dal runner) ma lavora su dipendenti.sqlite3."""
    if not DIP_DB.exists():
        print("  [081] dipendenti.sqlite3 non esiste ancora, skip")
        return

    dip = sqlite3.connect(DIP_DB)
    try:
        cur = dip.cursor()
        try:
            cur.execute("ALTER TABLE dipendenti ADD COLUMN nickname TEXT")
            print("  [081] colonna nickname aggiunta a dipendenti")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("  [081] nickname gia' presente")
            else:
                raise

        dip.commit()
    finally:
        dip.close()
