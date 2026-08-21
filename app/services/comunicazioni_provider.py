# @version: v1.0-comunicazioni
# -*- coding: utf-8 -*-
# Modulo: comunicazioni
# Classificazione: [core]
"""
Astrazione sul provider di invio — modulo Comunicazioni.

Chi consegna materialmente le email è una scelta di configurazione, non di
codice. Si cambia scrivendo `provider` in `comm_impostazioni`, senza toccare
una riga del motore di invio.

    brevo → API HTTP. È la scelta di partenza (2026-08-14): gestisce da sé
            rimbalzi e liste di soppressione, e non chiude l'account al primo
            invio storto come farebbe SES.
    ses   → predisposto, non implementato. Destinazione a lista scaldata:
            costa ~1$ contro i ~25$ di Brevo, ma sospende sopra lo 0,1% di
            segnalazioni e la lista Tre Gobbi ci naviga vicino (0,05-0,08%).
    smtp  → riusa il mattone M.D (`email_service`). Va bene per le prove e per
            i pochi invii, NON per le campagne: un VPS Aruba che manda 6.000
            email finisce in spam e si porta dietro la posta seria.

PERCHÉ urllib E NON requests
-----------------------------
Stessa scelta di `mailchimp_service.py`: nessuna dipendenza nuova da installare
sul VPS, e il giro di chiamate qui è banale.

L'INTESTAZIONE List-Unsubscribe NON È OPZIONALE
------------------------------------------------
Gmail e Outlook la pretendono sugli invii di massa: senza, la posta finisce
in spam a prescindere dal contenuto. Va in ogni messaggio, sempre, e punta al
link con token che il destinatario può premere senza autenticarsi.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("trgb.comunicazioni.provider")

BREVO_API = "https://api.brevo.com/v3/smtp/email"
TIMEOUT = 30


@dataclass
class EsitoInvio:
    ok: bool
    provider_msg_id: Optional[str] = None
    errore: Optional[str] = None
    # True quando l'errore è definitivo (indirizzo inesistente): il chiamante
    # sopprime il contatto invece di ritentare.
    permanente: bool = False
    dettagli: Dict[str, Any] = field(default_factory=dict)


class Provider:
    """Interfaccia. Chi la implementa consegna una email per volta."""

    nome = "astratto"

    def invia(self, destinatario: Dict[str, Any], messaggio: Dict[str, Any]) -> EsitoInvio:
        raise NotImplementedError

    def verifica_configurazione(self) -> Dict[str, Any]:
        raise NotImplementedError

    @staticmethod
    def _intestazioni_unsubscribe(unsub_url: Optional[str]) -> Dict[str, str]:
        if not unsub_url:
            return {}
        return {
            "List-Unsubscribe": f"<{unsub_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }


class BrevoProvider(Provider):
    nome = "brevo"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (api_key or os.environ.get("BREVO_API_KEY", "")).strip()

    def _chiama(self, payload: dict) -> tuple[int, dict]:
        req = urllib.request.Request(
            BREVO_API,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "api-key": self.api_key,
                "content-type": "application/json",
                "accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                corpo = resp.read().decode("utf-8") or "{}"
                return resp.status, json.loads(corpo)
        except urllib.error.HTTPError as exc:
            corpo = exc.read().decode("utf-8", errors="replace")
            try:
                return exc.code, json.loads(corpo)
            except json.JSONDecodeError:
                return exc.code, {"message": corpo[:500]}

    def verifica_configurazione(self) -> Dict[str, Any]:
        if not self.api_key:
            return {"ok": False, "errore": "BREVO_API_KEY assente nell'ambiente"}
        req = urllib.request.Request(
            "https://api.brevo.com/v3/account",
            headers={"api-key": self.api_key, "accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                dati = json.loads(resp.read().decode("utf-8"))
            return {
                "ok": True,
                "account": dati.get("email"),
                "piano": (dati.get("plan") or [{}])[0].get("type"),
                "crediti": (dati.get("plan") or [{}])[0].get("credits"),
            }
        except urllib.error.HTTPError as exc:
            return {"ok": False, "errore": f"HTTP {exc.code}: chiave rifiutata"}
        except Exception as exc:  # rete assente, DNS, timeout
            return {"ok": False, "errore": str(exc)}

    def invia(self, destinatario: Dict[str, Any], messaggio: Dict[str, Any]) -> EsitoInvio:
        if not self.api_key:
            return EsitoInvio(False, errore="BREVO_API_KEY assente", permanente=True)

        nome_dest = " ".join(
            x for x in [destinatario.get("nome"), destinatario.get("cognome")] if x
        ).strip()

        payload: Dict[str, Any] = {
            "sender": {
                "name": messaggio.get("mittente_nome") or "",
                "email": messaggio["mittente_email"],
            },
            "to": [{"email": destinatario["email"], **({"name": nome_dest} if nome_dest else {})}],
            "subject": messaggio["oggetto"],
            "htmlContent": messaggio["html"],
        }
        if messaggio.get("testo"):
            payload["textContent"] = messaggio["testo"]
        if messaggio.get("rispondi_a"):
            payload["replyTo"] = {"email": messaggio["rispondi_a"]}

        intestazioni = self._intestazioni_unsubscribe(messaggio.get("unsub_url"))
        if intestazioni:
            payload["headers"] = intestazioni
        if messaggio.get("campagna_id"):
            # Torna indietro nei webhook: è così che si riaggancia un evento
            # alla campagna senza dipendere solo dal messageId.
            payload["tags"] = [f"campagna-{messaggio['campagna_id']}"]

        stato, risposta = self._chiama(payload)

        if stato in (200, 201, 202):
            return EsitoInvio(True, provider_msg_id=risposta.get("messageId"))

        codice = (risposta.get("code") or "").lower()
        messaggio_err = risposta.get("message") or f"HTTP {stato}"
        # 400 su indirizzo non valido = non ha senso ritentare.
        permanente = stato == 400 and ("invalid" in codice or "invalid" in messaggio_err.lower())
        return EsitoInvio(False, errore=f"[{stato}] {messaggio_err}",
                          permanente=permanente, dettagli=risposta)


class SmtpProvider(Provider):
    """
    Riusa il mattone M.D. Per prove e invii singoli.
    Non usarlo per le campagne: vedi nota in testa al file.
    """

    nome = "smtp"

    def verifica_configurazione(self) -> Dict[str, Any]:
        try:
            from app.services import email_service
        except ImportError as exc:
            return {"ok": False, "errore": f"mattone M.D non disponibile: {exc}"}
        return email_service.stato()

    def invia(self, destinatario: Dict[str, Any], messaggio: Dict[str, Any]) -> EsitoInvio:
        try:
            from app.services import email_service
        except ImportError as exc:
            return EsitoInvio(False, errore=str(exc), permanente=True)

        esito = email_service.invia_email(
            destinatari=[destinatario["email"]],
            oggetto=messaggio["oggetto"],
            corpo_html=messaggio["html"],
            corpo_testo=messaggio.get("testo"),
        )
        ok = getattr(esito, "ok", False)
        return EsitoInvio(ok, errore=None if ok else getattr(esito, "errore", "invio fallito"))


class SesProvider(Provider):
    nome = "ses"

    def verifica_configurazione(self) -> Dict[str, Any]:
        return {"ok": False, "errore": "SES non ancora implementato — vedi nota in testa al file"}

    def invia(self, destinatario, messaggio) -> EsitoInvio:
        return EsitoInvio(False, errore="SES non ancora implementato", permanente=True)


_REGISTRO = {"brevo": BrevoProvider, "smtp": SmtpProvider, "ses": SesProvider}


def get_provider(nome: Optional[str] = None) -> Provider:
    """Istanzia il provider configurato. Default brevo se il valore è ignoto."""
    from app.models.comm_db import get_impostazione

    nome = (nome or get_impostazione("provider", "brevo")).strip().lower()
    classe = _REGISTRO.get(nome)
    if classe is None:
        logger.warning("comunicazioni: provider %r sconosciuto, uso brevo", nome)
        classe = BrevoProvider
    return classe()


def provider_disponibili() -> List[str]:
    return sorted(_REGISTRO)
