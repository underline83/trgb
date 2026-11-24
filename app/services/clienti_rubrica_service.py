# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Rubrica dei clienti sul telefono — contatti e accessi (2026-11-16, mig 238).

Decisione di Marco (16/11/2026): invece di esportare a mano i contatti di
TheFork su Gmail, il telefono si abbona alla rubrica di TRGB (CardDAV, sola
lettura; il server è clienti_rubrica_router). Entrano i clienti attivi con un
telefono valido e almeno `rubrica_stelle_min` stelle (nere + argento + oro,
clienti_profilo_service). Ogni contatto:
  - nome sul telefono = prefisso + nome + stelle (la somma: i colori non si vedono,
    il numero sì), in N come titolo/suffisso così l'ordine resta per cognome;
  - telefoni, email;
  - nota: stelle, segmento, visite, ultima visita, allergie, preferenze, etichette;
  - link «TRGB» alla scheda del cliente nel gestionale (<app>/clienti/<id>): il
    contatto non si cambia dal telefono, si tocca il link e si corregge in TRGB,
    dietro al login (decisione di Marco, 24/11/2026). Indirizzo da TRGB_APP_URL o
    da locale.json «dominio_app», come il connettore; vuoto = niente link.
Niente compleanni: 4.000 compleanni nel calendario del telefono non servono.

Accessi: uno per telefono (clienti_rubrica_accessi), password pbkdf2 mostrata una
volta sola, revocabile. Prefisso e soglia in clienti_impostazioni.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import threading
import time
import unicodedata
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.clienti_db import get_clienti_conn
from app.services.clienti_profilo_service import ORO_SQL, SEGMENTI
from app.services.clienti_thefork_service import telefono_valido

logger = logging.getLogger("trgb.clienti.rubrica")

_DEFAULT = {"rubrica_prefisso": "TG", "rubrica_stelle_min": "1"}  # DEFAULT_FALLBACK (mig 238)
_TTL = 120          # secondi: rubrica pronta fra due richieste del telefono (tecnico)
_ITERAZIONI = 200_000
_ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789"  # niente 0/o, 1/l/i: si scrive a mano sul telefono
_ETICHETTE_SEGMENTO = {
    "di_casa": "Di casa", "affezionato": "Affezionato", "nuovo": "Nuovo", "una_volta": "Una volta",
    "in_calo": "In calo", "dormiente": "Dormiente", "perso": "Perso", "mai_venuto": "Mai venuto",
}
assert set(_ETICHETTE_SEGMENTO) == set(SEGMENTI)


# ─────────────────────────────────────────────────────────── impostazioni ───
def impostazioni(conn=None) -> Dict[str, Any]:
    chiudi = conn is None
    conn = conn or get_clienti_conn()
    try:
        imp = {r[0]: r[1] for r in conn.execute(
            "SELECT chiave, valore FROM clienti_impostazioni WHERE chiave LIKE 'rubrica_%'")}
    finally:
        if chiudi:
            conn.close()
    try:
        stelle_min = max(1, int(imp.get("rubrica_stelle_min", _DEFAULT["rubrica_stelle_min"])))
    except (TypeError, ValueError):
        stelle_min = 1
    return {"prefisso": (imp.get("rubrica_prefisso") or "").strip(), "stelle_min": stelle_min}


# ─────────────────────────────────────────────────────────── vCard ───
def _esc(v: Any) -> str:
    s = str(v or "")
    return (s.replace("\\", "\\\\").replace("\r\n", "\n").replace("\n", "\\n")
            .replace(",", "\\,").replace(";", "\\;"))


def _fold(riga: str) -> str:
    """Righe vCard al massimo 75 byte, senza spezzare un carattere UTF-8."""
    b = riga.encode("utf-8")
    if len(b) <= 75:
        return riga
    pezzi, cur, limite = [], b"", 75
    for ch in riga:
        cb = ch.encode("utf-8")
        if len(cur) + len(cb) > limite:
            pezzi.append(cur.decode("utf-8"))
            cur, limite = b"", 74  # le righe di continuazione iniziano con uno spazio
        cur += cb
    pezzi.append(cur.decode("utf-8"))
    return "\r\n ".join(pezzi)


def _data(iso: Optional[str]) -> str:
    return f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}" if iso and len(iso) >= 10 else ""


def _url_app() -> str:
    """Indirizzo delle pagine del gestionale (frontend) per il link nel contatto:
    TRGB_APP_URL, altrimenti https://<dominio_app> da locale.json (come main.py per il
    connettore). Vuoto se non c'è: il contatto esce senza link."""
    url = os.environ.get("TRGB_APP_URL", "").strip()
    if not url:
        from app.utils.locale_data import locale_info
        dom = str(locale_info().get("dominio_app") or "").strip()
        url = (dom if dom.startswith("http") else f"https://{dom}") if dom else ""
    return url.rstrip("/")


