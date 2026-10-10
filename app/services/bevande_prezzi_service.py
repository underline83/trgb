# Modulo: vini (sub-modulo carta bevande) — [core]
# @version: v1.0 — calcolo prezzo a dose dal costo della bottiglia (mig 183, 2026-10-10)
# -*- coding: utf-8 -*-
"""
Calcolo prezzo a dose — Carta Bevande

Per le sezioni vendute a dose (distillati, e in futuro amari/liquori) suggerisce
il prezzo in carta partendo dal costo della bottiglia.

    dosi            = bottiglia_cl / dose_cl
    costo_dose      = costo_bottiglia / dosi                 (IVA esclusa)
    prezzo_sugg.    = costo_dose / incidenza × (1 + IVA)     arrotondato a `arrotondamento`
    incidenza reale = costo_dose / (prezzo_eur / (1 + IVA))  (il prezzo in carta è IVA inclusa)

Il costo bottiglia è IVA esclusa e comprende l'accisa (già dentro il prezzo del
fornitore). Il prezzo resta una scelta di chi gestisce la carta: qui si
suggerisce, non si scrive.

I parametri vivono per sezione in `bevande_sezioni.calcolo_prezzo` (JSON),
modificabili dalla UI. `PARAMETRI_DEFAULT` è solo il seme per una sezione che
non li ha ancora: nessuna soglia operativa decisa qui.

Riservatezza: il costo e il calcolo li vedono solo RUOLI_COSTI. Gli altri ruoli
ricevono la voce senza `costo_bottiglia` e senza `calcolo` (`ripulisci_voce`).
La carta cliente usa una whitelist di campi (vini_router.carta_cliente_data) e
i renderer HTML/PDF/DOCX non leggono queste colonne.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from app.services.permessi import ha_ruoli

# Chi vede costo e calcolo (deciso da Marco il 2026-10-10). La modifica resta
# ai ruoli editor della carta bevande (admin/sommelier, _require_editor).
RUOLI_COSTI = ("admin", "sommelier", "sala")

CAMPI_COSTO = ("costo_bottiglia",)

PARAMETRI_DEFAULT: dict[str, Any] = {
    "attivo": True,
    "incidenza_pct": 25.0,        # quota del prezzo (IVA esclusa) che va in costo
    "iva_pct": 22.0,
    "arrotondamento": 0.5,
    "bottiglia_cl": 70.0,
    "dose_cl": 4.0,
    "dose_per_tipologia": {},     # {"Grappa": 3} — sovrascrive dose_cl per tipologia
    "miscelati": {},              # {"Gin": {"etichetta": "G&T", "dose_cl": 5, "costo_extra": 0}}
}


# ─────────────────────────────────────────────
# PARAMETRI
# ─────────────────────────────────────────────

def _num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        n = float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return n


def parametri_da_sezione(sezione: dict[str, Any] | None) -> Optional[dict[str, Any]]:
    """Parametri della sezione fusi sui default. None se il calcolo non è attivo."""
    if not sezione:
        return None
    raw = sezione.get("calcolo_prezzo")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            raw = None
    if not isinstance(raw, dict) or not raw.get("attivo"):
        return None
    p = {**PARAMETRI_DEFAULT, **raw}
    p["dose_per_tipologia"] = dict(raw.get("dose_per_tipologia") or {})
    p["miscelati"] = dict(raw.get("miscelati") or {})
    return p


def valida_parametri(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalizza i parametri ricevuti dalla UI. ValueError con messaggio leggibile."""
    p = {**PARAMETRI_DEFAULT, **(raw or {})}
    out: dict[str, Any] = {"attivo": bool(p.get("attivo"))}

    inc = _num(p.get("incidenza_pct"))
    if inc is None or not (1 <= inc <= 90):
        raise ValueError("L'incidenza obiettivo deve stare tra 1 e 90%.")
    out["incidenza_pct"] = inc

    iva = _num(p.get("iva_pct"))
    if iva is None or not (0 <= iva <= 50):
        raise ValueError("L'IVA deve stare tra 0 e 50%.")
    out["iva_pct"] = iva

    arr = _num(p.get("arrotondamento"))
    if arr is None or arr < 0 or arr > 5:
        raise ValueError("L'arrotondamento deve stare tra 0 e 5 €.")
    out["arrotondamento"] = arr

    for k in ("bottiglia_cl", "dose_cl"):
        v = _num(p.get(k))
        if v is None or v <= 0:
            raise ValueError(f"{k} deve essere maggiore di zero.")
        out[k] = v

    dpt: dict[str, float] = {}
    for tip, v in (p.get("dose_per_tipologia") or {}).items():
        n = _num(v)
        if n is None:
            continue
        if n <= 0:
            raise ValueError(f"Dose per {tip} deve essere maggiore di zero.")
        dpt[str(tip)] = n
    out["dose_per_tipologia"] = dpt

    mix: dict[str, dict[str, Any]] = {}
    for tip, m in (p.get("miscelati") or {}).items():
        if not isinstance(m, dict):
            continue
        dose = _num(m.get("dose_cl"))
        extra = _num(m.get("costo_extra")) or 0.0
        if dose is None or dose <= 0:
            raise ValueError(f"Dose del miscelato per {tip} deve essere maggiore di zero.")
        if extra < 0:
            raise ValueError(f"Costo extra del miscelato per {tip} non può essere negativo.")
        mix[str(tip)] = {
            "etichetta": (m.get("etichetta") or "miscelato").strip() or "miscelato",
            "dose_cl": dose,
            "costo_extra": extra,
        }
    out["miscelati"] = mix
    return out


