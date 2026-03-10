#!/usr/bin/env python3
# @version: v2.0-foodcost-recipes-router
# -*- coding: utf-8 -*-

"""
Router ricette — Food Cost v2

Funzionalità:
- CRUD ricette con supporto sub-ricette
- Calcolo food cost ricorsivo (ingrediente + sub-ricetta a cascata)
- Categorie ricette configurabili
- Costo porzione + % su prezzo di vendita

Endpoint:
  GET    /foodcost/ricette                → lista ricette con food cost
  GET    /foodcost/ricette/{id}           → dettaglio + costi calcolati
  POST   /foodcost/ricette                → crea ricetta
  PUT    /foodcost/ricette/{id}           → aggiorna ricetta
  DELETE /foodcost/ricette/{id}           → disattiva ricetta
  GET    /foodcost/ricette/categorie      → lista categorie ricetta
  POST   /foodcost/ricette/categorie      → crea categoria ricetta
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


# ─────────────────────────────────────────────
#   MODELLI Pydantic
# ─────────────────────────────────────────────

class RecipeCategoryOut(BaseModel):
    id: int
    name: str
    sort_order: int = 0


class RecipeCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    sort_order: int = 0


class RecipeItemIn(BaseModel):
    ingredient_id: Optional[int] = None
    sub_recipe_id: Optional[int] = None
    qty: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1)
    note: Optional[str] = None


class RecipeCreate(BaseModel):
    name: str = Field(..., min_length=1)
    category_id: Optional[int] = None
    is_base: bool = False
    yield_qty: float = Field(..., gt=0)
    yield_unit: str = Field(..., min_length=1)
    selling_price: Optional[float] = None
    prep_time: Optional[int] = None
    note: Optional[str] = None
    items: List[RecipeItemIn] = []


class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    is_base: Optional[bool] = None
    yield_qty: Optional[float] = None
    yield_unit: Optional[str] = None
    selling_price: Optional[float] = None
    prep_time: Optional[int] = None
    note: Optional[str] = None
    items: Optional[List[RecipeItemIn]] = None


class RecipeItemOut(BaseModel):
    id: int
    ingredient_id: Optional[int] = None
    ingredient_name: Optional[str] = None
    sub_recipe_id: Optional[int] = None
    sub_recipe_name: Optional[str] = None
    qty: float
    unit: str
    sort_order: int = 0
    note: Optional[str] = None
    # Food cost calcolati
    unit_cost: Optional[float] = None    # costo per unità base dell'ingrediente/sub-ricetta
    line_cost: Optional[float] = None    # costo di questa riga (qty × unit_cost convertito)


class RecipeOut(BaseModel):
    id: int
    name: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    is_base: bool = False
    yield_qty: float
    yield_unit: str
    selling_price: Optional[float] = None
    prep_time: Optional[int] = None
    note: Optional[str] = None
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    items: List[RecipeItemOut] = []
    # Food cost calcolati
    total_cost: Optional[float] = None         # costo totale ricetta
    cost_per_unit: Optional[float] = None      # costo per unità di resa (€/porzione, €/kg)
    food_cost_pct: Optional[float] = None      # % food cost su selling_price


class RecipeListItem(BaseModel):
    id: int
    name: str
    category_name: Optional[str] = None
    is_base: bool = False
    yield_qty: float
    yield_unit: str
    selling_price: Optional[float] = None
    is_active: bool = True
    total_cost: Optional[float] = None
    cost_per_unit: Optional[float] = None
    food_cost_pct: Optional[float] = None


# ─────────────────────────────────────────────
#   CONVERSIONE UNITÀ
# ─────────────────────────────────────────────

# Fattori di conversione verso l'unità base (kg per peso, L per liquidi)
UNIT_TO_BASE = {
    "kg": 1.0,
    "g": 0.001,
    "mg": 0.000001,
    "L": 1.0,
    "l": 1.0,
    "ml": 0.001,
    "cl": 0.01,
    "pz": 1.0,
}


def convert_qty(qty: float, from_unit: str, to_unit: str) -> Optional[float]:
    """
    Converte una quantità da from_unit a to_unit.
    Ritorna None se la conversione non è possibile (unità incompatibili).
    """
    fu = from_unit.strip().lower()
    tu = to_unit.strip().lower()

    if fu == tu:
        return qty

    f_base = UNIT_TO_BASE.get(fu)
    t_base = UNIT_TO_BASE.get(tu)

    if f_base is None or t_base is None:
        return None

    # Verifica compatibilità (peso con peso, volume con volume)
    weight_units = {"kg", "g", "mg"}
    volume_units = {"l", "ml", "cl"}

    fu_is_weight = fu in weight_units
    fu_is_volume = fu in volume_units
    tu_is_weight = tu in weight_units
    tu_is_volume = tu in volume_units

    if fu_is_weight != tu_is_weight and fu_is_volume != tu_is_volume:
        # pz → pz è ok, peso → volume no
        if fu == "pz" and tu == "pz":
            return qty
        return None

    return qty * f_base / t_base


# ─────────────────────────────────────────────
#   CALCOLO FOOD COST (ricorsivo)
# ─────────────────────────────────────────────

def _get_ingredient_unit_cost(cur, ingredient_id: int) -> Optional[float]:
    """Ritorna l'ultimo prezzo unitario (€/unità_base) di un ingrediente."""
    row = cur.execute(
        """
        SELECT unit_price
        FROM ingredient_prices
        WHERE ingredient_id = ?
        ORDER BY date(price_date) DESC, id DESC
        LIMIT 1
        """,
        (ingredient_id,),
    ).fetchone()
    return row["unit_price"] if row else None


