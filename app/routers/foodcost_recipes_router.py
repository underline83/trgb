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


def convert_qty(qty: float, from_unit: str, to_unit: str,
                ingredient_id: int = None, cur=None) -> Optional[float]:
    """
    Converte una quantità da from_unit a to_unit.

    1. Se ingredient_id e cur sono forniti, cerca prima conversioni personalizzate
       nella tabella ingredient_unit_conversions (es. 1 pz = 60g per le uova)
    2. Altrimenti usa le conversioni standard (kg↔g↔mg, L↔ml↔cl)
    3. Ritorna None se la conversione non è possibile (unità incompatibili).
    """
    fu = from_unit.strip().lower()
    tu = to_unit.strip().lower()

    if fu == tu:
        return qty

    # 1. Prova conversione personalizzata per ingrediente
    if ingredient_id and cur:
        custom = _get_custom_conversion(cur, ingredient_id, fu, tu)
        if custom is not None:
            return qty * custom

    # 2. Conversione standard
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


def _get_custom_conversion(cur, ingredient_id: int, fu: str, tu: str) -> Optional[float]:
    """
    Cerca una conversione personalizzata per un ingrediente.
    Cerca sia diretta (from→to) sia inversa (to→from con 1/factor).
    """
    # Diretta
    row = cur.execute(
        """
        SELECT factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND LOWER(from_unit) = ? AND LOWER(to_unit) = ?
        """,
        (ingredient_id, fu, tu),
    ).fetchone()
    if row:
        return row["factor"]

    # Inversa
    row = cur.execute(
        """
        SELECT factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND LOWER(from_unit) = ? AND LOWER(to_unit) = ?
        """,
        (ingredient_id, tu, fu),
    ).fetchone()
    if row and row["factor"] != 0:
        return 1.0 / row["factor"]

    # Prova conversione a catena: from → intermediario → to
    # Es: pz → g (custom) poi g → kg (standard)
    customs = cur.execute(
        """
        SELECT from_unit, to_unit, factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND (LOWER(from_unit) = ? OR LOWER(to_unit) = ?)
        """,
        (ingredient_id, fu, fu),
    ).fetchall()

    for c in customs:
        c_from = c["from_unit"].strip().lower()
        c_to = c["to_unit"].strip().lower()

        if c_from == fu:
            # from → c_to (custom), c_to → to (standard?)
            intermediate = c["factor"]
            std = _standard_convert(c_to, tu)
            if std is not None:
                return intermediate * std
        elif c_to == fu:
            # from → c_from (inverse custom), c_from → to (standard?)
            if c["factor"] != 0:
                intermediate = 1.0 / c["factor"]
                std = _standard_convert(c_from, tu)
                if std is not None:
                    return intermediate * std

    return None


def _standard_convert(fu: str, tu: str) -> Optional[float]:
    """Conversione solo standard (senza custom), usata internamente."""
    fu = fu.strip().lower()
    tu = tu.strip().lower()
    if fu == tu:
        return 1.0
    f_base = UNIT_TO_BASE.get(fu)
    t_base = UNIT_TO_BASE.get(tu)
    if f_base is None or t_base is None:
        return None
    weight_units = {"kg", "g", "mg"}
    volume_units = {"l", "ml", "cl"}
    if (fu in weight_units) != (tu in weight_units) and (fu in volume_units) != (tu in volume_units):
        if fu == "pz" and tu == "pz":
            return 1.0
        return None
    return f_base / t_base


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

        # Converti qty nell'unità base dell'ingrediente (con supporto conversioni custom)
        converted = convert_qty(qty, unit, default_unit,
                                ingredient_id=item["ingredient_id"], cur=cur)
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
#   ENDPOINT: DASHBOARD STATS
#   ⚠️  DEVE stare PRIMA di /ricette/{recipe_id}
# ─────────────────────────────────────────────

