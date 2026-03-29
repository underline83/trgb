"""
Migrazione 034: aggiunge metodo_pagamento a cg_uscite.

Valori possibili:
  - CONTO_CORRENTE  (bonifico / banca → da riconciliare con movimenti banca)
  - CARTA           (carta di credito)
  - CONTANTI        (pagamento in contanti)
  - NULL            (non ancora specificato)
"""


def upgrade(conn):
    # Aggiungi colonna metodo_pagamento
    try:
        conn.execute(
            "ALTER TABLE cg_uscite ADD COLUMN metodo_pagamento TEXT"
        )
    except Exception:
        pass  # colonna già esistente

    conn.commit()
