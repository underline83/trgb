"""
Migrazione 056: fe_fatture campi pagamento separati

Parte della release CG v2.0 "Controllo Gestione come aggregatore".

Aggiunge a `fe_fatture` quattro colonne nuove che implementano la
separazione analitico/finanziario richiesta da Marco:

  1) data_prevista_pagamento TEXT
     Quando Marco PREVEDE di pagare la fattura. Puo' differire dalla
     data_scadenza originale (che resta intoccabile come dato SDI).
     Nasce NULL; si valorizza quando l'utente modifica la "scadenza" dallo
     Scadenzario o dal dettaglio fattura, oppure quando la fattura entra
     in un batch di pagamento.

  2) data_effettiva_pagamento TEXT
     Quando la fattura e' stata REALMENTE pagata (data movimento bancario
     o data del click "Segna pagata"). Nasce NULL; si valorizza con
     l'azione "Segna pagata" o con la riconciliazione banca.

  3) iban_beneficiario TEXT
     IBAN specifico per questa fattura, che puo' differire dall'IBAN
     default del fornitore (suppliers.iban aggiunto in mig 054). Fallback
     chain in stampa batch: fe_fatture.iban_beneficiario → suppliers.iban
     → stringa vuota.

  4) modalita_pagamento_override TEXT
     Override manuale della modalita' di pagamento estratta dall'XML. La
     query usa COALESCE(modalita_pagamento_override, modalita_pagamento,
     suppliers.modalita_pagamento_default).

ARCHITETTURA F4 (insight di Marco):

Il dominio dati si divide in "analitico" (cosa e' successo contabilmente)
e "finanziario" (cosa e' successo di cassa). I tre campi data implementano
esattamente questa separazione:

  data_scadenza              → Analitico (SDI), dato contrattuale
  data_prevista_pagamento    → Finanziario, pianificazione
  data_effettiva_pagamento   → Finanziario, movimento reale

Nessuno dei tre sovrascrive gli altri: si leggono in cascata tramite
COALESCE nella query dello Scadenzario.

INDICI:

Parziali su data_prevista_pagamento e data_effettiva_pagamento, perche'
la maggioranza delle fatture ha entrambi NULL (caso "fattura appena
arrivata, ancora da processare"). Gli indici parziali escludono le NULL
e restano piccoli/efficienti.

Aggiunge anche due indici su cg_uscite che servono per la nuova query
JOIN della Fase B (se non gia' presenti da migrazioni precedenti):

  - idx_uscite_fattura: accelera JOIN fe_fatture → cg_uscite
  - idx_uscite_spesa_periodo: accelera JOIN cg_piano_rate → cg_uscite

Tutte le colonne sono NULL-safe. Il codice v1.7.1 le ignora senza errori.
Rollback-safe: un revert del codice lascia il DB leggibile.
"""


def upgrade(conn):
    cur = conn.cursor()

    cols = {row[1] for row in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}

    new_cols = [
        ("data_prevista_pagamento", "TEXT"),
        ("data_effettiva_pagamento", "TEXT"),
        ("iban_beneficiario", "TEXT"),
        ("modalita_pagamento_override", "TEXT"),
    ]

    for name, col_type in new_cols:
        if name not in cols:
            try:
                cur.execute(f"ALTER TABLE fe_fatture ADD COLUMN {name} {col_type}")
                print(f"  + fe_fatture.{name}")
            except Exception as e:
                print(f"  skip fe_fatture.{name}: {e}")
        else:
            print(f"  fe_fatture.{name} gia' presente")

    # Indici parziali sui campi data
    partial_indexes = [
        (
            "idx_fatture_data_prevista",
            "fe_fatture",
            "data_prevista_pagamento",
            "data_prevista_pagamento IS NOT NULL",
        ),
        (
            "idx_fatture_data_effettiva",
            "fe_fatture",
            "data_effettiva_pagamento",
            "data_effettiva_pagamento IS NOT NULL",
        ),
    ]

    for idx_name, table, col, where in partial_indexes:
        try:
            cur.execute(
                f"CREATE INDEX IF NOT EXISTS {idx_name} "
                f"ON {table}({col}) WHERE {where}"
            )
            print(f"  + {idx_name} (parziale)")
        except Exception as e:
            print(f"  skip {idx_name}: {e}")

    # Indici di supporto per query JOIN fase B
    support_indexes = [
        ("idx_uscite_fattura", "cg_uscite", "fattura_id"),
        (
            "idx_uscite_spesa_periodo",
            "cg_uscite",
            "spesa_fissa_id, periodo_riferimento",
        ),
    ]

    for idx_name, table, col_expr in support_indexes:
        try:
            cur.execute(
                f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({col_expr})"
            )
            print(f"  + {idx_name}")
        except Exception as e:
            print(f"  skip {idx_name}: {e}")

    print("  mig 056 fe_fatture campi pagamento pronta")
