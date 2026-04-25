"""
Migrazione 101 — Colonna BOTTIGLIA_APERTA su vini_magazzino (sessione 58 — 2026-04-25)

Aggiunge il flag BOTTIGLIA_APERTA (INTEGER 0/1) alla tabella vini_magazzino
nel DB separato `app/data/vini_magazzino.sqlite3`.

Scopo: distinguere "bottiglia chiusa in cantina" da "bottiglia aperta in mescita".
Risolve il problema per cui un vino con QTA_TOTALE=0 ma con calici ancora
disponibili nella bottiglia aperta dietro al banco non appariva piu' nella
sezione Calici della carta vini.

La carta calici (`load_vini_calici()` in `app/repositories/vini_repository.py`)
filtrera' i vini con `VENDITA_CALICE='SI' AND (QTA_TOTALE >= min OR BOTTIGLIA_APERTA = 1)`.

Il lavoro pesante e' in `app.models.vini_magazzino_db.init_magazzino_database`
(idempotente, gestisce sia CREATE TABLE per nuove installazioni che ALTER TABLE
per quelle esistenti). Questa migration e' il trigger esplicito + log.

DB: app/data/vini_magazzino.sqlite3 (isolato da foodcost.db).
"""

import sqlite3

from app.models.vini_magazzino_db import (
    DB_MAG_PATH as VINI_MAG_DB,
    init_magazzino_database,
    get_magazzino_connection,
)


def upgrade(conn: sqlite3.Connection) -> None:
    """
    Trigger idempotente. Non tocca foodcost.db (riceve conn ma non la usa).
    init_magazzino_database e' idempotente:
    - CREATE TABLE include gia' BOTTIGLIA_APERTA per nuove installazioni
    - Il blocco "MIGRAZIONI LEGGERISSIME" fa ALTER TABLE ADD COLUMN se manca
      (try/except in stile esistente sulla colonna 'BOTTIGLIA_APERTA')
    """
    existed = VINI_MAG_DB.exists()
    init_magazzino_database()

    mag_conn = get_magazzino_connection()
    try:
        cur = mag_conn.cursor()
        cur.execute("PRAGMA table_info(vini_magazzino);")
        cols = [r[1] for r in cur.fetchall()]
        if "BOTTIGLIA_APERTA" not in cols:
            raise RuntimeError(
                "[101] Colonna BOTTIGLIA_APERTA NON aggiunta — "
                "init_magazzino_database non ha eseguito l'ALTER atteso."
            )
        n_aperte = cur.execute(
            "SELECT COUNT(*) FROM vini_magazzino WHERE BOTTIGLIA_APERTA = 1;"
        ).fetchone()[0]
    finally:
        mag_conn.close()

    if not existed:
        print(f"  [101] vini_magazzino.sqlite3 creato → {VINI_MAG_DB.name}")
    print(f"  [101] BOTTIGLIA_APERTA pronta (vini con bottiglia aperta: {n_aperte})")
