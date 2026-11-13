# @version: v1.1 — posta in arrivo in sola lettura: /email/in, /email/lettura (2026-11-13)
# v1.0 — Config canale email dal gestionale (sessione 2026-08-03)
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

POSTA IN ARRIVO (v1.1, 2026-11-13) — email_in_service
-----------------------------------------------------
  GET  /email/in                 elenco (giorni, dal, stato, preventivo_id, abbinamento, q)
  GET  /email/in/{id}            una mail: testo intero (ripulito), allegati, preventivo
  POST /email/in/{id}/stato      {"stato": "gestita" | "nuova"}
  GET  /email/lettura/           impostazioni della lettura IMAP + salute del job
  PUT  /email/lettura/           impostazioni (nessun segreto: le credenziali sono quelle SMTP)
  POST /email/lettura/giro       un giro adesso
Solo admin (M.G): la casella contiene anche mail che non sono dei preventivi. Le
risposte ai preventivi si vedono anche da /preventivi/{id}/risposte coi ruoli del
modulo. Il contenuto delle mail è dato di terzi: si mostra come testo, mai come HTML.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from app.services import email_in_service, email_service
from app.services.auth_service import get_current_user, is_admin
from app.services.permessi import richiede_ruoli

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


# ─────────────────────────────────────────────
# POSTA IN ARRIVO (sola lettura della casella) — 2026-11-13
# ─────────────────────────────────────────────

_ADMIN_POSTA = richiede_ruoli("admin", cosa="la posta in arrivo del gestionale")


class StatoMailIn(BaseModel):
    stato: str            # gestita | nuova


class LetturaConfigIn(BaseModel):
    attiva: Optional[bool] = None
    imap_host: Optional[str] = None
    imap_port: Optional[str] = None
    minuti: Optional[int] = None
    giorni_primo_import: Optional[int] = None
    max_mb: Optional[int] = None
    max_caratteri: Optional[int] = None
    max_per_giro: Optional[int] = None


@router.get("/in")
def elenco_in_ep(
    giorni: Optional[int] = Query(None, ge=1, le=3650, description="Mail con data negli ultimi N giorni"),
    dal: Optional[str] = Query(None, description="AAAA-MM-GG oppure AAAA-MM-GG HH:MM"),
    stato: Optional[str] = Query(None, pattern="^(nuova|gestita)$"),
    preventivo_id: Optional[int] = Query(None, ge=1),
    abbinamento: Optional[str] = Query(None, pattern="^(in_reply_to|numero|mittente|nessuno)$"),
    q: Optional[str] = Query(None, max_length=200),
    anche_nuove: bool = Query(False, description="In più tutte le mail ancora «nuova»"),
    limite: int = Query(100, ge=1, le=500),
    user: Dict[str, Any] = Depends(_ADMIN_POSTA),
):
    """Mail arrivate nella casella del gestionale, dalla più recente, col preventivo
    abbinato (numero, cliente, evento, scadenza della conferma) e un estratto."""
    try:
        return email_in_service.elenco(giorni=giorni, stato=stato, preventivo_id=preventivo_id, q=q,
                                       dal=dal, abbinamento=abbinamento, anche_nuove=anche_nuove,
                                       limite=limite)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/in/{email_id}")
def leggi_in_ep(email_id: int, user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    m = email_in_service.leggi(email_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mail non trovata")
    return m


@router.post("/in/{email_id}/stato")
def stato_in_ep(email_id: int, payload: StatoMailIn, user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    try:
        m = email_in_service.imposta_stato(email_id, payload.stato, user["username"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not m:
        raise HTTPException(status_code=404, detail="Mail non trovata")
    return m


@router.get("/lettura/")
def lettura_stato_ep(user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    return email_in_service.stato()


@router.put("/lettura/")
def lettura_config_ep(payload: LetturaConfigIn, user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    try:
        return email_in_service.salva_config(payload.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/lettura/giro")
def lettura_giro_ep(user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    """Un giro di lettura adesso (lo stesso che gira da solo ogni N minuti)."""
    return email_in_service.esegui_giro()
