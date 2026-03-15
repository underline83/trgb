"""
Migration 018 — iPratico Vendite Prodotto
Tabelle per import dati vendita da export iPratico (HTML mascherato da .xls).

Tabella ipratico_imports: log degli import mensili
Tabella ipratico_categorie: riepilogo per categoria (per mese)
Tabella ipratico_prodotti: dettaglio per prodotto (per mese)
"""


def upgrade(conn):
    cur = conn.cursor()

    # Log import
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ipratico_imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anno INTEGER NOT NULL,
            mese INTEGER NOT NULL,
            filename TEXT,
            n_categorie INTEGER DEFAULT 0,
            n_prodotti INTEGER DEFAULT 0,
            totale_euro REAL DEFAULT 0,
            imported_at TEXT DEFAULT (datetime('now')),
            UNIQUE(anno, mese)
        );
    """)

    # Riepilogo categorie per mese
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ipratico_categorie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anno INTEGER NOT NULL,
            mese INTEGER NOT NULL,
            categoria TEXT NOT NULL,
            quantita INTEGER DEFAULT 0,
            totale_cent INTEGER DEFAULT 0,
            UNIQUE(anno, mese, categoria)
        );
    """)

    # Dettaglio prodotti per mese
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ipratico_prodotti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anno INTEGER NOT NULL,
            mese INTEGER NOT NULL,
            categoria TEXT NOT NULL,
            prodotto TEXT NOT NULL,
            quantita INTEGER DEFAULT 0,
            totale_cent INTEGER DEFAULT 0,
            plu TEXT,
            barcode TEXT,
            UNIQUE(anno, mese, categoria, prodotto)
        );
    """)

    # Indici per query dashboard
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_ipratico_prod_anno_mese
        ON ipratico_prodotti(anno, mese);
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_ipratico_cat_anno_mese
        ON ipratico_categorie(anno, mese);
    """)

    conn.commit()
