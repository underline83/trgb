"""
Migrazione 111 — Preparazione unificazione stato pagamento (G.5 Step 1)

Parte 1 di 2 della rifattorizzazione G.5 (Livello 3): unificazione completa
dei 3 source of truth sullo stato pagamento delle fatture.

Questa migrazione PREPARA il terreno per il DROP COLUMN della mig 112:

1. Aggiunge colonna `fe_fatture.fic_pagato_raw` (INTEGER NULL)
   - Preserva il flag pagato letto da Fatture in Cloud durante l'import API
   - NON è usato dal workflow generale: solo dal modulo FIC stesso
   - Se valorizzato, il modulo FIC propaga su cg_uscite.stato='PAGATA_MANUALE'
     (gestito in fattureincloud_router post G.5)

2. Crea indice `idx_cg_uscite_fattura_stato` su `cg_uscite(fattura_id, stato)`
   - Performance per la VIEW `fe_fatture_with_stato` (mig 112)
   - Tutte le query che leggono pagato/stato_pagamento ora fanno JOIN
   - L'indice composito copre il workload tipico

3. Crea cg_uscite stub per le ~9 fatture orfane (no proiezione)
   - Solo le fatture non-autofatture senza riga in cg_uscite
   - Stato: PAGATA_MANUALE se f.pagato=1, altrimenti DA_PAGARE
   - Importo, fornitore_nome, totale, data_fattura ereditati
   - data_scadenza fallback su data_fattura

4. Aggiunge il valore `DA_VERIFICARE` come stato valido in cg_uscite.stato
   - Implicito (sqlite non ha enum), ma documentato per il codice
   - Mappato a stato_pagamento='da_verificare' nella VIEW della mig 112

Idempotente: tutti gli step usano IF NOT EXISTS o controllano lo stato pre-update.
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. Colonna fic_pagato_raw ──
    fe_cols = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}
    if "fic_pagato_raw" not in fe_cols:
        cur.execute("ALTER TABLE fe_fatture ADD COLUMN fic_pagato_raw INTEGER")
        print("  [111] aggiunta colonna fe_fatture.fic_pagato_raw")
    else:
        print("  [111] colonna fic_pagato_raw già presente, skip")

    # Backfill iniziale: copia il valore corrente di pagato per le fatture FIC
    # (così non perdiamo l'info quando faremo DROP COLUMN nella mig 112)
    cur.execute("""
        UPDATE fe_fatture
        SET fic_pagato_raw = COALESCE(pagato, 0)
        WHERE fonte = 'fic' AND fic_pagato_raw IS NULL
    """)
    print(f"  [111] backfill fic_pagato_raw: {cur.rowcount} fatture FIC")

    # ── 2. Indice composito su cg_uscite per le query post-VIEW ──
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_cg_uscite_fattura_stato
        ON cg_uscite(fattura_id, stato)
        WHERE fattura_id IS NOT NULL
    """)
    print("  [111] indice idx_cg_uscite_fattura_stato pronto")

    # ── 3. cg_uscite stub per fatture orfane (no proiezione) ──
    # Cerca fatture non-autofatture, non-rateizzate, senza cg_uscite
    orfane = cur.execute("""
        SELECT
            f.id, f.fornitore_nome, f.fornitore_piva, f.numero_fattura,
            f.data_fattura, f.totale_fattura, COALESCE(f.pagato, 0) AS pagato,
            COALESCE(f.stato_pagamento, 'da_pagare') AS sp,
            f.data_scadenza
        FROM fe_fatture f
        WHERE COALESCE(f.is_autofattura, 0) = 0
          AND f.rateizzata_in_spesa_fissa_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM cg_uscite u WHERE u.fattura_id = f.id)
    """).fetchall()

    n_stub = 0
    for r in orfane:
        # Stato di partenza: derivato dalle colonne attuali
        if r[6] == 1 or r[7] in ("pagato", "pagato_manuale"):
            stato = "PAGATA_MANUALE"
            importo_pagato = r[5] or 0
        elif r[7] == "da_verificare":
            stato = "DA_VERIFICARE"
            importo_pagato = 0
        else:
            stato = "DA_PAGARE"
            importo_pagato = 0

        # data_scadenza: fallback su data_fattura se manca
        data_scadenza = r[8] or r[4]

        cur.execute("""
            INSERT INTO cg_uscite (
                fattura_id, fornitore_nome, fornitore_piva, numero_fattura,
                data_fattura, totale, data_scadenza,
                importo_pagato, stato, note,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, (
            r[0], r[1], r[2], r[3], r[4], r[5], data_scadenza,
            importo_pagato, stato,
            "[mig111: stub creato per fattura orfana — pre-DROP COLUMN G.5]"
        ))
        n_stub += 1

    print(f"  [111] cg_uscite stub: {n_stub} righe create per fatture orfane")

    conn.commit()
    print("  [111] DONE — terreno pronto per mig 112 (DROP COLUMN + VIEW)")
