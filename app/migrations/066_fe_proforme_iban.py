"""
Migrazione 066: aggiunge colonna IBAN a fe_proforme.

L'IBAN serve per sapere dove pagare la proforma.
"""


def upgrade(conn):
    cur = conn.cursor()

    try:
        cur.execute("ALTER TABLE fe_proforme ADD COLUMN iban TEXT")
        print("  + fe_proforme.iban aggiunta")
    except Exception as e:
        print(f"  skip fe_proforme.iban: {e}")

    print("  mig 066 fe_proforme_iban pronta")
