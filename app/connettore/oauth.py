# @version: v1.0 (2026-10-08) — nascita del connettore MCP (mattone M.K)
# -*- coding: utf-8 -*-
"""
oauth.py — chi può usare il connettore MCP di TRGB, e come ci entra. Modulo: platform (M.K).

Adattato dal connettore del brain (~/brain/app/oauth.py, in produzione dal 2026-10-08).
claude.ai parla OAuth 2.1: si registra da solo (Dynamic Client Registration), manda
l'utente su una pagina di autorizzazione, riceve un codice e lo scambia coi token, col
PKCE. Le rotte standard (/.well-known/…, /register, /authorize, /token, /revoke) e i
controlli (PKCE S256, scadenze, redirect_uri uguale) li fa l'SDK `mcp`; qui c'è solo
quello che è nostro:

  · dove stanno client, codici e token: in connettore.sqlite3, codici e token come
    sha256 (sono casuali a 256 bit: lo sha256 basta);
  · la pagina di autorizzazione: utente e PIN di TRGB, controllati da
    `auth_service.authenticate_user` (stesso blocco dopo i tentativi sbagliati del login);
  · chi può autorizzare: solo admin e superadmin (M.G), decisione di Marco 2026-10-08;
  · gli indirizzi di ritorno ammessi: solo claude.ai / claude.com e localhost (Inspector);
  · la durata: accesso un'ora, rinnovo trenta giorni che ruota a ogni uso. Un rinnovo già
    usato che si ripresenta vuol dire che qualcuno l'ha copiato: si chiude la famiglia.

Ogni codice e token porta lo username di chi ha autorizzato. A ogni chiamata si rilegge
l'utente in users.json: se non c'è più o non è più admin, il token non apre niente.
"""
from __future__ import annotations

import asyncio
import html
import json
import secrets
import time
import hashlib
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from pydantic import AnyUrl
from starlette.requests import Request
from starlette.responses import HTMLResponse, RedirectResponse, Response

from mcp.server.auth.provider import (
    AccessToken, AuthorizationCode, AuthorizationParams, AuthorizeError, RefreshToken,
    RegistrationError, TokenError, construct_redirect_uri)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

from app.models.connettore_db import get_connettore_conn
from app.services import auth_service
from app.services.permessi import ha_ruoli

DURATA_ACCESSO = 60 * 60                  # un'ora
DURATA_RINNOVO = 60 * 60 * 24 * 30        # trenta giorni, ricomincia a ogni rinnovo
DURATA_CODICE = 5 * 60                    # il codice dopo il PIN: cinque minuti, una volta
DURATA_RICHIESTA = 10 * 60                # la pagina del PIN aperta: dieci minuti
SCOPE = "trgb"
REGISTRAZIONI_ORA = 20                    # oltre, chi riempie la tabella si ferma

# Chi può autorizzare il connettore. Oggi gli strumenti sono solo pratiche (solo admin).
RUOLI_AUTORIZZATI = ("admin",)            # superadmin implicito (M.G)

RITORNI = ("https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback")
LOCALI = ("localhost", "127.0.0.1", "::1")


def impronta(segreto: str) -> str:
    return hashlib.sha256(segreto.encode()).hexdigest()


def adesso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def ritorno_ammesso(uri: str) -> bool:
    if uri in RITORNI:
        return True
    u = urlparse(uri)
    return u.scheme == "http" and u.hostname in LOCALI


def utente_attivo(username: Optional[str]) -> Optional[dict]:
    """L'utente come lo vede il resto di TRGB, se esiste ancora ed è autorizzato."""
    info = auth_service.USERS.get(username or "")
    if not info:
        return None
    user = {"username": username, "role": info.get("role")}
    return user if ha_ruoli(user, *RUOLI_AUTORIZZATI) else None


