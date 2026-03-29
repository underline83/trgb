"""
Migrazione 032: tabelle per il modulo Controllo Gestione.

cg_uscite — Uscite importate dalle fatture acquisti.
  Ogni fattura non pagata in fe_fatture genera una riga qui.
  Lo stato (DA_PAGARE / SCADUTA / PAGATA / PARZIALE) è gestito dal nostro
  sistema di matching con la banca, NON da Fatture in Cloud.

cg_spese_fisse — Spese ricorrenti senza fattura:
  affitti, tasse, stipendi, prestiti, rateizzazioni.
  Gestite interamente dentro Controllo Gestione.

cg_uscite_log — Log di ogni import per tracciabilità.
"""


def upgrade(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cg_uscite (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            fattura_id          INTEGER,
            fornitore_nome      TEXT NOT NULL,
            fornitore_piva      TEXT,
            numero_fattura      TEXT,
            data_fattura        TEXT,
            totale              REAL NOT NULL DEFAULT 0,
            data_scadenza       TEXT,
            importo_pagato      REAL NOT NULL DEFAULT 0,
            data_pagamento      TEXT,
            stato               TEXT NOT NULL DEFAULT 'DA_PAGARE',
            banca_movimento_id  INTEGER,
            note                TEXT,
            created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fattura_id) REFERENCES fe_fatture(id)
        )
    """)

    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cg_uscite_fattura
        ON cg_uscite(fattura_id)
        WHERE fattura_id IS NOT NULL
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_cg_uscite_stato
        ON cg_uscite(stato)
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_cg_uscite_scadenza
        ON cg_uscite(data_scadenza)
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS cg_spese_fisse (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo            TEXT NOT NULL,
            titolo          TEXT NOT NULL,
            descrizione     TEXT,
            importo         REAL NOT NULL DEFAULT 0,
            frequenza       TEXT NOT NULL DEFAULT 'MENSILE',
            giorno_scadenza INTEGER,
            data_inizio     TEXT,
            data_fine       TEXT,
            attiva          INTEGER NOT NULL DEFAULT 1,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # tipo: AFFITTO, TASSA, STIPENDIO, PRESTITO, RATEIZZAZIONE, ALTRO
    # frequenza: MENSILE, BIMESTRALE, TRIMESTRALE, SEMESTRALE, ANNUALE, UNA_TANTUM

    conn.execute("""
        CREATE TABLE IF NOT EXISTS cg_uscite_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo            TEXT NOT NULL,
            fatture_importate   INTEGER DEFAULT 0,
            fatture_aggiornate  INTEGER DEFAULT 0,
            fatture_saltate     INTEGER DEFAULT 0,
            note            TEXT,
            created_at      TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
