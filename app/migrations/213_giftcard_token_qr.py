# Modulo: clienti
"""
Migrazione 213 — chiave casuale per il QR delle gift card (2026-10-25)

PERCHE':
  Marco attacca sul buono un'etichetta (Brother QL-820NWB, 62x29) con un QR.
  Inquadrato dal cliente mostra cosa gli hanno regalato; inquadrato da un
  telefono loggato in TRGB apre la card col bottone Scarica.
  Il QR non puo' contenere il codice: B126-354, B126-355... si indovinano in
  sequenza. Contiene /regalo/<token_pubblico>, una chiave casuale.

COSA FA (idempotente, solo ADD COLUMN):
  - ADD COLUMN clienti_giftcard.token_pubblico TEXT (+ indice UNIQUE parziale)
  - assegna una chiave alle card che non ce l'hanno (storiche comprese)

DB COLPITO: clienti.sqlite3 (locale-aware).
"""

import secrets
import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    """conn = foodcost.db (passato dal runner, non usato). Apre clienti.sqlite3."""
    path = locale_data_path("clienti.sqlite3")
    if not path.exists():
        print("  [213] clienti.sqlite3 non esiste, skip")
        return

    cconn = sqlite3.connect(str(path), timeout=30)
    try:
        cconn.execute("PRAGMA busy_timeout=30000")
        tabella = cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_giftcard'"
        ).fetchone()
        if not tabella:
            print("  [213] clienti_giftcard non presente, skip (la crea init_clienti_db con la colonna)")
            return

        cols = {r[1] for r in cconn.execute("PRAGMA table_info(clienti_giftcard)").fetchall()}
        if "token_pubblico" not in cols:
            cconn.execute("ALTER TABLE clienti_giftcard ADD COLUMN token_pubblico TEXT")
        cconn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_token "
            "ON clienti_giftcard(token_pubblico) WHERE token_pubblico IS NOT NULL"
        )

        ids = [r[0] for r in cconn.execute(
            "SELECT id FROM clienti_giftcard WHERE token_pubblico IS NULL OR token_pubblico = ''"
        ).fetchall()]
        for gc_id in ids:
            cconn.execute(
                "UPDATE clienti_giftcard SET token_pubblico = ? WHERE id = ?",
                (secrets.token_urlsafe(12), gc_id),
            )
        cconn.commit()
        print(f"  ✔ [213] token QR gift card: colonna pronta, {len(ids)} card valorizzate")
    finally:
        cconn.close()
