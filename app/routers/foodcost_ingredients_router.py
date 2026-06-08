#!/usr/bin/env python3
# @version: v1.4-foodcost-ingredients-conversions
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

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.cucina_db import get_cucina_connection
from app.services.auth_service import get_current_user


# N.B.: prefix "/ingredients" sarà aggiunto a "/foodcost" dal main
router = APIRouter(prefix="/ingredients", tags=["foodcost-ingredients"], dependencies=[Depends(get_current_user)])


def _foodcost_finestra_giorni_ing(cur) -> int:
    """Finestra (giorni) prezzo corrente da foodcost_settings. Default 90."""
    try:
        row = cur.execute(
            "SELECT prezzo_finestra_giorni FROM foodcost_settings WHERE id = 1"
        ).fetchone()
        if row and row["prezzo_finestra_giorni"]:
            return int(row["prezzo_finestra_giorni"])
    except Exception:
        pass
    return 90


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
    placeholder: bool = False  # creato da import ricette, da completare
    conversione_da_verificare: bool = False  # ha un collegamento con unità incompatibile


def _unit_family(u):
    """Famiglia dell'unità: 'peso', 'volume', 'pz' o None."""
    s = (u or "").strip().lower()
    if s in ("kg", "g", "gr", "grm", "grammi", "mg", "kgm", "chilo", "kilo"):
        return "peso"
    if s in ("l", "lt", "ltr", "litri", "litro", "ml", "mlt", "cl"):
        return "volume"
    if s in ("pz", "pezzi", "pezzo", "nr"):
        return "pz"
    return None


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
    placeholder: int = 0  # 1 = creato da import ricette, da completare
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
    conn = get_cucina_connection()
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

    conn = get_cucina_connection()
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
def list_ingredients(inattivi: int = 0):
    """
    Lista ingredienti con name, categoria, default_unit, ultimo prezzo e
    nome ultimo fornitore.

    `inattivi=1` → restituisce gli ingredienti DISATTIVATI invece degli attivi.
    """
    conn = get_cucina_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            i.id,
            i.name,
            i.default_unit,
            COALESCE(i.placeholder, 0) AS placeholder,
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
        WHERE i.is_active = ?
        ORDER BY i.name COLLATE NOCASE;
        """,
        (0 if inattivi else 1,),
    )
    rows = cur.fetchall()

    # Flag "conversione da verificare": ingredienti che hanno almeno un
    # collegamento fattura con unità di famiglia diversa dall'unità base
    # (es. un mapping in PZ su un ingrediente in grammi) E senza un fattore
    # di conversione reale impostato. Appena l'utente corregge la conversione
    # (fattore != 1) il collegamento non è più sospetto.
    maps_by_ing = {}
    for m in cur.execute(
        "SELECT ingredient_id, unita_fornitore, fattore_conversione FROM ingredient_supplier_map"
    ).fetchall():
        maps_by_ing.setdefault(m["ingredient_id"], []).append(
            (m["unita_fornitore"], m["fattore_conversione"])
        )

    # Prezzo corrente robusto (mediana finestra, fix Sedano 2026-06-08).
    # Una sola query per tutti gli ingredienti (no N+1): prendo i prezzi nella
    # finestra, raggruppo in Python, calcolo la mediana. Dove la finestra è
    # vuota resta il `last_price` (ultimo prezzo) come fallback.
    finestra = _foodcost_finestra_giorni_ing(cur)
    prezzi_finestra: dict = {}
    for pr in cur.execute(
        """
        SELECT ingredient_id, unit_price
        FROM ingredient_prices
        WHERE unit_price IS NOT NULL
          AND date(price_date) >= date('now', ?)
        """,
        (f"-{int(finestra)} days",),
    ).fetchall():
        prezzi_finestra.setdefault(pr["ingredient_id"], []).append(pr["unit_price"])
    conn.close()

    sospetti = set()
    for row in rows:
        fam_base = _unit_family(row["default_unit"])
        if not fam_base:
            continue
        for u, fattore in maps_by_ing.get(row["id"], []):
            fu = _unit_family(u)
            if fu and fu != fam_base and not (fattore and fattore != 1):
                sospetti.add(row["id"])
                break

    def _mediana(vals):
        v = sorted(x for x in vals if x is not None)
        if not v:
            return None
        n = len(v); m = n // 2
        return float(v[m]) if n % 2 else (float(v[m - 1]) + float(v[m])) / 2.0

    out = []
    for row in rows:
        med = _mediana(prezzi_finestra.get(row["id"], []))
        prezzo_corrente = med if med is not None else row["last_price"]
        out.append(IngredientListItem(
            id=row["id"],
            name=row["name"],
            category_name=row["category_name"],
            default_unit=row["default_unit"],
            last_price=prezzo_corrente,
            last_supplier_name=row["last_supplier_name"],
            placeholder=bool(row["placeholder"]),
            conversione_da_verificare=row["id"] in sospetti,
        ))
    return out


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

    conn = get_cucina_connection()
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


# ─────────────────────────────────────────────
#   ENDPOINT: AGGIORNA INGREDIENTE
#   PUT /foodcost/ingredients/{ingredient_id}
# ─────────────────────────────────────────────

class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    default_unit: Optional[str] = None
    category_id: Optional[int] = None
    codice_interno: Optional[str] = None
    allergeni: Optional[str] = None
    note: Optional[str] = None
    is_active: Optional[int] = None
    placeholder: Optional[int] = None  # impostare a 0 per "completare" un placeholder


def _fetch_ingredient_detail(cur, ingredient_id: int):
    """Ritorna la Row di dettaglio ingrediente (con categoria e placeholder) o None."""
    return cur.execute(
        """
        SELECT i.id, i.name, i.default_unit, i.codice_interno, i.category_id,
               i.allergeni, i.note, i.is_active, COALESCE(i.placeholder, 0) AS placeholder,
               i.created_at, c.name AS category_name
        FROM ingredients i
        LEFT JOIN ingredient_categories c ON c.id = i.category_id
        WHERE i.id = ?
        """,
        (ingredient_id,),
    ).fetchone()


@router.put("/{ingredient_id}", response_model=IngredientDetail)
def update_ingredient(ingredient_id: int, payload: IngredientUpdate):
    conn = get_cucina_connection()
    try:
        cur = conn.cursor()

        existing = cur.execute(
            "SELECT id FROM ingredients WHERE id = ?", (ingredient_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Ingrediente non trovato")

        # Colonne realmente presenti (la tabella ingredients NON ha updated_at)
        cols_present = {r[1] for r in cur.execute("PRAGMA table_info(ingredients)").fetchall()}

        updates = []
        params = []
        for col in ["name", "default_unit", "category_id", "codice_interno",
                    "allergeni", "note", "is_active", "placeholder"]:
            val = getattr(payload, col)
            if val is not None and col in cols_present:
                updates.append(f"{col} = ?")
                params.append(val.strip() if isinstance(val, str) else val)

        if updates:
            if "updated_at" in cols_present:
                updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(ingredient_id)
            cur.execute(
                f"UPDATE ingredients SET {', '.join(updates)} WHERE id = ?", params
            )
            conn.commit()

        row = _fetch_ingredient_detail(cur, ingredient_id)
        return IngredientDetail(**dict(row))
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento: {e}") from e
    finally:
        conn.close()


class IngredientMergeRequest(BaseModel):
    target_id: int  # ingrediente "vero" su cui far confluire questo


@router.post("/{ingredient_id}/merge")
def merge_ingredient(ingredient_id: int, payload: IngredientMergeRequest):
    """
    Unisce l'ingrediente {ingredient_id} (tipicamente un placeholder) in un
    ingrediente esistente: tutte le voci ricetta, i prezzi, i mapping fornitore
    e le conversioni vengono ripuntati sul target, poi l'ingrediente di
    partenza viene eliminato.
    """
    if payload.target_id == ingredient_id:
        raise HTTPException(status_code=400, detail="Origine e destinazione coincidono")

    conn = get_cucina_connection()
    cur = conn.cursor()
    try:
        src = cur.execute(
            "SELECT id, name FROM ingredients WHERE id = ?", (ingredient_id,)
        ).fetchone()
        if not src:
            raise HTTPException(status_code=404, detail="Ingrediente di origine non trovato")
        tgt = cur.execute(
            "SELECT id, name FROM ingredients WHERE id = ?", (payload.target_id,)
        ).fetchone()
        if not tgt:
            raise HTTPException(status_code=404, detail="Ingrediente di destinazione non trovato")

        n_voci = cur.execute(
            "UPDATE recipe_items SET ingredient_id = ? WHERE ingredient_id = ?",
            (payload.target_id, ingredient_id),
        ).rowcount
        cur.execute(
            "UPDATE ingredient_prices SET ingredient_id = ? WHERE ingredient_id = ?",
            (payload.target_id, ingredient_id),
        )
        cur.execute(
            "UPDATE ingredient_supplier_map SET ingredient_id = ? WHERE ingredient_id = ?",
            (payload.target_id, ingredient_id),
        )
        cur.execute(
            "UPDATE ingredient_unit_conversions SET ingredient_id = ? WHERE ingredient_id = ?",
            (payload.target_id, ingredient_id),
        )
        cur.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))

        conn.commit()
        return {
            "status": "ok",
            "target_id": payload.target_id,
            "target_name": tgt["name"],
            "voci_spostate": n_voci,
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Errore unione: {e}") from e
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   ENDPOINT: FORNITORI
#   GET /foodcost/ingredients/suppliers
# ─────────────────────────────────────────────

class SupplierOut(BaseModel):
    id: int
    name: str
    partita_iva: Optional[str] = None


@router.get("/suppliers", response_model=List[SupplierOut])
def list_suppliers():
    """Lista fornitori (dalla tabella suppliers, alimentata da fatture XML)."""
    conn = get_cucina_connection()
    rows = conn.execute(
        "SELECT id, name, partita_iva FROM suppliers ORDER BY name COLLATE NOCASE"
    ).fetchall()
    conn.close()
    return [SupplierOut(**dict(r)) for r in rows]


# NB: questa rotta con path-param singolo va registrata DOPO tutte le rotte
# letterali (/units, /categories, /suppliers), altrimenti le intercetta.
@router.get("/{ingredient_id}", response_model=IngredientDetail)
def get_ingredient(ingredient_id: int):
    """Dettaglio di un singolo ingrediente (incluso il flag placeholder)."""
    conn = get_cucina_connection()
    cur = conn.cursor()
    row = _fetch_ingredient_detail(cur, ingredient_id)
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")
    return IngredientDetail(**dict(row))


# ─────────────────────────────────────────────
#   ENDPOINT: STORICO PREZZI INGREDIENTE
#   GET /foodcost/ingredients/{ingredient_id}/prezzi
#   POST /foodcost/ingredients/{ingredient_id}/prezzi
#   DELETE /foodcost/ingredients/prezzi/{prezzo_id}
# ─────────────────────────────────────────────

class PriceOut(BaseModel):
    id: int
    ingredient_id: int
    supplier_id: int
    supplier_name: Optional[str] = None
    unit_price: float
    original_price: Optional[float] = None
    original_unit: Optional[str] = None
    original_qty: Optional[float] = None
    price_date: str
    note: Optional[str] = None
    created_at: Optional[str] = None


class PriceCreate(BaseModel):
    supplier_id: int
    unit_price: float = Field(..., gt=0)
    quantity: Optional[float] = None
    unit: Optional[str] = None
    price_date: Optional[str] = None
    note: Optional[str] = None


@router.get("/{ingredient_id}/prezzi", response_model=List[PriceOut])
def list_ingredient_prices(ingredient_id: int):
    conn = get_cucina_connection()
    rows = conn.execute(
        """
        SELECT p.id, p.ingredient_id, p.supplier_id, s.name AS supplier_name,
               p.unit_price, p.original_price, p.original_unit, p.original_qty,
               p.price_date, p.note, p.created_at
        FROM ingredient_prices p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.ingredient_id = ?
        ORDER BY date(p.price_date) DESC, p.id DESC
        """,
        (ingredient_id,),
    ).fetchall()
    conn.close()
    return [PriceOut(**dict(r)) for r in rows]


@router.post("/{ingredient_id}/prezzi", response_model=PriceOut)
def create_ingredient_price(ingredient_id: int, payload: PriceCreate):
    conn = get_cucina_connection()
    cur = conn.cursor()

    # Verifica ingrediente
    ing = cur.execute("SELECT id FROM ingredients WHERE id = ?", (ingredient_id,)).fetchone()
    if not ing:
        conn.close()
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")

    # Verifica fornitore
    sup = cur.execute("SELECT id FROM suppliers WHERE id = ?", (payload.supplier_id,)).fetchone()
    if not sup:
        conn.close()
        raise HTTPException(status_code=404, detail="Fornitore non trovato")

    price_date = payload.price_date or date.today().isoformat()

    cur.execute(
        """
        INSERT INTO ingredient_prices (ingredient_id, supplier_id, unit_price,
                                       quantity, unit, price_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (ingredient_id, payload.supplier_id, payload.unit_price,
         payload.quantity, payload.unit, price_date, payload.note),
    )
    new_id = cur.lastrowid
    conn.commit()

    row = cur.execute(
        """
        SELECT p.id, p.ingredient_id, p.supplier_id, s.name AS supplier_name,
               p.unit_price, p.original_price, p.original_unit, p.original_qty,
               p.price_date, p.note, p.created_at
        FROM ingredient_prices p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.id = ?
        """,
        (new_id,),
    ).fetchone()
    conn.close()
    return PriceOut(**dict(row))


