"""
Migrazione 092: crea tabelle modulo "Scelta dei Formaggi".

Struttura analoga a salumi_* (mig 091) ma il campo `origine_animale` e'
sostituito da `latte` (vaccino/caprino/ovino/misto) e il campo `produttore`
descrive il caseificio.

Tabelle:
  - formaggi_tagli       → singoli formaggi disponibili alla vendita
  - formaggi_categorie   → categorie configurabili (Freschi, Stagionati, ...)
  - formaggi_config      → impostazioni widget (chiave/valore)

Seed categorie iniziali: Freschi, Stagionati, Erborinati, Caprini.
"""


def upgrade(conn):
    cur = conn.cursor()

    # ── 1. Tabella formaggi ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS formaggi_tagli (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL,
            categoria       TEXT,
            grammatura_g    INTEGER,
            prezzo_euro     REAL,
            produttore      TEXT,
            stagionatura    TEXT,
            latte           TEXT,
            territorio      TEXT,
            descrizione     TEXT,
            note            TEXT,
            venduto         INTEGER NOT NULL DEFAULT 0,
            venduto_at      TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + formaggi_tagli creata")

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_formaggi_venduto
        ON formaggi_tagli(venduto)
    """)
    print("  + idx_formaggi_venduto creato")

    # ── 2. Tabella categorie ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS formaggi_categorie (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nome        TEXT NOT NULL UNIQUE,
            emoji       TEXT,
            ordine      INTEGER NOT NULL DEFAULT 999,
            attivo      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + formaggi_categorie creata")

    # ── 3. Tabella config ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS formaggi_config (
            chiave      TEXT PRIMARY KEY,
            valore      TEXT NOT NULL,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  + formaggi_config creata")

    # ── 4. Seed categorie iniziali ──
    seed = [
        ("Freschi",     "\U0001F9C0", 10),  # 🧀
        ("Stagionati",  "\U0001F9C0", 20),  # 🧀
        ("Erborinati",  "\U0001F9C0", 30),  # 🧀
        ("Caprini",     "\U0001F410", 40),  # 🐐
    ]
    for nome, emoji, ordine in seed:
        cur.execute("""
            INSERT OR IGNORE INTO formaggi_categorie (nome, emoji, ordine)
            VALUES (?, ?, ?)
        """, (nome, emoji, ordine))
    print(f"  + {len(seed)} categorie seed formaggi inserite (se mancanti)")

    # ── 5. Config widget default ──
    cur.execute("""
        INSERT OR IGNORE INTO formaggi_config (chiave, valore)
        VALUES ('widget_max_categorie', '4')
    """)
    print("  + config widget_max_categorie=4 (default)")

    print("  mig 092 scelta_formaggi pronta")
