# @version: v1.0-fix-ids-magazzino
# -*- coding: utf-8 -*-
"""
Script una-tantum per riallineare gli ID della tabella vini_magazzino
nel DB app/data/vini_magazzino.sqlite3.

- Mantiene TUTTE le colonne esistenti (tranne l'id originale)
- Ricrea la tabella con id INTEGER PRIMARY KEY (riparte da 1)
- Copia i dati ordinati per id_excel (se esiste), altrimenti per id vecchio
"""

from pathlib import Path
import sqlite3

DB_PATH = Path("app/data/vini_magazzino.sqlite3")


def main():
    if not DB_PATH.exists():
        raise SystemExit(f"DB magazzino non trovato: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Controllo che la tabella esista
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_magazzino';"
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        raise SystemExit("Tabella 'vini_magazzino' non trovata nel DB.")

    # Leggo info colonne attuali
    cur.execute("PRAGMA table_info(vini_magazzino);")
    cols_info = cur.fetchall()

    # Colonne senza la PK 'id'
    other_cols = [c for c in cols_info if c["pk"] == 0]

    if not other_cols:
        conn.close()
        raise SystemExit("Nessuna colonna oltre 'id' trovata, qualcosa non torna.")

    # Costruisco definizione colonne (senza vincoli avanzati, ma stesso nome/type)
    def col_def(c):
        name = c["name"]
        col_type = c["type"] or ""
        # Qui potremmo rimettere NOT NULL / DEFAULT se ti interessa,
        # ma per ora ci basta nome + tipo.
        return f"{name} {col_type}".strip()

    cols_defs = ", ".join(col_def(c) for c in other_cols)

    # Creo tabella temporanea
    cur.execute("ALTER TABLE vini_magazzino RENAME TO vini_magazzino_old;")

    create_sql = f"""
    CREATE TABLE vini_magazzino (
        id INTEGER PRIMARY KEY,
        {cols_defs}
    );
    """
    cur.execute(create_sql)

    # Lista colonne da copiare (senza id)
    col_names = [c["name"] for c in other_cols]
    cols_list = ", ".join(col_names)

    # Se esiste id_excel lo uso per l'ordinamento, altrimenti uso il vecchio id
    has_id_excel = any(c["name"] == "id_excel" for c in other_cols)

    order_by = "id_excel" if has_id_excel else "id"

    insert_sql = f"""
    INSERT INTO vini_magazzino ({cols_list})
    SELECT {cols_list}
    FROM vini_magazzino_old
    ORDER BY {order_by};
    """

    cur.execute(insert_sql)

    # Drop tabella vecchia
    cur.execute("DROP TABLE vini_magazzino_old;")

    conn.commit()
    conn.close()
    print("✅ Riallineamento ID completato con successo.")


if __name__ == "__main__":
    main()