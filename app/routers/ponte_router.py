# -*- coding: utf-8 -*-
# @version: v1.0 (2026-11-24) — il ponte chiede i fogli e riferisce; Impostazioni, token, foglio di prova
"""
Ponte di stampa — Platform, mattone M.M. [core]

    router: ponte_router · tabelle: ponte_stampanti, ponte_config, ponte_lavori
    prefix: /ponte · dipendenze platform: auth, permessi, stampa_escpos

Per il ponte (il programma in `ponte/`, che si fa riconoscere con l'intestazione X-Ponte-Token:
niente login, niente JWT):
    GET    /ponte/lavori/              i fogli da stampare adesso, già impaginati (base64)
    POST   /ponte/lavori/esito         {id, ok, errore}: com'è andata

Per le pagine di TRGB:
    GET    /ponte/stato/               il ponte si fa sentire? la stampa è ferma?
                                       (admin, capo sala, sala, sommelier: chi prende le comande)
    GET    /ponte/impostazioni/        stampanti e tempi (solo admin)
    PUT    /ponte/impostazioni/        idem
    POST   /ponte/token/               crea il token del ponte: lo mostra una volta sola (solo admin)
    POST   /ponte/prova/               {stampante}: mette in coda un foglio di prova (solo admin)

Logica tutta in app/services/ponte_service.py.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.models.ponte_db import init_ponte_db
from app.services import ponte_service as svc
from app.services.permessi import richiede_ruoli, solo_admin

router = APIRouter(prefix="/ponte", tags=["ponte"])

init_ponte_db()

_ADMIN = Depends(solo_admin())
_SALA = Depends(richiede_ruoli("admin", "capo_sala", "sala", "sommelier", cosa="lo stato della stampa"))


def _ponte(x_ponte_token: Optional[str] = Header(default=None)) -> bool:
    """Il ponte non è un utente: si presenta col suo token."""
    if not svc.token_valido(x_ponte_token):
        raise HTTPException(status_code=401, detail="Token del ponte mancante o non valido")
    return True


def _errori(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except svc.PonteErrore as e:
        raise HTTPException(status_code=400, detail=str(e))


class Esito(BaseModel):
    id: str
    ok: bool
    errore: Optional[str] = None


class Impostazioni(BaseModel):
    stampanti: Optional[List[Dict[str, Any]]] = None
    valori: Optional[Dict[str, Any]] = None


class Prova(BaseModel):
    stampante: str


# ── per il ponte ─────────────────────────────────────────────

@router.get("/lavori/")
def get_lavori(nome: Optional[str] = None, versione: Optional[str] = None, _=Depends(_ponte)):
    return svc.lavori_per_il_ponte({"nome": nome, "versione": versione})


@router.post("/lavori/esito")
def post_esito(req: Esito, _=Depends(_ponte)):
    _errori(svc.esito, req.id, req.ok, req.errore)
    return {"ok": True}


# ── per le pagine ────────────────────────────────────────────

@router.get("/stato/")
def get_stato(user=_SALA):
    return svc.stato()


@router.get("/impostazioni/")
def get_impostazioni(user=_ADMIN):
    return svc.impostazioni()


@router.put("/impostazioni/")
def put_impostazioni(req: Impostazioni, user=_ADMIN):
    return _errori(svc.salva_impostazioni, req.model_dump(exclude_none=True))


@router.post("/token/")
def post_token(user=_ADMIN):
    return {"token": svc.nuovo_token(), "stato": svc.stato()}


@router.post("/prova/")
def post_prova(req: Prova, user=_ADMIN):
    return _errori(svc.prova, req.stampante, (user or {}).get("username"))
