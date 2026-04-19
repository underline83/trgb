"""
Migrazione 091: crea tabelle modulo "Scelta dei Salumi".

Struttura analoga a macellaio_* (mig 067 + 069) ma con campi extra pensati
per salumi: produttore, stagionatura, origine_animale, territorio, descrizione.

Tabelle:
  - salumi_tagli       → singoli salumi disponibili alla vendita
  - salumi_categorie   → categorie configurabili (Crudi, Cotti, Insaccati, ...)
  - salumi_config      → impostazioni widget (chiave/valore)

Seed categorie iniziali: Crudi, Cotti, Insaccati, Lardo.
"""


def upgrade(conn):
    cur = conn.cursor()

    # ── 1. Tabella tagli salumi ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS salumi_tagli (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            nome                TEXT NOT NULL,
            categoria           TEXT,
            grammatura_g        INTEGER,
            prezzo_euro         REAL,
            produttore          TEXT,
            stagionatura        TEXT,
            origine_animale     TEXT,
            territorio          TEXT,
            descrizione         TEXT,
            note                TEXT,
            venduto             INTEGER NOT NULL DEFAULT 0,
            venduto_at          TEXT,
            created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + salumi_tagli creata")

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_salumi_venduto
        ON salumi_tagli(venduto)
    """)
    print("  + idx_salumi_venduto creato")

    # ── 2. Tabella categorie ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS salumi_categorie (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            emoji       TEXT,
            ordine      INTEGER NOT NULL DEFAULT 999,
            attivo      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + salumi_categorie creata")

    # ── 3. Tabella config ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS salumi_config (
            chiave      TEXT PRIMARY KEY,
            valore      TEXT NOT NULL,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + salumi_config creata")

    # ── 4. Seed categorie iniziali ──
    seed = [
        ("Crudi",      "\U0001F953", 10),   # 🥓
        ("Cotti",      "\U0001F356", 20),   # 🍖
        ("Insaccati",  "\U0001F32D", 30),   # 🌭
        ("Lardo",      "\U0001F9C8", 40),   # 🧈 (butter stand-in)
    ]
    for nome, emoji, ordine in seed:
        cur.execute("""
            INSERT OR IGNORE INTO salumi_categorie (nome, emoji, ordine)
            VALUES (?, ?, ?)
        """, (nome, emoji, ordine))
    print(f"  + {len(seed)} categorie seed salumi inserite (se mancanti)")

    # ── 5. Config widget default ──
    cur.execute("""
        INSERT OR IGNORE INTO salumi_config (chiave, valore)
        VALUES ('widget_max_categorie', '4')
    """)
    print("  + config widget_max_categorie=4 (default)")

    print("  mig 091 scelta_salumi pronta")
