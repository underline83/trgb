"""
Migrazione 112 — DROP delle colonne pagato/stato_pagamento + VIEW unificata (G.5 Step 2)

Parte 2 di 2 della rifattorizzazione G.5 (Livello 3).

Cambiamento DEFINITIVO dello schema:
  - DROP `fe_fatture.pagato`         (boolean, dal 2024 — ridondante)
  - DROP `fe_fatture.stato_pagamento` (TEXT, dal 2026-04 — ridondante)
  - DROP indice `idx_fe_fatture_stato_pagamento` (non serve più)
  - CREATE VIEW `fe_fatture_with_stato` che ricostruisce i campi via JOIN cg_uscite

Da questo punto in poi:
  - fe_fatture NON ha più i 2 flag fisici
  - cg_uscite.stato è L'UNICA fonte di verità
  - Le query Python che leggono `pagato` o `stato_pagamento` usano la VIEW
    `fe_fatture_with_stato` (es: SELECT pagato FROM fe_fatture_with_stato WHERE ...)
  - Le query che SCRIVONO devono passare per fatture_stato_service o cg_uscite diretto

Mappatura cg_uscite.stato → (pagato, stato_pagamento) implementata nella VIEW:
  PAGATA          → (1, 'pagato')
  PAGATA_MANUALE  → (1, 'pagato_manuale')
  PARZIALE        → (0, 'da_verificare')
  DA_VERIFICARE   → (0, 'da_verificare')
  DA_PAGARE       → (0, 'da_pagare')
  SCADUTA         → (0, 'da_pagare')
  RATEIZZATA      → (0, 'da_pagare') — la spesa fissa gestisce, qui resta neutro
  (no cg_uscite)  → (0, 'da_pagare') — default sicuro

PREREQUISITO mig 111:
  - cg_uscite stub creato per le 9 fatture orfane (altrimenti perderemmo il loro stato)
  - fic_pagato_raw popolato con il valore corrente di pagato per fatture FIC
    (per non perdere l'info FIC originale dopo il DROP)

ROLLBACK:
  - SQLite non permette UNDO automatico di DROP COLUMN
  - In caso di problemi: ripristinare dal backup automatico di push.sh
    (ogni push fa snapshot pre-deploy)

Idempotente:
  - Controlla che le colonne esistano prima di DROP (PRAGMA table_info)
  - DROP VIEW IF EXISTS prima di CREATE
"""
import sqlite3


VIEW_SQL = """
CREATE VIEW fe_fatture_with_stato AS
SELECT
    f.*,
    -- Ricostruisce il boolean pagato dalla cg_uscite collegata
    CASE u.stato
        WHEN 'PAGATA'          THEN 1
        WHEN 'PAGATA_MANUALE'  THEN 1
        ELSE 0
    END AS pagato,
    -- Ricostruisce stato_pagamento (TEXT, 4 valori) dalla cg_uscite collegata
    CASE u.stato
        WHEN 'PAGATA'         THEN 'pagato'
        WHEN 'PAGATA_MANUALE' THEN 'pagato_manuale'
        WHEN 'PARZIALE'       THEN 'da_verificare'
        WHEN 'DA_VERIFICARE'  THEN 'da_verificare'
        ELSE 'da_pagare'
    END AS stato_pagamento,
    -- Espone anche lo stato grezzo cg_uscite per chi vuole granularità
    u.stato AS cg_uscite_stato
FROM fe_fatture f
LEFT JOIN cg_uscite u ON u.fattura_id = f.id
"""


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    fe_cols = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}

    # ── 1. Drop indice (deve precedere DROP COLUMN su SQLite) ──
    cur.execute("DROP INDEX IF EXISTS idx_fe_fatture_stato_pagamento")
    print("  [112] drop idx_fe_fatture_stato_pagamento")

    # ── 2. Drop VIEW eventualmente esistente ──
    cur.execute("DROP VIEW IF EXISTS fe_fatture_with_stato")
    print("  [112] drop view fe_fatture_with_stato (se esisteva)")

    # ── 3. DROP COLUMN stato_pagamento ──
    if "stato_pagamento" in fe_cols:
        try:
            cur.execute("ALTER TABLE fe_fatture DROP COLUMN stato_pagamento")
            print("  [112] DROP COLUMN fe_fatture.stato_pagamento")
        except sqlite3.OperationalError as e:
            print(f"  [112] errore DROP stato_pagamento: {e}")
            raise
    else:
        print("  [112] colonna stato_pagamento già rimossa, skip")

    # ── 4. DROP COLUMN pagato ──
    fe_cols = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}
    if "pagato" in fe_cols:
        try:
            cur.execute("ALTER TABLE fe_fatture DROP COLUMN pagato")
            print("  [112] DROP COLUMN fe_fatture.pagato")
        except sqlite3.OperationalError as e:
            print(f"  [112] errore DROP pagato: {e}")
            raise
    else:
        print("  [112] colonna pagato già rimossa, skip")

    # ── 5. Crea VIEW fe_fatture_with_stato ──
    cur.execute(VIEW_SQL)
    print("  [112] CREATE VIEW fe_fatture_with_stato — JOIN automatico cg_uscite")

    # ── 6. Verifica integrità ──
    n_view = cur.execute("SELECT COUNT(*) FROM fe_fatture_with_stato").fetchone()[0]
    n_table = cur.execute("SELECT COUNT(*) FROM fe_fatture").fetchone()[0]
    if n_view != n_table:
        raise RuntimeError(
            f"[112] VIEW count ({n_view}) != tabella count ({n_table}) — anomalia JOIN"
        )
    print(f"  [112] verifica: VIEW e tabella allineati a {n_view} righe")

    conn.commit()
    print("  [112] DONE — schema ridotto, source of truth = cg_uscite.stato")
