# @version: v1.0
# Migrazione 008 — Categorie fornitori a 2 livelli
# Tabelle: fe_categorie (Cat.1), fe_sottocategorie (Cat.2), fe_fornitore_categoria (mapping)


def upgrade(conn):
    cur = conn.cursor()

    # --- Tabella categorie livello 1 ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_categorie (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            ordine      INTEGER DEFAULT 0,
            attiva      INTEGER DEFAULT 1
        )
    """)

    # --- Tabella sottocategorie livello 2 ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_sottocategorie (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_id  INTEGER NOT NULL,
            nome          TEXT NOT NULL,
            ordine        INTEGER DEFAULT 0,
            attiva        INTEGER DEFAULT 1,
            FOREIGN KEY (categoria_id) REFERENCES fe_categorie(id) ON DELETE CASCADE,
            UNIQUE(categoria_id, nome)
        )
    """)

    # --- Mapping fornitore → categoria + sottocategoria ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_fornitore_categoria (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            fornitore_piva    TEXT,
            fornitore_nome    TEXT NOT NULL,
            categoria_id      INTEGER,
            sottocategoria_id INTEGER,
            note              TEXT,
            FOREIGN KEY (categoria_id) REFERENCES fe_categorie(id) ON DELETE SET NULL,
            FOREIGN KEY (sottocategoria_id) REFERENCES fe_sottocategorie(id) ON DELETE SET NULL,
            UNIQUE(fornitore_piva)
        )
    """)

    # Indice per lookup rapido per nome (utile se piva manca)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_fornitore_cat_nome
        ON fe_fornitore_categoria(fornitore_nome)
    """)

    # --- Popola categorie e sottocategorie default ---
    tree = {
        "MATERIE PRIME": ["CARNE", "PESCE", "FORMAGGI", "SALUMI",
                          "ERBE, FRUTTA E VERDURA", "PASTA E FARINA",
                          "CAFFE", "MISTO", "VARIE"],
        "BEVANDE": ["VINO", "BIRRE", "ALCOLICI", "MISTO"],
        "STAFF": ["STIPENDI", "INDUMENTI", "COMPETENZE", "VARIE"],
        "AMMINISTRATORI": ["COMPENSI", "NOLEGGI", "VARIE"],
        "AFFITTI": ["OSTERIA", "CUCINA", "DEHOR"],
        "UTENZE": ["GAS", "LUCE", "ACQUA", "TELEFONO"],
        "SERVIZI": ["CONTABILITA'", "LAVANDERIA", "STAMPE", "PRENOTAZIONI",
                     "COMUNICAZIONE", "FIORISTA", "DETERGENZA",
                     "WEB, APP, SOFTWARE", "VARIE"],
        "ATTREZZATURE": ["VARIE"],
        "MANUTENZIONE": ["VARIE"],
    }

    for ordine, (cat_nome, sottocats) in enumerate(tree.items(), 1):
        cur.execute(
            "INSERT OR IGNORE INTO fe_categorie (nome, ordine) VALUES (?, ?)",
            (cat_nome, ordine),
        )
        # Recupera id (anche se esisteva gia')
        cur.execute("SELECT id FROM fe_categorie WHERE nome = ?", (cat_nome,))
        cat_id = cur.fetchone()[0]

        for sub_ordine, sub_nome in enumerate(sottocats, 1):
            cur.execute(
                "INSERT OR IGNORE INTO fe_sottocategorie (categoria_id, nome, ordine) VALUES (?, ?, ?)",
                (cat_id, sub_nome, sub_ordine),
            )

    conn.commit()