def _get_ingredient_default_unit(cur, ingredient_id: int) -> Optional[str]:
    """Ritorna la default_unit di un ingrediente."""
    row = cur.execute(
        "SELECT default_unit FROM ingredients WHERE id = ?",
        (ingredient_id,),
    ).fetchone()
    return row["default_unit"] if row else None


def _calc_recipe_cost(
    cur,
    recipe_id: int,
    visited: Optional[Set[int]] = None,
) -> Optional[float]:
    """
    Calcola il costo totale di una ricetta, risolvendo ricorsivamente le sub-ricette.

    visited: set di recipe_id già visitati per evitare cicli infiniti.
    Ritorna None se non è possibile calcolare (ingredienti senza prezzo).
    """
    if visited is None:
        visited = set()

    if recipe_id in visited:
        return None  # ciclo rilevato
    visited.add(recipe_id)

    items = cur.execute(
        """
        SELECT ri.ingredient_id, ri.sub_recipe_id, ri.qty, ri.unit
        FROM recipe_items ri
        WHERE ri.recipe_id = ?
        ORDER BY ri.sort_order, ri.id
        """,
        (recipe_id,),
    ).fetchall()

    total = 0.0
    all_priced = True

    for item in items:
        line_cost = _calc_item_cost(cur, item, visited)
        if line_cost is not None:
            total += line_cost
        else:
            all_priced = False

    return total if total > 0 or all_priced else None


def _calc_item_cost(cur, item, visited: Set[int]) -> Optional[float]:
    """Calcola il costo di una singola riga ricetta."""
    qty = item["qty"]
    unit = item["unit"]

    if item["ingredient_id"]:
        # Ingrediente base
        unit_cost = _get_ingredient_unit_cost(cur, item["ingredient_id"])
        if unit_cost is None:
            return None

        default_unit = _get_ingredient_default_unit(cur, item["ingredient_id"])
        if default_unit is None:
            return None

        # Converti qty nell'unità base dell'ingrediente
        converted = convert_qty(qty, unit, default_unit)
        if converted is None:
            # Unità incompatibili — usa qty direttamente (es. "pz")
            return qty * unit_cost

        return converted * unit_cost

    elif item["sub_recipe_id"]:
        # Sub-ricetta — calcolo ricorsivo
        sub_cost = _calc_recipe_cost(cur, item["sub_recipe_id"], visited.copy())
        if sub_cost is None:
            return None

        # Resa della sub-ricetta
        sub = cur.execute(
            "SELECT yield_qty, yield_unit FROM recipes WHERE id = ?",
            (item["sub_recipe_id"],),
        ).fetchone()
        if not sub or not sub["yield_qty"]:
            return None

        cost_per_yield_unit = sub_cost / sub["yield_qty"]

        # Converti la qty richiesta nell'unità di resa della sub-ricetta
        converted = convert_qty(qty, unit, sub["yield_unit"])
        if converted is None:
            return qty * cost_per_yield_unit

        return converted * cost_per_yield_unit

    return None


