#!/usr/bin/env python3
# @version: v1.0-foodcost-recipes-router
# -*- coding: utf-8 -*-

"""
Router ricette collegato a foodcost.db

Endpoint principali:
- GET  /foodcost/ricette         → lista ricette
- GET  /foodcost/ricette/{id}    → dettaglio con ingredienti
- POST /foodcost/ricette         → crea nuova ricetta + righe
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.models.foodcost_db import get_foodcost_connection

router = APIRouter()


# ─────────────────────────────
#  MODELLI Pydantic
# ─────────────────────────────

class RecipeItemIn(BaseModel):
    ingrediente_id: int
    qty: float
    unit: Optional[str] = None
    note: Optional[str] = None


class RecipeCreate(BaseModel):
    name: str
    category: Optional[str] = None
    yield_qty: Optional[float] = None
    yield_unit: Optional[str] = None
    notes: Optional[str] = None
    items: List[RecipeItemIn] = []


class RecipeListItem(BaseModel):
    id: int
    name: str
    category: Optional[str]
    yield_qty: Optional[float]
    yield_unit: Optional[str]
    is_active: int
    created_at: Optional[str]


class RecipeIngredientOut(BaseModel):
    id: int
    ingrediente_id: int
    ingredient_name: str
    qty: float
    unit: Optional[str]
    note: Optional[str]
    order_index: Optional[int]


class RecipeOut(BaseModel):
    id: int
    name: str
    category: Optional[str]
    yield_qty: Optional[float]
    yield_unit: Optional[str]
    notes: Optional[str]
    is_active: int
    created_at: Optional[str]
    items: List[RecipeIngredientOut] = []


# ─────────────────────────────
#  FUNZIONI DI SUPPORTO
# ─────────────────────────────

def _fetch_recipe(conn, recipe_id: int) -> RecipeOut:
    cur = conn.cursor()

    # header ricetta
    cur.execute(
        """
        SELECT id, name, category, yield_qty, yield_unit, notes, is_active, created_at
        FROM recipes
        WHERE id = ?
        """,
        (recipe_id,),
    )
    rec = cur.fetchone()
    if not rec:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    # righe ingredienti
    cur.execute(
        """
        SELECT
            ri.id,
            ri.ingredient_id,
            i.name AS ingredient_name,
            ri.qty,
            ri.unit,
            ri.note,
            ri.order_index
        FROM recipe_items ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.order_index ASC, ri.id ASC
        """,
        (recipe_id,),
    )
    rows = cur.fetchall()

    items = [
        RecipeIngredientOut(
            id=row["id"],
            ingrediente_id=row["ingredient_id"],
            ingredient_name=row["ingredient_name"],
            qty=row["qty"],
            unit=row["unit"],
            note=row["note"],
            order_index=row["order_index"],
        )
        for row in rows
    ]

    return RecipeOut(
        id=rec["id"],
        name=rec["name"],
        category=rec["category"],
        yield_qty=rec["yield_qty"],
        yield_unit=rec["yield_unit"],
        notes=rec["notes"],
        is_active=rec["is_active"],
        created_at=rec["created_at"],
        items=items,
    )


# ─────────────────────────────
#  ENDPOINTS
# ─────────────────────────────

@router.get("/ricette", response_model=List[RecipeListItem])
def list_ricette():
    """
    Lista ricette base (senza righe)
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, name, category, yield_qty, yield_unit, is_active, created_at
        FROM recipes
        ORDER BY created_at DESC, id DESC
        """
    )
    rows = cur.fetchall()
    conn.close()

    return [
        RecipeListItem(
            id=row["id"],
            name=row["name"],
            category=row["category"],
            yield_qty=row["yield_qty"],
            yield_unit=row["yield_unit"],
            is_active=row["is_active"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.get("/ricette/{recipe_id}", response_model=RecipeOut)
def get_ricetta(recipe_id: int):
    """
    Dettaglio ricetta + ingredienti collegati
    """
    conn = get_foodcost_connection()
    try:
        return _fetch_recipe(conn, recipe_id)
    finally:
        conn.close()


@router.post("/ricette", response_model=RecipeOut)
def create_ricetta(payload: RecipeCreate):
    """
    Crea una nuova ricetta con righe ingredienti.
    Payload allineato a RicetteNuova.jsx:
    {
      name, category, yield_qty, yield_unit, notes,
      items: [
        { ingrediente_id, qty, unit, note }
      ]
    }
    """
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Nome ricetta obbligatorio")

    conn = get_foodcost_connection()
    cur = conn.cursor()

    try:
        # 1) inserisco header ricetta
        cur.execute(
            """
            INSERT INTO recipes (name, category, yield_qty, yield_unit, notes, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            (
                payload.name.strip(),
                payload.category or None,
                payload.yield_qty,
                payload.yield_unit or None,
                payload.notes or None,
            ),
        )
        recipe_id = cur.lastrowid

        # 2) righe ingredienti
        order_index = 1
        for item in payload.items:
            cur.execute(
                """
                INSERT INTO recipe_items
                  (recipe_id, ingredient_id, qty, unit, note, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    recipe_id,
                    item.ingrediente_id,
                    item.qty,
                    item.unit or None,
                    item.note or None,
                    order_index,
                ),
            )
            order_index += 1

        conn.commit()

        # 3) ritorno ricetta completa
        return _fetch_recipe(conn, recipe_id)

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore salvataggio ricetta: {e}") from e
    finally:
        conn.close()