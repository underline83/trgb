# ============================================================
# FILE: app/routers/scelta_formaggi_router.py
# Scelta dei Formaggi — formaggi disponibili alla vendita
# ============================================================

# @version: v1.1-formaggi — attivo/archiviato (mig 093)
# -*- coding: utf-8 -*-
"""
Endpoints modulo "Scelta dei Formaggi"

Gemello di scelta_salumi_router.py: differisce solo per il nome del campo
extra `latte` (vaccino/caprino/ovino/misto) al posto di `origine_animale`.
Il `produttore` qui descrive il caseificio.

Tabelle (foodcost.db):
  - formaggi_tagli       (mig 092)
  - formaggi_categorie   (mig 092)
  - formaggi_config      (mig 092)

Endpoints: come /salumi ma sotto /formaggi.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.formaggi")

router = APIRouter(
    prefix="/formaggi",
    tags=["formaggi"],
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
    produttore: Optional[str] = Field(default=None, max_length=200)
    stagionatura: Optional[str] = Field(default=None, max_length=100)
    latte: Optional[str] = Field(default=None, max_length=60)
    territorio: Optional[str] = Field(default=None, max_length=200)
    descrizione: Optional[str] = None
    note: Optional[str] = None


class TaglioOut(BaseModel):
    id: int
    nome: str
    categoria: Optional[str] = None
    grammatura_g: Optional[int]
    prezzo_euro: Optional[float]
    produttore: Optional[str] = None
    stagionatura: Optional[str] = None
    latte: Optional[str] = None
    territorio: Optional[str] = None
    descrizione: Optional[str] = None
    note: Optional[str]
    attivo: bool = True
    archiviato_at: Optional[str] = None
    # Retrocompat: campi venduto/venduto_at restano nel DB ma la UI nuova usa attivo.
    venduto: bool
    venduto_at: Optional[str]
    created_at: str
    updated_at: str


class TaglioVendutoToggle(BaseModel):
    venduto: bool


class TaglioAttivoToggle(BaseModel):
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


class FormaggiConfigOut(BaseModel):
    widget_max_categorie: int = 4


class FormaggiConfigIn(BaseModel):
    widget_max_categorie: int = Field(default=4, ge=1, le=20)


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

def _row_taglio(row) -> dict:
    d = dict(row)
    d["venduto"] = bool(d.get("venduto", 0))
    # `attivo` e `archiviato_at` arrivano dalla mig 093; fallback difensivo.
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
            "SELECT valore FROM formaggi_config WHERE chiave = ?", (chiave,)
        ).fetchone()
        if r and r["valore"] is not None:
            return int(r["valore"])
    except Exception:
        pass
    return default


def _set_config(conn, chiave: str, valore: str):
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("""
        INSERT INTO formaggi_config (chiave, valore, updated_at)
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
def lista_tagli(stato: str = "attivi"):
    """
    Lista formaggi.
    ?stato=attivi       → in carta (default)
    ?stato=archiviati   → archivio (riattivabili)
    ?stato=tutti        → tutti
    Alias legacy (retrocompat): disponibili→attivi, venduti→archiviati.
    """
    conn = get_foodcost_connection()
    try:
        stato_norm = {
            "disponibili": "attivi",
            "venduti": "archiviati",
        }.get(stato, stato)

        base = "SELECT * FROM formaggi_tagli"
        if stato_norm == "attivi":
            base += " WHERE attivo = 1"
        elif stato_norm == "archiviati":
            base += " WHERE attivo = 0"
        base += " ORDER BY attivo DESC, created_at DESC"
        rows = conn.execute(base).fetchall()
        return [_row_taglio(r) for r in rows]
    finally:
        conn.close()