def _enrich_recipe_with_costs(cur, recipe: dict) -> dict:
    """Aggiunge i campi food cost calcolati a un dict ricetta."""
    recipe_id = recipe["id"]

    total_cost = _calc_recipe_cost(cur, recipe_id)
    recipe["total_cost"] = round(total_cost, 4) if total_cost is not None else None

    if total_cost is not None and recipe.get("yield_qty"):
        cpu = total_cost / recipe["yield_qty"]
        recipe["cost_per_unit"] = round(cpu, 4)
    else:
        recipe["cost_per_unit"] = None

    if (
        recipe["cost_per_unit"] is not None
        and recipe.get("selling_price")
        and recipe["selling_price"] > 0
    ):
        recipe["food_cost_pct"] = round(
            (recipe["cost_per_unit"] / recipe["selling_price"]) * 100, 2
        )
    else:
        recipe["food_cost_pct"] = None

    return recipe


def _enrich_items_with_costs(cur, items: list) -> list:
    """Aggiunge unit_cost e line_cost a ogni item."""
    result = []
    for item in items:
        d = dict(item)

        if item["ingredient_id"]:
            unit_cost = _get_ingredient_unit_cost(cur, item["ingredient_id"])
            d["unit_cost"] = round(unit_cost, 4) if unit_cost is not None else None

            if unit_cost is not None:
                default_unit = _get_ingredient_default_unit(cur, item["ingredient_id"])
                converted = convert_qty(item["qty"], item["unit"], default_unit) if default_unit else None
                if converted is not None:
                    d["line_cost"] = round(converted * unit_cost, 4)
                else:
                    d["line_cost"] = round(item["qty"] * unit_cost, 4)
            else:
                d["line_cost"] = None

        elif item["sub_recipe_id"]:
            sub_cost = _calc_recipe_cost(cur, item["sub_recipe_id"])
            sub = cur.execute(
                "SELECT yield_qty, yield_unit FROM recipes WHERE id = ?",
                (item["sub_recipe_id"],),
            ).fetchone()

            if sub_cost is not None and sub and sub["yield_qty"]:
                cpu = sub_cost / sub["yield_qty"]
                d["unit_cost"] = round(cpu, 4)
                converted = convert_qty(item["qty"], item["unit"], sub["yield_unit"])
                if converted is not None:
                    d["line_cost"] = round(converted * cpu, 4)
                else:
                    d["line_cost"] = round(item["qty"] * cpu, 4)
            else:
                d["unit_cost"] = None
                d["line_cost"] = None
        else:
            d["unit_cost"] = None
            d["line_cost"] = None

        result.append(d)
    return result


# ─────────────────────────────────────────────
#   FUNZIONI DB
# ─────────────────────────────────────────────

def _fetch_recipe_full(conn, recipe_id: int) -> RecipeOut:
    """Carica ricetta + items con food cost calcolati."""
    cur = conn.cursor()

    rec = cur.execute(
        """
        SELECT r.*, rc.name AS category_name
        FROM recipes r
        LEFT JOIN recipe_categories rc ON rc.id = r.category_id
        WHERE r.id = ?
        """,
        (recipe_id,),
    ).fetchone()

    if not rec:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    # Items con nomi ingrediente/sub-ricetta
    items_raw = cur.execute(
        """
        SELECT
            ri.id, ri.ingredient_id, ri.sub_recipe_id,
            ri.qty, ri.unit, ri.sort_order, ri.note,
            i.name AS ingredient_name,
            sr.name AS sub_recipe_name
        FROM recipe_items ri
        LEFT JOIN ingredients i ON i.id = ri.ingredient_id
        LEFT JOIN recipes sr ON sr.id = ri.sub_recipe_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.sort_order, ri.id
        """,
        (recipe_id,),
    ).fetchall()

    # Arricchisci con costi
    rec_dict = dict(rec)
    rec_dict = _enrich_recipe_with_costs(cur, rec_dict)

    items_enriched = _enrich_items_with_costs(cur, items_raw)

    return RecipeOut(
        id=rec_dict["id"],
        name=rec_dict["name"],
        category_id=rec_dict["category_id"],
        category_name=rec_dict.get("category_name"),
        is_base=bool(rec_dict["is_base"]),
        yield_qty=rec_dict["yield_qty"],
        yield_unit=rec_dict["yield_unit"],
        selling_price=rec_dict.get("selling_price"),
        prep_time=rec_dict.get("prep_time"),
        note=rec_dict.get("note"),
        is_active=bool(rec_dict["is_active"]),
        created_at=rec_dict.get("created_at"),
        updated_at=rec_dict.get("updated_at"),
        items=[
            RecipeItemOut(
                id=it["id"],
                ingredient_id=it.get("ingredient_id"),
                ingredient_name=it.get("ingredient_name"),
                sub_recipe_id=it.get("sub_recipe_id"),
                sub_recipe_name=it.get("sub_recipe_name"),
                qty=it["qty"],
                unit=it["unit"],
                sort_order=it.get("sort_order", 0),
                note=it.get("note"),
                unit_cost=it.get("unit_cost"),
                line_cost=it.get("line_cost"),
            )
            for it in items_enriched
        ],
        total_cost=rec_dict.get("total_cost"),
        cost_per_unit=rec_dict.get("cost_per_unit"),
        food_cost_pct=rec_dict.get("food_cost_pct"),
    )


