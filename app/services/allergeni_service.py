#!/usr/bin/env python3
# @version: v1.0-allergeni-recursive (Modulo C, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Servizio calcolo allergeni ricette (Modulo C audit cucina).

Pipeline:
    ingredients.allergeni  →  recipes.allergeni_calcolati  →  menu_dish_publications.allergeni_dichiarati

- `ingredients.allergeni` (TEXT CSV) e' la sorgente primaria dichiarata dall'utente
  in fase di anagrafica ingrediente.
- `recipes.allergeni_calcolati` (TEXT CSV) e' la cache ricorsiva: unione degli
  allergeni di tutti gli ingredienti diretti + degli allergeni di tutte le
  sub-ricette (recipe_items.sub_recipe_id), senza ricorsione infinita su cicli.
- `menu_dish_publications.allergeni_dichiarati` (TEXT CSV) e' l'override
  per-pubblicazione: il sommelier/chef puo' sovrascrivere se una preparazione
  speciale ha allergeni diversi da quelli ereditati dalla ricetta.

Trigger di ricalcolo:
- Automatico in POST/PUT ricetta (modifica items)
- On-demand via endpoint POST /foodcost/ricette/{id}/ricalcola-allergeni
- Batch via endpoint POST /foodcost/ricette/ricalcola-allergeni-tutti

Format CSV: lowercase, separato da virgola, ordinato alfabeticamente.
Esempio: "glutine,latte,uova,sedano".

Allergeni standard UE Reg. 1169/2011 (14 categorie):
  glutine, crostacei, uova, pesce, arachidi, soia, latte, frutta a guscio,
  sedano, senape, sesamo, anidride solforosa e solfiti, lupini, molluschi.

Il service NON valida che gli allergeni siano nella lista UE (campo libero
in ingredients.allergeni). Marco potrebbe usare termini abbreviati ("solfiti"
invece di "anidride solforosa e solfiti") — il service rispetta cio' che trova.
"""
from __future__ import annotations

from typing import Optional, Set, List, Dict, Any

from app.models.foodcost_db import get_foodcost_connection


# ─────────────────────────────────────────────────────────────
# Helpers parsing CSV
# ─────────────────────────────────────────────────────────────
def parse_allergeni_csv(s: Optional[str]) -> Set[str]:
    """
    Parse CSV allergeni → set normalizzato.
    'Glutine, Latte ' → {'glutine', 'latte'}.
    None / '' / whitespace → set vuoto.
    """
    if not s:
        return set()
    return {a.strip().lower() for a in s.split(",") if a.strip()}


def format_allergeni_csv(allergeni: Set[str]) -> str:
    """
    Set → CSV ordinato alfabeticamente.
    Set vuoto → stringa vuota (non None) per coerenza display nel FE.
    """
    return ",".join(sorted(allergeni)) if allergeni else ""


# ─────────────────────────────────────────────────────────────
# Calcolo ricorsivo
# ─────────────────────────────────────────────────────────────
def compute_recipe_allergens(
    recipe_id: int,
    conn=None,
    _visited: Optional[Set[int]] = None,
) -> Set[str]:
    """
    Calcola ricorsivamente l'unione degli allergeni di una ricetta.

    Per ogni recipe_items della ricetta:
      - se ingredient_id valorizzato → leggi ingredients.allergeni e mergia
      - se sub_recipe_id valorizzato → ricorri (compute_recipe_allergens)

    Protezione cicli: _visited tiene traccia delle ricette gia' visitate nella
    catena ricorsiva corrente. Se un sub_recipe_id punta a una ricetta gia'
    visitata, ritorna empty set per quel ramo (no loop infinito, no eccezione).

    Connection sharing: se `conn` e' fornita, riusa (evita open/close per ogni
    nodo della ricorsione). Se None, apre una nuova connection scoped.
    """
    own_conn = conn is None
    if own_conn:
        conn = get_foodcost_connection()
    if _visited is None:
        _visited = set()
    if recipe_id in _visited:
        return set()  # ciclo rilevato → ramo abortito
    _visited = _visited | {recipe_id}

    try:
        out: Set[str] = set()
        rows = conn.execute(
            "SELECT ingredient_id, sub_recipe_id FROM recipe_items WHERE recipe_id = ?",
            (recipe_id,),
        ).fetchall()
        for r in rows:
            ing_id = r["ingredient_id"]
            sub_id = r["sub_recipe_id"]
            if ing_id:
                ing_row = conn.execute(
                    "SELECT allergeni FROM ingredients WHERE id = ?",
                    (ing_id,),
                ).fetchone()
                if ing_row:
                    out |= parse_allergeni_csv(ing_row["allergeni"])
            elif sub_id:
                out |= compute_recipe_allergens(sub_id, conn=conn, _visited=_visited)
        return out
    finally:
        if own_conn:
            conn.close()


# ─────────────────────────────────────────────────────────────
# Update cache su DB
# ─────────────────────────────────────────────────────────────
def update_recipe_allergens_cache(recipe_id: int, conn=None) -> str:
    """
    Calcola allergeni della ricetta e salva in recipes.allergeni_calcolati.
    Ritorna il CSV salvato (puo' essere stringa vuota).

    Idempotente: se ricalcolato due volte di fila, il risultato e' lo stesso.
    """
    own_conn = conn is None
    if own_conn:
        conn = get_foodcost_connection()
    try:
        allergeni = compute_recipe_allergens(recipe_id, conn=conn)
        csv = format_allergeni_csv(allergeni)
        conn.execute(
            """UPDATE recipes
                  SET allergeni_calcolati = ?,
                      updated_at = datetime('now', 'localtime')
                WHERE id = ?""",
            (csv, recipe_id),
        )
        if own_conn:
            conn.commit()
        return csv
    finally:
        if own_conn:
            conn.close()


def recompute_all_recipes_allergens() -> Dict[str, Any]:
    """
    Ricalcola allergeni per tutte le ricette attive.
    Job batch: utile dopo modifica massiva ingredienti.allergeni.

    Ritorna stats:
      - totale_ricette: numero di ricette processate
      - con_allergeni: ricette che hanno almeno 1 allergene
      - senza_allergeni: ricette pulite (set vuoto)
      - dettaglio: lista dicts {id, name, allergeni_calcolati}
    """
    conn = get_foodcost_connection()
    try:
        rows = conn.execute(
            "SELECT id, name FROM recipes WHERE is_active = 1 ORDER BY id"
        ).fetchall()
        dettaglio: List[Dict[str, Any]] = []
        n_con = 0
        n_senza = 0
        for r in rows:
            csv = update_recipe_allergens_cache(r["id"], conn=conn)
            dettaglio.append({"id": r["id"], "name": r["name"], "allergeni_calcolati": csv})
            if csv:
                n_con += 1
            else:
                n_senza += 1
        conn.commit()
        return {
            "totale_ricette": len(rows),
            "con_allergeni": n_con,
            "senza_allergeni": n_senza,
            "dettaglio": dettaglio,
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Helpers usabili da altri moduli (es. menu carta publication)
# ─────────────────────────────────────────────────────────────
def get_allergeni_for_recipe(recipe_id: int) -> str:
    """
    Restituisce il CSV allergeni cached della ricetta (read-only, no ricalcolo).
    Wrapper per consumer che vogliono leggere senza pensare alla connection.
    """
    conn = get_foodcost_connection()
    try:
        row = conn.execute(
            "SELECT allergeni_calcolati FROM recipes WHERE id = ?",
            (recipe_id,),
        ).fetchone()
        return (row["allergeni_calcolati"] if row and row["allergeni_calcolati"] else "")
    finally:
        conn.close()
