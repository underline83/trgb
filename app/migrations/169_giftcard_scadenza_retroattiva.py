# Modulo: clienti
# ⚠️ TRGB_SPECIFIC — decisione sui buoni storici dell'osteria di Marco.
TRGB_SPECIFIC = True

"""
Migrazione 169 — scadenza retroattiva sui buoni pre-2025 — [locale:tregobbi]

RICHIESTA (Marco, 2026-08-08): «flagga come scadute tutte quelle prima del
1/01/2025».

COME, E PERCHE' COSI':
  Non esiste (e non deve esistere) uno stato 'scaduta'. Nel modulo Gift Card
  il ciclo di vita (`stato`: attiva / usata / annullata) e la scadenza sono
  due dimensioni separate — stessa disciplina degli stati pagamento, §15 di
  stato_pagamento_unificato.md. "Scaduta" si esprime scrivendo una
  `data_scadenza` nel passato, non inventando uno stato.

  Conseguenza pratica voluta: le card restano `attiva`, quindi la UI le
  mostra come scadute e il banco non le accetta, ma Marco puo' PROROGARLE
  dalla scheda se decide di onorarne una. Se avessimo scritto uno stato,
  per riaccettarle avremmo dovuto "resuscitarle".

  Data scelta: 2024-12-31, il giorno prima del taglio.

PERCHE' UNA MIGRAZIONE SEPARATA DALLA 167:
  la 167 era gia' stata deployata quando e' arrivata questa richiesta. Una
  migrazione applicata non viene rieseguita, quindi modificarla non avrebbe
  avuto alcun effetto in produzione (e cambiare una migration gia' girata e'
  vietato dalle convenzioni del progetto).

AMBITO: solo card `attiva` con `data_emissione` precedente al 2025 e
  `data_scadenza` ancora vuota.
  - le usate non si toccano: i soldi sono gia' stati spesi, una scadenza
    non direbbe nulla;
  - chi ha gia' una scadenza non si tocca: e' stata messa da qualcuno.

RISULTATO ATTESO: 56 card portate a scadenza (10.540 €). Restano spendibili
  18 card per 2.285 €.

⚠️ DA GUARDARE A MANO DOPO: `A125-330` ha serie 2025 ma data 08/12/2024 (la
  riga gemella scartata in fase di import diceva 08/12/2025). Con la regola
  sulla data finisce fra le scadute: se e' davvero un buono del dicembre
  2025, va prorogato dalla sua scheda.

DB COLPITO: clienti.sqlite3 (locale-aware). Solo UPDATE di `data_scadenza`.
Idempotente: la seconda esecuzione trova 0 righe (il filtro vuole
data_scadenza IS NULL).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

SOGLIA = "2025-01-01"
SCADENZA = "2024-12-31"


def upgrade(conn):
    """conn = foodcost.db (passato dal runner, non usato). Apre clienti.sqlite3."""
    path = locale_data_path("clienti.sqlite3")
    if not path.exists():
        print("  [169] clienti.sqlite3 non esiste, skip")
        return

    cconn = sqlite3.connect(str(path), timeout=30)
    try:
        cconn.execute("PRAGMA busy_timeout=30000")
        tabella = cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_giftcard'"
        ).fetchone()
        if not tabella:
            print("  [169] tabella clienti_giftcard non presente, skip")
            return

        cur = cconn.execute(
            """
            UPDATE clienti_giftcard
            SET data_scadenza = ?
            WHERE stato = 'attiva'
              AND data_scadenza IS NULL
              AND data_emissione < ?
            """,
            (SCADENZA, SOGLIA),
        )
        toccate = cur.rowcount

        if toccate:
            cconn.execute(
                """
                INSERT INTO clienti_giftcard_movimenti
                    (giftcard_id, azione, stato_prima, stato_dopo, utente, note)
                SELECT id, 'modifica', stato, stato, 'migrazione 169',
                       'Scadenza retroattiva al 31/12/2024 sui buoni emessi prima del 2025. '
                       || 'La card resta attiva: si puo'' prorogare dalla scheda.'
                FROM clienti_giftcard
                WHERE stato = 'attiva' AND data_scadenza = ? AND data_emissione < ?
                """,
                (SCADENZA, SOGLIA),
            )

        cconn.commit()

        spendibili = cconn.execute(
            """
            SELECT COUNT(*) n, COALESCE(SUM(importo),0) v
            FROM clienti_giftcard
            WHERE stato='attiva'
              AND (data_scadenza IS NULL OR data_scadenza >= date('now','localtime'))
            """
        ).fetchone()
        print(
            f"  ✔ [169] {toccate} gift card portate a scadenza 31/12/2024 "
            f"— restano spendibili {spendibili[0]} per {spendibili[1]:.0f} €"
        )
    finally:
        cconn.close()
