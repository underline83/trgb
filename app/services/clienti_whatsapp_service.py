# @version: v1.1 (2026-11-23) — ingresso YCloud (provider scelto) + chat «chiuse dal cliente»
# v1.0 (2026-11-02) — check WhatsApp in sola lettura (coexistence Meta)
# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
clienti_whatsapp_service.py — archivio WhatsApp in SOLA LETTURA del numero del locale.

Come funziona (doc: docs/modulo_clienti_crm.md § WhatsApp, guida Meta in
docs/guida_whatsapp_meta.md):
  · il numero resta sull'app WhatsApp Business del telefono; con la «coexistence»
    di Meta lo stesso numero è anche sulla Cloud API e Meta manda a TRGB un webhook
    per ogni messaggio ricevuto («messages»), per ogni messaggio scritto dall'app
    («smb_message_echoes»), per lo storico degli ultimi 6 mesi («history») e per la
    rubrica dell'app («smb_app_state_sync»);
  · TRGB salva numero, direzione, testo e ora. I media NON si scaricano;
  · TRGB NON manda messaggi: nessuna funzione qui scrive ai clienti;
  · i messaggi più vecchi di clienti_impostazioni.wa_conservazione_giorni si
    cancellano da soli.

Configurazione (.env sul VPS, mai nel codice, nel DB o in chat):
  WA_APP_ID            id dell'app Meta (pubblico: serve anche alla pagina)
  WA_APP_SECRET        segreto dell'app: firma dei webhook + scambio del codice
  WA_CONFIG_ID         id della configurazione «Facebook Login for Business»
  WA_VERIFY_TOKEN      parola scelta da Marco, uguale a quella nel pannello Meta
  WA_GRAPH_VERSION     versione Graph API (default v26.0)

Il token del business che nasce dal collegamento si usa SUBITO (iscrizione ai
webhook, sincronizzazione) e non si salva: per leggere non serve più.

