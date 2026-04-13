# ============================================================
# FILE: app/routers/notifiche_router.py
# Router Notifiche & Comunicazioni — TRGB Gestionale (M.A)
# ============================================================

# @version: v1.0-notifiche-router
# -*- coding: utf-8 -*-
"""
Router Notifiche & Comunicazioni — TRGB Gestionale

Endpoint:
  Notifiche (automatiche):
    GET  /notifiche/mie           — lista notifiche per utente corrente
    GET  /notifiche/contatore     — conteggio non lette (notifiche + comunicazioni)
    POST /notifiche/{id}/letta    — segna come letta
    POST /notifiche/tutte-lette   — segna tutte come lette
    DELETE /notifiche/{id}        — elimina (solo admin)

  Comunicazioni (bacheca staff):
    GET  /comunicazioni           — lista attive per ruolo utente
    GET  /comunicazioni/tutte     — lista completa (solo admin)
    POST /comunicazioni           — crea nuova (solo admin)
    PUT  /comunicazioni/{id}      — modifica (solo admin)
    DELETE /comunicazioni/{id}    — elimina (solo admin)
    POST /comunicazioni/{id}/letta — segna come letta

Autenticazione: JWT su tutti gli endpoint.
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services.auth_service import get_current_user
from app.models.notifiche_db import init_notifiche_db
from app.services.notifiche_service import (
    get_notifiche_utente,
    conta_non_lette,
    segna_letta,
    segna_tutte_lette,
    elimina_notifica,
    crea_comunicazione,
    get_comunicazioni_attive,
    get_tutte_comunicazioni,
    segna_comunicazione_letta,
    aggiorna_comunicazione,
    elimina_comunicazione,
    conta_comunicazioni_non_lette,
)

# Inizializza DB al primo import
init_notifiche_db()

router = APIRouter(prefix="/notifiche", tags=["notifiche"])


# ─── Pydantic Models ───────────────────────────

class ComunicazioneIn(BaseModel):
    titolo: str
    messaggio: str
    urgenza: str = "normale"
    dest_ruolo: str = "tutti"
    scadenza: Optional[str] = None

class ComunicazioneUpdate(BaseModel):
    titolo: Optional[str] = None
    messaggio: Optional[str] = None
    urgenza: Optional[str] = None
    dest_ruolo: Optional[str] = None
    scadenza: Optional[str] = None
    attiva: Optional[int] = None


# ─── Helper: check admin ───────────────────────

def _require_admin(user: dict):
    if user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo admin")


# ═══════════════════════════════════════════════
# NOTIFICHE (automatiche dal sistema)
# ═══════════════════════════════════════════════

@router.get("/mie")
def api_notifiche_mie(
    limit: int = 50,
    offset: int = 0,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Lista notifiche per l'utente corrente (per username, ruolo o globali)."""
    return get_notifiche_utente(
        username=current_user["username"],
        ruolo=current_user["role"],
        limit=limit,
        offset=offset,
    )


@router.get("/contatore")
def api_contatore(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Conteggio aggregato non lette: notifiche + comunicazioni.
    Usato dal badge campanello nell'Header.
    """
    username = current_user["username"]
    ruolo = current_user["role"]
    n_notifiche = conta_non_lette(username, ruolo)
    n_comunicazioni = conta_comunicazioni_non_lette(username, ruolo)
    return {
        "notifiche": n_notifiche,
        "comunicazioni": n_comunicazioni,
        "totale": n_notifiche + n_comunicazioni,
    }


@router.post("/{notifica_id}/letta")
def api_segna_letta(
    notifica_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Segna una notifica come letta."""
    segna_letta(notifica_id, current_user["username"])
    return {"ok": True}


@router.post("/tutte-lette")
def api_tutte_lette(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Segna tutte le notifiche come lette."""
    count = segna_tutte_lette(current_user["username"], current_user["role"])
    return {"ok": True, "segnate": count}


@router.delete("/{notifica_id}")
def api_elimina_notifica(
    notifica_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Elimina una notifica (solo admin)."""
    _require_admin(current_user)
    if not elimina_notifica(notifica_id):
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    return {"ok": True}


# ═══════════════════════════════════════════════
# COMUNICAZIONI (bacheca admin → staff)
# ═══════════════════════════════════════════════

com_router = APIRouter(prefix="/comunicazioni", tags=["comunicazioni"])


@com_router.get("")
def api_comunicazioni_attive(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Lista comunicazioni attive visibili per il ruolo dell'utente."""
    return get_comunicazioni_attive(
        ruolo=current_user["role"],
        username=current_user["username"],
    )


@com_router.get("/tutte")
def api_comunicazioni_tutte(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Lista completa comunicazioni (solo admin — include archiviate)."""
    _require_admin(current_user)
    return get_tutte_comunicazioni()


@com_router.post("")
def api_crea_comunicazione(
    body: ComunicazioneIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Crea una nuova comunicazione (solo admin)."""
    _require_admin(current_user)
    cid = crea_comunicazione(
        autore=current_user["username"],
        titolo=body.titolo,
        messaggio=body.messaggio,
        urgenza=body.urgenza,
        dest_ruolo=body.dest_ruolo,
        scadenza=body.scadenza,
    )
    return {"ok": True, "id": cid}


@com_router.put("/{com_id}")
def api_aggiorna_comunicazione(
    com_id: int,
    body: ComunicazioneUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Modifica una comunicazione (solo admin)."""
    _require_admin(current_user)
    updated = aggiorna_comunicazione(
        com_id=com_id,
        titolo=body.titolo,
        messaggio=body.messaggio,
        urgenza=body.urgenza,
        dest_ruolo=body.dest_ruolo,
        scadenza=body.scadenza,
        attiva=body.attiva,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Comunicazione non trovata")
    return {"ok": True}


@com_router.delete("/{com_id}")
def api_elimina_comunicazione(
    com_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Elimina una comunicazione (solo admin)."""
    _require_admin(current_user)
    if not elimina_comunicazione(com_id):
        raise HTTPException(status_code=404, detail="Comunicazione non trovata")
    return {"ok": True}


@com_router.post("/{com_id}/letta")
def api_segna_comunicazione_letta(
    com_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Segna una comunicazione come letta."""
    segna_comunicazione_letta(com_id, current_user["username"])
    return {"ok": True}
