#!/usr/bin/env python3
# @version: v0.1
# -*- coding: utf-8 -*-
"""
TRE GOBBI — API Ricette & Ingredienti
────────────────────────────────────────
- Ingredienti (master condiviso)
- Ricette (CRUD)
- Import/Export JSON formato TRGB
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any, Dict

from app.models.ricette_db import (
    init_ricette_db,
    search_ingredients,
    create_ingredient,
    get_ingredient,
    list_recipes,
    get_recipe_full,
    create_or_update_recipe,
    delete_recipe,
)

router = APIRouter()


# ─────────────────────────────────────────────────────────
# Pydantic models (per typing & validation di base)
# ─────────────────────────────────────────────────────────

class IngredientCreate(BaseModel):
    name: str
    code: Optional[str] = None
    category: Optional[str] = None
    unit_default: Optional[str] = None
    yield_factor: float = 1.0
    last_price: Optional[float] = None
    last_price_unit: Optional[str] = None
    supplier_default: Optional[str] = None


class RecipeMetadata(BaseModel):
    name: str
    code: Optional[str] = None
    category: Optional[str] = None
    portion_yield: Optional[float] = None
    unit_portion: Optional[str] = None
    status: Optional[str] = "draft"
    version: Optional[str] = "v1"
    notes: Optional[str] = None


class RecipeIngredientItem(BaseModel):
    type: str = "ingredient"  # "ingredient" | "sub_recipe"
    ingredient_id: Optional[int] = None
    sub_recipe_id: Optional[int] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    note: Optional[str] = None


class RecipePayload(BaseModel):
    metadata: RecipeMetadata
    ingredients: List[RecipeIngredientItem] = []
    steps: List[str] = []


# ─────────────────────────────────────────────────────────
# INIT DB (puoi richiamarlo all'avvio del main)
# ─────────────────────────────────────────────────────────

@router.on_event("startup")
def _startup_init():
    init_ricette_db()


# ─────────────────────────────────────────────────────────
# INGREDIENTI
# ─────────────────────────────────────────────────────────

@router.get("/ingredients")
def api_list_ingredients(q: Optional[str] = None, limit: int = 50) -> list[dict]:
    return search_ingredients(q, limit)


@router.post("/ingredients")
def api_create_ingredient(body: IngredientCreate) -> dict:
    return create_ingredient(body.dict())


@router.get("/ingredients/{ingredient_id}")
def api_get_ingredient(ingredient_id: int) -> dict:
    ing = get_ingredient(ingredient_id)
    if not ing:
        raise HTTPException(404, "Ingrediente non trovato")
    return ing


# ─────────────────────────────────────────────────────────
# RICETTE
# ─────────────────────────────────────────────────────────

@router.get("/recipes")
def api_list_recipes() -> list[dict]:
    return list_recipes()


@router.get("/recipes/{recipe_id}")
def api_get_recipe(recipe_id: int) -> dict:
    rec = get_recipe_full(recipe_id)
    if not rec:
        raise HTTPException(404, "Ricetta non trovata")
    return rec


@router.post("/recipes")
def api_create_recipe(body: RecipePayload) -> dict:
    recipe_id = create_or_update_recipe(body.dict(), recipe_id=None)
    rec = get_recipe_full(recipe_id)
    return rec


@router.put("/recipes/{recipe_id}")
def api_update_recipe(recipe_id: int, body: RecipePayload) -> dict:
    # verifica esistenza
    rec = get_recipe_full(recipe_id)
    if not rec:
        raise HTTPException(404, "Ricetta non trovata")

    recipe_id = create_or_update_recipe(body.dict(), recipe_id=recipe_id)
    rec = get_recipe_full(recipe_id)
    return rec


@router.delete("/recipes/{recipe_id}")
def api_delete_recipe(recipe_id: int) -> dict:
    rec = get_recipe_full(recipe_id)
    if not rec:
        raise HTTPException(404, "Ricetta non trovata")
    delete_recipe(recipe_id)
    return {"status": "ok", "deleted_id": recipe_id}


# ─────────────────────────────────────────────────────────
# IMPORT / EXPORT JSON (formato TRGB)
# ─────────────────────────────────────────────────────────

@router.post("/recipes/import_json")
def api_import_recipe_from_json(body: Dict[str, Any]) -> dict:
    """
    Accetta un JSON nel formato TRGB (metadata/ingredients/steps)
    e crea una nuova ricetta (o in futuro potrà aggiornare per code).
    """
    payload = RecipePayload(**body)
    recipe_id = create_or_update_recipe(payload.dict(), recipe_id=None)
    return get_recipe_full(recipe_id)


@router.get("/recipes/{recipe_id}/export_json")
def api_export_recipe_to_json(recipe_id: int) -> dict:
    rec = get_recipe_full(recipe_id)
    if not rec:
        raise HTTPException(404, "Ricetta non trovata")

    # mappa DB -> formato TRGB
    metadata = {
        "code": rec.get("recipe_code"),
        "name": rec.get("name"),
        "category": rec.get("category"),
        "portion_yield": rec.get("portion_yield"),
        "unit_portion": rec.get("unit_portion"),
        "status": rec.get("status"),
        "version": rec.get("version"),
        "notes": rec.get("notes"),
    }

    ingredients = []
    for it in rec.get("items", []):
        if it["sub_recipe_id"]:
            ingredients.append(
                {
                    "type": "sub_recipe",
                    "sub_recipe_id": it["sub_recipe_id"],
                    "quantity": it["quantity"],
                    "unit": it["unit"],
                    "note": it["note"],
                }
            )
        else:
            ingredients.append(
                {
                    "type": "ingredient",
                    "ingredient_id": it["ingredient_id"],
                    "quantity": it["quantity"],
                    "unit": it["unit"],
                    "note": it["note"],
                }
            )

    steps = [s["text"] for s in rec.get("steps", [])]

    return {
        "metadata": metadata,
        "ingredients": ingredients,
        "steps": steps,
    }