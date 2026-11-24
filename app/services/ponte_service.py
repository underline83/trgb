# @version: v1.0 (2026-11-24) — coda, token e stato del ponte di stampa
# -*- coding: utf-8 -*-
"""
Ponte di stampa — servizio platform, mattone M.M. [core]

Il ponte è un programma (cartella `ponte/` del repo) che gira su un computer nella rete del
locale. Ogni pochi secondi chiede a TRGB «c'è da stampare?», riceve i fogli già impaginati,
li porta alle stampanti sulla loro porta e riferisce com'è andata. È sempre lui a chiamare:
sul router del locale non si apre niente.

Chi ha fogli da stampare ha due strade:
- `accoda(stampante, dati, titolo)`: il foglio entra nella coda di qui (ponte_lavori);
- `registra_fonte(nome, elenco, esito)`: il modulo tiene la coda nelle sue tabelle e dà al
  ponte due funzioni — `elenco()` → [{id, stampante, titolo, dati}], `esito(id, ok, errore)`.
  Così la platform non importa niente dai moduli (le comande fanno così: comande_stampa).

Le stampanti nascono spente. Indirizzi e valori stanno in ponte_stampanti e ponte_config,
mai nel codice. Il ponte si fa riconoscere con un token creato dalle Impostazioni: qui se
ne tiene solo l'impronta.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import re
import secrets
import sqlite3
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from app.models.ponte_db import CONFIG_INIZIALE, get_ponte_conn, init_ponte_db
from app.services import stampa_escpos

logger = logging.getLogger("trgb.ponte")

try:    # chi usa il servizio trova le tabelle anche se il router del ponte non è ancora stato caricato
    init_ponte_db()
except Exception as _e:  # noqa: BLE001 — un DB non scrivibile non deve fermare l'avvio
    logger.warning("Ponte: schema non creato all'avvio: %s", _e)

LIMITI = {"ogni_secondi": (1, 60), "avviso_minuti": (1, 120), "scadenza_minuti": (1, 240), "presa_secondi": (5, 600)}
_CHIAVE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,29}$")
_HOST = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-]{0,99}$")
_CONTATTO_OGNI = 10          # secondi fra due scritture dell'ultimo contatto (il ponte chiama molto più spesso)
_FONTI: Dict[str, Dict[str, Callable]] = {}


class PonteErrore(Exception):
    """Richiesta non valida (→ 400)."""


def registra_fonte(nome: str, elenco: Callable[[], List[Dict[str, Any]]],
                   esito: Callable[[str, bool, Optional[str]], None]) -> None:
    """Un modulo con una coda sua. `elenco()` dà i fogli pronti, `esito(id, ok, errore)` li chiude."""
    _FONTI[str(nome)] = {"elenco": elenco, "esito": esito}


def _int(v, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _adesso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _secondi_da(ts: Optional[str]) -> Optional[int]:
    try:
        return max(0, int((datetime.now() - datetime.strptime(str(ts)[:19], "%Y-%m-%d %H:%M:%S")).total_seconds()))
    except (TypeError, ValueError):
        return None


def _cfg(conn) -> Dict[str, str]:
    return {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM ponte_config")}


def _valori(cfg: Dict[str, str]) -> Dict[str, int]:
    out = {}
    for k, (lo, hi) in LIMITI.items():
        out[k] = min(hi, max(lo, _int(cfg.get(k), _int(CONFIG_INIZIALE[k], lo))))
    return out


def valori() -> Dict[str, int]:
    """ogni_secondi, avviso_minuti, scadenza_minuti, presa_secondi: letti dalle impostazioni."""
    conn = get_ponte_conn()
    try:
        return _valori(_cfg(conn))
    finally:
        conn.close()


def stampanti() -> List[Dict[str, Any]]:
    conn = get_ponte_conn()
    try:
        return [{**dict(r), "attiva": bool(r["attiva"])}
                for r in conn.execute("SELECT * FROM ponte_stampanti ORDER BY ordine, chiave")]
    finally:
        conn.close()


def stampante(chiave: Optional[str]) -> Optional[Dict[str, Any]]:
    if not chiave:
        return None
    conn = get_ponte_conn()
    try:
        r = conn.execute("SELECT * FROM ponte_stampanti WHERE chiave = ?", (str(chiave),)).fetchone()
        return {**dict(r), "attiva": bool(r["attiva"])} if r else None
    finally:
        conn.close()


def pronta(s: Optional[Dict[str, Any]]) -> bool:
    """Una stampante su cui si può stampare: c'è, è accesa e ha un indirizzo."""
    return bool(s and s.get("attiva") and s.get("host"))


# ── token del ponte ──────────────────────────────────────────