@router.delete("/prezzi/{prezzo_id}")
def delete_price(prezzo_id: int):
    conn = get_cucina_connection()
    cur = conn.cursor()

    existing = cur.execute("SELECT id FROM ingredient_prices WHERE id = ?", (prezzo_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Prezzo non trovato")

    cur.execute("DELETE FROM ingredient_prices WHERE id = ?", (prezzo_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ─────────────────────────────────────────────
#   ENDPOINT: CONVERSIONI UNITÀ PERSONALIZZATE
#   GET /foodcost/ingredients/{id}/conversions
#   POST /foodcost/ingredients/{id}/conversions
#   DELETE /foodcost/ingredients/conversions/{conversion_id}
# ─────────────────────────────────────────────

class UnitConversionOut(BaseModel):
    id: int
    ingredient_id: int
    from_unit: str
    to_unit: str
    factor: float
    note: Optional[str] = None
    created_at: Optional[str] = None


class UnitConversionCreate(BaseModel):
    from_unit: str = Field(..., min_length=1)
    to_unit: str = Field(..., min_length=1)
    factor: float = Field(..., gt=0)
    note: Optional[str] = None


@router.get("/{ingredient_id}/conversions", response_model=List[UnitConversionOut])
def list_ingredient_conversions(ingredient_id: int):
    """Lista conversioni personalizzate per un ingrediente."""
    conn = get_cucina_connection()
    rows = conn.execute(
        """
        SELECT id, ingredient_id, from_unit, to_unit, factor, note, created_at
        FROM ingredient_unit_conversions
        WHERE ingredient_id = ?
        ORDER BY from_unit, to_unit
        """,
        (ingredient_id,),
    ).fetchall()
    conn.close()
    return [UnitConversionOut(**dict(r)) for r in rows]


@router.post("/{ingredient_id}/conversions", response_model=UnitConversionOut)
def create_ingredient_conversion(ingredient_id: int, payload: UnitConversionCreate):
    """
    Crea una conversione personalizzata per un ingrediente.
    Es: 1 pz = 0.06 kg (uova), 1 mazzetto = 0.03 kg (basilico)
    """
    conn = get_cucina_connection()
    cur = conn.cursor()

    # Verifica ingrediente
    ing = cur.execute("SELECT id FROM ingredients WHERE id = ?", (ingredient_id,)).fetchone()
    if not ing:
        conn.close()
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")

    fu = payload.from_unit.strip()
    tu = payload.to_unit.strip()

    if fu.lower() == tu.lower():
        conn.close()
        raise HTTPException(status_code=400, detail="from_unit e to_unit devono essere diversi")

    # Upsert
    existing = cur.execute(
        """
        SELECT id FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND LOWER(from_unit) = LOWER(?) AND LOWER(to_unit) = LOWER(?)
        """,
        (ingredient_id, fu, tu),
    ).fetchone()

    if existing:
        cur.execute(
            "UPDATE ingredient_unit_conversions SET factor = ?, note = ? WHERE id = ?",
            (payload.factor, payload.note, existing["id"]),
        )
        new_id = existing["id"]
    else:
        cur.execute(
            """
            INSERT INTO ingredient_unit_conversions (ingredient_id, from_unit, to_unit, factor, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ingredient_id, fu, tu, payload.factor, payload.note),
        )
        new_id = cur.lastrowid

    conn.commit()

    row = cur.execute(
        "SELECT * FROM ingredient_unit_conversions WHERE id = ?", (new_id,)
    ).fetchone()
    conn.close()
    return UnitConversionOut(**dict(row))


@router.delete("/conversions/{conversion_id}")
def delete_ingredient_conversion(conversion_id: int):
    conn = get_cucina_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id FROM ingredient_unit_conversions WHERE id = ?", (conversion_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Conversione non trovata")

    cur.execute("DELETE FROM ingredient_unit_conversions WHERE id = ?", (conversion_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}