class Fornitore:
    """Il provider OAuth che l'SDK chiama. `risorsa` è l'indirizzo pubblico di /mcp,
    `nome_locale` compare sulla pagina di autorizzazione."""

    def __init__(self, risorsa: str, nome_locale: str = "TRGB"):
        self.risorsa = risorsa
        self.nome_locale = nome_locale
        self._richieste: dict[str, dict] = {}   # pagina del PIN aperta → la richiesta

    def con(self):
        return get_connettore_conn()

    # ── i client ──
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        c = self.con()
        try:
            r = c.execute("SELECT dati FROM connettore_oauth_clienti WHERE client_id = ?",
                          (client_id,)).fetchone()
        finally:
            c.close()
        return OAuthClientInformationFull.model_validate_json(r["dati"]) if r else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        for u in client_info.redirect_uris or []:
            if not ritorno_ammesso(str(u)):
                raise RegistrationError("invalid_redirect_uri", f"Indirizzo di ritorno non ammesso: {u}")
        c = self.con()
        try:
            un_ora_fa = datetime.fromtimestamp(time.time() - 3600).astimezone().isoformat(timespec="seconds")
            n = c.execute("SELECT COUNT(*) FROM connettore_oauth_clienti WHERE creato_il >= ?",
                          (un_ora_fa,)).fetchone()[0]
            if n >= REGISTRAZIONI_ORA:
                raise RegistrationError("invalid_client_metadata",
                                        "Troppe registrazioni nell'ultima ora: riprova più tardi.")
            c.execute("INSERT INTO connettore_oauth_clienti (client_id, nome, dati, creato_il) VALUES (?,?,?,?)",
                      (client_info.client_id, client_info.client_name,
                       client_info.model_dump_json(), adesso()))
            c.commit()
        finally:
            c.close()

    # ── l'autorizzazione: la pagina con utente e PIN ──
    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if params.resource and params.resource.rstrip("/") != self.risorsa.rstrip("/"):
            raise AuthorizeError("invalid_target", "Questo server autorizza solo TRGB.")
        ora = time.time()
        for k in [k for k, v in self._richieste.items() if v["scade"] < ora]:
            del self._richieste[k]
        rid = secrets.token_urlsafe(24)
        self._richieste[rid] = {"client": client, "params": params, "scade": ora + DURATA_RICHIESTA}
        return f"/oauth/pin?richiesta={rid}"

    async def pagina_pin(self, r: Request) -> Response:
        """GET: il modulo. POST: utente e PIN, poi il ritorno a Claude col codice."""
        if r.method == "GET":
            rid = r.query_params.get("richiesta", "")
            return self._modulo(rid) if self._richiesta(rid) else self._scaduta()
        dati = parse_qs((await r.body()).decode("utf8", "replace"))
        campo = lambda k: (dati.get(k) or [""])[0]
        rid = campo("richiesta")
        ric = self._richiesta(rid)
        if not ric:
            return self._scaduta()
        params: AuthorizationParams = ric["params"]
        if campo("annulla"):
            self._richieste.pop(rid, None)
            return RedirectResponse(construct_redirect_uri(
                str(params.redirect_uri), error="access_denied", state=params.state), status_code=302)

        username = campo("utente").strip()
        try:
            # bcrypt è lento apposta: fuori dal ciclo degli eventi
            await asyncio.to_thread(auth_service.authenticate_user, username, campo("pin"))
        except HTTPException as e:
            if e.status_code == 429:
                return self._modulo(rid, e.detail, 429, e.headers or {}, username)
            await asyncio.sleep(1)                   # un secondo a tentativo: niente raffiche
            return self._modulo(rid, "Utente o PIN sbagliati.", 401, None, username)
        if not utente_attivo(username):
            return self._modulo(rid, "Il connettore lo può autorizzare solo un amministratore.", 403, None, username)

        self._richieste.pop(rid, None)               # una richiesta vale un codice solo
        codice = secrets.token_urlsafe(32)
        c = self.con()
        try:
            c.execute("""INSERT INTO connettore_oauth_codici
                             (hash, client_id, username, dati, scade, creato_il)
                         VALUES (?,?,?,?,?,?)""",
                      (impronta(codice), ric["client"].client_id, username, json.dumps({
                          "code_challenge": params.code_challenge,
                          "redirect_uri": str(params.redirect_uri),
                          "esplicito": params.redirect_uri_provided_explicitly,
                          "resource": params.resource}), time.time() + DURATA_CODICE, adesso()))
            c.commit()
        finally:
            c.close()
        return RedirectResponse(construct_redirect_uri(
            str(params.redirect_uri), code=codice, state=params.state), status_code=302)

    def _richiesta(self, rid: str) -> dict | None:
        ric = self._richieste.get(rid)
        return ric if ric and ric["scade"] >= time.time() else None

    def _modulo(self, rid: str, errore: str = "", stato: int = 200,
                extra: dict | None = None, utente: str = "") -> Response:
        ric = self._richieste[rid]
        cliente = ric["client"].client_name or "Un client senza nome"
        verso = urlparse(str(ric["params"].redirect_uri)).netloc
        corpo = (MODULO.replace("__LOCALE__", html.escape(self.nome_locale))
                 .replace("__CLIENTE__", html.escape(cliente))
                 .replace("__VERSO__", html.escape(verso))
                 .replace("__RICHIESTA__", html.escape(rid))
                 .replace("__UTENTE__", html.escape(utente))
                 .replace("__ERRORE__", f'<p class="no">{html.escape(errore)}</p>' if errore else ""))
        return HTMLResponse(corpo, status_code=stato, headers={**SENZA_CACHE, **(extra or {})})

    def _scaduta(self) -> Response:
        return HTMLResponse(SCADUTA.replace("__LOCALE__", html.escape(self.nome_locale)),
                            status_code=400, headers=SENZA_CACHE)

    # ── i codici ──
    async def load_authorization_code(self, client, authorization_code: str) -> AuthorizationCode | None:
        c = self.con()
        try:
            r = c.execute("SELECT * FROM connettore_oauth_codici WHERE hash = ?",
                          (impronta(authorization_code),)).fetchone()
        finally:
            c.close()
        if not r or r["client_id"] != client.client_id:
            return None
        if r["usato_il"]:
            # un codice usato che torna: qualcuno l'ha intercettato. Si chiude quello che ha aperto
            self.revoca_famiglia(r["famiglia"], "codice riusato")
            return None
        d = json.loads(r["dati"])
        return AuthorizationCode(code=authorization_code, scopes=[SCOPE], expires_at=r["scade"],
                                 client_id=r["client_id"], code_challenge=d["code_challenge"],
                                 redirect_uri=AnyUrl(d["redirect_uri"]),
                                 redirect_uri_provided_explicitly=d["esplicito"],
                                 resource=d["resource"], subject=r["username"])

    async def exchange_authorization_code(self, client, authorization_code: AuthorizationCode) -> OAuthToken:
        famiglia = secrets.token_hex(8)
        c = self.con()
        try:
            # una volta sola, anche con due richieste insieme: vince chi segna per primo
            n = c.execute("""UPDATE connettore_oauth_codici SET usato_il = ?, famiglia = ?
                             WHERE hash = ? AND usato_il IS NULL""",
                          (adesso(), famiglia, impronta(authorization_code.code))).rowcount
            if n != 1:
                raise TokenError("invalid_grant", "Il codice è già stato usato.")
            tok = self._emetti(c, client.client_id, authorization_code.subject, famiglia)
            c.commit()
            return tok
        finally:
            c.close()

    def _emetti(self, c, client_id: str, username: str, famiglia: str) -> OAuthToken:
        accesso, rinnovo = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        ora, quando = int(time.time()), adesso()
        for segreto, tipo, durata in ((accesso, "accesso", DURATA_ACCESSO),
                                      (rinnovo, "rinnovo", DURATA_RINNOVO)):
            c.execute("""INSERT INTO connettore_oauth_token
                             (hash, tipo, client_id, username, famiglia, scade, creato_il)
                         VALUES (?,?,?,?,?,?,?)""",
                      (impronta(segreto), tipo, client_id, username, famiglia, ora + durata, quando))
        return OAuthToken(access_token=accesso, token_type="Bearer", expires_in=DURATA_ACCESSO,
                          refresh_token=rinnovo, scope=SCOPE)

    # ── i rinnovi ──
    async def load_refresh_token(self, client, refresh_token: str) -> RefreshToken | None:
        c = self.con()
        try:
            r = c.execute("SELECT * FROM connettore_oauth_token WHERE hash = ? AND tipo = 'rinnovo'",
                          (impronta(refresh_token),)).fetchone()
        finally:
            c.close()
        if not r or r["client_id"] != client.client_id:
            return None
        if r["revocato_il"]:
            if r["motivo"] == "ruotato":             # già usato: è una copia, si chiude tutto
                self.revoca_famiglia(r["famiglia"], "rinnovo riusato")
            return None
        if not utente_attivo(r["username"]):
            return None
        return RefreshToken(token=refresh_token, client_id=r["client_id"], scopes=[SCOPE],
                            expires_at=r["scade"], resource=self.risorsa, subject=r["username"])

    async def exchange_refresh_token(self, client, refresh_token: RefreshToken, scopes: list[str]) -> OAuthToken:
        c = self.con()
        try:
            r = c.execute("SELECT famiglia, username FROM connettore_oauth_token WHERE hash = ?",
                          (impronta(refresh_token.token),)).fetchone()
            n = c.execute("""UPDATE connettore_oauth_token SET revocato_il = ?, motivo = 'ruotato', usato_il = ?
                             WHERE hash = ? AND revocato_il IS NULL""",
                          (adesso(), adesso(), impronta(refresh_token.token))).rowcount
            if n != 1:
                raise TokenError("invalid_grant", "Il rinnovo è già stato usato.")
            # l'accesso di prima non serve più: chi rinnova ne riceve uno nuovo
            c.execute("""UPDATE connettore_oauth_token SET revocato_il = ?, motivo = 'ruotato'
                         WHERE famiglia = ? AND tipo = 'accesso' AND revocato_il IS NULL""",
                      (adesso(), r["famiglia"]))
            tok = self._emetti(c, client.client_id, r["username"], r["famiglia"])
            c.commit()
            return tok
        finally:
            c.close()

    # ── gli accessi: a ogni chiamata a /mcp ──
    async def load_access_token(self, token: str) -> AccessToken | None:
        c = self.con()
        try:
            r = c.execute("""SELECT * FROM connettore_oauth_token WHERE hash = ? AND tipo = 'accesso'
                             AND revocato_il IS NULL AND scade > ?""",
                          (impronta(token), int(time.time()))).fetchone()
            if r:
                c.execute("UPDATE connettore_oauth_token SET usato_il = ? WHERE id = ?", (adesso(), r["id"]))
                c.commit()
        finally:
            c.close()
        if not r or not utente_attivo(r["username"]):
            return None
        return AccessToken(token=token, client_id=r["client_id"], scopes=[SCOPE],
                           expires_at=r["scade"], resource=self.risorsa, subject=r["username"])

    # ── revocare ──
    async def revoke_token(self, token) -> None:
        c = self.con()
        try:
            r = c.execute("SELECT famiglia FROM connettore_oauth_token WHERE hash = ?",
                          (impronta(token.token),)).fetchone()
        finally:
            c.close()
        if r:
            self.revoca_famiglia(r["famiglia"], "revocato dal client")

    def revoca_famiglia(self, famiglia: str | None, motivo: str) -> int:
        if not famiglia:
            return 0
        c = self.con()
        try:
            n = c.execute("""UPDATE connettore_oauth_token SET revocato_il = ?, motivo = ?
                             WHERE famiglia = ? AND revocato_il IS NULL""",
                          (adesso(), motivo, famiglia)).rowcount
            c.commit()
            return n
        finally:
            c.close()


