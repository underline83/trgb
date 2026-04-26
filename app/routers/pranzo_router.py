#!/usr/bin/env python3
# @version: v1.0-pranzo-router
# -*- coding: utf-8 -*-
"""
Router Pranzo del Giorno — sessione 58 (2026-04-26)

Modulo "Pranzo" come sub-voce di Gestione Cucina.
Schema in foodcost.db (mig 102): pranzo_piatti, pranzo_menu,
pranzo_menu_righe, pranzo_settings.

Endpoint principali:

  ── CATALOGO PIATTI ──
  GET    /pranzo/piatti/           lista catalogo (filtro ?solo_attivi=true)
  POST   /pranzo/piatti/           crea piatto catalogo
  PUT    /pranzo/piatti/{id}       modifica
  DELETE /pranzo/piatti/{id}       soft delete (?hard=true per hard)

  ── MENU DEL GIORNO ──
  GET    /pranzo/menu/             archivio (filtri ?data_da=&data_a=&limit=)
  GET    /pranzo/menu/oggi/        shortcut data odierna
  GET    /pranzo/menu/{data}/      menu per data YYYY-MM-DD (con righe)
  POST   /pranzo/menu/             upsert menu del giorno
  DELETE /pranzo/menu/{data}/      elimina menu del giorno
  GET    /pranzo/menu/{data}/pdf/  genera PDF brand cliente Osteria Tre Gobbi

  ── SETTINGS ──
  GET    /pranzo/settings/         default titolo/prezzi/footer
  PUT    /pranzo/settings/         aggiorna default (admin)
"""
from __future__ import annotations

from datetime import date as date_cls
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.repositories import pranzo_repository as repo
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/pranzo", tags=["pranzo"], dependencies=[Depends(get_current_user)])


# ─────────────────────────────────────────────────────────────
# Costanti
# ─────────────────────────────────────────────────────────────
CATEGORIE_VALIDE = {"antipasto", "primo", "secondo", "contorno", "dolce", "altro"}
STATI_VALIDI = {"bozza", "pubblicato", "archiviato"}


def _check_admin(user: Dict[str, Any]) -> None:
    role = (user or {}).get("role", "")
    if role not in ("superadmin", "admin", "chef"):
        raise HTTPException(status_code=403, detail="Operazione riservata ad admin/chef")


# ─────────────────────────────────────────────────────────────
# Schemi Pydantic
# ─────────────────────────────────────────────────────────────
class PiattoIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    categoria: str = Field("primo")
    note: Optional[str] = None
    recipe_id: Optional[int] = None


class PiattoUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    note: Optional[str] = None
    recipe_id: Optional[int] = None
    attivo: Optional[int] = None


class RigaMenuIn(BaseModel):
    piatto_id: Optional[int] = None
    nome: str = Field(..., min_length=1, max_length=300)
    categoria: str = Field("primo")
    ordine: int = 0
    note: Optional[str] = None


class MenuIn(BaseModel):
    data: str = Field(..., description="YYYY-MM-DD")
    titolo: Optional[str] = None
    sottotitolo: Optional[str] = None
    prezzo_1: Optional[float] = None
    prezzo_2: Optional[float] = None
    prezzo_3: Optional[float] = None
    footer_note: Optional[str] = None
    stato: str = "bozza"
    righe: List[RigaMenuIn] = []


class SettingsUpdate(BaseModel):
    titolo_default: Optional[str] = None
    sottotitolo_default: Optional[str] = None
    titolo_business: Optional[str] = None
    prezzo_1_default: Optional[float] = None
    prezzo_2_default: Optional[float] = None
    prezzo_3_default: Optional[float] = None
    footer_default: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# CATALOGO PIATTI
# ─────────────────────────────────────────────────────────────
@router.get("/piatti/")
def list_piatti_endpoint(solo_attivi: bool = True):
    return {"piatti": repo.list_piatti(solo_attivi=solo_attivi)}


@router.post("/piatti/")
def create_piatto_endpoint(payload: PiattoIn, user=Depends(get_current_user)):
    _check_admin(user)
    if payload.categoria not in CATEGORIE_VALIDE:
        raise HTTPException(status_code=400, detail=f"categoria non valida: {payload.categoria}")
    p = repo.create_piatto(
        nome=payload.nome,
        categoria=payload.categoria,
        note=payload.note,
        recipe_id=payload.recipe_id,
    )
    return p


