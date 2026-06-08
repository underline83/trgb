#!/usr/bin/env python3
# @version: v2.2-foodcost-recipes-router-import (2026-05-23)
# Modulo: ricette
# -*- coding: utf-8 -*-

"""
Router ricette — Food Cost v2

Funzionalità:
- CRUD ricette con supporto sub-ricette
- Calcolo food cost ricorsivo (ingrediente + sub-ricetta a cascata)
- Categorie ricette configurabili
- Costo porzione + % su prezzo di vendita
- Allergeni calcolati ricorsivi (Modulo C)

Endpoint:
  GET    /foodcost/ricette                → lista ricette con food cost + allergeni
  GET    /foodcost/ricette/{id}           → dettaglio + costi + allergeni calcolati
  POST   /foodcost/ricette                → crea ricetta (trigger ricalcolo allergeni)
  PUT    /foodcost/ricette/{id}           → aggiorna ricetta (trigger ricalcolo allergeni)
  DELETE /foodcost/ricette/{id}           → disattiva ricetta
  GET    /foodcost/ricette/categorie      → lista categorie ricetta
  POST   /foodcost/ricette/categorie      → crea categoria ricetta
  POST   /foodcost/ricette/{id}/ricalcola-allergeni        → ricalcola singola
  POST   /foodcost/ricette/ricalcola-allergeni-tutti       → batch (admin/chef)
"""

from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.cucina_db import get_cucina_connection
from app.services.auth_service import get_current_user
from app.services.allergeni_service import (
    update_recipe_allergens_cache,
    recompute_all_recipes_allergens,
)
from app.services.foodcost_history_service import compute_recipe_fc_history

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
    procedimento: Optional[str] = None       # metodo di preparazione (mig 137)
    # Campi menu/preventivi (mig 074)
    menu_name: Optional[str] = None
    menu_description: Optional[str] = None
    kind: Optional[str] = None               # 'dish' | 'base' (override di is_base se fornito)
    service_type_ids: Optional[List[int]] = None  # tipi servizio a cui appartiene il piatto
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
    procedimento: Optional[str] = None       # metodo di preparazione (mig 137)
    # Campi menu/preventivi (mig 074)
    menu_name: Optional[str] = None
    menu_description: Optional[str] = None
    kind: Optional[str] = None
    service_type_ids: Optional[List[int]] = None
    items: Optional[List[RecipeItemIn]] = None


class RecipeQuickCreate(BaseModel):
    """Crea un piatto minimal dal wizard preventivo — solo i campi essenziali."""
    name: str = Field(..., min_length=1)
    category_id: Optional[int] = None
    selling_price: Optional[float] = None
    menu_name: Optional[str] = None
    menu_description: Optional[str] = None
    service_type_ids: Optional[List[int]] = None


class ServiceTypeOut(BaseModel):
    id: int
    name: str
    sort_order: int = 0
    active: bool = True


class ServiceTypeIn(BaseModel):
    name: str = Field(..., min_length=1)
    sort_order: int = 0
    active: bool = True


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
    procedimento: Optional[str] = None       # metodo di preparazione (mig 137)
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Campi menu/preventivi (mig 074)
    menu_name: Optional[str] = None
    menu_description: Optional[str] = None
    kind: Optional[str] = None
    service_types: List[ServiceTypeOut] = []
    items: List[RecipeItemOut] = []
    # Food cost calcolati
    total_cost: Optional[float] = None         # costo totale ricetta
    cost_per_unit: Optional[float] = None      # costo per unità di resa (€/porzione, €/kg)
    food_cost_pct: Optional[float] = None      # % food cost su selling_price
    # Allergeni (Modulo C, 2026-04-27): cache ricorsiva da ingredients.allergeni
    allergeni_calcolati: Optional[str] = None  # CSV ordinato (es. "glutine,latte,uova")


class RecipeListItem(BaseModel):
    id: int
    name: str
    category_name: Optional[str] = None
    is_base: bool = False
    yield_qty: float
    yield_unit: str
    selling_price: Optional[float] = None
    is_active: bool = True
    allergeni_calcolati: Optional[str] = None  # Modulo C: anche in lista
    total_cost: Optional[float] = None
    cost_per_unit: Optional[float] = None
    food_cost_pct: Optional[float] = None
    # Campi menu/preventivi (mig 074)
    menu_name: Optional[str] = None
    menu_description: Optional[str] = None
    kind: Optional[str] = None
    service_type_ids: List[int] = []


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
    # Sinonimi frequenti nelle fatture elettroniche (fix 2026-06-07)
    "gr": 0.001,    # grammi scritti "GR"
    "hg": 0.1,      # ettogrammi
    "lt": 1.0,      # litri scritti "LT"
    "lit": 1.0,
}


def _norm_unit(u: str) -> str:
    """Normalizza un'unità fattura: trim, minuscole, via punti ('KG.' → 'kg')."""
    return (u or "").strip().lower().replace(".", "")


def convert_qty(qty: float, from_unit: str, to_unit: str,
                ingredient_id: int = None, cur=None) -> Optional[float]:
    """
    Converte una quantità da from_unit a to_unit.

    1. Se ingredient_id e cur sono forniti, cerca prima conversioni personalizzate
       nella tabella ingredient_unit_conversions (es. 1 pz = 60g per le uova)
    2. Altrimenti usa le conversioni standard (kg↔g↔mg, L↔ml↔cl)
    3. Ritorna None se la conversione non è possibile (unità incompatibili).
    """
    fu = _norm_unit(from_unit)
    tu = _norm_unit(to_unit)

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

    # Verifica compatibilità STRETTA per famiglia (fix 2026-06-07):
    # peso↔peso, volume↔volume, pz↔pz. Prima il check era lasco e 'pz'
    # convertiva implicitamente verso peso/volume come se 1 pz = 1 kg/L —
    # fonte di prezzi sballati. pz→peso/volume ora richiede SEMPRE una
    # conversione personalizzata (gestita sopra, punto 1).
    weight_units = {"kg", "g", "mg", "gr", "hg"}
    volume_units = {"l", "ml", "cl", "lt", "lit"}

    def _family(u: str) -> Optional[str]:
        if u in weight_units:
            return "peso"
        if u in volume_units:
            return "volume"
        if u == "pz":
            return "pz"
        return None

    if _family(fu) is None or _family(fu) != _family(tu):
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

    # Catena lato DESTINAZIONE (fix 2026-06-07, "cose pesabili"):
    # standard prima, custom dopo. Es. ingrediente a numero con "1 n = 20 g":
    # KG → n  =  KG → g (standard, 1000)  ×  g → n (custom inversa, 1/20)  =  50.
    # Copre fatture a peso/volume per ingredienti contati a numero e viceversa.
    customs_tu = cur.execute(
        """
        SELECT from_unit, to_unit, factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND (LOWER(from_unit) = ? OR LOWER(to_unit) = ?)
        """,
        (ingredient_id, tu, tu),
    ).fetchall()

    for c in customs_tu:
        c_from = c["from_unit"].strip().lower()
        c_to = c["to_unit"].strip().lower()

        if c_from == tu and c["factor"] != 0:
            # from → c_to (standard), poi c_to → tu (custom inversa)
            std = _standard_convert(fu, c_to)
            if std is not None:
                return std / c["factor"]
        elif c_to == tu:
            # from → c_from (standard), poi c_from → tu (custom diretta)
            std = _standard_convert(fu, c_from)
            if std is not None:
                return std * c["factor"]

    return None


def _standard_convert(fu: str, tu: str) -> Optional[float]:
    """
    Conversione solo standard (senza custom), usata internamente.
    Fix 2026-06-07: famiglie STRETTE come convert_qty (peso↔peso,
    volume↔volume, pz↔pz) — prima 'pz' convertiva a peso come 1 pz = 1 kg.
    """
    fu = _norm_unit(fu)
    tu = _norm_unit(tu)
    if fu == tu:
        return 1.0
    f_base = UNIT_TO_BASE.get(fu)
    t_base = UNIT_TO_BASE.get(tu)
    if f_base is None or t_base is None:
        return None

    weight_units = {"kg", "g", "mg", "gr", "hg"}
    volume_units = {"l", "ml", "cl", "lt", "lit"}

    def _family(u: str) -> Optional[str]:
        if u in weight_units:
            return "peso"
        if u in volume_units:
            return "volume"
        if u == "pz":
            return "pz"
        return None

    if _family(fu) is None or _family(fu) != _family(tu):
        return None

    return f_base / t_base


