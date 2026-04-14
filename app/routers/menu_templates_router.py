"""
Router libreria Menu Template (mig 080).

Endpoint REST sotto /menu-templates/* per CRUD templates e sotto
/preventivi/{preventivo_id}/menu/{menu_id}/... per il bridge con i menu
dei preventivi (salva-come-template / carica-template).

Auth: tutte le scritture richiedono admin/superadmin. Le letture sono
accessibili a qualsiasi utente loggato (il composer preventivi le usa).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

from app.services.auth_service import get_current_user, is_admin
from app.services.menu_templates_service import (
    lista_templates,
    get_template,
    crea_template,
    aggiorna_template,
    elimina_template,
    duplica_template,
    aggiungi_riga_template,
    elimina_riga_template,
    riordina_righe_template,
    salva_menu_come_template,
    applica_template_a_menu,
)

router = APIRouter(prefix="/menu-templates", tags=["Menu Templates"])


def _require_admin(user: dict):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Solo admin")


# ──────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────

class MenuTemplateRigaIn(BaseModel):
    name: str
    description: Optional[str] = None
    price: Optional[float] = 0
    category_name: Optional[str] = None
    recipe_id: Optional[int] = None


class MenuTemplateCreateIn(BaseModel):
    nome: str
    descrizione: Optional[str] = None
    service_type_id: Optional[int] = None
    prezzo_persona: Optional[float] = 0
    sconto: Optional[float] = 0
    righe: Optional[List[MenuTemplateRigaIn]] = None


class MenuTemplateUpdateIn(BaseModel):
    nome: Optional[str] = None
    descrizione: Optional[str] = None
    service_type_id: Optional[int] = None
    prezzo_persona: Optional[float] = None
    sconto: Optional[float] = None


class MenuTemplateDuplicaIn(BaseModel):
    nome: Optional[str] = None


class MenuTemplateRigaOrderIn(BaseModel):
    ordered_ids: List[int]


class SalvaMenuComeTemplateIn(BaseModel):
    nome: str
    descrizione: Optional[str] = None
    service_type_id: Optional[int] = None


class ApplicaTemplateIn(BaseModel):
    template_id: int
    sostituisci_righe: bool = True
    aggiorna_nome: bool = True
    aggiorna_prezzo: bool = True


# ──────────────────────────────────────────────────────────────
# CRUD templates
# ──────────────────────────────────────────────────────────────

@router.get("/")
def api_lista_templates(
    service_type_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    return {"items": lista_templates(service_type_id=service_type_id, q=q)}


@router.get("/{template_id}")
def api_get_template(template_id: int, user: dict = Depends(get_current_user)):
    t = get_template(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return t


@router.post("/")
def api_crea_template(body: MenuTemplateCreateIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    data = body.model_dump(exclude={"righe"})
    righe = [r.model_dump() for r in (body.righe or [])]
    t = crea_template(data, righe=righe)
    if not t:
        raise HTTPException(status_code=400, detail="Nome template mancante o tabella non inizializzata")
    return t


@router.put("/{template_id}")
def api_aggiorna_template(
    template_id: int,
    body: MenuTemplateUpdateIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    t = aggiorna_template(template_id, data)
    if not t:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return t


@router.delete("/{template_id}")
def api_elimina_template(template_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    if not elimina_template(template_id):
        raise HTTPException(status_code=404, detail="Template non trovato")
    return {"ok": True}


@router.post("/{template_id}/duplica")
def api_duplica_template(
    template_id: int,
    body: MenuTemplateDuplicaIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    t = duplica_template(template_id, nuovo_nome=body.nome)
    if not t:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return t


# ──────────────────────────────────────────────────────────────
# Righe template
# ──────────────────────────────────────────────────────────────

@router.post("/{template_id}/righe")
def api_aggiungi_riga(
    template_id: int,
    body: MenuTemplateRigaIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    t = aggiungi_riga_template(template_id, body.model_dump())
    if not t:
        raise HTTPException(status_code=400, detail="Template non trovato o nome riga vuoto")
    return t


@router.delete("/{template_id}/righe/{riga_id}")
def api_elimina_riga(
    template_id: int,
    riga_id: int,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    t = elimina_riga_template(template_id, riga_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return t


@router.put("/{template_id}/righe-ordine")
def api_riordina_righe(
    template_id: int,
    body: MenuTemplateRigaOrderIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    t = riordina_righe_template(template_id, body.ordered_ids)
    if not t:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return t


# ──────────────────────────────────────────────────────────────
# Bridge preventivo menu ↔ template
# Questi endpoint vivono sotto /preventivi/... tramite un secondo APIRouter
# esportato qui sotto. Il main.py include entrambi.
# ──────────────────────────────────────────────────────────────

preventivi_bridge_router = APIRouter(prefix="/preventivi", tags=["Menu Templates"])


@preventivi_bridge_router.post("/{preventivo_id}/menu/{menu_id}/salva-come-template")
def api_salva_come_template(
    preventivo_id: int,
    menu_id: int,
    body: SalvaMenuComeTemplateIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    t = salva_menu_come_template(
        preventivo_id=preventivo_id,
        menu_id=menu_id,
        nome=body.nome,
        descrizione=body.descrizione,
        service_type_id=body.service_type_id,
    )
    if not t:
        raise HTTPException(
            status_code=400,
            detail="Impossibile salvare template: menu non trovato, non appartiene al preventivo, o nome vuoto",
        )
    return t


@preventivi_bridge_router.post("/{preventivo_id}/menu/{menu_id}/carica-template")
def api_carica_template(
    preventivo_id: int,
    menu_id: int,
    body: ApplicaTemplateIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    m = applica_template_a_menu(
        preventivo_id=preventivo_id,
        menu_id=menu_id,
        template_id=body.template_id,
        sostituisci_righe=body.sostituisci_righe,
        aggiorna_nome=body.aggiorna_nome,
        aggiorna_prezzo=body.aggiorna_prezzo,
    )
    if not m:
        raise HTTPException(
            status_code=404,
            detail="Template o menu non trovato, oppure ownership non valida",
        )
    return m
