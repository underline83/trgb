#!/usr/bin/env python3
# @version: v1.2-foodcost-router
# -*- coding: utf-8 -*-
"""
Router principale per il **food cost**:

- Lista ingredienti con ultimo prezzo (per schermate riepilogo / selettori)
- Dettaglio costi per singolo ingrediente:
  - ultimo prezzo
  - media ultimi 30 giorni
  - media ultimi 90 giorni

DB: foodcost.db (vedi docs/database-foodcost.md)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from app.models.foodcost_db import get_foodcost_connection

# N.B.: il prefisso "/foodcost" viene aggiunto in main.py:
# app.include_router(foodcost_router.router, prefix="/foodcost", tags=["foodcost"])
router = APIRouter()


# ─────────────────────────────
#   SCHEMI Pydantic
# ─────────────────────────────

class IngredientCostItem(BaseModel):
    """
    Riga per elenco ingredienti con ultimo prezzo.
    Usata da:
    - GET /foodcost/ingredienti
    """
    ingredient_id: int
    ingredient_name: str
    default_unit: str
    last_price: Optional[float] = None


class IngredientCostSummary(BaseModel):
    """
    Riepilogo costi per singolo ingrediente.
    Usata da:
    - GET /foodcost/ingredient/{ingredient_id}
    """
    ingredient_id: int
    ingredient_name: str
    default_unit: str
    last_price: Optional[float] = None
    avg_price_30d: Optional[float] = None
    avg_price_90d: Optional[float] = None


# ─────────────────────────────
#   LISTA INGREDIENTI + ULTIMO PREZZO
#   GET /foodcost/ingredienti
# ─────────────────────────────
@router.get("/ingredienti", response_model=List[IngredientCostItem])
def list_ingredienti_con_prezzo():
    """
    Ritorna tutti gli ingredienti attivi con:
    - nome
    - unità base (default_unit)
    - ultimo prezzo registrato in ingredient_prices (se esiste)

    Ordinati alfabeticamente per nome.
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

    return [
        IngredientCostItem(
            ingredient_id=row["ingredient_id"],
            ingredient_name=row["ingredient_name"],
            default_unit=row["default_unit"],
            last_price=row["last_price"],
        )
        for row in rows
    ]


# ─────────────────────────────
#   DETTAGLIO COSTI INGREDIENTE
#   GET /foodcost/ingredient/{ingredient_id}
# ─────────────────────────────
@router.get("/ingredient/{ingredient_id}", response_model=IngredientCostSummary)
def get_ingredient_cost_summary(ingredient_id: int):
    """
    Riassunto costi per singolo ingrediente:
    - ultimo prezzo registrato
    - media ultimi 30 giorni
    - media ultimi 90 giorni
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
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")

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

    return IngredientCostSummary(
        ingredient_id=ing["id"],
        ingredient_name=ing["name"],
        default_unit=ing["default_unit"],
        last_price=last_price,
        avg_price_30d=avg_30,
        avg_price_90d=avg_90,
    )