# ─────────────────────────────────────────────
#   CALCOLO FOOD COST (ricorsivo)
# ─────────────────────────────────────────────

def _foodcost_finestra_giorni(cur) -> int:
    """
    Finestra (giorni) per il prezzo corrente, da foodcost_settings (id=1).
    Default 90 se la tabella/riga non esiste ancora (pre-mig 145).
    """
    try:
        row = cur.execute(
            "SELECT prezzo_finestra_giorni FROM foodcost_settings WHERE id = 1"
        ).fetchone()
        if row and row["prezzo_finestra_giorni"]:
            return int(row["prezzo_finestra_giorni"])
    except Exception:
        pass
    return 90


def prezzo_corrente_ingrediente(cur, ingredient_id: int,
                                finestra_giorni: Optional[int] = None) -> Optional[float]:
    """
    Prezzo corrente robusto (€/unità base) di un ingrediente (fix Sedano 2026-06-08).

    Strategia MEDIANA: mediana dei `unit_price` registrati negli ultimi
    `finestra_giorni` (default da settings). La mediana ignora gli outlier
    (acquisti occasionali/retail) che con la vecchia logica "ultimo prezzo"
    inquinavano food cost e KPI.

    Fallback: se nessun prezzo cade nella finestra (ingrediente comprato di
    rado), usa l'ULTIMO prezzo disponibile — meglio un dato vecchio che None.
    """
    if finestra_giorni is None:
        finestra_giorni = _foodcost_finestra_giorni(cur)

    rows = cur.execute(
        """
        SELECT unit_price
        FROM ingredient_prices
        WHERE ingredient_id = ?
          AND unit_price IS NOT NULL
          AND date(price_date) >= date('now', ?)
        ORDER BY unit_price
        """,
        (ingredient_id, f"-{int(finestra_giorni)} days"),
    ).fetchall()

    valori = [r["unit_price"] for r in rows if r["unit_price"] is not None]
    if valori:
        n = len(valori)
        mid = n // 2
        if n % 2:
            return float(valori[mid])
        return (float(valori[mid - 1]) + float(valori[mid])) / 2.0

    # Fallback: ultimo prezzo in assoluto
    row = cur.execute(
        """
        SELECT unit_price
        FROM ingredient_prices
        WHERE ingredient_id = ? AND unit_price IS NOT NULL
        ORDER BY date(price_date) DESC, id DESC
        LIMIT 1
        """,
        (ingredient_id,),
    ).fetchone()
    return row["unit_price"] if row else None


def _get_ingredient_unit_cost(cur, ingredient_id: int) -> Optional[float]:
    """
    Costo unitario (€/unità base) usato dal food cost.
    Dal 2026-06-08 usa il prezzo corrente robusto (mediana finestra), non
    più l'ultimo prezzo secco.
    """
    return prezzo_corrente_ingrediente(cur, ingredient_id)


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

    # Service types (M:N) — se tabelle esistono
    service_types: List[ServiceTypeOut] = []
    try:
        st_rows = cur.execute(
            """
            SELECT st.id, st.name, st.sort_order, st.active
            FROM recipe_service_types rst
            JOIN service_types st ON st.id = rst.service_type_id
            WHERE rst.recipe_id = ?
            ORDER BY st.sort_order, st.name
            """,
            (recipe_id,),
        ).fetchall()
        service_types = [
            ServiceTypeOut(
                id=r["id"], name=r["name"],
                sort_order=r["sort_order"] or 0,
                active=bool(r["active"]),
            ) for r in st_rows
        ]
    except Exception:
        service_types = []

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
        procedimento=rec_dict.get("procedimento"),
        is_active=bool(rec_dict["is_active"]),
        created_at=rec_dict.get("created_at"),
        updated_at=rec_dict.get("updated_at"),
        menu_name=rec_dict.get("menu_name"),
        menu_description=rec_dict.get("menu_description"),
        kind=rec_dict.get("kind") or ("base" if bool(rec_dict.get("is_base")) else "dish"),
        service_types=service_types,
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
        allergeni_calcolati=rec_dict.get("allergeni_calcolati"),
    )


# ─────────────────────────────────────────────
#   ENDPOINT: IMPOSTAZIONI FOOD COST (finestra prezzo)
# ─────────────────────────────────────────────

def _ensure_foodcost_settings(cur) -> None:
    """Crea la tabella + riga id=1 se mancano (self-heal pre-mig 145)."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS foodcost_settings (
            id                     INTEGER PRIMARY KEY CHECK (id = 1),
            prezzo_strategia       TEXT    NOT NULL DEFAULT 'mediana',
            prezzo_finestra_giorni INTEGER NOT NULL DEFAULT 90,
            updated_at             TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
        """
    )
    cur.execute("INSERT OR IGNORE INTO foodcost_settings (id) VALUES (1)")


class FoodcostSettingsOut(BaseModel):
    prezzo_strategia: str = "mediana"
    prezzo_finestra_giorni: int = 90


class FoodcostSettingsUpdate(BaseModel):
    prezzo_strategia: Optional[str] = None
    prezzo_finestra_giorni: Optional[int] = Field(None, ge=1, le=730)


@router.get("/settings", response_model=FoodcostSettingsOut)
def get_foodcost_settings():
    conn = get_cucina_connection()
    try:
        cur = conn.cursor()
        _ensure_foodcost_settings(cur)
        conn.commit()
        row = cur.execute("SELECT * FROM foodcost_settings WHERE id = 1").fetchone()
        return FoodcostSettingsOut(
            prezzo_strategia=row["prezzo_strategia"],
            prezzo_finestra_giorni=row["prezzo_finestra_giorni"],
        )
    finally:
        conn.close()


@router.put("/settings", response_model=FoodcostSettingsOut)
def update_foodcost_settings(payload: FoodcostSettingsUpdate):
    conn = get_cucina_connection()
    try:
        cur = conn.cursor()
        _ensure_foodcost_settings(cur)
        sets, params = [], []
        if payload.prezzo_strategia is not None:
            sets.append("prezzo_strategia = ?")
            params.append(payload.prezzo_strategia)
        if payload.prezzo_finestra_giorni is not None:
            sets.append("prezzo_finestra_giorni = ?")
            params.append(payload.prezzo_finestra_giorni)
        if sets:
            sets.append("updated_at = datetime('now','localtime')")
            cur.execute(f"UPDATE foodcost_settings SET {', '.join(sets)} WHERE id = 1", params)
            conn.commit()
        row = cur.execute("SELECT * FROM foodcost_settings WHERE id = 1").fetchone()
        return FoodcostSettingsOut(
            prezzo_strategia=row["prezzo_strategia"],
            prezzo_finestra_giorni=row["prezzo_finestra_giorni"],
        )
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: CATEGORIE RICETTE
# ─────────────────────────────────────────────

@router.get("/ricette/categorie", response_model=List[RecipeCategoryOut])
def list_recipe_categories():
    conn = get_cucina_connection()
    rows = conn.execute(
        "SELECT id, name, sort_order FROM recipe_categories ORDER BY sort_order, name"
    ).fetchall()
    conn.close()
    return [RecipeCategoryOut(**dict(r)) for r in rows]


