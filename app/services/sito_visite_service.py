# @version: v1.0 (2026-10-23) — visite del sito (mig 210)
# -*- coding: utf-8 -*-
"""
Visite del sito — service. Modulo: sito — [core]. Doc: docs/modulo_sito.md.

Il sito pubblico manda eventi con navigator.sendBeacon (corpo text/plain JSON):
  {"tipo":"vista"|"clic", "pagina":"/it/", "lingua":"it", "provenienza":"google.com",
   "utm_source":..., "utm_medium":..., "utm_campaign":..., "dispositivo":"mobile"|"desktop",
   "obiettivo": (solo clic) uno di OBIETTIVI}

Privacy (decisione di Marco, 2026-10-23): niente cookie, niente IP né User-Agent
salvati, niente fingerprint. IP e User-Agent servono solo in memoria, per scartare
i bot, limitare gli invii e — insieme a un sale che cambia ogni giorno e non viene
mai scritto — fare l'hash «visitatore» valido un giorno solo, che si azzera quando
il giorno si chiude.

Configurazione del locale (locale.json → "sito"), niente nel codice:
  domini   domini da cui si accettano eventi (Origin o Referer). Vuoto = niente.
  escludi  percorsi da scartare (prefissi), es. ["/nuovo/"].
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import sqlite3
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlsplit

from app.models.sito_db import get_sito_conn
from app.utils.locale_data import locale_info, locale_timezone

TIPI = ("vista", "clic")
OBIETTIVI = ("prenota_apri", "telefono", "whatsapp", "email", "pdf_menu", "pdf_vini", "mappa")
DISPOSITIVI = ("mobile", "desktop")
MAX_CORPO = 2048
MESI_GREZZI = 13

_BOT = re.compile(
    r"bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|"
    r"pagespeed|preview|monitor|uptime|pingdom|python|curl|wget|httpclient|http-client|"
    r"java/|go-http|okhttp|axios|node-fetch|scrapy|facebookexternalhit|embedly|"
    r"semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|"
    r"bytespider|gptbot|claude|anthropic|perplexity|ccbot|amazonbot|applebot|duckduck",
    re.I,
)
_PAGINA = re.compile(r"^/[A-Za-z0-9/_\-.%~]{0,199}$")
_DOMINIO = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
_LINGUA = re.compile(r"^[a-z]{2}$")
_UTM = re.compile(r"^[\w\-. +/]{1,60}$", re.U)


# ── configurazione del locale (riletta al massimo ogni 60 s) ──────────────────
_cfg_cache: Dict[str, Any] = {"t": 0.0, "v": None}


def config() -> Dict[str, Any]:
    ora = time.time()
    if _cfg_cache["v"] is None or ora - _cfg_cache["t"] > 60:
        s = locale_info().get("sito") or {}
        domini = [d.strip().lower().removeprefix("www.") for d in (s.get("domini") or []) if isinstance(d, str) and d.strip()]
        escludi = [e.strip() for e in (s.get("escludi") or []) if isinstance(e, str) and e.strip().startswith("/")]
        _cfg_cache.update(t=ora, v={"domini": sorted(set(domini)), "escludi": escludi})
    return _cfg_cache["v"]


def _host(url_o_host: str) -> str:
    s = (url_o_host or "").strip().lower()
    if not s:
        return ""
    if "//" in s:
        s = urlsplit(s).hostname or ""
    s = s.split("/")[0].split(":")[0]
    return s.removeprefix("www.")


def _del_sito(host: str, domini: Iterable[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domini) if host else False


# ── hash visitatore del giorno: sale in memoria, cambia a ogni giorno ─────────
_sale = {"giorno": None, "valore": b""}
_sale_lock = threading.Lock()


def _visitatore(giorno: str, ip: str, ua: str) -> str:
    with _sale_lock:
        if _sale["giorno"] != giorno:
            _sale.update(giorno=giorno, valore=secrets.token_bytes(32))
        sale = _sale["valore"]
    return hashlib.sha256(sale + f"{ip}|{ua}".encode("utf-8", "ignore")).hexdigest()[:16]


def e_bot(user_agent: str) -> bool:
    ua = (user_agent or "").strip()
    return len(ua) < 20 or not ua.lower().startswith("mozilla/") or bool(_BOT.search(ua))


def _testo(v: Any, regola: re.Pattern, minuscolo: bool = True) -> Optional[str]:
    if not isinstance(v, str):
        return None
    v = v.strip()
    if minuscolo:
        v = v.lower()
    return v if v and regola.match(v) else None


def valida(corpo: bytes, origin: str, referer: str) -> Optional[Dict[str, Any]]:
    """L'evento pulito, o None se va scartato (malformato, troppo lungo, non del sito)."""
    if not corpo or len(corpo) > MAX_CORPO:
        return None
    cfg = config()
    if not cfg["domini"]:
        return None
    # chi lo manda: Origin (sendBeacon cross-origin lo mette sempre), altrimenti Referer
    if not _del_sito(_host(origin) or _host(referer), cfg["domini"]):
        return None
    try:
        d = json.loads(corpo.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(d, dict):
        return None
    tipo = d.get("tipo")
    if tipo not in TIPI:
        return None
    pagina = d.get("pagina")
    if not isinstance(pagina, str):
        return None
    pagina = pagina.split("?")[0].split("#")[0].strip()
    if not _PAGINA.match(pagina) or ".." in pagina:
        return None
    if any(pagina == e.rstrip("/") or pagina.startswith(e) for e in cfg["escludi"]):
        return None
    obiettivo = None
    if tipo == "clic":
        obiettivo = d.get("obiettivo")
        if obiettivo not in OBIETTIVI:
            return None
    prov = _host(d.get("provenienza") or "")
    if not prov or prov == "diretto":
        prov = "diretto"
    elif _del_sito(prov, cfg["domini"]):
        prov = "interno"
    elif not _DOMINIO.match(prov):
        prov = "altro"
    disp = d.get("dispositivo")
    return {
        "tipo": tipo,
        "pagina": pagina,
        "lingua": _testo(d.get("lingua"), _LINGUA),
        "provenienza": prov,
        "utm_source": _testo(d.get("utm_source"), _UTM),
        "utm_medium": _testo(d.get("utm_medium"), _UTM),
        "utm_campaign": _testo(d.get("utm_campaign"), _UTM),
        "dispositivo": disp if disp in DISPOSITIVI else None,
        "obiettivo": obiettivo,
    }


def _adesso() -> datetime:
    return datetime.now(locale_timezone())


def registra(ev: Dict[str, Any], ip: str, user_agent: str) -> None:
    ora = _adesso()
    giorno = ora.date().isoformat()
    conn = get_sito_conn()
    try:
        conn.execute(
            """INSERT INTO sito_eventi (giorno, ora, tipo, pagina, lingua, provenienza,
                   utm_source, utm_medium, utm_campaign, dispositivo, obiettivo, visitatore)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (giorno, ora.hour, ev["tipo"], ev["pagina"], ev["lingua"], ev["provenienza"],
             ev["utm_source"], ev["utm_medium"], ev["utm_campaign"], ev["dispositivo"],
             ev["obiettivo"], _visitatore(giorno, ip, user_agent)),
        )
        conn.commit()
        manutenzione(conn, ora.date())
    finally:
        conn.close()


# ── totali per giorno ─────────────────────────────────────────────────────────
_DIMENSIONI_VISTA = {
    "pagina": "pagina",
    "lingua": "COALESCE(lingua,'')",
    "provenienza": "COALESCE(provenienza,'diretto')",
    "dispositivo": "COALESCE(dispositivo,'')",
    "utm": "COALESCE(utm_source,'') || ' / ' || COALESCE(utm_medium,'') || ' / ' || COALESCE(utm_campaign,'')",
    "ora": "printf('%02d', ora)",
}


def _aggrega(conn: sqlite3.Connection, da: str, a: str) -> List[tuple]:
    """(giorno, dimensione, valore, n) dagli eventi grezzi, giorni da..a compresi."""
    righe: List[tuple] = []
    q = lambda sql: conn.execute(sql, (da, a)).fetchall()  # noqa: E731
    for r in q("SELECT giorno, COUNT(*) FROM sito_eventi WHERE giorno BETWEEN ? AND ? AND tipo='vista' GROUP BY giorno"):
        righe.append((r[0], "viste", "", r[1]))
    for r in q("SELECT giorno, COUNT(DISTINCT visitatore) FROM sito_eventi WHERE giorno BETWEEN ? AND ? "
               "AND tipo='vista' AND visitatore IS NOT NULL GROUP BY giorno"):
        righe.append((r[0], "unici", "", r[1]))
    for dim, espr in _DIMENSIONI_VISTA.items():
        filtro = " AND utm_source IS NOT NULL" if dim == "utm" else ""
        for r in q(f"SELECT giorno, {espr}, COUNT(*) FROM sito_eventi WHERE giorno BETWEEN ? AND ? "
                   f"AND tipo='vista'{filtro} GROUP BY 1, 2"):
            righe.append((r[0], dim, r[1], r[2]))
    for r in q("SELECT giorno, obiettivo, COUNT(*) FROM sito_eventi WHERE giorno BETWEEN ? AND ? "
               "AND tipo='clic' GROUP BY 1, 2"):
        righe.append((r[0], "clic", r[1], r[2]))
    return righe


def _meno_mesi(d: date, mesi: int) -> date:
    m = d.year * 12 + d.month - 1 - mesi
    y, mm = divmod(m, 12)
    mm += 1
    giorni = [31, 29 if (y % 4 == 0 and (y % 100 or y % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return date(y, mm, min(d.day, giorni[mm - 1]))


def chiudi_giorni(conn: sqlite3.Connection, oggi: date) -> int:
    """Riassume in sito_giorni ogni giorno prima di oggi non ancora chiuso; azzera l'hash
    visitatore di quei giorni. Idempotente."""
    aperti = [r[0] for r in conn.execute(
        "SELECT DISTINCT giorno FROM sito_eventi WHERE giorno < ? "
        "AND giorno NOT IN (SELECT giorno FROM sito_giorni_chiusi) ORDER BY giorno", (oggi.isoformat(),))]
    for g in aperti:
        conn.execute("DELETE FROM sito_giorni WHERE giorno = ?", (g,))
        conn.executemany("INSERT INTO sito_giorni (giorno, dimensione, valore, n) VALUES (?,?,?,?)",
                         _aggrega(conn, g, g))
        conn.execute("INSERT OR REPLACE INTO sito_giorni_chiusi (giorno) VALUES (?)", (g,))
    if aperti:
        conn.execute("UPDATE sito_eventi SET visitatore = NULL WHERE giorno < ? AND visitatore IS NOT NULL",
                     (oggi.isoformat(),))
    conn.commit()
    return len(aperti)


def manutenzione(conn: sqlite3.Connection, oggi: date) -> None:
    """Una volta al giorno: chiude i giorni passati e cancella i grezzi oltre 13 mesi."""
    r = conn.execute("SELECT valore FROM sito_stato WHERE chiave='manutenzione'").fetchone()
    if r and r[0] == oggi.isoformat():
        return
    chiudi_giorni(conn, oggi)
    limite = _meno_mesi(oggi, MESI_GREZZI).isoformat()
    conn.execute("DELETE FROM sito_eventi WHERE giorno < ?", (limite,))
    conn.execute("INSERT OR REPLACE INTO sito_stato (chiave, valore) VALUES ('manutenzione', ?)", (oggi.isoformat(),))
    conn.commit()


# ── lettura: riepilogo di un periodo ──────────────────────────────────────────
def _righe_periodo(conn: sqlite3.Connection, da: date, a: date, oggi: date) -> List[tuple]:
    righe = [tuple(r) for r in conn.execute(
        "SELECT giorno, dimensione, valore, n FROM sito_giorni WHERE giorno BETWEEN ? AND ?",
        (da.isoformat(), min(a, oggi - timedelta(days=1)).isoformat()))]
    if da <= oggi <= a:
        righe += _aggrega(conn, oggi.isoformat(), oggi.isoformat())
    return righe


def _top(righe: List[tuple], dim: str, limite: int = 0) -> List[Dict[str, Any]]:
    tot: Dict[str, int] = {}
    for _, d, v, n in righe:
        if d == dim:
            tot[v] = tot.get(v, 0) + n
    out = sorted(({"valore": v, "n": n} for v, n in tot.items()), key=lambda x: (-x["n"], x["valore"]))
    return out[:limite] if limite else out


def _somma(righe: List[tuple], dim: str, valore: Optional[str] = None) -> int:
    return sum(n for _, d, v, n in righe if d == dim and (valore is None or v == valore))


def periodo(giorni: int = 30, a: Optional[str] = None) -> tuple[date, date, date, date]:
    """(da, a, da_prima, a_prima): il periodo di `giorni` giorni che finisce in `a` (oggi se
    manca) e quello subito prima, della stessa lunghezza."""
    giorni = max(1, min(int(giorni), 400))
    fine = date.fromisoformat(a) if a else _adesso().date()
    inizio = fine - timedelta(days=giorni - 1)
    return inizio, fine, inizio - timedelta(days=giorni), inizio - timedelta(days=1)


def riepilogo(giorni: int = 30, a: Optional[str] = None, top: int = 15) -> Dict[str, Any]:
    da, fine, da_p, fine_p = periodo(giorni, a)
    oggi = _adesso().date()
    conn = get_sito_conn()
    try:
        manutenzione(conn, oggi)
        ora_ = _righe_periodo(conn, da, fine, oggi)
        prima = _righe_periodo(conn, da_p, fine_p, oggi)
        primo_evento = conn.execute("SELECT MIN(giorno) FROM sito_giorni").fetchone()[0] or \
            conn.execute("SELECT MIN(giorno) FROM sito_eventi").fetchone()[0]
    finally:
        conn.close()

    per_giorno: Dict[str, Dict[str, int]] = {}
    for g, d, v, n in ora_:
        if d in ("viste", "unici") or (d == "clic" and v == "prenota_apri"):
            k = "clic_prenota" if d == "clic" else d
            per_giorno.setdefault(g, {})[k] = per_giorno.get(g, {}).get(k, 0) + n
    viste_prima: Dict[str, int] = {}
    for g, d, _v, n in prima:
        if d == "viste":
            viste_prima[g] = viste_prima.get(g, 0) + n
    serie = []
    n_giorni = (fine - da).days + 1
    for i in range(n_giorni):
        g = (da + timedelta(days=i)).isoformat()
        gp = (da_p + timedelta(days=i)).isoformat()
        x = per_giorno.get(g, {})
        serie.append({"giorno": g, "viste": x.get("viste", 0), "unici": x.get("unici", 0),
                      "clic_prenota": x.get("clic_prenota", 0),
                      "giorno_prima": gp, "viste_prima": viste_prima.get(gp, 0)})

    clic_ora = {x["valore"]: x["n"] for x in _top(ora_, "clic")}
    clic_prima = {x["valore"]: x["n"] for x in _top(prima, "clic")}
    return {
        "periodo": {"da": da.isoformat(), "a": fine.isoformat(), "giorni": n_giorni},
        "periodo_prima": {"da": da_p.isoformat(), "a": fine_p.isoformat()},
        "dati_dal": primo_evento,
        "totali": {
            "viste": _somma(ora_, "viste"), "viste_prima": _somma(prima, "viste"),
            "unici_giorno": _somma(ora_, "unici"), "unici_giorno_prima": _somma(prima, "unici"),
            "clic_prenota": clic_ora.get("prenota_apri", 0), "clic_prenota_prima": clic_prima.get("prenota_apri", 0),
        },
        "giorni": serie,
        "pagine": _top(ora_, "pagina", top),
        "lingue": _top(ora_, "lingua"),
        "provenienze": _top(ora_, "provenienza", top),
        "dispositivi": _top(ora_, "dispositivo"),
        "campagne": _top(ora_, "utm", top),
        "ore": sorted(_top(ora_, "ora"), key=lambda x: x["valore"]),
        "clic": [{"obiettivo": o, "n": clic_ora.get(o, 0), "n_prima": clic_prima.get(o, 0)} for o in OBIETTIVI],
    }
