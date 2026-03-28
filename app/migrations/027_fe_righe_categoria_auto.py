# @version: v1.1
"""
Migrazione 027 — Aggiunge flag categoria_auto a fe_righe.

Se 1, la categoria è stata ereditata dal default fornitore (auto-categorizzazione).
Se 0 o NULL, è stata assegnata manualmente a livello prodotto.
Serve per evidenziare nel frontend le righe da verificare.

Reset: azzera eventuali categoria_auto=1 errati creati prima del fix.
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(fe_righe)")
    cols = {row[1] for row in cur.fetchall()}

    if "categoria_auto" not in cols:
        cur.execute("ALTER TABLE fe_righe ADD COLUMN categoria_auto INTEGER DEFAULT 0")
    else:
        # Reset: la propagazione precedente potrebbe aver marcato righe
        # già categorizzate come auto. Azzera tutto: partiranno pulite.
        cur.execute("UPDATE fe_righe SET categoria_auto = 0 WHERE categoria_auto = 1")

    conn.commit()
