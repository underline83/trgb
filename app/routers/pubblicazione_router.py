# @version: v1.0 — Mattone M.J "Pubblicazione web" (2026-08-03)
# -*- coding: utf-8 -*-
"""
Router Pubblicazione web — TRGB Gestionale

Modulo: platform (mattone M.J)
Classificazione: [core]

Endpoint trasversali del mattone: dire se l'FTP è configurato, provare la
connessione, mostrare lo storico. Le pubblicazioni vere e proprie NON stanno
qui: ogni modulo pubblica il suo contenuto dal proprio router (regola 2 — niente
import tra router di moduli diversi), chiamando il servizio platform.

  GET  /pubblicazione/stato/       config FTP (senza password) + ultime pubblicazioni
  POST /pubblicazione/test/        login + listing della cartella, non scrive nulla
  GET  /pubblicazione/storico/     ultime N pubblicazioni (tutte o per chiave)

Chi pubblica cosa:
  POST /pranzo/menu/{settimana}/pubblica/   → menu del pranzo (modulo menu_carta/pranzo)
  POST /vini/carta/pubblica/                → carta vini cliente (modulo vini)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.services import ftp_publish_service as web
from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/pubblicazione",
    tags=["pubblicazione"],
    dependencies=[Depends(get_current_user)],
)

# Chiavi note: servono solo a dare alla UI un riepilogo ordinato.
_CHIAVI = ("menu_pranzo", "carta_vini")


def _check_admin(user: Dict[str, Any]) -> None:
    role = (user or {}).get("role", "")
    if role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Operazione riservata ad admin")


@router.get("/stato/")
def stato_pubblicazione(user=Depends(get_current_user)):
    """Vista completa (host, utente, cartella): solo admin."""
    _check_admin(user)
    return {
        "ftp": web.stato(completo=True),
        "pubblicazioni": [
            {
                "chiave": k,
                "nome_file": web.nome_file_per(k),
                "url": web.url_pubblico(web.nome_file_per(k)),
                "ultima": web.ultima_pubblicazione(k),
            }
            for k in _CHIAVI
        ],
    }


@router.post("/test/")
def test_ftp(user=Depends(get_current_user)):
    """
    Prova la connessione senza pubblicare niente. Ritorna 200 anche se il login
    fallisce: l'esito sta nel campo `ok`, così la UI mostra il messaggio del
    server invece di un errore generico.
    """
    _check_admin(user)
    return web.test_connessione()


@router.get("/storico/")
def storico_pubblicazioni(
    chiave: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=200),
    user=Depends(get_current_user),
):
    """Solo admin: il campo `errore` contiene le risposte grezze del server FTP."""
    _check_admin(user)
    return {"righe": web.storico(chiave=chiave, limit=limit)}
