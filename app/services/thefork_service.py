# Modulo: prenotazioni (integrazione TheFork B2B API) — [core]
# -*- coding: utf-8 -*-
"""
Integrazione TheFork Manager via B2B API — webhook + lettura dettagli.

Come funziona (docs.thefork.io/B2B-API):
1. TheFork fa POST su /prenotazioni/thefork/webhook?token=<segreto> per ogni
   reservationCreated/Updated, customerCreated/Updated (e recensioni, ignorate).
   Il payload ha solo entityType, eventType, uuid (+ groupUuid/restaurantUuid).
   TheFork NON firma i messaggi (niente HMAC): l'unica prova che arrivano da lui
   è il token nell'URL, che decidiamo noi e gli comunichiamo una volta.
2. L'evento entra in `prenotazioni_thefork_eventi` e si risponde 200 subito
   (dopo un 200 TheFork non riprova: se poi qualcosa fallisce, tocca a noi).
3. In background si leggono i dettagli con l'API (OAuth2 client credentials,
   token valido 8600 s, da NON richiedere prima della scadenza) e si scrive su
   `clienti_prenotazioni` e `clienti` con le stesse funzioni dell'import XLSX
   (`clienti_thefork_service`): stessi id (uuid), quindi nessun doppione con lo
   storico importato.

Configurazione (.env sul VPS, mai nel codice né nel DB):
  THEFORK_WEBHOOK_TOKEN    segreto nell'URL del webhook (obbligatorio)
  THEFORK_CLIENT_ID        credenziali B2B API date da TheFork
  THEFORK_CLIENT_SECRET
  THEFORK_RESTAURANT_UUID  facoltativo: scarta eventi di altri ristoranti e serve
                           alla sincronizzazione (se manca, si usa l'ultimo visto)
  THEFORK_API_URL          default https://api.thefork.io/manager
  THEFORK_AUTH_URL         default https://auth.thefork.io/oauth/token
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.clienti_db import get_clienti_conn
from app.services.notifiche_service import crea_notifica
from app.services.prenotazioni_doppioni_service import doppioni_di
from app.services.clienti_thefork_service import (
    aggiorna_tag_vip,
    collega_cliente_esistente,
    pulisci_telefono,
    trova_cliente_id,
    upsert_cliente,
    upsert_prenotazione,
)

logger = logging.getLogger("trgb.thefork")

WEBHOOK_PATH = "/prenotazioni/thefork/webhook"
_API_URL_DEFAULT = "https://api.thefork.io/manager"
_AUTH_URL_DEFAULT = "https://auth.thefork.io/oauth/token"
_AUDIENCE = "https://api.thefork.io"
_TIMEOUT = 20

STATI_DA_ELABORARE = ("ricevuto", "in_attesa", "errore")

# Una elaborazione alla volta: due eventi della stessa prenotazione nuova
# arrivano spesso a pochi ms (creata + aggiornata) e farebbero due INSERT.
_lock_elabora = threading.Lock()
_lock_token = threading.Lock()
_token_cache: Dict[str, Any] = {"token": None, "scade": 0.0}


class TheForkNonConfigurato(Exception):
    """Mancano le credenziali API nel .env."""


class TheForkErroreAPI(Exception):
    def __init__(self, status: int, messaggio: str):
        super().__init__(f"HTTP {status}: {messaggio}")
        self.status = status


# ============================================================
# CONFIGURAZIONE
# ============================================================

def _env(nome: str, default: str = "") -> str:
    return (os.getenv(nome) or default).strip()


def credenziali_presenti() -> bool:
    return bool(_env("THEFORK_CLIENT_ID") and _env("THEFORK_CLIENT_SECRET"))


def token_webhook_configurato() -> bool:
    return bool(_env("THEFORK_WEBHOOK_TOKEN"))


def verifica_token_webhook(token: Optional[str]) -> bool:
    atteso = _env("THEFORK_WEBHOOK_TOKEN")
    if not atteso or not token:
        return False
    return hmac.compare_digest(token.encode("utf-8"), atteso.encode("utf-8"))


def _locale_info() -> Dict[str, Any]:
    locale = _env("TRGB_LOCALE", "tregobbi") or "tregobbi"
    try:
        return json.loads(
            (Path(__file__).resolve().parents[2] / "locali" / locale / "locale.json").read_text(encoding="utf-8")
        )
    except (OSError, ValueError):
        return {}


def _url_pubblico() -> str:
    """Indirizzo pubblico del backend: TRGB_PUBLIC_URL o il dominio del locale."""
    url = _env("TRGB_PUBLIC_URL")
    if url:
        return url.rstrip("/")
    dominio = _locale_info().get("dominio")
    return f"https://{dominio}" if dominio else ""


def _fuso_locale():
    """Fuso del locale (locale.json «timezone»); se manca, quello del server."""
    nome = _locale_info().get("timezone")
    if nome:
        try:
            return ZoneInfo(nome)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return None


# ============================================================
# CLIENT API
# ============================================================

def _richiedi_token() -> str:
    corpo = urllib.parse.urlencode({
        "audience": _AUDIENCE,
        "grant_type": "client_credentials",
        "client_id": _env("THEFORK_CLIENT_ID"),
        "client_secret": _env("THEFORK_CLIENT_SECRET"),
    }).encode("utf-8")
    req = urllib.request.Request(
        _env("THEFORK_AUTH_URL", _AUTH_URL_DEFAULT),
        data=corpo,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            dati = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise TheForkErroreAPI(e.code, "token: " + e.read().decode("utf-8", "replace")[:300])
    except urllib.error.URLError as e:
        raise TheForkErroreAPI(0, f"token: {e.reason}")
    token = dati.get("access_token")
    if not token:
        raise TheForkErroreAPI(0, "token: risposta senza access_token")
    durata = float(dati.get("expires_in") or 8600)
    _token_cache["token"] = token
    _token_cache["scade"] = time.time() + durata - 120  # margine 2 minuti
    _token_cache["scope"] = dati.get("scope")
    return token


def _token() -> str:
    if not credenziali_presenti():
        raise TheForkNonConfigurato("credenziali B2B API non configurate (THEFORK_CLIENT_ID / THEFORK_CLIENT_SECRET)")
    with _lock_token:
        if _token_cache.get("token") and time.time() < _token_cache["scade"]:
            return _token_cache["token"]
        return _richiedi_token()


def api_get(percorso: str, params: Optional[Dict[str, Any]] = None, _riprova: bool = True) -> Optional[Dict[str, Any]]:
    """GET sull'API TheFork. None se 404 (entità non trovata)."""
    url = _env("THEFORK_API_URL", _API_URL_DEFAULT).rstrip("/") + percorso
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {_token()}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 401 and _riprova:
            # Token revocato o scaduto prima del previsto: uno nuovo, una volta sola
            _token_cache["token"] = None
            return api_get(percorso, params, _riprova=False)
        raise TheForkErroreAPI(e.code, e.read().decode("utf-8", "replace")[:300])
    except urllib.error.URLError as e:
        raise TheForkErroreAPI(0, str(e.reason))


