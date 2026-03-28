# @version: v1.0
"""
Migrazione 028 — Reset categoria_auto a 0 su tutte le righe.

La propagazione pre-fix marcava erroneamente righe già categorizzate
come categoria_auto=1. Questo reset azzera tutto: d'ora in poi solo
i nuovi prodotti importati avranno categoria_auto=1.
"""


def upgrade(conn):
    conn.execute("UPDATE fe_righe SET categoria_auto = 0 WHERE categoria_auto = 1")
    conn.commit()
