# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Rubrica dei clienti sul telefono — server CardDAV in sola lettura (2026-11-16, mig 238).

Il telefono (iPhone: account CardDAV; Android: DAVx5) si abbona alla rubrica e la
tiene aggiornata da solo: clienti nuovi, uniti, stelle cambiate. Contatti e regole in
clienti_rubrica_service. Niente scrittura dal telefono.

PUBBLICO con Basic auth (clienti_rubrica_accessi, un accesso per telefono; il JWT il
telefono non sa mandarlo):
  /.well-known/carddav          → 301 /rubrica/
  /rubrica/                     principal + home        OPTIONS, PROPFIND, GET
  /rubrica/clienti/             la rubrica              OPTIONS, PROPFIND, REPORT, GET
  /rubrica/clienti/{nome}.vcf   un contatto             OPTIONS, GET, HEAD, PROPFIND
  PUT / DELETE / PROPPATCH / MKCOL → 403 (sola lettura)
ADMIN (JWT, M.G solo_admin):
  GET  /clienti/rubrica/stato
  POST /clienti/rubrica/accessi               {nome} → utente + password (una volta sola)
  POST /clienti/rubrica/accessi/{id}/revoca
"""

from __future__ import annotations

import base64
import logging
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote, urlparse
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse, Response
from pydantic import BaseModel

from app.services import clienti_rubrica_service as rub
from app.services.auth_service import get_current_user
from app.services.permessi import solo_admin

logger = logging.getLogger("trgb.clienti.rubrica")

D, CARD, CS = "DAV:", "urn:ietf:params:xml:ns:carddav", "http://calendarserver.org/ns/"
_PREFISSI = {D: "d", CARD: "card", CS: "cs"}
_DAV = {"DAV": "1, 3, addressbook", "Allow": "OPTIONS, GET, HEAD, PROPFIND, REPORT"}
_SCRITTURA = ("PUT", "DELETE", "PROPPATCH", "MKCOL", "MOVE", "COPY", "POST", "LOCK", "UNLOCK")
_METODI = ["OPTIONS", "GET", "HEAD", "PROPFIND", "REPORT", *_SCRITTURA]
HOME, RUBRICA = "/rubrica/", "/rubrica/clienti/"
_MAX_CORPO = 1_000_000

public_router = APIRouter(tags=["Clienti · Rubrica telefono (CardDAV)"])


# ─────────────────────────────────────────────────────────── aiuti ───
def _non_autorizzato() -> Response:
    return PlainTextResponse("Accesso alla rubrica richiesto", status_code=401,
                             headers={"WWW-Authenticate": 'Basic realm="Rubrica TRGB", charset="UTF-8"'})


def _autorizza(request: Request) -> Optional[Response]:
    h = request.headers.get("authorization", "")
    if h[:6].lower() == "basic ":
        try:
            utente, _, password = base64.b64decode(h[6:].strip()).decode("utf-8").partition(":")
        except (ValueError, UnicodeDecodeError):
            return _non_autorizzato()
        if rub.verifica(utente, password):
            return None
    return _non_autorizzato()


async def _corpo(request: Request) -> bytes:
    corpo = await request.body()
    if len(corpo) > _MAX_CORPO:
        raise HTTPException(413, "Richiesta troppo grande")
    return corpo


def _xml(corpo: bytes) -> Optional[ET.Element]:
    if not corpo or not corpo.strip():
        return None
    try:
        return ET.fromstring(corpo)
    except ET.ParseError:
        return None


def _chiave(tag: str) -> Tuple[str, str]:
    if tag.startswith("{"):
        ns, nome = tag[1:].split("}", 1)
        return ns, nome
    return "", tag


def _richiesti(radice: Optional[ET.Element]) -> Optional[List[Tuple[str, str]]]:
    """Proprietà chieste; None = tutte (allprop o corpo vuoto)."""
    if radice is None:
        return None
    prop = radice.find(f"{{{D}}}prop")
    if prop is None:
        return None
    return [_chiave(el.tag) for el in prop]


def _el(chiave: Tuple[str, str], dentro: str = "") -> str:
    ns, nome = chiave
    if ns in _PREFISSI:
        tag, attr = f"{_PREFISSI[ns]}:{nome}", ""
    elif ns:
        tag, attr = f"x:{nome}", f' xmlns:x="{escape(ns)}"'
    else:
        tag, attr = nome, ""
    return f"<{tag}{attr}>{dentro}</{tag}>" if dentro else f"<{tag}{attr}/>"


def _risposta(href: str, props: Dict[Tuple[str, str], str], richiesti, esclusi_da_tutte=()) -> str:
    if richiesti is None:
        trovate = {k: v for k, v in props.items() if k not in esclusi_da_tutte}
        mancanti: List[Tuple[str, str]] = []
    else:
        trovate = {k: props[k] for k in richiesti if k in props}
        mancanti = [k for k in richiesti if k not in props]
    out = f"<d:response><d:href>{escape(href)}</d:href>"
    if trovate:
        out += ("<d:propstat><d:prop>" + "".join(_el(k, v) for k, v in trovate.items())
                + "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>")
    if mancanti:
        out += ("<d:propstat><d:prop>" + "".join(_el(k) for k in mancanti)
                + "</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>")
    return out + "</d:response>"


def _multistatus(risposte: List[str]) -> Response:
    corpo = ('<?xml version="1.0" encoding="utf-8"?>\n'
             f'<d:multistatus xmlns:d="{D}" xmlns:card="{CARD}" xmlns:cs="{CS}">'
             + "".join(risposte) + "</d:multistatus>")
    return Response(corpo, status_code=207, media_type="application/xml; charset=utf-8", headers=_DAV)


def _sola_lettura() -> Response:
    return PlainTextResponse("La rubrica di TRGB è in sola lettura: i clienti si cambiano in TRGB",
                             status_code=403, headers=_DAV)


def _opzioni() -> Response:
    return Response(status_code=200, headers=_DAV)


_HREF = lambda h: f"<d:href>{h}</d:href>"  # noqa: E731
_SOLO_LETTURA = "<d:privilege><d:read/></d:privilege>"


def _props_home() -> Dict[Tuple[str, str], str]:
    return {
        (D, "resourcetype"): "<d:collection/><d:principal/>",
        (D, "displayname"): "Rubrica TRGB",
        (D, "current-user-principal"): _HREF(HOME),
        (D, "principal-URL"): _HREF(HOME),
        (D, "principal-collection-set"): _HREF(HOME),
        (D, "owner"): _HREF(HOME),
        (CARD, "addressbook-home-set"): _HREF(HOME),
        (D, "current-user-privilege-set"): _SOLO_LETTURA,
    }


def _props_rubrica(dati: Dict[str, Any]) -> Dict[Tuple[str, str], str]:
    return {
        (D, "resourcetype"): "<d:collection/><card:addressbook/>",
        (D, "displayname"): "Clienti",
        (CS, "getctag"): dati["ctag"],
        (D, "current-user-principal"): _HREF(HOME),
        (D, "owner"): _HREF(HOME),
        (D, "current-user-privilege-set"): _SOLO_LETTURA,
        (D, "supported-report-set"): (
            "<d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report>"
            "<d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report>"),
        (CARD, "supported-address-data"): '<card:address-data-type content-type="text/vcard" version="3.0"/>',
        (CARD, "addressbook-description"): "Clienti di TRGB con telefono e stelle (sola lettura)",
        (CARD, "max-resource-size"): "102400",
    }


def _props_carta(etag: str, vcard: str) -> Dict[Tuple[str, str], str]:
    return {
        (D, "getetag"): escape(etag),
        (D, "getcontenttype"): "text/vcard; charset=utf-8",
        (D, "resourcetype"): "",
        (CARD, "address-data"): escape(vcard),
    }


def _nome_da_href(href: str) -> str:
    return unquote(urlparse((href or "").strip()).path).rstrip("/").rsplit("/", 1)[-1]


# ─────────────────────────────────────────────────────────── rotte ───
@public_router.api_route("/.well-known/carddav", methods=["GET", "HEAD", "PROPFIND", "OPTIONS"])
async def well_known(request: Request):
    return RedirectResponse(HOME, status_code=301)


@public_router.api_route("/rubrica", methods=_METODI)
@public_router.api_route("/rubrica/", methods=_METODI)
async def home(request: Request):
    if request.method == "OPTIONS":
        return _opzioni()
    negato = _autorizza(request)
    if negato:
        return negato
    if request.method in _SCRITTURA:
        return _sola_lettura()
    if request.method in ("GET", "HEAD"):
        return PlainTextResponse("Rubrica TRGB: si aggiunge al telefono come account CardDAV.")
    if request.method != "PROPFIND":
        return Response(status_code=405, headers=_DAV)
    richiesti = _richiesti(_xml(await _corpo(request)))
    risposte = [_risposta(HOME, _props_home(), richiesti)]
    if request.headers.get("depth", "1") != "0":
        risposte.append(_risposta(RUBRICA, _props_rubrica(rub.rubrica()), richiesti))
    return _multistatus(risposte)


@public_router.api_route("/rubrica/clienti", methods=_METODI)
@public_router.api_route("/rubrica/clienti/", methods=_METODI)
async def rubrica_clienti(request: Request):
    if request.method == "OPTIONS":
        return _opzioni()
    negato = _autorizza(request)
    if negato:
        return negato
    if request.method in _SCRITTURA:
        return _sola_lettura()
    dati = rub.rubrica()
    if request.method in ("GET", "HEAD"):
        return PlainTextResponse(f"Rubrica TRGB: {len(dati['carte'])} clienti.")

    radice = _xml(await _corpo(request))
    if request.method == "PROPFIND":
        richiesti = _richiesti(radice)
        risposte = [_risposta(RUBRICA, _props_rubrica(dati), richiesti)]
        if request.headers.get("depth", "1") != "0":
            for nome, (etag, vcard) in dati["carte"].items():
                risposte.append(_risposta(f"{RUBRICA}{nome}", _props_carta(etag, vcard), richiesti,
                                          esclusi_da_tutte={(CARD, "address-data")}))
        return _multistatus(risposte)

    if request.method == "REPORT":
        tipo = _chiave(radice.tag) if radice is not None else ("", "")
        richiesti = _richiesti(radice)
        if tipo == (CARD, "addressbook-multiget"):
            risposte = []
            for h in radice.iter(f"{{{D}}}href"):
                nome = _nome_da_href(h.text)
                if nome in dati["carte"]:
                    etag, vcard = dati["carte"][nome]
                    risposte.append(_risposta(f"{RUBRICA}{nome}", _props_carta(etag, vcard), richiesti))
                else:
                    risposte.append(f"<d:response><d:href>{escape(h.text or '')}</d:href>"
                                    "<d:status>HTTP/1.1 404 Not Found</d:status></d:response>")
            return _multistatus(risposte)
        if tipo == (CARD, "addressbook-query"):
            return _multistatus([_risposta(f"{RUBRICA}{nome}", _props_carta(etag, vcard), richiesti)
                                 for nome, (etag, vcard) in dati["carte"].items()])
        # sync-collection e altri: non offerti → il telefono rifà il giro con PROPFIND
        return Response('<?xml version="1.0" encoding="utf-8"?>\n'
                        f'<d:error xmlns:d="{D}"><d:valid-sync-token/></d:error>',
                        status_code=403, media_type="application/xml; charset=utf-8", headers=_DAV)
    return Response(status_code=405, headers=_DAV)


@public_router.api_route("/rubrica/clienti/{nome}", methods=_METODI)
async def contatto(request: Request, nome: str):
    if request.method == "OPTIONS":
        return _opzioni()
    negato = _autorizza(request)
    if negato:
        return negato
    if request.method in _SCRITTURA:
        return _sola_lettura()
    dati = rub.rubrica()
    if nome not in dati["carte"]:
        return PlainTextResponse("Contatto non in rubrica", status_code=404)
    etag, vcard = dati["carte"][nome]
    if request.method in ("GET", "HEAD"):
        return Response(vcard if request.method == "GET" else b"", media_type="text/vcard; charset=utf-8",
                        headers={"ETag": etag})
    if request.method == "PROPFIND":
        richiesti = _richiesti(_xml(await _corpo(request)))
        return _multistatus([_risposta(f"{RUBRICA}{nome}", _props_carta(etag, vcard), richiesti,
                                       esclusi_da_tutte={(CARD, "address-data")})])
    return Response(status_code=405, headers=_DAV)


# ─────────────────────────────────────────────────────────── admin ───
router = APIRouter(
    prefix="/clienti/rubrica",
    tags=["Clienti · Rubrica telefono"],
    dependencies=[Depends(solo_admin(cosa="la rubrica del telefono"))],
)


class NuovoAccesso(BaseModel):
    nome: str


@router.get("/stato")
def stato_rubrica():
    return JSONResponse(rub.stato())


@router.post("/accessi")
def nuovo_accesso(req: NuovoAccesso, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Un accesso per un telefono. La password si vede solo in questa risposta."""
    return JSONResponse(rub.crea_accesso(req.nome, current_user.get("username") or ""))


@router.post("/accessi/{accesso_id}/revoca")
def revoca_accesso(accesso_id: int):
    if not rub.revoca_accesso(accesso_id):
        raise HTTPException(404, "Accesso non trovato")
    return JSONResponse({"ok": True})
