# Modulo: platform (mattone M.A notifiche — push sui dispositivi) — [core]
# @version: v1.0 (2026-11-24) — fase 1: dispositivi, chiavi del locale, invio web push, push di prova
# -*- coding: utf-8 -*-
"""
Notifiche push sui dispositivi — TRGB Gestionale (mattone M.A)

Decisione di Marco, 24/11/2026: push vere dalla PWA adesso («la A»), app nativa come
obiettivo («la C»). Per questo il servizio è A CANALI: ogni dispositivo registrato ha un
canale (`webpush` oggi; `apns` quando ci sarà l'app Capacitor) e chi manda non sa quale.
Specifica: docs/spec_notifiche_push.md.

Fase 1 (questo file): ognuno attiva le notifiche sul proprio dispositivo e si manda una
push di prova. Le notifiche vere (crea_notifica) NON diventano ancora push: arriva con la
fase 2, insieme agli interruttori per tipo.

Web push senza librerie nuove: cifratura del messaggio (RFC 8291, aes128gcm) e firma del
mittente (VAPID, RFC 8292) con `cryptography`, che c'è già; l'invio con `httpx`.

Chiavi del locale (VAPID): generate da sole al primo uso e tenute in
`notifiche_push_config` — cifrate con TRGB_SECRET_KEY quando c'è (come le password delle
caselle), così in un backup non si leggono. Se TRGB_SECRET_KEY cambia non si decifrano
più: si toglie la riga `vapid_privata` e i dispositivi vanno riattivati.

Tabelle (notifiche.sqlite3, create al boot da init_notifiche_db):
  notifiche_dispositivi   un dispositivo di un utente: canale, indirizzo (endpoint web push
                          o, domani, token dell'app), chiavi, nome, esito dell'ultimo invio
  notifiche_push_config   chiave/valore: chiavi VAPID e i valori che Marco può cambiare
                          (ttl_ore, errori_max)
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import struct
import time
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.models.notifiche_db import get_notifiche_conn

logger = logging.getLogger(__name__)


class PushErrore(ValueError):
    """Richiesta non valida o push non configurabile: il messaggio è per chi usa l'app."""


# Valori che Marco può cambiare (notifiche_push_config): qui solo il valore di partenza.
#   ttl_ore     per quante ore il servizio push tiene una notifica se il dispositivo è spento
#   errori_max  dopo quanti invii falliti di fila un dispositivo viene messo «spento»
PREDEFINITI = {"ttl_ore": "12", "errori_max": "5"}

# I servizi push dei browser: TRGB chiama solo questi indirizzi (l'endpoint arriva dal
# dispositivo, non va seguito alla cieca).
SERVIZI_PUSH = (
    "fcm.googleapis.com",             # Chrome, Edge su Android, Samsung
    ".push.apple.com",                # Safari, iPhone e iPad (web.push.apple.com)
    ".push.services.mozilla.com",     # Firefox
    ".notify.windows.com",            # Edge su Windows
)

# Limiti del protocollo, non scelte: un messaggio web push cifrato sta in 4096 byte.
_MAX_CARICO = 3000
_DURATA_FIRMA = 12 * 3600   # la firma VAPID può valere al massimo 24 ore


# ---------------------------------------------------------------------------
# Utilità
# ---------------------------------------------------------------------------

def _b64u(dati: bytes) -> str:
    return base64.urlsafe_b64encode(dati).rstrip(b"=").decode()


def _b64u_dec(testo: str) -> bytes:
    testo = (testo or "").strip()
    return base64.urlsafe_b64decode(testo + "=" * (-len(testo) % 4))


def _hmac(chiave: bytes, dati: bytes) -> bytes:
    h = hmac.HMAC(chiave, hashes.SHA256())
    h.update(dati)
    return h.finalize()


def _impronta(indirizzo: str) -> str:
    """Per riconoscere «questo dispositivo» senza far girare l'indirizzo intero."""
    return hashlib.sha256((indirizzo or "").encode()).hexdigest()[:16]


def _nome_da_ua(ua: Optional[str]) -> str:
    ua = ua or ""
    for parola, nome in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"),
                         ("Macintosh", "Mac"), ("Windows", "Windows"), ("Linux", "Linux")):
        if parola in ua:
            return nome
    return "Dispositivo"


# ---------------------------------------------------------------------------
# Impostazioni e chiavi del locale
# ---------------------------------------------------------------------------

def _cfg_get(conn, chiave: str) -> Optional[str]:
    r = conn.execute("SELECT valore FROM notifiche_push_config WHERE chiave = ?", (chiave,)).fetchone()
    return r["valore"] if r else None


def _cfg_set(conn, chiave: str, valore: str) -> None:
    conn.execute(
        "INSERT INTO notifiche_push_config (chiave, valore) VALUES (?, ?) "
        "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore, "
        "aggiornato_il = datetime('now','localtime')", (chiave, valore))


