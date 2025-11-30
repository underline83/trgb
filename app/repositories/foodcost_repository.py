#!/usr/bin/env python3
# @version: v1.0-foodcost-repository
# -*- coding: utf-8 -*-
"""
TRGB — Foodcost Repository

Responsabilità:
- Accesso dati per:
  - elenco ingredienti con ultimo prezzo
  - riepilogo costi per singolo ingrediente

NON si occupa di:
- HTTP / FastAPI
- Response models
"""

from __future__ import annotations
from typing import List, Optional, Dict, Any

from app.models.foodcost_db import get_foodcost_connection


# ─────────────────────────────
#   LISTA INGREDIENTI + ULTIMO PREZZO
# ─────────────────────────────
def fetch_ingredients_with_last_price() -> List[Dict[str, Any]]:
    """
    Ritorna dizionari con:
        ingredient_id, ingredient_name, default_unit, last_price
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT 
            i.id AS ingredient_id,
            i.name AS ingredient_name,
            i.default_unit,
            (
                SELECT p.unit_price
                FROM ingredient_prices p
                WHERE p.ingredient_id = i.id
                ORDER BY date(p.price_date) DESC, p.id DESC
                LIMIT 1
            ) AS last_price
        FROM ingredients i
        WHERE i.is_active = 1
        ORDER BY i.name COLLATE NOCASE;
        """
    )
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ─────────────────────────────
#   DETTAGLIO COSTI INGREDIENTE
# ─────────────────────────────
def fetch_ingredient_cost_summary(ingredient_id: int) -> Optional[Dict[str, Any]]:
    """
    Ritorna un dict con:
        ingredient_id, ingredient_name, default_unit,
        last_price, avg_price_30d, avg_price_90d

    Se l'ingrediente non esiste → None
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    # Anagrafica ingrediente
    cur.execute(
        "SELECT id, name, default_unit FROM ingredients WHERE id = ?",
        (ingredient_id,),
    )
    ing = cur.fetchone()
    if not ing:
        conn.close()
        return None

    # Ultimo prezzo
    cur.execute(
        """
        SELECT unit_price
        FROM ingredient_prices
        WHERE ingredient_id = ?
        ORDER BY date(price_date) DESC, id DESC
        LIMIT 1
        """,
        (ingredient_id,),
    )
    last = cur.fetchone()
    last_price = last["unit_price"] if last else None

    # Media 30 giorni
    cur.execute(
        """
        SELECT AVG(unit_price) AS avg_price_30d
        FROM ingredient_prices
        WHERE ingredient_id = ?
          AND date(price_date) >= date('now', '-30 day')
        """,
        (ingredient_id,),
    )
    row_30 = cur.fetchone()
    avg_30 = row_30["avg_price_30d"] if row_30 and row_30["avg_price_30d"] is not None else None

    # Media 90 giorni
    cur.execute(
        """
        SELECT AVG(unit_price) AS avg_price_90d
        FROM ingredient_prices
        WHERE ingredient_id = ?
          AND date(price_date) >= date('now', '-90 day')
        """,
        (ingredient_id,),
    )
    row_90 = cur.fetchone()
    avg_90 = row_90["avg_price_90d"] if row_90 and row_90["avg_price_90d"] is not None else None

    conn.close()

    return {
        "ingredient_id": ing["id"],
        "ingredient_name": ing["name"],
        "default_unit": ing["default_unit"],
        "last_price": last_price,
        "avg_price_30d": avg_30,
        "avg_price_90d": avg_90,
    }
