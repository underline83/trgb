"""
Migrazione 102 — Schema modulo Menu Pranzo settimanale (sessione 58 cont., 2026-04-26)

Modulo "Pranzo" come sub-voce di Gestione Cucina.

Decisioni di Marco (sessione 58 cont.):
1. Il menu pranzo e' SETTIMANALE, non giornaliero. Chiave UNIQUE = lunedi' della
   settimana (`settimana_inizio` TEXT YYYY-MM-DD).
2. I "piatti" NON sono un catalogo separato. Si pescano dalle `recipes` filtrate
   per `service_types.name = 'Pranzo di lavoro'` (mig 074). Quindi NIENTE tabella
   pranzo_piatti.
3. La pagina `/pranzo` e' solo un compositore: data settimana + scelta piatti.
   Prezzi, testata, footer vivono SOLO in Impostazioni Cucina ("Menu Pranzo").
   Quindi `pranzo_menu` non porta prezzi/testata/footer come override.

DB: foodcost.db.

Tabelle:
  - pranzo_menu          — menu della settimana (UNIQUE su settimana_inizio)
  - pranzo_menu_righe    — righe con FK opzionale a recipes + snapshot nome/categoria
  - pranzo_settings      — riga unica id=1 con default titolo/prezzi/footer

Idempotenza: tutto CREATE TABLE/INDEX IF NOT EXISTS.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")

    # ------------------------------------------------------------------
    # pranzo_menu — menu della settimana (UNIQUE per settimana_inizio)
    # ------------------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_menu (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            settimana_inizio    TEXT NOT NULL UNIQUE,         -- YYYY-MM-DD del LUNEDI
            created_by          TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_settimana ON pranzo_menu(settimana_inizio DESC)")

    # ------------------------------------------------------------------
    # pranzo_menu_righe — righe del menu della settimana (FK -> recipes)
    # Snapshot di nome+categoria per archivio storico (se la ricetta cambia
    # o sparisce, l'archivio mostra cosa era stato proposto quella settimana).
    # ------------------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_menu_righe (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            menu_id         INTEGER NOT NULL,
            recipe_id       INTEGER,                          -- FK opz. a recipes
            nome            TEXT NOT NULL,                    -- snapshot menu_name o name
            categoria       TEXT NOT NULL DEFAULT 'altro',    -- snapshot (antipasto/primo/...)
            ordine          INTEGER NOT NULL DEFAULT 0,
            note            TEXT,
            FOREIGN KEY (menu_id)   REFERENCES pranzo_menu(id) ON DELETE CASCADE,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id)    ON DELETE SET NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_righe_menu ON pranzo_menu_righe(menu_id, ordine)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_righe_recipe ON pranzo_menu_righe(recipe_id)")

    # ------------------------------------------------------------------
    # pranzo_settings — riga unica id=1 con default titolo/prezzi/footer
    # Vivono SOLO qui (no override per settimana, scelta UX di Marco).
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
    cur.execute("INSERT OR IGNORE INTO pranzo_settings (id) VALUES (1)")

    conn.commit()
    print("  [102] modulo Pranzo settimanale: 3 tabelle pronte (foodcost.db)")
