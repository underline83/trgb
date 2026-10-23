# @version: v1.0 — visite del sito, endpoint pubblico (2026-10-23, mig 210)
# -*- coding: utf-8 -*-
"""
Visite del sito — endpoint PUBBLICO (senza login) — Modulo: sito — [core]

  POST /public/sito/evento     un evento dal sito (sendBeacon, corpo text/plain JSON)

Manifesto (pre-R8, vedi core/moduli/sito/module.json):
  id: sito · tabelle: sito_eventi, sito_giorni, sito_giorni_chiusi, sito_stato
  DB: sito.sqlite3 · endpoint: /public/sito · FE: /statistiche/sito (linguetta di Statistiche)

Risponde SEMPRE 204 senza dettagli, anche quando scarta (bot, troppi invii, dominio
non ammesso, corpo malformato o più lungo di 2 KB). IP e User-Agent restano in
memoria: limite di invii, filtro bot, hash del giorno. Non si salvano mai.
La lettura sta in Statistiche (GET /statistiche/sito, solo admin) e nel connettore MCP.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from typing import Dict

from fastapi import APIRouter, Request, Response

from app.models.sito_db import init_sito_db
from app.services import sito_visite_service as sito

log = logging.getLogger("trgb.sito")

router = APIRouter(prefix="/public/sito", tags=["Sito · visite (pubblico)"])

init_sito_db()

# ── limite di invii per IP (memoria del processo: un solo worker) ──
_finestre: Dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()
LIMITE_IP = (120, 600)          # eventi per IP ogni 10 minuti
_ultima_pulizia = {"t": 0.0}


def _ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return (xff.split(",")[0].strip() if xff else "") or (request.client.host if request.client else "?")


def _conta(chiave: str) -> bool:
    massimo, secondi = LIMITE_IP
    ora = time.time()
    with _lock:
        if ora - _ultima_pulizia["t"] > 600:          # niente IP vecchi in memoria
            for k in [k for k, q in _finestre.items() if not q or q[-1] < ora - secondi]:
                del _finestre[k]
            _ultima_pulizia["t"] = ora
        q = _finestre[chiave]
        while q and q[0] < ora - secondi:
            q.popleft()
        if len(q) >= massimo:
            return False
        q.append(ora)
        return True


@router.post("/evento", status_code=204)
async def evento(request: Request) -> Response:
    vuota = Response(status_code=204)
    try:
        ua = request.headers.get("user-agent", "")
        if sito.e_bot(ua):
            return vuota
        try:
            if int(request.headers.get("content-length") or 0) > sito.MAX_CORPO:
                return vuota
        except ValueError:
            return vuota
        corpo = await request.body()
        ev = sito.valida(corpo, request.headers.get("origin", ""), request.headers.get("referer", ""))
        if ev is None:
            return vuota
        ip = _ip(request)
        if not _conta(ip):
            return vuota
        sito.registra(ev, ip, ua)
    except Exception:                                   # mai un errore verso il sito
        log.exception("evento sito non registrato")
    return vuota
