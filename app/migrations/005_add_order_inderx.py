# @version: v1.0-005-add-order-index
# Migrazione 005 – Aggiunge la colonna order_index alla tabella recipe_items

def upgrade(conn):
    cur = conn.cursor()

    # Verifica se la colonna esiste già
    cur.execute("PRAGMA table_info(recipe_items)")
    columns = [row[1] for row in cur.fetchall()]

    if "order_index" in columns:
        print("✔ Colonna 'order_index' già presente, skip.")
        return

    print("➕ Aggiungo colonna 'order_index' a recipe_items…")

    cur.execute("""
        ALTER TABLE recipe_items
        ADD COLUMN order_index INTEGER DEFAULT 0;
    """)

    conn.commit()
    print("✔ Migrazione 005 completata.")