# Modulo: vini (ordini ai fornitori) — [core]
"""
Router degli ordini ai fornitori — fasi O3/O4/O5 (sessione 2026-08-02).

Prefix `/vini/ordini`. Vedi `docs/modulo_vini_ordini.md`.

PERMESSI
Lettura: qualsiasi utente loggato (chi sta in sala deve poter vedere cosa sta
arrivando). Scrittura: `is_vini_manager` (admin/superadmin/sommelier) — stesso
gate delle anagrafiche vini. Mandare un ordine a un fornitore impegna soldi:
non e' un'azione da lasciare a chiunque abbia un login.

TRAILING SLASH: gli endpoint "root" sono dichiarati con "/" finale e vanno
chiamati con lo slash dal frontend (regola TRGB in CLAUDE.md).
"""

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.models import vini_ordini_db as db
from app.services.auth_service import get_current_user, is_vini_manager

router = APIRouter(prefix="/vini/ordini", tags=["vini-ordini"])


# ============================================================
# Permessi — stessi helper degli altri router vini, non copie nuove
# ============================================================
def _username(current_user: Any) -> str:
    if isinstance(current_user, dict):
        return current_user.get("username") or current_user.get("sub") or "unknown"
    for attr in ("username", "sub"):
        val = getattr(current_user, attr, None)
        if val:
            return str(val)
    return "unknown"


def _role_of(current_user: Any):
    return (
        current_user.get("role") if isinstance(current_user, dict)
        else getattr(current_user, "role", None)
    )


def _require_manager(current_user: Any) -> None:
    if not is_vini_manager(_role_of(current_user)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operazione riservata ad admin e sommelier.",
        )


# ============================================================
# Payload
# ============================================================
class RigaPayload(BaseModel):
    vino_id: int
    qta: int = Field(..., gt=0, description="quantità voluta (sostituisce, non somma)")
    note: Optional[str] = None


class InvioPayload(BaseModel):
    canale: str = Field("whatsapp", description="whatsapp | email | voce | rappresentante | manuale")


class RigaRicevuta(BaseModel):
    riga_id: int
    qta: int = Field(..., ge=0, description="quantità arrivata ORA (incremento, non totale)")


class RicezionePayload(BaseModel):
    righe: List[RigaRicevuta]
    note: Optional[str] = None


# ============================================================
# Lettura
# ============================================================
@router.get("/", summary="Elenco ordini (senza righe)")
def list_ordini(
    stato: Optional[str] = Query(None),
    solo_aperti: bool = Query(False, description="bozza + inviato + parziale"),
    fornitore_nome: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: Any = Depends(get_current_user),
):
    return db.list_ordini(
        stato=stato, solo_aperti=solo_aperti, fornitore_nome=fornitore_nome, limit=limit
    )


@router.get("/riepilogo/", summary="Numeri per il semaforo in dashboard")
def riepilogo(current_user: Any = Depends(get_current_user)):
    return db.riepilogo()


@router.get("/fornitori/", summary="Fornitori con da-ordinare e ordini aperti")
def fornitori(current_user: Any = Depends(get_current_user)):
    return db.fornitori_con_lavoro()


@router.get("/da-ordinare/", summary="Vini da riordinare per un fornitore")
def da_ordinare(
    fornitore_nome: str = Query(..., min_length=1),
    current_user: Any = Depends(get_current_user),
):
    return db.da_ordinare(fornitore_nome)


@router.get("/{ordine_id}", summary="Dettaglio ordine con righe e totali")
def get_ordine(ordine_id: int, current_user: Any = Depends(get_current_user)):
    ordine = db.get_ordine(ordine_id)
    if not ordine:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ordine non trovato")
    return ordine


# ============================================================
# Scrittura
# ============================================================
@router.post("/riga/", summary="Aggiunge (o aggiorna) un vino nella bozza del suo fornitore")
def aggiungi_riga(payload: RigaPayload, current_user: Any = Depends(get_current_user)):
    _require_manager(current_user)
    try:
        return db.aggiungi_riga(
            vino_id=payload.vino_id, qta=payload.qta,
            utente=_username(current_user), note=payload.note,
        )
    except ValueError as e:
        msg = str(e)
        raise HTTPException(
            status.HTTP_404_NOT_FOUND if "non trovato" in msg.lower()
            else status.HTTP_400_BAD_REQUEST,
            msg,
        )


@router.delete("/riga/{riga_id}", summary="Toglie una riga dalla bozza")
def rimuovi_riga(riga_id: int, current_user: Any = Depends(get_current_user)):
    _require_manager(current_user)
    try:
        ordine = db.rimuovi_riga(riga_id)
    except ValueError as e:
        msg = str(e)
        raise HTTPException(
            status.HTTP_404_NOT_FOUND if "non trovata" in msg.lower()
            else status.HTTP_400_BAD_REQUEST,
            msg,
        )
    # ordine None = era l'ultima riga, la bozza vuota e' stata eliminata.
    return {"status": "ok", "ordine": ordine}


@router.post("/{ordine_id}/invia", summary="Bozza → inviato (marca data e canale)")
def invia(ordine_id: int, payload: InvioPayload, current_user: Any = Depends(get_current_user)):
    _require_manager(current_user)
    try:
        return db.marca_inviato(ordine_id, payload.canale, _username(current_user))
    except ValueError as e:
        msg = str(e)
        raise HTTPException(
            status.HTTP_404_NOT_FOUND if "non trovato" in msg.lower()
            else status.HTTP_400_BAD_REQUEST,
            msg,
        )


@router.post("/{ordine_id}/ricevi", summary="Registra l'arrivo (anche parziale) in atomica")
def ricevi(ordine_id: int, payload: RicezionePayload, current_user: Any = Depends(get_current_user)):
    _require_manager(current_user)
    try:
        return db.ricevi(
            ordine_id=ordine_id,
            righe=[r.dict() for r in payload.righe],
            utente=_username(current_user),
            note=payload.note,
        )
    except ValueError as e:
        msg = str(e)
        raise HTTPException(
            status.HTTP_404_NOT_FOUND if "non trovato" in msg.lower()
            else status.HTTP_400_BAD_REQUEST,
            msg,
        )


@router.post("/{ordine_id}/annulla", summary="Annulla l'ordine (resta a storico)")
def annulla(ordine_id: int, current_user: Any = Depends(get_current_user)):
    _require_manager(current_user)
    try:
        return db.annulla(ordine_id, _username(current_user))
    except ValueError as e:
        msg = str(e)
        raise HTTPException(
            status.HTTP_404_NOT_FOUND if "non trovato" in msg.lower()
            else status.HTTP_400_BAD_REQUEST,
            msg,
        )
