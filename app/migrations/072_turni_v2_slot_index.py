"""
Migrazione 072: Turni v2 — slot_index per foglio settimana

Aggiunge `slot_index INTEGER` a `turni_calendario` (dipendenti.sqlite3).
Serve al Foglio Settimana per mantenere la posizione del dipendente nella
colonna corrispondente al servizio (P1..P6 / C1..C6) senza doverla
ricalcolare ogni volta.

- NULL = turno "libero" (legacy) non posizionato nel foglio
- >=0  = indice colonna slot nel servizio (0-based: 0=P1 / C1)

Idempotente.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
DIP_DB = locale_data_path("dipendenti.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """Nota: riceve conn di foodcost.db (dal runner) ma lavora su dipendenti.sqlite3."""
    if not DIP_DB.exists():
        print(f"  [072] dipendenti.sqlite3 non esiste ancora, skip")
        return

    dip = sqlite3.connect(DIP_DB)
    try:
        cur = dip.cursor()
        try:
            cur.execute("ALTER TABLE turni_calendario ADD COLUMN slot_index INTEGER")
            print("  [072] colonna slot_index aggiunta a turni_calendario")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("  [072] slot_index già presente")
            else:
                raise
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_turni_cal_data_servizio_slot "
            "ON turni_calendario(data, slot_index)"
        )
        dip.commit()
    finally:
        dip.close()
