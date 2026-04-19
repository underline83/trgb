"""
Migrazione 094: crea tabelle modulo "Scelta del Pescato".

Struttura analoga a macellaio_* (mig 067 + 069): la cucina gestisce il
pescato disponibile (categoria, grammatura, prezzo), la sala segna il
pezzo come venduto. In piu' rispetto al macellaio, per il pescato ci
interessa la `zona_fao` (provenienza/zona di pesca).

Tabelle:
  - pescato_tagli       → singoli pezzi di pescato in carta
  - pescato_categorie   → categorie configurabili (Crudo, Cotto, ...)
  - pescato_config      → impostazioni widget (chiave/valore)

Seed categorie iniziali: Crudo, Cotto, Crostacei, Molluschi.
"""


def upgrade(conn):
    cur = conn.cursor()

    # ── 1. Tabella pescato ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pescato_tagli (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL,
            categoria       TEXT,
            grammatura_g    INTEGER,
            prezzo_euro     REAL,
            zona_fao        TEXT,
            note            TEXT,
            venduto         INTEGER NOT NULL DEFAULT 0,
            venduto_at      TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + pescato_tagli creata")

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_pescato_venduto
        ON pescato_tagli(venduto)
    """)
    print("  + idx_pescato_venduto creato")

    # ── 2. Tabella categorie ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pescato_categorie (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            emoji       TEXT,
            ordine      INTEGER NOT NULL DEFAULT 999,
            attivo      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + pescato_categorie creata")

    # ── 3. Tabella config ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pescato_config (
            chiave      TEXT PRIMARY KEY,
            valore      TEXT NOT NULL,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + pescato_config creata")

    # ── 4. Seed categorie iniziali ──
    seed = [
        ("Crudo",      "\U0001F363", 10),   # 🍣
        ("Cotto",      "\U0001F41F", 20),   # 🐟
        ("Crostacei",  "\U0001F990", 30),   # 🦐
        ("Molluschi",  "\U0001F991", 40),   # 🦑
    ]
    for nome, emoji, ordine in seed:
        cur.execute("""
            INSERT OR IGNORE INTO pescato_categorie (nome, emoji, ordine)
            VALUES (?, ?, ?)
        """, (nome, emoji, ordine))
    print(f"  + {len(seed)} categorie seed pescato inserite (se mancanti)")

    # ── 5. Config widget default ──
    cur.execute("""
        INSERT OR IGNORE INTO pescato_config (chiave, valore)
        VALUES ('widget_max_categorie', '4')
    """)
    print("  + config widget_max_categorie=4 (default)")

    print("  mig 094 scelta_pescato pronta")
