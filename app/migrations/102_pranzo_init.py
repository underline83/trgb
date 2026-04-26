"""
Migrazione 102 — Schema modulo Menu Pranzo del Giorno (sessione 58 — 2026-04-26)

Modulo "Pranzo" come sub-voce di Gestione Cucina. Permette di:
  - Tenere un catalogo riusabile di piatti pranzo (con categoria)
  - Comporre il menu del giorno (data UNIQUE) selezionando dal catalogo o
    aggiungendo righe ad-hoc
  - Stampare PDF brand cliente "Osteria Tre Gobbi" (carta + Cormorant Garamond)
  - Archiviare i menu passati per ricerca/ristampa

DB: foodcost.db (tabelle nuove, nessun ALTER su esistenti).

Tabelle:
  - pranzo_piatti          catalogo riusabile (id, nome, categoria, recipe_id NULL)
  - pranzo_menu            menu del giorno (data UNIQUE, prezzi, footer, stato)
  - pranzo_menu_righe      M:N piatti/menu con snapshot nome/categoria
  - pranzo_settings        riga unica con default titolo/prezzi/footer

Idempotenza: tutto CREATE TABLE/INDEX IF NOT EXISTS.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")

    # ------------------------------------------------------------------
    # pranzo_piatti — catalogo riusabile
    # ------------------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_piatti (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL,
            categoria   TEXT NOT NULL DEFAULT 'primo'
                            CHECK (categoria IN ('antipasto','primo','secondo','contorno','dolce','altro')),
            attivo      INTEGER NOT NULL DEFAULT 1,
            note        TEXT,
            recipe_id   INTEGER,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_piatti_attivo ON pranzo_piatti(attivo)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_piatti_categoria ON pranzo_piatti(categoria)")

    # ------------------------------------------------------------------
    # pranzo_menu — menu del giorno (UNIQUE per data)
    # ------------------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_menu (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            data            TEXT NOT NULL UNIQUE,           -- YYYY-MM-DD
            titolo          TEXT,                            -- override default
            sottotitolo     TEXT,                            -- override default
            prezzo_1        REAL NOT NULL DEFAULT 15.0,
            prezzo_2        REAL NOT NULL DEFAULT 25.0,
            prezzo_3        REAL NOT NULL DEFAULT 35.0,
            footer_note     TEXT,                            -- override footer
            stato           TEXT NOT NULL DEFAULT 'bozza'
                                CHECK (stato IN ('bozza','pubblicato','archiviato')),
            created_by      TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_data ON pranzo_menu(data DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_stato ON pranzo_menu(stato)")

    # ------------------------------------------------------------------
    # pranzo_menu_righe — righe del menu del giorno
    # ------------------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_menu_righe (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            menu_id     INTEGER NOT NULL,
            piatto_id   INTEGER,                              -- NULL se ad-hoc
            nome        TEXT NOT NULL,                        -- snapshot nome
            categoria   TEXT NOT NULL DEFAULT 'primo',        -- snapshot categoria
            ordine      INTEGER NOT NULL DEFAULT 0,
            note        TEXT,
            FOREIGN KEY (menu_id)   REFERENCES pranzo_menu(id)   ON DELETE CASCADE,
            FOREIGN KEY (piatto_id) REFERENCES pranzo_piatti(id) ON DELETE SET NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_righe_menu ON pranzo_menu_righe(menu_id, ordine)")

    # ------------------------------------------------------------------
    # pranzo_settings — riga unica id=1 con default
    # ------------------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_settings (
            id                   INTEGER PRIMARY KEY CHECK (id = 1),
            titolo_default       TEXT NOT NULL DEFAULT 'OGGI A PRANZO: LA CUCINA DEL MERCATO',
            sottotitolo_default  TEXT NOT NULL DEFAULT 'Piatti in base agli acquisti del giorno, soggetti a disponibilità.',
            titolo_business      TEXT NOT NULL DEFAULT 'Menù Business',
            prezzo_1_default     REAL NOT NULL DEFAULT 15.0,
            prezzo_2_default     REAL NOT NULL DEFAULT 25.0,
            prezzo_3_default     REAL NOT NULL DEFAULT 35.0,
            footer_default       TEXT NOT NULL DEFAULT '*acqua, coperto e servizio inclusi
**da Lunedì a Venerdì',
            updated_at           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    # seed riga unica
    cur.execute("INSERT OR IGNORE INTO pranzo_settings (id) VALUES (1)")

    # ------------------------------------------------------------------
    # Seed catalogo: piatti dal Word storico fornito da Marco
    # (idempotente: solo se la tabella e' vuota)
    # ------------------------------------------------------------------
    n = cur.execute("SELECT COUNT(*) FROM pranzo_piatti").fetchone()[0]
    if n == 0:
        seed = [
            ("Bresaola di punta d'anca, carciofi sott'olio e parmigiano", "antipasto"),
            ("Spuma di scorzonera, trota affumicata e porcini spadellati", "antipasto"),
            ("Fusilli al ragu' di cinghiale delle Prealpi Orobiche",      "primo"),
            ("Ravioli del plin al brasato",                                "primo"),
            ("Anatra all'arancia con spinaci",                             "secondo"),
            ("Filettino di maiale cotto a bassa temperatura, con il suo fondo e patate arrostite", "secondo"),
        ]
        cur.executemany(
            "INSERT INTO pranzo_piatti (nome, categoria) VALUES (?, ?)",
            seed,
        )
        print(f"  [102] seed catalogo pranzo: {len(seed)} piatti inseriti")

    conn.commit()
    print("  [102] modulo Pranzo: 4 tabelle pronte (foodcost.db)")