@router.put("/piatti/{piatto_id}")
def update_piatto_endpoint(piatto_id: int, payload: PiattoUpdate, user=Depends(get_current_user)):
    _check_admin(user)
    existing = repo.get_piatto(piatto_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Piatto non trovato")
    try:
        p = repo.update_piatto(piatto_id, **payload.dict(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return p


@router.delete("/piatti/{piatto_id}")
def delete_piatto_endpoint(piatto_id: int, hard: bool = False, user=Depends(get_current_user)):
    _check_admin(user)
    if not repo.get_piatto(piatto_id):
        raise HTTPException(status_code=404, detail="Piatto non trovato")
    repo.delete_piatto(piatto_id, hard=hard)
    return {"ok": True, "id": piatto_id, "hard": hard}


# ─────────────────────────────────────────────────────────────
# MENU DEL GIORNO
# ─────────────────────────────────────────────────────────────
@router.get("/menu/")
def list_menu_endpoint(data_da: Optional[str] = None, data_a: Optional[str] = None, limit: int = 200):
    return {"menus": repo.list_menu(data_da=data_da, data_a=data_a, limit=limit)}


@router.get("/menu/oggi/")
def get_menu_oggi():
    oggi = date_cls.today().strftime("%Y-%m-%d")
    menu = repo.get_menu_by_data(oggi)
    return {"data": oggi, "menu": menu}


@router.get("/menu/{data}/")
def get_menu_endpoint(data: str):
    _validate_data(data)
    menu = repo.get_menu_by_data(data)
    if not menu:
        raise HTTPException(status_code=404, detail=f"Nessun menu per {data}")
    return menu


@router.post("/menu/")
def upsert_menu_endpoint(payload: MenuIn, user=Depends(get_current_user)):
    _check_admin(user)
    _validate_data(payload.data)
    if payload.stato not in STATI_VALIDI:
        raise HTTPException(status_code=400, detail=f"stato non valido: {payload.stato}")
    for r in payload.righe:
        if r.categoria not in CATEGORIE_VALIDE:
            raise HTTPException(status_code=400, detail=f"categoria riga non valida: {r.categoria}")

    menu = repo.upsert_menu(
        data=payload.data,
        righe=[r.dict() for r in payload.righe],
        titolo=payload.titolo,
        sottotitolo=payload.sottotitolo,
        prezzo_1=payload.prezzo_1,
        prezzo_2=payload.prezzo_2,
        prezzo_3=payload.prezzo_3,
        footer_note=payload.footer_note,
        stato=payload.stato,
        created_by=(user or {}).get("username") or (user or {}).get("email"),
    )
    return menu


@router.delete("/menu/{data}/")
def delete_menu_endpoint(data: str, user=Depends(get_current_user)):
    _check_admin(user)
    _validate_data(data)
    ok = repo.delete_menu(data)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Nessun menu per {data}")
    return {"ok": True, "data": data}


@router.get("/menu/{data}/pdf/")
def get_menu_pdf(data: str):
    _validate_data(data)
    menu = repo.get_menu_by_data(data)
    if not menu:
        raise HTTPException(status_code=404, detail=f"Nessun menu per {data}")

    settings = repo.get_settings()
    # import lazy: weasyprint puo' non essere disponibile in ambienti dev
    try:
        from app.services.pranzo_pdf_service import genera_pdf_menu_pranzo
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Servizio PDF non disponibile: {e}")

    try:
        pdf_bytes = genera_pdf_menu_pranzo(menu, settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")

    filename = f"menu_pranzo_{data}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────────────────────────
@router.get("/settings/")
def get_settings_endpoint():
    return repo.get_settings()


@router.put("/settings/")
def update_settings_endpoint(payload: SettingsUpdate, user=Depends(get_current_user)):
    _check_admin(user)
    return repo.update_settings(**payload.dict(exclude_unset=True))


# ─────────────────────────────────────────────────────────────
# Validatori
# ─────────────────────────────────────────────────────────────
def _validate_data(s: str) -> None:
    try:
        date_cls.fromisoformat(s)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Data non valida (atteso YYYY-MM-DD): {s}")
