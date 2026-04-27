#!/usr/bin/env python3
# @version: v1.0 — Modulo J Lista Spesa Cucina (Fase 1 MVP, sessione 59 cont. c, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Router Lista Spesa Cucina — sub-modulo di Gestione Cucina.

Fase 1 MVP testuale (roadmap 4.8):
- CRUD item (titolo + quantita libera + urgente + fornitore freeform + note)
- Toggle "fatto" (acquistato/ricevuto)
- Filtri: solo da fare / solo fatti / urgenti
- Bulk delete dei completati

Fase 2+ (rimandata, roadmap 4.9-4.13):
- FK ingredient_id + storico prezzi (4.9) — campo gia' presente, ma UI da fare
- Vista per fornitore + WhatsApp veloce (4.10)
- Generazione automatica da menu pranzo (4.11)
- Template ricorrenti (4.12)
- Workflow ordinato/in_arrivo/ricevuto (4.13)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/lista-spesa",
    tags=["lista-spesa"],
    dependencies=[Depends(get_current_user)],
)


# ─── Schemas ───────────────────────────────────────────────

class ListaSpesaItemIn(BaseModel):
    titolo: str = Field(..., min_length=1, max_length=200)
    quantita_libera: Optional[str] = Field(default=None, max_length=80)
    urgente: bool = False
    fornitore_freeform: Optional[str] = Field(default=None, max_length=120)
    ingredient_id: Optional[int] = None
    note: Optional[str] = Field(default=None, max_length=500)


class ListaSpesaItemUpdate(BaseModel):
    titolo: Optional[str] = Field(default=None, min_length=1, max_length=200)
    quantita_libera: Optional[str] = Field(default=None, max_length=80)
    urgente: Optional[bool] = None
    fatto: Optional[bool] = None
    fornitore_freeform: Optional[str] = Field(default=None, max_length=120)
    ingredient_id: Optional[int] = None
    note: Optional[str] = Field(default=None, max_length=500)


# ─── Endpoints ─────────────────────────────────────────────

@router.get("/items/")
def list_items(
    stato: str = Query("tutti", description="tutti | da_fare | fatti"),
    solo_urgenti: bool = Query(False),
    fornitore: Optional[str] = Query(None, description="Filtro contiene (case-insensitive)"),
    limit: int = Query(500, ge=1, le=2000),
):
    """
    Lista item con filtri. Ordinamento: fatto asc, urgente desc, created_at desc.
    Cosi' non-fatti urgenti sempre in alto, completati in fondo.
    """
    where = []
    args: List[Any] = []
    if stato == "da_fare":
        where.append("fatto = 0")
    elif stato == "fatti":
        where.append("fatto = 1")
    if solo_urgenti:
        where.append("urgente = 1")
    if fornitore:
        where.append("LOWER(COALESCE(fornitore_freeform, '')) LIKE ?")
        args.append(f"%{fornitore.lower()}%")

    sql = """
        SELECT id, titolo, quantita_libera, urgente, fatto,
               fornitore_freeform, ingredient_id, note,
               created_by, completato_da, created_at, completato_at
          FROM lista_spesa_items
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += """
         ORDER BY fatto ASC,
                  urgente DESC,
                  datetime(created_at) DESC
         LIMIT ?
    """
    args.append(limit)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        rows = cur.execute(sql, args).fetchall()
        items = [dict(r) for r in rows]
        # KPI riepilogo: totale, da_fare, fatti, urgenti aperti
        kpi_row = cur.execute("""
            SELECT
                COUNT(*) AS tot,
                SUM(CASE WHEN fatto = 0 THEN 1 ELSE 0 END) AS da_fare,
                SUM(CASE WHEN fatto = 1 THEN 1 ELSE 0 END) AS fatti,
                SUM(CASE WHEN fatto = 0 AND urgente = 1 THEN 1 ELSE 0 END) AS urgenti_aperti
              FROM lista_spesa_items
        """).fetchone()
        return {
            "ok": True,
            "items": items,
            "kpi": dict(kpi_row) if kpi_row else {"tot": 0, "da_fare": 0, "fatti": 0, "urgenti_aperti": 0},
        }
    finally:
        conn.close()


@router.post("/items/", status_code=201)
def create_item(payload: ListaSpesaItemIn, current_user=Depends(get_current_user)):
    user = (current_user or {}).get("username") or "?"
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO lista_spesa_items
                (titolo, quantita_libera, urgente, fornitore_freeform,
                 ingredient_id, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.titolo.strip(),
            (payload.quantita_libera or "").strip() or None,
            1 if payload.urgente else 0,
            (payload.fornitore_freeform or "").strip() or None,
            payload.ingredient_id,
            (payload.note or "").strip() or None,
            user,
        ))
        new_id = cur.lastrowid
        conn.commit()
        row = cur.execute("SELECT * FROM lista_spesa_items WHERE id = ?", (new_id,)).fetchone()
        return {"ok": True, "item": dict(row)}
    finally:
        conn.close()


@router.put("/items/{item_id}")
def update_item(item_id: int, payload: ListaSpesaItemUpdate, current_user=Depends(get_current_user)):
    user = (current_user or {}).get("username") or "?"
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        existing = cur.execute("SELECT * FROM lista_spesa_items WHERE id = ?", (item_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Item non trovato")

        # Costruisci UPDATE dinamico
        sets = []
        args: List[Any] = []
        d = payload.dict(exclude_unset=True)
        if "titolo" in d:
            sets.append("titolo = ?"); args.append((d["titolo"] or "").strip())
        if "quantita_libera" in d:
            sets.append("quantita_libera = ?"); args.append((d["quantita_libera"] or "").strip() or None)
        if "urgente" in d:
            sets.append("urgente = ?"); args.append(1 if d["urgente"] else 0)
        if "fornitore_freeform" in d:
            sets.append("fornitore_freeform = ?"); args.append((d["fornitore_freeform"] or "").strip() or None)
        if "ingredient_id" in d:
            sets.append("ingredient_id = ?"); args.append(d["ingredient_id"])
        if "note" in d:
            sets.append("note = ?"); args.append((d["note"] or "").strip() or None)

        # Toggle fatto: aggiorna anche completato_at + completato_da
        if "fatto" in d:
            new_fatto = 1 if d["fatto"] else 0
            sets.append("fatto = ?"); args.append(new_fatto)
            if new_fatto == 1:
                sets.append("completato_at = ?"); args.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                sets.append("completato_da = ?"); args.append(user)
            else:
                # Riapertura: pulisci campi completamento
                sets.append("completato_at = NULL")
                sets.append("completato_da = NULL")

        if not sets:
            return {"ok": True, "item": dict(existing), "no_change": True}

        sql = f"UPDATE lista_spesa_items SET {', '.join(sets)} WHERE id = ?"
        args.append(item_id)
        cur.execute(sql, args)
        conn.commit()
        row = cur.execute("SELECT * FROM lista_spesa_items WHERE id = ?", (item_id,)).fetchone()
        return {"ok": True, "item": dict(row)}
    finally:
        conn.close()


@router.delete("/items/{item_id}")
def delete_item(item_id: int):
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM lista_spesa_items WHERE id = ?", (item_id,))
        conn.commit()
        return {"ok": True, "deleted": cur.rowcount}
    finally:
        conn.close()


@router.delete("/items/")
def delete_completed():
    """
    Elimina tutti gli item completati (fatto=1). Utile per "svuota lista".
    """
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM lista_spesa_items WHERE fatto = 1")
        n = cur.rowcount
        conn.commit()
        return {"ok": True, "deleted": n}
    finally:
        conn.close()