def _vcard(c: Dict[str, Any], prefisso: str, url_app: str = "") -> str:
    nome = (c.get("nome") or "").strip()
    cognome = (c.get("cognome") or "").strip()
    if c.get("nome2"):
        nome = f"{nome} & {c['nome2'].strip()}".strip(" &")
    if c.get("cognome2") and c["cognome2"].strip() and c["cognome2"].strip() != cognome:
        cognome = f"{cognome} / {c['cognome2'].strip()}".strip(" /")
    stelle = "★" * c["stelle"]
    if not nome and not cognome:
        nome = c["telefoni"][0]
    fn = " ".join(x for x in (prefisso, nome, cognome, stelle) if x)

    nota: List[str] = []
    parti = []
    if c["nere"]:
        parti.append(f"{c['nere']} ner{'a' if c['nere'] == 1 else 'e'}")
    if c["argento"]:
        parti.append(f"{c['argento']} argento")
    if c["oro"]:
        parti.append("oro")
    nota.append(f"{stelle} ({', '.join(parti)})")
    riga = [_ETICHETTE_SEGMENTO.get(c.get("segmento"), "")]
    if c.get("visite"):
        riga.append(f"{c['visite']} visit{'a' if c['visite'] == 1 else 'e'}")
    if c.get("ultima_visita"):
        riga.append(f"ultima {_data(c['ultima_visita'])}")
    if c.get("scontrino_medio"):
        riga.append(f"{round(c['scontrino_medio'])} € a coperto")
    nota.append(" · ".join(x for x in riga if x))
    allergie = " · ".join(x.strip() for x in (c.get("allergie"), c.get("restrizioni_dietetiche")) if x and x.strip())
    if allergie:
        nota.append(f"Allergie: {allergie}")
    pref = " · ".join(x.strip() for x in (c.get("pref_cibo"), c.get("pref_bevande"), c.get("pref_posto")) if x and x.strip())
    if pref:
        nota.append(f"Preferenze: {pref}")
    if c.get("etichette"):
        nota.append(f"Etichette: {', '.join(c['etichette'])}")

    righe = [
        "BEGIN:VCARD", "VERSION:3.0", "PRODID:-//TRGB//Rubrica clienti//IT",
        f"UID:{c['uid']}",
        # N = cognome;nome;secondi nomi;titolo;suffisso → il telefono mostra «TG Mario Rossi ★★»
        # e ordina per cognome
        f"N:{_esc(cognome)};{_esc(nome)};;{_esc(prefisso)};{_esc(stelle)}",
        f"FN:{_esc(fn)}",
    ]
    for i, t in enumerate(c["telefoni"]):
        righe.append(f"TEL;TYPE={'CELL' if i == 0 else 'VOICE'}:{t}")
    if c.get("email"):
        righe.append(f"EMAIL;TYPE=INTERNET:{_esc(c['email'].strip())}")
    if url_app:
        # item1.* + X-ABLabel: sull'iPhone il link si chiama «TRGB» (DAVx5 legge lo stesso)
        righe.append(f"item1.URL:{url_app}/clienti/{c['id']}")
        righe.append("item1.X-ABLabel:TRGB")
    righe.append(f"NOTE:{_esc(chr(10).join(x for x in nota if x))}")
    if prefisso:
        righe.append(f"CATEGORIES:{_esc(prefisso)}")
    righe.append("END:VCARD")
    return "\r\n".join(_fold(r) for r in righe) + "\r\n"


# ─────────────────────────────────────────────────────────── rubrica ───
_cache: Dict[str, Any] = {"t": 0.0, "dati": None}
_lock_cache = threading.Lock()


def _costruisci() -> Dict[str, Any]:
    conn = get_clienti_conn()
    try:
        imp = impostazioni(conn)
        url_app = _url_app()
        righe = conn.execute(f"""
            SELECT c.id, c.nome, c.cognome, c.nome2, c.cognome2, c.telefono, c.telefono2, c.email,
                   c.allergie, c.restrizioni_dietetiche, c.pref_cibo, c.pref_bevande, c.pref_posto,
                   p.segmento, COALESCE(p.stelle_nere, 0) AS nere, COALESCE(p.stelle_argento, 0) AS argento,
                   CASE WHEN {ORO_SQL} THEN 1 ELSE 0 END AS oro,
                   p.visite, p.ultima_visita, p.scontrino_medio
            FROM clienti c
            LEFT JOIN clienti_profilo p ON p.cliente_id = c.id
            WHERE COALESCE(c.attivo, 1) = 1
        """).fetchall()
        etichette: Dict[int, List[str]] = defaultdict(list)
        for cid, nome in conn.execute("""
            SELECT a.cliente_id, t.nome FROM clienti_tag_assoc a JOIN clienti_tag t ON t.id = a.tag_id
            ORDER BY t.ordine, t.nome"""):
            etichette[cid].append(nome)
    finally:
        conn.close()

    carte: Dict[str, Tuple[str, str]] = {}
    for r in righe:
        d = dict(r)
        d["stelle"] = int(d["nere"]) + int(d["argento"]) + int(d["oro"])
        if d["stelle"] < imp["stelle_min"]:
            continue
        telefoni = []
        for t in (d.get("telefono"), d.get("telefono2")):
            t = re.sub(r"[^\d+]", "", str(t or ""))
            if telefono_valido(t) and t not in telefoni:
                telefoni.append(t)
        if not telefoni:
            continue
        d["telefoni"] = telefoni
        d["uid"] = f"trgb-cliente-{d['id']}"
        d["etichette"] = etichette.get(d["id"], [])
        v = _vcard(d, imp["prefisso"], url_app)
        carte[f"{d['uid']}.vcf"] = ('"' + hashlib.sha1(v.encode("utf-8")).hexdigest()[:20] + '"', v)
    ctag = hashlib.sha1("|".join(f"{k}{e}" for k, (e, _) in sorted(carte.items())).encode()).hexdigest()[:24]
    return {"carte": carte, "ctag": ctag, "fatta": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


def rubrica(fresca: bool = False) -> Dict[str, Any]:
    """{'carte': {nome_file: (etag, vcard)}, 'ctag': …}. Tenuta pronta _TTL secondi."""
    with _lock_cache:
        if fresca or not _cache["dati"] or time.time() - _cache["t"] > _TTL:
            _cache["dati"] = _costruisci()
            _cache["t"] = time.time()
        return _cache["dati"]


def svuota_cache() -> None:
    with _lock_cache:
        _cache["dati"] = None


# ─────────────────────────────────────────────────────────── accessi ───
def _hash(password: str, sale: Optional[str] = None) -> str:
    sale = sale or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(sale), _ITERAZIONI).hex()
    return f"pbkdf2_sha256${_ITERAZIONI}${sale}${h}"


