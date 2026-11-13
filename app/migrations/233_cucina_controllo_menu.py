"""
Migrazione 233 — Controllo menu: porzioni realizzabili per piatto (2026-11-13)

Modulo: cucina  ·  [core]  ·  Doc: docs/spec_linea_cucina.md §10

Marco: «una pagina di controllo del menu, che guardi frigoriferi, ricette,
checklist e mi dica per ogni piatto le quantita' realizzabili».

Le ricette sono in g/ml a porzione, le scorte in pezzi (buste, vaschette): per
passare dai pezzi alle porzioni serve un numero che oggi non c'e'.

- cucina_menu_elementi (nuova): per (piatto, elemento della ricetta)
  `porzioni_per_pezzo`; con `recipe_id = 0` il flag `non_limita` che vale per
  tutti i piatti (sale, olio). Nessun dato iniziale: si compila dalla pagina.
"""

import sqlite3

from app.models.cucina_scorte_db import apply_schema


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    apply_schema(conn)
    print("  [233] cucina_menu_elementi pronta")
