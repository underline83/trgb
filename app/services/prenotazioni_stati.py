# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Stati delle prenotazioni — un posto solo (2026-11-13, mig 232).

Prima gli stati e i loro gruppi («attiva», «venuti», «fuori») erano copiati a mano
in una decina di file (router prenotazioni, clienti, statistiche, dashboard,
Lavagna, connettore, servizi tavoli/fasce/sito/doppioni). Uno stato nuovo
dimenticato in uno di quei punti sballava coperti o statistiche in silenzio.

Ora stanno in due tabelle di clienti.sqlite3:

  prenotazioni_stati              codice, etichetta, emoji, tono, ordine e i gruppi:
      occupa      tiene il tavolo (conta nella disponibilità, nel motore tavoli,
                  nelle fasce, nei doppioni)
      venuto      il cliente è venuto (visite, statistiche, affidabilità)
      fuori       cancellata / no-show / rifiutata (sezione «Cancellate» del Planning)
      incerta     tiene il tavolo ma non è sicura: i coperti si mostrano A PARTE
                  («48 coperti + 12 in opzione»)
      solo_trgb   non esiste in TheFork: non si mette su una prenotazione TheFork
                  (la sincronizzazione riscriverebbe lo stato)
  prenotazioni_stati_transizioni  (da, a): i passaggi permessi a mano.

Decisione di Marco (2026-11-13): stati nuovi OPTION «In opzione» (tocca al cliente,
tavolo tenuto fino a `tenuto_fino_al` o alla scadenza del preventivo collegato) e
WAITLIST «Lista d'attesa» (non occupa niente, avviso quando nel turno si libera
un posto). Alla scadenza dell'opzione NIENTE di automatico: avviso e decide lui.

Se la migrazione non c'è ancora (o la tabella è vuota) valgono i DEFAULT sotto,
che sono la stessa cosa del seed: il codice non si rompe mai per la tabella.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Tuple

from app.models.clienti_db import get_clienti_conn

logger = logging.getLogger("trgb.prenotazioni.stati")

# codice, etichetta, emoji, tono, ordine, occupa, venuto, fuori, incerta, solo_trgb
DEFAULT_STATI: List[Tuple] = [
    ("WAITLIST",          "Lista d'attesa", "🕰️", "violet",  5,  0, 0, 0, 0, 1),
    ("REQUESTED",         "Da confermare",  "📨", "blue",    10, 1, 0, 0, 0, 0),
    ("OPTION",            "In opzione",     "⏳", "amber",   15, 1, 0, 0, 1, 1),
    ("RECORDED",          "Confermata",     "📅", "indigo",  20, 1, 0, 0, 0, 0),
    ("ARRIVED",           "Arrivato",       "🚶", "teal",    30, 1, 1, 0, 0, 0),
    ("PARTIALLY_ARRIVED", "Parziale",       "👥", "amber",   35, 1, 1, 0, 0, 0),
    ("SEATED",            "Seduto",         "✅", "emerald", 40, 1, 1, 0, 0, 0),
    ("BILL",              "Al conto",       "🧾", "amber",   50, 1, 1, 0, 0, 0),
    ("LEFT",              "Completata",     "🚪", "neutral", 60, 1, 1, 0, 0, 0),
    ("CANCELED",          "Cancellata",     "✖",  "neutral", 70, 0, 0, 1, 0, 0),
    ("NO_SHOW",           "No-show",        "👻", "red",     80, 0, 0, 1, 0, 0),
    ("REFUSED",           "Rifiutata",      "⛔", "red",     90, 0, 0, 1, 0, 0),
]

DEFAULT_TRANSIZIONI: Dict[str, List[str]] = {
    "REQUESTED":  ["RECORDED", "OPTION", "WAITLIST", "REFUSED", "CANCELED"],
    "OPTION":     ["RECORDED", "CANCELED"],
    "WAITLIST":   ["OPTION", "RECORDED", "CANCELED"],
    "RECORDED":   ["ARRIVED", "SEATED", "OPTION", "CANCELED", "NO_SHOW", "REFUSED"],
    "ARRIVED":    ["SEATED", "CANCELED", "NO_SHOW"],
    "SEATED":     ["LEFT", "BILL"],
    "BILL":       ["LEFT"],
    "LEFT":       [],
    "CANCELED":   ["RECORDED"],   # ripristino
    "NO_SHOW":    ["RECORDED"],   # ripristino
    "REFUSED":    ["RECORDED"],   # ripristino
    "PARTIALLY_ARRIVED": ["SEATED", "LEFT"],
}

