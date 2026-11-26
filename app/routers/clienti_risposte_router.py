# @version: v1.0 (2026-11-26) — template di risposta ai clienti: elenco, scrittura (admin), compila coi blocchi vivi
# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Template di risposta ai clienti — router (mig 246, service clienti_risposte_service)

Endpoint prefix: /clienti/risposte-template
Tabelle: clienti_risposte_template (+ chiave `risposte_link_prenotazione` in clienti_impostazioni)
Frontend: Clienti › Impostazioni › Template di risposta (ClientiRisposteTemplate.jsx);
          si usano in Clienti › Posta rispondendo a una mail (ClientiPosta.jsx)
Dipendenze platform: M.G permessi, M.C (fill_template), M.D (le bozze le crea /email/bozze)
Dipendenze opzionali: prenotazioni (c'è posto?), libreria menù dei preventivi

  GET    /clienti/risposte-template/                elenco + blocchi disponibili + impostazioni
  GET    /clienti/risposte-template/{id}            un template
  GET    /clienti/risposte-template/{id}/compila    testo coi blocchi riempiti ADESSO (canale, nome)
  POST   /clienti/risposte-template/anteprima       compila un template non ancora salvato (editor)
  POST   /clienti/risposte-template/                crea
  PUT    /clienti/risposte-template/{id}            modifica
  DELETE /clienti/risposte-template/{id}            elimina
  PUT    /clienti/risposte-template/impostazioni    link di prenotazione

Chi può (M.G): leggere e compilare chi ha Clienti › Posta nella matrice Moduli (li usa
rispondendo); scrivere template e impostazioni solo admin. Compilare non scrive e non
manda niente: la mail nasce come bozza da /email/bozze, come tutte le altre.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.services import clienti_risposte_service as srv
from app.services.permessi import richiede_ruoli, richiede_sotto_modulo

router = APIRouter(prefix="/clienti/risposte-template", tags=["Clienti · Template di risposta"])

_USA = richiede_sotto_modulo("clienti", "posta", cosa="i template di risposta")
_SCRIVE = richiede_ruoli("admin", cosa="la modifica dei template di risposta")


class TemplateIn(BaseModel):
    nome: str
    attivo: bool = True
    occasione_data: Optional[str] = None
    occasione_turno: Optional[str] = None
    pax_prova: Optional[int] = None
    menu_template_id: Optional[int] = None
    oggetto: Optional[str] = None
    testo_mail: Optional[str] = None
    testo_wa: Optional[str] = None
    disp_posto: Optional[str] = None
    disp_pieno: Optional[str] = None


class AnteprimaIn(TemplateIn):
    canale: str = "mail"
    nome_cliente: Optional[str] = None


class ImpostazioniIn(BaseModel):
    link_prenotazione: Optional[str] = None


def _errore(e: Exception):
    raise HTTPException(status_code=404 if "(404)" in str(e) else 400, detail=str(e))


@router.get("/")
def elenco_ep(solo_attivi: bool = Query(False), user: Dict[str, Any] = Depends(_USA)):
    return {"template": srv.elenco(solo_attivi=solo_attivi), "blocchi": srv.BLOCCHI,
            "impostazioni": srv.impostazioni()}


@router.put("/impostazioni")
def impostazioni_ep(payload: ImpostazioniIn, user: Dict[str, Any] = Depends(_SCRIVE)):
    try:
        return srv.salva_impostazioni(payload.link_prenotazione)
    except srv.ErroreTemplate as e:
        _errore(e)


@router.post("/anteprima")
def anteprima_ep(payload: AnteprimaIn, user: Dict[str, Any] = Depends(_SCRIVE)):
    """Come uscirebbe adesso il template che si sta scrivendo, senza salvarlo."""
    try:
        dati = payload.dict()
        canale, nome = dati.pop("canale"), dati.pop("nome_cliente")
        return srv.compila(srv.pulisci(dati), canale=canale, nome=nome)
    except srv.ErroreTemplate as e:
        _errore(e)


@router.post("/")
def crea_ep(payload: TemplateIn, user: Dict[str, Any] = Depends(_SCRIVE)):
    try:
        return srv.salva(payload.dict(), user["username"])
    except srv.ErroreTemplate as e:
        _errore(e)


@router.get("/{template_id}")
def leggi_ep(template_id: int, user: Dict[str, Any] = Depends(_USA)):
    t = srv.leggi(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return t


@router.get("/{template_id}/compila")
def compila_ep(template_id: int, canale: str = Query("mail", pattern="^(mail|wa)$"),
               nome: Optional[str] = Query(None, max_length=120), user: Dict[str, Any] = Depends(_USA)):
    try:
        return srv.compila_salvato(template_id, canale=canale, nome=nome)
    except srv.ErroreTemplate as e:
        _errore(e)


@router.put("/{template_id}")
def modifica_ep(template_id: int, payload: TemplateIn, user: Dict[str, Any] = Depends(_SCRIVE)):
    try:
        return srv.salva(payload.dict(), user["username"], template_id=template_id)
    except srv.ErroreTemplate as e:
        _errore(e)


@router.delete("/{template_id}")
def elimina_ep(template_id: int, user: Dict[str, Any] = Depends(_SCRIVE)):
    if not srv.elimina(template_id):
        raise HTTPException(status_code=404, detail="Template non trovato")
    return {"ok": True}
