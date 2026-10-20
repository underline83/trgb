"""
Migrazione 202 — Linea cucina, fase L1 (2026-10-20)

Modulo: cucina  ·  [core]  ·  Spec: docs/spec_linea_cucina.md

- cucina_articoli: + recipe_id (la preparazione che l'articolo e'),
  + scorta_min_frigo, + scorta_min_gelo, + qta_riordino. Nullable.
- Nuove: cucina_linea_elementi (dotazione in linea per articolo e partita),
  cucina_linea_voci_extra (voci di linea che non sono articoli).

Tutto in apply_schema() (IF NOT EXISTS + HEAL_COLUMNS): idempotente, lo
stesso codice fa da init difensivo al boot.
"""

import sqlite3

from app.models.cucina_scorte_db import apply_schema


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (dove vivono le tabelle cucina_*)."""
    apply_schema(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(cucina_articoli)")}
    print("  [202] cucina_articoli nuove colonne:",
          [c for c in ("recipe_id", "scorta_min_frigo", "scorta_min_gelo", "qta_riordino") if c in cols])