def _numero(conn, chiave: str) -> int:
    try:
        return max(1, int(_cfg_get(conn, chiave) or PREDEFINITI[chiave]))
    except (TypeError, ValueError):
        return int(PREDEFINITI[chiave])


def _fernet():
    try:
        from app.services import email_service
        return email_service._fernet()
    except Exception:  # pragma: no cover - servizio email non importabile
        return None


def _custodisci(pem: str) -> str:
    f = _fernet()
    return "fernet:" + f.encrypt(pem.encode()).decode() if f else "chiaro:" + pem


def _riapri(valore: str) -> str:
    if valore.startswith("chiaro:"):
        return valore[len("chiaro:"):]
    if valore.startswith("fernet:"):
        f = _fernet()
        if not f:
            raise PushErrore("Le chiavi delle notifiche sono cifrate ma manca TRGB_SECRET_KEY nel .env.")
        try:
            return f.decrypt(valore[len("fernet:"):].encode()).decode()
        except Exception:
            raise PushErrore("Le chiavi delle notifiche non si decifrano: TRGB_SECRET_KEY è cambiata?") from None
    raise PushErrore("Chiavi delle notifiche in un formato sconosciuto.")


def _chiave_locale(conn) -> ec.EllipticCurvePrivateKey:
    """La chiave privata VAPID del locale; la prima volta la genera. INSERT OR IGNORE:
    se due processi partono insieme vince una sola e tutti rileggono quella."""
    salvata = _cfg_get(conn, "vapid_privata")
    if not salvata:
        nuova = ec.generate_private_key(ec.SECP256R1())
        pem = nuova.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                  serialization.NoEncryption()).decode()
        conn.execute("INSERT OR IGNORE INTO notifiche_push_config (chiave, valore) VALUES ('vapid_privata', ?)",
                     (_custodisci(pem),))
        conn.commit()
        salvata = _cfg_get(conn, "vapid_privata")
    return serialization.load_pem_private_key(_riapri(salvata).encode(), password=None)


def _pubblica_b64(priv: ec.EllipticCurvePrivateKey) -> str:
    return _b64u(priv.public_key().public_bytes(serialization.Encoding.X962,
                                                serialization.PublicFormat.UncompressedPoint))


def _soggetto() -> str:
    """Chi manda, per il servizio push: l'indirizzo del gestionale (TRGB_APP_URL, poi
    locale.json «dominio_app», poi «dominio»)."""
    url = os.environ.get("TRGB_APP_URL", "").strip()
    if not url:
        try:
            from app.utils.locale_data import locale_info
            info = locale_info()
            dom = str(info.get("dominio_app") or info.get("dominio") or "").strip()
        except Exception:
            dom = ""
        url = (dom if dom.startswith("http") else f"https://{dom}") if dom else ""
    if not url:
        raise PushErrore("Manca l'indirizzo del gestionale (TRGB_APP_URL o «dominio_app» in locale.json).")
    return url.rstrip("/")


# ---------------------------------------------------------------------------
# Web push: cifratura (RFC 8291) e firma del mittente (VAPID, RFC 8292)
# ---------------------------------------------------------------------------

def cifra(testo: bytes, p256dh: bytes, auth: bytes, *,
          chiave_as: Optional[ec.EllipticCurvePrivateKey] = None,
          salt: Optional[bytes] = None) -> bytes:
    """Il corpo della richiesta al servizio push (Content-Encoding: aes128gcm).
    `chiave_as` e `salt` si passano solo nelle prove, per rifare l'esempio dell'RFC."""
    ua_pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), p256dh)
    as_priv = chiave_as or ec.generate_private_key(ec.SECP256R1())
    as_pub = as_priv.public_key().public_bytes(serialization.Encoding.X962,
                                               serialization.PublicFormat.UncompressedPoint)
    salt = salt or os.urandom(16)
    segreto = as_priv.exchange(ec.ECDH(), ua_pub)
    prk_chiave = _hmac(auth, segreto)
    ikm = _hmac(prk_chiave, b"WebPush: info\x00" + p256dh + as_pub + b"\x01")
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    cifrato = AESGCM(cek).encrypt(nonce, testo + b"\x02", None)   # \x02 = ultimo record
    return salt + struct.pack(">IB", 4096, len(as_pub)) + as_pub + cifrato


