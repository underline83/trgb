# Modulo: banca
"""
Migration 144 — Backfill banca/rapporto sui movimenti CC vecchi (TRGB-only).

Storico: i primi import CSV Banco BPM (sessione vecchia) non avevano la colonna
"Banca" valorizzata. Risultato: 420 movimenti hanno `banca=''` e `rapporto`
con codici corti tipo '118', '260', '662' (CAB filiale, non il numero conto
vero). Conseguenza: in BancaCrossRef il badge "CC *2200" non appariva su quei
movimenti perché il check `m.banca ?` falsificava (CC.7.fix lato FE rende
il badge sempre presente, ma il dato resta sporco).

Questa migration ripulisce il dato: per tutti i movimenti senza banca (e non
carta), assegna i valori canonici del CC Banco BPM Tre Gobbi:
  banca    = '05034 - BANCO BPM S.P.A.'
  rapporto = '11102 - 400200012200'

Idempotente: se applicata 2 volte, la seconda non tocca nulla (filtro WHERE).

⚠️ TRGB_SPECIFIC = True
Marco ha UN solo CC (Banco BPM 12200). Su altri locali futuri (prodotto
vendibile a ristoranti diversi) questa migration NON deve girare, sennò
etichetterebbe come BPM movimenti che potrebbero essere di altre banche.
Il migration_runner skippa le mig con TRGB_SPECIFIC=True quando
TRGB_LOCALE != 'tregobbi'. Vedi `app/migrations/migration_runner.py`.
"""

import sqlite3

TRGB_SPECIFIC = True


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("""
        UPDATE banca_movimenti
        SET banca = '05034 - BANCO BPM S.P.A.',
            rapporto = '11102 - 400200012200'
        WHERE (banca IS NULL OR banca = '')
          AND (banca IS NULL OR banca NOT LIKE 'CARTA_%')
    """)
    conn.commit()
