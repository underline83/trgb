# @version: v1.4 (2026-11-20) — In-Reply-To/References mai codificati =?utf-8?q?…?=: gli ID lunghi di Exchange
#   (oltre 78 caratteri) venivano trattati come testo e codificati, e la risposta non si agganciava alla conversazione
# v1.3 (2026-11-20) — `account`: si può mandare (o solo costruire, per le bozze) da un'altra casella del locale con le sue credenziali
# v1.2 (2026-11-20) — intestazione Date sulle mail in uscita (mancava: RFC 5322 la vuole, gli antispam la contano, i programmi di posta mostravano l'ora di arrivo)
# @version: v1.1 — intestazioni extra (In-Reply-To/References per le risposte dalla Posta, 2026-11-16)
# v1.0 — Mattone M.D (versione minima, sessione 2026-07-30)
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
import json
import logging
import os
import re
import smtplib
import ssl
from dataclasses import dataclass, field
from email import policy as _policy
from email.headerregistry import HeaderRegistry, UnstructuredHeader
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from cryptography.fernet import Fernet     # arriva con python-jose[cryptography]

from app.utils.locale_data import locale_data_dir

logger = logging.getLogger("trgb.email")

# (filename, contenuto, mime_type) — mime nel formato "application/xml"
Allegato = Tuple[str, bytes, str]

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
# CONFIG — DB/file del locale, con .env come fallback
# ─────────────────────────────────────────────
#
# Perché NON scriviamo nel .env dall'app (domanda di Marco, 2026-08-03):
#  1. le variabili d'ambiente si leggono all'avvio del processo: riscrivere il
#     file non cambia nulla finché non riavvii il backend, e ogni restart è la
#     finestra in cui i DB SQLite si sono già corrotti in passato;
#  2. darebbe al processo web il permesso di riscrivere il file che contiene
#     TUTTI i segreti, non solo questi.
# Quindi: la configurazione vive in `email_settings.json` nella cartella dati
# DEL LOCALE (quindi diversa per ogni installazione, senza toccare il server),
# e il .env resta come fallback per chi l'ha già configurato così.
#
# La password è cifrata con Fernet e la chiave sta in .env (`TRGB_SECRET_KEY`):
# i DB e i file dati finiscono nei backup, e i backup escono dalla macchina
# (Backblaze). Chi si ritrova un backup in mano non deve trovarci dentro la
# password della casella. La chiave, restando nel .env, nel backup non c'è.

CONFIG_FILENAME = "email_settings.json"
_CAMPI_TESTO = ("host", "port", "user", "from_addr", "from_name", "test_to")


def _config_file() -> Path:
    return locale_data_dir() / CONFIG_FILENAME


def genera_chiave() -> str:
    """Chiave Fernet nuova, da incollare in .env come TRGB_SECRET_KEY."""
    return Fernet.generate_key().decode()


def _fernet() -> Optional[Fernet]:
    raw = (os.getenv("TRGB_SECRET_KEY") or "").strip()
    if not raw:
        return None
    try:
        return Fernet(raw.encode())
    except Exception:
        logger.error("TRGB_SECRET_KEY non è una chiave Fernet valida")
        return None


def _load_file_cfg() -> dict:
    try:
        f = _config_file()
        if not f.exists():
            return {}
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("email_settings.json illeggibile — si usa il .env")
        return {}


def _cfg() -> dict:
    """Config effettiva: file del locale se c'è, .env come fallback campo per campo."""
    f = _load_file_cfg()
    env = {
        "host": (os.getenv("SMTP_HOST") or "").strip(),
        "port": (os.getenv("SMTP_PORT") or "").strip(),
        "user": (os.getenv("SMTP_USER") or "").strip(),
        "password": os.getenv("SMTP_PASS") or "",
        "from_addr": (os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "").strip(),
        "from_name": (os.getenv("SMTP_FROM_NAME") or "").strip(),
        "test_to": "",
    }
    out = dict(env)
    for k in _CAMPI_TESTO:
        v = (f.get(k) or "").strip()
        if v:
            out[k] = v
    if f.get("password_cifrata"):
        fer = _fernet()
        if fer:
            try:
                out["password"] = fer.decrypt(f["password_cifrata"].encode()).decode()
            except Exception:
                logger.error("password SMTP non decifrabile: TRGB_SECRET_KEY cambiata?")
        else:
            logger.error("password SMTP cifrata ma manca TRGB_SECRET_KEY in .env")
    if not out.get("from_addr"):
        out["from_addr"] = out.get("user", "")
    out["timeout"] = int(os.getenv("SMTP_TIMEOUT") or 20)
    out["_origine"] = "gestionale" if f else "env"
    return out


