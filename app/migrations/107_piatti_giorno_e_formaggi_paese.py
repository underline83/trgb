# Modulo: cucina (selezioni)
"""
Migrazione 107: due cose insieme, entrambe sul cluster CUCINA (foodcost.db).

A) Crea tabelle modulo "Piatti del Giorno" come 5a zona di "Selezioni del Giorno".
   Pattern analogo a salumi (mig 091) + formaggi (mig 092):
     - piatti_giorno              → singoli piatti in carta (stato attivo/archivio)
     - piatti_giorno_categorie    → categorie configurabili (Antipasto, Primo, Secondo,
                                    Contorno, Dolce, Speciale)
     - piatti_giorno_config       → config widget (chiave/valore)
   Stato: "attivo/archiviato" (come salumi/formaggi). Niente concetto "venduto".

B) Aggiunge colonna `paese` a `formaggi_tagli`:
   - paese TEXT (NULL ammesso, default NULL)
   Permette di marcare ciascun formaggio come "Italia", "Francia" o altro.
   La UI di gestione raggrupperà i formaggi per paese come categoria madre,
   tenendo le categorie esistenti (Vaccino/Caprino/Ovino/Misto) come figli
   condivisi tra i due paesi.

Idempotente: tutte le CREATE TABLE/INDEX hanno IF NOT EXISTS,
le ALTER TABLE sono in try/except.

Nessun seed dati TRGB-specific (le categorie iniziali sono generiche).
"""


def upgrade(conn):
    cur = conn.cursor()

    # ─────────────────────────────────────────────────────────
    # A) PIATTI DEL GIORNO
    # ─────────────────────────────────────────────────────────

    # ── 1. Tabella piatti del giorno ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS piatti_giorno (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL,
            categoria       TEXT,
            grammatura_g    INTEGER,
            prezzo_euro     REAL,
            descrizione     TEXT,
            note            TEXT,
            attivo          INTEGER NOT NULL DEFAULT 1,
            archiviato_at   TEXT,
            venduto         INTEGER NOT NULL DEFAULT 0,
            venduto_at      TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + piatti_giorno creata")

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_piatti_giorno_attivo
        ON piatti_giorno(attivo)
    """)
    print("  + idx_piatti_giorno_attivo creato")

    # ── 2. Tabella categorie ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS piatti_giorno_categorie (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            emoji       TEXT,
            ordine      INTEGER NOT NULL DEFAULT 999,
            attivo      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + piatti_giorno_categorie creata")

    # ── 3. Tabella config ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS piatti_giorno_config (
            chiave      TEXT PRIMARY KEY,
            valore      TEXT NOT NULL,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + piatti_giorno_config creata")

    # ── 4. Seed categorie iniziali ──
    seed = [
        ("Antipasto", "\U0001F957", 10),  # 🥗
        ("Primo",     "\U0001F35D", 20),  # 🍝
        ("Secondo",   "\U0001F356", 30),  # 🍖
        ("Contorno",  "\U0001F966", 40),  # 🥦
        ("Dolce",     "\U0001F368", 50),  # 🍨
        ("Speciale",  "\U00002B50", 60),  # ⭐
    ]
    for nome, emoji, ordine in seed:
        cur.execute("""
            INSERT OR IGNORE INTO piatti_giorno_categorie (nome, emoji, ordine)
            VALUES (?, ?, ?)
        """, (nome, emoji, ordine))
    print(f"  + {len(seed)} categorie seed piatti_giorno inserite (se mancanti)")

    # ── 5. Config widget default ──
    cur.execute("""
        INSERT OR IGNORE INTO piatti_giorno_config (chiave, valore)
        VALUES ('widget_max_categorie', '4')
    """)
    print("  + config piatti_giorno widget_max_categorie=4 (default)")

    # ─────────────────────────────────────────────────────────
    # B) FORMAGGI: colonna paese
    # ─────────────────────────────────────────────────────────
    try:
        cur.execute("""
            ALTER TABLE formaggi_tagli
            ADD COLUMN paese TEXT
        """)
        print("  + formaggi_tagli.paese aggiunta (NULL ammesso)")
    except Exception as e:
        # Colonna già esistente o tabella mancante (ambiente dev): non fermarsi
        print(f"  ~ formaggi_tagli.paese gia' presente o tabella mancante: {e}")

    try:
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_formaggi_paese
            ON formaggi_tagli(paese)
        """)
        print("  + idx_formaggi_paese creato")
    except Exception as e:
        print(f"  ~ idx_formaggi_paese: {e}")

    print("  mig 107 piatti_giorno + formaggi_paese pronta")
