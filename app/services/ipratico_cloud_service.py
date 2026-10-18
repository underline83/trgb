# Modulo: cassa (lettura conti da iPratico Cloud) — [core]
# -*- coding: utf-8 -*-
"""
iPratico Cloud — scarico dei conti chiusi, riga per riga.

Cosa legge e perché così (analisi completa: docs/analisi_ipratico_cloud.md):
il back office web di iPratico (www.ipraticocloud.com) non calcola niente da
solo: ogni pagina chiede i dati a un'API interna (`apiportal.ipraticocloud.com`)
con l'header `Authorization: <token utente>`. Il token è scritto nella pagina
dopo il login (`window.idUsr`) e CAMBIA A OGNI LOGIN (verificato 2026-10-18).
Quindi qui si fa il login come un utente, si prende il token e si chiama l'API.

ATTENZIONE: non è un'API pubblica né documentata. Può cambiare senza preavviso.
Se cambia, lo scarico fallisce e lo dice (cassa_import_log + stato), senza
toccare i conti già salvati.

Endpoint usato: GET /statistics/closed-payment-sessions
  channel=lct_<id locale>, application=eat, training=0,
  dateFrom='AAAA-MM-GG 00:00:00', dateTo='AAAA-MM-GG 23:59:59'
Ogni «payment session» è uno scontrino/fattura. Più scontrini con lo stesso
orderId = un conto pagato alla romana: qui diventano UN conto.

Configurazione (.env sul VPS, mai nel codice né nel DB):
  IPRATICO_CLOUD_EMAIL       utente del back office (consigliato un utente
                             dedicato a TRGB, con i soli permessi di lettura)
  IPRATICO_CLOUD_PASSWORD
  IPRATICO_CLOUD_LOCALE      facoltativo, es. lct_10254 (se manca: il primo
                             locale dell'account)
  IPRATICO_CLOUD_ORA         ora dello scarico notturno, default 05:30
                             («0» o vuoto con IPRATICO_CLOUD_NOTTE=0 = spento)
  IPRATICO_CLOUD_GIORNI      quanti giorni indietro riscaricare ogni notte, default 2
  IPRATICO_CLOUD_URL         default https://www.ipraticocloud.com
"""

from __future__ import annotations

import http.cookiejar
import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.cassa_conti_db import get_cassa_conti_conn

logger = logging.getLogger("trgb.ipratico_cloud")

_URL_DEFAULT = "https://www.ipraticocloud.com"
_TIMEOUT = 90
_UA = "Mozilla/5.0 (TRGB gestionale; lettura conti)"
MAX_GIORNI_PERIODO = 1000          # guardia: un periodo più lungo si fa in più volte
PAUSA_TRA_GIORNI_S = 1.0           # gentilezza verso il loro server negli scarichi lunghi

_lock_sessione = threading.Lock()
_lock_scarico = threading.Lock()
_sessione: Dict[str, Any] = {"token": None, "api": None, "canale": None, "quando": 0.0}
_stato_periodo: Dict[str, Any] = {}
_stato_notte: Dict[str, Any] = {}


class IpraticoNonConfigurato(Exception):
    """Mancano le credenziali nel .env."""


class IpraticoErrore(Exception):
    """Login rifiutato, API cambiata o non raggiungibile."""


# ============================================================
# CONFIGURAZIONE
# ============================================================

def _env(nome: str, default: str = "") -> str:
    return (os.getenv(nome) or default).strip()


def configurato() -> bool:
    return bool(_env("IPRATICO_CLOUD_EMAIL") and _env("IPRATICO_CLOUD_PASSWORD"))


def _base() -> str:
    return _env("IPRATICO_CLOUD_URL", _URL_DEFAULT).rstrip("/")