def salva_config(host=None, port=None, user=None, password=None,
                 from_addr=None, from_name=None, test_to=None) -> dict:
    """
    Salva la config nel file del locale. `password=None` = lascia quella che c'è
    (la UI non la rilegge mai, quindi non può nemmeno rimandarla indietro).
    Solleva ValueError se serve la chiave di cifratura e non c'è.
    """
    cur = _load_file_cfg()
    nuovo = dict(cur)
    for k, v in (("host", host), ("port", port), ("user", user),
                 ("from_addr", from_addr), ("from_name", from_name), ("test_to", test_to)):
        if v is not None:
            nuovo[k] = str(v).strip()

    if password:
        fer = _fernet()
        if not fer:
            raise ValueError(
                "Per salvare la password serve una chiave di cifratura: aggiungi al .env "
                f"del server la riga TRGB_SECRET_KEY={genera_chiave()} e riavvia il backend. "
                "La password non viene salvata in chiaro perché i backup escono dalla macchina."
            )
        nuovo["password_cifrata"] = fer.encrypt(password.encode()).decode()

    if nuovo.get("port"):
        try:
            int(nuovo["port"])
        except ValueError:
            raise ValueError(f"Porta non numerica: {nuovo['port']!r}")

    f = _config_file()
    f.write_text(json.dumps(nuovo, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        os.chmod(f, 0o600)      # contiene un segreto, anche se cifrato
    except OSError:
        pass
    return stato()


def mancanti() -> List[str]:
    """Campi obbligatori non impostati, in nomi leggibili dalla UI."""
    c = _cfg()
    etichette = {"host": "server SMTP", "port": "porta", "user": "utente", "password": "password"}
    return [etichette[k] for k in ("host", "port", "user", "password") if not str(c.get(k) or "").strip()]


def is_configured() -> bool:
    return not mancanti()


def stato() -> dict:
    """Stato per la UI. La password non esce mai da qui."""
    c = _cfg()
    return {
        "configurato": is_configured(),
        "mancanti": mancanti(),
        "origine": c["_origine"],          # 'gestionale' | 'env'
        "host": c["host"] or None,
        "port": c["port"] or None,
        "utente": c["user"] or None,
        "mittente": c["from_addr"] or None,
        "mittente_nome": c["from_name"] or None,
        "test_to": c.get("test_to") or None,
        "ha_password": bool(c.get("password")),
        "chiave_cifratura": _fernet() is not None,
    }


# ─────────────────────────────────────────────
# INVIO
# ─────────────────────────────────────────────
# Intestazioni di collegamento (In-Reply-To, References)
# ─────────────────────────────────────────────
#
# PERCHÉ (2026-11-20, risposta a un cliente su Exchange): con la policy di default
# Python tratta In-Reply-To e References come testo libero. Un Message-ID di
# Exchange è lungo più di 78 caratteri: per farlo stare nella riga la libreria lo
# codificava in «=?utf-8?q?=3C…=40…?=». Il programma di posta del cliente non
# ritrova più l'ID e la risposta non entra nella conversazione.
# Qui gli ID restano ASCII, tra < >, esattamente come arrivano (maiuscole
# comprese); se la riga è lunga si va a capo SOLO tra un ID e l'altro.

_MSG_ID = re.compile(r"<[\x21-\x3b\x3d\x3f-\x7e]+>")      # <…> in ASCII stampabile, senza < > dentro


class _IntestazioneId(UnstructuredHeader):
    """Elenco di Message-ID: mai codificato, piegato solo tra un ID e l'altro."""

    @classmethod
    def parse(cls, value, kwds):
        kwds["parse_tree"] = None
        kwds["decoded"] = " ".join(_MSG_ID.findall(str(value or "")))
        kwds["defects"] = []

    def fold(self, *, policy):
        limite = policy.max_line_length or 78
        testa = self.name + ":"
        righe, riga = [], testa
        for mid in str(self).split():
            if riga != testa and len(riga) + 1 + len(mid) > limite:
                righe.append(riga)
                riga = " " + mid
            else:
                riga += " " + mid
        righe.append(riga)
        return policy.linesep.join(righe) + policy.linesep


_registro = HeaderRegistry()
_registro.map_to_type("in-reply-to", _IntestazioneId)
_registro.map_to_type("references", _IntestazioneId)
POLICY_POSTA = _policy.default.clone(header_factory=_registro)


def _costruisci(
    to: Sequence[str],
    subject: str,
    body: str,
    allegati: Optional[Sequence[Allegato]] = None,
    cc: Optional[Sequence[str]] = None,
    reply_to: Optional[str] = None,
    intestazioni: Optional[dict] = None,
    account: Optional[dict] = None,
) -> EmailMessage:
    c = account or _cfg()
    msg = EmailMessage(policy=POLICY_POSTA)
    msg["From"] = formataddr((c["from_name"], c["from_addr"])) if c["from_name"] else c["from_addr"]
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=(c["from_addr"].split("@")[-1] or None))
    msg["Date"] = formatdate(localtime=True)        # obbligatoria (RFC 5322): senza, chi riceve vede l'ora di arrivo
    # Solo intestazioni di thread (risposte): niente From/To/Subject da qui
    for nome, valore in (intestazioni or {}).items():
        if nome in ("In-Reply-To", "References") and valore and _MSG_ID.search(str(valore)):
            msg[nome] = valore          # _IntestazioneId: ID in chiaro, mai =?utf-8?q?…?=
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


def costruisci_messaggio(to, subject: str, body: str = "", cc=None, intestazioni: Optional[dict] = None,
                         account: Optional[dict] = None) -> EmailMessage:
    """Il messaggio come partirebbe, senza mandarlo (per le bozze messe nella casella)."""
    to = [to] if isinstance(to, str) else list(to)
    cc = [cc] if isinstance(cc, str) else list(cc or [])
    return _costruisci(to, subject, body, None, cc, None, intestazioni, account)


def invia_email(
    to,
    subject: str,
    body: str = "",
    allegati: Optional[Sequence[Allegato]] = None,
    cc=None,
    reply_to: Optional[str] = None,
    intestazioni: Optional[dict] = None,
    account: Optional[dict] = None,
) -> EsitoInvio:
    """
    Invia una email. Non solleva: ritorna sempre un EsitoInvio (l'errore è un
    dato di dominio da mostrare e archiviare, non un 500).

    `eml` contiene il messaggio completo come inviato: il chiamante che deve
    conservare una prova di trasmissione lo salva su disco.

    `account` (2026-11-20) = un'altra casella del locale {host, port, user, password,
    from_addr, from_name}: senza, parte dal canale email (la casella del gestionale).
    """
    to = [to] if isinstance(to, str) else list(to)
    cc = [cc] if isinstance(cc, str) else list(cc or [])

    if not to:
        return EsitoInvio(ok=False, errore="Nessun destinatario")

    if account is None:
        miss = mancanti()
        if miss:
            return EsitoInvio(
                ok=False,
                destinatari=to,
                errore=f"Canale email non configurato: manca {', '.join(miss)} "
                       f"(Impostazioni Sistema → Email, oppure .env del server)",
            )
    else:
        miss = [k for k in ("host", "port", "user", "password", "from_addr") if not str(account.get(k) or "").strip()]
        if miss:
            return EsitoInvio(ok=False, destinatari=to, errore=f"Casella non pronta per l'invio: manca {', '.join(miss)}")

    c = dict(account) if account else _cfg()
    c.setdefault("timeout", int(os.getenv("SMTP_TIMEOUT") or 20))
    try:
        port = int(c["port"])
    except ValueError:
        return EsitoInvio(ok=False, destinatari=to, errore=f"SMTP_PORT non numerica: {c['port']!r}")

    msg = _costruisci(to, subject, body, allegati, cc, reply_to, intestazioni, account)
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


def invia_test(to: Optional[str] = None) -> EsitoInvio:
    """Email di prova, per verificare le credenziali senza effetti collaterali."""
    to = (to or _cfg().get("test_to") or "").strip()
    if not to:
        return EsitoInvio(ok=False, errore="Nessun indirizzo di prova impostato")
    return invia_email(
        to,
        subject="TRGB — prova invio email",
        body=(
            "Se stai leggendo questo messaggio, il canale email del gestionale "
            "funziona.\n\nNessuna azione richiesta."
        ),
    )
