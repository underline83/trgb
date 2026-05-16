"""
Migrazione 129 — Colonna prezzo_unitario sui movimenti (2026-05-16)

CONTESTO:
  Finora `vini_magazzino_movimenti` salvava solo qta + tipo. Senza prezzo per
  movimento, il ricavo di una vendita poteva essere solo stimato (qta ×
  prezzo carta attuale della bottiglia) — impreciso se il prezzo è cambiato.

  Da oggi salviamo lo snapshot del prezzo al momento del movimento. Questo
  permette:
   - Ricavo reale per ogni VENDITA (non più stima)
   - Storico prezzi acquisto per ogni CARICO
   - Margine effettivo (vendita - acquisto)
   - KPI affidabili sulla scheda madre v2 (Tab Statistiche)

SCHEMA:
  ALTER TABLE vini_magazzino_movimenti ADD COLUMN prezzo_unitario REAL
  Default NULL — non tutti i tipi hanno un prezzo (RETTIFICA/MODIFICA/SCARICO
  per rottura non valorizzano).

BACKFILL (best-effort, marca i record come stima storica):
  Per i movimenti pre-esistenti:
   - VENDITA: prezzo_unitario = bottiglia.PREZZO_CARTA (attuale)
   - CARICO:  prezzo_unitario = bottiglia.EURO_LISTINO (attuale)
   - SCARICO/RETTIFICA/MODIFICA: NULL

  ⚠️ Il backfill è una STIMA: usa il prezzo carta/listino attuale della
  bottiglia. Se il prezzo è cambiato nel tempo, i record storici riflettono
  il valore corrente, non quello reale al momento del movimento. Per i
  movimenti futuri (dopo questa mig) il prezzo sarà esatto.

DB: vini_magazzino.sqlite3 (locale-aware).
Idempotente: ADD COLUMN con check pragma + UPDATE solo dove NULL.
"""
import sqlite3
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [129] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # Verifica esistenza tabella
        row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_magazzino_movimenti'"
        ).fetchone()
        if not row:
            print("  [129] vini_magazzino_movimenti non esiste, skip")
            return

        # Check se colonna già esiste (idempotente)
        cols = [c[1] for c in cur.execute("PRAGMA table_info(vini_magazzino_movimenti)").fetchall()]
        if "prezzo_unitario" not in cols:
            cur.execute(
                "ALTER TABLE vini_magazzino_movimenti ADD COLUMN prezzo_unitario REAL"
            )
            print("  [129] colonna prezzo_unitario aggiunta")
        else:
            print("  [129] colonna prezzo_unitario già presente, skip ALTER")

        # Backfill best-effort solo per record NULL (idempotente al re-run)
        # VENDITA → PREZZO_CARTA della bottiglia
        cur.execute(
            """
            UPDATE vini_magazzino_movimenti
            SET prezzo_unitario = (
                SELECT CAST(v.PREZZO_CARTA AS REAL)
                FROM vini_magazzino v
                WHERE v.id = vini_magazzino_movimenti.vino_id
                  AND v.PREZZO_CARTA IS NOT NULL
                  AND v.PREZZO_CARTA != ''
            )
            WHERE prezzo_unitario IS NULL
              AND tipo = 'VENDITA'
              AND EXISTS (
                SELECT 1 FROM vini_magazzino v
                WHERE v.id = vini_magazzino_movimenti.vino_id
                  AND v.PREZZO_CARTA IS NOT NULL
                  AND v.PREZZO_CARTA != ''
              )
            """
        )
        n_vendite = cur.rowcount
        print(f"  [129] backfill VENDITA: {n_vendite} movimenti aggiornati con stima PREZZO_CARTA")

        # CARICO → EURO_LISTINO della bottiglia
        cur.execute(
            """
            UPDATE vini_magazzino_movimenti
            SET prezzo_unitario = (
                SELECT CAST(v.EURO_LISTINO AS REAL)
                FROM vini_magazzino v
                WHERE v.id = vini_magazzino_movimenti.vino_id
                  AND v.EURO_LISTINO IS NOT NULL
                  AND v.EURO_LISTINO != ''
            )
            WHERE prezzo_unitario IS NULL
              AND tipo = 'CARICO'
              AND EXISTS (
                SELECT 1 FROM vini_magazzino v
                WHERE v.id = vini_magazzino_movimenti.vino_id
                  AND v.EURO_LISTINO IS NOT NULL
                  AND v.EURO_LISTINO != ''
              )
            """
        )
        n_carichi = cur.rowcount
        print(f"  [129] backfill CARICO: {n_carichi} movimenti aggiornati con stima EURO_LISTINO")

        mag.commit()
        print(f"  [129] DONE — backfill totale: {n_vendite + n_carichi} movimenti")
    finally:
        mag.close()
