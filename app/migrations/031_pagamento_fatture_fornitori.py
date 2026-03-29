"""
Migrazione 031: aggiunge campi pagamento a fe_fatture e suppliers.

fe_fatture:
  - condizioni_pagamento  TEXT   (es. TP01=a rate, TP02=completo, TP03=anticipo)
  - modalita_pagamento    TEXT   (es. MP01=contanti, MP05=bonifico, MP08=carta...)
  - data_scadenza         TEXT   (YYYY-MM-DD, estratta da DatiPagamento XML)
  - importo_pagamento     REAL   (importo dalla sezione pagamento XML)

suppliers:
  - modalita_pagamento_default  TEXT  (modalità default quando XML non la contiene)
  - giorni_pagamento            INTEGER  (giorni dalla data fattura per calcolare scadenza)
  - note_pagamento              TEXT  (note libere sulle condizioni)
"""


def upgrade(conn):
    # ── fe_fatture: campi pagamento estratti da XML ──
    cols_fatture = [
        ("condizioni_pagamento", "TEXT"),
        ("modalita_pagamento", "TEXT"),
        ("data_scadenza", "TEXT"),
        ("importo_pagamento", "REAL"),
    ]
    for col, tipo in cols_fatture:
        try:
            conn.execute(f"ALTER TABLE fe_fatture ADD COLUMN {col} {tipo}")
        except Exception:
            pass  # colonna già esistente

    # ── suppliers: default pagamento per fornitore ──
    cols_suppliers = [
        ("modalita_pagamento_default", "TEXT"),
        ("giorni_pagamento", "INTEGER"),
        ("note_pagamento", "TEXT"),
    ]
    for col, tipo in cols_suppliers:
        try:
            conn.execute(f"ALTER TABLE suppliers ADD COLUMN {col} {tipo}")
        except Exception:
            pass  # colonna già esistente

    conn.commit()
