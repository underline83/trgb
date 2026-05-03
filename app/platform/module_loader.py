# @version: v1.0 — R8b (sessione 2026-05-02)
# -*- coding: utf-8 -*-
"""
TRGB Module Loader — Feature flags per locale (R8 architettura modulare).

Al boot del backend, legge:
  - locali/<TRGB_LOCALE>/moduli_attivi.json   → quali moduli attivare
  - core/moduli/<id>/module.json              → mapping router_file → module_id

Espone:
  - is_module_active(module_id)         → bool
  - is_router_active(router_file_name)  → bool (usato da main.py per filtrare include_router)
  - get_active_modules()                → set[str]
  - get_module_info()                   → dict diagnostico per GET /system/modules
  - boot_banner()                       → stringa log al boot

Backward-compat assoluta:
  - Se moduli_attivi.json ha "*" o file mancante → tutti i moduli attivi.
  - Modulo "platform" è SEMPRE attivo (infrastruttura, non vendibile).
  - Router senza mapping in nessun module.json → default attivo (per non rompere
    nulla durante la transizione: si aggiunge alla mappa quando si scopre).

Performance: tutti i lookup sono cached (lru_cache) — le funzioni leggono i JSON
una sola volta al boot e tengono il risultato in memoria.

Modulo: platform/loader.
"""
from __future__ import annotations

import json
import os
import logging
from functools import lru_cache
from pathlib import Path
from typing import FrozenSet

_REPO_ROOT = Path(__file__).resolve().parents[2]
_log = logging.getLogger("trgb.module_loader")


def _current_locale() -> str:
    """Default 'tregobbi' per backward compat con osteria di Marco."""
    return os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"


@lru_cache(maxsize=1)
def _all_module_ids() -> FrozenSet[str]:
    """Tutti i moduli (id) definiti in core/moduli/. Include 'platform'."""
    core_moduli = _REPO_ROOT / "core" / "moduli"
    if not core_moduli.exists():
        # Pre-R8a: la cartella non esiste ancora → fallback a "platform" only
        # (in pratica significa: nessun modulo vendibile noto, ma platform esiste sempre)
        return frozenset({"platform"})
    found = set()
    for p in core_moduli.iterdir():
        if p.is_dir() and (p / "module.json").exists():
            found.add(p.name)
    if "platform" not in found:
        found.add("platform")
    return frozenset(found)


@lru_cache(maxsize=1)
def get_active_modules() -> FrozenSet[str]:
    """
    Ritorna l'insieme di id moduli attivi per il locale corrente.
    Sempre include 'platform'.
    """
    locale = _current_locale()
    f = _REPO_ROOT / "locali" / locale / "moduli_attivi.json"

    if not f.exists():
        # Default backward-compat: tutto attivo
        return _all_module_ids()

    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        moduli = data.get("moduli", ["*"])
    except Exception as e:
        _log.warning(
            "moduli_attivi.json non leggibile per locale=%s (%s) — default '*'",
            locale, e,
        )
        return _all_module_ids()

    if not isinstance(moduli, list) or "*" in moduli:
        return _all_module_ids()

    # Lista esplicita: aggiungi sempre platform
    return frozenset(moduli) | {"platform"}


@lru_cache(maxsize=1)
def get_router_to_module_map() -> dict:
    """
    Mappa router_file_name → module_id costruita leggendo core/moduli/<id>/module.json.
    Esempio: {'vini_router': 'vini', 'foodcost_router': 'ricette', ...}
    """
    mapping = {}
    core_moduli = _REPO_ROOT / "core" / "moduli"
    if not core_moduli.exists():
        return mapping

    for module_dir in sorted(core_moduli.iterdir()):
        if not module_dir.is_dir():
            continue
        manifest = module_dir / "module.json"
        if not manifest.exists():
            continue
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except Exception as e:
            _log.warning("module.json non leggibile in %s (%s) — skip", module_dir.name, e)
            continue
        module_id = data.get("id") or module_dir.name
        for router_file in data.get("router_files", []):
            if router_file in mapping and mapping[router_file] != module_id:
                _log.warning(
                    "router '%s' assegnato a 2 moduli (%s, %s) — vince il primo",
                    router_file, mapping[router_file], module_id,
                )
            else:
                mapping[router_file] = module_id

    return mapping


def is_module_active(module_id: str) -> bool:
    """True se il modulo è attivo per il locale corrente. Platform sempre True."""
    if module_id == "platform":
        return True
    return module_id in get_active_modules()


def is_router_active(router_file_name: str) -> bool:
    """
    True se il router è associato a un modulo attivo.
    Router senza mapping (non classificato in nessun module.json): default True
    (per non rompere durante la transizione R8a→R8b).
    """
    mapping = get_router_to_module_map()
    module_id = mapping.get(router_file_name)
    if module_id is None:
        return True  # Default safe: monta tutto quello che non è esplicitamente classificato
    return is_module_active(module_id)


@lru_cache(maxsize=1)
def get_frontend_menu_keys_map() -> dict:
    """
    Mappa module_id → frontend_menu_key (chiave in MODULES_MENU del frontend).
    Es. {'vini': 'vini', 'cassa': 'vendite', 'task_manager': 'tasks'}.
    Moduli con frontend_menu_key=None o assente non hanno voce menu top-level.
    """
    out = {}
    core_moduli = _REPO_ROOT / "core" / "moduli"
    if not core_moduli.exists():
        return out
    for module_dir in core_moduli.iterdir():
        if not module_dir.is_dir():
            continue
        manifest = module_dir / "module.json"
        if not manifest.exists():
            continue
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except Exception:
            continue
        module_id = data.get("id") or module_dir.name
        key = data.get("frontend_menu_key")
        if key:
            out[module_id] = key
    return out


def get_module_info() -> dict:
    """Info diagnostiche per GET /system/modules. Consumato da R8c useActiveModules."""
    locale = _current_locale()
    active = sorted(get_active_modules())
    all_modules = sorted(_all_module_ids())
    inactive = [m for m in all_modules if m not in active]
    mapping = get_router_to_module_map()
    fmk_map = get_frontend_menu_keys_map()
    # Chiavi frontend dei moduli ATTIVI (per filtro MODULES_MENU lato R8c)
    active_frontend_keys = sorted({fmk_map[m] for m in active if m in fmk_map})
    return {
        "locale": locale,
        "active": active,
        "inactive": inactive,
        "all_modules": all_modules,
        "wildcard": set(active) == set(all_modules),
        "router_count_total": len(mapping),
        "router_count_active": sum(1 for r, m in mapping.items() if is_module_active(m)),
        "frontend_menu_keys": active_frontend_keys,  # R8c
        "frontend_menu_keys_map": fmk_map,           # debug/diagnostic
    }


def boot_banner() -> str:
    """Stringa pronta per log/print al boot del backend."""
    info = get_module_info()
    if info["wildcard"]:
        return (
            f"module_loader — locale={info['locale']} "
            f"moduli attivi=ALL ({len(info['all_modules'])} totali, "
            f"{info['router_count_total']} router classificati)"
        )
    return (
        f"module_loader — locale={info['locale']} "
        f"attivi=[{','.join(info['active'])}] "
        f"inattivi=[{','.join(info['inactive']) or '-'}] "
        f"router_montati={info['router_count_active']}/{info['router_count_total']}"
    )


def reset_cache() -> None:
    """Resetta tutte le cache (utile per test o config reload)."""
    _all_module_ids.cache_clear()
    get_active_modules.cache_clear()
    get_router_to_module_map.cache_clear()
    get_frontend_menu_keys_map.cache_clear()