Provider YCloud (dal 2026-11-23, Q #295): il numero è collegato in coexistence a YCloud
(BSP Meta) e YCloud rimanda a TRGB gli stessi fatti con i suoi eventi
(whatsapp.inbound_message.received, whatsapp.smb.message.echoes, whatsapp.smb.history,
whatsapp.message.updated, ...) su POST /clienti/whatsapp/ycloud, firmati con
YCloud-Signature. Finiscono nelle stesse tabelle: il resto (conversazioni, cerca, giro)
non sa da dove arrivano.
  YCLOUD_WEBHOOK_SECRET  segreto dell'endpoint creato in YCloud › Developers › Webhooks
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn
from app.utils.whatsapp import normalize_phone

logger = logging.getLogger("trgb.whatsapp")

GRAPH_VERSION_DEFAULT = "v26.0"
WEBHOOK_PATH = "/clienti/whatsapp/webhook"
_TIMEOUT = 20

# Campi webhook che servono (da spuntare nel pannello Meta)
CAMPI_WEBHOOK = ("messages", "smb_message_echoes", "history", "smb_app_state_sync", "account_update")

# Tipi che non sono «un messaggio a cui rispondere»
TIPI_SENZA_RISPOSTA = ("reaction", "unsupported", "system", "errors")

# Eventi di account_update che vogliono dire «collegamento caduto»
EVENTI_SCOLLEGATO = ("PARTNER_REMOVED", "ACCOUNT_OFFBOARDED", "PRIMARY_INACTIVITY",
                     "DISCONNECTED", "ACCOUNT_DELETED")

# ── YCloud ──
YCLOUD_PATH = "/clienti/whatsapp/ycloud"
# Eventi da spuntare in YCloud › Developers › Webhooks (nomi come nel pannello YCloud)
EVENTI_YCLOUD = (
    "whatsapp.inbound_message.received",   # messaggi dei clienti
    "whatsapp.smb.message.echoes",         # scritti dall'app sul telefono
    "whatsapp.smb.history",                # storico (una volta, se YCloud lo rimanda)
    "whatsapp.smb.app.state.sync",         # rubrica dell'app
    "whatsapp.message.updated",            # scritti dalla casella di YCloud (contano come risposta)
    "whatsapp.business_account.updated",   # account sospeso / riattivato
    "whatsapp.business_account.deleted",   # collegamento tolto (es. app non aperta da ~14 giorni)
    "whatsapp.phone_number.deleted",
    "whatsapp.phone_number.quality_updated",
)
EVENTI_YCLOUD_MESSAGGIO = {
    "whatsapp.inbound_message.received": "webhook",
    "whatsapp.smb.message.echoes": "eco",
    "whatsapp.smb.message.created": "eco",
    "whatsapp.smb.history": "storico",
    "whatsapp.message.updated": "ycloud",
}

# ── Chat «chiuse dal cliente» (decisione di Marco 2026-11-23): l'ultimo messaggio del
# cliente è solo un saluto/grazie/emoji → gruppo a parte, non «da rispondere».
# Parole e lunghezza massima sono impostazioni (clienti_impostazioni), questi solo i
# valori di partenza.
CHIUSURA_PAROLE_DEFAULT = (
    "grazie, grazie mille, mille grazie, ok, okay, perfetto, perfetta, ottimo, benissimo, "
    "va bene, d'accordo, a presto, a dopo, a domani, buona serata, buona giornata, "
    "buonanotte, ciao, gentilissimi, gentilissimo, gentilissima, 👍, 🙏, ❤️, 😊, 🙂"
)
CHIUSURA_MAX_DEFAULT = 40

_lock = threading.Lock()
_ultima_pulizia = {"t": 0.0}


class WhatsAppNonConfigurato(Exception):
    """Mancano le chiavi dell'app Meta nel .env."""


class WhatsAppErroreMeta(Exception):
    def __init__(self, status: int, messaggio: str):
        super().__init__(f"Meta HTTP {status}: {messaggio}")
        self.status = status


# ============================================================
# CONFIGURAZIONE
# ============================================================

def _env(nome: str, default: str = "") -> str:
    return (os.getenv(nome) or default).strip()


def _graph_url(percorso: str) -> str:
    return f"https://graph.facebook.com/{_env('WA_GRAPH_VERSION', GRAPH_VERSION_DEFAULT)}/{percorso.lstrip('/')}"


def configurazione() -> Dict[str, Any]:
    """Cosa c'è nel .env (i segreti solo come presente/assente)."""
    return {
        "app_id": _env("WA_APP_ID") or None,
        "config_id": _env("WA_CONFIG_ID") or None,
        "graph_version": _env("WA_GRAPH_VERSION", GRAPH_VERSION_DEFAULT),
        "app_secret_presente": bool(_env("WA_APP_SECRET")),
        "verify_token_presente": bool(_env("WA_VERIFY_TOKEN")),
        "webhook_path": WEBHOOK_PATH,
        "campi_webhook": list(CAMPI_WEBHOOK),
        "provider": "ycloud" if ycloud_configurato() else "meta",
        "ycloud": {
            "segreto_presente": ycloud_configurato(),
            "webhook_path": YCLOUD_PATH,
            "eventi": list(EVENTI_YCLOUD),
        },
    }


def webhook_configurato() -> bool:
    return bool(_env("WA_APP_SECRET") and _env("WA_VERIFY_TOKEN"))


def verifica_sottoscrizione(mode: Optional[str], token: Optional[str]) -> bool:
    """GET di verifica di Meta (hub.mode=subscribe + hub.verify_token)."""
    atteso = _env("WA_VERIFY_TOKEN")
    if mode != "subscribe" or not atteso or not token:
        return False
    return hmac.compare_digest(token.encode("utf-8"), atteso.encode("utf-8"))


def verifica_firma(corpo: bytes, firma: Optional[str]) -> bool:
    """X-Hub-Signature-256: «sha256=<hmac del corpo con il segreto dell'app>»."""
    segreto = _env("WA_APP_SECRET")
    if not segreto or not firma or not firma.startswith("sha256="):
        return False
    atteso = hmac.new(segreto.encode("utf-8"), corpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(firma[7:].strip().lower(), atteso)


def ycloud_configurato() -> bool:
    return bool(_env("YCLOUD_WEBHOOK_SECRET"))


def verifica_firma_ycloud(corpo: bytes, intestazione: Optional[str]) -> bool:
    """YCloud-Signature: «t=<unix>,s=<hex>», s = HMAC-SHA256 di «t.corpo grezzo» col
    segreto dell'endpoint. Il segreto si prova com'è e senza il prefisso «whsec_».
    L'ora non si controlla: YCloud ritenta fino a ore dopo e un evento ripetuto non fa
    danni (i messaggi sono unici per wamid)."""
    segreto = _env("YCLOUD_WEBHOOK_SECRET")
    if not segreto or not intestazione:
        return False
    parti: Dict[str, str] = {}
    for pezzo in intestazione.split(","):
        k, _, v = pezzo.strip().partition("=")
        if k and v:
            parti[k.strip()] = v.strip()
    t, s = parti.get("t"), (parti.get("s") or "").lower()
    if not t or not s:
        return False
    messaggio = t.encode("utf-8") + b"." + corpo
    chiavi = [segreto] + ([segreto[len("whsec_"):]] if segreto.startswith("whsec_") else [])
    for chiave in chiavi:
        atteso = hmac.new(chiave.encode("utf-8"), messaggio, hashlib.sha256).hexdigest()
        if hmac.compare_digest(s, atteso):
            return True
    return False


# ============================================================
# IMPOSTAZIONI (clienti_impostazioni, chiavi wa_*)
# ============================================================

def _imp_get(conn, chiave: str, default: Optional[str] = None) -> Optional[str]:
    r = conn.execute("SELECT valore FROM clienti_impostazioni WHERE chiave = ?", (chiave,)).fetchone()
    return r["valore"] if r else default


def _imp_set(conn, chiave: str, valore: Any, descrizione: Optional[str] = None) -> None:
    valore = "" if valore is None else str(valore)
    conn.execute(
        """INSERT INTO clienti_impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)
           ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore""",
        (chiave, valore, descrizione),
    )


def conservazione_giorni(conn=None) -> int:
    chiudi = conn is None
    conn = conn or get_clienti_conn()
    try:
        try:
            return max(1, int(_imp_get(conn, "wa_conservazione_giorni", "90")))
        except (TypeError, ValueError):
            return 90
    finally:
        if chiudi:
            conn.close()


# ============================================================
# WEBHOOK → DB
# ============================================================

def _cifre(numero: Any) -> str:
    return re.sub(r"\D", "", str(numero or ""))


def _ts(valore: Any) -> int:
    try:
        return int(valore)
    except (TypeError, ValueError):
        return int(time.time())


def _tipo_testo(msg: Dict[str, Any]) -> tuple[str, Optional[str]]:
    """Tipo e testo leggibile. Dei media resta solo la didascalia."""
    tipo = msg.get("type") or "unknown"
    corpo = msg.get(tipo) if isinstance(msg.get(tipo), dict) else {}
    if tipo == "text":
        return tipo, (corpo.get("body") or "")[:4000]
    if tipo in ("image", "video", "document", "audio", "sticker"):
        etichetta = {"image": "foto", "video": "video", "document": "documento",
                     "audio": "audio", "sticker": "sticker"}[tipo]
        dida = corpo.get("caption") or corpo.get("filename") or ""
        return tipo, f"[{etichetta}] {dida}".strip()[:4000]
    if tipo == "reaction":
        return tipo, corpo.get("emoji") or ""
    if tipo == "location":
        return tipo, "[posizione] " + (corpo.get("name") or corpo.get("address") or "")
    if tipo == "contacts":
        return tipo, "[contatto]"
    if tipo == "interactive":
        scelta = corpo.get("button_reply") or corpo.get("list_reply") or {}
        return tipo, scelta.get("title") or "[risposta]"
    if tipo == "button":
        return tipo, corpo.get("text") or "[pulsante]"
    if tipo == "media_placeholder":
        return tipo, "[media]"
    return tipo, f"[{tipo}]"


def _salva_messaggio(conn, msg: Dict[str, Any], numero: str, direzione: str, fonte: str) -> int:
    wamid = msg.get("id")
    numero = _cifre(numero)
    if not wamid or not numero:
        return 0
    tipo, testo = _tipo_testo(msg)
    cur = conn.execute(
        """INSERT OR IGNORE INTO clienti_wa_messaggi (wamid, numero, direzione, tipo, testo, ts, fonte)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (wamid, numero, direzione, tipo, testo, _ts(msg.get("timestamp")), fonte),
    )
    return cur.rowcount or 0


def _salva_contatto(conn, numero: str, nome_profilo: Optional[str] = None,
                    nome_rubrica: Optional[str] = None, togli_rubrica: bool = False) -> None:
    numero = _cifre(numero)
    if not numero:
        return
    conn.execute("INSERT OR IGNORE INTO clienti_wa_contatti (numero) VALUES (?)", (numero,))
    if nome_profilo:
        conn.execute("""UPDATE clienti_wa_contatti SET nome_profilo = ?, aggiornato_at = datetime('now','localtime')
                        WHERE numero = ?""", (nome_profilo[:200], numero))
    if nome_rubrica:
        conn.execute("""UPDATE clienti_wa_contatti SET nome_rubrica = ?, aggiornato_at = datetime('now','localtime')
                        WHERE numero = ?""", (nome_rubrica[:200], numero))
    if togli_rubrica:
        conn.execute("""UPDATE clienti_wa_contatti SET nome_rubrica = NULL, aggiornato_at = datetime('now','localtime')
                        WHERE numero = ?""", (numero,))


def _avvisa_scollegato(evento: str, provider: str = "meta") -> None:
    if provider == "ycloud":
        rimedio = ("Apri l'app WhatsApp Business sul telefono; se non basta, ricollega il numero "
                   "da YCloud (WhatsApp Manager › Create Channel › WhatsApp Business App), entrando "
                   "con il profilo che gestisce la Pagina dell'osteria.")
    else:
        rimedio = ("Apri l'app WhatsApp Business sul telefono; se non basta, ricollega da "
                   "Clienti › Impostazioni › WhatsApp.")
    try:
        from app.services.notifiche_service import crea_notifica
        crea_notifica(
            tipo="clienti",
            titolo="WhatsApp: collegamento caduto",
            messaggio=(f"{'YCloud' if provider == 'ycloud' else 'Meta'} segnala «{evento}». "
                       f"Il giro non vede più i messaggi WhatsApp. {rimedio}"),
            link="/clienti/impostazioni/whatsapp",
            icona="⚠️",
            urgenza="alta",
            modulo="clienti",
            dest_ruolo="admin",
        )
    except Exception:  # la notifica non deve far perdere il webhook
        logger.exception("WhatsApp: notifica di scollegamento non creata")


def _elabora_change(conn, campo: str, valore: Dict[str, Any], numero_atteso: Optional[str]) -> int:
    meta = valore.get("metadata") or {}
    if numero_atteso and meta.get("phone_number_id") and str(meta.get("phone_number_id")) != numero_atteso:
        logger.warning("WhatsApp: webhook per un altro numero (%s), ignorato", meta.get("phone_number_id"))
        return 0
    n = 0
    if campo == "messages":
        for c in valore.get("contacts") or []:
            _salva_contatto(conn, c.get("wa_id"), nome_profilo=(c.get("profile") or {}).get("name"))
        for m in valore.get("messages") or []:
            # media dello storico (ultime 2 settimane): sostituiscono il segnaposto, stesso wamid
            n += _salva_messaggio(conn, m, m.get("from"), "in", "webhook")
    elif campo == "smb_message_echoes":
        for m in valore.get("message_echoes") or []:
            n += _salva_messaggio(conn, m, m.get("to"), "out", "eco")
    elif campo == "history":
        for blocco in valore.get("history") or []:
            if blocco.get("errors"):
                err = blocco["errors"][0]
                _imp_set(conn, "wa_storico_errore",
                         f"{err.get('code')}: {err.get('message') or err.get('title') or ''}".strip())
                continue
            bm = blocco.get("metadata") or {}
            if bm.get("progress") is not None:
                _imp_set(conn, "wa_storico_progresso", f"fase {bm.get('phase')} · {bm.get('progress')}%")
            for thread in blocco.get("threads") or []:
                cliente = _cifre(thread.get("id"))
                for m in thread.get("messages") or []:
                    direzione = "in" if _cifre(m.get("from")) == cliente else "out"
                    n += _salva_messaggio(conn, m, cliente, direzione, "storico")
    elif campo == "smb_app_state_sync":
        for s in valore.get("state_sync") or []:
            if s.get("type") != "contact":
                continue
            c = s.get("contact") or {}
            if s.get("action") == "remove":
                _salva_contatto(conn, c.get("phone_number"), togli_rubrica=True)
            else:
                _salva_contatto(conn, c.get("phone_number"),
                                nome_rubrica=c.get("full_name") or c.get("first_name"))
    elif campo == "account_update":
        evento = str(valore.get("event") or "")
        _imp_set(conn, "wa_ultimo_account_update", f"{datetime.now():%Y-%m-%d %H:%M} {evento}")
        if evento in EVENTI_SCOLLEGATO:
            _imp_set(conn, "wa_scollegato", evento)
            _avvisa_scollegato(evento)
    return n


def elabora_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Salva quello che arriva da Meta. Ritorna {campi, messaggi_nuovi}."""
    campi: List[str] = []
    nuovi = 0
    with _lock:
        conn = get_clienti_conn()
        try:
            numero_atteso = _imp_get(conn, "wa_phone_number_id") or None
            try:
                for entry in payload.get("entry") or []:
                    for ch in entry.get("changes") or []:
                        campo = ch.get("field") or "?"
                        campi.append(campo)
                        nuovi += _elabora_change(conn, campo, ch.get("value") or {}, numero_atteso)
                _imp_set(conn, "wa_ultimo_webhook_at", f"{datetime.now():%Y-%m-%d %H:%M:%S}")
                conn.execute("INSERT INTO clienti_wa_eventi (campo, messaggi, esito) VALUES (?, ?, 'ok')",
                             (",".join(sorted(set(campi)))[:200], nuovi))
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.exception("WhatsApp: webhook non elaborato")
                # il payload grezzo si tiene SOLO qui, per capire cosa non torna (si cancella con la pulizia)
                conn.execute(
                    "INSERT INTO clienti_wa_eventi (campo, messaggi, esito, errore, payload) VALUES (?, 0, 'errore', ?, ?)",
                    (",".join(sorted(set(campi)))[:200], str(e)[:500],
                     json.dumps(payload, ensure_ascii=False)[:50000]),
                )
                conn.commit()
            _pulizia(conn)
        finally:
            conn.close()
    return {"campi": sorted(set(campi)), "messaggi_nuovi": nuovi}


# ============================================================
# WEBHOOK YCLOUD → DB (stesse tabelle del webhook Meta)
# ============================================================

def _ts_iso(*valori: Any) -> int:
    """Ora ISO di YCloud («2026-11-23T21:25:00.000Z») → secondi Unix."""
    for v in valori:
        if not v:
            continue
        try:
            return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp())
        except ValueError:
            continue
    return int(time.time())


def _da_ycloud(m: Dict[str, Any]) -> Dict[str, Any]:
    """Messaggio YCloud → la forma Meta che capiscono _tipo_testo e _salva_messaggio."""
    tipo = m.get("type") or "unknown"
    out: Dict[str, Any] = {"id": m.get("wamid"), "type": tipo,
                           "timestamp": _ts_iso(m.get("sendTime"), m.get("createTime"))}
    if isinstance(m.get(tipo), dict):
        out[tipo] = m[tipo]
    return out


def _waba_giusto(conn, waba_id: Any, ricorda: bool = True) -> bool:
    """Gli eventi devono essere del nostro account WhatsApp: il primo che arriva lo fissa."""
    if not waba_id:
        return True
    atteso = _imp_get(conn, "wa_waba_id")
    if not atteso:
        if ricorda:
            _imp_set(conn, "wa_waba_id", str(waba_id))
        return True
    if str(waba_id) != atteso:
        logger.warning("WhatsApp/YCloud: evento per un altro account (%s), ignorato", waba_id)
        return False
    return True


def _ricorda_numero(conn, numero: Any) -> None:
    cifre = _cifre(numero)
    if cifre and not _imp_get(conn, "wa_numero"):
        _imp_set(conn, "wa_numero", "+" + cifre)


def _stato_sync_contatti(evento: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Le voci di rubrica di whatsapp.smb.app.state.sync. YCloud non documenta la forma:
    si cercano liste di oggetti con dentro «contact» (come nel campo Meta)."""
    trovate: List[Dict[str, Any]] = []

    def giro(x: Any) -> None:
        if isinstance(x, dict):
            if isinstance(x.get("contact"), dict):
                trovate.append(x)
                return
            for v in x.values():
                giro(v)
        elif isinstance(x, list):
            for v in x:
                giro(v)

    giro({k: v for k, v in evento.items() if k not in ("id", "type", "apiVersion", "createTime")})
    return trovate


def _elabora_evento_ycloud(conn, evento: Dict[str, Any]) -> tuple[int, Optional[str]]:
    """Un evento YCloud. Ritorna (messaggi nuovi, nota per il registro)."""
    tipo = str(evento.get("type") or "")

    if tipo in EVENTI_YCLOUD_MESSAGGIO:
        if tipo == "whatsapp.smb.history" and evento.get("progress") is not None:
            _imp_set(conn, "wa_storico_progresso", f"fase {evento.get('phase')} · {evento.get('progress')}%")
        entrata = evento.get("whatsappInboundMessage")
        uscita = evento.get("whatsappMessage")
        m = entrata if isinstance(entrata, dict) else uscita if isinstance(uscita, dict) else None
        if m is None:
            return 0, None  # solo avanzamento dello storico
        if not _waba_giusto(conn, m.get("wabaId")):
            return 0, "altro account"
        fonte = EVENTI_YCLOUD_MESSAGGIO[tipo]
        if m is entrata:
            numero = entrata.get("from")
            nome = (entrata.get("customerProfile") or {}).get("name")
            if nome:
                _salva_contatto(conn, numero, nome_profilo=nome)
            n = _salva_messaggio(conn, _da_ycloud(entrata), numero, "in", fonte)
            _ricorda_numero(conn, entrata.get("to"))
        else:
            if str(uscita.get("status") or "").lower() == "failed":
                return 0, "non partito"
            if not uscita.get("to"):
                return 0, "senza destinatario"
            n = _salva_messaggio(conn, _da_ycloud(uscita), uscita.get("to"), "out", fonte)
            _ricorda_numero(conn, uscita.get("from"))
        if tipo != "whatsapp.smb.history" and _imp_get(conn, "wa_scollegato"):
            _imp_set(conn, "wa_scollegato", "")  # arrivano messaggi: il collegamento è vivo
        return n, None

    if tipo == "whatsapp.smb.app.state.sync":
        voci = _stato_sync_contatti(evento)
        for v in voci:
            c = v.get("contact") or {}
            numero = c.get("phone_number") or c.get("phoneNumber")
            if str(v.get("action") or "").lower() == "remove":
                _salva_contatto(conn, numero, togli_rubrica=True)
            else:
                _salva_contatto(conn, numero, nome_rubrica=c.get("full_name") or c.get("fullName")
                                or c.get("first_name") or c.get("firstName"))
        return 0, (f"rubrica: {len(voci)} contatti" if voci else "rubrica: forma sconosciuta")

    acc = evento.get("whatsappBusinessAccount") or {}
    num = evento.get("whatsappPhoneNumber") or {}
    ora = f"{datetime.now():%Y-%m-%d %H:%M}"
    if tipo == "whatsapp.business_account.deleted":
        if not _waba_giusto(conn, acc.get("id"), ricorda=False):
            return 0, "altro account"
        motivo = str(acc.get("removedReason") or "ACCOUNT_REMOVED")
        _imp_set(conn, "wa_ultimo_account_update", f"{ora} account tolto: {motivo}")
        _imp_set(conn, "wa_scollegato", motivo)
        _avvisa_scollegato(motivo, "ycloud")
        return 0, motivo
    if tipo == "whatsapp.phone_number.deleted":
        if not _waba_giusto(conn, num.get("wabaId"), ricorda=False):
            return 0, "altro account"
        _imp_set(conn, "wa_ultimo_account_update", f"{ora} numero tolto")
        _imp_set(conn, "wa_scollegato", "PHONE_NUMBER_DELETED")
        _avvisa_scollegato("PHONE_NUMBER_DELETED", "ycloud")
        return 0, "numero tolto"
    if tipo == "whatsapp.business_account.updated":
        if not _waba_giusto(conn, acc.get("id"), ricorda=False):
            return 0, "altro account"
        ev = str(acc.get("updateEvent") or "")
        dettaglio = ev
        if ev == "DISABLED_UPDATE":
            dettaglio = f"{ev} {acc.get('banState') or ''}".strip()
            if acc.get("banState") == "DISABLE":
                _imp_set(conn, "wa_scollegato", "ACCOUNT_DISABLED")
                _avvisa_scollegato("ACCOUNT_DISABLED", "ycloud")
            elif acc.get("banState") == "REINSTATE":
                _imp_set(conn, "wa_scollegato", "")
        elif ev == "ACCOUNT_VIOLATION":
            dettaglio = f"{ev} {acc.get('violationType') or ''}".strip()
        _imp_set(conn, "wa_ultimo_account_update", f"{ora} {dettaglio}")
        return 0, dettaglio
    if tipo == "whatsapp.phone_number.quality_updated":
        if not _waba_giusto(conn, num.get("wabaId"), ricorda=False):
            return 0, "altro account"
        dettaglio = f"qualità {num.get('qualityRating') or '?'}"
        _imp_set(conn, "wa_ultimo_account_update", f"{ora} {dettaglio}")
        return 0, dettaglio
    return 0, "non usato"


def elabora_evento_ycloud(evento: Dict[str, Any]) -> Dict[str, Any]:
    """Salva un evento arrivato da YCloud. Ritorna {tipo, messaggi_nuovi}."""
    tipo = str(evento.get("type") or "?")
    nuovi = 0
    with _lock:
        conn = get_clienti_conn()
        try:
            try:
                _imp_set(conn, "wa_provider", "ycloud")
                nuovi, nota = _elabora_evento_ycloud(conn, evento)
                if not _imp_get(conn, "wa_collegato_at") and tipo in EVENTI_YCLOUD_MESSAGGIO:
                    _imp_set(conn, "wa_collegato_at", f"{datetime.now():%Y-%m-%d %H:%M:%S}")
                _imp_set(conn, "wa_ultimo_webhook_at", f"{datetime.now():%Y-%m-%d %H:%M:%S}")
                sconosciuta = nota == "rubrica: forma sconosciuta"
                conn.execute(
                    "INSERT INTO clienti_wa_eventi (campo, messaggi, esito, errore, payload) VALUES (?, ?, ?, ?, ?)",
                    (tipo[:200], nuovi, "da_capire" if sconosciuta else "ok", (nota or None) and nota[:500],
                     # la forma della rubrica non è documentata: si tiene il primo esempio per adattarsi
                     json.dumps(evento, ensure_ascii=False)[:50000] if sconosciuta else None),
                )
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.exception("WhatsApp/YCloud: evento non elaborato")
                conn.execute(
                    "INSERT INTO clienti_wa_eventi (campo, messaggi, esito, errore, payload) VALUES (?, 0, 'errore', ?, ?)",
                    (tipo[:200], str(e)[:500], json.dumps(evento, ensure_ascii=False)[:50000]),
                )
                conn.commit()
            _pulizia(conn)
        finally:
            conn.close()
    return {"tipo": tipo, "messaggi_nuovi": nuovi}


def _pulizia(conn, forza: bool = False) -> Dict[str, int]:
    """Cancella i messaggi oltre la conservazione e i registri vecchi. Al massimo una volta l'ora."""
    if not forza and time.time() - _ultima_pulizia["t"] < 3600:
        return {}
    _ultima_pulizia["t"] = time.time()
    giorni = conservazione_giorni(conn)
    limite = int(time.time()) - giorni * 86400
    m = conn.execute("DELETE FROM clienti_wa_messaggi WHERE ts < ?", (limite,)).rowcount
    e = conn.execute(
        "DELETE FROM clienti_wa_eventi WHERE ricevuto_at < datetime('now','localtime', ?)",
        (f"-{min(giorni, 30)} days",),
    ).rowcount
    conn.commit()
    return {"messaggi": m, "eventi": e}


# ============================================================
# LETTURA (giro del mattino, pagina, connettore MCP)
# ============================================================

def _piano(s: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def _mappa_clienti(conn) -> Dict[str, Dict[str, Any]]:
    """numero normalizzato → cliente TRGB (id, nome)."""
    out: Dict[str, Dict[str, Any]] = {}
    for r in conn.execute(
        "SELECT id, nome, cognome, telefono, telefono2 FROM clienti WHERE COALESCE(attivo,1) = 1"
    ):
        nome = " ".join(x for x in (r["nome"], r["cognome"]) if x).strip()
        for tel in (r["telefono"], r["telefono2"]):
            n = normalize_phone(tel) if tel else None
            if n and n not in out:
                out[n] = {"id": r["id"], "nome": nome}
    return out


def _quando(ts: Optional[int]) -> Optional[str]:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else None


def _info_numero(numero: str, contatti: Dict[str, Any], clienti: Dict[str, Any]) -> Dict[str, Any]:
    c = contatti.get(numero) or {}
    cl = clienti.get(numero)
    nome = (cl or {}).get("nome") or c.get("nome_rubrica") or c.get("nome_profilo")
    return {
        "nome": nome or None,
        "numero": "+" + numero,
        "cliente_id": (cl or {}).get("id"),
        "nome_rubrica": c.get("nome_rubrica"),
        "nome_whatsapp": c.get("nome_profilo"),
    }


def _contatti(conn) -> Dict[str, Dict[str, Any]]:
    return {r["numero"]: dict(r) for r in conn.execute("SELECT * FROM clienti_wa_contatti")}


def _aggiornamento(conn) -> Dict[str, Any]:
    provider = _imp_get(conn, "wa_provider") or ("meta" if _imp_get(conn, "wa_phone_number_id") else None)
    agganciato = bool(_imp_get(conn, "wa_phone_number_id")) or (provider == "ycloud" and bool(_imp_get(conn, "wa_waba_id")))
    return {
        "collegato": agganciato and not _imp_get(conn, "wa_scollegato"),
        "provider": provider,
        "numero": _imp_get(conn, "wa_numero"),
        "ultimo_webhook": _imp_get(conn, "wa_ultimo_webhook_at"),
        "scollegato": _imp_get(conn, "wa_scollegato") or None,
        "storico": _imp_get(conn, "wa_storico_progresso") or None,
        "storico_errore": _imp_get(conn, "wa_storico_errore") or None,
    }


def _parole(testo: Optional[str]) -> List[str]:
    """Parole (senza accenti, minuscole) ed emoji di un testo, in ordine."""
    piano = _piano(testo)
    out = re.findall(r"\w+", piano)
    out += [ch for ch in (testo or "") if unicodedata.category(ch) == "So"]
    return out


def regola_chiusura(conn=None) -> Dict[str, Any]:
    """Impostazioni delle chat «chiuse dal cliente»: parole ammesse e lunghezza massima."""
    chiudi = conn is None
    conn = conn or get_clienti_conn()
    try:
        testo = _imp_get(conn, "wa_chiusura_parole", CHIUSURA_PAROLE_DEFAULT)
        try:
            massimo = int(_imp_get(conn, "wa_chiusura_max_caratteri", str(CHIUSURA_MAX_DEFAULT)))
        except (TypeError, ValueError):
            massimo = CHIUSURA_MAX_DEFAULT
        parole = [p.strip() for p in (testo or "").split(",") if p.strip()]
        vocabolario = set()
        for p in parole:
            vocabolario.update(_parole(p))
        return {"parole": parole, "max_caratteri": massimo, "_vocabolario": vocabolario}
    finally:
        if chiudi:
            conn.close()


def e_chiusura(testo: Optional[str], regola: Dict[str, Any]) -> bool:
    """Un messaggio del cliente che chiude la chat: corto, senza domande, fatto solo di
    parole/emoji dell'elenco (es. «Grazie mille! 🙏», «ok perfetto»)."""
    t = (testo or "").strip()
    if not t or "?" in t or len(t) > regola["max_caratteri"]:
        return False
    parole = _parole(t)
    return bool(parole) and all(p in regola["_vocabolario"] for p in parole)


def imposta_chiusura(parole: List[str], max_caratteri: int) -> Dict[str, Any]:
    pulite = []
    for p in parole:
        p = " ".join((p or "").replace(",", " ").split())
        if p and p not in pulite:
            pulite.append(p[:40])
    if not pulite:
        raise ValueError("Serve almeno una parola")
    if len(pulite) > 100:
        raise ValueError("Al massimo 100 parole")
    if not 5 <= max_caratteri <= 200:
        raise ValueError("La lunghezza massima va da 5 a 200 caratteri")
    conn = get_clienti_conn()
    try:
        _imp_set(conn, "wa_chiusura_parole", ", ".join(pulite),
                 "WhatsApp: parole ed emoji che chiudono una chat (grazie, ok…): la chat va fra le «chiuse dal cliente»")
        _imp_set(conn, "wa_chiusura_max_caratteri", max_caratteri,
                 "WhatsApp: oltre questa lunghezza un messaggio non è mai una chiusura")
        conn.commit()
        r = regola_chiusura(conn)
        return {"parole": r["parole"], "max_caratteri": r["max_caratteri"]}
    finally:
        conn.close()


def conversazioni(giorni: int = 7, solo_da_rispondere: bool = False, limite: int = 100) -> Dict[str, Any]:
    """Le chat con almeno un messaggio negli ultimi `giorni`: ultimo messaggio del cliente,
    ultimo del locale e se tocca a noi rispondere. Prima quelle da rispondere, poi quelle
    «chiuse dal cliente» (dopo la nostra ultima risposta ha scritto solo grazie/ok/emoji,
    vedi regola_chiusura), poi le altre."""
    dal = int(time.time()) - giorni * 86400
    segnaposto = ",".join("?" * len(TIPI_SENZA_RISPOSTA))
    conn = get_clienti_conn()
    try:
        _pulizia(conn)
        numeri = [r["numero"] for r in conn.execute(
            "SELECT numero, MAX(ts) AS u FROM clienti_wa_messaggi WHERE ts >= ? GROUP BY numero ORDER BY u DESC",
            (dal,),
        )]
        contatti, clienti = _contatti(conn), _mappa_clienti(conn)
        regola = regola_chiusura(conn)
        ora = int(time.time())
        out = []
        for numero in numeri:
            ultimi = {}
            for direzione in ("in", "out"):
                ultimi[direzione] = conn.execute(
                    f"""SELECT ts, tipo, testo FROM clienti_wa_messaggi
                        WHERE numero = ? AND direzione = ? AND tipo NOT IN ({segnaposto})
                        ORDER BY ts DESC, id DESC LIMIT 1""",
                    (numero, direzione, *TIPI_SENZA_RISPOSTA),
                ).fetchone()
            suo, mio = ultimi["in"], ultimi["out"]
            if not suo and not mio:
                continue  # solo reazioni
            da_rispondere = bool(suo and (not mio or suo["ts"] > mio["ts"]))
            chiusa = False
            if da_rispondere:
                # tutti i messaggi del cliente dopo il nostro ultimo sono saluti/grazie → chiusa da lui
                dopo = conn.execute(
                    f"""SELECT testo FROM clienti_wa_messaggi
                        WHERE numero = ? AND direzione = 'in' AND ts > ? AND tipo NOT IN ({segnaposto})""",
                    (numero, mio["ts"] if mio else -1, *TIPI_SENZA_RISPOSTA),
                ).fetchall()
                chiusa = bool(dopo) and all(e_chiusura(r["testo"], regola) for r in dopo)
                da_rispondere = not chiusa
            if solo_da_rispondere and not da_rispondere:
                continue
            voce = _info_numero(numero, contatti, clienti)
            voce.update({
                "stato": ("da_rispondere" if da_rispondere else "chiusa_dal_cliente" if chiusa
                          else "risposto" if suo else "scritto_solo_io"),
                "ultimo_suo": {"quando": _quando(suo["ts"]), "testo": suo["testo"]} if suo else None,
                "ultimo_mio": {"quando": _quando(mio["ts"]), "testo": mio["testo"]} if mio else None,
                "attesa_ore": round((ora - suo["ts"]) / 3600, 1) if da_rispondere else None,
            })
            out.append(voce)
        ordine = {"da_rispondere": 0, "chiusa_dal_cliente": 1}
        out.sort(key=lambda v: (ordine.get(v["stato"], 2), -(v["attesa_ore"] or 0)))
        return {
            "periodo_giorni": giorni,
            "aggiornamento": _aggiornamento(conn),
            "da_rispondere": sum(1 for v in out if v["stato"] == "da_rispondere"),
            "chiuse_dal_cliente": sum(1 for v in out if v["stato"] == "chiusa_dal_cliente"),
            "conversazioni": out[:limite],
        }
    finally:
        conn.close()


def cerca(chi: Optional[str] = None, testo: Optional[str] = None, giorni: int = 180,
          limite_messaggi: int = 20) -> Dict[str, Any]:
    """Chat per nome (cliente TRGB, rubrica, nome WhatsApp) o numero, e/o per parole nel
    testo. Per ogni chat i messaggi più recenti, chi ha scritto e quando."""
    if not (chi or "").strip() and not (testo or "").strip():
        raise ValueError("Serve un nome, un numero o delle parole da cercare")
    dal = int(time.time()) - giorni * 86400
    conn = get_clienti_conn()
    try:
        contatti, clienti = _contatti(conn), _mappa_clienti(conn)
        numeri = [r["numero"] for r in conn.execute(
            "SELECT numero, MAX(ts) AS u FROM clienti_wa_messaggi WHERE ts >= ? GROUP BY numero ORDER BY u DESC",
            (dal,),
        )]
        if (chi or "").strip():
            cifre = _cifre(chi)
            parole = _piano(chi).split()
            scelti = []
            for numero in numeri:
                info = _info_numero(numero, contatti, clienti)
                nomi = _piano(" ".join(x for x in (info["nome"], info["nome_rubrica"], info["nome_whatsapp"]) if x))
                if (len(cifre) >= 5 and cifre in numero) or (not cifre and parole and all(p in nomi for p in parole)):
                    scelti.append(numero)
            numeri = scelti
        parole_testo = _piano(testo).split() if (testo or "").strip() else []
        out = []
        for numero in numeri:
            righe = conn.execute(
                """SELECT ts, direzione, tipo, testo FROM clienti_wa_messaggi
                   WHERE numero = ? AND ts >= ? ORDER BY ts DESC, id DESC""",
                (numero, dal),
            ).fetchall()
            if parole_testo:
                righe = [r for r in righe if all(p in _piano(r["testo"]) for p in parole_testo)]
            if not righe:
                continue
            voce = _info_numero(numero, contatti, clienti)
            voce["messaggi_trovati"] = len(righe)
            voce["messaggi"] = [
                {"quando": _quando(r["ts"]), "chi": "cliente" if r["direzione"] == "in" else "locale",
                 "testo": r["testo"]}
                for r in righe[:limite_messaggi]
            ]
            out.append(voce)
        return {"periodo_giorni": giorni, "aggiornamento": _aggiornamento(conn), "chat": out[:30]}
    finally:
        conn.close()


def stato() -> Dict[str, Any]:
    """Per la pagina Impostazioni › WhatsApp."""
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            "SELECT COUNT(*) AS n, COUNT(DISTINCT numero) AS chat, MIN(ts) AS dal FROM clienti_wa_messaggi"
        ).fetchone()
        eventi = [dict(e) for e in conn.execute(
            "SELECT ricevuto_at, campo, messaggi, esito, errore FROM clienti_wa_eventi ORDER BY id DESC LIMIT 15"
        )]
        return {
            "config": configurazione(),
            "aggiornamento": _aggiornamento(conn),
            "collegamento": {
                "waba_id": _imp_get(conn, "wa_waba_id"),
                "phone_number_id": _imp_get(conn, "wa_phone_number_id"),
                "nome": _imp_get(conn, "wa_nome"),
                "collegato_at": _imp_get(conn, "wa_collegato_at"),
                "esito": json.loads(_imp_get(conn, "wa_collegamento_esito", "null") or "null"),
                "ultimo_account_update": _imp_get(conn, "wa_ultimo_account_update"),
            },
            "archivio": {"messaggi": r["n"], "chat": r["chat"], "dal": _quando(r["dal"]),
                         "conservazione_giorni": conservazione_giorni(conn)},
            "chiusura": {k: v for k, v in regola_chiusura(conn).items() if not k.startswith("_")},
            "eventi": eventi,
        }
    finally:
        conn.close()


def imposta_conservazione(giorni: int) -> int:
    if not 7 <= giorni <= 730:
        raise ValueError("La conservazione va da 7 a 730 giorni")
    conn = get_clienti_conn()
    try:
        _imp_set(conn, "wa_conservazione_giorni", giorni)
        conn.commit()
        _pulizia(conn, forza=True)
        return giorni
    finally:
        conn.close()


# ============================================================
# COLLEGAMENTO (Embedded Signup, featureType whatsapp_business_app_onboarding)
# ============================================================

def _graph(metodo: str, percorso: str, token: Optional[str] = None,
           query: Optional[Dict[str, Any]] = None, corpo: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = _graph_url(percorso)
    if query:
        url += "?" + urllib.parse.urlencode(query)
    dati = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(url, data=dati, method=metodo)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if dati is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            msg = (json.loads(e.read().decode("utf-8")).get("error") or {}).get("message") or str(e)
        except Exception:
            msg = str(e)
        raise WhatsAppErroreMeta(e.code, msg) from None
    except urllib.error.URLError as e:
        raise WhatsAppErroreMeta(0, f"Meta non raggiungibile: {e.reason}") from None


def collega(code: str, waba_id: Optional[str] = None, phone_number_id: Optional[str] = None) -> Dict[str, Any]:
    """Dopo il «Collega WhatsApp» della pagina: scambia il codice (vale 30 secondi) col token
    del business, iscrive l'app ai webhook del numero e chiede a Meta rubrica e storico.
    Il token non si salva. Ogni passo ha il suo esito: uno che fallisce non ferma gli altri,
    tranne lo scambio del codice."""
    app_id, segreto = _env("WA_APP_ID"), _env("WA_APP_SECRET")
    if not app_id or not segreto:
        raise WhatsAppNonConfigurato("Mancano WA_APP_ID / WA_APP_SECRET nel .env del VPS")
    passi: List[Dict[str, Any]] = []

    def passo(nome: str, f):
        try:
            r = f()
            passi.append({"passo": nome, "esito": "ok", "dettaglio": r})
            return r
        except WhatsAppErroreMeta as e:
            passi.append({"passo": nome, "esito": "errore", "dettaglio": str(e)})
            return None

    tok = _graph("GET", "oauth/access_token",
                 query={"client_id": app_id, "client_secret": segreto, "code": code})
    token = tok.get("access_token")
    if not token:
        raise WhatsAppErroreMeta(0, "Meta non ha restituito il token")
    passi.append({"passo": "scambio codice", "esito": "ok", "dettaglio": None})

    if not waba_id:
        def _waba():
            d = _graph("GET", "debug_token", query={"input_token": token, "access_token": f"{app_id}|{segreto}"})
            for s in (d.get("data") or {}).get("granular_scopes") or []:
                if s.get("scope") == "whatsapp_business_management" and s.get("target_ids"):
                    return s["target_ids"][0]
            raise WhatsAppErroreMeta(0, "account WhatsApp Business non trovato nel token")
        waba_id = passo("trova account WhatsApp", _waba)
    if waba_id and not phone_number_id:
        def _numero():
            d = _graph("GET", f"{waba_id}/phone_numbers", token=token)
            if not d.get("data"):
                raise WhatsAppErroreMeta(0, "nessun numero nell'account")
            return d["data"][0]["id"]
        phone_number_id = passo("trova numero", _numero)
    if not (waba_id and phone_number_id):
        return {"ok": False, "passi": passi}

    passo("iscrizione ai webhook", lambda: _graph("POST", f"{waba_id}/subscribed_apps", token=token))
    info = passo("dati del numero", lambda: _graph(
        "GET", str(phone_number_id), token=token,
        query={"fields": "display_phone_number,verified_name,is_on_biz_app,platform_type"},
    )) or {}

    conn = get_clienti_conn()
    try:
        _imp_set(conn, "wa_waba_id", waba_id)
        _imp_set(conn, "wa_phone_number_id", phone_number_id)
        _imp_set(conn, "wa_numero", info.get("display_phone_number") or "")
        _imp_set(conn, "wa_nome", info.get("verified_name") or "")
        _imp_set(conn, "wa_collegato_at", f"{datetime.now():%Y-%m-%d %H:%M:%S}")
        _imp_set(conn, "wa_scollegato", "")
        _imp_set(conn, "wa_storico_errore", "")
        _imp_set(conn, "wa_storico_progresso", "")
        conn.commit()
    finally:
        conn.close()

    # Rubrica prima, poi storico (ordine della documentazione Meta). Una volta sola per collegamento,
    # entro 24 ore: il webhook deve essere già attivo, altrimenti lo storico si perde.
    for tipo, nome in (("smb_app_state_sync", "sincronizza rubrica"), ("history", "sincronizza storico")):
        passo(nome, lambda t=tipo: _graph("POST", f"{phone_number_id}/smb_app_data", token=token,
                                          corpo={"messaging_product": "whatsapp", "sync_type": t}))

    esito = {
        "ok": all(p["esito"] == "ok" for p in passi),
        "coexistence": bool(info.get("is_on_biz_app")),
        "platform_type": info.get("platform_type"),
        "numero": info.get("display_phone_number"),
        "passi": passi,
    }
    conn = get_clienti_conn()
    try:
        _imp_set(conn, "wa_collegamento_esito", json.dumps(esito, ensure_ascii=False, default=str))
        conn.commit()
    finally:
        conn.close()
    return esito
