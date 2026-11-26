# Platform: numeri di telefono col prefisso internazionale — [core]
# -*- coding: utf-8 -*-
"""
Numeri di telefono in formato internazionale («+39340…») e prefissi per paese.

Serve a riconoscere lo stesso cliente comunque sia stato scritto il numero
(0039…, +39…, 39…, con spazi, punti o trattini) e a mandare a servizi esterni
(TheFork) il formato che vogliono: + seguito da sole cifre. Marco 2026-11-26:
«anche sui clienti stranieri, con numeri stranieri… un elenco coi prefissi per
la nazionalità, per aiutare, la gestione degli 00».

`app/utils/whatsapp.normalize_phone` resta com'è (wa.me, numeri nazionali).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.utils.whatsapp import normalize_phone

# (paese, prefisso, lingua proposta). L'ordine qui non conta: l'elenco esce
# ordinato per nome, coi più frequenti tra i clienti del locale in cima.
_PREFISSI = [
    ("Italia", "+39", "it_IT"), ("Svizzera", "+41", "it_CH"), ("Germania", "+49", "de_DE"),
    ("Francia", "+33", "fr_FR"), ("Regno Unito", "+44", "en_GB"), ("Stati Uniti e Canada", "+1", "en_US"),
    ("Austria", "+43", "de_AT"), ("Paesi Bassi", "+31", "nl_NL"), ("Belgio", "+32", "fr_BE"),
    ("Spagna", "+34", "es_ES"), ("Portogallo", "+351", "pt_PT"), ("Irlanda", "+353", "en_IE"),
    ("Danimarca", "+45", "da_DK"), ("Svezia", "+46", "sv_SE"), ("Norvegia", "+47", "en_GB"),
    ("Finlandia", "+358", "en_GB"), ("Polonia", "+48", "pl_PL"), ("Repubblica Ceca", "+420", "en_GB"),
    ("Slovacchia", "+421", "en_GB"), ("Ungheria", "+36", "en_GB"), ("Romania", "+40", "en_GB"),
    ("Bulgaria", "+359", "en_GB"), ("Grecia", "+30", "en_GB"), ("Croazia", "+385", "en_GB"),
    ("Slovenia", "+386", "en_GB"), ("Lussemburgo", "+352", "fr_FR"), ("Malta", "+356", "en_GB"),
    ("Principato di Monaco", "+377", "fr_FR"), ("San Marino", "+378", "it_IT"), ("Albania", "+355", "en_GB"),
    ("Serbia", "+381", "en_GB"), ("Ucraina", "+380", "en_GB"), ("Russia", "+7", "en_GB"),
    ("Turchia", "+90", "en_GB"), ("Israele", "+972", "en_GB"), ("Emirati Arabi", "+971", "en_GB"),
    ("Australia", "+61", "en_AU"), ("Nuova Zelanda", "+64", "en_GB"), ("Giappone", "+81", "en_GB"),
    ("Cina", "+86", "en_GB"), ("Corea del Sud", "+82", "en_GB"), ("India", "+91", "en_GB"),
    ("Brasile", "+55", "pt_BR"), ("Argentina", "+54", "es_ES"), ("Messico", "+52", "es_ES"),
    ("Sudafrica", "+27", "en_GB"), ("Islanda", "+354", "en_GB"), ("Estonia", "+372", "en_GB"),
    ("Lettonia", "+371", "en_GB"), ("Lituania", "+370", "en_GB"), ("Singapore", "+65", "en_GB"),
]
# Paesi dove lo 0 iniziale fa parte del numero anche col prefisso (i fissi italiani)
_ZERO_RESTA = {"+39", "+378"}


def prefisso_locale() -> str:
    """Prefisso del paese del locale: quello che normalize_phone mette ai numeri nazionali."""
    return "+" + ((normalize_phone("3" + "0" * 9) or "39")[:-10] or "39")


def cifre(t: Any) -> str:
    return re.sub(r"\D", "", str(t or ""))


def paese_di(numero: Optional[str]) -> Optional[Dict[str, str]]:
    """Paese di un numero già normalizzato (il prefisso più lungo che combacia)."""
    if not numero or not numero.startswith("+"):
        return None
    meglio = None
    for paese, pre, lingua in _PREFISSI:
        if numero.startswith(pre) and (meglio is None or len(pre) > len(meglio[1])):
            meglio = (paese, pre, lingua)
    return {"paese": meglio[0], "prefisso": meglio[1], "lingua": meglio[2]} if meglio else None


def normalizza(numero: Optional[str], prefisso: Optional[str] = None) -> Optional[str]:
    """
    «+» seguito da sole cifre, o None se non è un numero.
    Con + o 00 davanti il prefisso è quello scritto; senza, è `prefisso`
    (quello scelto nell'elenco) o quello del locale.

    >>> normalizza("0044 7700 900123")
    '+447700900123'
    >>> normalizza("0039 340.123.4567"), normalizza("39 340 1234567"), normalizza("340-123-4567")
    ('+393401234567', '+393401234567', '+393401234567')
    >>> normalizza("035 123456"), normalizza("07700 900123", "+44")
    ('+39035123456', '+447700900123')
    """
    if not numero:
        return None
    grezzo = re.sub(r"[^\d+]", "", str(numero))
    if grezzo.startswith("00"):
        grezzo = "+" + grezzo[2:]
    if grezzo.startswith("+"):
        out = "+" + cifre(grezzo)
    else:
        pre = "+" + cifre(prefisso or prefisso_locale())
        solo = cifre(grezzo)
        nudo = pre[1:]
        # «39 340…» scritto senza + né 00: il prefisso c'è già
        if solo.startswith(nudo) and len(solo) - len(nudo) >= 9 and solo[len(nudo):len(nudo) + 1] in ("3", "0"):
            out = "+" + solo
        else:
            if pre not in _ZERO_RESTA:
                solo = solo.lstrip("0")
            out = pre + solo
    return out if 8 <= len(cifre(out)) <= 15 else None


def stesso_numero(a: Optional[str], b: Optional[str], prefisso: Optional[str] = None) -> bool:
    na, nb = normalizza(a, prefisso), normalizza(b, prefisso)
    return bool(na and nb and na == nb)


def elenco_prefissi(frequenti: Optional[List[str]] = None) -> Dict[str, Any]:
    """Elenco per il form: `frequenti` (prefissi, dal più usato) in cima, poi gli altri per nome."""
    per_pre: Dict[str, Dict[str, str]] = {}
    for paese, pre, lingua in _PREFISSI:
        per_pre.setdefault(pre, {"paese": paese, "prefisso": pre, "lingua": lingua})
    loc = prefisso_locale()
    cima = [loc] + [p for p in (frequenti or []) if p != loc]
    cima = [p for i, p in enumerate(cima) if p in per_pre and p not in cima[:i]]
    return {
        "locale": loc,
        "frequenti": [per_pre[p] for p in cima],
        "altri": sorted((v for k, v in per_pre.items() if k not in cima), key=lambda v: v["paese"]),
    }