def firma_vapid(indirizzo: str, priv: ec.EllipticCurvePrivateKey, soggetto: str,
                ora: Optional[float] = None) -> str:
    """Intestazione Authorization: dice al servizio push chi sta mandando."""
    u = urlsplit(indirizzo)
    testa = _b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    corpo = _b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}",
                              "exp": int(ora if ora is not None else time.time()) + _DURATA_FIRMA,
                              "sub": soggetto}, separators=(",", ":")).encode())
    r, s = decode_dss_signature(priv.sign(f"{testa}.{corpo}".encode(), ec.ECDSA(hashes.SHA256())))
    firma = _b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={testa}.{corpo}.{firma}, k={_pubblica_b64(priv)}"


def _carico(titolo: str, corpo: str, link: str, tag: Optional[str]) -> bytes:
    """Quello che il service worker riceve. Il link è sempre una pagina del gestionale."""
    link = link if (link or "").startswith("/") and not (link or "").startswith("//") else "/"
    corpo = corpo or ""
    while True:
        d: Dict[str, Any] = {"titolo": (titolo or "TRGB")[:120], "corpo": corpo, "link": link}
        if tag:
            d["tag"] = str(tag)[:60]
        dati = json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode()
        if len(dati) <= _MAX_CARICO or not corpo:
            return dati
        corpo = corpo[: max(0, len(corpo) - 200)].rstrip() + "…"


def _spedisci(url: str, corpo: bytes, intestazioni: Dict[str, str]) -> tuple:
    """La chiamata vera al servizio push. Sostituita nelle prove."""
    import httpx
    r = httpx.post(url, content=corpo, headers=intestazioni, timeout=10)
    return r.status_code, (r.text or "")[:200]


def _manda_webpush(conn, d: Dict[str, Any], carico: bytes) -> tuple:
    priv = _chiave_locale(conn)
    corpo = cifra(carico, _b64u_dec(d["p256dh"]), _b64u_dec(d["auth"]))
    return _spedisci(d["indirizzo"], corpo, {
        "Authorization": firma_vapid(d["indirizzo"], priv, _soggetto()),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(_numero(conn, "ttl_ore") * 3600),
    })


# Un canale = una funzione (conn, dispositivo, carico) → (codice HTTP, testo).
# L'app nativa aggiungerà qui «apns» senza toccare chi chiama manda_a_utente.
CANALI: Dict[str, Callable] = {"webpush": _manda_webpush}


# ---------------------------------------------------------------------------
# Dispositivi
# ---------------------------------------------------------------------------

def _servizio_noto(indirizzo: str) -> bool:
    u = urlsplit(indirizzo or "")
    host = (u.hostname or "").lower()
    if u.scheme != "https" or not host:
        return False
    return any(host == s.lstrip(".") or host.endswith(s if s.startswith(".") else "." + s)
               for s in SERVIZI_PUSH)


def _pubblico(r) -> Dict[str, Any]:
    return {"id": r["id"], "nome": r["nome"], "canale": r["canale"], "attivo": bool(r["attivo"]),
            "impronta": _impronta(r["indirizzo"]), "creato_il": r["creato_il"],
            "visto_il": r["visto_il"], "ultimo_ok": r["ultimo_ok"], "ultimo_errore": r["ultimo_errore"]}


def dispositivi(username: str) -> List[Dict[str, Any]]:
    conn = get_notifiche_conn()
    try:
        righe = conn.execute("SELECT * FROM notifiche_dispositivi WHERE username = ? ORDER BY creato_il",
                             (username,)).fetchall()
        return [_pubblico(r) for r in righe]
    finally:
        conn.close()


def stato(username: str) -> Dict[str, Any]:
    """Quello che serve alla pagina: la chiave pubblica del locale per iscriversi e i
    dispositivi dell'utente. Se le chiavi non si aprono, `errore` dice perché."""
    conn = get_notifiche_conn()
    try:
        try:
            chiave, errore = _pubblica_b64(_chiave_locale(conn)), None
        except PushErrore as e:
            chiave, errore = None, str(e)
        righe = conn.execute("SELECT * FROM notifiche_dispositivi WHERE username = ? ORDER BY creato_il",
                             (username,)).fetchall()
        return {"chiave_pubblica": chiave, "errore": errore, "dispositivi": [_pubblico(r) for r in righe]}
    finally:
        conn.close()


