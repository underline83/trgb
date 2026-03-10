# @version: v1.0
# -*- coding: utf-8 -*-
"""
Router per gestione categorie fornitori fatture elettroniche.

Categorie a 2 livelli (Cat.1 → Cat.2) + mapping fornitore → categoria.
Tabelle: fe_categorie, fe_sottocategorie, fe_fornitore_categoria
DB: app/data/foodcost.db
"""

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/contabilita/fe/categorie",
    tags=["contabilita-fe-categorie"],
    dependencies=[Depends(get_current_user)],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FOODCOST_DB_PATH = BASE_DIR / "data" / "foodcost.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(FOODCOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ─── Pydantic models ───────────────────────────────────────────

class CategoriaIn(BaseModel):
    nome: str

class CategoriaUpdate(BaseModel):
    nome: Optional[str] = None
    ordine: Optional[int] = None
    attiva: Optional[bool] = None

class SottocategoriaIn(BaseModel):
    nome: str

class SottocategoriaUpdate(BaseModel):
    nome: Optional[str] = None
    ordine: Optional[int] = None
    attiva: Optional[bool] = None

class FornitoreAssign(BaseModel):
    fornitore_piva: Optional[str] = None
    fornitore_nome: str
    categoria_id: Optional[int] = None
    sottocategoria_id: Optional[int] = None
    note: Optional[str] = None


# ─── CATEGORIE (livello 1) ─────────────────────────────────────

