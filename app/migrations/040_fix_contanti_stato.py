"""
Migrazione 040: fix stato pagamenti in contanti.

Le uscite pagate con metodo_pagamento = 'CONTANTI' devono avere stato 'PAGATA'
(non 'PAGATA_MANUALE'), perché il modulo contanti È la riconciliazione.
Corregge le righe già esistenti.
"""


def upgrade(conn):
    conn.execute("""
        UPDATE cg_uscite
        SET stato = 'PAGATA'
        WHERE metodo_pagamento = 'CONTANTI'
          AND stato = 'PAGATA_MANUALE'
    """)
    conn.commit()
