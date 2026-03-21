# @version: v3.0-only-magazzino
# -*- coding: utf-8 -*-
"""
Router Vini — HTML + PDF + DOCX + Movimenti

v3.0: eliminato vecchio DB vini.sqlite3
      - rimosso endpoint /vini/upload (import Excel vecchio)
      - movimenti ora su DB magazzino (vini_magazzino.sqlite3)
      - tutte le funzioni leggono solo da vini_magazzino

Changelog v2.07:
 - FIX: aggiunto alias endpoint /vini/carta/html → stessa preview di /vini/carta

Changelog v2.06:
 - CLEAN: rimosso uso di tabella 'vini_raw'

Changelog v2.05:
 - ADD: endpoint /vini/{vino_id}/movimenti (GET/POST)

Changelog v2.04:
 - ADD: endpoint /vini/carta/pdf-staff (PDF staff)
"""

from __future__ import annotations

from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pydantic import BaseModel, Field
from weasyprint import HTML, CSS

from app.services.carta_vini_service import (
    build_carta_body_html,
    build_carta_body_html_htmlsafe,
    build_carta_toc_html,
    build_carta_docx,
    build_calici_section_html,
    build_calici_section_htmlsafe,
    resolve_regione,
)
from app.services.auth_service import get_current_user
from app.models.vini_magazzino_db import (
    get_vino_by_id,
    list_movimenti_vino,
    registra_movimento,
)
from app.repositories.vini_repository import load_vini_ordinati, load_vini_calici


router = APIRouter(prefix="/vini", tags=["Vini"])

print(">>>>> LOADING VINI_ROUTER v3.0   PATH:", __file__)

# PATH DI BASE
BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
CSS_HTML = STATIC_DIR / "css" / "carta_html.css"
CSS_PDF = STATIC_DIR / "css" / "carta_pdf.css"
LOGO_PATH = STATIC_DIR / "img" / "logo_tregobbi.png"


# ------------------------------------------------------------
# HTML PREVIEW CARTA
# ------------------------------------------------------------
@router.get("/carta", response_class=HTMLResponse)
def genera_carta_vini_html():
    rows = list(load_vini_ordinati())
    calici_rows = list(load_vini_calici())
    calici_html = build_calici_section_htmlsafe(calici_rows)
    body = build_carta_body_html_htmlsafe(rows)

    html = f"""
    <html>
    <head>
        <meta charset='utf-8'>
        <link rel='stylesheet' href='/static/css/carta_html.css'>
    </head>
    <body>
        <h1 class='title'>OSTERIA TRE GOBBI — CARTA DEI VINI</h1>
        {calici_html}
        {body}
    </body>
    </html>
    """

    return HTMLResponse(html)


# ------------------------------------------------------------
# HTML PREVIEW CARTA (alias compatibilità: /vini/carta/html)
# ------------------------------------------------------------
@router.get("/carta/html", response_class=HTMLResponse)
def genera_carta_vini_html_alias():
    # Alias richiesto dal frontend (prima chiamava /vini/carta/html)
    return genera_carta_vini_html()


# ------------------------------------------------------------
# PDF CLIENTE
# ------------------------------------------------------------
@router.get("/carta/pdf")
def genera_carta_vini_pdf():
    data_oggi = datetime.now().strftime("%d/%m/%Y")
    rows = list(load_vini_ordinati())
    calici_rows = list(load_vini_calici())

    frontespizio = f"""
    <div class="front-page">
        <img src="file://{LOGO_PATH}" class="front-logo">
        <div class="front-title">CARTA VINI</div>
        <div class="front-subtitle">Aggiornata al {data_oggi}</div>
    </div>
    """

    toc_html = build_carta_toc_html(rows)
    calici_html = build_calici_section_html(calici_rows)
    body_html = build_carta_body_html(rows)
    carta = f"<div class='carta-body'>{calici_html}{body_html}</div>"

    html = f"""
    <html>
    <head>
        <meta charset='utf-8'>
        <link rel='stylesheet' href='/static/css/carta_pdf.css'>
    </head>
    <body>
        {frontespizio}
        {toc_html}
        {carta}
    </body>
    </html>
    """

    out = STATIC_DIR / "carta_vini.pdf"

    HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        str(out),
        stylesheets=[CSS(filename=str(CSS_PDF))],
    )

    return FileResponse(out, filename="carta_vini.pdf")


