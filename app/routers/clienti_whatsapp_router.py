# @version: v1.3 (2026-11-24) — scrivere dalla pagina: POST /chat/{numero}/invia (sub clienti/whatsapp_scrivere)
# v1.2 (2026-11-24) — pagina «💬 WhatsApp»: chat, gestita, ricerca; permessi dalla matrice Moduli (clienti/whatsapp)
# v1.1 (2026-11-23) — ingresso YCloud + impostazioni chat «chiuse dal cliente»
# v1.0 (2026-11-02) — check WhatsApp in sola lettura
# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Router WhatsApp del numero del locale (coexistence; dal 23/11/2026 via YCloud): lettura, e dal
24/11/2026 risposte scritte a mano dalla pagina «💬 WhatsApp».

Manifesto (per module.json a R8):
  modulo: clienti · tabelle: clienti_wa_messaggi, clienti_wa_contatti, clienti_wa_eventi,
  clienti_wa_gestite, clienti_wa_invii
  (+ chiavi wa_* in clienti_impostazioni) · service: app/services/clienti_whatsapp_service.py
  endpoint:
    GET  /clienti/whatsapp/webhook   PUBBLICO (Meta): verifica con WA_VERIFY_TOKEN
    POST /clienti/whatsapp/webhook   PUBBLICO (Meta): firma X-Hub-Signature-256 con WA_APP_SECRET
    POST /clienti/whatsapp/ycloud    PUBBLICO (YCloud): firma YCloud-Signature con YCLOUD_WEBHOOK_SECRET
    GET  /clienti/whatsapp/stato              admin
    POST /clienti/whatsapp/collega            admin (Embedded Signup: codice → iscrizione + sync)
    GET  /clienti/whatsapp/conversazioni      Clienti › WhatsApp nella matrice Moduli (admin + capo sala)
    GET  /clienti/whatsapp/cerca              idem
    GET  /clienti/whatsapp/chat/{numero}      idem — una chat intera per la pagina «💬 WhatsApp»
    POST /clienti/whatsapp/chat/{numero}/gestita  idem — «✓ Gestita» / tolta
    POST /clienti/whatsapp/chat/{numero}/invia    Clienti › «WhatsApp · scrivere» nella matrice Moduli —
                                              testo al cliente via YCloud, solo entro 24 ore dal suo
                                              ultimo messaggio (regola di WhatsApp)
    PUT  /clienti/whatsapp/conservazione      admin
    PUT  /clienti/whatsapp/chiusura           admin (parole e lunghezza delle chat «chiuse dal cliente»)
  Scrive ai clienti SOLO /invia: un testo scritto da una persona. Niente invii automatici.
  Va montato PRIMA di clienti_router (che ha rotte /clienti/{id}).
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field
from typing import List

from app.services import clienti_whatsapp_service as wa
from app.services.permessi import ha_sotto_modulo, richiede_sotto_modulo, solo_admin

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


@public_router.post("/ycloud")
async def webhook_ycloud(request: Request):
    """Eventi di YCloud (provider del numero in coexistence). Risposta subito, 204."""
    if not wa.ycloud_configurato():
        # YCloud ritenta (10 s, 30 s, 5 min, 30 min, 1 h…): basta mettere il segreto nel .env
        raise HTTPException(503, "webhook YCloud non configurato")
    corpo = await request.body()
    if not wa.verifica_firma_ycloud(corpo, request.headers.get("YCloud-Signature")):
        logger.warning("Webhook YCloud: firma non valida da %s", request.client.host if request.client else "?")
        raise HTTPException(401, "firma non valida")
    try:
        import json
        payload = json.loads(corpo.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "JSON non valido")
    if not isinstance(payload, dict):
        raise HTTPException(400, "evento non valido")
    await run_in_threadpool(wa.elabora_evento_ycloud, payload)
    return Response(status_code=204)


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


class ChiusuraIn(BaseModel):
    parole: List[str] = Field(..., min_length=1, max_length=100)
    max_caratteri: int = Field(..., ge=5, le=200)


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


@router.put("/conservazione")
def conservazione(body: ConservazioneIn):
    return {"giorni": wa.imposta_conservazione(body.giorni)}


@router.put("/chiusura")
def chiusura(body: ChiusuraIn):
    try:
        return wa.imposta_chiusura(body.parole, body.max_caratteri)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Pagina «💬 WhatsApp» (Gestione Clienti) ──────────────────
# Chi la apre lo decide la matrice Moduli (Impostazioni Sistema › Moduli, clienti/whatsapp):
# dal 24/11/2026 admin + capo sala. Configurazione e collegamento restano nel router admin.
_PAGINA = richiede_sotto_modulo("clienti", "whatsapp", cosa="WhatsApp del locale")
pagina_router = APIRouter(
    prefix="/clienti/whatsapp",
    tags=["Clienti · WhatsApp"],
    dependencies=[Depends(_PAGINA)],
)


_SCRIVERE = richiede_sotto_modulo("clienti", "whatsapp_scrivere", cosa="scrivere su WhatsApp dal gestionale")


class GestitaIn(BaseModel):
    gestita: bool = True


class InviaIn(BaseModel):
    testo: str = Field(..., min_length=1, max_length=wa.TESTO_MAX)


@pagina_router.get("/conversazioni")
def conversazioni(giorni: int = Query(7, ge=1, le=730), solo_da_rispondere: bool = False,
                  q: Optional[str] = Query(None, max_length=200), limite: int = Query(100, ge=1, le=500)):
    return wa.conversazioni(giorni=giorni, solo_da_rispondere=solo_da_rispondere, q=q, limite=limite)


@pagina_router.get("/cerca")
def cerca(chi: Optional[str] = None, testo: Optional[str] = None, giorni: int = Query(180, ge=1, le=730)):
    try:
        return wa.cerca(chi=chi, testo=testo, giorni=giorni)
    except ValueError as e:
        raise HTTPException(400, str(e))


@pagina_router.get("/chat/{numero}")
def chat(numero: str, giorni: int = Query(180, ge=1, le=730), user: dict = Depends(_PAGINA)):
    try:
        voce = wa.chat(numero, giorni=giorni)
        # la casella per scrivere: chiave YCloud nel .env + «WhatsApp · scrivere» nella matrice
        voce["scrivere"] = {"configurato": wa.invio_configurato(),
                            "permesso": ha_sotto_modulo(user, "clienti", "whatsapp_scrivere")}
        return voce
    except ValueError as e:
        raise HTTPException(400, str(e))
    except LookupError as e:
        raise HTTPException(404, str(e))


@pagina_router.post("/chat/{numero}/gestita")
def gestita(numero: str, body: GestitaIn, user: dict = Depends(_PAGINA)):
    try:
        return wa.imposta_gestita(numero, body.gestita, chi=(user or {}).get("username"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@pagina_router.post("/chat/{numero}/invia")
def invia(numero: str, body: InviaIn, user: dict = Depends(_SCRIVERE)):
    try:
        return wa.invia_testo(numero, body.testo, chi=(user or {}).get("username"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except wa.FinestraChiusa as e:
        raise HTTPException(409, str(e))
    except wa.InvioNonConfigurato as e:
        raise HTTPException(503, str(e))
    except wa.InvioFallito as e:
        raise HTTPException(502, str(e))
