# Modulo: prenotazioni (integrazione TheFork B2B API) — [core]
# -*- coding: utf-8 -*-
"""
Router integrazione TheFork — webhook pubblico + strumenti admin.

Manifesto (per module.json a R8):
  modulo: prenotazioni · tabelle: prenotazioni_thefork_eventi (+ scrive
  clienti_prenotazioni e clienti via app/services/clienti_thefork_service.py)
  endpoint:
    POST /prenotazioni/thefork/webhook?token=…   PUBBLICO (TheFork). Niente JWT:
         l'autenticazione è il token nell'URL (THEFORK_WEBHOOK_TOKEN). TheFork
         non firma i messaggi. Risponde {} con 200 subito, elabora dopo.
    GET  /prenotazioni/thefork/stato              admin
    GET  /prenotazioni/thefork/eventi             admin
    POST /prenotazioni/thefork/eventi/{id}/riprova admin
    POST /prenotazioni/thefork/elabora            admin  (rielabora in sospeso/errore)
    POST /prenotazioni/thefork/prova-connessione  admin
    POST /prenotazioni/thefork/sincronizza        admin  (recupero di un periodo)
  Va montato PRIMA di prenotazioni_router (che ha rotte /{pren_id}).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import thefork_service as tf
from app.services.permessi import solo_admin

logger = logging.getLogger("trgb.thefork")

# ── Webhook pubblico ─────────────────────────────────────────
public_router = APIRouter(prefix="/prenotazioni/thefork", tags=["Prenotazioni · TheFork (webhook)"])


@public_router.post("/webhook")
async def webhook_thefork(request: Request, background: BackgroundTasks, token: Optional[str] = Query(None)):
    if not tf.token_webhook_configurato():
        # Finché il .env non ha il token il webhook è spento (TheFork riproverà)
        raise HTTPException(503, "webhook TheFork non configurato")
    if not tf.verifica_token_webhook(token):
        logger.warning("Webhook TheFork: token errato da %s", request.client.host if request.client else "?")
        raise HTTPException(401, "token non valido")

    try:
        corpo = await request.json()
    except Exception:
        raise HTTPException(400, "JSON non valido")

    eventi = corpo if isinstance(corpo, list) else [corpo]
    for ev in eventi:
        if not isinstance(ev, dict):
            continue
        evento_id = tf.registra_evento(ev)
        background.add_task(tf.elabora_evento, evento_id)

    # TheFork vuole 200 + oggetto JSON vuoto, il prima possibile
    return JSONResponse({})


# ── Strumenti admin (Impostazioni Prenotazioni → TheFork) ────
router = APIRouter(
    prefix="/prenotazioni/thefork",
    tags=["Prenotazioni · TheFork"],
    dependencies=[Depends(solo_admin(cosa="integrazione TheFork"))],
)


@router.get("/stato")
def stato():
    return tf.stato_integrazione()


@router.get("/eventi")
def eventi(stato: Optional[str] = Query(None), limite: int = Query(100, ge=1, le=500)):
    return {"eventi": tf.elenco_eventi(stato, limite)}


@router.post("/eventi/{evento_id}/riprova")
def riprova(evento_id: int):
    return tf.elabora_evento(evento_id)


@router.post("/elabora")
def elabora():
    if not tf.credenziali_presenti():
        raise HTTPException(409, "credenziali B2B API non ancora configurate nel .env")
    return tf.elabora_in_sospeso()


@router.post("/prova-connessione")
def prova_connessione():
    try:
        return tf.prova_connessione()
    except tf.TheForkNonConfigurato as e:
        raise HTTPException(409, str(e))
    except tf.TheForkErroreAPI as e:
        raise HTTPException(502, f"TheFork: {e}")


class SincronizzaReq(BaseModel):
    dal: date
    al: date
    filtro: str = "updatedDate"  # updatedDate | mealDate


@router.post("/sincronizza")
def sincronizza(req: SincronizzaReq, background: BackgroundTasks):
    if req.filtro not in ("updatedDate", "mealDate"):
        raise HTTPException(400, "filtro: updatedDate o mealDate")
    if req.al < req.dal:
        raise HTTPException(400, "«al» prima di «dal»")
    if (req.al - req.dal) > timedelta(days=366):
        raise HTTPException(400, "periodo massimo un anno")
    try:
        res = tf.accoda_sincronizzazione(req.dal.isoformat(), req.al.isoformat(), req.filtro)
    except tf.TheForkNonConfigurato as e:
        raise HTTPException(409, str(e))
    except tf.TheForkErroreAPI as e:
        raise HTTPException(502, f"TheFork: {e}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    if res["accodate"]:
        background.add_task(tf.elabora_in_sospeso)
    return res
