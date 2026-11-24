# -*- coding: utf-8 -*-
# @version: v1.0 — tavoli, conto, righe, invio, via, storno; tutto in prova (2026-11-24)
"""
Modulo: comande — comande prese in sala da TRGB. Doc: docs/modulo_comande.md.

Manifesto (core/moduli/comande/module.json):
    id: comande · nome: Comanda · versione: 1.0
    dipendenze platform: auth, permessi, ui_primitives, catalogo_vendita, tavoli_sala
    dipendenze opzionali: menu_carta, ricette, vini, clienti, prenotazioni (solo lettura,
                          via i servizi platform catalogo_vendita e tavoli_sala_service)
    router: comande_router · tabelle: comande_conti, comande_righe, comande_invii,
            comande_reparti, comande_gruppi_reparto, comande_config
    DB: comande.sqlite3 · route FE: /comande · menu key: comande

Finché non c'è la Cassa ogni conto è di prova: in servizio resta iPratico
(decisione di Marco del 24/11/2026).

Endpoint (admin, capo_sala, sala, sommelier — decisione di Marco del 24/11/2026;
le impostazioni solo admin):
    GET    /comande/catalogo/                 gruppi e articoli vendibili (catalogo_vendita)
    GET    /comande/tavoli/                   tavoli per sala col conto aperto
    GET    /comande/conti/                    conti aperti
    POST   /comande/conti/                    apre un tavolo {tavolo_id, coperti, nota}
    GET    /comande/conti/{id}                conto con righe e invii
    PATCH  /comande/conti/{id}                coperti, nota, cambio tavolo
    POST   /comande/conti/{id}/righe          aggiunge righe (prezzo dal catalogo)
    POST   /comande/conti/{id}/invia          manda le righe nuove ai reparti
    POST   /comande/conti/{id}/via            «via la Nª» {uscita}
    POST   /comande/conti/{id}/chiudi         libera il tavolo {annulla}
    PATCH  /comande/righe/{id}                quantità, uscita, nota, varianti (solo non inviate)
    DELETE /comande/righe/{id}                toglie una riga non inviata
    POST   /comande/righe/{id}/storna         storna una riga inviata {motivo}
    GET    /comande/invii/                    ultimi invii ai reparti (?reparto=cucina)
    GET    /comande/impostazioni/ · PUT       uscite, reparti, gruppo → reparto (PUT solo admin)

Logica tutta in app/services/comande_service.py: qui solo HTTP ⇄ service.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.comande_db import init_comande_db
from app.services import catalogo_vendita
from app.services import comande_service as svc
from app.services.permessi import richiede_ruoli, solo_admin

RUOLI_COMANDE = ("admin", "capo_sala", "sala", "sommelier")

router = APIRouter(
    prefix="/comande",
    tags=["comande"],
    dependencies=[Depends(richiede_ruoli(*RUOLI_COMANDE, cosa="le comande"))],
)

init_comande_db()


def _errori(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except svc.ComandaNonTrovata as e:
        raise HTTPException(status_code=404, detail=str(e))
    except svc.ComandaErrore as e:
        raise HTTPException(status_code=400, detail=str(e))


def _utente(user) -> Optional[str]:
    return (user or {}).get("username")


class ApriConto(BaseModel):
    tavolo_id: int
    coperti: int = 0
    nota: Optional[str] = None


class AggiornaConto(BaseModel):
    coperti: Optional[int] = None
    nota: Optional[str] = None
    tavolo_id: Optional[int] = None


class Riga(BaseModel):
    codice: Optional[str] = None
    quantita: int = 1
    uscita: Optional[int] = None
    nota: Optional[str] = None
    varianti: Optional[List[str]] = None
    prezzo: Optional[float] = None       # solo per articoli a prezzo libero e righe fuori carta
    nome: Optional[str] = None           # riga fuori carta
    famiglia: Optional[str] = None       # riga fuori carta: food / beverage / servizio


class NuoveRighe(BaseModel):
    righe: List[Riga]


class ModificaRiga(BaseModel):
    quantita: Optional[int] = None
    uscita: Optional[int] = None
    nota: Optional[str] = None
    varianti: Optional[List[str]] = None


class Via(BaseModel):
    uscita: int


class Chiudi(BaseModel):
    annulla: bool = False


class Storno(BaseModel):
    motivo: str


# ── catalogo e tavoli ──────────────────────────────────────────────

@router.get("/catalogo/")
def get_catalogo():
    return catalogo_vendita.catalogo()


@router.get("/tavoli/")
def get_tavoli():
    return svc.tavoli()


# ── conti ──────────────────────────────────────────────────────────

@router.get("/conti/")
def get_conti():
    return svc.conti_aperti()


@router.post("/conti/")
def post_conto(body: ApriConto, user=Depends(richiede_ruoli(*RUOLI_COMANDE))):
    return _errori(svc.apri_conto, body.tavolo_id, body.coperti, body.nota, _utente(user))


@router.get("/conti/{conto_id}")
def get_conto(conto_id: int):
    return _errori(svc.conto, conto_id)


@router.patch("/conti/{conto_id}")
def patch_conto(conto_id: int, body: AggiornaConto, user=Depends(richiede_ruoli(*RUOLI_COMANDE))):
    return _errori(svc.aggiorna_conto, conto_id, body.model_dump(exclude_unset=True), _utente(user))


@router.post("/conti/{conto_id}/righe")
def post_righe(conto_id: int, body: NuoveRighe, user=Depends(richiede_ruoli(*RUOLI_COMANDE))):
    righe = [r.model_dump(exclude_none=True) for r in body.righe]
    return _errori(svc.aggiungi_righe, conto_id, righe, _utente(user))


@router.post("/conti/{conto_id}/invia")
def post_invia(conto_id: int, user=Depends(richiede_ruoli(*RUOLI_COMANDE))):
    return _errori(svc.invia, conto_id, _utente(user))


@router.post("/conti/{conto_id}/via")
def post_via(conto_id: int, body: Via, user=Depends(richiede_ruoli(*RUOLI_COMANDE))):
    return _errori(svc.via, conto_id, body.uscita, _utente(user))


@router.post("/conti/{conto_id}/chiudi")
def post_chiudi(conto_id: int, body: Chiudi, user=Depends(richiede_ruoli(*RUOLI_COMANDE))):
    return _errori(svc.chiudi_conto, conto_id, _utente(user), body.annulla)


# ── righe ──────────────────────────────────────────────────────────

@router.patch("/righe/{riga_id}")
def patch_riga(riga_id: int, body: ModificaRiga):
    return _errori(svc.modifica_riga, riga_id, body.model_dump(exclude_unset=True))


@router.delete("/righe/{riga_id}")
def delete_riga(riga_id: int):
    return _errori(svc.elimina_riga, riga_id)


@router.post("/righe/{riga_id}/storna")
def post_storno(riga_id: int, body: Storno, user=Depends(richiede_ruoli(*RUOLI_COMANDE))):
    return _errori(svc.storna_riga, riga_id, body.motivo, _utente(user))


# ── invii e impostazioni ───────────────────────────────────────────

@router.get("/invii/")
def get_invii(reparto: Optional[str] = None, limite: int = 50):
    return svc.invii(reparto, limite)


@router.get("/impostazioni/")
def get_impostazioni():
    return svc.impostazioni()


@router.put("/impostazioni/", dependencies=[Depends(solo_admin(cosa="le impostazioni delle comande"))])
def put_impostazioni(body: Dict[str, Any]):
    return _errori(svc.salva_impostazioni, body)