@router.get("/ricette/stats/dashboard")
def dashboard_stats():
    """Statistiche aggregate per la dashboard food cost."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT r.id, r.name, r.is_base, r.yield_qty, r.yield_unit,
               r.selling_price, rc.name AS category_name
        FROM recipes r
        LEFT JOIN recipe_categories rc ON rc.id = r.category_id
        WHERE r.is_active = 1
        ORDER BY r.name COLLATE NOCASE
        """
    ).fetchall()

    ricette = []
    for row in rows:
        d = dict(row)
        d = _enrich_recipe_with_costs(cur, d)
        ricette.append(d)

    conn.close()

    # Calcola statistiche
    attive = [r for r in ricette if not r.get("is_base")]
    basi = [r for r in ricette if r.get("is_base")]
    fc_values = [r["food_cost_pct"] for r in attive if r.get("food_cost_pct") is not None]
    avg_fc = sum(fc_values) / len(fc_values) if fc_values else 0
    critiche = [r for r in attive if r.get("food_cost_pct") and r["food_cost_pct"] > 45]
    buone = [r for r in attive if r.get("food_cost_pct") and r["food_cost_pct"] <= 30]

    # Top 5 food cost più alto
    top_fc = sorted(
        [r for r in attive if r.get("food_cost_pct") is not None],
        key=lambda r: r["food_cost_pct"],
        reverse=True,
    )[:5]

    # Top 5 food cost più basso (migliori margini)
    best_margin = sorted(
        [r for r in attive if r.get("food_cost_pct") is not None],
        key=lambda r: r["food_cost_pct"],
    )[:5]

    return {
        "totale_ricette": len(attive),
        "totale_basi": len(basi),
        "food_cost_medio": round(avg_fc, 1),
        "ricette_critiche": len(critiche),
        "ricette_buone": len(buone),
        "top_food_cost": [
            {"id": r["id"], "name": r["name"], "category": r.get("category_name"), "food_cost_pct": round(r["food_cost_pct"], 1),
             "total_cost": round(r.get("total_cost", 0), 2), "selling_price": r.get("selling_price")}
            for r in top_fc
        ],
        "best_margin": [
            {"id": r["id"], "name": r["name"], "category": r.get("category_name"), "food_cost_pct": round(r["food_cost_pct"], 1),
             "total_cost": round(r.get("total_cost", 0), 2), "selling_price": r.get("selling_price")}
            for r in best_margin
        ],
    }


# ─────────────────────────────────────────────
#   ENDPOINT: EXPORT RICETTE JSON
#   ⚠️  DEVE stare PRIMA di /ricette/{recipe_id}
# ─────────────────────────────────────────────

@router.get("/ricette/export/json")
def export_ricette_json():
    """Esporta tutte le ricette attive in formato JSON."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT r.*, rc.name AS category_name
        FROM recipes r
        LEFT JOIN recipe_categories rc ON rc.id = r.category_id
        WHERE r.is_active = 1
        ORDER BY r.name COLLATE NOCASE
        """
    ).fetchall()

    result = []
    for row in rows:
        r = dict(row)
        items = cur.execute(
            """
            SELECT ri.ingredient_id, ri.sub_recipe_id, ri.qty, ri.unit, ri.note,
                   i.name AS ingredient_name,
                   sr.name AS sub_recipe_name
            FROM recipe_items ri
            LEFT JOIN (SELECT id, name FROM (
                SELECT id, name FROM ingredients WHERE id IS NOT NULL
            )) i ON i.id = ri.ingredient_id
            LEFT JOIN recipes sr ON sr.id = ri.sub_recipe_id
            WHERE ri.recipe_id = ?
            ORDER BY ri.sort_order
            """,
            (r["id"],),
        ).fetchall()

        result.append({
            "name": r["name"],
            "category": r.get("category_name"),
            "is_base": bool(r.get("is_base")),
            "yield_qty": r["yield_qty"],
            "yield_unit": r["yield_unit"],
            "selling_price": r.get("selling_price"),
            "prep_time": r.get("prep_time"),
            "note": r.get("note"),
            "items": [
                {
                    "ingredient": dict(item).get("ingredient_name"),
                    "sub_recipe": dict(item).get("sub_recipe_name"),
                    "qty": item["qty"],
                    "unit": item["unit"],
                    "note": item["note"],
                }
                for item in items
            ],
        })

    conn.close()

    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={"export_date": datetime.utcnow().isoformat(), "ricette": result},
        headers={"Content-Disposition": "attachment; filename=ricette_export.json"},
    )


