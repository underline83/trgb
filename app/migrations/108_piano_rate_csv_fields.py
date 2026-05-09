"""
Migrazione 108 — Estensione cg_piano_rate per import CSV piani rate (G.1.5, sessione 2026-05-08)

Aggiunge 2 campi a `cg_piano_rate` per supportare l'import di piani di
rateizzazione da CSV (Abaco/AdE/PagoPA/F24 rateizzato):

  - data_scadenza_specifica TEXT NULL — Data di scadenza specifica della rata
                                        (formato ISO YYYY-MM-DD). Override del
                                        calcolo standard `{anno}-{mese}-{giorno_scadenza}`.
                                        Necessario perché i piani AdE/PagoPA hanno
                                        date irregolari (es. 02/11/2026 quando il 1°
                                        è domenica). Quando NULL, il proiettore di
                                        cg_uscite usa il calcolo standard da
                                        `cg_spese_fisse.giorno_scadenza`.

  - codice_pagamento TEXT NULL        — Identificativo del pagamento esterno
                                        (RAV/IUV PagoPA/numero atto/codice tributo).
                                        Usato per:
                                        1. Tracciabilità (Marco vede subito di che
                                           rata si tratta nello scadenziario)
                                        2. Duplicate detection in re-import CSV
                                           (se i primi N codici matchano un piano
                                           esistente → 409 Conflict)

Backward-compat totale: tutte le rate esistenti continuano a funzionare
identiche, i 2 campi sono NULL e il proiettore cade sul calcolo standard.

Idempotente: PRAGMA check pre-ALTER.
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    cols = {r[1] for r in cur.execute("PRAGMA table_info(cg_piano_rate)").fetchall()}

    if "data_scadenza_specifica" not in cols:
        cur.execute("ALTER TABLE cg_piano_rate ADD COLUMN data_scadenza_specifica TEXT")
        print("  [108] aggiunta colonna cg_piano_rate.data_scadenza_specifica")
    else:
        print("  [108] colonna data_scadenza_specifica già presente, skip ALTER")

    if "codice_pagamento" not in cols:
        cur.execute("ALTER TABLE cg_piano_rate ADD COLUMN codice_pagamento TEXT")
        print("  [108] aggiunta colonna cg_piano_rate.codice_pagamento")
    else:
        print("  [108] colonna codice_pagamento già presente, skip ALTER")

    # Indice per duplicate detection veloce su re-import CSV
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_piano_rate_codice ON cg_piano_rate(codice_pagamento) "
        "WHERE codice_pagamento IS NOT NULL"
    )
    print("  [108] indice idx_piano_rate_codice pronto")

    conn.commit()
    print("  [108] cg_piano_rate esteso per import CSV piani rate")
