# @version: v1.0
"""
Migrazione 024 — Aggiunge colonne per integrazione FIC a fe_fatture.

Nuove colonne:
  fonte       TEXT DEFAULT 'xml'   — origine dato: 'xml' o 'fic'
  fic_id      INTEGER              — ID documento su Fatture in Cloud (NULL se importato da XML)

Permette di:
- Distinguere fatture importate da XML vs sincronizzate da FIC
- Evitare duplicati cross-fonte tramite match su piva + numero + data
"""


def upgrade(conn):
    cur = conn.cursor()

    # Leggi colonne esistenti
    cur.execute("PRAGMA table_info(fe_fatture)")
    cols = {row[1] for row in cur.fetchall()}

    if "fonte" not in cols:
        cur.execute("ALTER TABLE fe_fatture ADD COLUMN fonte TEXT DEFAULT 'xml'")

    if "fic_id" not in cols:
        cur.execute("ALTER TABLE fe_fatture ADD COLUMN fic_id INTEGER")

    # Indice per deduplica rapida
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_fe_fatture_fic_id
            ON fe_fatture(fic_id)
    """)

    # Indice per deduplica cross-fonte (piva + numero + data)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_fe_fatture_dedup
            ON fe_fatture(fornitore_piva, numero_fattura, data_fattura)
    """)

    conn.commit()
