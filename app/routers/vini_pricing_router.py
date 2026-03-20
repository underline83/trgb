# -*- coding: utf-8 -*-
"""
Tre Gobbi — Router Prezzi Vini (calcolo automatico PREZZO_CARTA)
File: app/routers/vini_pricing_router.py

Endpoint:
- GET  /vini/pricing/breakpoints         → legge tabella markup
- POST /vini/pricing/breakpoints         → salva tabella markup
- POST /vini/pricing/breakpoints/reset   → ripristina default
- POST /vini/pricing/calcola             → calcola prezzo per un costo
- POST /vini/pricing/ricalcola-tutti     → ricalcola PREZZO_CARTA su tutti i vini
- GET  /vini/pricing/preview             → anteprima prezzi senza salvare
"""

from __future__ import annotations

from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user
from app.services.wine_pricing import (
    calcola_prezzo_carta,
    load_breakpoints,
    save_breakpoints,
    reset_breakpoints_to_default,
)
from app.models import vini_magazzino_db as db


router = APIRouter(
    prefix="/vini/pricing",
    tags=["Vini Pricing"],
)


# ── Schemi Pydantic ────────────────────────────────────────

class BreakpointItem(BaseModel):
    costo: float = Field(..., ge=0)
    moltiplicatore: float = Field(..., gt=0)


class BreakpointsResponse(BaseModel):
    breakpoints: List[BreakpointItem]


class CalcolaRequest(BaseModel):
    euro_listino: float = Field(..., gt=0)


class CalcolaResponse(BaseModel):
    euro_listino: float
    moltiplicatore: float
    prezzo_carta: float


class RicalcolaTuttiResponse(BaseModel):
    aggiornati: int
    invariati: int
    senza_listino: int
    dettaglio: List[dict]


class PreviewItem(BaseModel):
    id: int
    DESCRIZIONE: str
    EURO_LISTINO: Optional[float]
    PREZZO_CARTA_ATTUALE: Optional[float]
    PREZZO_CARTA_NUOVO: Optional[float]
    differenza: Optional[float]


# ── Helper: verifica admin ─────────────────────────────────

def _require_admin(current_user: Any):
    role = None
    if isinstance(current_user, dict):
        role = current_user.get("ruolo") or current_user.get("role")
    elif hasattr(current_user, "ruolo"):
        role = current_user.ruolo
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo admin può gestire i prezzi",
        )


# ── Endpoint: breakpoints ─────────────────────────────────

@router.get("/breakpoints", summary="Leggi tabella markup corrente")
def get_breakpoints(current_user: Any = Depends(get_current_user)):
    bp = load_breakpoints()
    return {"breakpoints": [{"costo": c, "moltiplicatore": m} for c, m in bp]}


@router.post("/breakpoints", summary="Salva tabella markup personalizzata")
def post_breakpoints(
    items: List[BreakpointItem],
    current_user: Any = Depends(get_current_user),
):
    _require_admin(current_user)
    if len(items) < 2:
        raise HTTPException(400, "Servono almeno 2 breakpoint")

    # Ordina per costo crescente
    sorted_items = sorted(items, key=lambda x: x.costo)
    bp = [(item.costo, item.moltiplicatore) for item in sorted_items]
    save_breakpoints(bp)
    return {"status": "ok", "count": len(bp)}


@router.post("/breakpoints/reset", summary="Ripristina breakpoint di default")
def reset_breakpoints(current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    bp = reset_breakpoints_to_default()
    return {"status": "ok", "count": len(bp)}


# ── Endpoint: calcolo singolo ──────────────────────────────

@router.post("/calcola", summary="Calcola prezzo carta per un costo listino")
def calcola_prezzo(
    payload: CalcolaRequest,
    current_user: Any = Depends(get_current_user),
):
    bp = load_breakpoints()
    from app.services.wine_pricing import _interpolate, _round_to_half

    molt = _interpolate(payload.euro_listino, bp)
    prezzo = _round_to_half(payload.euro_listino * molt)

    return CalcolaResponse(
        euro_listino=payload.euro_listino,
        moltiplicatore=round(molt, 4),
        prezzo_carta=prezzo,
    )


# ── Endpoint: anteprima ricalcolo ──────────────────────────

@router.get("/preview", summary="Anteprima ricalcolo prezzi (senza salvare)")
def preview_ricalcolo(current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)

    bp = load_breakpoints()
    rows = db.search_vini()  # tutti i vini
    result = []

    for row in rows:
        r = dict(row)
        euro = r.get("EURO_LISTINO")
        attuale = r.get("PREZZO_CARTA")

        if euro and euro > 0:
            nuovo = calcola_prezzo_carta(euro, bp)
            diff = round(nuovo - (attuale or 0), 2) if attuale is not None else None
        else:
            nuovo = None
            diff = None

        result.append({
            "id": r["id"],
            "DESCRIZIONE": r.get("DESCRIZIONE", ""),
            "PRODUTTORE": r.get("PRODUTTORE", ""),
            "EURO_LISTINO": euro,
            "PREZZO_CARTA_ATTUALE": attuale,
            "PREZZO_CARTA_NUOVO": nuovo,
            "differenza": diff,
        })

    return result


# ── Endpoint: ricalcola tutti ──────────────────────────────

@router.post("/ricalcola-tutti", summary="Ricalcola PREZZO_CARTA su tutti i vini con EURO_LISTINO")
def ricalcola_tutti(current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)

    bp = load_breakpoints()
    rows = db.search_vini()  # tutti i vini

    aggiornati = 0
    invariati = 0
    senza_listino = 0
    dettaglio = []

    updates = []
    for row in rows:
        r = dict(row)
        euro = r.get("EURO_LISTINO")

        if not euro or euro <= 0:
            senza_listino += 1
            continue

        nuovo = calcola_prezzo_carta(euro, bp)
        attuale = r.get("PREZZO_CARTA")

        if attuale is not None and abs(nuovo - attuale) < 0.01:
            invariati += 1
            continue

        updates.append({"id": r["id"], "PREZZO_CARTA": nuovo})
        dettaglio.append({
            "id": r["id"],
            "DESCRIZIONE": r.get("DESCRIZIONE", ""),
            "EURO_LISTINO": euro,
            "vecchio": attuale,
            "nuovo": nuovo,
        })
        aggiornati += 1

    # Salva in blocco
    if updates:
        db.bulk_update_vini(updates)

    return RicalcolaTuttiResponse(
        aggiornati=aggiornati,
        invariati=invariati,
        senza_listino=senza_listino,
        dettaglio=dettaglio,
    )
