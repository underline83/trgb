"""
Migrazione 151: tabelle cg_utenze_* — modulo Analisi Utenze (spec docs/spec_utenze.md)

Tre tabelle in foodcost.db:
  - cg_utenze_forniture       → anagrafica punti di fornitura (luce, gas)
  - cg_utenze_bollette        → una riga per bolletta PDF caricata
  - cg_utenze_consumi_mensili → serie storica mensile (alimentata dallo
                                storico 18 mesi presente in ogni bolletta)

Layer di SOLA ANALISI: nessun importo entra nel Conto Economico (la
contabilità delle bollette resta su fe_fatture via FIC/XML → zero doppio
conteggio). Additiva e idempotente, nessun dato toccato.
"""


def upgrade(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cg_utenze_forniture (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo                  TEXT NOT NULL CHECK (tipo IN ('LUCE','GAS')),
            fornitore             TEXT,
            numero_fornitura      TEXT UNIQUE NOT NULL,
            pod_pdr               TEXT,
            indirizzo             TEXT,
            offerta               TEXT,
            codice_offerta        TEXT,
            indice_riferimento    TEXT,
            spread                REAL,
            scadenza_condizioni   DATE,
            potenza_impegnata_kw  REAL,
            attiva                INTEGER NOT NULL DEFAULT 1,
            created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS cg_utenze_bollette (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            fornitura_id          INTEGER NOT NULL REFERENCES cg_utenze_forniture(id) ON DELETE CASCADE,
            numero_bolletta       TEXT UNIQUE NOT NULL,
            data_emissione        DATE,
            periodo_da            DATE,
            periodo_a             DATE,
            scadenza_pagamento    DATE,
            unita                 TEXT,
            consumo_fatturato     REAL,
            consumo_stimato       REAL,
            totale                REAL,
            accise_iva            REAL,
            prezzo_medio          REAL,
            prezzo_energia        REAL,
            prezzo_rete_oneri     REAL,
            quota_fissa_importo   REAL,
            quota_potenza_importo REAL,
            spread                REAL,
            valori_indice         TEXT,
            fe_fattura_id         INTEGER,
            pdf_filename          TEXT,
            pdf_hash              TEXT UNIQUE,
            parsed_json           TEXT,
            warnings              TEXT,
            data_import           DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # fonte_data_emissione: data emissione della bolletta fonte, denormalizzata
    # per la regola di upsert (gli storici 18 mesi di bollette consecutive si
    # sovrappongono → vince la bolletta più recente, senza join)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cg_utenze_consumi_mensili (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            fornitura_id          INTEGER NOT NULL REFERENCES cg_utenze_forniture(id) ON DELETE CASCADE,
            anno_mese             TEXT NOT NULL,
            fascia                TEXT NOT NULL,
            consumo               REAL,
            unita                 TEXT,
            potenza_max_kw        REAL,
            fonte_bolletta_id     INTEGER REFERENCES cg_utenze_bollette(id) ON DELETE SET NULL,
            fonte_data_emissione  DATE,
            UNIQUE (fornitura_id, anno_mese, fascia)
        )
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_cg_utenze_bollette_fornitura
        ON cg_utenze_bollette(fornitura_id, data_emissione)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_cg_utenze_consumi_serie
        ON cg_utenze_consumi_mensili(fornitura_id, anno_mese)
    """)

    conn.commit()
    print("  ✔ tabelle cg_utenze_forniture / cg_utenze_bollette / cg_utenze_consumi_mensili garantite")