@router.post("/ricette/categorie", response_model=RecipeCategoryOut)
def create_recipe_category(payload: RecipeCategoryCreate):
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    kind: Optional[str] = None,                # 'dish' | 'base'
    service_type_id: Optional[int] = None,     # filtra piatti associati a un tipo servizio
    search: Optional[str] = None,              # cerca in name / menu_name
):
    """Lista ricette con food cost calcolato in tempo reale.

    Filtri (per wizard preventivi):
      - kind: 'dish' o 'base'
      - service_type_id: solo piatti associati a quel tipo servizio
      - search: match parziale su name/menu_name
    """
    conn = get_cucina_connection()
    cur = conn.cursor()

    where = "WHERE r.is_active = 1"
    params: List[Any] = []

    if solo_basi:
        where += " AND r.is_base = 1"
    elif solo_piatti:
        where += " AND r.is_base = 0"

    if kind:
        where += " AND COALESCE(r.kind, CASE WHEN r.is_base=1 THEN 'base' ELSE 'dish' END) = ?"
        params.append(kind)

    if service_type_id:
        where += """ AND r.id IN (
            SELECT recipe_id FROM recipe_service_types WHERE service_type_id = ?
        )"""
        params.append(service_type_id)

    if search:
        like = f"%{search.strip()}%"
        where += " AND (r.name LIKE ? OR COALESCE(r.menu_name,'') LIKE ?)"
        params.extend([like, like])

    # Verifica se colonne menu esistono (robusto pre-migrazione)
    cols = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}
    has_menu_cols = "menu_name" in cols and "kind" in cols
    has_allergeni = "allergeni_calcolati" in cols  # Modulo C, mig 098
    select_extra = ", r.menu_name, r.menu_description, r.kind" if has_menu_cols else ""
    if has_allergeni:
        select_extra += ", r.allergeni_calcolati"

    rows = cur.execute(
        f"""
        SELECT r.id, r.name, r.is_base, r.yield_qty, r.yield_unit,
               r.selling_price, r.is_active,
               rc.name AS category_name{select_extra}
        FROM recipes r
        LEFT JOIN recipe_categories rc ON rc.id = r.category_id
        {where}
        ORDER BY rc.sort_order, r.name COLLATE NOCASE
        """,
        params,
    ).fetchall()

    # Pre-carica mappa service_type_ids per tutti i piatti restituiti (una query sola)
    rst_map: Dict[int, List[int]] = {}
    if rows:
        ids = [r["id"] for r in rows]
        placeholders = ",".join("?" * len(ids))
        try:
            rst_rows = cur.execute(
                f"SELECT recipe_id, service_type_id FROM recipe_service_types WHERE recipe_id IN ({placeholders})",
                ids,
            ).fetchall()
            for rr in rst_rows:
                rst_map.setdefault(rr["recipe_id"], []).append(rr["service_type_id"])
        except Exception:
            pass

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
            menu_name=d.get("menu_name"),
            menu_description=d.get("menu_description"),
            kind=d.get("kind") or ("base" if bool(d.get("is_base")) else "dish"),
            service_type_ids=rst_map.get(d["id"], []),
            allergeni_calcolati=d.get("allergeni_calcolati"),
        ))

    conn.close()
    return result


# ─────────────────────────────────────────────
#   ENDPOINT: RICETTE CHE USANO UN INGREDIENTE
#   GET /foodcost/ricette/per-ingrediente/{ingredient_id}
#   Usato dalla scheda ingrediente (tab "Ricette").
#   NB: path a 2 segmenti dopo /ricette → non confligge con /ricette/{recipe_id}.
# ─────────────────────────────────────────────

class RicettaPerIngredienteOut(BaseModel):
    recipe_id: int
    recipe_name: str
    kind: Optional[str] = None
    is_active: int = 1
    qty: float
    unit: str
    line_cost: Optional[float] = None          # costo della riga (€)
    recipe_total_cost: Optional[float] = None  # costo totale ricetta (€)
    incidenza_pct: Optional[float] = None      # quanto incide la riga sul costo ricetta


@router.get("/ricette/per-ingrediente/{ingredient_id}",
            response_model=List[RicettaPerIngredienteOut])
def ricette_per_ingrediente(ingredient_id: int):
    """
    Elenca le ricette che usano un dato ingrediente, con quantità impiegata,
    costo della riga e incidenza % sul food cost della ricetta.
    """
    conn = get_cucina_connection()
    cur = conn.cursor()
    try:
        rows = cur.execute(
            """
            SELECT ri.recipe_id, ri.qty, ri.unit,
                   r.name AS recipe_name, r.kind, r.is_active
            FROM recipe_items ri
            JOIN recipes r ON r.id = ri.recipe_id
            WHERE ri.ingredient_id = ?
            ORDER BY r.name COLLATE NOCASE
            """,
            (ingredient_id,),
        ).fetchall()

        out = []
        for row in rows:
            item = {"ingredient_id": ingredient_id, "sub_recipe_id": None,
                    "qty": row["qty"], "unit": row["unit"]}
            line_cost = _calc_item_cost(cur, item, set())
            total = _calc_recipe_cost(cur, row["recipe_id"])
            pct = None
            if line_cost is not None and total and total > 0:
                pct = round(line_cost / total * 100, 1)
            out.append(RicettaPerIngredienteOut(
                recipe_id=row["recipe_id"],
                recipe_name=row["recipe_name"],
                kind=row["kind"],
                is_active=row["is_active"] if row["is_active"] is not None else 1,
                qty=row["qty"],
                unit=row["unit"],
                line_cost=round(line_cost, 4) if line_cost is not None else None,
                recipe_total_cost=round(total, 4) if total is not None else None,
                incidenza_pct=pct,
            ))
        return out
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: DETTAGLIO RICETTA
# ─────────────────────────────────────────────

