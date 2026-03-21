# @version: v1.0
"""
Migrazione 025 — Aggiunge colonna 'pagato' a fe_fatture.

Usata sia per fatture XML che FIC per tracciare lo stato di pagamento.
Per le fatture FIC, viene popolata automaticamente durante la sync
controllando la payments_list dell'API.
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(fe_fatture)")
    cols = {row[1] for row in cur.fetchall()}

    if "pagato" not in cols:
        cur.execute("ALTER TABLE fe_fatture ADD COLUMN pagato INTEGER DEFAULT 0")

    conn.commit()
