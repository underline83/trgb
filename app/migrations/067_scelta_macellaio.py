"""
Migrazione 067: crea tabella macellaio_tagli.

Modulo "Scelta del Macellaio" — la cucina gestisce i tagli di carne
disponibili alla vendita (tipologia, grammatura, prezzo).
La sala li segna come venduti.
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS macellaio_tagli (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL,
            tipologia       TEXT NOT NULL DEFAULT 'bovino',
            grammatura_g    INTEGER,
            prezzo_euro     REAL,
            note            TEXT,
            venduto         INTEGER NOT NULL DEFAULT 0,
            venduto_at      TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + macellaio_tagli creata")

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_macellaio_venduto
        ON macellaio_tagli(venduto)
    """)
    print("  + idx_macellaio_venduto creato")

    print("  mig 067 scelta_macellaio pronta")
