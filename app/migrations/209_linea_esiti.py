"""
Migrazione 209 — Linea cucina L3: dagli esiti al lavoro (2026-10-23)

Modulo: cucina (lista spesa)  ·  [core]  ·  Spec: docs/spec_linea_cucina.md §6

Decisioni di Marco (2026-10-23):
  - rosso o scorta sotto il minimo su una PREPARAZIONE → task «Produrre»;
  - su un COMPONENTE comprato → riga in Lista spesa «da confermare»: diventa
    da ordinare quando la conferma lui, lo chef o il sous chef;
  - giallo → niente task (ci torna chi l'ha segnato), salvo se la checklist
    scade ancora gialla.

lista_spesa_items (foodcost.db): + articolo_id INTEGER (articolo in Scorte che
l'ha fatta nascere), + origine TEXT ('LINEA'; NULL = a mano o dal semaforo del
frigo), + da_confermare INTEGER (1 = proposta), + confermato_da, + confermato_at.
Tutto nullable, idempotente.
"""

import sqlite3

COLS = [("articolo_id", "INTEGER"), ("origine", "TEXT"), ("da_confermare", "INTEGER"),
        ("confermato_da", "TEXT"), ("confermato_at", "TEXT")]


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    presenti = {r[1] for r in conn.execute("PRAGMA table_info(lista_spesa_items)")}
    if not presenti:
        print("  [209] lista_spesa_items non esiste, skip")
        return
    for col, tipo in COLS:
        if col not in presenti:
            conn.execute(f"ALTER TABLE lista_spesa_items ADD COLUMN {col} {tipo}")
            print(f"  [209] + lista_spesa_items.{col}")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_lista_spesa_articolo ON lista_spesa_items(articolo_id, fatto)")
