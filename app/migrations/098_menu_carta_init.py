"""
Migrazione 098 — Schema modulo Menu Carta (sessione 57 — 2026-04-25)

Crea le 4 tabelle base del modulo Menu Carta + 3 ADD COLUMN su `recipes`
per supportare allergeni calcolati, istruzioni impiattamento e tempo
servizio dichiarato al cliente.

Specifica completa: docs/menu_carta.md (sezione 3).

Tabelle nuove (foodcost.db):
  - menu_editions             — edizioni stagionali del menu (Primavera 2026, ...)
  - menu_dish_publications    — riga di pubblicazione di un piatto in un'edizione
  - menu_tasting_paths        — percorsi degustazione ("Prima volta", "Fidati dell'Oste")
  - menu_tasting_path_steps   — passi di un percorso degustazione

ALTER su recipes (esistenti dal food cost v2):
  - allergeni_calcolati     TEXT  — CSV degli allergeni desunti dagli ingredienti
                                    (cache, ricalcolata da job notturno)
  - istruzioni_impiattamento TEXT — testo libero per il cuoco al pass
  - tempo_servizio_minuti   INTEGER — minuti dichiarati al cliente per arrivo al tavolo

Idempotenza:
  - Tutte le tabelle: CREATE TABLE IF NOT EXISTS
  - Tutti gli indici: CREATE INDEX IF NOT EXISTS
  - ALTER COLUMN: check con PRAGMA table_info prima

Riferimenti:
  - docs/menu_carta.md (design doc completo)
  - docs/design_ricette_foodcost_v2.md (schema recipes esistente)
  - app/migrations/074_recipes_menu_servizi.py (estensione recipes per servizi)
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")

    # ───────────────────────────────────────────────────────────
    # 1. menu_editions
    # ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS menu_editions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT    NOT NULL,
            slug            TEXT    NOT NULL UNIQUE,
            stagione        TEXT,                                -- 'primavera'|'estate'|'autunno'|'inverno'
            anno            INTEGER,
            data_inizio     TEXT,                                -- ISO
            data_fine       TEXT,                                -- ISO
            stato           TEXT    NOT NULL DEFAULT 'bozza',    -- 'bozza'|'in_carta'|'archiviata'
            note            TEXT,
            pdf_path        TEXT,
            created_at      TEXT    DEFAULT (datetime('now')),
            updated_at      TEXT    DEFAULT (datetime('now'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_menu_editions_stato ON menu_editions(stato)")
    # vincolo: una sola edizione 'in_carta' per volta
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_editions_in_carta
        ON menu_editions(stato) WHERE stato = 'in_carta'
    """)
    print("  + menu_editions (tabella + indici)")

    # ───────────────────────────────────────────────────────────
    # 2. menu_dish_publications
    # ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS menu_dish_publications (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            edition_id      INTEGER NOT NULL,
            recipe_id       INTEGER,                              -- nullable per voci servizio / piatti del giorno
            sezione         TEXT    NOT NULL,                     -- 'antipasti'|'paste_risi_zuppe'|'piatti_del_giorno'|
                                                                  -- 'secondi'|'contorni'|'degustazioni'|'bambini'|'servizio'
            sort_order      INTEGER NOT NULL DEFAULT 0,

            -- Override testuali (NULL = fallback su recipes.menu_name/description)
            titolo_override         TEXT,
            descrizione_override    TEXT,

            -- Prezzi (uno solo dei tre va valorizzato, salvo descrizione_variabile/servizio)
            prezzo_singolo  REAL,
            prezzo_min      REAL,
            prezzo_max      REAL,
            prezzo_piccolo  REAL,
            prezzo_grande   REAL,
            prezzo_label    TEXT,

            -- Flag/annotazioni stampa
            consigliato_per         INTEGER,
            descrizione_variabile   INTEGER NOT NULL DEFAULT 0,
            badge                   TEXT,
            is_visible              INTEGER NOT NULL DEFAULT 1,

            -- Allergeni dichiarati (CSV, UE 1169/2011)
            allergeni_dichiarati    TEXT,

            -- Foto
            foto_path               TEXT,

            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now')),

            FOREIGN KEY (edition_id) REFERENCES menu_editions(id) ON DELETE CASCADE,
            FOREIGN KEY (recipe_id)  REFERENCES recipes(id)       ON DELETE SET NULL,

            CHECK (
                prezzo_singolo IS NOT NULL
                OR (prezzo_min IS NOT NULL AND prezzo_max IS NOT NULL)
                OR (prezzo_piccolo IS NOT NULL AND prezzo_grande IS NOT NULL)
                OR descrizione_variabile = 1
                OR sezione = 'servizio'
            )
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mdp_edition_section
        ON menu_dish_publications(edition_id, sezione, sort_order)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mdp_recipe
        ON menu_dish_publications(recipe_id)
    """)
    print("  + menu_dish_publications (tabella + indici)")

    # ───────────────────────────────────────────────────────────
    # 3. menu_tasting_paths
    # ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS menu_tasting_paths (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            edition_id      INTEGER NOT NULL,
            nome            TEXT    NOT NULL,
            sottotitolo     TEXT,
            prezzo_persona  REAL    NOT NULL,
            note            TEXT,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            is_visible      INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (edition_id) REFERENCES menu_editions(id) ON DELETE CASCADE
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mtp_edition
        ON menu_tasting_paths(edition_id, sort_order)
    """)
    print("  + menu_tasting_paths (tabella + indici)")

    # ───────────────────────────────────────────────────────────
    # 4. menu_tasting_path_steps
    # ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS menu_tasting_path_steps (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            path_id         INTEGER NOT NULL,
            sort_order      INTEGER NOT NULL,
            publication_id  INTEGER,
            titolo_libero   TEXT,
            note            TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (path_id)        REFERENCES menu_tasting_paths(id)        ON DELETE CASCADE,
            FOREIGN KEY (publication_id) REFERENCES menu_dish_publications(id)    ON DELETE SET NULL
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mtps_path
        ON menu_tasting_path_steps(path_id, sort_order)
    """)
    print("  + menu_tasting_path_steps (tabella + indici)")

    # ───────────────────────────────────────────────────────────
    # 5. ALTER recipes
    # ───────────────────────────────────────────────────────────
    check = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'"
    ).fetchone()
    if not check:
        print("  · recipes non esiste ancora, skip ALTER (food cost v2 non applicato?)")
    else:
        existing = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}

        if "allergeni_calcolati" not in existing:
            try:
                cur.execute("ALTER TABLE recipes ADD COLUMN allergeni_calcolati TEXT")
                print("  + recipes.allergeni_calcolati aggiunta")
            except sqlite3.OperationalError as e:
                print(f"  ⚠ allergeni_calcolati: {e}")

        if "istruzioni_impiattamento" not in existing:
            try:
                cur.execute("ALTER TABLE recipes ADD COLUMN istruzioni_impiattamento TEXT")
                print("  + recipes.istruzioni_impiattamento aggiunta")
            except sqlite3.OperationalError as e:
                print(f"  ⚠ istruzioni_impiattamento: {e}")

        if "tempo_servizio_minuti" not in existing:
            try:
                cur.execute("ALTER TABLE recipes ADD COLUMN tempo_servizio_minuti INTEGER")
                print("  + recipes.tempo_servizio_minuti aggiunta")
            except sqlite3.OperationalError as e:
                print(f"  ⚠ tempo_servizio_minuti: {e}")

    conn.commit()
    print("  [098] schema Menu Carta inizializzato")