GRUPPI = ("occupa", "venuto", "fuori", "incerta", "solo_trgb")
_CODICE_OK = re.compile(r"^[A-Z_]{2,30}$")
_TTL = 120  # secondi: la tabella cambia solo con una migrazione

_cache: Dict[str, Any] = {"t": 0.0, "stati": None, "transizioni": None}


def _da_default() -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    campi = ("codice", "etichetta", "emoji", "tono", "ordine", *GRUPPI)
    return [dict(zip(campi, r)) for r in DEFAULT_STATI], {k: list(v) for k, v in DEFAULT_TRANSIZIONI.items()}


def _carica() -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    if _cache["stati"] is not None and time.time() - _cache["t"] < _TTL:
        return _cache["stati"], _cache["transizioni"]
    stati, trans = _da_default()
    try:
        conn = get_clienti_conn()
        try:
            righe = conn.execute(
                f"SELECT codice, etichetta, emoji, tono, ordine, {', '.join(GRUPPI)} "
                "FROM prenotazioni_stati ORDER BY ordine, codice"
            ).fetchall()
            if righe:
                stati = [dict(r) for r in righe if _CODICE_OK.match(r["codice"] or "")]
                t: Dict[str, List[str]] = {s["codice"]: [] for s in stati}
                for r in conn.execute("SELECT da, a FROM prenotazioni_stati_transizioni ORDER BY da, ordine, a"):
                    if r["da"] in t and r["a"] in t:
                        t[r["da"]].append(r["a"])
                trans = t
        finally:
            conn.close()
    except Exception as e:  # noqa: BLE001 — tabella non ancora creata: valgono i default
        logger.debug("prenotazioni_stati non leggibile, uso i default: %s", e)
    _cache.update(t=time.time(), stati=stati, transizioni=trans)
    return stati, trans


def svuota_cache() -> None:
    _cache.update(t=0.0, stati=None, transizioni=None)


# ─────────────────────────── letture ───────────────────────────

def elenco() -> List[Dict[str, Any]]:
    """Tutti gli stati con etichetta, emoji, tono, gruppi e passaggi permessi (per il frontend)."""
    stati, trans = _carica()
    return [{**s, **{g: bool(s.get(g)) for g in GRUPPI}, "transizioni": trans.get(s["codice"], [])} for s in stati]


def codici() -> set:
    return {s["codice"] for s in _carica()[0]}


def transizioni(da: str) -> List[str]:
    return list(_carica()[1].get(da, []))


def gruppo(nome: str) -> Tuple[str, ...]:
    """Codici con il flag `nome` acceso (occupa, venuto, fuori, incerta, solo_trgb)."""
    if nome not in GRUPPI:
        raise ValueError(f"Gruppo stati sconosciuto: {nome}")
    return tuple(s["codice"] for s in _carica()[0] if s.get(nome))


def non_occupano() -> Tuple[str, ...]:
    """Stati che NON tengono il tavolo (fuori + lista d'attesa). Si usa come
    `stato NOT IN (...)`, così uno stato sconosciuto continua a contare come prima."""
    return tuple(s["codice"] for s in _carica()[0] if not s.get("occupa"))


def etichetta(codice: str) -> str:
    for s in _carica()[0]:
        if s["codice"] == codice:
            return s["etichetta"]
    return codice


def sql_in(codici_) -> str:
    """«('A','B')» da mettere in una query. I codici sono validati (solo A-Z e _):
    vengono dalla tabella o dai default, mai dall'utente."""
    ok = [c for c in codici_ if _CODICE_OK.match(c)]
    return "(" + ",".join(f"'{c}'" for c in ok) + ")" if ok else "('')"


def is_occupa(codice: str) -> bool:
    return codice not in non_occupano()


def is_incerta(codice: str) -> bool:
    return codice in gruppo("incerta")
