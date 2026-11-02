# -*- coding: utf-8 -*-
# @version: v1.1 — sezioni, campi del debito, «in attesa di mezzi» (2026-11-02)
"""
Modulo: pratiche — pratiche aperte con enti, fornitori, studi e creditori.
Doc: docs/modulo_pratiche.md.

Manifesto (core/moduli/pratiche/module.json):
    id: pratiche · nome: Pratiche · versione: 1.1
    dipendenze platform: auth, notifiche, alert, permessi, ui_primitives
    dipendenze opzionali: controllo_gestione, dipendenti, clienti, acquisti (solo link)
    router: pratiche_router · tabelle: pratiche, pratiche_passi, pratiche_collegamenti,
            pratiche_sezioni, pratiche_tipi_atto, pratiche_config
    DB: pratiche.sqlite3 · route FE: /pratiche · menu key: pratiche

Endpoint (tutti solo admin/superadmin: pignoramenti, creditori, contenziosi):
    GET    /pratiche/                                  elenco con filtri (anche sezione, in_attesa, da_rivedere)
    GET    /pratiche/riepilogo                         conteggi per sezione + in attesa di mezzi / da rivedere
    GET    /pratiche/sezioni · POST · PATCH /{id}      le sezioni (non si cancellano: si disattivano)
    GET    /pratiche/tipi-atto · POST · PATCH /{id}    i tipi d'atto con il gradino
    GET    /pratiche/config · PUT                      giorni fra una revisione e l'altra
    POST   /pratiche/                                  nuova pratica + primo passo (multipart)
    GET    /pratiche/{id}                              pratica con passi e collegamenti
    PATCH  /pratiche/{id}                              titolo, controparte, contatto + campi del debito
    POST   /pratiche/{id}/passi                        nuovo passo (multipart): stato, termine, esito, allegato, campi del debito
    POST   /pratiche/{id}/rivedi                       «rivista, ancora senza mezzi»: la revisione slitta
    GET    /pratiche/{id}/passi/{passo_id}/allegato    scarica l'allegato
    POST   /pratiche/{id}/collegamenti                 collega un oggetto di un altro modulo
    DELETE /pratiche/{id}/collegamenti/{cid}           lo toglie (lascia un passo automatico)

Logica tutta in app/services/pratiche_service.py, che il futuro connettore
MCP riusa: qui solo traduzione HTTP ⇄ service.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

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


# Campi del debito accettati da creazione e passo (v1.1).
CAMPI_FORM = svc.CAMPI_TRACCIATI


def _campi_form(valori: Dict[str, Optional[str]], svuota: Optional[str]) -> Dict[str, Any]:
    """Form multipart: un campo vuoto arriva come assente (FastAPI), quindi per
    svuotarlo serve `svuota=rif_atto,importo_residuo`. Assente = non cambia."""
    out: Dict[str, Any] = {k: v for k, v in valori.items() if v is not None}
    for k in (svuota or "").split(","):
        k = k.strip()
        if not k:
            continue
        if k not in CAMPI_FORM:
            raise HTTPException(status_code=400, detail=f"svuota: campo sconosciuto {k}")
        out[k] = None
    return out


@router.get("/")
def elenco_pratiche(
    stato: Optional[str] = None,
    scadute: Optional[str] = None,
    ferme: Optional[str] = None,
    q: Optional[str] = None,
    chiuse: bool = False,
    sezione: Optional[str] = None,
    in_attesa: Optional[str] = None,
    da_rivedere: Optional[str] = None,
):
    return _errori(svc.elenco, stato=stato or None, scadute=_bool_param(scadute),
                   ferme=_bool_param(ferme), q=q, chiuse=chiuse, sezione=sezione,
                   in_attesa=_bool_param(in_attesa), da_rivedere=_bool_param(da_rivedere))


@router.get("/riepilogo")
def riepilogo_pratiche():
    return _errori(svc.riepilogo)


class SezioneIn(BaseModel):
    nome: Optional[str] = None
    ordine: Optional[int] = None
    attiva: Optional[bool] = None


@router.get("/sezioni")
def elenco_sezioni(tutte: bool = False):
    return svc.elenco_sezioni(con_disattive=tutte)


@router.post("/sezioni")
def nuova_sezione(body: SezioneIn):
    return _errori(svc.crea_sezione, nome=body.nome or "", ordine=body.ordine)


@router.patch("/sezioni/{sezione_id}")
def correggi_sezione(sezione_id: int, body: SezioneIn):
    return _errori(svc.aggiorna_sezione, sezione_id, nome=body.nome, ordine=body.ordine,
                   attiva=body.attiva)


class TipoAttoIn(BaseModel):
    nome: Optional[str] = None
    gradino: Optional[int] = None
    sezione_id: Optional[int] = None
    attivo: Optional[bool] = None


def _impostati(body: BaseModel) -> set:
    return set(getattr(body, "model_fields_set", None) or getattr(body, "__fields_set__", set()))


@router.get("/tipi-atto")
def elenco_tipi_atto(tutti: bool = False):
    return svc.elenco_tipi_atto(con_disattivi=tutti)


@router.post("/tipi-atto")
def nuovo_tipo_atto(body: TipoAttoIn):
    return _errori(svc.crea_tipo_atto, nome=body.nome or "", gradino=body.gradino,
                   sezione=body.sezione_id)


@router.patch("/tipi-atto/{tipo_id}")
def correggi_tipo_atto(tipo_id: int, body: TipoAttoIn):
    dati = _impostati(body)
    return _errori(
        svc.aggiorna_tipo_atto, tipo_id, nome=body.nome,
        gradino=body.gradino if "gradino" in dati else svc.NON_CAMBIA,
        sezione=body.sezione_id if "sezione_id" in dati else svc.NON_CAMBIA,
        attivo=body.attivo,
    )


class ConfigIn(BaseModel):
    giorni_revisione: int


@router.get("/config")
def leggi_config():
    return svc.leggi_config()


@router.put("/config")
def salva_config(body: ConfigIn):
    return _errori(svc.salva_config, body.giorni_revisione)


@router.post("/")
async def nuova_pratica(
    titolo: str = Form(...),
    controparte: str = Form(...),
    testo: str = Form(...),
    stato: str = Form("tocca_a_loro"),
    controparte_contatto: Optional[str] = Form(None),
    termine: Optional[str] = Form(None),
    aperta_il: Optional[str] = Form(None),
    sezione_id: Optional[str] = Form(None),
    tipo_atto_id: Optional[str] = Form(None),
    rif_atto: Optional[str] = Form(None),
    periodo: Optional[str] = Form(None),
    importo_dovuto: Optional[str] = Form(None),
    importo_residuo: Optional[str] = Form(None),
    in_attesa_mezzi: Optional[str] = Form(None),
    revisione_il: Optional[str] = Form(None),
    allegato: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(solo_admin(cosa="le pratiche")),
):
    contenuto, nome = await _leggi_allegato(allegato)
    campi = _campi_form({
        "sezione_id": sezione_id, "tipo_atto_id": tipo_atto_id, "rif_atto": rif_atto,
        "periodo": periodo, "importo_dovuto": importo_dovuto, "importo_residuo": importo_residuo,
        "in_attesa_mezzi": in_attesa_mezzi, "revisione_il": revisione_il,
    }, None)
    return _errori(
        svc.crea_pratica,
        titolo=titolo, controparte=controparte, testo=testo, stato=stato,
        controparte_contatto=controparte_contatto, termine=termine, aperta_il=aperta_il,
        autore=user.get("username"), allegato=contenuto, allegato_nome=nome, campi=campi,
    )


@router.get("/{pratica_id}")
def leggi_pratica(pratica_id: int):
    return _errori(svc.leggi, pratica_id)


class TestataIn(BaseModel):
    titolo: Optional[str] = None
    controparte: Optional[str] = None
    controparte_contatto: Optional[str] = None
    # v1.1 — campi del debito: un campo passato a null si svuota, uno assente resta
    sezione_id: Optional[int] = None
    tipo_atto_id: Optional[int] = None
    rif_atto: Optional[str] = None
    periodo: Optional[str] = None
    importo_dovuto: Optional[float] = None
    importo_residuo: Optional[float] = None
    in_attesa_mezzi: Optional[bool] = None
    revisione_il: Optional[str] = None


@router.patch("/{pratica_id}")
def correggi_testata(
    pratica_id: int,
    body: TestataIn,
    user: Dict[str, Any] = Depends(solo_admin(cosa="le pratiche")),
):
    dati = _impostati(body)
    campi = {k: getattr(body, k) for k in svc.CAMPI_TRACCIATI if k in dati}
    return _errori(svc.aggiorna_testata, pratica_id, titolo=body.titolo,
                   controparte=body.controparte,
                   controparte_contatto=body.controparte_contatto,
                   campi_debito=campi, autore=user.get("username"))


@router.post("/{pratica_id}/passi")
async def nuovo_passo(
    pratica_id: int,
    testo: str = Form(...),
    data: Optional[str] = Form(None),
    stato_a: Optional[str] = Form(None),
    termine_a: Optional[str] = Form(None),
    togli_termine: bool = Form(False),
    esito: Optional[str] = Form(None),
    sezione_id: Optional[str] = Form(None),
    tipo_atto_id: Optional[str] = Form(None),
    rif_atto: Optional[str] = Form(None),
    periodo: Optional[str] = Form(None),
    importo_dovuto: Optional[str] = Form(None),
    importo_residuo: Optional[str] = Form(None),
    in_attesa_mezzi: Optional[str] = Form(None),
    revisione_il: Optional[str] = Form(None),
    svuota: Optional[str] = Form(None),
    allegato: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(solo_admin(cosa="le pratiche")),
):
    """`termine_a` = nuovo termine; `togli_termine=true` = nessun termine;
    nessuno dei due = il termine resta com'è. Campi del debito: assenti = non
    cambiano; `svuota=campo1,campo2` per toglierli."""
    campi = _campi_form({
        "sezione_id": sezione_id, "tipo_atto_id": tipo_atto_id, "rif_atto": rif_atto,
        "periodo": periodo, "importo_dovuto": importo_dovuto, "importo_residuo": importo_residuo,
        "in_attesa_mezzi": in_attesa_mezzi, "revisione_il": revisione_il,
    }, svuota)
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
        autore=user.get("username"), allegato=contenuto, allegato_nome=nome, campi=campi,
    )


class RivediIn(BaseModel):
    testo: Optional[str] = None


@router.post("/{pratica_id}/rivedi")
def rivedi_pratica(
    pratica_id: int,
    body: RivediIn,
    user: Dict[str, Any] = Depends(solo_admin(cosa="le pratiche")),
):
    return _errori(svc.rivedi, pratica_id, testo=body.testo, autore=user.get("username"))


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
