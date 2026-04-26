#!/usr/bin/env python3
# @version: v2.0-pranzo-settimanale
# -*- coding: utf-8 -*-
"""
Router Pranzo settimanale — sessione 58 cont. (2026-04-26)

Modulo "Pranzo" come sub-voce di Gestione Cucina.

Modello di dominio:
- Menu SETTIMANALE (UNIQUE su settimana_inizio = lunedi YYYY-MM-DD).
- Piatti pescati dalle `recipes` con service_type "Pranzo di lavoro" (mig 074).
- Pagina /pranzo e' solo un compositore: data settimana + scelta piatti.
  Prezzi, testata, footer vivono solo in `pranzo_settings` (UI: Impostazioni Cucina).

Endpoint:

  ── PIATTI DISPONIBILI ──
  GET    /pranzo/piatti-disponibili/        ricette filtrate per service_type "Pranzo di lavoro"

  ── MENU SETTIMANALE ──
  GET    /pranzo/menu/                       archivio (filtri ?data_da=&data_a=)
  GET    /pranzo/menu/corrente/              shortcut settimana corrente
  GET    /pranzo/menu/{settimana}/           settimana per lunedi YYYY-MM-DD (con righe)
  POST   /pranzo/menu/                       upsert
  DELETE /pranzo/menu/{settimana}/           elimina menu della settimana
  GET    /pranzo/menu/{settimana}/pdf/       PDF brand cliente per la settimana

  ── PROGRAMMAZIONE (vista comparativa) ──
  GET    /pranzo/programmazione/?n=8&fino_a=YYYY-MM-DD   ultime N settimane con righe

  ── SETTINGS ──
  GET    /pranzo/settings/        default titolo/prezzi/footer
  PUT    /pranzo/settings/        aggiorna (admin)
"""
from __future__ import annotations

from datetime import date as date_cls, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.repositories import pranzo_repository as repo
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/pranzo", tags=["pranzo"], dependencies=[Depends(get_current_user)])

# Endpoint pubblico (no auth) per health-check / debug
public_router = APIRouter(prefix="/pranzo", tags=["pranzo-public"])


