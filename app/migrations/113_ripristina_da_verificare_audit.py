"""
Migrazione 113 — Ripristino DA_VERIFICARE per le fatture audit Marco (G.5 follow-up)

Bug cronologico:
  - Mig 110 (audit Marco) aveva settato `fe_fatture.stato_pagamento='da_verificare'`
    per 138 fatture: 120 CONTROLLARE + 18 RISTO TEAM (review).
  - Mig 110 NON aveva cambiato `cg_uscite.stato` per quelle (lasciato DA_PAGARE/SCADUTA).
  - Mig 112 (G.5 unifica) ha DROPPATO la colonna `fe_fatture.stato_pagamento`.
    L'informazione "da_verificare" è andata persa.
  - La VIEW `fe_fatture_with_stato` ricostruisce stato_pagamento da `cg_uscite.stato`:
    le 138 fatture finiscono in 'da_pagare' invece di 'da_verificare'.

Fix:
  Le note `fe_fatture.note_mig110` sono SOPRAVVISSUTE (mig 112 non le ha droppate).
  Identifichiamo le fatture con marker:
    - '[mig110: in revisione (CONTROLLARE)]'
    - '[mig110: RISTO TEAM da abbinare manualmente a piano rateizzazione]'
  Per ognuna, se ha cg_uscite e lo stato corrente NON è già "pagato"
  (PAGATA / PAGATA_MANUALE) né RATEIZZATA, settiamo `cg_uscite.stato='DA_VERIFICARE'`.

Idempotente:
  - Update solo se stato attuale è in (DA_PAGARE, SCADUTA)
  - Re-run no-op (è già DA_VERIFICARE → niente cambia)
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. CONTROLLARE (120) → DA_VERIFICARE ──
    cur.execute("""
        UPDATE cg_uscite
        SET stato = 'DA_VERIFICARE',
            updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IN (
            SELECT id FROM fe_fatture
            WHERE note_mig110 LIKE '%in revisione (CONTROLLARE)%'
        )
        AND stato IN ('DA_PAGARE', 'SCADUTA')
    """)
    n_controllare = cur.rowcount
    print(f"  [113] CONTROLLARE → DA_VERIFICARE: {n_controllare} righe cg_uscite")

    # ── 2. RISTO TEAM (18) → DA_VERIFICARE ──
    cur.execute("""
        UPDATE cg_uscite
        SET stato = 'DA_VERIFICARE',
            updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IN (
            SELECT id FROM fe_fatture
            WHERE note_mig110 LIKE '%RISTO TEAM da abbinare%'
        )
        AND stato IN ('DA_PAGARE', 'SCADUTA')
    """)
    n_risto = cur.rowcount
    print(f"  [113] RISTO TEAM → DA_VERIFICARE: {n_risto} righe cg_uscite")

    # ── 3. Riepilogo finale ──
    n_dv = cur.execute(
        "SELECT COUNT(*) FROM cg_uscite WHERE stato = 'DA_VERIFICARE'"
    ).fetchone()[0]
    print(f"  [113] DONE — totale cg_uscite in DA_VERIFICARE: {n_dv}")

    conn.commit()
