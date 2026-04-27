# ============================================================
# FILE: app/routers/scelta_macellaio_router.py
# Scelta del Macellaio — tagli di carne disponibili alla vendita
# ============================================================

# @version: v2.0-macellaio-categorie
# -*- coding: utf-8 -*-
"""
Endpoints modulo "Scelta del Macellaio"

CRUD tagli + toggle venduto + categorie configurabili + config widget.

Tabelle (foodcost.db):
  - macellaio_tagli        (mig 067, col `categoria` da mig 069)
  - macellaio_categorie    (mig 069)
  - macellaio_config       (mig 069)

Endpoints:
  GET    /macellaio/              → lista tagli (filtro ?stato=disponibili|venduti|tutti)
  POST   /macellaio/              → nuovo taglio
  PUT    /macellaio/{id}          → modifica taglio
  PATCH  /macellaio/{id}/venduto  → segna venduto / ripristina
  DELETE /macellaio/{id}          → elimina taglio

  GET    /macellaio/categorie/        → lista categorie attive (ordinate)
  POST   /macellaio/categorie/        → crea categoria
  PUT    /macellaio/categorie/{id}    → modifica categoria
  DELETE /macellaio/categorie/{id}    → elimina categoria (se nessun taglio la usa)

  GET    /macellaio/config/           → config widget (max_categorie, …)
  PUT    /macellaio/config/           → aggiorna config
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.cucina_db import get_cucina_connection
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

class TaglioIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    categoria: Optional[str] = Field(default=None, max_length=60)
    grammatura_g: Optional[int] = Field(default=None, ge=1)
    prezzo_euro: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None


class TaglioOut(BaseModel):
    id: int
    nome: str
    categoria: Optional[str] = None
    grammatura_g: Optional[int]
    prezzo_euro: Optional[float]
    note: Optional[str]
    venduto: bool
    venduto_at: Optional[str]
    created_at: str
    updated_at: str


class TaglioVendutoToggle(BaseModel):
    venduto: bool


class CategoriaIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=60)
    emoji: Optional[str] = Field(default=None, max_length=8)
    ordine: Optional[int] = Field(default=999, ge=0, le=9999)
    attivo: Optional[bool] = True


class CategoriaOut(BaseModel):
    id: int
    nome: str
    emoji: Optional[str] = None
    ordine: int
    attivo: bool


class MacellaioConfigOut(BaseModel):
    widget_max_categorie: int = 4


class MacellaioConfigIn(BaseModel):
    widget_max_categorie: int = Field(default=4, ge=1, le=20)


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

def _row_taglio(row) -> dict:
    d = dict(row)
    d["venduto"] = bool(d.get("venduto", 0))
    return d


def _row_categoria(row) -> dict:
    d = dict(row)
    d["attivo"] = bool(d.get("attivo", 1))
    return d


def _get_config_int(conn, chiave: str, default: int) -> int:
    try:
        r = conn.execute(
            "SELECT valore FROM macellaio_config WHERE chiave = ?", (chiave,)
        ).fetchone()
        if r and r["valore"] is not None:
            return int(r["valore"])
    except Exception:
        pass
    return default


def _set_config(conn, chiave: str, valore: str):
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("""
        INSERT INTO macellaio_config (chiave, valore, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore, updated_at = excluded.updated_at
    """, (chiave, valore, now))


# ─────────────────────────────────────────────────────────
# ENDPOINTS TAGLI
# ─────────────────────────────────────────────────────────

@router.get("/", response_model=List[TaglioOut])
def lista_tagli(stato: str = "tutti"):
    """
    Lista tagli.
    ?stato=disponibili → solo non venduti
    ?stato=venduti     → solo venduti
    ?stato=tutti       → tutti (default)
    """
    conn = get_cucina_connection()
    try:
        base = "SELECT * FROM macellaio_tagli"
        if stato == "disponibili":
            base += " WHERE venduto = 0"
        elif stato == "venduti":
            base += " WHERE venduto = 1"
        base += " ORDER BY venduto ASC, created_at DESC"
        rows = conn.execute(base).fetchall()
        return [_row_taglio(r) for r in rows]
    finally:
        conn.close()


@router.post("/", response_model=TaglioOut, status_code=201)
def crea_taglio(data: TaglioIn):
    """Inserisce un nuovo taglio."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        cat = (data.categoria or "").strip() or None
        cur = conn.execute("""
            INSERT INTO macellaio_tagli (nome, categoria, grammatura_g, prezzo_euro, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data.nome.strip(), cat, data.grammatura_g,
              data.prezzo_euro, (data.note or "").strip() or None, now, now))
        conn.commit()
        row = conn.execute("SELECT * FROM macellaio_tagli WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.put("/{taglio_id}", response_model=TaglioOut)
def modifica_taglio(taglio_id: int, data: TaglioIn):
    """Modifica un taglio esistente."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Taglio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        cat = (data.categoria or "").strip() or None
        conn.execute("""
            UPDATE macellaio_tagli
            SET nome = ?, categoria = ?, grammatura_g = ?, prezzo_euro = ?, note = ?, updated_at = ?
            WHERE id = ?
        """, (data.nome.strip(), cat, data.grammatura_g,
              data.prezzo_euro, (data.note or "").strip() or None, now, taglio_id))
        conn.commit()
        row = conn.execute("SELECT * FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.patch("/{taglio_id}/venduto", response_model=TaglioOut)
def toggle_venduto(taglio_id: int, body: TaglioVendutoToggle):
    """Segna un taglio come venduto o ripristina a disponibile."""
    conn = get_cucina_connection()
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
        return _row_taglio(row)
    finally:
        conn.close()


@router.delete("/{taglio_id}", status_code=204)
def elimina_taglio(taglio_id: int):
    """Elimina un taglio."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM macellaio_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Taglio non trovato")
        conn.execute("DELETE FROM macellaio_tagli WHERE id = ?", (taglio_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CATEGORIE
# ─────────────────────────────────────────────────────────

@router.get("/categorie/", response_model=List[CategoriaOut])
def lista_categorie(solo_attive: bool = True):
    """Lista categorie ordinate per `ordine` ascendente, poi nome."""
    conn = get_cucina_connection()
    try:
        base = "SELECT * FROM macellaio_categorie"
        if solo_attive:
            base += " WHERE attivo = 1"
        base += " ORDER BY ordine ASC, nome ASC"
        rows = conn.execute(base).fetchall()
        return [_row_categoria(r) for r in rows]
    finally:
        conn.close()


@router.post("/categorie/", response_model=CategoriaOut, status_code=201)
def crea_categoria(data: CategoriaIn):
    """Crea una nuova categoria."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        try:
            cur = conn.execute("""
                INSERT INTO macellaio_categorie (nome, emoji, ordine, attivo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (data.nome.strip(), (data.emoji or "").strip() or None,
                  int(data.ordine or 999), int(bool(data.attivo)), now, now))
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM macellaio_categorie WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.put("/categorie/{cat_id}", response_model=CategoriaOut)
def modifica_categoria(cat_id: int, data: CategoriaIn):
    """Modifica una categoria (rinomina + propaga nei tagli che la usavano)."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM macellaio_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        now = datetime.now().isoformat(timespec="seconds")
        vecchio_nome = existing["nome"]
        nuovo_nome = data.nome.strip()
        try:
            conn.execute("""
                UPDATE macellaio_categorie
                SET nome = ?, emoji = ?, ordine = ?, attivo = ?, updated_at = ?
                WHERE id = ?
            """, (nuovo_nome, (data.emoji or "").strip() or None,
                  int(data.ordine or 999), int(bool(data.attivo)), now, cat_id))
            # Propaga rename ai tagli
            if vecchio_nome and vecchio_nome != nuovo_nome:
                conn.execute(
                    "UPDATE macellaio_tagli SET categoria = ? WHERE categoria = ?",
                    (nuovo_nome, vecchio_nome),
                )
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM macellaio_categorie WHERE id = ?", (cat_id,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.delete("/categorie/{cat_id}", status_code=204)
def elimina_categoria(cat_id: int):
    """Elimina una categoria solo se non in uso. Altrimenti 409."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT nome FROM macellaio_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        nome = existing["nome"]
        r = conn.execute(
            "SELECT COUNT(*) as cnt FROM macellaio_tagli WHERE categoria = ?", (nome,)
        ).fetchone()
        if r and r["cnt"] > 0:
            raise HTTPException(
                409,
                f"Impossibile eliminare: {r['cnt']} taglio/tagli usano ancora '{nome}'. Rinomina o rimuovili prima."
            )
        conn.execute("DELETE FROM macellaio_categorie WHERE id = ?", (cat_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CONFIG
# ─────────────────────────────────────────────────────────

@router.get("/config/", response_model=MacellaioConfigOut)
def get_config():
    """Restituisce le impostazioni del modulo Scelta del Macellaio."""
    conn = get_cucina_connection()
    try:
        return MacellaioConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()


@router.put("/config/", response_model=MacellaioConfigOut)
def update_config(data: MacellaioConfigIn):
    """Aggiorna le impostazioni del modulo."""
    conn = get_cucina_connection()
    try:
        _set_config(conn, "widget_max_categorie", str(int(data.widget_max_categorie)))
        conn.commit()
        return MacellaioConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()