@router.get("/ricette/{recipe_id}", response_model=RecipeOut)
def get_ricetta(recipe_id: int):
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
    cur = conn.cursor()

    try:
        # Derivazione kind <-> is_base
        kind = (payload.kind or "").strip().lower() if payload.kind else None
        if kind not in ("dish", "base", None, ""):
            raise HTTPException(status_code=400, detail="kind deve essere 'dish' o 'base'")
        if kind:
            is_base_val = 1 if kind == "base" else 0
        else:
            is_base_val = 1 if payload.is_base else 0
            kind = "base" if is_base_val == 1 else "dish"

        # Columns esistenti (per INSERT robusta pre-mig)
        cols = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}
        has_menu_cols = "menu_name" in cols and "kind" in cols

        if has_menu_cols:
            cur.execute(
                """
                INSERT INTO recipes (name, category_id, is_base, yield_qty, yield_unit,
                                     selling_price, prep_time, note,
                                     menu_name, menu_description, kind,
                                     is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    payload.name.strip(),
                    payload.category_id,
                    is_base_val,
                    payload.yield_qty,
                    payload.yield_unit.strip(),
                    payload.selling_price,
                    payload.prep_time,
                    payload.note,
                    (payload.menu_name or None),
                    (payload.menu_description or None),
                    kind,
                    now,
                    now,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO recipes (name, category_id, is_base, yield_qty, yield_unit,
                                     selling_price, prep_time, note, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    payload.name.strip(),
                    payload.category_id,
                    is_base_val,
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

        # Procedimento (mig 137) — UPDATE separata per non toccare la INSERT a rami
        if "procedimento" in cols and payload.procedimento is not None:
            cur.execute(
                "UPDATE recipes SET procedimento = ? WHERE id = ?",
                (payload.procedimento, recipe_id),
            )

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

        # Servizi (M:N)
        if payload.service_type_ids:
            for st_id in payload.service_type_ids:
                try:
                    cur.execute(
                        "INSERT OR IGNORE INTO recipe_service_types (recipe_id, service_type_id) VALUES (?, ?)",
                        (recipe_id, st_id),
                    )
                except Exception:
                    pass

        # Modulo C: ricalcolo allergeni cache (best-effort, no fail su errore)
        try:
            update_recipe_allergens_cache(recipe_id, conn=conn)
        except Exception as _e:
            import logging
            logging.getLogger("foodcost").warning(f"[allergeni] ricalcolo create fail recipe={recipe_id}: {_e}")

        conn.commit()
        return _fetch_recipe_full(conn, recipe_id)

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore salvataggio: {e}") from e
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
#   IMPORT RICETTE DA JSON
#   Tracciato scaricabile + analisi (match ingredienti/sotto-ricette)
#   + conferma (crea placeholder + ricette in 2 passate).
# ═══════════════════════════════════════════════════════════════

class ImportVoce(BaseModel):
    """Una voce di ricetta importata: ingrediente OPPURE sotto-ricetta."""
    ingrediente: Optional[str] = None
    sotto_ricetta: Optional[str] = None
    quantita: Optional[float] = None
    unita: Optional[str] = None
    note: Optional[str] = None


class ImportRicetta(BaseModel):
    """Una ricetta nel file di import. Riferimenti per NOME, niente ID."""
    nome: str = ""
    categoria: Optional[str] = None
    tipo: Optional[str] = None  # "piatto" | "base"
    resa_quantita: Optional[float] = None
    resa_unita: Optional[str] = None
    prezzo_vendita: Optional[float] = None
    tempo_preparazione_min: Optional[int] = None
    procedimento: Optional[Any] = None       # lista di passi (preferita) o testo
    note: Optional[str] = None               # annotazioni brevi
    voci: List[ImportVoce] = []


class ImportPayload(BaseModel):
    ricette: List[ImportRicetta] = []


class ImportRisolIngrediente(BaseModel):
    """Decisione dell'utente su un ingrediente referenziato."""
    nome: str
    azione: str = "placeholder"        # "usa" | "placeholder"
    ingredient_id: Optional[int] = None
    unita: Optional[str] = None        # per il placeholder
    categoria: Optional[str] = None    # per il placeholder


class ImportRisolSottoRicetta(BaseModel):
    """Decisione dell'utente su una sotto-ricetta referenziata."""
    nome: str
    azione: str = "nel_file"           # "usa" | "nel_file" | "salta"
    recipe_id: Optional[int] = None


class ImportConfermaPayload(BaseModel):
    ricette: List[ImportRicetta] = []
    ingredienti: List[ImportRisolIngrediente] = []
    sotto_ricette: List[ImportRisolSottoRicetta] = []


def _imp_tokens(s: str) -> Set[str]:
    """Insieme delle parole (alfanumeriche) di un nome, minuscole."""
    import re as _re
    return set(_re.findall(r"\w+", (s or "").lower()))


def _imp_score(a: str, b: str) -> float:
    """
    Similarità 0-100 tra due nomi. Oltre alla similarità carattere-per-carattere,
    dà un bonus quando tutte le parole del nome più corto compaiono nel più lungo
    (es. "branzi" dentro "Branzi (formaggio bergamasco)").
    """
    a = (a or "").strip().lower()
    b = (b or "").strip().lower()
    if not a or not b:
        return 0.0
    if a == b:
        return 100.0
    base = SequenceMatcher(None, a, b).ratio() * 100
    ta, tb = _imp_tokens(a), _imp_tokens(b)
    if ta and tb:
        short, long = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
        if short and short.issubset(long):
            base = max(base, 88.0)
    return round(base, 1)


# Unità "quanto basta": l'ingrediente è elencato nella ricetta ma escluso dal
# food cost (qty 0). Forma canonica salvata: "qb".
_QB_UNITS = {"qb", "q.b.", "q.b", "qb.", "q b", "quanto basta",
             "a piacere", "qs", "q.s.", "qbas"}


def _is_qb(unita) -> bool:
    """True se l'unità indica 'quanto basta' / a piacere."""
    return (unita or "").strip().lower() in _QB_UNITS


def _imp_unit(units: List[str]) -> str:
    """Unità base più frequente tra le voci, ignorando le 'qb' (fallback 'kg')."""
    from collections import Counter
    clean = [u.strip() for u in (units or [])
             if u and u.strip() and not _is_qb(u)]
    if not clean:
        return "kg"
    return Counter(clean).most_common(1)[0][0]


def _proc_to_text(proc) -> Optional[str]:
    """
    Normalizza il procedimento importato in testo, un passaggio per riga.
    Accetta una lista di stringhe (formato preferito) o una stringa unica.
    """
    if proc is None:
        return None
    if isinstance(proc, list):
        steps = [str(s).strip() for s in proc
                 if s is not None and str(s).strip()]
        return "\n".join(steps) if steps else None
    text = str(proc).strip()
    return text or None


@router.get("/ricette/import/tracciato")
def import_tracciato_ricette():
    """Tracciato JSON di esempio per l'import ricette (scaricabile dalla UI)."""
    return {
        "_istruzioni": (
            "Tracciato per importare ricette in TRGB Gestionale. Compila la lista "
            "'ricette'. Ogni ricetta ha un 'nome' e una lista 'voci'. Ogni voce è UN "
            "ingrediente (campo 'ingrediente') OPPURE una sotto-ricetta (campo "
            "'sotto_ricetta'), mai entrambi. Riferisci ingredienti e sotto-ricette per "
            "NOME: non servono ID né codici interni, il sistema li abbina in fase di "
            "importazione. Una sotto-ricetta può essere un'altra ricetta presente in "
            "questo stesso file. "
            "REGOLE IMPORTANTI: (1) Il metodo di preparazione va nel campo "
            "'procedimento' come LISTA di passaggi: un array di stringhe brevi, un "
            "passo per elemento (es. \"Tostare il riso\", \"Sfumare col vino\"...). "
            "NON un testo unico, NON nel campo 'note'. (2) Per gli ingredienti a piacere / "
            "quanto basta (sale, pepe, olio per condire, ecc.) usa \"unita\": \"qb\" e "
            "ometti la 'quantita': verranno elencati nella ricetta ma esclusi dal "
            "calcolo del food cost. (3) Ogni voce è UN SOLO ingrediente con UN SOLO "
            "nome: niente alternative tipo 'aceto bianco o aceto di mele', scegline uno. "
            "(4) 'resa_unita' è un'unità pulita ('porzioni', 'kg', 'L'): non scrivere "
            "'circa' o altre parole, eventuali approssimazioni vanno nelle 'note'. "
            "Le chiavi che iniziano con '_' sono solo documentazione e si possono "
            "rimuovere."
        ),
        "_campi_ricetta": {
            "nome": "obbligatorio — nome della ricetta",
            "categoria": "facoltativo — una tra: ANTIPASTO, PRIMO, SECONDO, CONTORNO, DOLCE, BASE, SALSA, IMPASTO",
            "tipo": "facoltativo — 'piatto' (default) o 'base' (sotto-ricetta riusabile)",
            "resa_quantita": "facoltativo — quanto rende la ricetta, solo numero (default 1)",
            "resa_unita": "facoltativo — unità pulita: 'porzioni', 'kg', 'L' (default 'porzioni'). NIENTE 'circa' o parole",
            "prezzo_vendita": "facoltativo — prezzo di vendita in euro (solo per i piatti)",
            "tempo_preparazione_min": "facoltativo — minuti di preparazione",
            "procedimento": "facoltativo — LISTA di passaggi (array di stringhe), un passo per elemento. NON un testo unico",
            "note": "facoltativo — annotazioni brevi (NON il procedimento)",
            "voci": "obbligatorio — lista degli ingredienti/sotto-ricette",
        },
        "_campi_voce": {
            "ingrediente": "nome dell'ingrediente (alternativo a 'sotto_ricetta') — un solo nome, niente 'X o Y'",
            "sotto_ricetta": "nome di un'altra ricetta usata come componente (alternativo a 'ingrediente')",
            "quantita": "numero — obbligatorio, TRANNE per gli ingredienti 'qb' (a piacere) dove va omesso",
            "unita": "obbligatorio — es. 'g', 'kg', 'ml', 'L', 'pz'. Usa 'qb' per gli ingredienti a piacere/quanto basta",
            "note": "facoltativo — breve nota sulla voce (es. 'tagliato a cubetti')",
        },
        "ricette": [
            {
                "nome": "Risotto allo zafferano",
                "categoria": "PRIMO",
                "tipo": "piatto",
                "resa_quantita": 4,
                "resa_unita": "porzioni",
                "prezzo_vendita": 14.0,
                "tempo_preparazione_min": 25,
                "procedimento": [
                    "Tostare il riso a secco in casseruola.",
                    "Sfumare con vino bianco e farlo evaporare.",
                    "Aggiungere il brodo caldo poco alla volta, mescolando.",
                    "A metà cottura unire lo zafferano sciolto in poco brodo.",
                    "Mantecare fuori dal fuoco con burro e parmigiano.",
                ],
                "note": "Servire subito, all'onda.",
                "voci": [
                    {"ingrediente": "Riso Carnaroli", "quantita": 320, "unita": "g"},
                    {"ingrediente": "Zafferano in pistilli", "quantita": 0.5, "unita": "g"},
                    {"ingrediente": "Burro", "quantita": 40, "unita": "g"},
                    {"ingrediente": "Parmigiano Reggiano", "quantita": 60, "unita": "g"},
                    {"sotto_ricetta": "Brodo di carne", "quantita": 1, "unita": "L"},
                    {"ingrediente": "Sale", "unita": "qb"},
                    {"ingrediente": "Pepe", "unita": "qb"},
                ],
            },
            {
                "nome": "Brodo di carne",
                "categoria": "BASE",
                "tipo": "base",
                "resa_quantita": 3,
                "resa_unita": "L",
                "procedimento": [
                    "Mettere ossi e verdure in acqua fredda.",
                    "Portare a bollore e schiumare.",
                    "Abbassare e cuocere a fuoco lento 3 ore.",
                    "Filtrare il brodo.",
                ],
                "note": "Si conserva 3 giorni in frigo.",
                "voci": [
                    {"ingrediente": "Ossi di manzo", "quantita": 1, "unita": "kg"},
                    {"ingrediente": "Carota", "quantita": 200, "unita": "g"},
                    {"ingrediente": "Sedano", "quantita": 150, "unita": "g"},
                    {"ingrediente": "Cipolla", "quantita": 150, "unita": "g"},
                    {"ingrediente": "Sale grosso", "unita": "qb"},
                ],
            },
        ],
    }


@router.post("/ricette/import/analizza")
def import_analizza_ricette(payload: ImportPayload):
    """
    Analizza un file di import SENZA scrivere nulla.

    Ritorna lo stato di ogni ricetta (validazione) e l'elenco aggregato degli
    ingredienti e sotto-ricette referenziati, con lo stato di abbinamento
    (trovato / da confermare / nuovo) per la schermata di conferma.
    """
    conn = get_cucina_connection()
    cur = conn.cursor()
    try:
        ing_rows = cur.execute(
            "SELECT id, name, default_unit FROM ingredients WHERE is_active = 1"
        ).fetchall()
        ing_by_key = {r["name"].strip().lower(): r for r in ing_rows}

        rec_rows = cur.execute(
            "SELECT id, name FROM recipes WHERE is_active = 1"
        ).fetchall()
        rec_by_key = {r["name"].strip().lower(): r for r in rec_rows}

        cat_by_key = {
            r["name"].strip().lower(): r
            for r in cur.execute("SELECT id, name FROM recipe_categories").fetchall()
        }

        file_recipe_keys = {
            (r.nome or "").strip().lower()
            for r in payload.ricette if (r.nome or "").strip()
        }

        ricette_out = []
        ing_acc: Dict[str, dict] = {}
        sub_acc: Dict[str, dict] = {}

        for idx, r in enumerate(payload.ricette):
            errori = []
            nome = (r.nome or "").strip()
            if not nome:
                errori.append("Nome ricetta mancante")
            cat = cat_by_key.get((r.categoria or "").strip().lower()) if r.categoria else None
            if r.categoria and not cat:
                errori.append(f"Categoria '{r.categoria}' non riconosciuta — verrà lasciata vuota")
            if not r.voci:
                errori.append("Nessuna voce nella ricetta")

            for vi, v in enumerate(r.voci):
                has_ing = bool((v.ingrediente or "").strip())
                has_sub = bool((v.sotto_ricetta or "").strip())
                if has_ing == has_sub:
                    errori.append(f"Voce {vi+1}: specificare 'ingrediente' OPPURE 'sotto_ricetta'")
                    continue
                if not (v.unita or "").strip():
                    errori.append(f"Voce {vi+1}: unità mancante")
                elif not _is_qb(v.unita) and (v.quantita is None or v.quantita <= 0):
                    # le voci 'qb' non richiedono quantità
                    errori.append(f"Voce {vi+1}: quantità mancante o non valida")
                if has_ing:
                    k = v.ingrediente.strip().lower()
                    a = ing_acc.setdefault(k, {"nome": v.ingrediente.strip(), "occorrenze": 0, "unita_voci": []})
                    a["occorrenze"] += 1
                    if (v.unita or "").strip():
                        a["unita_voci"].append(v.unita.strip())
                else:
                    k = v.sotto_ricetta.strip().lower()
                    a = sub_acc.setdefault(k, {"nome": v.sotto_ricetta.strip(), "occorrenze": 0})
                    a["occorrenze"] += 1

            nome_esistente = bool(nome) and nome.lower() in rec_by_key
            if nome_esistente:
                errori.append("Esiste già una ricetta con questo nome (verrebbe creato un duplicato)")

            ricette_out.append({
                "indice": idx,
                "nome": nome,
                "categoria": r.categoria,
                "categoria_id": cat["id"] if cat else None,
                "tipo": (r.tipo or "piatto"),
                "n_voci": len(r.voci),
                "nome_esistente": nome_esistente,
                "errori": errori,
            })

        ingredienti_out = []
        for k, a in sorted(ing_acc.items()):
            ex = ing_by_key.get(k)
            if ex:
                ingredienti_out.append({
                    "nome": a["nome"], "stato": "trovato",
                    "ingredient_id": ex["id"], "ingredient_nome": ex["name"],
                    "candidati": [], "occorrenze": a["occorrenze"],
                    "unita_suggerita": ex["default_unit"] or _imp_unit(a["unita_voci"]),
                })
            else:
                cand = [
                    {"id": ir["id"], "nome": ir["name"], "score": _imp_score(a["nome"], ir["name"])}
                    for ir in ing_rows
                ]
                cand = sorted((c for c in cand if c["score"] >= 60),
                              key=lambda c: c["score"], reverse=True)[:5]
                stato = "da_confermare" if (cand and cand[0]["score"] >= 84) else "nuovo"
                ingredienti_out.append({
                    "nome": a["nome"], "stato": stato,
                    "ingredient_id": None, "ingredient_nome": None,
                    "candidati": cand, "occorrenze": a["occorrenze"],
                    "unita_suggerita": _imp_unit(a["unita_voci"]),
                })

        sub_out = []
        for k, a in sorted(sub_acc.items()):
            ex = rec_by_key.get(k)
            if ex:
                stato, rid, cand = "trovata", ex["id"], []
            elif k in file_recipe_keys:
                stato, rid, cand = "nel_file", None, []
            else:
                cand = [
                    {"id": rr["id"], "nome": rr["name"], "score": _imp_score(a["nome"], rr["name"])}
                    for rr in rec_rows
                ]
                cand = sorted((c for c in cand if c["score"] >= 60),
                              key=lambda c: c["score"], reverse=True)[:5]
                stato, rid = "nuova", None
            sub_out.append({
                "nome": a["nome"], "stato": stato,
                "recipe_id": rid, "candidati": cand, "occorrenze": a["occorrenze"],
            })

        return {
            "ricette": ricette_out,
            "ingredienti": ingredienti_out,
            "sotto_ricette": sub_out,
            "totali": {
                "ricette": len(ricette_out),
                "ricette_con_errori": sum(1 for r in ricette_out if r["errori"]),
                "ingredienti_totali": len(ingredienti_out),
                "ingredienti_trovati": sum(1 for i in ingredienti_out if i["stato"] == "trovato"),
                "ingredienti_da_confermare": sum(1 for i in ingredienti_out if i["stato"] == "da_confermare"),
                "ingredienti_nuovi": sum(1 for i in ingredienti_out if i["stato"] == "nuovo"),
                "sotto_ricette_totali": len(sub_out),
            },
        }
    finally:
        conn.close()


@router.post("/ricette/import/conferma")
def import_conferma_ricette(payload: ImportConfermaPayload):
    """
    Esegue l'import: crea gli ingredienti placeholder decisi dall'utente, poi
    crea le ricette in 2 passate (header + voci) risolvendo le sotto-ricette.
    """
    now = datetime.utcnow().isoformat()
    conn = get_cucina_connection()
    cur = conn.cursor()
    warnings: List[str] = []
    try:
        ing_resol = {r.nome.strip().lower(): r for r in payload.ingredienti if (r.nome or "").strip()}
        sub_resol = {r.nome.strip().lower(): r for r in payload.sotto_ricette if (r.nome or "").strip()}

        cat_by_key = {
            r["name"].strip().lower(): r["id"]
            for r in cur.execute("SELECT id, name FROM recipe_categories").fetchall()
        }
        ing_cat_by_key = {
            r["name"].strip().lower(): r["id"]
            for r in cur.execute("SELECT id, name FROM ingredient_categories").fetchall()
        }
        existing_rec = {
            r["name"].strip().lower(): r["id"]
            for r in cur.execute("SELECT id, name FROM recipes WHERE is_active = 1").fetchall()
        }

        ing_cols = {row[1] for row in cur.execute("PRAGMA table_info(ingredients)").fetchall()}
        has_placeholder_col = "placeholder" in ing_cols

        # 1. Risolvi/crea gli ingredienti → nome(lower) -> ingredient_id
        ing_id_map: Dict[str, int] = {}
        n_placeholder = 0
        for k, r in ing_resol.items():
            if r.azione == "usa" and r.ingredient_id:
                ing_id_map[k] = r.ingredient_id
                continue
            # crea placeholder
            cat_id = None
            if r.categoria and r.categoria.strip():
                ck = r.categoria.strip().lower()
                cat_id = ing_cat_by_key.get(ck)
                if not cat_id:
                    cur.execute("INSERT INTO ingredient_categories (name) VALUES (?)",
                                (r.categoria.strip().title(),))
                    cat_id = cur.lastrowid
                    ing_cat_by_key[ck] = cat_id
            unita = (r.unita or "kg").strip() or "kg"
            if has_placeholder_col:
                cur.execute(
                    "INSERT INTO ingredients (name, category_id, default_unit, note, "
                    "is_active, placeholder, created_at) VALUES (?, ?, ?, ?, 1, 1, ?)",
                    (r.nome.strip(), cat_id, unita,
                     "Placeholder da import ricette — da completare", now),
                )
            else:
                cur.execute(
                    "INSERT INTO ingredients (name, category_id, default_unit, note, "
                    "is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                    (r.nome.strip(), cat_id, unita,
                     "Placeholder da import ricette — da completare", now),
                )
            ing_id_map[k] = cur.lastrowid
            n_placeholder += 1

        # 2. Pass 1 — crea le ricette (solo header)
        rec_cols = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}
        has_menu_cols = "menu_name" in rec_cols and "kind" in rec_cols
        has_proc = "procedimento" in rec_cols

        created_recipes: Dict[str, int] = {}
        recipe_ids_in_order: List[Optional[int]] = []
        for r in payload.ricette:
            nome = (r.nome or "").strip()
            if not nome:
                warnings.append("Ricetta senza nome — saltata")
                recipe_ids_in_order.append(None)
                continue
            is_base_val = 1 if (r.tipo or "").strip().lower() == "base" else 0
            kind = "base" if is_base_val else "dish"
            cat_id = cat_by_key.get((r.categoria or "").strip().lower()) if r.categoria else None
            if r.categoria and cat_id is None:
                warnings.append(f"'{nome}': categoria '{r.categoria}' non riconosciuta — lasciata vuota")
            resa_q = r.resa_quantita if (r.resa_quantita and r.resa_quantita > 0) else 1.0
            resa_u = (r.resa_unita or "").strip() or ("kg" if is_base_val else "porzioni")
            if has_menu_cols:
                cur.execute(
                    "INSERT INTO recipes (name, category_id, is_base, yield_qty, yield_unit, "
                    "selling_price, prep_time, note, kind, is_active, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                    (nome, cat_id, is_base_val, resa_q, resa_u, r.prezzo_vendita,
                     r.tempo_preparazione_min, r.note, kind, now, now),
                )
            else:
                cur.execute(
                    "INSERT INTO recipes (name, category_id, is_base, yield_qty, yield_unit, "
                    "selling_price, prep_time, note, is_active, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                    (nome, cat_id, is_base_val, resa_q, resa_u, r.prezzo_vendita,
                     r.tempo_preparazione_min, r.note, now, now),
                )
            rid = cur.lastrowid
            proc_text = _proc_to_text(r.procedimento)
            if has_proc and proc_text:
                cur.execute(
                    "UPDATE recipes SET procedimento = ? WHERE id = ?",
                    (proc_text, rid),
                )
            created_recipes[nome.lower()] = rid
            recipe_ids_in_order.append(rid)

        # 3. Pass 2 — inserisci le voci risolvendo ingredienti e sotto-ricette
        n_voci = 0
        n_voci_saltate = 0
        for r, rid in zip(payload.ricette, recipe_ids_in_order):
            if rid is None:
                continue
            sort_order = 0
            for v in r.voci:
                has_ing = bool((v.ingrediente or "").strip())
                has_sub = bool((v.sotto_ricetta or "").strip())
                if has_ing == has_sub:
                    n_voci_saltate += 1
                    continue
                qb = _is_qb(v.unita)
                if not (v.unita or "").strip():
                    n_voci_saltate += 1
                    warnings.append(f"'{r.nome}': voce con unità mancante — saltata")
                    continue
                if not qb and (v.quantita is None or v.quantita <= 0):
                    n_voci_saltate += 1
                    warnings.append(f"'{r.nome}': voce con quantità mancante — saltata")
                    continue
                # Voce 'qb': quantità 0 (esclusa dal food cost), unità canonica "qb"
                voce_qty = 0.0 if qb else v.quantita
                voce_unit = "qb" if qb else v.unita.strip()

                ingredient_id = None
                sub_recipe_id = None
                if has_ing:
                    ingredient_id = ing_id_map.get(v.ingrediente.strip().lower())
                    if not ingredient_id:
                        n_voci_saltate += 1
                        warnings.append(f"'{r.nome}': ingrediente '{v.ingrediente}' non risolto — voce saltata")
                        continue
                else:
                    sk = v.sotto_ricetta.strip().lower()
                    res = sub_resol.get(sk)
                    if res and res.azione == "salta":
                        n_voci_saltate += 1
                        continue
                    if res and res.azione == "usa" and res.recipe_id:
                        sub_recipe_id = res.recipe_id
                    elif sk in created_recipes:
                        sub_recipe_id = created_recipes[sk]
                    elif sk in existing_rec:
                        sub_recipe_id = existing_rec[sk]
                    if not sub_recipe_id:
                        n_voci_saltate += 1
                        warnings.append(f"'{r.nome}': sotto-ricetta '{v.sotto_ricetta}' non risolta — voce saltata")
                        continue

                sort_order += 1
                cur.execute(
                    "INSERT INTO recipe_items (recipe_id, ingredient_id, sub_recipe_id, "
                    "qty, unit, sort_order, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (rid, ingredient_id, sub_recipe_id, voce_qty, voce_unit,
                     sort_order, v.note, now),
                )
                n_voci += 1

        conn.commit()

        # 4. Ricalcolo allergeni (best-effort, dopo il commit dei dati)
        for rid in recipe_ids_in_order:
            if rid is None:
                continue
            try:
                update_recipe_allergens_cache(rid, conn=conn)
            except Exception:
                pass
        conn.commit()

        return {
            "status": "ok",
            "ricette_create": sum(1 for x in recipe_ids_in_order if x is not None),
            "ingredienti_placeholder": n_placeholder,
            "voci_inserite": n_voci,
            "voci_saltate": n_voci_saltate,
            "warnings": warnings,
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore import: {e}") from e
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: AGGIORNA RICETTA
# ─────────────────────────────────────────────

@router.put("/ricette/{recipe_id}", response_model=RecipeOut)
def update_ricetta(recipe_id: int, payload: RecipeUpdate):
    now = datetime.utcnow().isoformat()
    conn = get_cucina_connection()
    cur = conn.cursor()

    # Verifica che esista
    existing = cur.execute("SELECT id FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    try:
        # Columns esistenti (per UPDATE robusta pre-mig)
        cols = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}
        has_menu_cols = "menu_name" in cols and "kind" in cols
        has_proc = "procedimento" in cols

        # Derivazione kind <-> is_base se uno dei due fornito
        new_kind = None
        new_is_base = None
        if payload.kind is not None:
            k = payload.kind.strip().lower()
            if k not in ("dish", "base"):
                raise HTTPException(status_code=400, detail="kind deve essere 'dish' o 'base'")
            new_kind = k
            new_is_base = 1 if k == "base" else 0
        elif payload.is_base is not None:
            new_is_base = 1 if payload.is_base else 0
            new_kind = "base" if new_is_base == 1 else "dish"

        # Aggiorna campi header (solo quelli forniti)
        updates = []
        params = []
        field_map = {
            "name": payload.name,
            "category_id": payload.category_id,
            "is_base": new_is_base,
            "yield_qty": payload.yield_qty,
            "yield_unit": payload.yield_unit,
            "selling_price": payload.selling_price,
            "prep_time": payload.prep_time,
            "note": payload.note,
        }
        if has_menu_cols:
            field_map["menu_name"] = payload.menu_name
            field_map["menu_description"] = payload.menu_description
            field_map["kind"] = new_kind
        if has_proc:
            field_map["procedimento"] = payload.procedimento

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

        # Aggiorna servizi (M:N) se forniti: sostituzione completa
        if payload.service_type_ids is not None:
            try:
                cur.execute(
                    "DELETE FROM recipe_service_types WHERE recipe_id = ?",
                    (recipe_id,),
                )
                for st_id in payload.service_type_ids:
                    cur.execute(
                        "INSERT OR IGNORE INTO recipe_service_types (recipe_id, service_type_id) VALUES (?, ?)",
                        (recipe_id, st_id),
                    )
            except Exception:
                pass

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

        # Modulo C: ricalcolo allergeni cache se gli items sono stati toccati
        # (anche su update header-only ricalcoliamo per allinearsi a eventuali
        # cambi ingredients.allergeni avvenuti nel frattempo — costo trascurabile)
        try:
            update_recipe_allergens_cache(recipe_id, conn=conn)
        except Exception as _e:
            import logging
            logging.getLogger("foodcost").warning(f"[allergeni] ricalcolo update fail recipe={recipe_id}: {_e}")

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
#   ENDPOINT: QUICK CREATE (dal wizard preventivi)
#   Crea un piatto minimal senza items/ricetta — puo' essere arricchito dopo
# ─────────────────────────────────────────────

@router.post("/ricette/quick", response_model=RecipeOut)
def quick_create_piatto(payload: RecipeQuickCreate):
    """Crea un piatto minimal dal wizard preventivo.

    - yield_qty/yield_unit default 1/porzione
    - kind = 'dish' (non una base)
    - is_active = 1
    - servizi opzionali
    """
    now = datetime.utcnow().isoformat()
    conn = get_cucina_connection()
    cur = conn.cursor()

    try:
        cols = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}
        has_menu_cols = "menu_name" in cols and "kind" in cols

        if has_menu_cols:
            cur.execute(
                """
                INSERT INTO recipes (name, category_id, is_base, yield_qty, yield_unit,
                                     selling_price, menu_name, menu_description, kind,
                                     is_active, created_at, updated_at)
                VALUES (?, ?, 0, 1, 'porzione', ?, ?, ?, 'dish', 1, ?, ?)
                """,
                (
                    payload.name.strip(),
                    payload.category_id,
                    payload.selling_price,
                    (payload.menu_name or None),
                    (payload.menu_description or None),
                    now,
                    now,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO recipes (name, category_id, is_base, yield_qty, yield_unit,
                                     selling_price, is_active, created_at, updated_at)
                VALUES (?, ?, 0, 1, 'porzione', ?, 1, ?, ?)
                """,
                (
                    payload.name.strip(),
                    payload.category_id,
                    payload.selling_price,
                    now,
                    now,
                ),
            )
        recipe_id = cur.lastrowid

        if payload.service_type_ids:
            for st_id in payload.service_type_ids:
                try:
                    cur.execute(
                        "INSERT OR IGNORE INTO recipe_service_types (recipe_id, service_type_id) VALUES (?, ?)",
                        (recipe_id, st_id),
                    )
                except Exception:
                    pass

        conn.commit()
        return _fetch_recipe_full(conn, recipe_id)

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore quick create: {e}") from e
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: SET SERVIZI DI UN PIATTO
# ─────────────────────────────────────────────

class RecipeServiziPayload(BaseModel):
    service_type_ids: List[int] = []


@router.put("/ricette/{recipe_id}/servizi", response_model=RecipeOut)
def set_recipe_servizi(recipe_id: int, payload: RecipeServiziPayload):
    """Imposta (sostituisce) la lista dei tipi servizio associati a un piatto."""
    conn = get_cucina_connection()
    cur = conn.cursor()

    existing = cur.execute("SELECT id FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    try:
        cur.execute("DELETE FROM recipe_service_types WHERE recipe_id = ?", (recipe_id,))
        for st_id in payload.service_type_ids:
            cur.execute(
                "INSERT OR IGNORE INTO recipe_service_types (recipe_id, service_type_id) VALUES (?, ?)",
                (recipe_id, st_id),
            )
        conn.commit()
        return _fetch_recipe_full(conn, recipe_id)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore servizi: {e}") from e
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: ALLERGENI (Modulo C, 2026-04-27)
# ─────────────────────────────────────────────

class AllergeniRecalcOut(BaseModel):
    recipe_id: int
    allergeni_calcolati: str  # CSV


class AllergeniBatchOut(BaseModel):
    totale_ricette: int
    con_allergeni: int
    senza_allergeni: int
    dettaglio: List[Dict[str, Any]] = []


@router.post("/ricette/{recipe_id}/ricalcola-allergeni", response_model=AllergeniRecalcOut)
def ricalcola_allergeni_singola(recipe_id: int):
    """
    Ricalcola allergeni di una singola ricetta (cache aggiornata).
    Trigger automatico esiste su POST/PUT ricetta. Questo endpoint serve
    quando Marco modifica gli allergeni di un ingrediente e vuole
    rifrescare manualmente le ricette che lo usano (in attesa che qualcuno
    le risalvi).
    """
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Ricetta non trovata")
        csv = update_recipe_allergens_cache(recipe_id, conn=conn)
        conn.commit()
        return AllergeniRecalcOut(recipe_id=recipe_id, allergeni_calcolati=csv)
    finally:
        conn.close()


@router.post("/ricette/ricalcola-allergeni-tutti", response_model=AllergeniBatchOut)
def ricalcola_allergeni_tutti(user=Depends(get_current_user)):
    """
    Ricalcola allergeni per TUTTE le ricette attive (batch).
    Riservato admin/chef: usare dopo modifiche massive a ingredients.allergeni.
    """
    role = (user or {}).get("role", "")
    if role not in ("superadmin", "admin", "chef"):
        raise HTTPException(status_code=403, detail="Operazione riservata ad admin/chef")
    stats = recompute_all_recipes_allergens()
    return AllergeniBatchOut(**stats)


# ─────────────────────────────────────────────
#   ENDPOINT: STORICO FC RICETTA (Modulo F.2, 2026-04-27)
# ─────────────────────────────────────────────

@router.get("/ricette/{recipe_id}/storico-fc")
def get_storico_fc(
    recipe_id: int,
    giorni: int = 180,
    intervallo: str = "mese",
):
    """
    Ricostruisce storico Food Cost ricetta su finestra temporale (default 180gg/6 mesi).
    Per ogni snapshot mensile (o settimanale): costo, FC%, % ingredienti con prezzo.
    Include delta 30gg e 90gg con flag alert se variazione assoluta >= 20%.
    """
    if intervallo not in ("mese", "settimana"):
        raise HTTPException(400, "intervallo deve essere 'mese' o 'settimana'")
    if giorni < 7 or giorni > 730:
        raise HTTPException(400, "giorni deve essere tra 7 e 730")
    return compute_recipe_fc_history(recipe_id, giorni, intervallo)


# ─────────────────────────────────────────────
#   ENDPOINT: CRUD SERVICE TYPES (Impostazioni Cucina)
#   Regola granitica: configurazioni in Impostazioni, mai hardcoded
# ─────────────────────────────────────────────

@router.get("/service-types", response_model=List[ServiceTypeOut])
def list_service_types(include_inactive: bool = False):
    """Lista tipi servizio (Alla carta, Banchetto, Pranzo lavoro, Aperitivo, custom...)."""
    conn = get_cucina_connection()
    where = "" if include_inactive else "WHERE active = 1"
    rows = conn.execute(
        f"""
        SELECT id, name, sort_order, active
        FROM service_types
        {where}
        ORDER BY sort_order, name COLLATE NOCASE
        """
    ).fetchall()
    conn.close()
    return [
        ServiceTypeOut(
            id=r["id"], name=r["name"],
            sort_order=r["sort_order"] or 0,
            active=bool(r["active"]),
        ) for r in rows
    ]


@router.post("/service-types", response_model=ServiceTypeOut)
def create_service_type(payload: ServiceTypeIn):
    conn = get_cucina_connection()
    cur = conn.cursor()

    name = payload.name.strip()
    existing = cur.execute(
        "SELECT id, name, sort_order, active FROM service_types WHERE LOWER(name) = LOWER(?)",
        (name,),
    ).fetchone()
    if existing:
        conn.close()
        return ServiceTypeOut(
            id=existing["id"], name=existing["name"],
            sort_order=existing["sort_order"] or 0,
            active=bool(existing["active"]),
        )

    try:
        cur.execute(
            "INSERT INTO service_types (name, sort_order, active) VALUES (?, ?, ?)",
            (name, payload.sort_order, 1 if payload.active else 0),
        )
        new_id = cur.lastrowid
        conn.commit()
        row = cur.execute(
            "SELECT id, name, sort_order, active FROM service_types WHERE id = ?",
            (new_id,),
        ).fetchone()
        return ServiceTypeOut(
            id=row["id"], name=row["name"],
            sort_order=row["sort_order"] or 0,
            active=bool(row["active"]),
        )
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore creazione tipo servizio: {e}") from e
    finally:
        conn.close()


@router.put("/service-types/{st_id}", response_model=ServiceTypeOut)
def update_service_type(st_id: int, payload: ServiceTypeIn):
    conn = get_cucina_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id FROM service_types WHERE id = ?", (st_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Tipo servizio non trovato")

    try:
        cur.execute(
            """
            UPDATE service_types
            SET name = ?, sort_order = ?, active = ?
            WHERE id = ?
            """,
            (payload.name.strip(), payload.sort_order, 1 if payload.active else 0, st_id),
        )
        conn.commit()
        row = cur.execute(
            "SELECT id, name, sort_order, active FROM service_types WHERE id = ?",
            (st_id,),
        ).fetchone()
        return ServiceTypeOut(
            id=row["id"], name=row["name"],
            sort_order=row["sort_order"] or 0,
            active=bool(row["active"]),
        )
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento tipo servizio: {e}") from e
    finally:
        conn.close()


@router.delete("/service-types/{st_id}")
def delete_service_type(st_id: int):
    """Soft delete: imposta active=0. Non cancella associazioni esistenti con piatti."""
    conn = get_cucina_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id FROM service_types WHERE id = ?", (st_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Tipo servizio non trovato")

    cur.execute("UPDATE service_types SET active = 0 WHERE id = ?", (st_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "detail": "Tipo servizio disattivato"}


# ─────────────────────────────────────────────
#   ENDPOINT: DISATTIVA RICETTA
# ─────────────────────────────────────────────

@router.delete("/ricette/{recipe_id}")
def delete_ricetta(recipe_id: int):
    """Soft delete — imposta is_active = 0."""
    conn = get_cucina_connection()
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
#   ENDPOINT: ELIMINA RICETTA DEFINITIVAMENTE (2026-06-07)
# ─────────────────────────────────────────────

@router.delete("/ricette/{recipe_id}/hard")
def delete_ricetta_hard(recipe_id: int):
    """
    Eliminazione DEFINITIVA di una ricetta (richiesta Marco 2026-06-07).

    Protezioni di integrità (HTTP 409 con motivo):
      - usata come sub-ricetta in altre ricette (recipe_items.sub_recipe_id)
      - pubblicata sul menu carta (menu_dish_publications)

    Cosa elimina/scollega (transazione unica):
      - recipe_items della ricetta (i suoi ingredienti)
      - recipe_service_types (tag pool pranzo ecc.)
      - pranzo_menu_righe.recipe_id → NULL (lo storico menu pranzo resta:
        nome/categoria sono snapshot)
      - pranzo_piatti.recipe_id → NULL (tabella legacy v1.0)
      - la riga in recipes

    NB: i DELETE/UPDATE sono espliciti, non ci si affida alle FK CASCADE
    (PRAGMA foreign_keys non è garantito ON su ogni connessione).
    """
    conn = get_cucina_connection()
    cur = conn.cursor()

    try:
        existing = cur.execute(
            "SELECT id, name FROM recipes WHERE id = ?", (recipe_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Ricetta non trovata")

        # Protezione 1: sub-ricetta di altre ricette
        usata_in = cur.execute(
            """SELECT DISTINCT r.name
                 FROM recipe_items ri JOIN recipes r ON r.id = ri.recipe_id
                WHERE ri.sub_recipe_id = ?
                LIMIT 5""",
            (recipe_id,),
        ).fetchall()
        if usata_in:
            nomi = ", ".join(f'"{u["name"]}"' for u in usata_in)
            raise HTTPException(
                status_code=409,
                detail=f"Non eliminabile: è usata come sub-ricetta in {nomi}. Rimuovila prima da quelle composizioni.",
            )

        # Protezione 2: pubblicata sul menu carta
        n_pub = cur.execute(
            "SELECT COUNT(*) FROM menu_dish_publications WHERE recipe_id = ?",
            (recipe_id,),
        ).fetchone()[0]
        if n_pub:
            raise HTTPException(
                status_code=409,
                detail=f"Non eliminabile: è pubblicata sul menu carta ({n_pub} pubblicazioni). Rimuovila prima dalle edizioni del menu.",
            )

        # Eliminazione esplicita in transazione
        cur.execute("DELETE FROM recipe_items WHERE recipe_id = ?", (recipe_id,))
        cur.execute("DELETE FROM recipe_service_types WHERE recipe_id = ?", (recipe_id,))
        cur.execute("UPDATE pranzo_menu_righe SET recipe_id = NULL WHERE recipe_id = ?", (recipe_id,))
        try:
            # tabella legacy v1.0 — può non esistere su DB nuovi
            cur.execute("UPDATE pranzo_piatti SET recipe_id = NULL WHERE recipe_id = ?", (recipe_id,))
        except Exception:
            pass
        cur.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
        conn.commit()
        return {"status": "ok", "detail": f'Ricetta "{existing["name"]}" eliminata definitivamente'}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Eliminazione fallita: {e}")
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: CLONE RICETTA (Modulo L, 2026-04-27)
# ─────────────────────────────────────────────

@router.post("/ricette/{recipe_id}/clone", response_model=RecipeOut)
def clone_ricetta(recipe_id: int):
    """
    Duplica una ricetta esistente:
      - copia header (recipes) con nome "<orig> (copia)" e is_active=1 (subito attiva)
      - copia tutti i recipe_items (ingredienti + sub-ricette)
      - copia tutti i recipe_service_types
      - ricalcolo allergeni automatico (trigger Modulo C)

    Atomic: tutto in una transazione, rollback completo su errore.
    """
    now = datetime.utcnow().isoformat()
    conn = get_cucina_connection()
    cur = conn.cursor()

    # Verifica origine
    orig = cur.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not orig:
        conn.close()
        raise HTTPException(status_code=404, detail="Ricetta origine non trovata")

    try:
        # Detect colonne disponibili (robusto pre-mig)
        cols = {row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()}
        has_menu_cols = "menu_name" in cols and "kind" in cols

        new_name = f"{orig['name']} (copia)"

        if has_menu_cols:
            cur.execute(
                """
                INSERT INTO recipes (
                    name, category_id, is_base, yield_qty, yield_unit,
                    selling_price, prep_time, note, is_active,
                    menu_name, menu_description, kind,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
                """,
                (
                    new_name, orig["category_id"], orig["is_base"],
                    orig["yield_qty"], orig["yield_unit"],
                    orig["selling_price"], orig["prep_time"], orig["note"],
                    orig["menu_name"], orig["menu_description"], orig["kind"],
                    now, now,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO recipes (
                    name, category_id, is_base, yield_qty, yield_unit,
                    selling_price, prep_time, note, is_active,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    new_name, orig["category_id"], orig["is_base"],
                    orig["yield_qty"], orig["yield_unit"],
                    orig["selling_price"], orig["prep_time"], orig["note"],
                    now, now,
                ),
            )
        new_id = cur.lastrowid

        # Copia recipe_items
        items = cur.execute(
            "SELECT ingredient_id, sub_recipe_id, qty, unit, sort_order, note FROM recipe_items WHERE recipe_id = ? ORDER BY sort_order, id",
            (recipe_id,),
        ).fetchall()
        for it in items:
            cur.execute(
                """
                INSERT INTO recipe_items (recipe_id, ingredient_id, sub_recipe_id, qty, unit, sort_order, note, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (new_id, it["ingredient_id"], it["sub_recipe_id"], it["qty"], it["unit"], it["sort_order"], it["note"], now),
            )

        # Copia recipe_service_types (ignora errori se tabella non esiste)
        try:
            sts = cur.execute(
                "SELECT service_type_id FROM recipe_service_types WHERE recipe_id = ?",
                (recipe_id,),
            ).fetchall()
            for st in sts:
                cur.execute(
                    "INSERT OR IGNORE INTO recipe_service_types (recipe_id, service_type_id) VALUES (?, ?)",
                    (new_id, st["service_type_id"]),
                )
        except Exception:
            pass

        # Trigger allergeni (Modulo C)
        try:
            update_recipe_allergens_cache(new_id, conn=conn)
        except Exception as _e:
            import logging
            logging.getLogger("foodcost").warning(f"[allergeni] clone ricalcolo fail recipe={new_id}: {_e}")

        conn.commit()
        return _fetch_recipe_full(conn, new_id)

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore clone: {e}") from e
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: EXPORT RICETTA SINGOLA → PDF
# ─────────────────────────────────────────────

@router.get("/ricette/{recipe_id}/pdf")
def export_ricetta_pdf(recipe_id: int):
    """Genera un PDF con il dettaglio di una ricetta e il suo food cost."""
    conn = get_cucina_connection()
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

    # ── Genera PDF con mattone M.B (pdf_brand) ──
    from app.services.pdf_brand import genera_pdf_html
    from fastapi.responses import Response

    items_dicts = [dict(it) for it in items]

    pdf_bytes = genera_pdf_html(
        template="ricetta.html",
        dati={"r": r, "items": items_dicts},
        titolo=f"Ricetta — {r['name']}",
        sottotitolo=r.get("category_name") or None,
        orientamento="portrait",
    )

    safe_name = r["name"].replace(" ", "_").replace("/", "-")[:40]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ricetta_{safe_name}.pdf"},
    )
