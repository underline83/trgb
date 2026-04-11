"""
Migrazione 062: Tabella fic_sync_warnings — traccia record FIC anomali

Contesto (problemi.md A1 — follow-up):
La migrazione 061 aveva introdotto un filtro "a monte" nel sync FIC che
skippa silenziosamente i record senza numero documento e senza P.IVA del
fornitore (prima nota mascherata da fattura, tipicamente affitti Cattaneo
e Bana). Il contatore `skipped_non_fattura` veniva loggato solo nella note
finale di sync.

Marco ha chiesto di rendere questi record persistenti in una tabella
dedicata, così se un domani FIC cambia formato (es. inizia a inviare
fatture vere senza P.IVA per qualche nuovo tipo di documento) lui se ne
accorge dal pannello invece di perderli. La tabella è estendibile a
futuri pattern di anomalia (es. fatture con importo sospetto, P.IVA
cambiata, ecc.) grazie alla colonna `tipo`.

Schema:
- id                  PK
- sync_at             timestamp del sync che ha rilevato il warning
- tipo                "non_fattura" per ora, estendibile
- fornitore_nome      name dell'entity FIC
- fornitore_piva      vuoto per "non_fattura", utile per altri tipi
- numero_documento    vuoto per "non_fattura"
- data_documento      YYYY-MM-DD
- importo             amount_gross da FIC
- fic_document_id     id originale FIC (per dedup)
- raw_payload_json    dump completo del documento FIC (debug retroattivo)
- visto               0/1 — Marco l'ha già valutato/archiviato?
- visto_at            timestamp archiviazione
- note                nota manuale opzionale

Indici:
- (tipo, visto) — per il badge "N non visti" + filtro tab
- fornitore_nome — per raggruppare nel pannello

La tabella sta in foodcost.db (stessa di fe_fatture) per permettere
JOIN in reportistica futura senza due connessioni.
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS fic_sync_warnings (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_at           TEXT NOT NULL,
            tipo              TEXT NOT NULL,
            fornitore_nome    TEXT,
            fornitore_piva    TEXT,
            numero_documento  TEXT,
            data_documento    TEXT,
            importo           REAL,
            fic_document_id   INTEGER,
            raw_payload_json  TEXT,
            visto             INTEGER DEFAULT 0,
            visto_at          TEXT,
            note              TEXT
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_fic_warnings_tipo_visto
        ON fic_sync_warnings(tipo, visto)
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_fic_warnings_fornitore
        ON fic_sync_warnings(fornitore_nome)
    """)

    # Indice unico su (tipo, fic_document_id) per prevenire duplicati da sync
    # ripetuti: se lo stesso doc FIC viene rivisto da due sync consecutivi,
    # il warning esistente viene riusato (vedi INSERT OR IGNORE nel router).
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_fic_warnings_tipo_doc
        ON fic_sync_warnings(tipo, fic_document_id)
    """)

    conn.commit()
    print("  Migrazione 062: creata tabella fic_sync_warnings + 3 indici")
    return 1
