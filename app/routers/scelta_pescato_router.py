# ============================================================
# FILE: app/routers/scelta_pescato_router.py
# Scelta del Pescato — pesce/crostacei/molluschi disponibili in carta
# ============================================================

# @version: v1.0-pescato
# -*- coding: utf-8 -*-
"""
Endpoints modulo "Scelta del Pescato"

CRUD tagli + toggle venduto + categorie configurabili + config widget.

Schema analogo a macellaio con un campo extra:
  - zona_fao  → Zona FAO / provenienza (es. "FAO 37.2.1 Adriatico", "Mar Mediterraneo")

Tabelle (foodcost.db):
  - pescato_tagli       (mig 094)
  - pescato_categorie   (mig 094)
  - pescato_config      (mig 094)

Endpoints:
  GET    /pescato/              → lista tagli (filtro ?stato=disponibili|venduti|tutti)
  POST   /pescato/              → nuovo taglio
  PUT    /pescato/{id}          → modifica taglio
  PATCH  /pescato/{id}/venduto  → segna venduto / ripristina
  DELETE /pescato/{id}          → elimina taglio

  GET    /pescato/categorie/        → lista categorie attive (ordinate)
  POST   /pescato/categorie/        → crea categoria
  PUT    /pescato/categorie/{id}    → modifica categoria
  DELETE /pescato/categorie/{id}    → elimina categoria (se nessun taglio la usa)

  GET    /pescato/config/           → config widget (max_categorie, ...)
  PUT    /pescato/config/           → aggiorna config
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.cucina_db import get_cucina_connection
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.pescato")

router = APIRouter(
    prefix="/pescato",
    tags=["pescato"],
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
    zona_fao: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = None


class TaglioOut(BaseModel):
    id: int
    nome: str
    categoria: Optional[str] = None
    grammatura_g: Optional[int]
    prezzo_euro: Optional[float]
    zona_fao: Optional[str] = None
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


class PescatoConfigOut(BaseModel):
    widget_max_categorie: int = 4


class PescatoConfigIn(BaseModel):
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
            "SELECT valore FROM pescato_config WHERE chiave = ?", (chiave,)
        ).fetchone()
        if r and r["valore"] is not None:
            return int(r["valore"])
    except Exception:
        pass
    return default


def _set_config(conn, chiave: str, valore: str):
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("""
        INSERT INTO pescato_config (chiave, valore, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore, updated_at = excluded.updated_at
    """, (chiave, valore, now))


def _clean(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


# ─────────────────────────────────────────────────────────
# ENDPOINTS TAGLI
# ─────────────────────────────────────────────────────────

@router.get("/", response_model=List[TaglioOut])
def lista_tagli(stato: str = "tutti"):
    """
    Lista pescato.
    ?stato=disponibili → solo non venduti
    ?stato=venduti     → solo venduti
    ?stato=tutti       → tutti (default)
    """
    conn = get_cucina_connection()
    try:
        base = "SELECT * FROM pescato_tagli"
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
    """Inserisce un nuovo pezzo di pescato."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        cur = conn.execute("""
            INSERT INTO pescato_tagli
              (nome, categoria, grammatura_g, prezzo_euro,
               zona_fao, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.nome.strip(), _clean(data.categoria), data.grammatura_g,
            data.prezzo_euro,
            _clean(data.zona_fao), _clean(data.note),
            now, now,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM pescato_tagli WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.put("/{taglio_id}", response_model=TaglioOut)
def modifica_taglio(taglio_id: int, data: TaglioIn):
    """Modifica un pezzo di pescato esistente."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM pescato_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Pescato non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute("""
            UPDATE pescato_tagli
            SET nome = ?, categoria = ?, grammatura_g = ?, prezzo_euro = ?,
                zona_fao = ?, note = ?, updated_at = ?
            WHERE id = ?
        """, (
            data.nome.strip(), _clean(data.categoria), data.grammatura_g,
            data.prezzo_euro,
            _clean(data.zona_fao), _clean(data.note),
            now, taglio_id,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM pescato_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.patch("/{taglio_id}/venduto", response_model=TaglioOut)
def toggle_venduto(taglio_id: int, body: TaglioVendutoToggle):
    """Segna un pezzo di pescato come venduto o ripristina a disponibile."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM pescato_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Pescato non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        venduto_at = now if body.venduto else None
        conn.execute("""
            UPDATE pescato_tagli
            SET venduto = ?, venduto_at = ?, updated_at = ?
            WHERE id = ?
        """, (int(body.venduto), venduto_at, now, taglio_id))
        conn.commit()
        row = conn.execute("SELECT * FROM pescato_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.delete("/{taglio_id}", status_code=204)
def elimina_taglio(taglio_id: int):
    """Elimina un pezzo di pescato."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM pescato_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Pescato non trovato")
        conn.execute("DELETE FROM pescato_tagli WHERE id = ?", (taglio_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CATEGORIE
# ─────────────────────────────────────────────────────────

@router.get("/categorie/", response_model=List[CategoriaOut])
def lista_categorie(solo_attive: bool = True):
    """Lista categorie pescato ordinate per `ordine` ascendente, poi nome."""
    conn = get_cucina_connection()
    try:
        base = "SELECT * FROM pescato_categorie"
        if solo_attive:
            base += " WHERE attivo = 1"
        base += " ORDER BY ordine ASC, nome ASC"
        rows = conn.execute(base).fetchall()
        return [_row_categoria(r) for r in rows]
    finally:
        conn.close()


@router.post("/categorie/", response_model=CategoriaOut, status_code=201)
def crea_categoria(data: CategoriaIn):
    """Crea una nuova categoria pescato."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        try:
            cur = conn.execute("""
                INSERT INTO pescato_categorie (nome, emoji, ordine, attivo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (data.nome.strip(), _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, now))
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM pescato_categorie WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.put("/categorie/{cat_id}", response_model=CategoriaOut)
def modifica_categoria(cat_id: int, data: CategoriaIn):
    """Modifica categoria pescato (rinomina + propaga nei tagli che la usavano)."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM pescato_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        now = datetime.now().isoformat(timespec="seconds")
        vecchio_nome = existing["nome"]
        nuovo_nome = data.nome.strip()
        try:
            conn.execute("""
                UPDATE pescato_categorie
                SET nome = ?, emoji = ?, ordine = ?, attivo = ?, updated_at = ?
                WHERE id = ?
            """, (nuovo_nome, _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, cat_id))
            if vecchio_nome and vecchio_nome != nuovo_nome:
                conn.execute(
                    "UPDATE pescato_tagli SET categoria = ? WHERE categoria = ?",
                    (nuovo_nome, vecchio_nome),
                )
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM pescato_categorie WHERE id = ?", (cat_id,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.delete("/categorie/{cat_id}", status_code=204)
def elimina_categoria(cat_id: int):
    """Elimina una categoria pescato solo se non in uso."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT nome FROM pescato_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        nome = existing["nome"]
        r = conn.execute(
            "SELECT COUNT(*) as cnt FROM pescato_tagli WHERE categoria = ?", (nome,)
        ).fetchone()
        if r and r["cnt"] > 0:
            raise HTTPException(
                409,
                f"Impossibile eliminare: {r['cnt']} pezzi di pescato usano ancora '{nome}'. Rinomina o rimuovili prima."
            )
        conn.execute("DELETE FROM pescato_categorie WHERE id = ?", (cat_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CONFIG
# ─────────────────────────────────────────────────────────

@router.get("/config/", response_model=PescatoConfigOut)
def get_config():
    conn = get_cucina_connection()
    try:
        return PescatoConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()


@router.put("/config/", response_model=PescatoConfigOut)
def update_config(data: PescatoConfigIn):
    conn = get_cucina_connection()
    try:
        _set_config(conn, "widget_max_categorie", str(int(data.widget_max_categorie)))
        conn.commit()
        return PescatoConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()
