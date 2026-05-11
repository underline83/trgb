"""
Migrazione 121 — Backfill DATA_APERTURA su vini_magazzino (2026-05-11)

CONTESTO:
  Sessione 2026-05-11: aggiunta colonna `vini_magazzino.DATA_APERTURA TEXT`
  per persistere la data di apertura di una bottiglia in mescita (alert
  ⚠ nel widget Calici disponibili se aperta da >36h).

  Il CREATE TABLE + ALTER TABLE in `init_magazzino_database()` aggiunge la
  colonna come NULL. Le bottiglie già `BOTTIGLIA_APERTA=1` quando la
  migrazione gira hanno quindi `DATA_APERTURA = NULL` e nel widget non
  mostrano né alert né età.

  Soluzione: backfill dal movimento VENDITA con tag [CALICI] più recente
  per ogni vino già aperto. Se non c'è movimento [CALICI] (apertura manuale
  da toggle scheda), si usa `UPDATED_AT` come fallback ragionevole.

DB: vini_magazzino.sqlite3 (locale-aware).
Idempotente: re-run no-op (popola solo le righe con DATA_APERTURA NULL).
"""
import sqlite3

from app.models.vini_magazzino_db import (
    DB_MAG_PATH as VINI_MAG_DB,
    init_magazzino_database,
    get_magazzino_connection,
)


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner, non usato). Apre vini_magazzino.sqlite3."""
    # Assicura colonna DATA_APERTURA esistente (idempotente)
    init_magazzino_database()
    if not VINI_MAG_DB.exists():
        print("  [121] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = get_magazzino_connection()
    try:
        cur = mag.cursor()

        # Step 1: popola DATA_APERTURA dal movimento VENDITA [CALICI] più recente
        # (la bottiglia è stata aperta automaticamente quando si è registrata
        # una vendita calice → quella data è la migliore approssimazione).
        cur.execute("""
            UPDATE vini_magazzino
            SET DATA_APERTURA = (
                SELECT MAX(m.data_mov)
                FROM vini_magazzino_movimenti m
                WHERE m.vino_id = vini_magazzino.id
                  AND m.tipo = 'VENDITA'
                  AND m.note LIKE '%[CALICI]%'
            )
            WHERE BOTTIGLIA_APERTA = 1
              AND DATA_APERTURA IS NULL
        """)
        n_da_movimento = cur.rowcount
        print(f"  [121] DATA_APERTURA popolata da movimento VENDITA [CALICI]: {n_da_movimento} righe")

        # Step 2: per bottiglie aperte manualmente (no movimento [CALICI]),
        # fallback su UPDATED_AT della scheda vino.
        cur.execute("""
            UPDATE vini_magazzino
            SET DATA_APERTURA = UPDATED_AT
            WHERE BOTTIGLIA_APERTA = 1
              AND DATA_APERTURA IS NULL
              AND UPDATED_AT IS NOT NULL
        """)
        n_da_updated = cur.rowcount
        print(f"  [121] DATA_APERTURA popolata da UPDATED_AT (fallback manuale): {n_da_updated} righe")

        # Step 3: verifica
        rimaste_nulle = cur.execute("""
            SELECT COUNT(*) FROM vini_magazzino
            WHERE BOTTIGLIA_APERTA = 1 AND DATA_APERTURA IS NULL
        """).fetchone()[0]
        if rimaste_nulle:
            print(f"  [121] ATTENZIONE: {rimaste_nulle} bottiglie aperte ancora senza DATA_APERTURA (UPDATED_AT mancante)")
        else:
            print(f"  [121] tutte le bottiglie aperte hanno DATA_APERTURA valorizzata")

        mag.commit()
        print("  [121] DONE")
    finally:
        mag.close()