def prova_connessione() -> Dict[str, Any]:
    """Chiede un token nuovo e riporta gli scope concessi."""
    if not credenziali_presenti():
        raise TheForkNonConfigurato("credenziali B2B API non configurate")
    with _lock_token:
        _richiedi_token()
    return {"ok": True, "scope": _token_cache.get("scope")}


# ============================================================
# MAPPATURE  API → tabelle TRGB (stessi formati dell'import XLSX)
# ============================================================

_PAESI = {
    "IT": "Italy", "CH": "Switzerland", "DE": "Germany", "FR": "France", "GB": "United Kingdom",
    "US": "United States", "ES": "Spain", "AT": "Austria", "NL": "Netherlands", "BE": "Belgium",
}


def _ora_locale(iso: Optional[str]) -> Optional[datetime]:
    """ISO 8601 (anche con Z) → ora del locale (come nell'export XLSX di TheFork Manager)."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.astimezone(_fuso_locale()) if dt.tzinfo else dt


def _fmt(dt: Optional[datetime], formato: str) -> Optional[str]:
    return dt.strftime(formato) if dt else None


def _unisci(lista: Any) -> Optional[str]:
    if not lista:
        return None
    voci = [str(x).strip() for x in lista if x is not None and str(x).strip()]
    return " | ".join(voci) or None


def _titolo(civility: Optional[str]) -> Optional[str]:
    if not civility:
        return None
    return " ".join(p if p == "and" else p.capitalize() for p in str(civility).split("_"))


def _nome_offerta(nome: Any) -> Optional[str]:
    if isinstance(nome, dict):
        for k in ("it_IT", "it", "en_GB", "en_US", "en"):
            if nome.get(k):
                return nome[k]
        valori = [v for v in nome.values() if v]
        return valori[0] if valori else None
    return nome or None


def mappa_cliente(c: Dict[str, Any]) -> Dict[str, Any]:
    """Cliente API → record `clienti` (colonne e formati dell'import XLSX)."""
    nascita = None
    if c.get("birthDate"):
        try:
            nascita = date.fromisoformat(str(c["birthDate"])[:10]).strftime("%d/%m/%Y")
        except ValueError:
            nascita = None
    paese = c.get("country")
    optins = c.get("optins") or {}
    return {
        "thefork_id": c.get("customerUuid"),
        "titolo": _titolo(c.get("civility")),
        "nome": (c.get("firstName") or "").strip(),
        "cognome": (c.get("lastName") or "").strip(),
        "email": c.get("email") or None,
        "telefono": pulisci_telefono(c.get("phone")),
        "telefono2": pulisci_telefono(c.get("secondaryPhone")),
        "data_nascita": nascita,
        "lingua": c.get("locale") or "it_IT",
        "indirizzo": c.get("address") or None,
        "cap": c.get("zipcode") or None,
        "citta": c.get("city") or None,
        "paese": _PAESI.get(str(paese).upper(), paese) if paese else None,
        "vip": 1 if c.get("isVip") else 0,
        "rank": str(c["rank"]).capitalize() if c.get("rank") else None,
        "promoter": 1 if c.get("isPromoter") else 0,
        "newsletter": 1 if optins.get("restaurantNewsletter") else 0,
        "risk_level": _unisci(c.get("riskLevel")),
        "pref_cibo": c.get("favFood") or None,
        "pref_bevande": c.get("favDrinks") or None,
        "pref_posto": c.get("favSeating") or None,
        "restrizioni_dietetiche": _unisci(c.get("dietaryRestrictions")),
        "allergie": _unisci(c.get("allergiesAndIntolerances")),
        "note_thefork": c.get("notes") or None,
        "origine": "thefork",
        "thefork_created": _fmt(_ora_locale(c.get("creationDate")), "%d/%m/%Y %H:%M:%S"),
        "thefork_updated": _fmt(_ora_locale(c.get("lastUpdateDate")), "%d/%m/%Y %H:%M:%S"),
    }


def _calcola_turno(ora: Optional[str], soglia: str) -> str:
    # Stessa regola di prenotazioni_router._calcola_turno
    if not ora:
        return "cena"
    return "pranzo" if ora[:5] < soglia else "cena"


def _soglia_turno(conn) -> str:
    row = conn.execute(
        "SELECT valore FROM prenotazioni_config WHERE chiave = 'soglia_pranzo_cena'"
    ).fetchone()
    return (row["valore"] if row and row["valore"] else "15:00")


def _campi_personalizzati(custom: Any) -> Dict[str, Any]:
    """Risposte ai campi del form TheFork → stesse colonne dell'import XLSX (match sull'etichetta)."""
    out: Dict[str, Any] = {}
    for f in custom or []:
        etichetta = str(f.get("label") or "").lower()
        valore = f.get("value")
        if valore is None or valore == "":
            continue
        if "degustazioni" in etichetta and "percorsi" in etichetta:
            out["degustazione"] = str(valore).strip()
        elif "allergie o intolleranze" in etichetta:
            out["allergie_segnalate"] = str(valore).strip()
        elif "tavolo esterno" in etichetta:
            out["tavolo_esterno"] = 1 if valore in (True, 1, "1", "true", "yes", "si", "sì") else 0
        elif "seggioloni" in etichetta:
            out["seggioloni"] = str(valore).strip()
    return out


def mappa_prenotazione(r: Dict[str, Any], soglia: str) -> Dict[str, Any]:
    """Prenotazione API → record `clienti_prenotazioni` (senza cliente_id/nome ospite)."""
    # mealDate: la documentazione dice «con l'offset del ristorante», ma in
    # produzione arriva in UTC (2026-10-16: tutte le cene 2 ore prima). Si
    # converte sempre nell'ora del locale: giusto in tutti e due i casi.
    meal_dt = _ora_locale(r.get("mealDate"))
    if meal_dt:
        data_pasto = meal_dt.strftime("%Y-%m-%d")
        ora_pasto = meal_dt.strftime("%H:%M:%S")
    else:
        meal = str(r.get("mealDate") or "")
        data_pasto = meal[:10] or None
        ora_pasto = meal[11:19] or None

    status = r.get("status")
    meal_status = r.get("mealStatus")
    # L'export XLSX ha un solo «Status»: l'avanzamento in sala se c'è, altrimenti lo stato
    if status in ("CANCELED", "NO_SHOW", "REFUSED", "REQUESTED") or not meal_status:
        stato = status or "RECORDED"
    else:
        stato = meal_status

    rec: Dict[str, Any] = {
        "thefork_booking_id": r.get("reservationUuid"),
        "thefork_customer_id": r.get("customerUuid"),
        "data_pasto": data_pasto,
        "ora_pasto": ora_pasto,
        "turno": _calcola_turno(ora_pasto, soglia),
        "stato": stato,
        "pax": r.get("partySize") or 2,
        "canale": r.get("reservationChannel"),
        "nota_ristorante": r.get("restaurantNote") or None,
        "nota_cliente": r.get("customerNote") or None,
        "data_prenotazione": _fmt(_ora_locale(r.get("createdAt")), "%Y-%m-%d %H:%M:%S"),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    # Tavoli: solo se TheFork ne ha assegnati, per non cancellare quelli dati in TRGB
    tavoli = [t.get("name") for t in (r.get("tables") or []) if t.get("name")]
    if tavoli:
        rec["tavolo"] = "+".join(str(t) for t in tavoli)

    conto = r.get("billAmount")
    if conto and conto.get("totalPrice") is not None:
        tot = conto["totalPrice"]
        tot = int(tot) if float(tot).is_integer() else tot
        rec["importo_conto"] = f"{tot} {conto.get('currency') or 'EUR'}".strip()

    offerta = r.get("offerDetails") or {}
    rec["menu_preset"] = _nome_offerta(offerta.get("name")) if offerta.get("offerType") == "presetMenu" else None
    rec["offerta_speciale"] = 1 if offerta.get("offerType") == "promotion" else 0

    garanzia = r.get("creditCardGuaranteeDetails")
    if garanzia:
        rec["imprint"] = 1
        amt = garanzia.get("amount")
        if amt is not None:
            amt = int(amt) if float(amt).is_integer() else amt
            rec["importo_imprint"] = f"{amt} {garanzia.get('currency') or 'EUR'}"

    rec.update(_campi_personalizzati(r.get("customFields")))
    return rec


# ============================================================
# REGISTRO EVENTI
# ============================================================

def registra_evento(payload: Dict[str, Any]) -> int:
    conn = get_clienti_conn()
    try:
        cur = conn.execute(
            """INSERT INTO prenotazioni_thefork_eventi
               (event_type, entity_type, uuid, group_uuid, restaurant_uuid, reservation_uuid, payload)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.get("eventType"), payload.get("entityType"), payload.get("uuid"),
                payload.get("groupUuid"), payload.get("restaurantUuid"), payload.get("reservationUuid"),
                json.dumps(payload, ensure_ascii=False)[:20000],
            ),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def _chiudi_evento(conn, evento_id: int, stato: str, esito: Optional[str] = None, errore: Optional[str] = None) -> None:
    conn.execute(
        """UPDATE prenotazioni_thefork_eventi
           SET stato = ?, esito = ?, ultimo_errore = ?, elaborato_at = datetime('now','localtime')
           WHERE id = ?""",
        (stato, esito, errore, evento_id),
    )
    conn.commit()


def _restaurant_uuid_atteso() -> Optional[str]:
    return _env("THEFORK_RESTAURANT_UUID") or None


def _uguale(a: Any, b: Any) -> bool:
    if a in (None, "") and b in (None, ""):
        return True
    return str(a) == str(b)


def _sincronizza_prenotazione(conn, uuid: str, solo_se_cambia: bool = False) -> str:
    r = api_get(f"/v1/reservations/{uuid}", {"include": "tables,creditCardGuaranteeDetails"})
    if r is None:
        return "IGNORATO: prenotazione non trovata su TheFork (404)"

    atteso = _restaurant_uuid_atteso()
    if atteso and r.get("restaurantUuid") and r["restaurantUuid"] != atteso:
        return "IGNORATO: prenotazione di un altro ristorante"

    rec = mappa_prenotazione(r, _soglia_turno(conn))
    if not rec.get("data_pasto"):
        raise ValueError("prenotazione senza mealDate")

    if solo_se_cambia:
        # Recupero periodico: se in TRGB è già tutto uguale non si tocca niente
        # (e non si chiede nemmeno il cliente a TheFork).
        gia = conn.execute(
            "SELECT * FROM clienti_prenotazioni WHERE thefork_booking_id = ?", (rec["thefork_booking_id"],)
        ).fetchone()
        if gia and all(_uguale(gia[k], v) for k, v in rec.items() if k != "updated_at" and k in gia.keys()):
            return "INVARIATA"

    cliente_id = None
    note_cliente = ""
    cust_uuid = r.get("customerUuid")
    if cust_uuid:
        c = api_get(f"/v1/customers/{cust_uuid}")
        if c:
            crec = mappa_cliente(c)
            collegato = collega_cliente_esistente(conn, crec)
            esito_c, cliente_id, n_diff = upsert_cliente(conn, crec)
            if collegato:
                esito_c = "già in TRGB, collegato"
            aggiorna_tag_vip(conn)
            rec["nome_ospite"] = crec["nome"] or None
            rec["cognome_ospite"] = crec["cognome"] or None
            note_cliente = f", cliente {esito_c} #{cliente_id}" + (f" ({n_diff} differenze da rivedere)" if n_diff else "")
        else:
            cliente_id = trova_cliente_id(conn, cust_uuid)
    rec["cliente_id"] = cliente_id

    gia = conn.execute(
        "SELECT 1 FROM clienti_prenotazioni WHERE thefork_booking_id = ?", (rec["thefork_booking_id"],)
    ).fetchone()
    if not gia:
        canale = rec.get("canale") or ""
        rec["fonte"] = "widget" if canale == "Booking Module" else "thefork"
        rec["prenotato_da"] = canale if canale in ("TheFork", "Booking Module") else None
        rec["creato_da"] = "thefork-api"

    esito, pid = upsert_prenotazione(conn, rec)
    conn.commit()
    testo = (f"prenotazione {esito} #{pid}: {rec['data_pasto']} {str(rec.get('ora_pasto') or '')[:5]}, "
             f"{rec['pax']} pax, {rec['stato']}{note_cliente}")

    # Già segnata a mano in TRGB? Si segnala, non si unisce.
    try:
        doppi = doppioni_di(conn, pid)
    except Exception as e:  # il controllo non deve mai bloccare la sincronizzazione
        logger.warning("controllo doppioni #%s: %s", pid, e)
        doppi = []
    if doppi:
        d = doppi[0]
        testo += f" — ⚠️ possibile doppione di #{d['id']} {d['ora']} {d['nome']} ({', '.join(d['motivi'])})"
        if esito == "inserita":
            try:
                crea_notifica(
                    tipo="prenotazioni",
                    titolo=f"Possibile doppione: {d['nome']} {rec['data_pasto']}",
                    messaggio=(f"Da TheFork è arrivata una prenotazione che sembra già inserita a mano "
                               f"({d['ora']}, {d['pax']} pax; uguale: {', '.join(d['motivi'])})."),
                    link=f"/prenotazioni/planning/{rec['data_pasto']}",
                    icona="⚠️",
                    modulo="prenotazioni",
                    entity_id=pid,
                    dest_ruolo="admin",
                )
            except Exception as e:
                logger.warning("notifica doppione #%s: %s", pid, e)
    return testo


def _sincronizza_cliente(conn, uuid: str) -> str:
    c = api_get(f"/v1/customers/{uuid}")
    if c is None:
        return "IGNORATO: cliente non trovato su TheFork (404)"
    crec = mappa_cliente(c)
    collegato = collega_cliente_esistente(conn, crec)
    esito, cid, n_diff = upsert_cliente(conn, crec)
    if collegato:
        esito = "già in TRGB, collegato"
    aggiorna_tag_vip(conn)
    conn.commit()
    return f"cliente {esito} #{cid}" + (f" ({n_diff} differenze da rivedere)" if n_diff else "")


def elabora_evento(evento_id: int) -> Dict[str, Any]:
    """Elabora un evento del registro. Non solleva: l'esito resta nella riga."""
    with _lock_elabora:
        conn = get_clienti_conn()
        try:
            ev = conn.execute("SELECT * FROM prenotazioni_thefork_eventi WHERE id = ?", (evento_id,)).fetchone()
            if not ev:
                return {"id": evento_id, "stato": "inesistente"}
            conn.execute(
                "UPDATE prenotazioni_thefork_eventi SET tentativi = tentativi + 1 WHERE id = ?", (evento_id,)
            )
            conn.commit()

            entita = (ev["entity_type"] or "").lower()
            atteso = _restaurant_uuid_atteso()
            if entita not in ("reservation", "customer"):
                _chiudi_evento(conn, evento_id, "ignorato", f"tipo {ev['entity_type']} / {ev['event_type']} non gestito")
            elif not ev["uuid"]:
                _chiudi_evento(conn, evento_id, "errore", errore="payload senza uuid")
            elif atteso and ev["restaurant_uuid"] and ev["restaurant_uuid"] != atteso:
                _chiudi_evento(conn, evento_id, "ignorato", "evento di un altro ristorante")
            elif not credenziali_presenti():
                _chiudi_evento(conn, evento_id, "in_attesa", errore="credenziali B2B API non ancora configurate")
            else:
                try:
                    if entita == "reservation":
                        esito = _sincronizza_prenotazione(conn, ev["uuid"])
                    else:
                        esito = _sincronizza_cliente(conn, ev["uuid"])
                    if esito.startswith("IGNORATO: "):
                        _chiudi_evento(conn, evento_id, "ignorato", esito[len("IGNORATO: "):])
                    else:
                        _chiudi_evento(conn, evento_id, "fatto", esito)
                except Exception as e:  # API giù, 429, dato strano: si riprova a mano
                    conn.rollback()
                    logger.warning("TheFork evento %s: %s", evento_id, e)
                    _chiudi_evento(conn, evento_id, "errore", errore=str(e)[:500])

            r = conn.execute(
                "SELECT id, stato, esito, ultimo_errore FROM prenotazioni_thefork_eventi WHERE id = ?", (evento_id,)
            ).fetchone()
            return dict(r)
        finally:
            conn.close()


def elabora_in_sospeso(limite: int = 500) -> Dict[str, Any]:
    """Rielabora gli eventi ricevuti/in attesa/in errore, dal più vecchio."""
    conn = get_clienti_conn()
    try:
        ids = [r["id"] for r in conn.execute(
            f"""SELECT id FROM prenotazioni_thefork_eventi
                WHERE stato IN ({','.join('?' * len(STATI_DA_ELABORARE))})
                ORDER BY id LIMIT ?""",
            (*STATI_DA_ELABORARE, limite),
        ).fetchall()]
    finally:
        conn.close()
    conteggio: Dict[str, int] = {}
    for i in ids:
        st = elabora_evento(i).get("stato", "?")
        conteggio[st] = conteggio.get(st, 0) + 1
    return {"elaborati": len(ids), "per_stato": conteggio}


def accoda_sincronizzazione(dal: str, al: str, filtro: str = "updatedDate", massimo: int = 2000) -> Dict[str, Any]:
    """
    Recupera le prenotazioni di un periodo (filtro: updatedDate | mealDate) e le
    mette nel registro come eventi «sincronizzazione». Serve per recuperare
    eventi persi (TheFork non riprova) e per il primo allineamento.
    """
    ristorante = _restaurant_uuid_atteso()
    if not ristorante:
        conn = get_clienti_conn()
        try:
            row = conn.execute(
                """SELECT restaurant_uuid FROM prenotazioni_thefork_eventi
                   WHERE restaurant_uuid IS NOT NULL ORDER BY id DESC LIMIT 1"""
            ).fetchone()
        finally:
            conn.close()
        ristorante = row["restaurant_uuid"] if row else None
    if not ristorante:
        raise ValueError("serve THEFORK_RESTAURANT_UUID nel .env (o almeno un evento ricevuto)")

    uuids: List[str] = []
    pagina = 1
    totale = 0
    while len(uuids) < massimo:
        dati = api_get("/v1/reservations", {
            "restaurantUuid": ristorante, "startDate": dal, "endDate": al,
            "filterBy": filtro, "limit": 100, "page": pagina,
        }) or {}
        blocco = dati.get("data") or []
        totale = int(dati.get("totalCount") or 0)
        uuids.extend(blocco)
        if not blocco or len(uuids) >= totale:
            break
        pagina += 1
    uuids = uuids[:massimo]

    for u in uuids:
        registra_evento({
            "entityType": "reservation", "eventType": "sincronizzazione",
            "uuid": u, "restaurantUuid": ristorante,
        })
    return {"accodate": len(uuids), "totale_su_thefork": totale, "troncato": totale > len(uuids)}


# ============================================================
# STATO PER LE IMPOSTAZIONI
# ============================================================

def stato_integrazione() -> Dict[str, Any]:
    conn = get_clienti_conn()
    try:
        per_stato = {r["stato"]: r["n"] for r in conn.execute(
            "SELECT stato, COUNT(*) AS n FROM prenotazioni_thefork_eventi GROUP BY stato"
        ).fetchall()}
        ultimo = conn.execute(
            "SELECT ricevuto_at, restaurant_uuid FROM prenotazioni_thefork_eventi ORDER BY id DESC LIMIT 1"
        ).fetchone()
        ultimo_webhook = conn.execute(
            """SELECT ricevuto_at FROM prenotazioni_thefork_eventi
               WHERE event_type IS NULL OR event_type NOT IN ('sincronizzazione', 'recupero_automatico')
               ORDER BY id DESC LIMIT 1"""
        ).fetchone()
    finally:
        conn.close()
    token = _env("THEFORK_WEBHOOK_TOKEN")
    base = _url_pubblico()
    return {
        "webhook_url": f"{base}{WEBHOOK_PATH}?token={token[:4]}…" if token else f"{base}{WEBHOOK_PATH}?token=…",
        "token_webhook_configurato": bool(token),
        "credenziali_presenti": credenziali_presenti(),
        "restaurant_uuid": _restaurant_uuid_atteso() or (ultimo["restaurant_uuid"] if ultimo else None),
        "eventi_per_stato": per_stato,
        "ultimo_evento_at": ultimo["ricevuto_at"] if ultimo else None,
        "ultimo_webhook_at": ultimo_webhook["ricevuto_at"] if ultimo_webhook else None,
        "recupero_automatico": {k: v for k, v in _stato_recupero.items() if k != "avviato"},
    }


def elenco_eventi(stato: Optional[str] = None, limite: int = 100) -> List[Dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        sql = """SELECT id, ricevuto_at, event_type, entity_type, uuid, stato, tentativi,
                        esito, ultimo_errore, elaborato_at
                 FROM prenotazioni_thefork_eventi"""
        args: List[Any] = []
        if stato:
            sql += " WHERE stato = ?"
            args.append(stato)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(max(1, min(int(limite), 500)))
        return [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()


# ============================================================
# RECUPERO AUTOMATICO PERIODICO
# ============================================================
# TheFork non rimanda un avviso perso (TRGB spento per un push o un riavvio).
# Ogni THEFORK_RECUPERO_MINUTI (default 60, 0 = spento) si rileggono le
# prenotazioni modificate su TheFork ieri e oggi e si sistemano solo quelle
# diverse da TRGB. Nel registro finiscono solo quelle corrette davvero.

_stato_recupero: Dict[str, Any] = {}


def recupero_automatico() -> Dict[str, Any]:
    if not credenziali_presenti():
        return {"saltato": "credenziali mancanti"}
    ristorante = _restaurant_uuid_atteso()
    if not ristorante:
        return {"saltato": "THEFORK_RESTAURANT_UUID mancante"}

    oggi = date.today()
    dal = date.fromordinal(oggi.toordinal() - 1).isoformat()
    uuids: List[str] = []
    pagina = 1
    while len(uuids) < 2000:
        dati = api_get("/v1/reservations", {
            "restaurantUuid": ristorante, "startDate": dal, "endDate": oggi.isoformat(),
            "filterBy": "updatedDate", "limit": 100, "page": pagina,
        }) or {}
        blocco = dati.get("data") or []
        uuids.extend(blocco)
        if not blocco or len(uuids) >= int(dati.get("totalCount") or 0):
            break
        pagina += 1

    corrette, errori = 0, 0
    for u in uuids:
        with _lock_elabora:
            conn = get_clienti_conn()
            try:
                try:
                    esito = _sincronizza_prenotazione(conn, u, solo_se_cambia=True)
                    stato, errore = "fatto", None
                except Exception as e:
                    conn.rollback()
                    esito, stato, errore = None, "errore", str(e)[:500]
                    errori += 1
                if esito == "INVARIATA":
                    continue
                if esito and esito.startswith("IGNORATO: "):
                    stato, esito = "ignorato", esito[len("IGNORATO: "):]
                elif stato == "fatto":
                    corrette += 1
                conn.execute(
                    """INSERT INTO prenotazioni_thefork_eventi
                       (event_type, entity_type, uuid, restaurant_uuid, payload, stato, tentativi,
                        esito, ultimo_errore, elaborato_at)
                       VALUES ('recupero_automatico', 'reservation', ?, ?, '{}', ?, 1, ?, ?, datetime('now','localtime'))""",
                    (u, ristorante, stato, esito, errore),
                )
                conn.commit()
            finally:
                conn.close()

    _stato_recupero.update({
        "ultimo": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "controllate": len(uuids), "corrette": corrette, "errori": errori,
    })
    return dict(_stato_recupero)


def avvia_recupero_periodico() -> None:
    """Thread di sfondo nel processo del backend (un solo worker uvicorn)."""
    try:
        minuti = int(_env("THEFORK_RECUPERO_MINUTI", "60") or 0)
    except ValueError:
        minuti = 60
    if minuti <= 0 or _stato_recupero.get("avviato"):
        return
    _stato_recupero["avviato"] = True
    _stato_recupero["ogni_minuti"] = minuti

    def _giro():
        time.sleep(300)  # lascia finire l'avvio del backend
        while True:
            try:
                if credenziali_presenti():
                    r = recupero_automatico()
                    logger.info("TheFork recupero automatico: %s", r)
            except Exception as e:
                logger.warning("TheFork recupero automatico: %s", e)
                _stato_recupero.update({"ultimo": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                        "errore": str(e)[:300]})
            time.sleep(minuti * 60)

    threading.Thread(target=_giro, name="thefork-recupero", daemon=True).start()