# ------------------------------------------------------------
# PDF STAFF
# ------------------------------------------------------------
@router.get("/carta/pdf-staff")
def genera_carta_vini_pdf_staff():
    """
    Versione STAFF.
    Per ora identica al PDF cliente, ma con label 'VERSIONE STAFF' nel frontespizio.
    """
    data_oggi = datetime.now().strftime("%d/%m/%Y")
    rows = list(load_vini_ordinati())
    calici_rows = list(load_vini_calici())

    frontespizio = f"""
    <div class="front-page">
        <img src="file://{LOGO_PATH}" class="front-logo">
        <div class="front-title">CARTA VINI — STAFF</div>
        <div class="front-subtitle">VERSIONE INTERNA</div>
        <div class="front-date">Aggiornata al {data_oggi}</div>
    </div>
    """

    toc_html = build_carta_toc_html(rows)
    calici_html = build_calici_section_html(calici_rows)
    body_html = build_carta_body_html(rows)
    carta = f"<div class='carta-body'>{calici_html}{body_html}</div>"

    html = f"""
    <html>
    <head>
        <meta charset='utf-8'>
        <link rel='stylesheet' href='/static/css/carta_pdf.css'>
    </head>
    <body>
        {frontespizio}
        {toc_html}
        {carta}
    </body>
    </html>
    """

    out = STATIC_DIR / "carta_vini_staff.pdf"

    HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        str(out),
        stylesheets=[CSS(filename=str(CSS_PDF))],
    )

    return FileResponse(out, filename="carta_vini_staff.pdf")


# ------------------------------------------------------------
# DOCX (usa builder condiviso)
# ------------------------------------------------------------
@router.get("/carta/docx")
def genera_carta_vini_docx():
    rows = list(load_vini_ordinati())
    doc = build_carta_docx(rows, logo_path=LOGO_PATH)

    out = STATIC_DIR / "carta_vini.docx"
    doc.save(str(out))

    return FileResponse(out, filename="carta_vini.docx")


# ============================================================
# MOVIMENTI CANTINA (ora su DB magazzino)
# ============================================================
class MovimentoCreate(BaseModel):
    tipo: str = Field(..., description="CARICO / SCARICO / VENDITA / RETTIFICA")
    qta: int = Field(..., gt=0, description="Quantità positiva")
    locazione: Optional[str] = Field(None, description="Locazione: frigo, loc1, loc2, loc3")
    note: str | None = Field(None, description="Nota operativa (evento, servizio, ecc.)")
    origine: str | None = Field("GESTIONALE", description="Origine movimento")
    data_mov: str | None = Field(
        None,
        description="Data movimento ISO8601; se None usa datetime.now()",
    )


@router.get("/{vino_id}/movimenti", response_class=JSONResponse)
def lista_movimenti_vino(
    vino_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Restituisce la lista dei movimenti registrati per un dato vino.
    Richiede utente loggato (JWT valido).
    """
    vino = get_vino_by_id(vino_id)
    if not vino:
        raise HTTPException(status_code=404, detail="Vino non trovato")

    rows = list_movimenti_vino(vino_id)
    movimenti = [dict(r) for r in rows]

    return JSONResponse(content={"vino_id": vino_id, "movimenti": movimenti})


@router.post("/{vino_id}/movimenti", response_class=JSONResponse)
def crea_movimento_vino(
    vino_id: int,
    payload: MovimentoCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Registra un movimento di cantina per un vino:
    - CARICO    → QTA aumenta
    - SCARICO   → QTA diminuisce
    - VENDITA   → QTA diminuisce
    - RETTIFICA → qta = nuovo valore assoluto

    Opera sul DB magazzino (vini_magazzino.sqlite3).
    """
    vino = get_vino_by_id(vino_id)
    if not vino:
        raise HTTPException(status_code=404, detail="Vino non trovato")

    tipo = payload.tipo.strip().upper()

    # Ricavo un identificativo utente leggibile
    if isinstance(current_user, dict):
        utente = (
            current_user.get("username")
            or current_user.get("email")
            or (str(current_user.get("id")) if current_user.get("id") is not None else None)
            or "unknown"
        )
    else:
        utente = "unknown"

    try:
        registra_movimento(
            vino_id=vino_id,
            tipo=tipo,
            qta=payload.qta,
            utente=utente,
            locazione=payload.locazione,
            note=payload.note,
            origine=payload.origine or "GESTIONALE",
            data_mov=payload.data_mov,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return JSONResponse(
        content={
            "status": "ok",
            "vino_id": vino_id,
            "tipo": tipo,
            "qta": payload.qta,
            "eseguito_da": utente,
        }
    )
