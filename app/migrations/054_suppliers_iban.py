"""
Migrazione 054: suppliers.iban

Aggiunge la colonna `iban` alla tabella `suppliers` per permettere di salvare
manualmente (o in futuro automaticamente via parsing XML) l'IBAN del
fornitore. Serve alla stampa batch pagamenti dello Scadenzario Uscite:
quando l'IBAN e' valorizzato, appare nella colonna "IBAN / Coordinate"
del foglio A4 generato.

La colonna e' TEXT null-safe. Nessun backfill: l'admin la popola a mano
dalla scheda fornitore quando serve, oppure in futuro sara' popolata
automaticamente dall'import XML fatture.
"""


def upgrade(conn):
    cur = conn.cursor()

    cols = {row[1] for row in cur.execute("PRAGMA table_info(suppliers)").fetchall()}

    if "iban" not in cols:
        try:
            cur.execute("ALTER TABLE suppliers ADD COLUMN iban TEXT")
            print("  + suppliers.iban")
        except Exception as e:
            print(f"  skip suppliers.iban: {e}")
    else:
        print("  suppliers.iban gia' presente")

    print("  suppliers.iban pronto")