# ─────────────────────────────────────────────
#   ENDPOINT: CATEGORIE RICETTE
# ─────────────────────────────────────────────

@router.get("/ricette/categorie", response_model=List[RecipeCategoryOut])
def list_recipe_categories():
    conn = get_foodcost_connection()
    rows = conn.execute(
        "SELECT id, name, sort_order FROM recipe_categories ORDER BY sort_order, name"
    ).fetchall()
    conn.close()
    return [RecipeCategoryOut(**dict(r)) for r in rows]


@router.post("/ricette/categorie", response_model=RecipeCategoryOut)
def create_recipe_category(payload: RecipeCategoryCreate):
    conn = get_foodcost_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id, name, sort_order FROM recipe_categories WHERE name = ?",
        (payload.name.strip(),),
    ).fetchone()
    if existing:
        conn.close()
        return RecipeCategoryOut(**dict(existing))

    cur.execute(
        "INSERT INTO recipe_categories (name, sort_order) VALUES (?, ?)",
        (payload.name.strip(), payload.sort_order),
    )
    new_id = cur.lastrowid
    conn.commit()

    row = cur.execute(
        "SELECT id, name, sort_order FROM recipe_categories WHERE id = ?",
        (new_id,),
    ).fetchone()
    conn.close()
    return RecipeCategoryOut(**dict(row))


# ─────────────────────────────────────────────
#   ENDPOINT: LISTA RICETTE (con food cost)
# ─────────────────────────────────────────────

@router.get("/ricette", response_model=List[RecipeListItem])
def list_ricette(
    solo_basi: bool = False,
    solo_piatti: bool = False,
):
    """Lista ricette con food cost calcolato in tempo reale."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    where = "WHERE r.is_active = 1"
    if solo_basi:
        where += " AND r.is_base = 1"
    elif solo_piatti:
        where += " AND r.is_base = 0"

    rows = cur.execute(
        f"""
        SELECT r.id, r.name, r.is_base, r.yield_qty, r.yield_unit,
               r.selling_price, r.is_active,
               rc.name AS category_name
        FROM recipes r
        LEFT JOIN recipe_categories rc ON rc.id = r.category_id
        {where}
        ORDER BY rc.sort_order, r.name COLLATE NOCASE
        """
    ).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        d = _enrich_recipe_with_costs(cur, d)
        result.append(RecipeListItem(
            id=d["id"],
            name=d["name"],
            category_name=d.get("category_name"),
            is_base=bool(d["is_base"]),
            yield_qty=d["yield_qty"],
            yield_unit=d["yield_unit"],
            selling_price=d.get("selling_price"),
            is_active=bool(d["is_active"]),
            total_cost=d.get("total_cost"),
            cost_per_unit=d.get("cost_per_unit"),
            food_cost_pct=d.get("food_cost_pct"),
        ))

    conn.close()
    return result


# ─────────────────────────────────────────────
#   ENDPOINT: DETTAGLIO RICETTA
# ─────────────────────────────────────────────

@router.get("/ricette/{recipe_id}", response_model=RecipeOut)
def get_ricetta(recipe_id: int):
    conn = get_foodcost_connection()
    try:
        return _fetch_recipe_full(conn, recipe_id)
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: CREA RICETTA
# ─────────────────────────────────────────────

@router.post("/ricette", response_model=RecipeOut)
def create_ricetta(payload: RecipeCreate):
    # Validazione items
    for i, item in enumerate(payload.items):
        if not item.ingredient_id and not item.sub_recipe_id:
            raise HTTPException(
                status_code=400,
                detail=f"Riga {i+1}: specificare ingredient_id o sub_recipe_id",
            )
        if item.ingredient_id and item.sub_recipe_id:
            raise HTTPException(
                status_code=400,
                detail=f"Riga {i+1}: non specificare sia ingredient_id che sub_recipe_id",
            )

    now = datetime.utcnow().isoformat()
    conn = get_foodcost_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            INSERT INTO recipes (name, category_id, is_base, yield_qty, yield_unit,
                                 selling_price, prep_time, note, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                payload.name.strip(),
                payload.category_id,
                1 if payload.is_base else 0,
                payload.yield_qty,
                payload.yield_unit.strip(),
                payload.selling_price,
                payload.prep_time,
                payload.note,
                now,
                now,
            ),
        )
        recipe_id = cur.lastrowid

        for idx, item in enumerate(payload.items):
            cur.execute(
                """
                INSERT INTO recipe_items (recipe_id, ingredient_id, sub_recipe_id,
                                          qty, unit, sort_order, note, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    recipe_id,
                    item.ingredient_id,
                    item.sub_recipe_id,
                    item.qty,
                    item.unit.strip(),
                    idx + 1,
                    item.note,
                    now,
                ),
            )

        conn.commit()
        return _fetch_recipe_full(conn, recipe_id)

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore salvataggio: {e}") from e
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: AGGIORNA RICETTA
# ─────────────────────────────────────────────

