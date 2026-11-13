"""
Migrazione 234 — Controllo menu: «dal gelo diretto» (2026-11-13)

Modulo: cucina  ·  [core]  ·  Doc: docs/spec_linea_cucina.md §10

Marco: pure', lasagnetta e coniglio stanno in gelo e vanno scongelati; i
casoncelli vanno dal congelatore alla pentola. Per questi il numero «subito»
a zero era sbagliato.

- cucina_articoli.contenuto_qta REAL / contenuto_um TEXT (g | ml | pz | porz) — quanto
  contiene una unita' di scorta. Marco: «se sistemo le porzioni per pezzo nel
  controllo menu salvale negli articoli, tieni tutto linkato»: il numero
  scritto su un piatto diventa il contenuto dell'articolo e vale per tutti i
  piatti che lo usano.
- cucina_menu_elementi.gelo_diretto INTEGER NULL — sulla riga che vale per
  tutti i piatti (recipe_id = 0), come `non_limita`: 1 = il gelo conta gia'
  nel numero «subito». Nessun dato iniziale: si spunta dalla pagina.
"""

import sqlite3

from app.models.cucina_scorte_db import apply_schema


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    apply_schema(conn)
    print("  [234] cucina_articoli.contenuto_qta/um e cucina_menu_elementi.gelo_diretto pronte")