# ─────────────────────────────────────────────
# CALCOLO
# ─────────────────────────────────────────────

def _arrotonda(valore: float, passo: float) -> float:
    if not passo or passo <= 0:
        return round(valore, 2)
    return round(round(valore / passo) * passo, 2)


def _prezzo_suggerito(costo: float, p: dict[str, Any]) -> float:
    netto = costo / (p["incidenza_pct"] / 100.0)
    return _arrotonda(netto * (1 + p["iva_pct"] / 100.0), p["arrotondamento"])


def calcola(voce: dict[str, Any], p: dict[str, Any] | None) -> Optional[dict[str, Any]]:
    """Calcolo per una voce. None se il calcolo non è attivo o manca il costo."""
    if not p:
        return None
    costo_bt = _num(voce.get("costo_bottiglia"))
    if costo_bt is None or costo_bt <= 0:
        return None

    tip = voce.get("tipologia") or ""
    bottiglia_cl = _num(voce.get("bottiglia_cl")) or p["bottiglia_cl"]
    dose_cl = _num(voce.get("dose_cl")) or p["dose_per_tipologia"].get(tip) or p["dose_cl"]
    if bottiglia_cl <= 0 or dose_cl <= 0:
        return None

    costo_cl = costo_bt / bottiglia_cl
    costo_dose = costo_cl * dose_cl
    iva = 1 + p["iva_pct"] / 100.0

    out: dict[str, Any] = {
        "bottiglia_cl": bottiglia_cl,
        "dose_cl": dose_cl,
        "dosi": round(bottiglia_cl / dose_cl, 1),
        "costo_dose": round(costo_dose, 2),
        "prezzo_suggerito": _prezzo_suggerito(costo_dose, p),
        "incidenza_obiettivo": p["incidenza_pct"],
        "incidenza_reale": None,
        "margine_dose": None,
        "sopra_obiettivo": None,
        "miscelato": None,
    }

    prezzo = _num(voce.get("prezzo_eur"))
    if prezzo and prezzo > 0:
        netto = prezzo / iva
        inc = costo_dose / netto * 100.0
        out["incidenza_reale"] = round(inc, 1)
        out["margine_dose"] = round(netto - costo_dose, 2)
        out["sopra_obiettivo"] = inc > p["incidenza_pct"]

    mix = p["miscelati"].get(tip)
    if mix:
        costo_mix = costo_cl * mix["dose_cl"] + (mix.get("costo_extra") or 0.0)
        out["miscelato"] = {
            "etichetta": mix["etichetta"],
            "dose_cl": mix["dose_cl"],
            "costo": round(costo_mix, 2),
            "prezzo_suggerito": _prezzo_suggerito(costo_mix, p),
        }
    return out


# ─────────────────────────────────────────────
# RISERVATEZZA
# ─────────────────────────────────────────────

def puo_vedere_costi(user: dict[str, Any] | None) -> bool:
    return ha_ruoli(user, *RUOLI_COSTI)


def arricchisci_voci(
    voci: list[dict[str, Any]],
    sezioni: dict[str, dict[str, Any]],
    user: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Aggiunge `calcolo` per chi può vederlo, toglie il costo a tutti gli altri.

    `sezioni` = {sezione_key: riga sezione (dict)}; le sezioni senza calcolo
    attivo lasciano `calcolo` a None.
    """
    vede = puo_vedere_costi(user)
    cache: dict[str, Optional[dict[str, Any]]] = {}
    for v in voci:
        if not vede:
            for k in CAMPI_COSTO:
                v.pop(k, None)
            v.pop("calcolo", None)
            continue
        key = v.get("sezione_key")
        if key not in cache:
            cache[key] = parametri_da_sezione(sezioni.get(key))
        v["calcolo"] = calcola(v, cache[key])
    return voci
