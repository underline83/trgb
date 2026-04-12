"""
Migrazione 065: tabella fe_proforme per gestione pro-forme Acquisti.

Una proforma è un documento pre-fattura che serve SOLO per lo scadenziario.
NON appare nelle statistiche Acquisti, dashboard o KPI.

Quando si crea una proforma:
  - si crea una riga in fe_proforme
  - si crea una riga in cg_uscite con tipo_uscita='PROFORMA'

Quando arriva la fattura vera (FIC/XML), Marco riconcilia manualmente:
  - fe_proforme.stato → RICONCILIATA
  - la riga cg_uscite PROFORMA viene cancellata
  - la fattura vera ha la sua riga cg_uscite dall'import normale

Campi fornitore (nome, piva, cf) allineati a quelli che arrivano da FIC
per massimizzare il matching automatico futuro.
"""


def upgrade(conn):
    cur = conn.cursor()

    # ── Tabella principale ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_proforme (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            fornitore_piva          TEXT,
            fornitore_nome          TEXT NOT NULL,
            fornitore_cf            TEXT,
            importo                 REAL NOT NULL,
            data_scadenza           TEXT NOT NULL,
            data_emissione          TEXT,
            numero_proforma         TEXT,
            note                    TEXT,
            stato                   TEXT NOT NULL DEFAULT 'ATTIVA',
            fattura_id              INTEGER,
            cg_uscita_id            INTEGER,
            data_riconciliazione    TEXT,
            created_at              TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at              TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fattura_id) REFERENCES fe_fatture(id)
        )
    """)
    print("  + fe_proforme creata")

    # ── Indici ──
    indexes = [
        ("idx_fe_proforme_stato", "fe_proforme", "stato"),
        ("idx_fe_proforme_fornitore", "fe_proforme", "fornitore_piva"),
        ("idx_fe_proforme_fattura", "fe_proforme", "fattura_id"),
    ]

    for idx_name, table, col in indexes:
        try:
            cur.execute(
                f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({col})"
            )
            print(f"  + {idx_name}")
        except Exception as e:
            print(f"  skip {idx_name}: {e}")

    print("  mig 065 fe_proforme pronta")
