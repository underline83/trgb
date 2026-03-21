# @version: v1.0-fattureincloud
"""
Migrazione 023 — Tabelle per integrazione Fatture in Cloud API v2.

Tabelle:
  fic_config        — credenziali e company_id (1 riga)
  fic_fatture        — fatture ricevute (passive) sincronizzate
  fic_sync_log       — log delle sincronizzazioni
"""


def upgrade(conn):
    cur = conn.cursor()

    # ── Config (1 sola riga) ──────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fic_config (
            id          INTEGER PRIMARY KEY CHECK (id = 1),
            access_token TEXT NOT NULL,
            company_id   INTEGER,
            company_name TEXT,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Fatture ricevute (passive) ────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fic_fatture (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            fic_id          INTEGER UNIQUE NOT NULL,
            tipo            TEXT DEFAULT 'fattura',
            numero          TEXT,
            data            TEXT,
            data_scadenza   TEXT,
            importo_netto   REAL DEFAULT 0,
            importo_iva     REAL DEFAULT 0,
            importo_totale  REAL DEFAULT 0,
            valuta          TEXT DEFAULT 'EUR',
            fornitore_id    INTEGER,
            fornitore_nome  TEXT,
            fornitore_piva  TEXT,
            descrizione     TEXT,
            pagato          INTEGER DEFAULT 0,
            categoria       TEXT,
            raw_json        TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_fic_fatture_data
            ON fic_fatture(data)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_fic_fatture_fornitore
            ON fic_fatture(fornitore_nome)
    """)

    # ── Log sincronizzazioni ──────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fic_sync_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP,
            nuove       INTEGER DEFAULT 0,
            aggiornate  INTEGER DEFAULT 0,
            errori      INTEGER DEFAULT 0,
            note        TEXT
        )
    """)

    conn.commit()
