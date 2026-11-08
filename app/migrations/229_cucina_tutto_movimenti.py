"""
Migrazione 229 — Scorte cucina: tutto a movimenti + flag «da riordinare» (2026-11-08)

Modulo: cucina  ·  [core]  ·  Doc: docs/modulo_scorte_cucina.md «Tutto a movimenti»
Decisioni di Marco del 2026-11-08 (Q #326, #327, #329).

- cucina_articoli.da_riordinare INTEGER — 1 = sotto soglia nasce la spesa / il
  task «Produrre», 0 = finisce e resta un buco sul ripiano. Nullable (lezione
  ADD COLUMN NOT NULL DEFAULT), poi riempita a 1: default sì anche per gli
  esistenti. Nel codice NULL vale come 1.
- Un regime solo: tutti gli articoli passano a MOVIMENTI, senza inventare
  quantita':
    · CONTA            → tiene la quantita' che ha (parte da li' la storia)
    · SEMAFORO rosso   → quantita' 0 sul ripiano rosso
    · SEMAFORO verde/giallo senza numero → resta NULL («non so»), pallino com'e'
  Il pallino non cambia da un giorno all'altro: le righe con quantita' NULL
  `riallinea_semaforo` non le tocca.

Idempotente: rieseguita non trova piu' niente da cambiare.
"""

import sqlite3

from app.models.cucina_scorte_db import apply_schema


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    apply_schema(conn)  # aggiunge da_riordinare (HEAL_COLUMNS)
    cur = conn.cursor()

    n = cur.execute("UPDATE cucina_articoli SET da_riordinare = 1 WHERE da_riordinare IS NULL").rowcount
    print(f"  [229] da_riordinare = 1 su {n} articoli")

    # Rosso del semaforo = finito: diventa un numero, 0.
    n = cur.execute("""
        UPDATE cucina_giacenze SET qta = 0
         WHERE stato_semaforo = 'FINITO' AND (qta IS NULL OR qta <> 0)
           AND articolo_id IN (SELECT id FROM cucina_articoli WHERE regime = 'SEMAFORO')
    """).rowcount
    print(f"  [229] semaforo rosso → quantita' 0 su {n} righe")

    for vecchio in ("SEMAFORO", "CONTA"):
        n = cur.execute("UPDATE cucina_articoli SET regime = 'MOVIMENTI' WHERE regime = ?",
                        (vecchio,)).rowcount
        print(f"  [229] {vecchio} → MOVIMENTI: {n} articoli")
