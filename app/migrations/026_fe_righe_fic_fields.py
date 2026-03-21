# @version: v1.0
"""
Migrazione 026 — Aggiunge campi FIC extra a fe_righe per salvare tutti i dati dell'API.

Nuovi campi:
- codice_articolo: code (es. "000060997001")
- fic_item_id: id interno FIC della riga
- fic_product_id: product_id FIC (se collegato a prodotto)
- detraibilita_iva: deductibility_vat_percentage
- stock: stock quantity
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(fe_righe)")
    cols = {row[1] for row in cur.fetchall()}

    new_cols = {
        "codice_articolo": "TEXT DEFAULT ''",
        "fic_item_id": "INTEGER",
        "fic_product_id": "INTEGER",
        "detraibilita_iva": "REAL",
        "stock": "REAL DEFAULT 0",
    }

    for col_name, col_def in new_cols.items():
        if col_name not in cols:
            cur.execute(f"ALTER TABLE fe_righe ADD COLUMN {col_name} {col_def}")

    conn.commit()
