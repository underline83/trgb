# Modulo: banca
"""
Migration 174 — Ripara i link di riconciliazione finiti a quota zero.

## Il bug (8 ore di vita, 2026-09-08)

`create_link`, riscritto poche ore prima per allocare davvero gli importi,
cercava le rate su cui incidere con:

    WHERE fattura_id = ? AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE')

Sembra ragionevole — "prendi quelle non ancora pagate" — ma `PAGATO_MANUALE`
è proprio il caso normale in cui la riconciliazione arriva dopo: la fattura è
stata segnata pagata a mano, poi il movimento bancario conferma. Filtrandola
via non restava niente da allocare, l'allocazione tornava vuota e il link
veniva scritto con `importo_applicato = 0`.

Effetto a schermo: il movimento risultava collegato ma con zero allocato —
«⚡ Parziale: € 0,00 su € 174,22 — residuo € 174,22» — e la fattura non si
poteva ricollegare, perché il link c'era già (409 "Collegamento già esistente").
Marco l'ha visto su due bonifici del 30/06 (Balan 174,22 e "dove il lavare è
arte" 1.212,17) subito dopo il deploy.

Il codice è corretto in `banca_router` (il criterio ora è "senza
`banca_movimento_id`", cioè non ancora pagata DALLA BANCA, più le PARZIALI).
Questa migrazione ripara le righe già scritte.

## Cosa fa

Per ogni link con `importo_applicato = 0`:
  1. rimette la quota a NULL — che per il calcolo del residuo significa
     "vale il totale della fattura", esattamente come i link storici;
  2. completa l'uscita CG rimasta a metà: l'hook di stato l'aveva portata a
     `PAGATO`, ma senza `banca_movimento_id`, senza `importo_pagato` e senza
     data di pagamento, perché l'UPDATE non aveva trovato righe da toccare.

Non tocca i link con quota NULL (storici, legittimi) né quelli con quota > 0.
Idempotente.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> int:
    cur = conn.cursor()

    cols = {r[1] for r in cur.execute("PRAGMA table_info(banca_fatture_link)")}
    if "importo_applicato" not in cols:
        print("  Migrazione 174: importo_applicato assente (mig 172 non girata) — niente da fare")
        return 0

    rotti = cur.execute("""
        SELECT bl.id, bl.movimento_id, bl.fattura_id,
               f.fornitore_nome, f.numero_fattura, f.totale_fattura,
               m.data_contabile, m.importo
          FROM banca_fatture_link bl
          JOIN fe_fatture f ON f.id = bl.fattura_id
          LEFT JOIN banca_movimenti m ON m.id = bl.movimento_id
         WHERE bl.importo_applicato IS NOT NULL
           AND bl.importo_applicato <= 0
    """).fetchall()

    if not rotti:
        print("  Migrazione 174: nessun link a quota zero")
        return 0

    for link_id, mov_id, fatt_id, forn, num, totale, data_mov, imp_mov in rotti:
        cur.execute(
            "UPDATE banca_fatture_link SET importo_applicato = NULL WHERE id = ?",
            (link_id,),
        )
        # L'uscita è rimasta senza aggancio bancario: la si completa qui.
        cur.execute("""
            UPDATE cg_uscite
               SET banca_movimento_id = COALESCE(banca_movimento_id, ?),
                   stato = CASE WHEN stato IN ('PAGATO_MANUALE', 'PAGATO')
                                THEN 'PAGATO' ELSE stato END,
                   importo_pagato = CASE WHEN COALESCE(importo_pagato, 0) <= 0
                                         THEN totale ELSE importo_pagato END,
                   data_pagamento = COALESCE(data_pagamento, ?),
                   in_pagamento_at = NULL,
                   pagamento_batch_id = NULL,
                   updated_at = datetime('now')
             WHERE fattura_id = ?
               AND (banca_movimento_id IS NULL OR banca_movimento_id = ?)
        """, (mov_id, data_mov, fatt_id, mov_id))

        print(f"  · link {link_id}: mov {mov_id} ({data_mov}, {imp_mov if imp_mov is not None else 0:.2f}) "
              f"↔ {(forn or '')[:28]} n.{num} {totale:.2f} → quota ripristinata")

    conn.commit()
    print(f"  Migrazione 174: riparati {len(rotti)} link a quota zero")
    return len(rotti)
