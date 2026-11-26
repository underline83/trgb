#!/usr/bin/env python3
# Modulo: cucina
# @version: v1.0 — Produzioni e codice lotto (2026-11-26, mig 248)
# -*- coding: utf-8 -*-
"""
Router Produzioni — modulo cucina.

Doc canonico: docs/modulo_produzioni_lotto.md
module.json (pre-R8): id=cucina · prefix `/cucina/produzioni` ·
tabelle cucina_produzioni, cucina_produzioni_persone ·
platform: auth, permessi · opzionali: ricette (recipes, solo il nome) ·
frontend: /cucina/produzioni

Permessi (Marco, 2026-11-26): «admin, chef, sous chef e commis leggono e scrivono».
Sta nella matrice Moduli come ricette/produzioni, cosi' si cambia da Impostazioni › Moduli.

Qui solo validazione, permessi e forma della risposta: le regole stanno in
`app/services/cucina_produzioni_service.py`, il calcolo del codice in
`app/services/cucina_lotto_codice.py`.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection
from app.services import cucina_produzioni_service as svc
from app.services.permessi import richiede_sotto_modulo

_permesso = richiede_sotto_modulo(svc.MODULO, svc.SUB, cosa="produzioni e codici lotto")

router = APIRouter(
    prefix="/cucina/produzioni",
    tags=["cucina-produzioni"],
    dependencies=[Depends(_permesso)],
)


class ProduzioneIn(BaseModel):
    nome: str
    persona: str
    data: Optional[str] = None
    data_scadenza: Optional[str] = None
    etichette: int = Field(1, ge=1)
    recipe_id: Optional[int] = None
    note: Optional[str] = None


class ProduzioneCorreggi(BaseModel):
    nome: Optional[str] = None
    data_scadenza: Optional[str] = None
    togli_scadenza: bool = False
    etichette: Optional[int] = Field(None, ge=1)
    note: Optional[str] = None


def _con(fn):
    """Apre foodcost.db, gira `fn(conn)`, fa commit; un ProduzioneErrore diventa un 400 leggibile."""
    conn = get_foodcost_connection()
    try:
        out = fn(conn)
        conn.commit()
        return out
    except svc.ProduzioneErrore as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.get("/")
def elenco(giorni: int = Query(7, ge=1, le=366), user: Dict[str, Any] = Depends(_permesso)):
    """Le produzioni degli ultimi `giorni` giorni (oggi compreso), dalla piu' recente."""
    oggi = date.today()
    return _con(lambda c: {
        "oggi": oggi.isoformat(),
        "dal": (oggi - timedelta(days=giorni - 1)).isoformat(),
        "io": user.get("username"),
        "produzioni": svc.elenco(c, oggi - timedelta(days=giorni - 1), oggi),
    })


@router.post("/")
def registra(dati: ProduzioneIn, user: Dict[str, Any] = Depends(_permesso)):
    """Registra una produzione: TRGB assegna il numero del giorno e il codice lotto."""
    return _con(lambda c: svc.registra(c, utente=user.get("username") or "", **dati.dict()))


@router.get("/persone/")
def persone(user: Dict[str, Any] = Depends(_permesso)):
    """Chi puo' comparire in «Chi l'ha prodotto» e chi sono io (per partire su di me)."""
    return {"io": user.get("username"), "persone": svc.persone_possibili()}


@router.get("/prossimo-numero/")
def prossimo_numero(data: Optional[str] = None):
    """Il numero che avra' la prossima produzione di quel giorno (solo per mostrarlo)."""
    return _con(lambda c: {"numero": svc.prossimo_numero(c, svc._data(data, "Data") or date.today())})


@router.get("/suggerimenti/")
def suggerimenti(q: str = ""):
    return _con(lambda c: svc.suggerimenti(c, q))


@router.get("/leggi/")
def leggi(codice: str):
    """Dal codice sull'etichetta a cosa, quando, chi e numero produzione."""
    return _con(lambda c: svc.leggi_codice(c, codice))


@router.patch("/{prod_id}")
def correggi(prod_id: int, dati: ProduzioneCorreggi, user: Dict[str, Any] = Depends(_permesso)):
    """Corregge nome, scadenza, etichette, nota. Data, persona e numero non si toccano: stanno nel codice."""
    return _con(lambda c: svc.correggi(c, prod_id, utente=user.get("username") or "", **dati.dict()))


@router.post("/{prod_id}/annulla")
def annulla(prod_id: int, user: Dict[str, Any] = Depends(_permesso)):
    """Segna la produzione annullata. Codice e numero restano nel registro."""
    return _con(lambda c: svc.annulla(c, prod_id, user.get("username") or ""))
