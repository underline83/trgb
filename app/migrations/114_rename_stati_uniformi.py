"""
Migrazione 114 — Rename stati cg_uscite + uniformazione maschile (G.6, 2026-05-10)

OBIETTIVO:
  Uniformare i nomi degli stati di pagamento al maschile, allineare DB ↔ Label UI,
  introdurre il nuovo stato SPOSTATO per fatture con scadenza riprogrammata
  (data spostata singola, distinta da RATEIZZATO che è un piano multi-rata).

MAPPATURA STATI (vecchio → nuovo):
  DA_PAGARE       → PROGRAMMATO   (data futura)
  SCADUTA         → SCADUTO       (data passata, da gestire)
  DA_VERIFICARE   → VERIFICARE    (purgatorio: dubbi sul pagamento)
  RATEIZZATA      → RATEIZZATO    (piano rate aperto)
  PAGATA          → PAGATO        (riconciliato banca)
  PAGATA_MANUALE  → PAGATO_MANUALE (utente ha dichiarato)
  PARZIALE        → PARZIALE      (invariato, è aggettivo neutro)
  (nuovo)         → SPOSTATO      (data rinegoziata: nuova singola data)

NUOVO CAMPO:
  cg_uscite.data_scadenza_originale (TEXT NULL)
  → salvata la prima volta che l'utente sposta la scadenza programmata.
  → consente di mostrare "Scadenza iniziale" vs "Scadenza programmata" nell'UI.

VIEW aggiornata:
  fe_fatture_with_stato — drop e ricreata con nuova mappatura
  (PROGRAMMATO+SCADUTO+RATEIZZATO+SPOSTATO → stato_pagamento='da_pagare', pagato=0)
  (VERIFICARE+PARZIALE → stato_pagamento='da_verificare', pagato=0)
  (PAGATO_MANUALE → stato_pagamento='pagato_manuale', pagato=1)
  (PAGATO → stato_pagamento='pagato', pagato=1)

NB:
  Tutti i caller (backend + frontend) vengono aggiornati nella stessa sessione
  per usare i nuovi nomi. Migrazioni storiche (032, 047, 052, 060, 063, 110, 113)
  che fanno UPDATE con i vecchi valori NON vengono toccate (sono one-shot già
  girate): rimangono come testimonianza storica.

Idempotente:
  - UPDATE rinominano solo se trovano i vecchi nomi
  - ADD COLUMN check con PRAGMA
  - DROP+CREATE VIEW IF NOT EXISTS
"""
import sqlite3


# Mappatura rename
RENAME_MAP = [
    ("DA_PAGARE",      "PROGRAMMATO"),
    ("SCADUTA",        "SCADUTO"),
    ("DA_VERIFICARE",  "VERIFICARE"),
    ("RATEIZZATA",     "RATEIZZATO"),
    ("PAGATA",         "PAGATO"),
    ("PAGATA_MANUALE", "PAGATO_MANUALE"),
]


VIEW_SQL = """
CREATE VIEW fe_fatture_with_stato AS
SELECT
    f.*,
    -- Boolean pagato (1 se cg_uscite.stato è uno dei 2 "pagato")
    CASE u.stato
        WHEN 'PAGATO'         THEN 1
        WHEN 'PAGATO_MANUALE' THEN 1
        ELSE 0
    END AS pagato,
    -- stato_pagamento legacy a 4 valori (per retrocompat frontend)
    CASE u.stato
        WHEN 'PAGATO'         THEN 'pagato'
        WHEN 'PAGATO_MANUALE' THEN 'pagato_manuale'
        WHEN 'VERIFICARE'     THEN 'da_verificare'
        WHEN 'PARZIALE'       THEN 'da_verificare'
        ELSE 'da_pagare'
    END AS stato_pagamento,
    -- Stato cg_uscite grezzo (per filtri UI granulari post G.6)
    u.stato AS cg_uscite_stato
FROM fe_fatture f
LEFT JOIN cg_uscite u ON u.fattura_id = f.id
"""


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. Aggiungi colonna data_scadenza_originale ──
    cg_cols = {r[1] for r in cur.execute("PRAGMA table_info(cg_uscite)").fetchall()}
    if "data_scadenza_originale" not in cg_cols:
        cur.execute("ALTER TABLE cg_uscite ADD COLUMN data_scadenza_originale TEXT")
        print("  [114] aggiunta colonna cg_uscite.data_scadenza_originale")
    else:
        print("  [114] colonna data_scadenza_originale già presente, skip")

    # ── 2. Rename stati ──
    for old, new in RENAME_MAP:
        cur.execute(
            "UPDATE cg_uscite SET stato = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE stato = ?",
            (new, old),
        )
        n = cur.rowcount
        if n:
            print(f"  [114] {old} → {new}: {n} righe")

    # ── 3. Drop & recreate VIEW (mappatura aggiornata) ──
    cur.execute("DROP VIEW IF EXISTS fe_fatture_with_stato")
    cur.execute(VIEW_SQL)
    print("  [114] VIEW fe_fatture_with_stato ricreata (mappa nuovi nomi)")

    # ── 4. Stats finali ──
    rows = cur.execute("""
        SELECT stato, COUNT(*) AS n
        FROM cg_uscite WHERE stato IS NOT NULL
        GROUP BY stato ORDER BY n DESC
    """).fetchall()
    print(f"  [114] distribuzione finale cg_uscite.stato:")
    for r in rows:
        print(f"       {r[0]:20s} {r[1]}")

    conn.commit()
    print("  [114] DONE — stati rinominati al maschile, SPOSTATO disponibile, data_scadenza_originale pronta")