@router.post("/", response_model=TaglioOut, status_code=201)
def crea_taglio(data: TaglioIn):
    """Inserisce un nuovo formaggio."""
    conn = get_foodcost_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        cur = conn.execute("""
            INSERT INTO formaggi_tagli
              (nome, categoria, grammatura_g, prezzo_euro,
               produttore, stagionatura, latte, territorio,
               descrizione, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.nome.strip(), _clean(data.categoria), data.grammatura_g,
            data.prezzo_euro,
            _clean(data.produttore), _clean(data.stagionatura),
            _clean(data.latte), _clean(data.territorio),
            _clean(data.descrizione), _clean(data.note),
            now, now,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM formaggi_tagli WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.put("/{taglio_id}", response_model=TaglioOut)
def modifica_taglio(taglio_id: int, data: TaglioIn):
    """Modifica un formaggio esistente."""
    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute("""
            UPDATE formaggi_tagli
            SET nome = ?, categoria = ?, grammatura_g = ?, prezzo_euro = ?,
                produttore = ?, stagionatura = ?, latte = ?, territorio = ?,
                descrizione = ?, note = ?, updated_at = ?
            WHERE id = ?
        """, (
            data.nome.strip(), _clean(data.categoria), data.grammatura_g,
            data.prezzo_euro,
            _clean(data.produttore), _clean(data.stagionatura),
            _clean(data.latte), _clean(data.territorio),
            _clean(data.descrizione), _clean(data.note),
            now, taglio_id,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.patch("/{taglio_id}/attivo", response_model=TaglioOut)
def toggle_attivo(taglio_id: int, body: TaglioAttivoToggle):
    """
    Segna un formaggio come attivo (in carta) o archiviato (riattivabile).
    Endpoint nuovo dopo mig 093.
    """
    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        archiviato_at = None if body.attivo else now
        conn.execute("""
            UPDATE formaggi_tagli
            SET attivo = ?, archiviato_at = ?, updated_at = ?
            WHERE id = ?
        """, (int(body.attivo), archiviato_at, now, taglio_id))
        conn.commit()
        row = conn.execute("SELECT * FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.patch("/{taglio_id}/venduto", response_model=TaglioOut, deprecated=True)
def toggle_venduto(taglio_id: int, body: TaglioVendutoToggle):
    """
    [DEPRECATO] Alias legacy: per salumi/formaggi il concetto "venduto" non
    ha piu' senso. Usare PATCH /{id}/attivo. Manteniamo questo endpoint per
    non rompere chiamate esistenti: lo mappiamo su `attivo`.
    """
    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        attivo_val = 0 if body.venduto else 1
        archiviato_at = now if body.venduto else None
        conn.execute("""
            UPDATE formaggi_tagli
            SET attivo = ?, archiviato_at = ?,
                venduto = ?, venduto_at = ?, updated_at = ?
            WHERE id = ?
        """, (attivo_val, archiviato_at,
              int(body.venduto), (now if body.venduto else None),
              now, taglio_id))
        conn.commit()
        row = conn.execute("SELECT * FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        return _row_taglio(row)
    finally:
        conn.close()


@router.delete("/{taglio_id}", status_code=204)
def elimina_taglio(taglio_id: int):
    """Elimina un formaggio."""
    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        conn.execute("DELETE FROM formaggi_tagli WHERE id = ?", (taglio_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CATEGORIE
# ─────────────────────────────────────────────────────────

@router.get("/categorie/", response_model=List[CategoriaOut])
def lista_categorie(solo_attive: bool = True):
    """Lista categorie formaggi ordinate per `ordine` ascendente, poi nome."""
    conn = get_foodcost_connection()
    try:
        base = "SELECT * FROM formaggi_categorie"
        if solo_attive:
            base += " WHERE attivo = 1"
        base += " ORDER BY ordine ASC, nome ASC"
        rows = conn.execute(base).fetchall()
        return [_row_categoria(r) for r in rows]
    finally:
        conn.close()


@router.post("/categorie/", response_model=CategoriaOut, status_code=201)
def crea_categoria(data: CategoriaIn):
    """Crea una nuova categoria formaggi."""
    conn = get_foodcost_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        try:
            cur = conn.execute("""
                INSERT INTO formaggi_categorie (nome, emoji, ordine, attivo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (data.nome.strip(), _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, now))
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM formaggi_categorie WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.put("/categorie/{cat_id}", response_model=CategoriaOut)
def modifica_categoria(cat_id: int, data: CategoriaIn):
    """Modifica categoria formaggi (rinomina + propaga nei tagli che la usavano)."""
    conn = get_foodcost_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM formaggi_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        now = datetime.now().isoformat(timespec="seconds")
        vecchio_nome = existing["nome"]
        nuovo_nome = data.nome.strip()
        try:
            conn.execute("""
                UPDATE formaggi_categorie
                SET nome = ?, emoji = ?, ordine = ?, attivo = ?, updated_at = ?
                WHERE id = ?
            """, (nuovo_nome, _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, cat_id))
            if vecchio_nome and vecchio_nome != nuovo_nome:
                conn.execute(
                    "UPDATE formaggi_tagli SET categoria = ? WHERE categoria = ?",
                    (nuovo_nome, vecchio_nome),
                )
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM formaggi_categorie WHERE id = ?", (cat_id,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.delete("/categorie/{cat_id}", status_code=204)
def elimina_categoria(cat_id: int):
    """Elimina una categoria formaggi solo se non in uso."""
    conn = get_foodcost_connection()
    try:
        existing = conn.execute(
            "SELECT nome FROM formaggi_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        nome = existing["nome"]
        r = conn.execute(
            "SELECT COUNT(*) as cnt FROM formaggi_tagli WHERE categoria = ?", (nome,)
        ).fetchone()
        if r and r["cnt"] > 0:
            raise HTTPException(
                409,
                f"Impossibile eliminare: {r['cnt']} formaggio/formaggi usano ancora '{nome}'. Rinomina o rimuovili prima."
            )
        conn.execute("DELETE FROM formaggi_categorie WHERE id = ?", (cat_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CONFIG
# ─────────────────────────────────────────────────────────

@router.get("/config/", response_model=FormaggiConfigOut)
def get_config():
    conn = get_foodcost_connection()
    try:
        return FormaggiConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()


@router.put("/config/", response_model=FormaggiConfigOut)
def update_config(data: FormaggiConfigIn):
    conn = get_foodcost_connection()
    try:
        _set_config(conn, "widget_max_categorie", str(int(data.widget_max_categorie)))
        conn.commit()
        return FormaggiConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
        )
    finally:
        conn.close()
