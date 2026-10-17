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


# ── Recensioni TheFork (mig 197) ─────────────────────────────
# Lettura: admin e sala. Risposta e scaricamento: admin.
from app.models.clienti_db import get_clienti_conn  # noqa: E402
from app.services import thefork_recensioni_service as recensioni  # noqa: E402
from app.services.permessi import richiede_ruoli  # noqa: E402

recensioni_router = APIRouter(
    prefix="/prenotazioni/recensioni",
    tags=["Prenotazioni · Recensioni TheFork"],
    dependencies=[Depends(richiede_ruoli("admin", "sala", cosa="le recensioni"))],
)


@recensioni_router.get("/")
def lista_recensioni(
    filtro: str = Query("tutte"),  # tutte | da_rispondere | non_lette | basse
    q: Optional[str] = Query(None),
    cliente_id: Optional[int] = Query(None),
    limite: int = Query(50, ge=1, le=200),
    pagina: int = Query(1, ge=1),
):
    conn = get_clienti_conn()
    try:
        out = recensioni.elenco(conn, filtro, q, cliente_id, limite, pagina)
        out["riepilogo"] = recensioni.riepilogo(conn)
        return out
    finally:
        conn.close()


@recensioni_router.post("/{review_uuid}/letta")
def segna_letta(review_uuid: str, letta: bool = Query(True)):
    conn = get_clienti_conn()
    try:
        conn.execute("UPDATE thefork_recensioni SET letta = ? WHERE review_uuid = ?", (1 if letta else 0, review_uuid))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@recensioni_router.post("/letta-tutte")
def segna_tutte_lette():
    conn = get_clienti_conn()
    try:
        n = conn.execute("UPDATE thefork_recensioni SET letta = 1 WHERE letta = 0").rowcount
        conn.commit()
        return {"lette": n}
    finally:
        conn.close()


class RispostaReq(BaseModel):
    testo: str
    lingua: Optional[str] = None


@recensioni_router.put("/{review_uuid}/risposta")
def rispondi_recensione(review_uuid: str, req: RispostaReq,
                        user: dict = Depends(richiede_ruoli("admin", cosa="la risposta alle recensioni"))):
    try:
        return recensioni.rispondi(review_uuid, req.testo, req.lingua, user.get("username"))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except tf.TheForkNonConfigurato as e:
        raise HTTPException(409, str(e))
    except tf.TheForkErroreAPI as e:
        raise HTTPException(502, f"TheFork: {e}")


class ScaricaRecensioniReq(BaseModel):
    dal: date
    al: date


@recensioni_router.post("/sincronizza",
                        dependencies=[Depends(solo_admin(cosa="lo scaricamento delle recensioni"))])
def scarica_recensioni(req: ScaricaRecensioniReq):
    if req.al < req.dal:
        raise HTTPException(400, "«al» prima di «dal»")
    if (req.al - req.dal) > timedelta(days=800):
        raise HTTPException(400, "periodo massimo due anni")
    try:
        return recensioni.sincronizza(req.dal.isoformat(), req.al.isoformat())
    except tf.TheForkNonConfigurato as e:
        raise HTTPException(409, str(e))
    except tf.TheForkErroreAPI as e:
        raise HTTPException(502, f"TheFork: {e}")
