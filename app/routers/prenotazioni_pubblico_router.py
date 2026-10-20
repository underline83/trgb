# @version: v1.0 — prenotazioni dal sito, endpoint pubblici (2026-10-20, mig 205)
# -*- coding: utf-8 -*-
"""
Prenotazioni dal sito — endpoint PUBBLICI (senza login) — Modulo: prenotazioni — [core]

  GET  /public/prenota/info                     regole e testi per la pagina
  GET  /public/prenota/calendario?mese&pax      giorni liberi/pieni/chiusi del mese
  GET  /public/prenota/orari?data&pax           orari prenotabili del giorno
  POST /public/prenota                          prenota (o richiesta per i gruppi)
  GET  /public/prenota/annulla/{token}          dettaglio per la pagina di annullamento
  POST /public/prenota/annulla/{token}          annulla

Finché `widget_attivo` è 0 rispondono solo a un admin loggato (anteprima dalla
stessa pagina, che manda il suo token). Difese: campo esca (honeypot), tempo
minimo di compilazione, limite di invii per indirizzo IP e per telefono.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.models.clienti_db import get_clienti_conn
from app.services import prenotazioni_sito_service as sito

log = logging.getLogger("trgb.prenotazioni.sito")

router = APIRouter(prefix="/public/prenota", tags=["Prenotazioni · sito (pubblico)"])

# ── Limiti anti-abuso (memoria del processo: un solo worker) ──
_finestre: Dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()
LIMITI = {"ip_invii": (5, 600), "tel_invii": (3, 86400), "ip_letture": (240, 600)}


def _ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return (xff.split(",")[0].strip() if xff else "") or (request.client.host if request.client else "?")


def _conta(chiave: str, limite: str) -> bool:
    massimo, secondi = LIMITI[limite]
    ora = time.time()
    with _lock:
        q = _finestre[f"{limite}:{chiave}"]
        while q and q[0] < ora - secondi:
            q.popleft()
        if len(q) >= massimo:
            return False
        q.append(ora)
        return True


def _admin(request: Request) -> bool:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return False
    try:
        from app.services.auth_service import get_current_user
        u = get_current_user(auth.split(" ", 1)[1])
        return u.get("role") in ("admin", "superadmin")
    except Exception:
        return False


def _accesso(request: Request, lettura: bool = True) -> Dict[str, Any]:
    if lettura and not _conta(_ip(request), "ip_letture"):
        raise HTTPException(429, "troppe richieste")
    conn = get_clienti_conn()
    try:
        cfg = sito.config(conn)
    finally:
        conn.close()
    rg = sito.regole(cfg)
    anteprima = not rg["attivo"]
    if anteprima and not _admin(request):
        raise HTTPException(503, "prenotazioni online non attive")
    return {"cfg": cfg, "rg": rg, "anteprima": anteprima}


@router.get("/info")
def info(request: Request):
    try:
        a = _accesso(request)
    except HTTPException as e:
        if e.status_code == 503:
            return {"attivo": False, "locale": sito._nome_locale()}
        raise
    rg = a["rg"]
    return {
        "attivo": True, "anteprima": a["anteprima"], "locale": sito._nome_locale(),
        "max_automatica": rg["max_automatica"], "max_richiesta": rg["max_richiesta"],
        "giorni_max": rg["giorni_max"], "telefono": rg["telefono"], "nota": rg["nota"],
        "messaggio_pieno": rg["messaggio_pieno"],
    }


@router.get("/calendario")
def calendario(request: Request, mese: str = Query(..., pattern=r"^\d{4}-\d{2}$"), pax: int = Query(2, ge=1, le=100)):
    _accesso(request)
    conn = get_clienti_conn()
    try:
        return sito.calendario(conn, mese, pax)
    finally:
        conn.close()


@router.get("/orari")
def orari(request: Request, data: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"), pax: int = Query(2, ge=1, le=100)):
    _accesso(request)
    conn = get_clienti_conn()
    try:
        return sito.orari(conn, data, pax)
    finally:
        conn.close()


class PrenotaReq(BaseModel):
    data: str
    ora: str
    pax: int
    nome: str
    cognome: str
    telefono: str
    email: str
    note: Optional[str] = None
    allergie: Optional[str] = None
    occasione: Optional[str] = None
    lingua: str = "it"
    privacy: bool = False
    sito_web: Optional[str] = None      # esca: un umano non la vede né la compila
    aperto_ms: Optional[int] = None     # millisecondi passati sul modulo


@router.post("")
def prenota(req: PrenotaReq, request: Request):
    _accesso(request, lettura=False)
    ip = _ip(request)
    if req.sito_web or (req.aperto_ms is not None and req.aperto_ms < 3000):
        log.info("prenotazione sito scartata (esca/tempo) da %s", ip)
        raise HTTPException(400, {"campo": "generico"})
    if not req.privacy:
        raise HTTPException(400, {"campo": "privacy"})
    if not _conta(ip, "ip_invii") or not _conta("".join(c for c in req.telefono if c.isdigit())[-9:], "tel_invii"):
        raise HTTPException(429, {"campo": "troppe"})
    try:
        return sito.crea(req.model_dump() if hasattr(req, "model_dump") else req.dict())
    except ValueError as e:
        raise HTTPException(400, {"campo": str(e)})
    except sito.NonDisponibile as e:
        raise HTTPException(409, {"campo": e.codice})


@router.get("/annulla/{token}")
def annulla_info(token: str, request: Request):
    if not _conta(_ip(request), "ip_letture"):
        raise HTTPException(429, "troppe richieste")
    d = sito.dettaglio_token(token)
    if not d:
        raise HTTPException(404, "prenotazione non trovata")
    return d


@router.post("/annulla/{token}")
def annulla(token: str, request: Request):
    if not _conta(_ip(request), "ip_invii"):
        raise HTTPException(429, "troppe richieste")
    try:
        return sito.annulla(token)
    except LookupError:
        raise HTTPException(404, "prenotazione non trovata")
    except sito.NonDisponibile:
        raise HTTPException(409, "non annullabile")
