# Modulo: vini (multi-fornitore) — [core]
"""
Router vini multi-fornitore — VMF.1/VMF.2 (2026-11-02).
Spec: docs/spec_vini_multifornitore.md · logica in app/services/vini_fornitori_service.py

Manifesto (per R8): modulo `vini`; tabelle `vini_madre_fornitori`,
`vini_prezzi_fornitore` (mig 225); prefix `/vini/multifornitore`.

PERMESSI (M.G): lettura ai ruoli del modulo Vini (chi carica in sala deve
vedere i fornitori); scrittura `is_vini_manager` (admin, sommelier, capo sala)
come le anagrafiche: un prezzo pagato cambia il costo e il prezzo in carta.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.services import vini_fornitori_service as svc
from app.services.auth_service import get_current_user, is_vini_manager
from app.services.permessi import richiede_ruoli

router = APIRouter(
    prefix="/vini/multifornitore",
    tags=["vini-multifornitore"],
    dependencies=[
        Depends(richiede_ruoli("admin", "sala", "sommelier", "capo_sala", cosa="fornitori dei vini")),
    ],
)


def _username(u: Any) -> str:
    if isinstance(u, dict):
        return u.get("username") or u.get("sub") or "unknown"
    return str(getattr(u, "username", None) or getattr(u, "sub", None) or "unknown")


def _manager(u: Any) -> None:
    role = u.get("role") if isinstance(u, dict) else getattr(u, "role", None)
    if not is_vini_manager(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Operazione riservata ad admin, capo sala e sommelier.")


def _esegui(fn, *a, **k):
    try:
        return fn(*a, **k)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


class FornitoreIn(BaseModel):
    fornitore_id: Optional[int] = None
    nome: Optional[str] = Field(None, max_length=120)
    note: Optional[str] = None


class PreferitoIn(BaseModel):
    fornitore_id: int


class PrezzoIn(BaseModel):
    bottiglia_id: int
    fornitore_id: int
    prezzo: float = Field(..., gt=0)
    tipo: str = Field("pagato", pattern="^(pagato|listino)$")
    data: Optional[str] = None
    note: Optional[str] = None


@router.get("/madre/{madre_id}/", summary="Fornitori di un vino e prezzi per annata")
def get_fornitori(madre_id: int, current_user: Any = Depends(get_current_user)):
    return _esegui(svc.fornitori_del_vino, madre_id)


@router.post("/madre/{madre_id}/fornitori/", summary="Aggiunge un fornitore al vino (esistente o nuovo)")
def post_fornitore(madre_id: int, payload: FornitoreIn, current_user: Any = Depends(get_current_user)):
    _manager(current_user)
    _esegui(svc.aggiungi_fornitore, madre_id, payload.fornitore_id, payload.nome, payload.note)
    return svc.fornitori_del_vino(madre_id)


@router.delete("/madre/{madre_id}/fornitori/{fornitore_id}", summary="Toglie un fornitore dal vino")
def delete_fornitore(madre_id: int, fornitore_id: int, current_user: Any = Depends(get_current_user)):
    _manager(current_user)
    _esegui(svc.rimuovi_fornitore, madre_id, fornitore_id)
    return svc.fornitori_del_vino(madre_id)


@router.post("/madre/{madre_id}/preferito/", summary="Cambia il fornitore preferito (quello degli ordini)")
def post_preferito(madre_id: int, payload: PreferitoIn, current_user: Any = Depends(get_current_user)):
    _manager(current_user)
    _esegui(svc.imposta_preferito, madre_id, payload.fornitore_id)
    return svc.fornitori_del_vino(madre_id)


@router.post("/prezzi/", summary="Registra a mano un prezzo pagato o di listino")
def post_prezzo(payload: PrezzoIn, current_user: Any = Depends(get_current_user)):
    _manager(current_user)
    return _esegui(
        svc.registra_prezzo, payload.bottiglia_id, payload.fornitore_id, payload.prezzo,
        tipo=payload.tipo, data=payload.data, fonte="manuale", note=payload.note,
        utente=_username(current_user),
    )


@router.post("/prezzi/{prezzo_id}/scarta", summary="Scarta un prezzo sbagliato (resta nello storico)")
def post_scarta(prezzo_id: int, current_user: Any = Depends(get_current_user)):
    _manager(current_user)
    return _esegui(svc.scarta_prezzo, prezzo_id, utente=_username(current_user))


@router.get("/bottiglia/{bottiglia_id}/carico/", summary="Proposta per il carico: ordini aperti e fornitori")
def get_proposta_carico(bottiglia_id: int, current_user: Any = Depends(get_current_user)):
    return _esegui(svc.proposta_carico, bottiglia_id)
