# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Possibili doppioni fra prenotazioni TheFork e prenotazioni inserite a mano.

Caso tipico (Petersen, 16/10/2026): la stessa cena segnata a mano in TRGB e in
TheFork Manager. TRGB non può collegarle da solo (quella manuale non ha l'id
TheFork, il cliente ha un altro nome), quindi le SEGNALA, non le unisce.

Due prenotazioni sono un possibile doppione se:
- sono nello stesso giorno, una con `thefork_booking_id` e l'altra senza;
- nessuna delle due è cancellata / rifiutata / no-show;
- e coincide almeno uno fra:
  · telefono (normalizzato, anche il secondo numero del cliente),
  · email (senza maiuscole e spazi),
  · nome: stesso primo nome e almeno una parola del cognome in comune
    («Christina Damsted Petersen» ~ «Christina Petersen»). Se uno dei due nomi
    manca basta il cognome, ma servono anche gli stessi coperti.

Nessuno stato salvato: si calcola al momento (planning, arrivo da webhook).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Set

from app.utils.whatsapp import normalize_phone

STATI_INATTIVI = ("CANCELED", "NO_SHOW", "REFUSED")


def _parole(testo: Optional[str]) -> List[str]:
    if not testo:
        return []
    t = unicodedata.normalize("NFKD", str(testo)).encode("ascii", "ignore").decode("ascii").lower()
    return [p for p in re.split(r"[^a-z]+", t) if p]


def _telefoni(r: Dict[str, Any]) -> Set[str]:
    out = set()
    for k in ("telefono", "telefono2"):
        n = normalize_phone(r.get(k) or "") if r.get(k) else None
        if n and len(n) >= 9 and set(n[2:]) != {"0"}:
            out.add(n)
    return out


def _email(r: Dict[str, Any]) -> Optional[str]:
    e = (r.get("email") or "").strip().lower()
    return e if "@" in e else None


def motivi(a: Dict[str, Any], b: Dict[str, Any]) -> List[str]:
    """Perché `a` e `b` sembrano la stessa prenotazione (lista vuota = no)."""
    out: List[str] = []

    nomi_a, nomi_b = _parole(a.get("nome")), _parole(b.get("nome"))
    cog_a = {p for p in _parole(a.get("cognome")) if len(p) >= 3}
    cog_b = {p for p in _parole(b.get("cognome")) if len(p) >= 3}
    if cog_a & cog_b:
        if nomi_a and nomi_b:
            if nomi_a[0] == nomi_b[0]:
                out.append("nome")
        elif (a.get("pax") or 0) == (b.get("pax") or 0):
            out.append("nome")

    if _telefoni(a) & _telefoni(b):
        out.append("telefono")

    ea, eb = _email(a), _email(b)
    if ea and ea == eb:
        out.append("email")
    return out


_SQL = """
    SELECT p.id, p.data_pasto, p.ora_pasto, p.pax, p.stato, p.fonte, p.thefork_booking_id,
           COALESCE(NULLIF(c.nome, ''), p.nome_ospite) AS nome,
           COALESCE(NULLIF(c.cognome, ''), p.cognome_ospite) AS cognome,
           c.telefono, c.telefono2, c.email
    FROM clienti_prenotazioni p
    LEFT JOIN clienti c ON c.id = p.cliente_id
    WHERE p.data_pasto = ? AND p.stato NOT IN ('CANCELED','NO_SHOW','REFUSED')
"""


def _riassunto(r: Dict[str, Any], m: List[str]) -> Dict[str, Any]:
    nome = " ".join(x for x in (r.get("nome"), r.get("cognome")) if x).strip()
    return {
        "id": r["id"],
        "ora": (r.get("ora_pasto") or "")[:5],
        "pax": r.get("pax"),
        "nome": nome,
        "thefork": bool(r.get("thefork_booking_id")),
        "motivi": m,
    }


def doppioni_del_giorno(conn, data: str) -> Dict[int, List[Dict[str, Any]]]:
    """{id prenotazione: [possibili doppioni]} per un giorno. Solo coppie TheFork ↔ non TheFork."""
    righe = [dict(r) for r in conn.execute(_SQL, (data,)).fetchall()]
    tf = [r for r in righe if r.get("thefork_booking_id")]
    altre = [r for r in righe if not r.get("thefork_booking_id")]
    out: Dict[int, List[Dict[str, Any]]] = {}
    for a in tf:
        for b in altre:
            m = motivi(a, b)
            if m:
                out.setdefault(a["id"], []).append(_riassunto(b, m))
                out.setdefault(b["id"], []).append(_riassunto(a, m))
    return out


def doppioni_di(conn, pren_id: int) -> List[Dict[str, Any]]:
    """Possibili doppioni di una prenotazione (es. appena arrivata da TheFork)."""
    r = conn.execute("SELECT data_pasto FROM clienti_prenotazioni WHERE id = ?", (pren_id,)).fetchone()
    if not r or not r["data_pasto"]:
        return []
    return doppioni_del_giorno(conn, r["data_pasto"]).get(pren_id, [])
