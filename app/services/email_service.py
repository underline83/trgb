# @version: v1.0 — Mattone M.D (versione minima, sessione 2026-07-30)
# -*- coding: utf-8 -*-
"""
Email service — TRGB Gestionale (mattone M.D, versione minima)

Modulo: platform
Classificazione: [core]

PERCHÉ ESISTE ORA
-----------------
M.D era dichiarato "DA FARE, non prioritario" (decisione PO 2026-05-19,
docs/architettura_mattoni.md §M.D): si riprende quando un workflow lo rende
bloccante. Il workflow è arrivato: la comunicazione UNI-Intermittenti si
trasmette SOLO via email a una casella del Ministero. Senza canale email la
feature non esiste.

COSA È E COSA NON È
-------------------
Questa è la fetta bassa di M.D: apre una connessione SMTP, manda un messaggio
con allegati, ritorna l'esito e il `.eml` completo per l'archiviazione.
NON fa parte di questa versione (arriveranno con M.D pieno):
  - template HTML brand TRGB (header/footer, palette)
  - coda di retry / invio asincrono
  - tracking aperture
Chi ha bisogno di quelle cose aspetti M.D pieno, non allarghi questo file.

CONFIG (.env, letto a ogni chiamata — così cambiare .env + restart basta)
------------------------------------------------------------------------
    SMTP_HOST=smtps.aruba.it
    SMTP_PORT=465            # 465 → SSL implicito, 587 → STARTTLS
    SMTP_USER=...
    SMTP_PASS=...
    SMTP_FROM=...            # se assente usa SMTP_USER
    SMTP_FROM_NAME=Osteria Tre Gobbi
    SMTP_TIMEOUT=20

Il `From` deve essere una casella vera del dominio: molti provider rifiutano
mittenti arbitrari. Per le PA (es. la casella intermittenti del Ministero) NON
serve una PEC nostra: accettano email ordinarie.
"""

from __future__ import annotations

import hashlib
import logging
import os
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import List, Optional, Sequence, Tuple

logger = logging.getLogger("trgb.email")

# (filename, contenuto, mime_type) — mime nel formato "application/xml"
Allegato = Tuple[str, bytes, str]

_REQUIRED = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS")


@dataclass
class EsitoInvio:
    ok: bool
    destinatari: List[str] = field(default_factory=list)
    message_id: Optional[str] = None
    errore: Optional[str] = None
    eml: Optional[bytes] = None          # messaggio completo, per archivio/prova
    eml_hash: Optional[str] = None

    def to_dict(self):
        return {
            "ok": self.ok,
            "destinatari": self.destinatari,
            "message_id": self.message_id,
            "errore": self.errore,
            "eml_hash": self.eml_hash,
        }


# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

def _cfg() -> dict:
    return {
        "host": (os.getenv("SMTP_HOST") or "").strip(),
        "port": (os.getenv("SMTP_PORT") or "").strip(),
        "user": (os.getenv("SMTP_USER") or "").strip(),
        "password": os.getenv("SMTP_PASS") or "",
        "from_addr": (os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "").strip(),
        "from_name": (os.getenv("SMTP_FROM_NAME") or "").strip(),
        "timeout": int(os.getenv("SMTP_TIMEOUT") or 20),
    }


def mancanti() -> List[str]:
    """Variabili .env obbligatorie non impostate."""
    return [k for k in _REQUIRED if not (os.getenv(k) or "").strip()]


def is_configured() -> bool:
    return not mancanti()


def stato() -> dict:
    """Stato SMTP per la UI. Non espone mai la password."""
    c = _cfg()
    return {
        "configurato": is_configured(),
        "mancanti": mancanti(),
        "host": c["host"] or None,
        "port": c["port"] or None,
        "mittente": c["from_addr"] or None,
        "mittente_nome": c["from_name"] or None,
    }


# ─────────────────────────────────────────────
# INVIO
# ─────────────────────────────────────────────

def _costruisci(
    to: Sequence[str],
    subject: str,
    body: str,
    allegati: Optional[Sequence[Allegato]] = None,
    cc: Optional[Sequence[str]] = None,
    reply_to: Optional[str] = None,
) -> EmailMessage:
    c = _cfg()
    msg = EmailMessage()
    msg["From"] = formataddr((c["from_name"], c["from_addr"])) if c["from_name"] else c["from_addr"]
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=(c["from_addr"].split("@")[-1] or None))
    msg.set_content(body or "")

    for nome, contenuto, mime in (allegati or []):
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(
            contenuto,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=nome,
        )
    return msg


def invia_email(
    to,
    subject: str,
    body: str = "",
    allegati: Optional[Sequence[Allegato]] = None,
    cc=None,
    reply_to: Optional[str] = None,
) -> EsitoInvio:
    """
    Invia una email. Non solleva: ritorna sempre un EsitoInvio (l'errore è un
    dato di dominio da mostrare e archiviare, non un 500).

    `eml` contiene il messaggio completo come inviato: il chiamante che deve
    conservare una prova di trasmissione lo salva su disco.
    """
    to = [to] if isinstance(to, str) else list(to)
    cc = [cc] if isinstance(cc, str) else list(cc or [])

    if not to:
        return EsitoInvio(ok=False, errore="Nessun destinatario")

    miss = mancanti()
    if miss:
        return EsitoInvio(
            ok=False,
            destinatari=to,
            errore=f"SMTP non configurato: manca {', '.join(miss)} in .env",
        )

    c = _cfg()
    try:
        port = int(c["port"])
    except ValueError:
        return EsitoInvio(ok=False, destinatari=to, errore=f"SMTP_PORT non numerica: {c['port']!r}")

    msg = _costruisci(to, subject, body, allegati, cc, reply_to)
    raw = msg.as_bytes()

    try:
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(c["host"], port, timeout=c["timeout"], context=ctx) as s:
                s.login(c["user"], c["password"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(c["host"], port, timeout=c["timeout"]) as s:
                s.ehlo()
                try:
                    s.starttls(context=ctx)
                    s.ehlo()
                except smtplib.SMTPNotSupportedError:
                    logger.warning("SMTP %s:%s senza STARTTLS — invio in chiaro", c["host"], port)
                s.login(c["user"], c["password"])
                s.send_message(msg)
    except Exception as e:                      # noqa: BLE001 — vogliamo l'errore come dato
        logger.exception("Invio email fallito verso %s", to)
        return EsitoInvio(ok=False, destinatari=to + cc, errore=f"{type(e).__name__}: {e}",
                          eml=raw, eml_hash=hashlib.sha256(raw).hexdigest())

    logger.info("Email inviata a %s — oggetto %r", to + cc, subject)
    return EsitoInvio(
        ok=True,
        destinatari=to + cc,
        message_id=msg["Message-ID"],
        eml=raw,
        eml_hash=hashlib.sha256(raw).hexdigest(),
    )


def invia_test(to: str) -> EsitoInvio:
    """Email di prova, per verificare le credenziali senza effetti collaterali."""
    return invia_email(
        to,
        subject="TRGB — prova invio email",
        body=(
            "Se stai leggendo questo messaggio, il canale email del gestionale "
            "funziona.\n\nNessuna azione richiesta."
        ),
    )
