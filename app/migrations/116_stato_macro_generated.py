"""
Migrazione 116 — Stato macro/sotto (G.8, 2026-05-11)

OBIETTIVO:
  Introdurre un livello macro (CHIUSO/APERTO) sopra il sotto-stato esistente
  per evitare bug di omissione in liste IN hardcoded. Esempio storico:
  l'endpoint /uscite/import proteggeva solo (PAGATO, PAGATO_MANUALE, PARZIALE),
  e quando si aggiungono nuovi sotto-stati (VERIFICARE, SPOSTATO, RATEIZZATO
  introdotti da G.6/G.7) ogni check IN va aggiornato manualmente. Inevitabile
  che qualcuno venga dimenticato → distruzione dati.

DESIGN:
  cg_uscite.stato_macro è una colonna GENERATED ALWAYS AS (CASE...) VIRTUAL.
  Si autocalcola da `stato` ad ogni read. Invariante DB-level: impossibile
  finire in stato incoerente, non serve trigger né sync manuale lato Python.

MAPPATURA:
  CHIUSO  ← (PAGATO, PAGATO_MANUALE)
  APERTO  ← (PROGRAMMATO, SCADUTO, VERIFICARE, SPOSTATO, RATEIZZATO, PARZIALE)
            + qualunque altro stato non-CHIUSO (default difensivo)

NB: PARZIALE è APERTO perché la parte residua è ancora da pagare.

VIEW aggiornata:
  fe_fatture_with_stato espone anche `cg_uscite_stato_macro` per il frontend.

Idempotente:
  - PRAGMA table_info check prima di ADD COLUMN
  - DROP+CREATE VIEW IF NOT EXISTS

Richiede SQLite >= 3.31 (GENERATED ALWAYS). Verificato 3.37.2 in prod.
"""
import sqlite3


VIEW_SQL = """
CREATE VIEW fe_fatture_with_stato AS
SELECT
    f.*,
    CASE u.stato
        WHEN 'PAGATO'         THEN 1
        WHEN 'PAGATO_MANUALE' THEN 1
        ELSE 0
    END AS pagato,
    CASE u.stato
        WHEN 'PAGATO'         THEN 'pagato'
        WHEN 'PAGATO_MANUALE' THEN 'pagato_manuale'
        WHEN 'VERIFICARE'     THEN 'da_verificare'
        WHEN 'PARZIALE'       THEN 'da_verificare'
        ELSE 'da_pagare'
    END AS stato_pagamento,
    u.stato AS cg_uscite_stato,
    -- G.8: livello macro per check robusti
    CASE WHEN u.stato IN ('PAGATO', 'PAGATO_MANUALE') THEN 'CHIUSO' ELSE 'APERTO' END
        AS cg_uscite_stato_macro
FROM fe_fatture f
LEFT JOIN cg_uscite u ON u.fattura_id = f.id
"""


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. ADD COLUMN cg_uscite.stato_macro (GENERATED VIRTUAL) ──
    cg_cols = {r[1] for r in cur.execute("PRAGMA table_info(cg_uscite)").fetchall()}
    if "stato_macro" not in cg_cols:
        cur.execute("""
            ALTER TABLE cg_uscite ADD COLUMN stato_macro TEXT
            GENERATED ALWAYS AS (
                CASE
                    WHEN stato IN ('PAGATO', 'PAGATO_MANUALE') THEN 'CHIUSO'
                    ELSE 'APERTO'
                END
            ) VIRTUAL
        """)
        print("  [116] aggiunta cg_uscite.stato_macro (GENERATED VIRTUAL)")
    else:
        print("  [116] colonna stato_macro già presente, skip")

    # ── 2. Drop & recreate VIEW per esporre stato_macro al frontend ──
    cur.execute("DROP VIEW IF EXISTS fe_fatture_with_stato")
    cur.execute(VIEW_SQL)
    print("  [116] VIEW fe_fatture_with_stato ricreata (con cg_uscite_stato_macro)")

    # ── 3. Stats finali ──
    rows = cur.execute("""
        SELECT stato_macro, COUNT(*) AS n
        FROM cg_uscite
        WHERE stato IS NOT NULL
        GROUP BY stato_macro ORDER BY n DESC
    """).fetchall()
    print(f"  [116] distribuzione stato_macro:")
    for r in rows:
        print(f"       {r[0]:10s} {r[1]}")

    conn.commit()
    print("  [116] DONE — stato_macro disponibile e auto-sincronizzata")
