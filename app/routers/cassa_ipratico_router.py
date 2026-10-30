# -*- coding: utf-8 -*-
# @version: v1.0 — scarico conti da iPratico Cloud (2026-10-18)
"""
Modulo: cassa — conti chiusi letti da iPratico Cloud. [core]
Doc: docs/analisi_ipratico_cloud.md, docs/modulo_vendite.md.

Manifesto (core/moduli/cassa/module.json):
    router: cassa_ipratico_router · prefix: /cassa/ipratico
    tabelle: cassa_conti, cassa_conti_righe, cassa_import_log (cassa_conti.sqlite3)
    dipendenze platform: auth, permessi · nessuna dipendenza da altri moduli

Endpoint (tutti solo admin/superadmin: incassi e configurazione della cassa):
    GET  /cassa/ipratico/stato/            configurazione, conti salvati, ultimi scarichi, periodo in corso
    POST /cassa/ipratico/prova/            login + lettura sale/tavoli (non salva niente)
    POST /cassa/ipratico/scarica/          {dal, al}: scarico in background, un giorno alla volta
    GET  /cassa/ipratico/conti/?data=      conti di un giorno con le righe (controllo)
    GET  /cassa/ipratico/tavoli/           nomi dei tavoli della cassa → tavolo TRGB (+ finestra)
    PUT  /cassa/ipratico/tavoli/           alias di un tavolo; PUT /finestra/ minuti di tolleranza
    GET  /cassa/ipratico/da-sistemare/     giorni/turni con conti ancora da abbinare

Endpoint del servizio (admin, sommelier, sala — chi fa la Chiusura turno; vedono
anche gli importi, decisione di Marco 2026-10-18):
    POST /cassa/ipratico/servizio/{data}/{turno}/prepara/   scarica il giorno + abbina in automatico
    GET  /cassa/ipratico/servizio/{data}/{turno}/           conti del turno con prenotazione/cliente
    POST /cassa/ipratico/conti/{id}/abbina/                 scelta di una persona

Logica: app/services/ipratico_cloud_service.py (scarico) e
app/services/abbinamento_conti_service.py (platform: ponte cassa ↔ prenotazioni/clienti).
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.models.cassa_conti_db import init_cassa_conti_db
from app.services import abbinamento_conti_service as abb
from app.services import ipratico_cloud_service as svc
from app.services.permessi import richiede_ruoli

init_cassa_conti_db()

router = APIRouter(prefix="/cassa/ipratico", tags=["cassa", "ipratico"])

_admin = richiede_ruoli("admin", cosa="conti iPratico")
# Chi fa la Chiusura turno (stessi ruoli di chiusure_turno.check_allowed_role)
_servizio = richiede_ruoli("admin", "sommelier", "capo_sala", "sala", cosa="i conti del servizio")


class Periodo(BaseModel):
    dal: date
    al: date


@router.get("/stato/")
def stato(user=Depends(_admin)):
    return svc.stato()


@router.post("/prova/")
def prova(user=Depends(_admin)):
    try:
        return svc.prova_accesso()
    except svc.IpraticoNonConfigurato as e:
        raise HTTPException(status_code=400, detail=str(e))
    except svc.IpraticoErrore as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/scarica/")
def scarica(periodo: Periodo, user=Depends(_admin)):
    try:
        return svc.avvia_scarico_periodo(periodo.dal, periodo.al, user.get("username") or "admin")
    except svc.IpraticoNonConfigurato as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/conti/")
def conti(data: date = Query(..., description="AAAA-MM-GG"), user=Depends(_admin)):
    return {"data": data.isoformat(), "conti": svc.conti_del_giorno(data.isoformat())}


# ── Abbinamento conti ↔ prenotazioni (Chiusura turno) ─────────────────────

class Scelta(BaseModel):
    tipo: str
    prenotazione_id: Optional[int] = None
    cliente_id: Optional[int] = None
    nome: Optional[str] = None
    cognome: Optional[str] = None
    telefono: Optional[str] = None


class Alias(BaseModel):
    nome_cassa: str
    nome_trgb: Optional[str] = None
    togli: bool = False


class Finestra(BaseModel):
    minuti: int


def _turno_valido(turno: str) -> str:
    if turno not in ("pranzo", "cena"):
        raise HTTPException(status_code=400, detail="turno: pranzo o cena")
    return turno


@router.post("/servizio/{data}/{turno}/prepara/")
def prepara_servizio(data: date, turno: str, user=Depends(_servizio)):
    """Scarica i conti del giorno da iPratico e li abbina. Se iPratico non risponde, abbina quello che c'è."""
    _turno_valido(turno)
    avviso = None
    if svc.configurato():
        esito = svc.scarica_giorno(data, user.get("username") or "chiusura turno")
        if esito["esito"] != "ok":
            avviso = f"iPratico non ha risposto: {esito.get('errore')}"
        else:
            return {**abb.vista_servizio(data.isoformat(), turno), "avviso": None}  # già abbinato dallo scarico
    else:
        avviso = "iPratico Cloud non è configurato: si vedono solo i conti già scaricati"
    abb.abbina(data.isoformat(), turno)
    return {**abb.vista_servizio(data.isoformat(), turno), "avviso": avviso}


@router.get("/servizio/{data}/{turno}/")
def vista_servizio(data: date, turno: str, user=Depends(_servizio)):
    _turno_valido(turno)
    return abb.vista_servizio(data.isoformat(), turno)


@router.post("/conti/{conto_id}/abbina/")
def abbina_conto(conto_id: int, scelta: Scelta, user=Depends(_servizio)):
    try:
        return abb.decidi(conto_id, scelta.model_dump(), user.get("username") or "?")
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/da-sistemare/")
def da_sistemare(user=Depends(_servizio)):
    return {"turni": abb.da_sistemare()}


@router.get("/tavoli/")
def tavoli(user=Depends(_admin)):
    return {"tavoli": abb.tavoli_cassa(), "finestra_minuti": abb.finestra_minuti()}


@router.put("/tavoli/")
def imposta_tavolo(a: Alias, user=Depends(_admin)):
    if not a.nome_cassa.strip():
        raise HTTPException(status_code=400, detail="nome del tavolo in cassa mancante")
    abb.imposta_alias(a.nome_cassa, a.nome_trgb, a.togli)
    return {"tavoli": abb.tavoli_cassa()}


@router.put("/finestra/")
def imposta_finestra(f: Finestra, user=Depends(_admin)):
    return {"finestra_minuti": abb.imposta_finestra(f.minuti)}
