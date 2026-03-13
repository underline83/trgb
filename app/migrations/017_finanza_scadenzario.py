"""
Migrazione 017 — Scadenzario Finanziario
Gestione rateizzazioni, mutui, prestiti, affitti e spese fisse.

Due tabelle:
  - finanza_scadenze: il "contratto" (mutuo, rateizzazione, affitto...)
  - finanza_rate: le singole scadenze/rate di ogni contratto
"""

MIGRATION_ID = 17


def upgrade(conn):
    cur = conn.cursor()

    # ── Scadenze (contratti / impegni finanziari) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS finanza_scadenze (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            /* Tipo: RATEIZZAZIONE_FATTURA, RATEIZZAZIONE_ENTE, MUTUO, PRESTITO, AFFITTO, SPESA_FISSA */
            tipo TEXT NOT NULL,

            /* Descrizione */
            titolo TEXT NOT NULL,
            descrizione TEXT DEFAULT '',
            ente TEXT DEFAULT '',          /* Banca, Agenzia Entrate, proprietario, fornitore */

            /* Importi */
            importo_totale REAL DEFAULT 0,      /* Totale del debito/contratto */
            importo_rata REAL DEFAULT 0,         /* Importo singola rata (se fisso) */
            num_rate INTEGER DEFAULT 0,          /* Numero totale rate */

            /* Date */
            data_inizio DATE,
            data_fine DATE,
            giorno_scadenza INTEGER DEFAULT 0,   /* Giorno del mese (1-31) per rate mensili */

            /* Frequenza: MENSILE, BIMESTRALE, TRIMESTRALE, SEMESTRALE, ANNUALE, UNA_TANTUM */
            frequenza TEXT DEFAULT 'MENSILE',

            /* Collegamento fattura (per rateizzazioni fattura) */
            fattura_id INTEGER,                  /* FK a fe_fatture */
            fattura_numero TEXT DEFAULT '',
            fattura_fornitore TEXT DEFAULT '',

            /* Categorizzazione (per auto-match con movimenti) */
            cat1 TEXT DEFAULT '',
            cat2 TEXT DEFAULT '',
            cat1_fin TEXT DEFAULT '',
            cat2_fin TEXT DEFAULT '',
            tipo_analitico TEXT DEFAULT '',
            tipo_finanziario TEXT DEFAULT '',
            descrizione_finanziaria TEXT DEFAULT '',
            cat_debito TEXT DEFAULT '',

            /* Pattern match per riconciliazione automatica con movimenti banca */
            match_pattern TEXT DEFAULT '',

            /* Stato: ATTIVO, COMPLETATO, SOSPESO */
            stato TEXT DEFAULT 'ATTIVO',

            note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Rate / Scadenze individuali ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS finanza_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            scadenza_id INTEGER NOT NULL,

            numero_rata INTEGER DEFAULT 0,
            data_scadenza DATE NOT NULL,

            /* Importi */
            importo REAL NOT NULL DEFAULT 0,
            importo_capitale REAL DEFAULT 0,     /* Per mutui: quota capitale */
            importo_interessi REAL DEFAULT 0,    /* Per mutui: quota interessi */

            /* Pagamento */
            importo_pagato REAL DEFAULT 0,
            data_pagamento DATE,

            /* Stato: DA_PAGARE, PAGATA, SCADUTA, PARZIALE */
            stato TEXT DEFAULT 'DA_PAGARE',

            /* Link a movimento finanza (quando matchato) */
            movimento_id INTEGER,

            note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (scadenza_id) REFERENCES finanza_scadenze(id) ON DELETE CASCADE,
            FOREIGN KEY (movimento_id) REFERENCES finanza_movimenti(id)
        )
    """)

    # Indici
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scad_tipo ON finanza_scadenze(tipo)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scad_stato ON finanza_scadenze(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rate_scadenza ON finanza_rate(scadenza_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rate_data ON finanza_rate(data_scadenza)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rate_stato ON finanza_rate(stato)")

    conn.commit()
    return True
