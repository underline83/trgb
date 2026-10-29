"""
Migrazione 220 — Linea cucina: minimo di dispensa (2026-10-29)

Modulo: cucina  ·  [core]  ·  Spec: docs/spec_linea_cucina.md §5.1

Marco: «mettiamo la dispensa». Le vecchie checklist dei primi controllavano
anche la scorta secca (riso 10 kg, fusilloni 5, pasta mista 3, pipe 5); le
generate dal menu sapevano solo frigo e gelo.

- cucina_articoli.scorta_min_dispensa REAL NULL — il minimo sui ripiani di
  DISPENSA/SCAFFALE. Con un minimo, la partita ha la voce SCORTA_DISPENSA.
- Riempimento iniziale: per gli articoli SECCO senza minimo dispensa, il loro
  `scorta_minima` (era li' che stavano i minimi di riso e pasta). Non
  sovrascrive un numero gia' messo.
"""

import sqlite3

from app.models.cucina_scorte_db import apply_schema


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    apply_schema(conn)
    cur = conn.execute("""
        UPDATE cucina_articoli SET scorta_min_dispensa = scorta_minima
         WHERE scorta_min_dispensa IS NULL AND scorta_minima IS NOT NULL
           AND famiglia_freschezza = 'SECCO'
    """)
    print(f"  [220] cucina_articoli.scorta_min_dispensa: {cur.rowcount} articoli secchi riempiti")
