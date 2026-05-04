# ============================================================
# FILE: app/routers/piatti_giorno_router.py
# Modulo: cucina (selezioni)
# 5a zona di "Selezioni del Giorno" — piatti speciali del giorno
# (oltre alla carta fissa: oggi tartare di vitello, risotto al tartufo,
#  pesce al forno...). Stato attivo/archiviato come salumi/formaggi.
# ============================================================

# @version: v1.0-piatti-giorno (mig 107)
# -*- coding: utf-8 -*-
"""
Endpoints modulo "Piatti del Giorno"

CRUD piatti + toggle attivo/archivio + categorie configurabili + config widget.

Schema:
  - nome           → nome piatto
  - categoria      → Antipasto / Primo / Secondo / Contorno / Dolce / Speciale
  - prezzo_euro    → prezzo del piatto
  - grammatura_g   → opzionale (di solito non si pesa)
  - descrizione    → testo lungo per il racconto in sala
  - note           → annotazioni interne

Tabelle (foodcost.db, mig 107):
  - piatti_giorno              (la lista dei piatti)
  - piatti_giorno_categorie    (categorie configurabili)
  - piatti_giorno_config       (config widget)

Endpoints:
  GET    /piatti-giorno/                    → lista (filtro ?stato=attivi|archiviati|tutti)
  POST   /piatti-giorno/                    → nuovo piatto
  PUT    /piatti-giorno/{id}                → modifica piatto
  PATCH  /piatti-giorno/{id}/attivo         → toggle attivo/archiviato
  DELETE /piatti-giorno/{id}                → elimina

  GET    /piatti-giorno/categorie/          → lista categorie attive (ordinate)
  POST   /piatti-giorno/categorie/          → crea categoria
  PUT    /piatti-giorno/categorie/{id}      → modifica categoria
  DELETE /piatti-giorno/categorie/{id}      → elimina categoria (se nessun piatto la usa)

  GET    /piatti-giorno/config/             → config widget
  PUT    /piatti-giorno/config/             → aggiorna config
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.cucina_db import get_cucina_connection
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.piatti_giorno")

router = APIRouter(
    prefix="/piatti-giorno",
    tags=["piatti-giorno"],
    dependencies=[Depends(get_current_user)],
)


# ─────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────

class PiattoIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    categoria: Optional[str] = Field(default=None, max_length=60)
    grammatura_g: Optional[int] = Field(default=None, ge=1)
    prezzo_euro: Optional[float] = Field(default=None, ge=0)
    descrizione: Optional[str] = None
    note: Optional[str] = None


class PiattoOut(BaseModel):
    id: int
    nome: str
    categoria: Optional[str] = None
    grammatura_g: Optional[int]
    prezzo_euro: Optional[float]
    descrizione: Optional[str] = None
    note: Optional[str]
    attivo: bool = True
    archiviato_at: Optional[str] = None
    # Retrocompat: campi venduto/venduto_at restano nel DB ma la UI usa attivo.
    venduto: bool
    venduto_at: Optional[str]
    created_at: str
    updated_at: str


class PiattoAttivoToggle(BaseModel):
    attivo: bool


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


class PiattiGiornoConfigOut(BaseModel):
    widget_max_categorie: int = 4


class PiattiGiornoConfigIn(BaseModel):
    widget_max_categorie: int = Field(default=4, ge=1, le=20)


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

def _row_piatto(row) -> dict:
    d = dict(row)
    d["venduto"] = bool(d.get("venduto", 0))
    d["attivo"] = bool(d.get("attivo", 1)) if "attivo" in d else True
    if "archiviato_at" not in d:
        d["archiviato_at"] = None
    return d


def _row_categoria(row) -> dict:
    d = dict(row)
    d["attivo"] = bool(d.get("attivo", 1))
    return d


def _get_config_int(conn, chiave: str, default: int) -> int:
    try:
        r = conn.execute(
            "SELECT valore FROM piatti_giorno_config WHERE chiave = ?", (chiave,)
        ).fetchone()
        if r and r["valore"] is not None:
            return int(r["valore"])
    except Exception:
        pass
    return default


def _set_config(conn, chiave: str, valore: str):
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("""
        INSERT INTO piatti_giorno_config (chiave, valore, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore, updated_at = excluded.updated_at
    """, (chiave, valore, now))


def _clean(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


# ─────────────────────────────────────────────────────────
# ENDPOINTS PIATTI
# ─────────────────────────────────────────────────────────

@router.get("/", response_model=List[PiattoOut])
def lista_piatti(stato: str = "attivi"):
    """
    Lista piatti del giorno.
    ?stato=attivi       → in carta (default)
    ?stato=archiviati   → archivio (riattivabili)
    ?stato=tutti        → tutti
    Alias legacy: disponibili→attivi, venduti→archiviati.
    """
    conn = get_cucina_connection()
    try:
        stato_norm = {
            "disponibili": "attivi",
            "venduti": "archiviati",
        }.get(stato, stato)

        base = "SELECT * FROM piatti_giorno"
        if stato_norm == "attivi":
            base += " WHERE attivo = 1"
        elif stato_norm == "archiviati":
            base += " WHERE attivo = 0"
        base += " ORDER BY attivo DESC, created_at DESC"
        rows = conn.execute(base).fetchall()
        return [_row_piatto(r) for r in rows]
    finally:
        conn.close()


@router.post("/", response_model=PiattoOut, status_code=201)
def crea_piatto(data: PiattoIn):
    """Inserisce un nuovo piatto del giorno."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        cur = conn.execute("""
            INSERT INTO piatti_giorno
              (nome, categoria, grammatura_g, prezzo_euro,
               descrizione, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.nome.strip(), _clean(data.categoria), data.grammatura_g,
            data.prezzo_euro,
            _clean(data.descrizione), _clean(data.note),
            now, now,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM piatti_giorno WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_piatto(row)
    finally:
        conn.close()


@router.put("/{piatto_id}", response_model=PiattoOut)
def modifica_piatto(piatto_id: int, data: PiattoIn):
    """Modifica un piatto del giorno esistente."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM piatti_giorno WHERE id = ?", (piatto_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Piatto non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute("""
            UPDATE piatti_giorno
            SET nome = ?, categoria = ?, grammatura_g = ?, prezzo_euro = ?,
                descrizione = ?, note = ?, updated_at = ?
            WHERE id = ?
        """, (
            data.nome.strip(), _clean(data.categoria), data.grammatura_g,
            data.prezzo_euro,
            _clean(data.descrizione), _clean(data.note),
            now, piatto_id,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM piatti_giorno WHERE id = ?", (piatto_id,)).fetchone()
        return _row_piatto(row)
    finally:
        conn.close()


@router.patch("/{piatto_id}/attivo", response_model=PiattoOut)
def toggle_attivo(piatto_id: int, body: PiattoAttivoToggle):
    """Segna un piatto come attivo (in carta) o archiviato."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM piatti_giorno WHERE id = ?", (piatto_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Piatto non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        archiviato_at = None if body.attivo else now
        conn.execute("""
            UPDATE piatti_giorno
            SET attivo = ?, archiviato_at = ?, updated_at = ?
            WHERE id = ?
        """, (int(body.attivo), archiviato_at, now, piatto_id))
        conn.commit()
        row = conn.execute("SELECT * FROM piatti_giorno WHERE id = ?", (piatto_id,)).fetchone()
        return _row_piatto(row)
    finally:
        conn.close()


@router.delete("/{piatto_id}", status_code=204)
def elimina_piatto(piatto_id: int):
    """Elimina un piatto del giorno."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM piatti_giorno WHERE id = ?", (piatto_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Piatto non trovato")
        conn.execute("DELETE FROM piatti_giorno WHERE id = ?", (piatto_id,))
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
        base = "SELECT * FROM piatti_giorno_categorie"
        if solo_attive:
            base += " WHERE attivo = 1"
        base += " ORDER BY ordine ASC, nome ASC"
        rows = conn.execute(base).fetchall()
        return [_row_categoria(r) for r in rows]
    finally:
        conn.close()


@router.post("/categorie/", response_model=CategoriaOut, status_code=201)
def crea_categoria(data: CategoriaIn):
    """Crea una nuova categoria piatti del giorno."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        try:
            cur = conn.execute("""
                INSERT INTO piatti_giorno_categorie (nome, emoji, ordine, attivo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (data.nome.strip(), _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, now))
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM piatti_giorno_categorie WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.put("/categorie/{cat_id}", response_model=CategoriaOut)
def modifica_categoria(cat_id: int, data: CategoriaIn):
    """Modifica categoria (rinomina + propaga nei piatti che la usavano)."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM piatti_giorno_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        now = datetime.now().isoformat(timespec="seconds")
        vecchio_nome = existing["nome"]
        nuovo_nome = data.nome.strip()
        try:
            conn.execute("""
                UPDATE piatti_giorno_categorie
                SET nome = ?, emoji = ?, ordine = ?, attivo = ?, updated_at = ?
                WHERE id = ?
            """, (nuovo_nome, _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, cat_id))
            if vecchio_nome and vecchio_nome != nuovo_nome:
                conn.execute(
                    "UPDATE piatti_giorno SET categoria = ? WHERE categoria = ?",
                    (nuovo_nome, vecchio_nome),
                )
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM piatti_giorno_categorie WHERE id = ?", (cat_id,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.delete("/categorie/{cat_id}", status_code=204)
def elimina_categoria(cat_id: int):
    """Elimina una categoria solo se non in uso."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT nome FROM piatti_giorno_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        nome = existing["nome"]
        r = conn.execute(
            "SELECT COUNT(*) as cnt FROM piatti_giorno WHERE categoria = ?", (nome,)
        ).fetchone()
        if r and r["cnt"] > 0:
            raise HTTPException(
                409,
                f"Impossibile eliminare: {r['cnt']} piatto/i usano ancora '{nome}'. Rinomina o rimuovili prima."
            )
        conn.execute("DELETE FROM piatti_giorno_categorie WHERE id = ?", (cat_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CONFIG
# ─────────────────────────────────────────────────────────

@router.get("/config/", response_model=PiattiGiornoConfigOut)
def get_config():
    conn = get_cucina_connection()
    try:
        return PiattiGiornoConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()


@router.put("/config/", response_model=PiattiGiornoConfigOut)
def update_config(data: PiattiGiornoConfigIn):
    conn = get_cucina_connection()
    try:
        _set_config(conn, "widget_max_categorie", str(int(data.widget_max_categorie)))
        conn.commit()
        return PiattiGiornoConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()
