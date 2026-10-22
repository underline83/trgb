"""
Migrazione 208 — Linea cucina: dotazione in linea come numero (2026-10-23)

Modulo: cucina  ·  [core]  ·  Spec: docs/spec_linea_cucina.md §5.1

Marco, davanti al frigo: verde conferma anche il numero (la dotazione), giallo
e rosso fanno scrivere quante ne ho, «cosi' so quanto rimpiazzare».

- cucina_linea_elementi.linea_qta_num REAL NULL — la dotazione come numero.
- Riempimento iniziale dal testo `linea_qta`: il primo numero, solo se il testo
  e' una cosa sola («6 scongelate» → 6, «2 kg (circa 200 pezzi)» → 2,
  «300 g» → 300). Testi composti («1 sifone + 1 busta», «GN 1/9 + pentolino»)
  e senza numero restano NULL: si contano a occhio, o si mette il numero dalla
  scheda Linea. Non sovrascrive un numero gia' messo.
"""

import sqlite3

from app.models.cucina_scorte_db import apply_schema, numero_dotazione as numero_da_testo


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    apply_schema(conn)
    righe = conn.execute(
        "SELECT id, linea_qta FROM cucina_linea_elementi WHERE linea_qta_num IS NULL"
    ).fetchall()
    n = 0
    for r in righe:
        v = numero_da_testo(r[1])
        if v is not None:
            conn.execute("UPDATE cucina_linea_elementi SET linea_qta_num = ? WHERE id = ?", (v, r[0]))
            n += 1
    print(f"  [208] cucina_linea_elementi.linea_qta_num: {n} righe riempite dal testo")
