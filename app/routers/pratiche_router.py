# -*- coding: utf-8 -*-
# @version: v1.0 — nascita del modulo Pratiche (2026-10-08)
"""
Modulo: pratiche — pratiche aperte con enti, fornitori, studi e creditori.
Doc: docs/modulo_pratiche.md.

Manifesto (core/moduli/pratiche/module.json):
    id: pratiche · nome: Pratiche · versione: 1.0
    dipendenze platform: auth, notifiche, alert, permessi, ui_primitives
    dipendenze opzionali: controllo_gestione, dipendenti, clienti, acquisti (solo link)
    router: pratiche_router · tabelle: pratiche, pratiche_passi, pratiche_collegamenti
    DB: pratiche.sqlite3 · route FE: /pratiche · menu key: pratiche

Endpoint (tutti solo admin/superadmin: pignoramenti, creditori, contenziosi):
    GET    /pratiche/                                  elenco con filtri
    POST   /pratiche/                                  nuova pratica + primo passo (multipart)
    GET    /pratiche/{id}                              pratica con passi e collegamenti
    PATCH  /pratiche/{id}                              titolo, controparte, contatto
    POST   /pratiche/{id}/passi                        nuovo passo (multipart): stato, termine, esito, allegato
    GET    /pratiche/{id}/passi/{passo_id}/allegato    scarica l'allegato
    POST   /pratiche/{id}/collegamenti                 collega un oggetto di un altro modulo
    DELETE /pratiche/{id}/collegamenti/{cid}           lo toglie (lascia un passo automatico)

Logica tutta in app/services/pratiche_service.py, che il futuro connettore
MCP riusa: qui solo traduzione HTTP ⇄ service.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.models.pratiche_db import init_pratiche_db
from app.services import pratiche_service as svc
from app.services.permessi import solo_admin

# Chi vede le pratiche: admin e superadmin (decisione di Marco 2026-10-08).
# Per aprirle al contabile basta cambiare questa riga.
router = APIRouter(
    prefix="/pratiche",
    tags=["pratiche"],
    dependencies=[Depends(solo_admin(cosa="le pratiche"))],
)

init_pratiche_db()


def _errori(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except svc.PraticaNonTrovata as e:
        raise HTTPException(status_code=404, detail=str(e))
    except svc.PraticaErrore as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _leggi_allegato(allegato: Optional[UploadFile]):
    """(bytes, nome) oppure (None, None). Legge al massimo 20 MB + 1 byte."""
    if allegato is None or not allegato.filename:
        return None, None
    contenuto = await allegato.read(svc.ALLEGATO_MAX_BYTES + 1)
    if len(contenuto) > svc.ALLEGATO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Allegato oltre 20 MB")
    return contenuto, allegato.filename


def _bool_param(v: Optional[str]) -> Optional[bool]:
    if v is None or v == "":
        return None
    return v.lower() in ("1", "true", "si", "sì", "yes")


@router.get("/")
def elenco_pratiche(
    stato: Optional[str] = None,
    scadute: Optional[str] = None,
    ferme: Optional[str] = None,
    q: Optional[str] = None,
    chiuse: bool = False,
):
    return _errori(svc.elenco, stato=stato or None, scadute=_bool_param(scadute),
                   ferme=_bool_param(ferme), q=q, chiuse=chiuse)


@router.post("/")
async def nuova_pratica(
    titolo: str = Form(...),
    controparte: str = Form(...),
    testo: str = Form(...),
    stato: str = Form("tocca_a_loro"),
    controparte_contatto: Optional[str] = Form(None),
    termine: Optional[str] = Form(None),
    aperta_il: Optional[str] = Form(None),
    allegato: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(solo_admin(cosa="le pratiche")),
):
    contenuto, nome = await _leggi_allegato(allegato)
    return _errori(
        svc.crea_pratica,
        titolo=titolo, controparte=controparte, testo=testo, stato=stato,
        controparte_contatto=controparte_contatto, termine=termine, aperta_il=aperta_il,
        autore=user.get("username"), allegato=contenuto, allegato_nome=nome,
    )


@router.get("/{pratica_id}")
def leggi_pratica(pratica_id: int):
    return _errori(svc.leggi, pratica_id)


class TestataIn(BaseModel):
    titolo: Optional[str] = None
    controparte: Optional[str] = None
    controparte_contatto: Optional[str] = None


@router.patch("/{pratica_id}")
def correggi_testata(pratica_id: int, body: TestataIn):
    return _errori(svc.aggiorna_testata, pratica_id, titolo=body.titolo,
                   controparte=body.controparte,
                   controparte_contatto=body.controparte_contatto)


@router.post("/{pratica_id}/passi")
async def nuovo_passo(
    pratica_id: int,
    testo: str = Form(...),
    data: Optional[str] = Form(None),
    stato_a: Optional[str] = Form(None),
    termine_a: Optional[str] = Form(None),
    togli_termine: bool = Form(False),
    esito: Optional[str] = Form(None),
    allegato: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(solo_admin(cosa="le pratiche")),
):
    """`termine_a` = nuovo termine; `togli_termine=true` = nessun termine;
    nessuno dei due = il termine resta com'è."""
    if togli_termine:
        nuovo_termine: Any = None
    elif termine_a:
        nuovo_termine = termine_a
    else:
        nuovo_termine = svc.NON_CAMBIA
    contenuto, nome = await _leggi_allegato(allegato)
    return _errori(
        svc.aggiungi_passo, pratica_id, testo=testo, data=data,
        stato_a=stato_a or None, termine_a=nuovo_termine, esito=esito,
        autore=user.get("username"), allegato=contenuto, allegato_nome=nome,
    )


@router.get("/{pratica_id}/passi/{passo_id}/allegato")
def scarica_allegato(pratica_id: int, passo_id: int):
    path, nome = _errori(svc.percorso_allegato, pratica_id, passo_id)
    return FileResponse(str(path), filename=nome)


class CollegamentoIn(BaseModel):
    modulo: str
    tipo: str
    ref_id: str
    etichetta: str
    link: Optional[str] = None


@router.post("/{pratica_id}/collegamenti")
def nuovo_collegamento(pratica_id: int, body: CollegamentoIn):
    return _errori(svc.collega, pratica_id, modulo=body.modulo, tipo=body.tipo,
                   ref_id=body.ref_id, etichetta=body.etichetta, link=body.link)


@router.delete("/{pratica_id}/collegamenti/{collegamento_id}")
def togli_collegamento(
    pratica_id: int,
    collegamento_id: int,
    user: Dict[str, Any] = Depends(solo_admin(cosa="le pratiche")),
):
    return _errori(svc.scollega, pratica_id, collegamento_id, autore=user.get("username"))
