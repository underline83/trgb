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
- POST /vini/pricing/ricalcola-calici   → ricalcola PREZZO_CALICE su tutti i vini (auto)
"""

from __future__ import annotations

from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user, is_admin
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


class RicalcolaTuttiRequest(BaseModel):
    solo_senza_prezzo: bool = False
    ids: Optional[List[int]] = None  # se specificato, aggiorna solo questi vini
    forza_prezzo_ids: Optional[List[int]] = None  # vini a cui settare FORZA_PREZZO=1


class RicalcolaTuttiResponse(BaseModel):
    aggiornati: int
    invariati: int
    senza_listino: int
    forza_prezzo_skipped: int = 0
    dettaglio: List[dict]


class PreviewItem(BaseModel):
    id: int
    DESCRIZIONE: str
    PRODUTTORE: Optional[str] = None
    EURO_LISTINO: Optional[float]
    PREZZO_CARTA_ATTUALE: Optional[float]
    PREZZO_CARTA_NUOVO: Optional[float]
    differenza: Optional[float]
    FORZA_PREZZO: int = 0


# ── Helper: verifica admin ─────────────────────────────────

def _require_admin(current_user: Any):
    role = None
    if isinstance(current_user, dict):
        role = current_user.get("ruolo") or current_user.get("role")
    elif hasattr(current_user, "ruolo"):
        role = current_user.ruolo
    if not is_admin(role):
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
def preview_ricalcolo(
    solo_senza_prezzo: bool = False,
    current_user: Any = Depends(get_current_user),
):
    _require_admin(current_user)

    bp = load_breakpoints()
    rows = db.search_vini()  # tutti i vini
    result = []

    for row in rows:
        r = dict(row)
        euro = r.get("EURO_LISTINO")
        attuale = r.get("PREZZO_CARTA")

        # Se filtro "solo senza prezzo": salta chi ha già PREZZO_CARTA
        if solo_senza_prezzo and attuale is not None and attuale > 0:
            continue

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
            "FORZA_PREZZO": r.get("FORZA_PREZZO", 0) or 0,
        })

    return result


# ── Endpoint: ricalcola tutti ──────────────────────────────

@router.post("/ricalcola-tutti", summary="Ricalcola PREZZO_CARTA su tutti i vini con EURO_LISTINO")
def ricalcola_tutti(
    payload: RicalcolaTuttiRequest = None,
    current_user: Any = Depends(get_current_user),
):
    _require_admin(current_user)

    if payload is None:
        payload = RicalcolaTuttiRequest()

    solo_senza_prezzo = payload.solo_senza_prezzo
    selected_ids = set(payload.ids) if payload.ids else None
    forza_prezzo_ids = set(payload.forza_prezzo_ids) if payload.forza_prezzo_ids else set()

    # Step 1: setta FORZA_PREZZO sui vini richiesti
    if forza_prezzo_ids:
        fp_updates = [{"id": vid, "FORZA_PREZZO": 1} for vid in forza_prezzo_ids]
        db.bulk_update_vini(fp_updates)

    bp = load_breakpoints()
    rows = db.search_vini()  # tutti i vini

    aggiornati = 0
    invariati = 0
    senza_listino = 0
    forza_prezzo_skipped = 0
    dettaglio = []

    updates = []
    for row in rows:
        r = dict(row)
        vino_id = r["id"]

        # Se abbiamo una selezione, salta quelli non selezionati
        if selected_ids is not None and vino_id not in selected_ids:
            continue

        euro = r.get("EURO_LISTINO")

        if not euro or euro <= 0:
            senza_listino += 1
            continue

        attuale = r.get("PREZZO_CARTA")

        # Se filtro "solo senza prezzo": salta chi ha già PREZZO_CARTA
        if solo_senza_prezzo and attuale is not None and attuale > 0:
            invariati += 1
            continue

        nuovo = calcola_prezzo_carta(euro, bp)

        # Se FORZA_PREZZO attivo: non aggiornare ma riporta la differenza
        forza = (r.get("FORZA_PREZZO") or 0) or (vino_id in forza_prezzo_ids)
        if forza:
            forza_prezzo_skipped += 1
            dettaglio.append({
                "id": vino_id,
                "DESCRIZIONE": r.get("DESCRIZIONE", ""),
                "EURO_LISTINO": euro,
                "vecchio": attuale,
                "nuovo": nuovo,
                "forza_prezzo": True,
                "differenza": round(nuovo - (attuale or 0), 2) if attuale is not None else None,
            })
            continue

        if attuale is not None and abs(nuovo - attuale) < 0.01:
            invariati += 1
            continue

        updates.append({"id": vino_id, "PREZZO_CARTA": nuovo})
        dettaglio.append({
            "id": vino_id,
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
        forza_prezzo_skipped=forza_prezzo_skipped,
        dettaglio=dettaglio,
    )


# ── Endpoint: ricalcola calici ───────────────────────────

@router.post("/ricalcola-calici", summary="Ricalcola PREZZO_CALICE su tutti i vini (auto = PREZZO_CARTA / 5)")
def ricalcola_calici(
    current_user: Any = Depends(get_current_user),
):
    """
    Per ogni vino con PREZZO_CALICE_MANUALE = 0 (auto):
    - Se PREZZO_CARTA > 0 → PREZZO_CALICE = round(PREZZO_CARTA / 5, 2)
    - Altrimenti → PREZZO_CALICE = NULL
    Non tocca i prezzi manuali (PREZZO_CALICE_MANUALE = 1).
    """
    _require_admin(current_user)

    rows = db.search_vini()  # tutti i vini
    aggiornati = 0
    invariati = 0
    manuali_skip = 0
    senza_prezzo = 0
    dettaglio = []

    updates = []
    for row in rows:
        r = dict(row)
        manuale = r.get("PREZZO_CALICE_MANUALE") or 0
        if manuale:
            manuali_skip += 1
            continue

        prezzo_carta = r.get("PREZZO_CARTA")
        if not prezzo_carta or prezzo_carta <= 0:
            senza_prezzo += 1
            continue

        nuovo = round(prezzo_carta / 5, 2)
        attuale = r.get("PREZZO_CALICE")

        if attuale is not None and abs(nuovo - attuale) < 0.01:
            invariati += 1
            continue

        updates.append({"id": r["id"], "PREZZO_CALICE": nuovo})
        dettaglio.append({
            "id": r["id"],
            "DESCRIZIONE": r.get("DESCRIZIONE", ""),
            "PREZZO_CARTA": prezzo_carta,
            "vecchio": attuale,
            "nuovo": nuovo,
        })
        aggiornati += 1

    if updates:
        db.bulk_update_vini(updates)

    return {
        "aggiornati": aggiornati,
        "invariati": invariati,
        "manuali_skip": manuali_skip,
        "senza_prezzo": senza_prezzo,
        "dettaglio": dettaglio,
    }
