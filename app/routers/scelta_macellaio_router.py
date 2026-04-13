# ============================================================
# FILE: app/routers/scelta_macellaio_router.py
# Scelta del Macellaio — tagli di carne disponibili alla vendita
# ============================================================

# @version: v1.0-scelta-macellaio
# -*- coding: utf-8 -*-
"""
Endpoints modulo "Scelta del Macellaio"

CRUD tagli + toggle venduto.
Tabella: macellaio_tagli in foodcost.db (migrazione 067).

Endpoints:
  GET    /macellaio/         → lista tagli (filtro ?stato=disponibili|venduti|tutti)
  POST   /macellaio/         → nuovo taglio
  PUT    /macellaio/{id}     → modifica taglio
  PATCH  /macellaio/{id}/venduto  → segna venduto / ripristina
  DELETE /macellaio/{id}     → elimina taglio
  GET    /macellaio/tipologie/   → lista tipologie distinte usate
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.macellaio")

router = APIRouter(
    prefix="/macellaio",
    tags=["macellaio"],
    dependencies=[Depends(get_current_user)],
)


# ─────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────

TIPOLOGIE_DEFAULT = [
    "bovino", "suino", "agnello", "vitello",
    "selvaggina", "pollame", "altro",
]


class TaglioIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    tipologia: str = Field(default="bovino", max_length=60)
    grammatura_g: Optional[int] = Field(default=None, ge=1)
    prezzo_euro: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None


class TaglioOut(BaseModel):
    id: int
    nome: str
    tipologia: str
    grammatura_g: Optional[int]
    prezzo_euro: Optional[float]
    note: Optional[str]
    venduto: bool
    venduto_at: Optional[str]
    created_at: str
    updated_at: str


class TaglioVendutoToggle(BaseModel):
    venduto: bool


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    d = dict(row)
    d["venduto"] = bool(d.get("venduto", 0))
    return d


# ─────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────

@router.get("/", response_model=List[TaglioOut])
def lista_tagli(stato: str = "tutti"):
    """
    Lista tagli.
    ?stato=disponibili → solo non venduti
    ?stato=venduti     → solo venduti
    ?stato=tutti       → tutti (default)
    """
    conn = get_foodcost_connection()
    try:
        base = "SELECT * FROM macellaio_tagli"
        if stato == "disponibili":
            base += " WHERE venduto = 0"
        elif stato == "venduti":
            base += " WHERE venduto = 1"
        base += " ORDER BY venduto ASC, created_at DESC"
        rows = conn.execute(base).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


@router.post("/", response_model=TaglioOut, status_code=201)
def crea_taglio(data: TaglioIn):
    """Inserisce un nuovo taglio."""
    conn = get_foodcost_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        cur = conn.execute("""
            INSERT INTO macellaio_tagli (nome, tipologia, grammatura_g, prezzo_euro, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data.nome.strip(), data.tipologia.strip().lower(), data.grammatura_g,
              data.prezzo_euro, (data.note or "").strip() or None, now, now))
        conn.commit()
        row = conn.execute("SELECT * FROM macellaio_tagli WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@router.put("/{taglio_id}", response_model=TaglioOut)
def modifica_taglio(taglio_id: int, data: TaglioIn):
    """Modifica un taglio esistente."""
    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Taglio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute("""
            UPDATE macellaio_tagli
            SET nome = ?, tipologia = ?, grammatura_g = ?, prezzo_euro = ?, note = ?, updated_at = ?
            WHERE id = ?
        """, (data.nome.strip(), data.tipologia.strip().lower(), data.grammatura_g,
              data.prezzo_euro, (data.note or "").strip() or None, now, taglio_id))
        conn.commit()
        row = conn.execute("SELECT * FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@router.patch("/{taglio_id}/venduto", response_model=TaglioOut)
def toggle_venduto(taglio_id: int, body: TaglioVendutoToggle):
    """Segna un taglio come venduto o ripristina a disponibile."""
    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Taglio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        venduto_at = now if body.venduto else None
        conn.execute("""
            UPDATE macellaio_tagli
            SET venduto = ?, venduto_at = ?, updated_at = ?
            WHERE id = ?
        """, (int(body.venduto), venduto_at, now, taglio_id))
        conn.commit()
        row = conn.execute("SELECT * FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@router.delete("/{taglio_id}", status_code=204)
def elimina_taglio(taglio_id: int):
    """Elimina un taglio."""
    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Taglio non trovato")
        conn.execute("DELETE FROM macellaio_tagli WHERE id = ?", (taglio_id,))
        conn.commit()
    finally:
        conn.close()


@router.get("/tipologie/", response_model=List[str])
def lista_tipologie():
    """Restituisce le tipologie distinte usate + quelle di default."""
    conn = get_foodcost_connection()
    try:
        rows = conn.execute(
            "SELECT DISTINCT tipologia FROM macellaio_tagli ORDER BY tipologia"
        ).fetchall()
        used = {r["tipologia"] for r in rows}
        # Unisci default + usate, ordinate
        all_types = sorted(used | set(TIPOLOGIE_DEFAULT))
        return all_types
    finally:
        conn.close()
