#!/usr/bin/env python3
# @version: v1.0-ingredients-router

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from app.models.foodcost_db import get_foodcost_connection

router = APIRouter()


# ---------- SCHEMI Pydantic ----------

class IngredientCreate(BaseModel):
  name: str
  codice_interno: Optional[str] = None
  category_name: Optional[str] = None
  default_unit: str
  allergeni: Optional[str] = None
  note: Optional[str] = None


class IngredientOut(BaseModel):
  id: int
  name: str
  codice_interno: Optional[str]
  category_name: Optional[str]
  default_unit: str
  allergeni: Optional[str] = None
  note: Optional[str] = None
  is_active: bool


# ---------- UTILS INTERNI ----------

def _ensure_category(conn, name: Optional[str]) -> Optional[int]:
  if not name:
    return None
  cur = conn.cursor()
  cur.execute("SELECT id FROM ingredient_categories WHERE name = ?", (name,))
  row = cur.fetchone()
  if row:
    return row["id"]
  cur.execute(
    "INSERT INTO ingredient_categories (name) VALUES (?)",
    (name,),
  )
  conn.commit()
  return cur.lastrowid


# ---------- ENDPOINTS ----------

@router.get("/", response_model=List[IngredientOut])
def list_ingredients():
  """
  Lista ingredienti base (senza storico prezzi),
  usata dalla pagina RicetteIngredienti.jsx.
  """
  conn = get_foodcost_connection()
  cur = conn.cursor()

  cur.execute(
    """
    SELECT 
      i.id,
      i.name,
      i.codice_interno,
      i.default_unit,
      i.allergeni,
      i.note,
      i.is_active,
      c.name AS category_name
    FROM ingredients i
    LEFT JOIN ingredient_categories c ON c.id = i.category_id
    ORDER BY i.name COLLATE NOCASE;
    """
  )
  rows = cur.fetchall()
  conn.close()

  return [
    IngredientOut(
      id=row["id"],
      name=row["name"],
      codice_interno=row["codice_interno"],
      category_name=row["category_name"],
      default_unit=row["default_unit"],
      allergeni=row["allergeni"],
      note=row["note"],
      is_active=bool(row["is_active"]),
    )
    for row in rows
  ]


@router.post("/", response_model=IngredientOut)
def create_ingredient(payload: IngredientCreate):
  """
  Inserimento manuale ingrediente singolo.
  """
  conn = get_foodcost_connection()
  cur = conn.cursor()

  category_id = _ensure_category(conn, payload.category_name)

  cur.execute(
    """
    INSERT INTO ingredients
      (name, codice_interno, category_id, default_unit, allergeni, note, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    """,
    (
      payload.name.strip(),
      (payload.codice_interno or None),
      category_id,
      payload.default_unit.strip(),
      (payload.allergeni or None),
      (payload.note or None),
    ),
  )
  conn.commit()
  new_id = cur.lastrowid

  cur.execute(
    """
    SELECT 
      i.id,
      i.name,
      i.codice_interno,
      i.default_unit,
      i.allergeni,
      i.note,
      i.is_active,
      c.name AS category_name
    FROM ingredients i
    LEFT JOIN ingredient_categories c ON c.id = i.category_id
    WHERE i.id = ?
    """,
    (new_id,),
  )
  row = cur.fetchone()
  conn.close()

  if not row:
    raise HTTPException(status_code=500, detail="Errore creazione ingrediente.")

  return IngredientOut(
    id=row["id"],
    name=row["name"],
    codice_interno=row["codice_interno"],
    category_name=row["category_name"],
    default_unit=row["default_unit"],
    allergeni=row["allergeni"],
    note=row["note"],
    is_active=bool(row["is_active"]),
  )