# ── le pagine: palette TRGB, pensate per l'iPhone ──────────────────────────
SENZA_CACHE = {"Cache-Control": "no-store", "X-Frame-Options": "DENY",
               "Content-Security-Policy": "frame-ancestors 'none'", "Referrer-Policy": "no-referrer"}

STILE = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TRGB · __LOCALE__</title>
<style>
:root{color-scheme:light;--crema:#F4F1EC;--ink:#111111;--blu:#2E7BE8;--rosso:#E8402B;--linea:#E2DDD4}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--crema);color:var(--ink);
font:16px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
form,div.box{background:#fff;border:1px solid var(--linea);border-radius:16px;padding:28px;width:min(340px,88vw);
box-shadow:0 2px 10px rgba(0,0,0,.06)}
h1{font-weight:800;font-size:28px;margin:0;letter-spacing:-.02em}
h2{font-weight:500;font-size:14px;color:#6b6b6b;margin:0 0 16px}
p{color:#555;font-size:14px;margin:0 0 18px}
b{color:var(--ink)}
label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#444;margin-bottom:4px}
input{box-sizing:border-box;width:100%;font:inherit;font-size:17px;padding:12px;min-height:48px;
background:#fff;color:var(--ink);border:1px solid #cfcac1;border-radius:12px;margin-bottom:14px}
input.pin{letter-spacing:.3em;text-align:center}
button{width:100%;min-height:48px;font:inherit;font-size:16px;font-weight:600;background:var(--blu);
color:#fff;border:0;border-radius:12px;cursor:pointer}
button.via{background:none;color:#6b6b6b;font-weight:400;font-size:14px;margin-top:6px}
.no{color:var(--rosso);font-size:14px;margin:12px 0 0;text-align:center}
.gobbe{display:block;height:14px;margin-bottom:10px}
</style>
"""

GOBBE = """<svg class="gobbe" viewBox="15 28 155 28" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-width="5">
<path d="M 20 50 Q 37 30 55 42" stroke="#E8402B"/><path d="M 75 50 Q 92 30 110 42" stroke="#2EB872"/>
<path d="M 130 50 Q 147 30 165 42" stroke="#2E7BE8"/></g></svg>"""

MODULO = STILE + """<form method="post" action="/oauth/pin">""" + GOBBE + """
  <h1>TRGB</h1><h2>__LOCALE__</h2>
  <p><b>__CLIENTE__</b> chiede di leggere e scrivere nel gestionale a tuo nome. Il codice
  tornerà a <b>__VERSO__</b>. Se sei tu, entra con utente e PIN.</p>
  <input type="hidden" name="richiesta" value="__RICHIESTA__">
  <label for="utente">Utente</label>
  <input id="utente" name="utente" value="__UTENTE__" autocomplete="username" autocapitalize="none" required>
  <label for="pin">PIN</label>
  <input id="pin" class="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required>
  <button type="submit">Autorizza</button>
  <button type="submit" name="annulla" value="1" class="via" formnovalidate>Non autorizzare</button>
  __ERRORE__
</form>"""

SCADUTA = STILE + """<div class="box">""" + GOBBE + """
  <h1>TRGB</h1><h2>__LOCALE__</h2>
  <p>Questa richiesta è scaduta o è già stata usata. Ricomincia dal connettore in Claude.</p>
</div>"""
