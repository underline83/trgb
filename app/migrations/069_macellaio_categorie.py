"""
Migrazione 069: categorie macellaio configurabili.

Cambia il concetto: la vecchia colonna `tipologia` in `macellaio_tagli`
conteneva animali (bovino/suino/...) ma in realtà serve la CATEGORIA DEL
TAGLIO (Filetto, Controfiletto, Costata, ecc.).

Passi:
  1. Crea `macellaio_categorie` (CRUD da Strumenti / Gestione Cucina)
  2. Crea `macellaio_config` (chiave/valore per impostazioni modulo)
  3. Seed categorie iniziali (Filetto, Controfiletto, Costata) + config default
  4. Rinomina `tipologia` → `categoria` su macellaio_tagli (best-effort)
  5. Reset valori vecchi (bovino/suino/...) → NULL
"""


def upgrade(conn):
    cur = conn.cursor()

    # ── 1. Tabella categorie ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS macellaio_categorie (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            emoji       TEXT,
            ordine      INTEGER NOT NULL DEFAULT 999,
            attivo      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + macellaio_categorie creata")

    # ── 2. Tabella config ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS macellaio_config (
            chiave      TEXT PRIMARY KEY,
            valore      TEXT NOT NULL,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + macellaio_config creata")

    # ── 3. Seed categorie iniziali ──
    seed = [
        ("Filetto",       "🥩", 10),
        ("Controfiletto", "🥩", 20),
        ("Costata",       "🥩", 30),
    ]
    for nome, emoji, ordine in seed:
        cur.execute("""
            INSERT OR IGNORE INTO macellaio_categorie (nome, emoji, ordine)
            VALUES (?, ?, ?)
        """, (nome, emoji, ordine))
    print(f"  + {len(seed)} categorie seed inserite (se mancanti)")

    # Seed config default
    cur.execute("""
        INSERT OR IGNORE INTO macellaio_config (chiave, valore)
        VALUES ('widget_max_categorie', '4')
    """)
    print("  + config widget_max_categorie=4 (default)")

    # ── 4. Rinomina colonna tipologia → categoria ──
    # SQLite 3.25+ supporta RENAME COLUMN. Controllo che esista prima.
    try:
        cols = cur.execute("PRAGMA table_info(macellaio_tagli)").fetchall()
        col_names = [c[1] for c in cols]
        if "tipologia" in col_names and "categoria" not in col_names:
            cur.execute("ALTER TABLE macellaio_tagli RENAME COLUMN tipologia TO categoria")
            print("  ✓ rinominato macellaio_tagli.tipologia → categoria")
        elif "categoria" in col_names:
            print("  · macellaio_tagli.categoria già presente, skip rename")
        else:
            print("  ⚠ colonna tipologia non trovata in macellaio_tagli")
    except Exception as e:
        print(f"  ⚠ rename column fallito: {e}")

    # ── 5. Reset valori legacy (animali) → NULL ──
    try:
        vecchi = ("bovino", "suino", "agnello", "vitello",
                  "selvaggina", "pollame", "altro")
        placeholders = ",".join("?" for _ in vecchi)
        cur.execute(f"""
            UPDATE macellaio_tagli
            SET categoria = NULL
            WHERE categoria IN ({placeholders})
        """, vecchi)
        n = cur.rowcount
        if n > 0:
            print(f"  ✓ {n} tagli con categoria legacy (animale) azzerati")
    except Exception as e:
        print(f"  ⚠ reset categorie legacy fallito: {e}")

    print("  mig 069 macellaio_categorie pronta")