def _fuso():
    """Fuso del locale (locale.json «timezone»), poi Europe/Rome."""
    locale = _env("TRGB_LOCALE", "tregobbi") or "tregobbi"
    try:
        info = json.loads(
            (Path(__file__).resolve().parents[2] / "locali" / locale / "locale.json").read_text(encoding="utf-8")
        )
        if info.get("timezone"):
            return ZoneInfo(info["timezone"])
    except (OSError, ValueError, ZoneInfoNotFoundError):
        pass
    return ZoneInfo("Europe/Rome")


# ============================================================
# LOGIN E CHIAMATE
# ============================================================

def _login() -> Dict[str, Any]:
    """Login come dal browser: pagina di login (CSRF) → POST → pagina con il token."""
    if not configurato():
        raise IpraticoNonConfigurato("credenziali iPratico Cloud non configurate (IPRATICO_CLOUD_EMAIL / IPRATICO_CLOUD_PASSWORD)")
    base = _base()
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", _UA), ("Accept-Language", "it-IT,it;q=0.9")]
    try:
        html = opener.open(f"{base}/it/auth/login", timeout=_TIMEOUT).read().decode("utf-8", "replace")
        m = re.search(r'name="_token"\s+value="([^"]+)"', html)
        if not m:
            raise IpraticoErrore("pagina di login cambiata: manca il campo _token")
        corpo = urllib.parse.urlencode({
            "_token": m.group(1), "u": "",
            "email": _env("IPRATICO_CLOUD_EMAIL"), "password": _env("IPRATICO_CLOUD_PASSWORD"),
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{base}/it/auth/login", data=corpo, method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": f"{base}/it/auth/login"},
        )
        opener.open(req, timeout=_TIMEOUT).read()
        pagina = opener.open(f"{base}/it/locale", timeout=_TIMEOUT).read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise IpraticoErrore(f"login: HTTP {e.code}")
    except urllib.error.URLError as e:
        raise IpraticoErrore(f"login: {e.reason}")

    tok = re.search(r'window\.idUsr\s*=\s*"([^"]+)"', pagina)
    if not tok:
        if 'id="loginForm"' in pagina:
            raise IpraticoErrore("login rifiutato: controllare email e password")
        raise IpraticoErrore("pagina cambiata: token non trovato dopo il login")
    api = re.search(r'window\.couchbaseApiHost\s*=\s*"([^"]+)"', pagina)
    api_host = api.group(1).replace("\\/", "/") if api else "https://apiportal.ipraticocloud.com"
    canale = _env("IPRATICO_CLOUD_LOCALE")
    if not canale:
        lct = re.search(r'id_lct(?:&quot;|\\?")\s*:\s*(\d+)', pagina)
        if not lct:
            raise IpraticoErrore("locale non trovato: impostare IPRATICO_CLOUD_LOCALE (es. lct_10254)")
        canale = f"lct_{lct.group(1)}"
    return {"token": tok.group(1), "api": api_host.rstrip("/"), "canale": canale, "quando": time.time()}


def _sessione_valida(forza: bool = False) -> Dict[str, Any]:
    with _lock_sessione:
        if forza or not _sessione.get("token"):
            _sessione.update(_login())
        return dict(_sessione)