def _hash_ok(password: str, salvato: str) -> bool:
    try:
        _, iterazioni, sale, h = salvato.split("$")
        prova = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(sale), int(iterazioni)).hex()
        return hmac.compare_digest(prova, h)
    except (ValueError, TypeError):
        return False


def _slug(nome: str) -> str:
    s = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:20].strip("-")
    return s or "telefono"


def crea_accesso(nome: str, creato_da: str) -> Dict[str, Any]:
    """Nuovo accesso per un telefono. La password torna solo qui."""
    nome = (nome or "").strip()[:60] or "Telefono"
    password = "-".join("".join(secrets.choice(_ALFABETO) for _ in range(4)) for _ in range(4))
    conn = get_clienti_conn()
    try:
        base = _slug(nome)
        utente, n = base, 1
        while conn.execute("SELECT 1 FROM clienti_rubrica_accessi WHERE utente = ?", (utente,)).fetchone():
            n += 1
            utente = f"{base}-{n}"
        cur = conn.execute(
            "INSERT INTO clienti_rubrica_accessi (nome, utente, password_hash, creato_da) VALUES (?, ?, ?, ?)",
            (nome, utente, _hash(password), creato_da),
        )
        conn.commit()
        return {"id": cur.lastrowid, "nome": nome, "utente": utente, "password": password}
    finally:
        conn.close()


def elenco_accessi() -> List[Dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT id, nome, utente, creato_il, creato_da, ultimo_accesso, attivo "
            "FROM clienti_rubrica_accessi ORDER BY attivo DESC, id DESC")]
    finally:
        conn.close()


_verificati: Dict[Tuple[str, str], float] = {}  # (utente, sha256 password) → scadenza: pbkdf2 una volta ogni 10 minuti
_ultimo_scritto: Dict[int, float] = {}


def revoca_accesso(accesso_id: int) -> bool:
    conn = get_clienti_conn()
    try:
        cur = conn.execute("UPDATE clienti_rubrica_accessi SET attivo = 0 WHERE id = ?", (accesso_id,))
        conn.commit()
    finally:
        conn.close()
    _verificati.clear()
    return cur.rowcount == 1


def verifica(utente: str, password: str) -> Optional[int]:
    """id dell'accesso se utente e password sono giusti e l'accesso è attivo, altrimenti None."""
    if not utente or not password:
        return None
    chiave = (utente, hashlib.sha256(password.encode("utf-8")).hexdigest())
    adesso = time.time()
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            "SELECT id, password_hash FROM clienti_rubrica_accessi WHERE utente = ? AND attivo = 1", (utente,)
        ).fetchone()
        if not r:
            return None
        if _verificati.get(chiave, 0) < adesso:
            if not _hash_ok(password, r["password_hash"]):
                logger.warning("Rubrica: password sbagliata per «%s»", utente)
                return None
            _verificati[chiave] = adesso + 600
        if adesso - _ultimo_scritto.get(r["id"], 0) > 600:
            conn.execute("UPDATE clienti_rubrica_accessi SET ultimo_accesso = ? WHERE id = ?",
                         (datetime.now().strftime("%Y-%m-%d %H:%M"), r["id"]))
            conn.commit()
            _ultimo_scritto[r["id"]] = adesso
        return r["id"]
    finally:
        conn.close()


def stato() -> Dict[str, Any]:
    dati = rubrica()
    return {"contatti": len(dati["carte"]), "aggiornata": dati["fatta"], **impostazioni(),
            "accessi": elenco_accessi(), "percorso": "/rubrica/"}
