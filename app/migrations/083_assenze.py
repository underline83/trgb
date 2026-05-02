"""
Migrazione 083: Tabella assenze

Nuova feature "Assenze" nel modulo Turni (sessione 39).
Marco vuole segnare ferie, malattia e permessi direttamente dalla griglia turni.

Tabella: assenze (in dipendenti.sqlite3)
- dipendente_id + data con UNIQUE → un'assenza per persona per giorno
- tipo: FERIE / MALATTIA / PERMESSO
- note: campo libero opzionale
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
DIP_DB = locale_data_path("dipendenti.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """Riceve conn di foodcost.db (dal runner) ma lavora su dipendenti.sqlite3."""
    if not DIP_DB.exists():
        print("  [083] dipendenti.sqlite3 non esiste ancora, skip")
        return

    dip = sqlite3.connect(DIP_DB)
    try:
        cur = dip.cursor()

        # Controlla se la tabella esiste già
        cur.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='assenze'
        """)
        if cur.fetchone():
            print("  [083] tabella assenze gia' presente, skip")
            return

        cur.execute("""
            CREATE TABLE assenze (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dipendente_id INTEGER NOT NULL,
                data TEXT NOT NULL,
                tipo TEXT NOT NULL,
                note TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id)
            )
        """)

        cur.execute("""
            CREATE UNIQUE INDEX idx_assenze_dip_data
            ON assenze(dipendente_id, data)
        """)

        cur.execute("""
            CREATE INDEX idx_assenze_data
            ON assenze(data)
        """)

        dip.commit()
        print("  [083] creata tabella assenze con indici")
    finally:
        dip.close()
