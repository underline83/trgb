# @version: v1.1 — aperture straordinarie nel giorno fisso (giorni_aperti); v1.0 — calendario chiusure unico (2026-11-19)
# -*- coding: utf-8 -*-
"""
Calendario chiusure del locale — Modulo: platform — [core]

UNA sola risposta a «quel giorno, quel turno, siamo aperti?», letta dal
calendario che si compila in Vendite › Chiusure (closures_config):

  giorno_chiusura_settimanale   0=lun … 6=dom, None = nessun giorno fisso
  giorni_chiusi                 ["2026-12-31", …]  tutto il giorno
  giorni_aperti                 ["2026-12-30", …]  aperture straordinarie: aperti anche
                                se cadono nel giorno fisso (vale anche sul giorno di
                                chiusura delle Prenotazioni)
  turni_chiusi                  [{data, turno: pranzo|cena, motivo}]  un turno solo

Pranzo e cena chiusi lo stesso giorno = giorno chiuso.

Prima di questo servizio ogni modulo leggeva il calendario a modo suo: Turni
vedeva solo giorno fisso e giorni chiusi (i turni chiusi no), il Planning
prenotazioni solo il proprio «giorno_chiusura», il sito tutto. Ora Turni,
Prenotazioni e sito passano da qui.

Chi deve fare qualcosa quando il calendario cambia (es. Prenotazioni che chiude
la vendita online su TheFork) si iscrive con `al_cambio(fn)`: il router del
calendario chiama `notifica_cambio(prima, dopo, utente)` dopo il salvataggio.
Così il calendario (platform) non importa nessun modulo.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Callable, Dict, Iterable, List, Optional, Set

log = logging.getLogger("trgb.chiusure")

TURNI = ("pranzo", "cena")
NOMI_GIORNO = ("lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica")


def config() -> Dict[str, Any]:
    """Il calendario salvato (vuoto se non si legge: meglio aperti che bloccati da un file rotto)."""
    try:
        from app.routers.closures_config_router import get_closures_config
        return get_closures_config() or {}
    except Exception as e:  # noqa: BLE001
        log.warning("calendario chiusure non leggibile: %s", e)
        return {}


def _d(giorno: Any) -> date:
    return giorno if isinstance(giorno, date) else date.fromisoformat(str(giorno)[:10])


def turni_chiusi(giorno: Any, cal: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    """{turno: motivo} dei turni chiusi quel giorno ({} = aperto). Motivo «» se non scritto."""
    cal = cal if cal is not None else config()
    d = _d(giorno)
    iso = d.isoformat()
    if iso in set(cal.get("giorni_chiusi") or []):
        return {t: "giorno di chiusura" for t in TURNI}
    fisso = cal.get("giorno_chiusura_settimanale")
    if (fisso is not None and str(fisso) != "" and d.weekday() == int(fisso)
            and not aperto_straordinario(d, cal)):
        return {t: f"chiusura del {NOMI_GIORNO[d.weekday()]}" for t in TURNI}
    out: Dict[str, str] = {}
    for tc in cal.get("turni_chiusi") or []:
        t = str(tc.get("turno") or "").lower()
        if tc.get("data") == iso and t in TURNI:
            out[t] = (tc.get("motivo") or "").strip()
    return out


def aperto_straordinario(giorno: Any, cal: Optional[Dict[str, Any]] = None) -> bool:
    """True se quel giorno è un'apertura straordinaria (aperto anche nel giorno fisso)."""
    cal = cal if cal is not None else config()
    return _d(giorno).isoformat() in set(cal.get("giorni_aperti") or [])


def chiuso(giorno: Any, turno: str, cal: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Il motivo se quel turno è chiuso, altrimenti None. turno: pranzo|cena (anche PRANZO/CENA)."""
    return turni_chiusi(giorno, cal).get(str(turno or "").lower())


def giorno_chiuso(giorno: Any, cal: Optional[Dict[str, Any]] = None) -> bool:
    return set(turni_chiusi(giorno, cal)) == set(TURNI)


def mappa(giorni: Iterable[Any], cal: Optional[Dict[str, Any]] = None) -> Dict[str, Dict[str, str]]:
    """{data_iso: {turno: motivo}} solo per i giorni con qualcosa di chiuso."""
    cal = cal if cal is not None else config()
    out: Dict[str, Dict[str, str]] = {}
    for g in giorni:
        tc = turni_chiusi(g, cal)
        if tc:
            out[_d(g).isoformat()] = tc
    return out


def giorni_chiusi(giorni: Iterable[Any], cal: Optional[Dict[str, Any]] = None) -> List[str]:
    """Date (iso, ordinate) chiuse tutto il giorno."""
    return sorted(g for g, tc in mappa(giorni, cal).items() if set(tc) == set(TURNI))


def turni_chiusi_parziali(giorni: Iterable[Any], cal: Optional[Dict[str, Any]] = None) -> Dict[str, Dict[str, str]]:
    """{data_iso: {turno: motivo}} solo dove è chiuso UN turno (il giorno intero sta in giorni_chiusi)."""
    return {g: tc for g, tc in mappa(giorni, cal).items() if set(tc) != set(TURNI)}


def descrivi(giorno: Any, turno: str, motivo: Optional[str] = None) -> str:
    """«La cena del 25/12 è chiusa (Natale)» — per messaggi di blocco e banner."""
    d = _d(giorno)
    t = str(turno or "").lower()
    testo = f"{'Il pranzo' if t == 'pranzo' else 'La cena'} del {d.strftime('%d/%m')} è {'chiuso' if t == 'pranzo' else 'chiusa'}"
    return testo + (f" ({motivo})" if motivo else "")


def date_esplicite(cal: Optional[Dict[str, Any]] = None, dal: Optional[date] = None) -> Set[tuple]:
    """(data_iso, turno) chiusi con una data precisa (giorni chiusi + turni chiusi), da `dal` in poi.
    Il giorno fisso resta fuori: è l'orario normale del locale, non un'eccezione."""
    cal = cal if cal is not None else config()
    dal_iso = (dal or date.min).isoformat()
    out: Set[tuple] = set()
    for g in cal.get("giorni_chiusi") or []:
        if g >= dal_iso:
            out.update((g, t) for t in TURNI)
    for tc in cal.get("turni_chiusi") or []:
        t = str(tc.get("turno") or "").lower()
        if (tc.get("data") or "") >= dal_iso and t in TURNI:
            out.add((tc["data"], t))
    return out


# ── Chi vuole sapere quando il calendario cambia ─────────────

_ascoltatori: List[Callable[[Dict[str, Any], Dict[str, Any], Optional[str]], None]] = []


def al_cambio(fn: Callable[[Dict[str, Any], Dict[str, Any], Optional[str]], None]) -> Callable:
    """Iscrive fn(prima, dopo, utente). Usabile come decoratore. Una sola volta per funzione."""
    if fn not in _ascoltatori:
        _ascoltatori.append(fn)
    return fn


def notifica_cambio(prima: Dict[str, Any], dopo: Dict[str, Any], utente: Optional[str] = None) -> None:
    """Chiamata dal router del calendario dopo il salvataggio. Un ascoltatore che sbaglia non ferma gli altri."""
    for fn in list(_ascoltatori):
        try:
            fn(prima or {}, dopo or {}, utente)
        except Exception as e:  # noqa: BLE001
            log.warning("chiusure: ascoltatore %s fallito: %s", getattr(fn, "__name__", fn), e)
