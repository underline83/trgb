"""
Migrazione 074: Ricettario (modulo Cucina) — estensione piatti per menu preventivi.

Contesto (sessione 35, feedback Marco):
- "Gestione Cucina" (alias di Ricette) e' il luogo di verita' unico per i
  piatti. Un piatto e' un'entita' che:
    * vive in `recipes` (gia' esistente)
    * ha un nome interno cucina (`name`) e uno "poetico" per menu cliente
      (`menu_name`, opzionale, fallback su name)
    * ha una descrizione da stampare sul menu/preventivo (`menu_description`)
    * ha un kind ('dish' | 'base') che sostituisce semanticamente `is_base`
      senza romperlo (lo sincronizziamo)
    * puo' appartenere a N "tipi servizio" (Alla carta, Banchetto, Pranzo di
      lavoro, Aperitivo, ...). Many-to-many via `recipe_service_types`.
- I tipi servizio sono CONFIGURABILI da Impostazioni Cucina (regola granitica
  Marco: niente hardcoded).

Passi:
  1. ALTER recipes:
     - ADD menu_name        TEXT    (nullable)
     - ADD menu_description TEXT    (nullable)
     - ADD kind             TEXT    DEFAULT 'dish'  (valorizzato da is_base)
  2. CREATE service_types (id, name, sort_order, active, created_at)
  3. CREATE recipe_service_types (recipe_id, service_type_id) PK composta
  4. SEED service_types con valori default (modificabili):
     - Alla carta, Banchetto, Pranzo di lavoro, Aperitivo

NOTA: recipes vive in foodcost.db. Tutta la migrazione sta su conn (foodcost).
"""

import sqlite3


def upgrade(conn):
    cur = conn.cursor()

    # ── 1. ALTER recipes: menu_name, menu_description, kind ──
    check = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'"
    ).fetchone()
    if not check:
        print("  · recipes non esiste ancora, skip")
        conn.commit()
        return

    existing = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}

    # menu_name
    if "menu_name" not in existing:
        try:
            cur.execute("ALTER TABLE recipes ADD COLUMN menu_name TEXT")
            print("  + recipes.menu_name aggiunta")
        except sqlite3.OperationalError as e:
            print(f"  ⚠ menu_name: {e}")

    # menu_description
    if "menu_description" not in existing:
        try:
            cur.execute("ALTER TABLE recipes ADD COLUMN menu_description TEXT")
            print("  + recipes.menu_description aggiunta")
        except sqlite3.OperationalError as e:
            print(f"  ⚠ menu_description: {e}")

    # kind — derivato da is_base
    if "kind" not in existing:
        try:
            cur.execute("ALTER TABLE recipes ADD COLUMN kind TEXT DEFAULT 'dish'")
            # popola kind dai dati esistenti is_base
            cur.execute("""
                UPDATE recipes
                SET kind = CASE WHEN COALESCE(is_base, 0) = 1 THEN 'base' ELSE 'dish' END
            """)
            print("  + recipes.kind aggiunta e popolata da is_base")
        except sqlite3.OperationalError as e:
            print(f"  ⚠ kind: {e}")

    # ── 2. CREATE service_types ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS service_types (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL UNIQUE,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            active      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)
    print("  + service_types (tabella)")

    # ── 3. CREATE recipe_service_types (ponte M:N) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recipe_service_types (
            recipe_id        INTEGER NOT NULL,
            service_type_id  INTEGER NOT NULL,
            created_at       TEXT    DEFAULT (datetime('now')),
            PRIMARY KEY (recipe_id, service_type_id),
            FOREIGN KEY (recipe_id)       REFERENCES recipes(id)       ON DELETE CASCADE,
            FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE CASCADE
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rst_service ON recipe_service_types(service_type_id)")
    print("  + recipe_service_types (tabella ponte)")

    # ── 4. SEED service_types default (modificabili) ──
    defaults = [
        ("Alla carta",       10),
        ("Banchetto",        20),
        ("Pranzo di lavoro", 30),
        ("Aperitivo",        40),
    ]
    for name, order in defaults:
        cur.execute(
            "INSERT OR IGNORE INTO service_types (name, sort_order, active) VALUES (?, ?, 1)",
            (name, order),
        )
    n_seed = cur.execute("SELECT COUNT(*) FROM service_types").fetchone()[0]
    print(f"  + service_types seed: {n_seed} righe totali")

    conn.commit()
