# @version: v1.0 — R5 (sessione 60, 2026-04-29)
# -*- coding: utf-8 -*-
"""
Helper backend per leggere stringhe UI specifiche del locale corrente.

Le stringhe TRGB-specific (es. "Osteria Tre Gobbi", saluti WA, footer PDF
cliente) vivono in `locali/<TRGB_LOCALE>/strings.json`. Il backend le legge
via `t(key, fallback)`. Se la chiave manca, ritorna il fallback —
cosi' l'app gira anche senza override (es. su un locale nuovo che non ha
ancora compilato strings.json).

Modulo: platform/UI primitives. Vedi docs/refactor_monorepo.md §3 R5.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Optional

# Cache in-memory per evitare di leggere il JSON a ogni chiamata di t().
# TTL breve (60s) cosi' modifiche al file vengono prese al volo in dev.
_CACHE: dict[str, Any] = {"data": None, "ts": 0.0, "locale": None}
_TTL = 60.0


def _strings_file_for(locale: str) -> Path:
    base = Path(__file__).resolve().parents[2]
    return base / "locali" / locale / "strings.json"


def _load_strings(locale: str) -> dict:
    """Carica il file strings.json del locale, fallback a tregobbi se manca."""
    candidates = [_strings_file_for(locale), _strings_file_for("tregobbi")]
    for path in candidates:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️ locale_strings: errore lettura {path}: {e}")
                continue
    return {}


def _get_strings() -> dict:
    """Ritorna le strings del locale corrente, cached 60s."""
    locale = os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"
    now = time.time()
    if (_CACHE["data"] is not None
        and _CACHE["locale"] == locale
        and now - _CACHE["ts"] < _TTL):
        return _CACHE["data"]
    data = _load_strings(locale)
    _CACHE["data"] = data
    _CACHE["locale"] = locale
    _CACHE["ts"] = now
    return data


def t(key: str, fallback: str = "") -> str:
    """
    Ritorna la stringa associata a `key` nel locale corrente, oppure `fallback`.

    Le chiavi sono dot-notation (es. "pdf.org_name", "wa.template.compleanno").
    Esempio:
        from app.utils.locale_strings import t
        nome_org = t("pdf.org_name", "TRGB")  # "Osteria Tre Gobbi" su tregobbi
    """
    data = _get_strings()
    parts = key.split(".")
    v: Any = data
    for p in parts:
        if isinstance(v, dict) and p in v:
            v = v[p]
        else:
            return fallback
    if isinstance(v, str):
        return v
    return fallback


def get_all_strings() -> dict:
    """Espone tutte le strings per l'endpoint pubblico /locale/strings.json."""
    return _get_strings()