def registra(username: str, iscrizione: Dict[str, Any], nome: Optional[str] = None,
             user_agent: Optional[str] = None) -> Dict[str, Any]:
    """Registra (o aggiorna) il dispositivo da cui l'utente ha attivato le notifiche.
    `iscrizione` è quella del browser: {endpoint, keys: {p256dh, auth}}. Lo stesso
    dispositivo che si iscrive di nuovo, anche con un altro utente, aggiorna la sua riga."""
    iscrizione = iscrizione or {}
    indirizzo = str(iscrizione.get("endpoint") or "").strip()
    chiavi = iscrizione.get("keys") or {}
    p256dh, auth = str(chiavi.get("p256dh") or "").strip(), str(chiavi.get("auth") or "").strip()
    if not _servizio_noto(indirizzo):
        raise PushErrore("Indirizzo di notifica non riconosciuto: questo browser non è fra quelli supportati.")
    try:
        ok = len(_b64u_dec(p256dh)) == 65 and _b64u_dec(p256dh)[0] == 4 and len(_b64u_dec(auth)) == 16
    except Exception:
        ok = False
    if not ok:
        raise PushErrore("Iscrizione del dispositivo non valida: riprova ad attivare le notifiche.")
    nome = (nome or "").strip()[:60] or _nome_da_ua(user_agent)
    conn = get_notifiche_conn()
    try:
        conn.execute("""
            INSERT INTO notifiche_dispositivi (username, canale, indirizzo, p256dh, auth, nome, user_agent)
            VALUES (?, 'webpush', ?, ?, ?, ?, ?)
            ON CONFLICT(indirizzo) DO UPDATE SET
                username = excluded.username, p256dh = excluded.p256dh, auth = excluded.auth,
                nome = excluded.nome, user_agent = excluded.user_agent,
                visto_il = datetime('now','localtime'), attivo = 1, errori_di_fila = 0, ultimo_errore = NULL
        """, (username, indirizzo, p256dh, auth, nome, (user_agent or "")[:300]))
        conn.commit()
        r = conn.execute("SELECT * FROM notifiche_dispositivi WHERE indirizzo = ?", (indirizzo,)).fetchone()
        return _pubblico(r)
    finally:
        conn.close()


def togli(username: str, dispositivo_id: int) -> bool:
    """Toglie un dispositivo dell'utente (solo i suoi)."""
    conn = get_notifiche_conn()
    try:
        cur = conn.execute("DELETE FROM notifiche_dispositivi WHERE id = ? AND username = ?",
                           (dispositivo_id, username))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Invio
# ---------------------------------------------------------------------------

def manda_a_utente(username: str, titolo: str, corpo: str = "", link: str = "/",
                   tag: Optional[str] = None) -> Dict[str, Any]:
    """Manda una push a tutti i dispositivi accesi dell'utente. Non solleva per un
    dispositivo che fallisce: lo scrive sulla riga e va avanti. Un dispositivo che il
    servizio push dà per sparito (404/410) viene tolto; dopo `errori_max` invii falliti
    di fila viene spento (si riaccende riattivando le notifiche da lì)."""
    conn = get_notifiche_conn()
    esito = {"dispositivi": 0, "mandate": 0, "fallite": 0, "tolte": 0, "errori": []}
    try:
        righe = conn.execute("SELECT * FROM notifiche_dispositivi WHERE username = ? AND attivo = 1",
                             (username,)).fetchall()
        esito["dispositivi"] = len(righe)
        if not righe:
            return esito
        carico = _carico(titolo, corpo, link, tag)
        errori_max = _numero(conn, "errori_max")
        for r in righe:
            d = dict(r)
            canale = CANALI.get(d["canale"])
            try:
                if not canale:
                    raise PushErrore(f"canale «{d['canale']}» non disponibile")
                codice, testo = canale(conn, d, carico)
            except PushErrore as e:   # configurazione, non rete: il messaggio basta da solo
                codice, testo = -1, str(e)
            except Exception as e:  # rete, servizio push giù
                codice, testo = 0, f"{type(e).__name__}: {e}"[:200]
            if codice in (200, 201, 202, 204):
                conn.execute("UPDATE notifiche_dispositivi SET ultimo_ok = datetime('now','localtime'), "
                             "errori_di_fila = 0, ultimo_errore = NULL WHERE id = ?", (d["id"],))
                esito["mandate"] += 1
            elif codice in (404, 410):
                conn.execute("DELETE FROM notifiche_dispositivi WHERE id = ?", (d["id"],))
                esito["tolte"] += 1
            else:
                errore = (testo if codice < 0 else f"{codice or 'rete'} {testo}").strip()[:300]
                conn.execute("UPDATE notifiche_dispositivi SET errori_di_fila = errori_di_fila + 1, "
                             "ultimo_errore = ?, attivo = CASE WHEN errori_di_fila + 1 >= ? THEN 0 ELSE 1 END "
                             "WHERE id = ?", (errore, errori_max, d["id"]))
                esito["fallite"] += 1
                esito["errori"].append({"dispositivo": d["nome"], "errore": errore})
                logger.warning("push non mandata a %s (%s): %s", username, d["nome"], errore)
            conn.commit()
        return esito
    finally:
        conn.close()


def prova(username: str) -> Dict[str, Any]:
    """La push di prova del tasto «Prova»: arriva su tutti i dispositivi accesi dell'utente."""
    return manda_a_utente(username, "Notifica di prova",
                          "Le notifiche su questo dispositivo funzionano.", "/", tag="prova")