def _impronta(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def nuovo_token() -> str:
    """Crea il token del ponte e lo restituisce UNA volta: qui ne resta l'impronta. Quello di
    prima smette di valere."""
    token = "ponte_" + secrets.token_urlsafe(32)
    conn = get_ponte_conn()
    try:
        for chiave, valore in (("token_hash", _impronta(token)), ("token_creato_at", _adesso())):
            conn.execute("INSERT INTO ponte_config (chiave, valore) VALUES (?, ?) "
                         "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (chiave, valore))
        conn.commit()
    finally:
        conn.close()
    return token


def token_valido(token: Optional[str]) -> bool:
    if not token or not str(token).isascii():
        return False
    conn = get_ponte_conn()
    try:
        r = conn.execute("SELECT valore FROM ponte_config WHERE chiave = 'token_hash'").fetchone()
    finally:
        conn.close()
    return bool(r and r["valore"]) and hmac.compare_digest(_impronta(str(token)), r["valore"])


# ── il ponte chiede e riferisce ──────────────────────────────

def _contatto(conn, cfg: Dict[str, str], chi: Dict[str, Any]) -> None:
    fa = _secondi_da(cfg.get("ultimo_contatto"))
    if fa is not None and fa < _CONTATTO_OGNI:
        return
    nuovi = {"ultimo_contatto": _adesso(), "ponte_nome": str(chi.get("nome") or "")[:60],
             "ponte_versione": str(chi.get("versione") or "")[:20]}
    for chiave, valore in nuovi.items():
        conn.execute("INSERT INTO ponte_config (chiave, valore) VALUES (?, ?) "
                     "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (chiave, valore))
    conn.commit()


def _lavoro(ident: str, s: Dict[str, Any], titolo: Optional[str], dati: bytes) -> Dict[str, Any]:
    return {"id": ident, "stampante": s["chiave"], "host": s["host"], "porta": int(s["porta"] or 9100),
            "titolo": titolo or "", "dati": base64.b64encode(bytes(dati)).decode("ascii")}


def lavori_per_il_ponte(chi: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Quello che il ponte deve stampare adesso. Segna il contatto e consegna i fogli: un foglio
    consegnato non viene ridato finché non arriva l'esito o non passano `presa_secondi`."""
    conn = get_ponte_conn()
    try:
        cfg = _cfg(conn)
        v = _valori(cfg)
        _contatto(conn, cfg, chi or {})
        mie = {r["chiave"]: {**dict(r), "attiva": bool(r["attiva"])} for r in conn.execute("SELECT * FROM ponte_stampanti")}
        out = []
        # La coda di qui (fogli di prova): escono anche su una stampante spenta, serve a provarla.
        for r in conn.execute(
                "SELECT * FROM ponte_lavori WHERE stato = 'attesa' "
                "AND creato_at >= datetime('now','localtime', ?) "
                "AND (presa_at IS NULL OR presa_at <= datetime('now','localtime', ?)) ORDER BY id LIMIT 10",
                (f"-{v['scadenza_minuti']} minutes", f"-{v['presa_secondi']} seconds")).fetchall():
            s = mie.get(r["stampante"])
            if not s or not s.get("host"):
                continue
            conn.execute("UPDATE ponte_lavori SET presa_at = datetime('now','localtime') WHERE id = ?", (r["id"],))
            out.append(_lavoro(f"ponte:{r['id']}", s, r["titolo"], r["dati"]))
        conn.commit()
    finally:
        conn.close()
    for nome, fonte in _FONTI.items():
        try:
            for f in fonte["elenco"]() or []:
                s = mie.get(f.get("stampante"))
                if pronta(s):
                    out.append(_lavoro(f"{nome}:{f['id']}", s, f.get("titolo"), f["dati"]))
        except Exception as e:  # una fonte rotta non ferma le altre stampe
            logger.exception("Ponte: la fonte %s non ha dato i suoi fogli: %s", nome, e)
    return {"ogni_secondi": v["ogni_secondi"], "lavori": out}


def esito(lavoro_id: str, ok: bool, errore: Optional[str] = None) -> None:
    nome, _, rid = str(lavoro_id or "").partition(":")
    errore = " ".join(str(errore or "").split())[:200] or None
    if nome == "ponte":
        conn = get_ponte_conn()
        try:
            if ok:
                conn.execute("UPDATE ponte_lavori SET stato = 'stampato', esito = 'ok', presa_at = NULL, "
                             "stampato_at = datetime('now','localtime') WHERE id = ?", (_int(rid, -1),))
            else:
                conn.execute("UPDATE ponte_lavori SET esito = ?, tentativi = tentativi + 1, presa_at = NULL "
                             "WHERE id = ?", (errore or "errore", _int(rid, -1)))
            conn.commit()
        finally:
            conn.close()
    elif nome in _FONTI:
        _FONTI[nome]["esito"](rid, bool(ok), errore)
    else:
        raise PonteErrore(f"Foglio sconosciuto: {lavoro_id}")


def accoda(chiave_stampante: str, dati: bytes, titolo: Optional[str] = None, utente: Optional[str] = None) -> int:
    s = stampante(chiave_stampante)
    if not s:
        raise PonteErrore(f"Stampante sconosciuta: {chiave_stampante}")
    if not s.get("host"):
        raise PonteErrore(f"La stampante {s['nome']} non ha un indirizzo")
    conn = get_ponte_conn()
    try:
        cur = conn.execute("INSERT INTO ponte_lavori (stampante, titolo, dati, creato_da) VALUES (?, ?, ?, ?)",
                           (s["chiave"], (titolo or "")[:80], sqlite3.Binary(bytes(dati)), utente))
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def prova(chiave_stampante: str, utente: Optional[str] = None) -> Dict[str, Any]:
    """Mette in coda un foglio di prova per una stampante (anche spenta)."""
    s = stampante(chiave_stampante)
    if not s:
        raise PonteErrore(f"Stampante sconosciuta: {chiave_stampante}")
    quando = datetime.now().strftime("%d/%m/%Y %H:%M")
    lavoro = accoda(s["chiave"], stampa_escpos.foglio_di_prova(f"Stampante {s['nome']}", quando, int(s["colonne"] or 48)),
                    f"Foglio di prova · {s['nome']}", utente)
    return {"id": lavoro, "stato": stato()}


# ── stato e impostazioni ─────────────────────────────────────

def stato() -> Dict[str, Any]:
    """Come sta il ponte: se ha un token, quando si è fatto sentire, se la stampa è ferma."""
    conn = get_ponte_conn()
    try:
        cfg = _cfg(conn)
        v = _valori(cfg)
        accese = [r["chiave"] for r in conn.execute("SELECT chiave FROM ponte_stampanti WHERE attiva = 1 ORDER BY ordine, chiave")]
        prove = conn.execute("SELECT COUNT(*) FROM ponte_lavori WHERE stato = 'attesa' AND creato_at >= datetime('now','localtime', ?)",
                             (f"-{v['scadenza_minuti']} minutes",)).fetchone()[0]
    finally:
        conn.close()
    fa = _secondi_da(cfg.get("ultimo_contatto"))
    collegato = fa is not None and fa <= max(v["avviso_minuti"] * 60, 3 * v["ogni_secondi"] + _CONTATTO_OGNI)
    return {"token": bool(cfg.get("token_hash")), "token_creato_at": cfg.get("token_creato_at"),
            "ultimo_contatto": cfg.get("ultimo_contatto"), "secondi_fa": fa, "collegato": collegato,
            "stampanti_accese": accese, "ferma": bool(accese) and not collegato,
            "ponte_nome": cfg.get("ponte_nome") or None, "ponte_versione": cfg.get("ponte_versione") or None,
            "prove_in_coda": prove}


def impostazioni() -> Dict[str, Any]:
    v = valori()
    return {"stampanti": stampanti(), "valori": {k: v[k] for k in ("ogni_secondi", "avviso_minuti", "scadenza_minuti")},
            "limiti": {k: list(LIMITI[k]) for k in ("ogni_secondi", "avviso_minuti", "scadenza_minuti")}, "stato": stato()}


def salva_impostazioni(dati: Dict[str, Any]) -> Dict[str, Any]:
    """Accetta `stampanti` [{chiave, nome, host, porta, colonne, attiva}] (le crea o le aggiorna,
    non le cancella) e `valori` {ogni_secondi, avviso_minuti, scadenza_minuti}."""
    conn = get_ponte_conn()
    try:
        for i, s in enumerate(dati.get("stampanti") or []):
            chiave = str(s.get("chiave") or "").strip().lower()
            nome = " ".join(str(s.get("nome") or "").split())[:40]
            host = str(s.get("host") or "").strip()
            if not _CHIAVE.match(chiave):
                raise PonteErrore("La chiave di una stampante: lettere minuscole, numeri, - e _")
            if not nome:
                raise PonteErrore("Ogni stampante vuole un nome")
            if host and not _HOST.match(host):
                raise PonteErrore(f"Indirizzo non valido per {nome}: {host}")
            porta, colonne = _int(s.get("porta"), 9100), _int(s.get("colonne"), 48)
            if not 1 <= porta <= 65535:
                raise PonteErrore(f"Porta non valida per {nome}")
            if not 24 <= colonne <= 80:
                raise PonteErrore(f"Colonne di {nome}: da 24 a 80")
            attiva = 1 if s.get("attiva") else 0
            if attiva and not host:
                raise PonteErrore(f"Per accendere {nome} serve il suo indirizzo")
            conn.execute(
                "INSERT INTO ponte_stampanti (chiave, nome, host, porta, colonne, attiva, ordine) VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(chiave) DO UPDATE SET nome = excluded.nome, host = excluded.host, porta = excluded.porta, "
                "colonne = excluded.colonne, attiva = excluded.attiva",
                (chiave, nome, host or None, porta, colonne, attiva, _int(s.get("ordine"), i)))
        for chiave, valore in (dati.get("valori") or {}).items():
            if chiave not in ("ogni_secondi", "avviso_minuti", "scadenza_minuti"):
                raise PonteErrore(f"Impostazione sconosciuta: {chiave}")
            lo, hi = LIMITI[chiave]
            n = _int(valore, lo - 1)
            if not lo <= n <= hi:
                raise PonteErrore(f"{chiave}: da {lo} a {hi}")
            conn.execute("INSERT INTO ponte_config (chiave, valore) VALUES (?, ?) "
                         "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (chiave, str(n)))
        conn.commit()
    finally:
        conn.close()
    return impostazioni()
