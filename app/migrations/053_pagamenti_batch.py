"""
Migrazione 053: Batch pagamenti per stampa uscite + futura dashboard contabile

Introduce il concetto di "batch di pagamento":
- Ogni volta che Marco stampa un elenco di uscite per girarle alla sorella
  (o in futuro al contabile), le raggruppiamo in un record cg_pagamenti_batch.
- Le cg_uscite puntano al batch (pagamento_batch_id) e hanno un flag denormalizzato
  in_pagamento_at per filtri rapidi.

Stati batch:
- IN_PAGAMENTO     → appena stampato, in lavorazione
- INVIATO_CONTABILE→ girato al commercialista (futuro: dashboard contabile)
- CHIUSO           → tutte le uscite del batch sono state pagate

Questa struttura prepara il terreno per la dashboard contabile futura:
basterà una pagina che elenca i batch filtrati per stato INVIATO_CONTABILE
con dettaglio uscite ed export PDF/Excel.
"""


def upgrade(conn):
    cur = conn.cursor()

    # Tabella batch
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cg_pagamenti_batch (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            titolo               TEXT NOT NULL,
            note                 TEXT,
            n_uscite             INTEGER NOT NULL DEFAULT 0,
            totale               REAL NOT NULL DEFAULT 0,
            stato                TEXT NOT NULL DEFAULT 'IN_PAGAMENTO',
            created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by           INTEGER,
            inviato_contabile_at TIMESTAMP,
            chiuso_at            TIMESTAMP,
            CHECK (stato IN ('IN_PAGAMENTO', 'INVIATO_CONTABILE', 'CHIUSO'))
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_batch_stato
        ON cg_pagamenti_batch(stato, created_at DESC)
    """)

    # Colonne su cg_uscite — check prima per sicurezza
    cols = {row[1] for row in cur.execute("PRAGMA table_info(cg_uscite)").fetchall()}

    if "pagamento_batch_id" not in cols:
        try:
            cur.execute("ALTER TABLE cg_uscite ADD COLUMN pagamento_batch_id INTEGER")
            print("  + cg_uscite.pagamento_batch_id")
        except Exception as e:
            print(f"  skip pagamento_batch_id: {e}")

    if "in_pagamento_at" not in cols:
        try:
            cur.execute("ALTER TABLE cg_uscite ADD COLUMN in_pagamento_at TIMESTAMP")
            print("  + cg_uscite.in_pagamento_at")
        except Exception as e:
            print(f"  skip in_pagamento_at: {e}")

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_uscite_batch
        ON cg_uscite(pagamento_batch_id)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_uscite_in_pagamento
        ON cg_uscite(in_pagamento_at)
    """)

    print("  cg_pagamenti_batch pronto")