@router.get("", summary="Lista tutte le categorie con sottocategorie")
def list_categorie():
    """Ritorna albero completo: categorie → sottocategorie."""
    conn = _get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, nome, ordine, attiva
        FROM fe_categorie
        ORDER BY ordine ASC, nome ASC
    """)
    cats = [dict(r) for r in cur.fetchall()]

    for cat in cats:
        cur.execute("""
            SELECT id, nome, ordine, attiva
            FROM fe_sottocategorie
            WHERE categoria_id = ?
            ORDER BY ordine ASC, nome ASC
        """, (cat["id"],))
        cat["sottocategorie"] = [dict(r) for r in cur.fetchall()]

    conn.close()
    return cats


@router.post("", status_code=status.HTTP_201_CREATED, summary="Crea nuova categoria")
def create_categoria(body: CategoriaIn):
    conn = _get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO fe_categorie (nome, ordine) VALUES (?, (SELECT COALESCE(MAX(ordine),0)+1 FROM fe_categorie))",
            (body.nome.strip().upper(),),
        )
        conn.commit()
        cat_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Categoria '{body.nome}' esiste gia'")
    conn.close()
    return {"id": cat_id, "nome": body.nome.strip().upper()}


@router.put("/{cat_id}", summary="Modifica categoria")
def update_categoria(cat_id: int, body: CategoriaUpdate):
    conn = _get_conn()
    cur = conn.cursor()
    fields = []
    params = []
    if body.nome is not None:
        fields.append("nome = ?")
        params.append(body.nome.strip().upper())
    if body.ordine is not None:
        fields.append("ordine = ?")
        params.append(body.ordine)
    if body.attiva is not None:
        fields.append("attiva = ?")
        params.append(1 if body.attiva else 0)
    if not fields:
        conn.close()
        return {"ok": True}
    params.append(cat_id)
    cur.execute(f"UPDATE fe_categorie SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/{cat_id}", summary="Elimina categoria e relative sottocategorie")
def delete_categoria(cat_id: int):
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM fe_sottocategorie WHERE categoria_id = ?", (cat_id,))
    cur.execute("DELETE FROM fe_categorie WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── SOTTOCATEGORIE (livello 2) ────────────────────────────────

@router.post("/{cat_id}/sotto", status_code=status.HTTP_201_CREATED,
             summary="Aggiungi sottocategoria a una categoria")
def create_sottocategoria(cat_id: int, body: SottocategoriaIn):
    conn = _get_conn()
    cur = conn.cursor()
    # verifica che la categoria esista
    cur.execute("SELECT id FROM fe_categorie WHERE id = ?", (cat_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    try:
        cur.execute(
            "INSERT INTO fe_sottocategorie (categoria_id, nome, ordine) VALUES (?, ?, (SELECT COALESCE(MAX(ordine),0)+1 FROM fe_sottocategorie WHERE categoria_id = ?))",
            (cat_id, body.nome.strip().upper(), cat_id),
        )
        conn.commit()
        sub_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Sottocategoria '{body.nome}' esiste gia' in questa categoria")
    conn.close()
    return {"id": sub_id, "nome": body.nome.strip().upper()}


@router.put("/sotto/{sub_id}", summary="Modifica sottocategoria")
def update_sottocategoria(sub_id: int, body: SottocategoriaUpdate):
    conn = _get_conn()
    cur = conn.cursor()
    fields = []
    params = []
    if body.nome is not None:
        fields.append("nome = ?")
        params.append(body.nome.strip().upper())
    if body.ordine is not None:
        fields.append("ordine = ?")
        params.append(body.ordine)
    if body.attiva is not None:
        fields.append("attiva = ?")
        params.append(1 if body.attiva else 0)
    if not fields:
        conn.close()
        return {"ok": True}
    params.append(sub_id)
    cur.execute(f"UPDATE fe_sottocategorie SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/sotto/{sub_id}", summary="Elimina sottocategoria")
def delete_sottocategoria(sub_id: int):
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM fe_sottocategorie WHERE id = ?", (sub_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── MAPPING FORNITORE → CATEGORIA ─────────────────────────────

@router.get("/fornitori", summary="Lista fornitori con categoria assegnata")
def list_fornitori_categorizzati():
    """
    Ritorna tutti i fornitori unici dalle fatture importate,
    con la categoria eventualmente assegnata.
    """
    conn = _get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            f.fornitore_nome,
            f.fornitore_piva,
            COUNT(*) AS n_fatture,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale_spesa,
            fc.categoria_id,
            fc.sottocategoria_id,
            fc.note AS cat_note,
            c.nome AS categoria_nome,
            s.nome AS sottocategoria_nome
        FROM fe_fatture f
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        LEFT JOIN fe_sottocategorie s ON fc.sottocategoria_id = s.id
        GROUP BY f.fornitore_nome, f.fornitore_piva
        ORDER BY totale_spesa DESC
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/fornitori/assegna", summary="Assegna categoria a un fornitore")
def assegna_fornitore(body: FornitoreAssign):
    """Crea o aggiorna il mapping fornitore → categoria/sottocategoria."""
    conn = _get_conn()
    cur = conn.cursor()

    if body.fornitore_piva:
        # Upsert per P.IVA
        cur.execute("SELECT id FROM fe_fornitore_categoria WHERE fornitore_piva = ?",
                     (body.fornitore_piva,))
        existing = cur.fetchone()
        if existing:
            cur.execute("""
                UPDATE fe_fornitore_categoria
                SET categoria_id = ?, sottocategoria_id = ?, note = ?, fornitore_nome = ?
                WHERE fornitore_piva = ?
            """, (body.categoria_id, body.sottocategoria_id, body.note,
                  body.fornitore_nome, body.fornitore_piva))
        else:
            cur.execute("""
                INSERT INTO fe_fornitore_categoria (fornitore_piva, fornitore_nome, categoria_id, sottocategoria_id, note)
                VALUES (?, ?, ?, ?, ?)
            """, (body.fornitore_piva, body.fornitore_nome,
                  body.categoria_id, body.sottocategoria_id, body.note))
    else:
        # Upsert per nome
        cur.execute("SELECT id FROM fe_fornitore_categoria WHERE fornitore_nome = ? AND fornitore_piva IS NULL",
                     (body.fornitore_nome,))
        existing = cur.fetchone()
        if existing:
            cur.execute("""
                UPDATE fe_fornitore_categoria
                SET categoria_id = ?, sottocategoria_id = ?, note = ?
                WHERE id = ?
            """, (body.categoria_id, body.sottocategoria_id, body.note, existing["id"]))
        else:
            cur.execute("""
                INSERT INTO fe_fornitore_categoria (fornitore_piva, fornitore_nome, categoria_id, sottocategoria_id, note)
                VALUES (NULL, ?, ?, ?, ?)
            """, (body.fornitore_nome, body.categoria_id, body.sottocategoria_id, body.note))

    conn.commit()
    conn.close()
    return {"ok": True}


# ─── STATS PER CATEGORIA ───────────────────────────────────────

@router.get("/stats", summary="Riepilogo spesa per categoria")
def stats_per_categoria(year: Optional[int] = None):
    """Totale spesa raggruppato per Cat.1 e Cat.2."""
    conn = _get_conn()
    cur = conn.cursor()

    where = "WHERE f.data_fattura IS NOT NULL"
    params = []
    if year:
        where += " AND substr(f.data_fattura, 1, 4) = ?"
        params.append(str(year))

    cur.execute(f"""
        SELECT
            COALESCE(c.nome, '(Non categorizzato)') AS categoria,
            COALESCE(s.nome, '') AS sottocategoria,
            COUNT(*) AS n_fatture,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale_spesa
        FROM fe_fatture f
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        LEFT JOIN fe_sottocategorie s ON fc.sottocategoria_id = s.id
        {where}
        GROUP BY c.nome, s.nome
        ORDER BY totale_spesa DESC
    """, params)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows
