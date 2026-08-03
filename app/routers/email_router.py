# @version: v1.0 — Config canale email dal gestionale (sessione 2026-08-03)
# -*- coding: utf-8 -*-
"""
Router Email — TRGB Gestionale

Modulo: platform (mattone M.D)
Classificazione: [core]
Endpoint prefix: /email
Config: `email_settings.json` nella cartella dati del locale (+ .env come fallback)
Frontend: Impostazioni Sistema → tab Email

PERCHÉ QUI E NON NEL .env
-------------------------
Marco (2026-08-03): «non possiamo configurarli dal gestionale in modo che in
altre installazioni possano gestirli dalla configurazione?». Sì — ed è anche il
modo giusto per il prodotto vendibile: ogni locale ha la sua cartella dati,
quindi la sua casella, senza che nessuno debba aprire un terminale sul server.

Quello che NON si fa è scrivere nel `.env` dall'app: le variabili d'ambiente si
leggono all'avvio, quindi servirebbe un restart a ogni salvataggio (e il restart
è la finestra in cui i DB SQLite si sono già corrotti), e daremmo al processo web
il permesso di riscrivere il file che contiene tutti gli altri segreti.

La password non esce MAI da questa API: la UI mostra solo "impostata / non
impostata" e può sostituirla.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from app.services import email_service
from app.services.auth_service import get_current_user, is_admin

router = APIRouter(prefix="/email", tags=["Email"])


def _solo_admin(current_user: Dict[str, Any]):
    if not is_admin((current_user or {}).get("role")):
        raise HTTPException(status_code=403, detail="Solo admin può toccare il canale email")


class EmailConfigIn(BaseModel):
    host: Optional[str] = None
    port: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None      # assente/vuota = lascia quella già salvata
    from_addr: Optional[str] = None
    from_name: Optional[str] = None
    test_to: Optional[str] = None       # destinatario dell'email di prova


@router.get("/config/")
def get_config_ep(current_user: Dict[str, Any] = Depends(get_current_user)):
    _solo_admin(current_user)
    return email_service.stato()


@router.put("/config/")
def put_config_ep(
    payload: EmailConfigIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    _solo_admin(current_user)
    try:
        return {"ok": True, "stato": email_service.salva_config(**payload.dict())}
    except ValueError as e:
        # Caso tipico: manca TRGB_SECRET_KEY. Il messaggio contiene già una
        # chiave pronta da incollare nel .env, quindi va mostrato per intero.
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/test/")
def test_ep(
    payload: Dict[str, str] = Body(default={}),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Email di prova. Senza 'to' usa il destinatario di prova salvato."""
    _solo_admin(current_user)
    return email_service.invia_test((payload or {}).get("to"))
