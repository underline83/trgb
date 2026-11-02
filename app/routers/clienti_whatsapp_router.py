# @version: v1.0 (2026-11-02) — check WhatsApp in sola lettura
# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Router WhatsApp in SOLA LETTURA del numero del locale (coexistence Meta).

Manifesto (per module.json a R8):
  modulo: clienti · tabelle: clienti_wa_messaggi, clienti_wa_contatti, clienti_wa_eventi
  (+ chiavi wa_* in clienti_impostazioni) · service: app/services/clienti_whatsapp_service.py
  endpoint:
    GET  /clienti/whatsapp/webhook   PUBBLICO (Meta): verifica con WA_VERIFY_TOKEN
    POST /clienti/whatsapp/webhook   PUBBLICO (Meta): firma X-Hub-Signature-256 con WA_APP_SECRET
    GET  /clienti/whatsapp/stato              admin
    POST /clienti/whatsapp/collega            admin (Embedded Signup: codice → iscrizione + sync)
    GET  /clienti/whatsapp/conversazioni      admin
    GET  /clienti/whatsapp/cerca              admin
    PUT  /clienti/whatsapp/conservazione      admin
  Nessun endpoint manda messaggi ai clienti.
  Va montato PRIMA di clienti_router (che ha rotte /clienti/{id}).
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from app.services import clienti_whatsapp_service as wa
from app.services.permessi import solo_admin

logger = logging.getLogger("trgb.whatsapp")

# ── Webhook pubblico (Meta) ──────────────────────────────────
public_router = APIRouter(prefix="/clienti/whatsapp", tags=["Clienti · WhatsApp (webhook)"])


@public_router.get("/webhook")
def webhook_verifica(
    mode: Optional[str] = Query(None, alias="hub.mode"),
    token: Optional[str] = Query(None, alias="hub.verify_token"),
    challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    if not wa.verifica_sottoscrizione(mode, token):
        raise HTTPException(403, "verifica non valida")
    return PlainTextResponse(challenge or "")


@public_router.post("/webhook")
async def webhook_ricevi(request: Request):
    if not wa.webhook_configurato():
        raise HTTPException(503, "webhook WhatsApp non configurato")
    corpo = await request.body()
    if not wa.verifica_firma(corpo, request.headers.get("X-Hub-Signature-256")):
        logger.warning("Webhook WhatsApp: firma non valida da %s", request.client.host if request.client else "?")
        raise HTTPException(401, "firma non valida")
    try:
        import json
        payload = json.loads(corpo.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "JSON non valido")
    await run_in_threadpool(wa.elabora_webhook, payload)
    return JSONResponse({})


# ── Pagina Impostazioni › WhatsApp (admin) ───────────────────
router = APIRouter(
    prefix="/clienti/whatsapp",
    tags=["Clienti · WhatsApp"],
    dependencies=[Depends(solo_admin(cosa="WhatsApp del locale"))],
)


class CollegaIn(BaseModel):
    code: str = Field(..., min_length=4)
    waba_id: Optional[str] = None
    phone_number_id: Optional[str] = None


class ConservazioneIn(BaseModel):
    giorni: int = Field(..., ge=7, le=730)


@router.get("/stato")
def stato():
    return wa.stato()


@router.post("/collega")
def collega(body: CollegaIn):
    try:
        return wa.collega(body.code, body.waba_id, body.phone_number_id)
    except wa.WhatsAppNonConfigurato as e:
        raise HTTPException(503, str(e))
    except wa.WhatsAppErroreMeta as e:
        raise HTTPException(502, str(e))


@router.get("/conversazioni")
def conversazioni(giorni: int = Query(7, ge=1, le=730), solo_da_rispondere: bool = False):
    return wa.conversazioni(giorni=giorni, solo_da_rispondere=solo_da_rispondere)


@router.get("/cerca")
def cerca(chi: Optional[str] = None, testo: Optional[str] = None, giorni: int = Query(180, ge=1, le=730)):
    try:
        return wa.cerca(chi=chi, testo=testo, giorni=giorni)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/conservazione")
def conservazione(body: ConservazioneIn):
    return {"giorni": wa.imposta_conservazione(body.giorni)}
