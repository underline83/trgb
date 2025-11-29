 #!/usr/bin/env python3
# @version: v1.3-foodcost-ingredients-router
# -*- coding: utf-8 -*-
"""
Router anagrafica ingredienti (foodcost)

Gestisce:
- lista ingredienti (con categoria, unità base, ultimo prezzo + fornitore)
- creazione nuovo ingrediente
  (con eventuale primo prezzo iniziale collegato a un fornitore)

DB: foodcost.db — vedi docs/database-foodcost.md

Path effettivi (main.py):
  app.include_router(
      foodcost_ingredients_router.router,
      prefix="/foodcost",
      tags=["foodcost-ingredients"]
  )

→ /foodcost/ingredients                (GET, POST)
→ /foodcost/ingredients/categories     (GET, POST)
→ /foodcost/ingredients/units         (GET)
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection


# N.B.: prefix "/ingredients" sarà aggiunto a "/foodcost" dal main
router = APIRouter(prefix="/ingredients", tags=["foodcost-ingredients"])


# ─────────────────────────────────────────────
#   COSTANTI / ENUM SEMPLIFICATE
# ─────────────────────────────────────────────

# Per ora lista fissa di unità "consigliate" per default_unit
DEFAULT_UNITS = [
    "kg",
    "g",
    "L",
    "ml",
    "pz",
    "cl",
]


# ─────────────────────────────────────────────
#   MODELLI Pydantic
# ─────────────────────────────────────────────

class IngredientCategory(BaseModel):
    id: int
    name: str
    description: Optional[str] = None


class IngredientListItem(BaseModel):
    """Riga per elenco ingredienti in UI."""
    id: int
    name: str
    category_name: Optional[str] = None
    default_unit: str
    last_price: Optional[float] = None
    last_supplier_name: Optional[str] = None


class IngredientCreate(BaseModel):
    """
    Payload di creazione ingrediente da UI.

    Notare:
    - category_id: se scelgo una categoria già esistente
    - category_name: se scrivo una categoria nuova (e la creiamo al volo)
    - default_unit: deve essere una delle DEFAULT_UNITS lato UI (ma il backend non forza ancora)
    - opzionalmente: primo prezzo associato a un fornitore
    """
    name: str = Field(..., min_length=1)
    default_unit: str = Field(..., min_length=1)

    category_id: Optional[int] = None
    category_name: Optional[str] = None

    codice_interno: Optional[str] = None
    allergeni: Optional[str] = None
    note: Optional[str] = None

    # Primo prezzo opzionale
    initial_supplier_id: Optional[int] = None
    initial_unit_price: Optional[float] = None
    initial_quantity: Optional[float] = None
    initial_unit: Optional[str] = None
    initial_price_date: Optional[str] = None   # ISO (YYYY-MM-DD) o None


class IngredientDetail(BaseModel):
    """
    Dettaglio ingrediente (per schermate future).
    Per ora allineato a ingredients + categoria.
    """
    id: int
    name: str
    default_unit: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    codice_interno: Optional[str] = None
    allergeni: Optional[str] = None
    note: Optional[str] = None
    is_active: int = 1
    created_at: Optional[str] = None


# ─────────────────────────────────────────────
#   FUNZIONI DI SUPPORTO
# ─────────────────────────────────────────────

def _ensure_category(conn, category_id: Optional[int], name: Optional[str]) -> Optional[int]:
    """
    Ritorna l'ID della categoria:

    - se category_id è valorizzato → verifica che esista, altrimenti 404.
    - se category_id è None MA name è valorizzato → crea (o riusa se già esiste).
    - se entrambi None → ritorna None (ingrediente senza categoria).

    Lato UI, mappiamo:
      - se utente sceglie da combo esistente → category_id
      - se utente scrive testo nuovo → category_name
    """
    cur = conn.cursor()

    if category_id is not None:
        cur.execute(
            "SELECT id FROM ingredient_categories WHERE id = ?",
            (category_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Categoria non trovata")
        return category_id

    if name:
        name_clean = name.strip()
        if not name_clean:
            return None

        # Provo a riusare se esiste già
        cur.execute(
            "SELECT id FROM ingredient_categories WHERE name = ?",
            (name_clean,),
        )
        row = cur.fetchone()
        if row:
            return row["id"]

        # Creo nuova categoria
        cur.execute(
            "INSERT INTO ingredient_categories (name) VALUES (?)",
            (name_clean,),
        )
        conn.commit()
        return cur.lastrowid

    return None


def _insert_initial_price(conn, ingredient_id: int, payload: IngredientCreate):
    """
    Se nel payload è presente initial_supplier_id + initial_unit_price,
    crea una riga in ingredient_prices.
    """
    if payload.initial_supplier_id is None or payload.initial_unit_price is None:
        return

    cur = conn.cursor()

    # Validazione minima fornitore
    cur.execute(
        "SELECT id FROM suppliers WHERE id = ?",
        (payload.initial_supplier_id,),
    )
    if not cur.fetchone():
        raise HTTPException(status_code=400, detail="Fornitore iniziale non trovato")

    # Data prezzo
    if payload.initial_price_date:
        price_date = payload.initial_price_date
    else:
        price_date = date.today().isoformat()

    cur.execute(
        """
        INSERT INTO ingredient_prices (
            ingredient_id,
            supplier_id,
            price_date,
            unit_price,
            quantity,
            unit
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            ingredient_id,
            payload.initial_supplier_id,
            price_date,
            float(payload.initial_unit_price),
            float(payload.initial_quantity) if payload.initial_quantity is not None else None,
            payload.initial_unit,
        ),
    )
    conn.commit()


