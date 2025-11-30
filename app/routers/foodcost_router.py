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

from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.repositories.foodcost_repository import (
    fetch_ingredients_with_last_price,
    fetch_ingredient_cost_summary,
)

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
    rows = fetch_ingredients_with_last_price()

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
    data = fetch_ingredient_cost_summary(ingredient_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")

    return IngredientCostSummary(**data)