@router.put("/ricette/{recipe_id}", response_model=RecipeOut)
def update_ricetta(recipe_id: int, payload: RecipeUpdate):
    now = datetime.utcnow().isoformat()
    conn = get_foodcost_connection()
    cur = conn.cursor()

    # Verifica che esista
    existing = cur.execute("SELECT id FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    try:
        # Aggiorna campi header (solo quelli forniti)
        updates = []
        params = []
        field_map = {
            "name": payload.name,
            "category_id": payload.category_id,
            "is_base": (1 if payload.is_base else 0) if payload.is_base is not None else None,
            "yield_qty": payload.yield_qty,
            "yield_unit": payload.yield_unit,
            "selling_price": payload.selling_price,
            "prep_time": payload.prep_time,
            "note": payload.note,
        }

        for col, val in field_map.items():
            if val is not None:
                updates.append(f"{col} = ?")
                params.append(val.strip() if isinstance(val, str) else val)

        if updates:
            updates.append("updated_at = ?")
            params.append(now)
            params.append(recipe_id)
            cur.execute(
                f"UPDATE recipes SET {', '.join(updates)} WHERE id = ?",
                params,
            )

        # Sostituisci items se forniti
        if payload.items is not None:
            # Validazione
            for i, item in enumerate(payload.items):
                if not item.ingredient_id and not item.sub_recipe_id:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Riga {i+1}: specificare ingredient_id o sub_recipe_id",
                    )

            cur.execute("DELETE FROM recipe_items WHERE recipe_id = ?", (recipe_id,))

            for idx, item in enumerate(payload.items):
                cur.execute(
                    """
                    INSERT INTO recipe_items (recipe_id, ingredient_id, sub_recipe_id,
                                              qty, unit, sort_order, note, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        recipe_id,
                        item.ingredient_id,
                        item.sub_recipe_id,
                        item.qty,
                        item.unit.strip(),
                        idx + 1,
                        item.note,
                        now,
                    ),
                )

        conn.commit()
        return _fetch_recipe_full(conn, recipe_id)

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento: {e}") from e
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: DISATTIVA RICETTA
# ─────────────────────────────────────────────

@router.delete("/ricette/{recipe_id}")
def delete_ricetta(recipe_id: int):
    """Soft delete — imposta is_active = 0."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    existing = cur.execute("SELECT id FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    cur.execute(
        "UPDATE recipes SET is_active = 0, updated_at = ? WHERE id = ?",
        (datetime.utcnow().isoformat(), recipe_id),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "detail": "Ricetta disattivata"}


# ─────────────────────────────────────────────
#   ENDPOINT: LISTA SUB-RICETTE (per selettore)
# ─────────────────────────────────────────────

@router.get("/ricette/basi")
def list_basi():
    """Lista ricette-base per il selettore sub-ricette nel form."""
    conn = get_foodcost_connection()
    rows = conn.execute(
        """
        SELECT id, name, yield_qty, yield_unit
        FROM recipes
        WHERE is_base = 1 AND is_active = 1
        ORDER BY name COLLATE NOCASE
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
