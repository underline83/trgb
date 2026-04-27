"""
Migrazione 103 — Stato pagamento fattura a 4 stati (Modulo M, 2026-04-27)

Sostituisce semanticamente il boolean fe_fatture.pagato con un enum testuale
fe_fatture.stato_pagamento con 4 valori:

  - da_pagare         → fattura aperta, da gestire (default)
  - da_verificare     → utente ha dubbi: forse già pagata, controllare
  - pagato_manuale    → utente dichiara pagata, in attesa di riconciliazione
                        bancaria (UI: "Pagato*", reversibile)
  - pagato            → certificata da riconciliazione bancaria
                        (banca_fatture_link). IMMUTABILE finché esiste il link.

Il vecchio campo `pagato` (0/1) resta in DB per compat con codice legacy:
  - pagato=1 ⇔ stato_pagamento IN ('pagato_manuale', 'pagato')
  - pagato=0 ⇔ stato_pagamento IN ('da_pagare', 'da_verificare')

Backfill (basato su 1561 fatture in produzione 2026-04-27):
  1. Se la fattura ha almeno un record in banca_fatture_link → 'pagato'
  2. Else if pagato=1 → 'pagato_manuale'
  3. Else → 'da_pagare'

Idempotente: ADD COLUMN ... DEFAULT con check pre-esistenza colonna.
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (cucina ora alias)"""
    cur = conn.cursor()

    # 1. Verifica se la colonna esiste già (idempotenza)
    cols = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}

    if "stato_pagamento" not in cols:
        cur.execute(
            "ALTER TABLE fe_fatture ADD COLUMN stato_pagamento TEXT DEFAULT 'da_pagare'"
        )
        print("  [103] aggiunta colonna fe_fatture.stato_pagamento DEFAULT 'da_pagare'")
    else:
        print("  [103] colonna stato_pagamento già presente, skip ALTER")

    # 2. Backfill in 3 passi (in ordine: pagato_manuale prima per non sovrascrivere)
    # 2a. Tutto a 'da_pagare' (default già impostato dal DEFAULT, ma reset esplicito su NULL)
    cur.execute(
        "UPDATE fe_fatture SET stato_pagamento = 'da_pagare' WHERE stato_pagamento IS NULL"
    )

    # 2b. Se pagato=1 e nessun link banca → 'pagato_manuale'
    cur.execute(
        """
        UPDATE fe_fatture
           SET stato_pagamento = 'pagato_manuale'
         WHERE pagato = 1
           AND id NOT IN (SELECT DISTINCT fattura_id FROM banca_fatture_link)
           AND stato_pagamento != 'pagato'
        """
    )
    n_man = cur.rowcount
    print(f"  [103] backfill: {n_man} fatture → 'pagato_manuale'")

    # 2c. Se ha almeno 1 record in banca_fatture_link → 'pagato' (sovrascrive tutto)
    cur.execute(
        """
        UPDATE fe_fatture
           SET stato_pagamento = 'pagato'
         WHERE id IN (SELECT DISTINCT fattura_id FROM banca_fatture_link)
        """
    )
    n_pag = cur.rowcount
    print(f"  [103] backfill: {n_pag} fatture → 'pagato' (riconciliate banca)")

    # Sincronizza fe_fatture.pagato per coerenza con stato_pagamento
    # (legacy compat: codice vecchio continua a leggere `pagato` 0/1)
    cur.execute(
        """
        UPDATE fe_fatture
           SET pagato = CASE
               WHEN stato_pagamento IN ('pagato', 'pagato_manuale') THEN 1
               ELSE 0
           END
        """
    )
    print("  [103] sincronizzato fe_fatture.pagato con stato_pagamento (legacy compat)")

    # Indice per filtri rapidi
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_fe_fatture_stato_pagamento ON fe_fatture(stato_pagamento)"
    )

    conn.commit()
    print("  [103] modulo M stato pagamento: schema pronto + backfill completo")
