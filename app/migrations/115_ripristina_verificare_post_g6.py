"""
Migrazione 115 — Ri-ripristino VERIFICARE per 138 fatture audit Marco (2026-05-11)

Bug:
  - Mig 113 (10/05 18:00) aveva settato `cg_uscite.stato='DA_VERIFICARE'` per
    138 fatture audit (120 CONTROLLARE + 18 RISTO TEAM).
  - Mig 114 (10/05 21:26) ha rinominato DA_VERIFICARE → VERIFICARE.
  - Dopo G.6, un re-import via `/uscite/import` (sync FIC o manuale) ha
    travolto le 138 VERIFICARE perché il branch di protezione riga 534
    proteggeva solo (PAGATO, PAGATO_MANUALE, PARZIALE). Le 138 sono state
    ricalcolate a PROGRAMMATO (108) / SCADUTO (30) in base alla data.
  - Bug fix backend applicato in pari sessione: ora STATI_INTOCCABILI include
    VERIFICARE, SPOSTATO, RATEIZZATO. Questa mig ripara il danno passato.

Fix:
  Stessa logica di mig 113 ma coi nomi post-G.6:
    - Identifica fatture con marker `note_mig110` (CONTROLLARE o RISTO TEAM)
    - Se cg_uscite.stato è in (PROGRAMMATO, SCADUTO) → setta VERIFICARE
  Stati già diversi (PAGATO, PAGATO_MANUALE, PARZIALE) non vengono toccati:
  è ragionevole che Marco abbia già riconciliato alcune di quelle nel
  frattempo (es. via cross-ref banca) e quel pagamento va preservato.

Idempotente: re-run no-op (i record già VERIFICARE non vengono ri-toccati).
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. CONTROLLARE (max 120) → VERIFICARE ──
    cur.execute("""
        UPDATE cg_uscite
        SET stato = 'VERIFICARE',
            updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IN (
            SELECT id FROM fe_fatture
            WHERE note_mig110 LIKE '%in revisione (CONTROLLARE)%'
        )
        AND stato IN ('PROGRAMMATO', 'SCADUTO')
    """)
    n_controllare = cur.rowcount
    print(f"  [115] CONTROLLARE → VERIFICARE: {n_controllare} righe cg_uscite")

    # ── 2. RISTO TEAM (max 18) → VERIFICARE ──
    cur.execute("""
        UPDATE cg_uscite
        SET stato = 'VERIFICARE',
            updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IN (
            SELECT id FROM fe_fatture
            WHERE note_mig110 LIKE '%RISTO TEAM da abbinare%'
        )
        AND stato IN ('PROGRAMMATO', 'SCADUTO')
    """)
    n_risto = cur.rowcount
    print(f"  [115] RISTO TEAM → VERIFICARE: {n_risto} righe cg_uscite")

    # ── 3. Riepilogo finale ──
    n_v = cur.execute(
        "SELECT COUNT(*) FROM cg_uscite WHERE stato = 'VERIFICARE'"
    ).fetchone()[0]
    print(f"  [115] DONE — totale cg_uscite in VERIFICARE: {n_v}")

    conn.commit()