def _api_get(percorso: str, params: Dict[str, Any]) -> Any:
    """GET sull'API interna; su 401 rifà il login una volta."""
    for tentativo in (0, 1):
        s = _sessione_valida(forza=bool(tentativo))
        q = urllib.parse.urlencode({**params, "channel": params.get("channel") or s["canale"]})
        req = urllib.request.Request(
            f"{s['api']}{percorso}?{q}",
            headers={"Authorization": s["token"], "Accept": "application/json", "User-Agent": _UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401 and tentativo == 0:
                continue
            raise IpraticoErrore(f"{percorso}: HTTP {e.code}")
        except urllib.error.URLError as e:
            raise IpraticoErrore(f"{percorso}: {e.reason}")
        except ValueError:
            raise IpraticoErrore(f"{percorso}: risposta non JSON (API cambiata?)")
    raise IpraticoErrore(f"{percorso}: accesso rifiutato anche dopo un nuovo login")


def prova_accesso() -> Dict[str, Any]:
    """Login + lettura di sale e tavoli: dice se tutto risponde."""
    s = _sessione_valida(forza=True)
    sale = _api_get("/rooms", {"application": "eat"}) or []
    tavoli = _api_get("/tables", {"application": "eat"}) or []
    return {
        "ok": True, "locale": s["canale"], "api": s["api"],
        "sale": sorted({(x.get("value") or {}).get("name") or "" for x in sale} - {""}),
        "tavoli": len(tavoli),
    }


# ============================================================
# TRADUZIONE: payment sessions → conti
# ============================================================

def _ora(iso: Optional[str], fuso) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(fuso)


def _fmt(dt: Optional[datetime]) -> Optional[str]:
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else None


def _num(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _riga(item: Dict[str, Any], fuso) -> Optional[Dict[str, Any]]:
    if item.get("itemType") == "dutchItem":      # «1 Menu» degli scontrini alla romana: non è un piatto
        return None
    prodotto = item.get("product") or {}
    categoria = prodotto.get("category") or {}
    famiglia = categoria.get("family") or {}
    quantita = _num(item.get("quantity"), 1.0)
    return {
        "riga_id": item.get("_id") or item.get("originalOrderItemId"),
        "prodotto_id": prodotto.get("productId"),
        "nome": item.get("orderItemName") or item.get("printedOrderItemName") or prodotto.get("name") or "?",
        "categoria": categoria.get("name"),
        "famiglia": famiglia.get("name"),
        "portata": item.get("course"),
        "quantita": quantita,
        "prezzo_unitario": item.get("computedUnitaryPrice"),
        "totale": _num(item.get("finalPrice")),
        "servizio": 1 if item.get("serviceCharge") else 0,
        "inviata_at": _fmt(_ora(item.get("dateSend"), fuso)),
        "battuta_da": (item.get("log") or {}).get("createdBy"),
    }


def conti_da_sessioni(sessioni: Iterable[Dict[str, Any]], fuso=None) -> List[Dict[str, Any]]:
    """Raggruppa gli scontrini per ordine e restituisce i conti con le righe. Pura, testabile."""
    fuso = fuso or _fuso()
    gruppi: Dict[str, List[Dict[str, Any]]] = {}
    for s in sessioni:
        chiave = s.get("orderId") or s.get("closedOrderId") or s.get("id")
        if chiave:
            gruppi.setdefault(chiave, []).append(s)

    conti = []
    for order_id, ss in gruppi.items():
        ss.sort(key=lambda x: (x.get("log") or {}).get("createdDate") or "")
        con_tavolo = next((x for x in ss if x.get("table")), None)
        tavolo = (con_tavolo or {}).get("table") or {}
        romana = any(x.get("isDutch") for x in ss) or len(ss) > 1

        # Righe: alla romana stanno in originalOrderItems (gli scontrini hanno solo «1 Menu»)
        originali = next((x.get("originalOrderItems") for x in ss if x.get("originalOrderItems")), None)
        grezze = originali if originali else [i for x in ss for i in (x.get("printedOrderItems") or [])]
        righe, visti = [], set()
        for it in grezze:
            r = _riga(it, fuso)
            if not r:
                continue
            if r["riga_id"]:
                if r["riga_id"] in visti:
                    continue
                visti.add(r["riga_id"])
            righe.append(r)

        aperto = min((d for d in (_ora(x.get("originalOrderLogCreatedDate"), fuso) for x in ss) if d), default=None)
        chiuso = max((d for d in (_ora((x.get("log") or {}).get("createdDate"), fuso) for x in ss) if d), default=None)
        if tavolo.get("stayingDuration"):
            durata = round(_num(tavolo["stayingDuration"]) / 60)
        elif aperto and chiuso:
            durata = round((chiuso - aperto).total_seconds() / 60)
        else:
            durata = None

        coperti = tavolo.get("currentSittings") or None
        if not coperti:
            servizio = sum(r["quantita"] for r in righe if r["servizio"])
            coperti = int(servizio) if servizio else None

        pagamenti: Dict[str, float] = {}
        for x in ss:
            for p in x.get("payments") or []:
                metodo = ((p.get("transactionDetail") or {}).get("moneyTypeId") or "altro").replace("money_type:", "")
                pagamenti[metodo] = round(pagamenti.get(metodo, 0.0) + _num(p.get("amount")), 2)

        data_rif = next((x.get("referenceDate") for x in ss if x.get("referenceDate")), None)
        if not data_rif:
            data_rif = (chiuso or aperto or datetime.now(fuso)).date().isoformat()

        conti.append({
            "order_id": order_id,
            "data_rif": data_rif[:10],
            "aperto_at": _fmt(aperto),
            "chiuso_at": _fmt(chiuso),
            "durata_min": durata,
            "tavolo": tavolo.get("name"),
            "sala": (tavolo.get("room") or {}).get("name"),
            "coperti": int(coperti) if coperti else None,
            "totale": round(sum(_num(x.get("paymentsTotal")) for x in ss), 2),
            "sconti": round(sum(_num(x.get("discountsTotal")) for x in ss), 2),
            "n_documenti": len(ss),
            "documenti": ", ".join(str(x.get("billNumber")) for x in ss if x.get("billNumber") is not None),
            "tipi_documento": ", ".join(sorted({x.get("documentType") for x in ss if x.get("documentType")})),
            "romana": 1 if romana else 0,
            "pagamenti_json": json.dumps([{"metodo": k, "importo": v} for k, v in pagamenti.items()]),
            "cliente_cassa_id": next((x.get("businessActorId") for x in ss if x.get("businessActorId")), None),
            "chiusura_id": next((x.get("closureId") for x in ss if x.get("closureId")), None),
            "righe": righe,
        })
    conti.sort(key=lambda c: (c["aperto_at"] or "", c["order_id"]))
    return conti


# ============================================================
# SALVATAGGIO
# ============================================================

_CAMPI_CONTO = (
    "data_rif", "aperto_at", "chiuso_at", "durata_min", "tavolo", "sala", "coperti", "totale", "sconti",
    "n_documenti", "documenti", "tipi_documento", "romana", "pagamenti_json", "cliente_cassa_id", "chiusura_id",
)
_CAMPI_RIGA = (
    "riga_id", "prodotto_id", "nome", "categoria", "famiglia", "portata", "quantita", "prezzo_unitario",
    "totale", "servizio", "inviata_at", "battuta_da",
)


def salva_conti(conn, conti: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Upsert per order_id; le righe di un conto si riscrivono intere. Idempotente."""
    n_righe = 0
    for c in conti:
        valori = [c[k] for k in _CAMPI_CONTO]
        riga = conn.execute("SELECT id FROM cassa_conti WHERE order_id = ?", (c["order_id"],)).fetchone()
        if riga:
            conto_id = riga["id"]
            conn.execute(
                f"UPDATE cassa_conti SET {', '.join(k + ' = ?' for k in _CAMPI_CONTO)}, "
                "aggiornato_at = datetime('now','localtime') WHERE id = ?",
                (*valori, conto_id),
            )
            conn.execute("DELETE FROM cassa_conti_righe WHERE conto_id = ?", (conto_id,))
        else:
            cur = conn.execute(
                f"INSERT INTO cassa_conti (fonte, order_id, {', '.join(_CAMPI_CONTO)}) "
                f"VALUES ('ipratico', ?, {', '.join('?' for _ in _CAMPI_CONTO)})",
                (c["order_id"], *valori),
            )
            conto_id = cur.lastrowid
        for r in c["righe"]:
            conn.execute(
                f"INSERT INTO cassa_conti_righe (conto_id, {', '.join(_CAMPI_RIGA)}) "
                f"VALUES (?, {', '.join('?' for _ in _CAMPI_RIGA)})",
                (conto_id, *[r[k] for k in _CAMPI_RIGA]),
            )
            n_righe += 1
    # Niente cancellazioni automatiche: un conto sparito dalla cassa (storno)
    # resta qui. Meglio un conto in più da guardare che un conto perso per un
    # giorno letto male.
    return {"conti": len(conti), "righe": n_righe,
            "totale": round(sum(c["totale"] for c in conti), 2)}


def scarica_giorno(giorno: date, avviato_da: str = "manuale") -> Dict[str, Any]:
    """Scarica e salva i conti chiusi di un giorno. Scrive sempre una riga di log."""
    g = giorno.isoformat()
    conn = get_cassa_conti_conn()
    try:
        try:
            dati = _api_get("/statistics/closed-payment-sessions", {
                "application": "eat", "training": 0,
                "dateFrom": f"{g} 00:00:00", "dateTo": f"{g} 23:59:59",
            }) or {}
            sessioni = dati.get("paymentSessions")
            if sessioni is None:
                raise IpraticoErrore("risposta senza paymentSessions (API cambiata?)")
            esito = salva_conti(conn, conti_da_sessioni(sessioni))
            conn.execute(
                "INSERT INTO cassa_import_log (giorno, esito, conti, righe, totale, avviato_da) VALUES (?, 'ok', ?, ?, ?, ?)",
                (g, esito["conti"], esito["righe"], esito["totale"], avviato_da),
            )
            conn.commit()
            # Abbinamento automatico ai clienti (servizio platform, import qui per evitare cicli).
            # Se fallisce lo scarico resta buono: si riprova alla chiusura turno o a mano.
            try:
                from app.services import abbinamento_conti_service as abb
                for turno in ("pranzo", "cena"):
                    abb.abbina(g, turno)
            except Exception as e:  # noqa: BLE001
                logger.warning("abbinamento %s: %s", g, e)
            return {"giorno": g, "esito": "ok", **esito}
        except Exception as e:  # noqa: BLE001 — l'errore va nel log, non deve fermare un periodo
            conn.rollback()
            conn.execute(
                "INSERT INTO cassa_import_log (giorno, esito, errore, avviato_da) VALUES (?, 'errore', ?, ?)",
                (g, str(e)[:500], avviato_da),
            )
            conn.commit()
            logger.warning("iPratico Cloud %s: %s", g, e)
            return {"giorno": g, "esito": "errore", "errore": str(e)[:500]}
    finally:
        conn.close()


# ============================================================
# PERIODI (storico) E NOTTE
# ============================================================

def avvia_scarico_periodo(dal: date, al: date, avviato_da: str) -> Dict[str, Any]:
    """Scarica un periodo in background, un giorno alla volta. Uno alla volta."""
    if al < dal:
        raise ValueError("la data finale è prima di quella iniziale")
    giorni = (al - dal).days + 1
    if giorni > MAX_GIORNI_PERIODO:
        raise ValueError(f"periodo troppo lungo ({giorni} giorni): massimo {MAX_GIORNI_PERIODO}")
    if not configurato():
        raise IpraticoNonConfigurato("credenziali iPratico Cloud non configurate")
    if _stato_periodo.get("in_corso"):
        raise RuntimeError("c'è già uno scarico in corso")

    _stato_periodo.clear()
    _stato_periodo.update({
        "in_corso": True, "dal": dal.isoformat(), "al": al.isoformat(), "giorni": giorni,
        "fatti": 0, "errori": 0, "conti": 0, "avviato_da": avviato_da,
        "iniziato": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })

    def _giro():
        try:
            g = dal
            while g <= al:
                with _lock_scarico:
                    r = scarica_giorno(g, avviato_da)
                _stato_periodo["fatti"] += 1
                _stato_periodo["giorno_corrente"] = g.isoformat()
                if r["esito"] == "ok":
                    _stato_periodo["conti"] += r["conti"]
                else:
                    _stato_periodo["errori"] += 1
                    _stato_periodo["ultimo_errore"] = r.get("errore")
                g += timedelta(days=1)
                time.sleep(PAUSA_TRA_GIORNI_S)
        finally:
            _stato_periodo["in_corso"] = False
            _stato_periodo["finito"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    threading.Thread(target=_giro, name="ipratico-periodo", daemon=True).start()
    return dict(_stato_periodo)


def _prossima_notte(adesso: datetime) -> Optional[datetime]:
    ora = _env("IPRATICO_CLOUD_ORA", "05:30")
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", ora)
    if not m:
        return None
    t = adesso.replace(hour=int(m.group(1)), minute=int(m.group(2)), second=0, microsecond=0)
    return t if t > adesso else t + timedelta(days=1)


def avvia_scarico_notturno() -> None:
    """Thread di sfondo (un solo worker uvicorn): ogni notte riscarica gli ultimi giorni."""
    if _stato_notte.get("avviato") or _env("IPRATICO_CLOUD_NOTTE", "1") == "0":
        return
    _stato_notte["avviato"] = True

    def _giro():
        while True:
            adesso = datetime.now(_fuso())
            prossima = _prossima_notte(adesso)
            if not prossima:
                logger.warning("IPRATICO_CLOUD_ORA non valida: scarico notturno spento")
                return
            _stato_notte["prossimo"] = prossima.strftime("%Y-%m-%d %H:%M")
            time.sleep(max(60.0, (prossima - adesso).total_seconds()))
            if not configurato():
                continue
            try:
                giorni = max(1, int(_env("IPRATICO_CLOUD_GIORNI", "2") or 2))
            except ValueError:
                giorni = 2
            oggi = datetime.now(_fuso()).date()
            esiti = []
            for i in range(giorni, 0, -1):
                with _lock_scarico:
                    esiti.append(scarica_giorno(oggi - timedelta(days=i), "notte"))
            _stato_notte["ultimo"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            logger.info("iPratico Cloud notte: %s", esiti)

    threading.Thread(target=_giro, name="ipratico-notte", daemon=True).start()


# ============================================================
# LETTURA (per la pagina e per i moduli che verranno)
# ============================================================

def stato() -> Dict[str, Any]:
    conn = get_cassa_conti_conn()
    try:
        tot = conn.execute(
            "SELECT COUNT(*) AS n, MIN(data_rif) AS primo, MAX(data_rif) AS ultimo FROM cassa_conti"
        ).fetchone()
        ultimi = [dict(r) for r in conn.execute(
            "SELECT giorno, esito, conti, righe, totale, errore, avviato_da, fatto_at "
            "FROM cassa_import_log ORDER BY id DESC LIMIT 10"
        )]
    finally:
        conn.close()
    return {
        "configurato": configurato(),
        "conti": tot["n"], "primo_giorno": tot["primo"], "ultimo_giorno": tot["ultimo"],
        "ultimi_scarichi": ultimi,
        "periodo": dict(_stato_periodo) or None,
        "notte": {"attivo": bool(_stato_notte.get("avviato")), "prossimo": _stato_notte.get("prossimo"),
                  "ultimo": _stato_notte.get("ultimo")},
    }


def conti_del_giorno(giorno: str) -> List[Dict[str, Any]]:
    conn = get_cassa_conti_conn()
    try:
        conti = [dict(r) for r in conn.execute(
            "SELECT * FROM cassa_conti WHERE data_rif = ? ORDER BY aperto_at, id", (giorno,)
        )]
        for c in conti:
            c["pagamenti"] = json.loads(c.pop("pagamenti_json") or "[]")
            c["righe"] = [dict(r) for r in conn.execute(
                "SELECT nome, categoria, famiglia, portata, quantita, prezzo_unitario, totale, servizio, inviata_at "
                "FROM cassa_conti_righe WHERE conto_id = ? ORDER BY COALESCE(portata, 99), id", (c["id"],)
            )]
        return conti
    finally:
        conn.close()
