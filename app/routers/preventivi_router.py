"""
Router Preventivi — API CRUD preventivi eventi + template + PDF.
Prefix: /preventivi
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, List

from app.services.auth_service import get_current_user, is_admin
from app.services.pdf_brand import genera_pdf_html, safe_filename
from app.services.preventivi_service import (
    crea_preventivo,
    get_preventivo,
    lista_preventivi,
    stats_preventivi,
    aggiorna_preventivo,
    elimina_preventivo,
    cambia_stato,
    duplica_preventivo,
    lista_template,
    crea_template,
    aggiorna_template,
    elimina_template,
)

router = APIRouter(prefix="/preventivi", tags=["Preventivi"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RigaIn(BaseModel):
    descrizione: str = ""
    qta: float = 1
    prezzo_unitario: float = 0
    tipo_riga: str = "voce"
    ordine: int = 0


class PreventivoCreate(BaseModel):
    cliente_id: Optional[int] = None
    titolo: str
    tipo: str = "cena_privata"
    data_evento: Optional[str] = None
    ora_evento: Optional[str] = None
    n_persone: Optional[int] = None
    luogo: str = "sala"
    note_interne: Optional[str] = None
    note_cliente: Optional[str] = None
    condizioni: Optional[str] = None
    scadenza_conferma: Optional[str] = None
    canale: str = "telefono"
    template_id: Optional[int] = None
    righe: List[RigaIn] = []


class PreventivoUpdate(BaseModel):
    cliente_id: Optional[int] = None
    titolo: Optional[str] = None
    tipo: Optional[str] = None
    data_evento: Optional[str] = None
    ora_evento: Optional[str] = None
    n_persone: Optional[int] = None
    luogo: Optional[str] = None
    note_interne: Optional[str] = None
    note_cliente: Optional[str] = None
    condizioni: Optional[str] = None
    scadenza_conferma: Optional[str] = None
    canale: Optional[str] = None
    template_id: Optional[int] = None
    righe: Optional[List[RigaIn]] = None


class StatoIn(BaseModel):
    stato: str


class TemplateIn(BaseModel):
    nome: str
    tipo: str = "cena_privata"
    righe: Optional[list] = None
    condizioni_default: Optional[str] = None


class TemplateUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    righe: Optional[list] = None
    condizioni_default: Optional[str] = None
    attivo: Optional[bool] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_admin(user: dict):
    # Accetta sia admin sia superadmin (coerente con is_admin() in auth_service)
    if not is_admin(user.get("role")):
        raise HTTPException(status_code=403, detail="Solo admin")


# ---------------------------------------------------------------------------
# Lista + Stats (path fissi PRIMA di /{preventivo_id})
# ---------------------------------------------------------------------------

@router.get("")
def api_lista_preventivi(
    stato: Optional[str] = None,
    mese: Optional[int] = None,
    anno: Optional[int] = None,
    cliente_id: Optional[int] = None,
    tipo: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
):
    return lista_preventivi(
        stato=stato, mese=mese, anno=anno,
        cliente_id=cliente_id, tipo=tipo, q=q,
        limit=limit, offset=offset,
    )


@router.get("/stats")
def api_stats_preventivi(user: dict = Depends(get_current_user)):
    _require_admin(user)
    return stats_preventivi()


# ---------------------------------------------------------------------------
# Template (path fissi /template/* PRIMA di /{preventivo_id})
# ---------------------------------------------------------------------------

@router.get("/template/lista")
def api_lista_template(user: dict = Depends(get_current_user)):
    return lista_template(solo_attivi=True)


@router.post("/template")
def api_crea_template(body: TemplateIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    return crea_template(body.dict())


@router.put("/template/{template_id}")
def api_aggiorna_template(template_id: int, body: TemplateUpdate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    data = body.dict(exclude_none=True)
    result = aggiorna_template(template_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return result


@router.delete("/template/{template_id}")
def api_elimina_template(template_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    ok = elimina_template(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return {"ok": True}


# ---------------------------------------------------------------------------
# CRUD Preventivi (/{preventivo_id} path parametrici — DOPO i path fissi)
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}")
def api_get_preventivo(preventivo_id: int, user: dict = Depends(get_current_user)):
    prev = get_preventivo(preventivo_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return prev


@router.post("")
def api_crea_preventivo(body: PreventivoCreate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    data = body.dict(exclude={"righe"})
    righe = [r.dict() for r in body.righe]
    return crea_preventivo(data, righe, user["username"])


@router.put("/{preventivo_id}")
def api_aggiorna_preventivo(preventivo_id: int, body: PreventivoUpdate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    data = body.dict(exclude={"righe"}, exclude_none=True)
    righe = [r.dict() for r in body.righe] if body.righe is not None else None
    result = aggiorna_preventivo(preventivo_id, data, righe)
    if not result:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return result


@router.delete("/{preventivo_id}")
def api_elimina_preventivo(preventivo_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    ok = elimina_preventivo(preventivo_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return {"ok": True}


@router.post("/{preventivo_id}/stato")
def api_cambia_stato(preventivo_id: int, body: StatoIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    try:
        result = cambia_stato(preventivo_id, body.stato)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return result


@router.post("/{preventivo_id}/duplica")
def api_duplica_preventivo(preventivo_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    result = duplica_preventivo(preventivo_id, user["username"])
    if not result:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return result


# ---------------------------------------------------------------------------
# PDF preventivo (mattone M.B — pdf_brand)
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}/pdf")
def api_pdf_preventivo(
    preventivo_id: int,
    inline: bool = Query(False, description="Se True apre inline nel browser, altrimenti download"),
    user: dict = Depends(get_current_user),
):
    """
    Genera il PDF brandizzato di un preventivo usando il mattone M.B (pdf_brand).
    """
    prev = get_preventivo(preventivo_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")

    righe = prev.get("righe") or []
    numero = prev.get("numero") or f"preventivo_{preventivo_id}"

    try:
        pdf_bytes = genera_pdf_html(
            template="preventivo.html",
            dati={"prev": prev, "righe": righe},
            titolo=f"Preventivo {numero}",
            sottotitolo=prev.get("titolo") or None,
            orientamento="portrait",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")

    filename = safe_filename(numero.replace("-", "_").lower(), ext="pdf")
    disposition = "inline" if inline else "attachment"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )
