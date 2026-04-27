"""
Migrazione 104 — Cleanup flag in_pagamento_at "stuck" (Bug D5, 2026-04-27)

Bug: cg_uscite.in_pagamento_at viene settato quando un'uscita entra in un
batch di pagamento (cg_pagamenti_batch). Veniva resettato SOLO alla cancellazione
del batch, non quando l'uscita veniva effettivamente pagata (PAGATA via
riconciliazione bancaria, PAGATA_MANUALE via segna pagata, ecc).

Risultato: uscite GIÀ PAGATE mostravano ancora il badge "🖨 In pagamento"
nello scadenzario, creando confusione UX.

Fix nel codice (commit di questa stessa data): tutti gli UPDATE che mettono
cg_uscite a PAGATA/PAGATA_MANUALE ora resettano in_pagamento_at = NULL e
pagamento_batch_id = NULL.

Questa migrazione fa il cleanup retroattivo: tutte le uscite già pagate
con flag stuck vengono pulite.

Idempotente: se nessuna uscita ha lo stato stuck, no-op.
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # Verifica che le colonne esistano (mig 053 le ha aggiunte)
    cols = {r[1] for r in cur.execute("PRAGMA table_info(cg_uscite)").fetchall()}
    if "in_pagamento_at" not in cols:
        print("  [104] cg_uscite.in_pagamento_at non presente — skip (mig 053 non applicata?)")
        return

    # Cleanup: resetta in_pagamento_at e pagamento_batch_id su uscite gia' pagate
    cur.execute("""
        UPDATE cg_uscite
           SET in_pagamento_at = NULL,
               pagamento_batch_id = NULL,
               updated_at = CURRENT_TIMESTAMP
         WHERE stato IN ('PAGATA', 'PAGATA_MANUALE')
           AND (in_pagamento_at IS NOT NULL OR pagamento_batch_id IS NOT NULL)
    """)
    n = cur.rowcount
    print(f"  [104] cleanup in_pagamento_at stuck: {n} uscite ripulite (gia' pagate)")

    # Eventuale cleanup di batch orfani (nessuna uscita più collegata)
    cur.execute("""
        DELETE FROM cg_pagamenti_batch
         WHERE id NOT IN (
             SELECT DISTINCT pagamento_batch_id
               FROM cg_uscite
              WHERE pagamento_batch_id IS NOT NULL
         )
           AND stato = 'IN_PAGAMENTO'
    """)
    n_batch = cur.rowcount
    if n_batch:
        print(f"  [104] eliminati {n_batch} batch IN_PAGAMENTO senza piu' uscite collegate")

    conn.commit()
