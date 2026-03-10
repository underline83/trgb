# @version: v1.0
# Migrazione 009 — Categorizzazione a livello prodotto/riga fattura
#
# 1. Aggiunge categoria_id e sottocategoria_id a fe_righe
#    (override rispetto alla categoria fornitore)
# 2. Crea tabella fe_prodotto_categoria_map per mappare
#    descrizione prodotto → categoria (auto-assign su nuovi import)


def upgrade(conn):
    cur = conn.cursor()

    # --- Aggiungi colonne a fe_righe ---
    # SQLite non ha IF NOT EXISTS per ALTER TABLE, usiamo try/except
    for col in ["categoria_id INTEGER", "sottocategoria_id INTEGER"]:
        try:
            cur.execute(f"ALTER TABLE fe_righe ADD COLUMN {col}")
        except Exception:
            pass  # colonna esiste gia'

    # --- Tabella mapping prodotto → categoria ---
    # Quando l'utente categorizza una riga, salviamo il pattern
    # (fornitore_piva + descrizione normalizzata) → (cat, subcat)
    # Cosi' le fatture future si auto-categorizzano
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_prodotto_categoria_map (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            fornitore_piva    TEXT,
            fornitore_nome    TEXT,
            descrizione_norm  TEXT NOT NULL,
            categoria_id      INTEGER,
            sottocategoria_id INTEGER,
            FOREIGN KEY (categoria_id) REFERENCES fe_categorie(id) ON DELETE SET NULL,
            FOREIGN KEY (sottocategoria_id) REFERENCES fe_sottocategorie(id) ON DELETE SET NULL,
            UNIQUE(fornitore_piva, descrizione_norm)
        )
    """)

    # Indice per lookup rapido
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_prodotto_map_desc
        ON fe_prodotto_categoria_map(descrizione_norm)
    """)

    conn.commit()