# ─────────────────────────────────────────────
#   ENDPOINT: LISTA SUB-RICETTE (per selettore)
#   ⚠️  DEVE stare PRIMA di /ricette/{recipe_id}
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
#   ENDPOINT: EXPORT RICETTA SINGOLA → PDF
# ─────────────────────────────────────────────

@router.get("/ricette/{recipe_id}/pdf")
def export_ricetta_pdf(recipe_id: int):
    """Genera un PDF con il dettaglio di una ricetta e il suo food cost."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    row = cur.execute(
        """
        SELECT r.*, rc.name AS category_name
        FROM recipes r
        LEFT JOIN recipe_categories rc ON rc.id = r.category_id
        WHERE r.id = ?
        """,
        (recipe_id,),
    ).fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    r = dict(row)
    r = _enrich_recipe_with_costs(cur, r)

    # Carica items con nomi
    items = cur.execute(
        """
        SELECT ri.*, i.name AS ingredient_name, sr.name AS sub_recipe_name
        FROM recipe_items ri
        LEFT JOIN ingredients i ON i.id = ri.ingredient_id
        LEFT JOIN recipes sr ON sr.id = ri.sub_recipe_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.sort_order
        """,
        (recipe_id,),
    ).fetchall()

    conn.close()

    # Genera PDF
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from fastapi.responses import StreamingResponse

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm, bottomMargin=15*mm,
                            leftMargin=20*mm, rightMargin=20*mm)
    styles = getSampleStyleSheet()
    story = []

    # Titolo
    title_style = ParagraphStyle("RTitle", parent=styles["Heading1"],
                                  fontSize=18, spaceAfter=6, textColor=colors.HexColor("#78350f"))
    story.append(Paragraph(r["name"], title_style))

    # Info
    info_parts = []
    if r.get("category_name"):
        info_parts.append(f"Categoria: {r['category_name']}")
    info_parts.append(f"Resa: {r['yield_qty']} {r['yield_unit']}")
    if r.get("prep_time"):
        info_parts.append(f"Tempo: {r['prep_time']} min")
    if r.get("is_base"):
        info_parts.append("(Ricetta base)")
    story.append(Paragraph(" | ".join(info_parts), styles["Normal"]))
    story.append(Spacer(1, 8))

    # KPI
    kpi_data = [["Costo totale", "Costo/unità", "Prezzo vendita", "Food Cost %"]]
    kpi_row = [
        f"€ {r.get('total_cost', 0):.2f}",
        f"€ {r.get('cost_per_unit', 0):.2f}",
        f"€ {r.get('selling_price', 0):.2f}" if r.get("selling_price") else "—",
        f"{r.get('food_cost_pct', 0):.1f}%" if r.get("food_cost_pct") else "—",
    ]
    kpi_data.append(kpi_row)
    kpi_table = Table(kpi_data, colWidths=[doc.width / 4] * 4)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fef3c7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#78350f")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d4d4d4")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 12))

    # Tabella ingredienti
    story.append(Paragraph("Composizione", styles["Heading2"]))
    story.append(Spacer(1, 4))

    table_data = [["#", "Ingrediente", "Qtà", "Unità", "Note"]]
    for idx, item in enumerate(items, 1):
        it = dict(item)
        name = it.get("ingredient_name") or it.get("sub_recipe_name") or "?"
        if it.get("sub_recipe_id"):
            name = f"[SUB] {name}"
        table_data.append([
            str(idx),
            name,
            f"{it['qty']:.2f}",
            it["unit"],
            it.get("note") or "",
        ])

    col_widths = [20, doc.width - 160, 50, 40, 50]
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e5e5")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)

    # Note
    if r.get("note"):
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"Note: {r['note']}", styles["Italic"]))

    # Footer
    story.append(Spacer(1, 20))
    footer_style = ParagraphStyle("Footer", parent=styles["Normal"],
                                   fontSize=7, textColor=colors.grey)
    story.append(Paragraph(f"Generato da TRGB Gestionale — {datetime.now().strftime('%d/%m/%Y %H:%M')}", footer_style))

    doc.build(story)
    buf.seek(0)

    safe_name = r["name"].replace(" ", "_").replace("/", "-")[:40]
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ricetta_{safe_name}.pdf"},
    )
