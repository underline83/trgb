"""
Migrazione 015 — Modulo Finanza
Tabelle per gestione finanziaria completa:
  - finanza_movimenti: ogni riga = evento finanziario con doppia classificazione
  - finanza_categorie: catalogo Cat.1 / Cat.2
  - finanza_descrizioni_fin: catalogo descrizioni finanziarie (USCITE CORRENTI, PRESTITO BPM, ecc.)
  - finanza_import_log: storico importazioni Excel
"""

MIGRATION_ID = 15


def upgrade(conn):
    cur = conn.cursor()

    # ── Movimenti finanziari (cuore del modulo) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS finanza_movimenti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            /* Dati base */
            data DATE NOT NULL,
            descrizione TEXT NOT NULL,
            descrizione_estesa TEXT DEFAULT '',
            dare REAL DEFAULT 0,
            avere REAL DEFAULT 0,
            note TEXT DEFAULT '',

            /* Stato riconciliazione: X = banca, C = contanti/carta, '' = da riconciliare */
            stato TEXT DEFAULT '',

            /* Classificazione debito */
            cat_debito TEXT DEFAULT '',

            /* ─── Vista ANALITICA (competenza) ─── */
            tipo_analitico TEXT DEFAULT '',
            anno_analitico INTEGER,
            mese_analitico TEXT DEFAULT '',
            cat1 TEXT DEFAULT '',
            cat2 TEXT DEFAULT '',

            /* ─── Vista FINANZIARIA (cassa) ─── */
            tipo_finanziario TEXT DEFAULT '',
            anno_finanziario INTEGER,
            mese_finanziario TEXT DEFAULT '',
            descrizione_finanziaria TEXT DEFAULT '',
            cat1_fin TEXT DEFAULT '',
            cat2_fin TEXT DEFAULT '',

            /* Link a movimento bancario (per riconciliazione) */
            banca_movimento_id INTEGER,

            /* Metadata */
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (banca_movimento_id) REFERENCES banca_movimenti(id)
        )
    """)

    # Indici per query frequenti
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_data ON finanza_movimenti(data)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_stato ON finanza_movimenti(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_cat1 ON finanza_movimenti(cat1)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_tipo_an ON finanza_movimenti(tipo_analitico)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_tipo_fin ON finanza_movimenti(tipo_finanziario)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_anno_an ON finanza_movimenti(anno_analitico)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_anno_fin ON finanza_movimenti(anno_finanziario)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_mov_banca ON finanza_movimenti(banca_movimento_id)")

    # ── Storico import ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS finanza_import_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            righe_importate INTEGER DEFAULT 0,
            righe_aggiornate INTEGER DEFAULT 0,
            righe_scartate INTEGER DEFAULT 0,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    return True