@public_router.get("/health")
def pranzo_health():
    """
    Endpoint diagnostico: ritorna 200 OK con info su tabelle pranzo_*.
    Marco puo' aprirlo in browser per verificare se il backend pranzo risponde
    senza autenticazione. Esempio: https://app.tregobbi.it/pranzo/health
    """
    try:
        from app.models.foodcost_db import get_foodcost_connection
        conn = get_foodcost_connection()
        try:
            tables = [
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pranzo_%'"
                ).fetchall()
            ]
            n_settings = conn.execute("SELECT COUNT(*) FROM pranzo_settings").fetchone()[0] if "pranzo_settings" in tables else 0
            n_menu = conn.execute("SELECT COUNT(*) FROM pranzo_menu").fetchone()[0] if "pranzo_menu" in tables else 0
        finally:
            conn.close()
        return {
            "ok": True,
            "tables": tables,
            "n_settings": n_settings,
            "n_menu": n_menu,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


CATEGORIE_VALIDE = {"antipasto", "primo", "secondo", "contorno", "dolce", "altro"}


def _check_admin(user: Dict[str, Any]) -> None:
    role = (user or {}).get("role", "")
    if role not in ("superadmin", "admin", "chef"):
        raise HTTPException(status_code=403, detail="Operazione riservata ad admin/chef")


def _validate_data(s: str) -> None:
    try:
        date_cls.fromisoformat(s)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Data non valida (atteso YYYY-MM-DD): {s}")


# ─────────────────────────────────────────────────────────────
# Schemi Pydantic
# ─────────────────────────────────────────────────────────────
class RigaMenuIn(BaseModel):
    recipe_id: Optional[int] = None
    nome: Optional[str] = None
    categoria: str = Field("altro")
    ordine: int = 0
    note: Optional[str] = None


class MenuIn(BaseModel):
    settimana: str = Field(..., description="YYYY-MM-DD (qualsiasi giorno della settimana — viene normalizzato a lunedi)")
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
# PIATTI DISPONIBILI
# ─────────────────────────────────────────────────────────────
@router.get("/piatti-disponibili/")
def list_piatti_disponibili_endpoint():
    """
    Pesca ricette attive con service_type "Pranzo di lavoro".
    Marco le gestisce dal modulo Ricette (foodcost) — qui le mostriamo
    come pool da cui comporre il menu settimanale.
    """
    return {"piatti": repo.list_piatti_disponibili()}


# ─────────────────────────────────────────────────────────────
# MENU SETTIMANALE
# ─────────────────────────────────────────────────────────────
@router.get("/menu/")
def list_menu_endpoint(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    limit: int = 200,
):
    if data_da:
        _validate_data(data_da)
    if data_a:
        _validate_data(data_a)
    return {"menus": repo.list_menu(data_da=data_da, data_a=data_a, limit=limit)}


@router.get("/menu/corrente/")
def get_menu_settimana_corrente():
    oggi = date_cls.today()
    monday = (oggi - timedelta(days=oggi.weekday())).isoformat()
    menu = repo.get_menu_by_settimana(monday)
    return {"settimana_inizio": monday, "menu": menu}


@router.get("/menu/{settimana}/")
def get_menu_endpoint(settimana: str):
    """
    Ritorna il menu della settimana per il lunedi indicato (o normalizzato
    al lunedi della stessa settimana ISO). Ritorna SEMPRE 200 con shape
    `{settimana_inizio, menu}`, dove `menu` puo' essere null se la settimana
    non ha ancora un menu. Niente 404 → meno superfici di errore lato frontend.
    """
    _validate_data(settimana)
    monday = repo.lunedi_di(settimana)
    menu = repo.get_menu_by_settimana(monday)
    return {"settimana_inizio": monday, "menu": menu}


@router.post("/menu/")
def upsert_menu_endpoint(payload: MenuIn, user=Depends(get_current_user)):
    _check_admin(user)
    _validate_data(payload.settimana)
    for r in payload.righe:
        if r.categoria not in CATEGORIE_VALIDE:
            raise HTTPException(status_code=400, detail=f"categoria riga non valida: {r.categoria}")

    menu = repo.upsert_menu(
        settimana_inizio=payload.settimana,
        righe=[r.dict() for r in payload.righe],
        created_by=(user or {}).get("username") or (user or {}).get("email"),
    )
    return menu


@router.delete("/menu/{settimana}/")
def delete_menu_endpoint(settimana: str, user=Depends(get_current_user)):
    _check_admin(user)
    _validate_data(settimana)
    monday = repo.lunedi_di(settimana)
    ok = repo.delete_menu(monday)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Nessun menu per la settimana del {monday}")
    return {"ok": True, "settimana_inizio": monday}


@router.get("/menu/{settimana}/pdf/")
def get_menu_pdf(settimana: str):
    _validate_data(settimana)
    monday = repo.lunedi_di(settimana)
    menu = repo.get_menu_by_settimana(monday)
    if not menu:
        raise HTTPException(status_code=404, detail=f"Nessun menu per la settimana del {monday}")

    settings = repo.get_settings()
    try:
        from app.services.pranzo_pdf_service import genera_pdf_menu_pranzo
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Servizio PDF non disponibile: {e}")

    try:
        pdf_bytes = genera_pdf_menu_pranzo(menu, settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")

    filename = f"menu_pranzo_settimana_{monday}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────
# PROGRAMMAZIONE — vista comparativa N settimane precedenti
# ─────────────────────────────────────────────────────────────
@router.get("/programmazione/")
def get_programmazione(
    n: int = Query(8, ge=1, le=52, description="Numero di settimane da includere"),
    fino_a: Optional[str] = Query(None, description="YYYY-MM-DD ancora finale (default: settimana corrente)"),
):
    if fino_a:
        _validate_data(fino_a)
    settimane = repo.list_programmazione(n_settimane=n, fino_a=fino_a)
    return {"n": n, "fino_a": fino_a, "settimane": settimane}


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