# ─────────────────────────────────────────────
#   ENDPOINT: UNITÀ DISPONIBILI
#   GET /foodcost/ingredients/units
# ─────────────────────────────────────────────

@router.get("/units", response_model=List[str])
def list_default_units():
    """
    Ritorna la lista di unità di misura suggerite per default_unit.

    Lato UI, questa lista va usata per il select a tendina.
    """
    return DEFAULT_UNITS


# ─────────────────────────────────────────────
#   ENDPOINT: CATEGORIE
#   GET /foodcost/ingredients/categories
#   POST /foodcost/ingredients/categories
# ─────────────────────────────────────────────

@router.get("/categories", response_model=List[IngredientCategory])
def list_categories():
    conn = get_foodcost_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, description FROM ingredient_categories ORDER BY name COLLATE NOCASE"
    )
    rows = cur.fetchall()
    conn.close()
    return [IngredientCategory(**dict(r)) for r in rows]


class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None


@router.post("/categories", response_model=IngredientCategory)
def create_category(payload: CategoryCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome categoria obbligatorio")

    conn = get_foodcost_connection()
    cur = conn.cursor()

    # Evitiamo duplicati
    cur.execute(
        "SELECT id, name, description FROM ingredient_categories WHERE name = ?",
        (name,),
    )
    existing = cur.fetchone()
    if existing:
        conn.close()
        return IngredientCategory(**dict(existing))

    cur.execute(
        "INSERT INTO ingredient_categories (name, description) VALUES (?, ?)",
        (name, payload.description),
    )
    new_id = cur.lastrowid
    conn.commit()

    cur.execute(
        "SELECT id, name, description FROM ingredient_categories WHERE id = ?",
        (new_id,),
    )
    row = cur.fetchone()
    conn.close()

    return IngredientCategory(**dict(row))


# ─────────────────────────────────────────────
#   ENDPOINT: LISTA INGREDIENTI
#   GET /foodcost/ingredients
# ─────────────────────────────────────────────

@router.get("/", response_model=List[IngredientListItem])
def list_ingredients():
    """
    Lista ingredienti attivi con:
    - name
    - categoria
    - default_unit
    - ultimo prezzo (se esiste)
    - nome ultimo fornitore
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            i.id,
            i.name,
            i.default_unit,
            c.name AS category_name,
            -- ultimo prezzo
            (
                SELECT p.unit_price
                FROM ingredient_prices p
                WHERE p.ingredient_id = i.id
                ORDER BY date(p.price_date) DESC, p.id DESC
                LIMIT 1
            ) AS last_price,
            -- ultimo fornitore
            (
                SELECT s.name
                FROM ingredient_prices p
                JOIN suppliers s ON s.id = p.supplier_id
                WHERE p.ingredient_id = i.id
                ORDER BY date(p.price_date) DESC, p.id DESC
                LIMIT 1
            ) AS last_supplier_name
        FROM ingredients i
        LEFT JOIN ingredient_categories c ON c.id = i.category_id
        WHERE i.is_active = 1
        ORDER BY i.name COLLATE NOCASE;
        """
    )
    rows = cur.fetchall()
    conn.close()

    return [
        IngredientListItem(
            id=row["id"],
            name=row["name"],
            category_name=row["category_name"],
            default_unit=row["default_unit"],
            last_price=row["last_price"],
            last_supplier_name=row["last_supplier_name"],
        )
        for row in rows
    ]


# ─────────────────────────────────────────────
#   ENDPOINT: CREA NUOVO INGREDIENTE
#   POST /foodcost/ingredients
# ─────────────────────────────────────────────

@router.post("/", response_model=IngredientDetail)
def create_ingredient(payload: IngredientCreate):
    """
    Crea un nuovo ingrediente su `ingredients` e, se forniti,
    registra anche un primo prezzo in `ingredient_prices`.

    Logica categoria:
    - se payload.category_id → usa quella (verifica che esista)
    - altrimenti se category_name → crea/riusa `ingredient_categories`
    """
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome ingrediente obbligatorio")

    conn = get_foodcost_connection()
    cur = conn.cursor()

    # Gestione categoria
    category_id = _ensure_category(conn, payload.category_id, payload.category_name)

    # Inserimento ingrediente
    cur.execute(
        """
        INSERT INTO ingredients (
            name,
            codice_interno,
            category_id,
            default_unit,
            allergeni,
            note,
            is_active
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
        """,
        (
            name,
            payload.codice_interno,
            category_id,
            payload.default_unit.strip(),
            payload.allergeni,
            payload.note,
        ),
    )
    ingredient_id = cur.lastrowid
    conn.commit()

    # Eventuale primo prezzo
    _insert_initial_price(conn, ingredient_id, payload)

    # Ritorno dettaglio ingrediente appena creato
    cur.execute(
        """
        SELECT
            i.id,
            i.name,
            i.default_unit,
            i.codice_interno,
            i.category_id,
            i.allergeni,
            i.note,
            i.is_active,
            i.created_at,
            c.name AS category_name
        FROM ingredients i
        LEFT JOIN ingredient_categories c ON c.id = i.category_id
        WHERE i.id = ?
        """,
        (ingredient_id,),
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=500, detail="Errore nella creazione ingrediente")

    return IngredientDetail(
        id=row["id"],
        name=row["name"],
        default_unit=row["default_unit"],
        category_id=row["category_id"],
        category_name=row["category_name"],
        codice_interno=row["codice_interno"],
        allergeni=row["allergeni"],
        note=row["note"],
        is_active=row["is_active"],
        created_at=row["created_at"],
    )