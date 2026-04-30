# @version: v1.0 — R6 (sessione 60, 2026-04-29)
# -*- coding: utf-8 -*-
"""
Helper centralizzato per il path dei DB SQLite del locale corrente.

Razionale (R6 del refactor monorepo):
- Oggi i DB SQLite vivono in `app/data/<file>.sqlite3` — un solo set per tutta l'app.
- Quando arriva un secondo cliente, ognuno deve avere DB SUOI separati per non
  sporcare i dati dell'altro: cliente_pinco/data/foodcost.db deve essere diverso
  da locali/tregobbi/data/foodcost.db.
- Strategia di non-rottura (graduale, R6.5 applicherà a tutti i DB):
    1. R6 (questa): introduce `locale_data_path(filename)` ma NON viene ancora
       applicato ai modelli/repos. Lookup ordine: locali/<locale>/data/<file>
       → fallback app/data/<file> (path storico).
    2. R6.5 (sessione dedicata): applica il helper a tutti i 9 DB SQLite
       (`foodcost.db`, `vini_magazzino.sqlite3`, ...) sostituendo le costanti
       Path("app/data/...") con `locale_data_path(...)`. I DB attuali restano
       in `app/data/` per backward compat (il helper li trova come fallback).
    3. Quando arriva il secondo cliente: si copiano i suoi DB in
       `locali/<id>/data/` e il helper li trova lì automaticamente.

Modulo: platform/data. Vedi docs/refactor_monorepo.md §3 R6 e R6.5.
"""
from __future__ import annotations

import os
from pathlib import Path

# Root del repo (parent di app/utils/)
_REPO_ROOT = Path(__file__).resolve().parents[2]


def _current_locale() -> str:
    """Default 'tregobbi' per backward compat con osteria di Marco."""
    return os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"


def locale_data_path(filename: str) -> Path:
    """
    Ritorna il path al file DB del locale corrente, con fallback a app/data/.

    Lookup order:
        1. locali/<TRGB_LOCALE>/data/<filename>   (se esiste, usato)
        2. app/data/<filename>                    (fallback storico)

    Quando R6.5 sposterà fisicamente i DB di tregobbi in locali/tregobbi/data/,
    il path 1 sarà preferito automaticamente. Per ora (R6) tregobbi punta
    ancora ad app/data/ via fallback.

    Esempio:
        from app.utils.locale_data import locale_data_path
        DB_PATH = locale_data_path("foodcost.db")
        conn = sqlite3.connect(DB_PATH)

    NB: ritorna un Path "atteso" per il filename. Se il file non esiste in
    nessuno dei 2 path candidati, ritorna il path NUOVO (locali/<id>/data/)
    cosi' un'eventuale prima creazione (es. INIT_DATABASE al boot) crea il
    DB nel posto corretto per locale (futuro-compatibile).
    """
    locale = _current_locale()

    # Path tenant-aware
    locale_path = _REPO_ROOT / "locali" / locale / "data" / filename
    if locale_path.exists():
        return locale_path

    # Fallback storico
    legacy_path = _REPO_ROOT / "app" / "data" / filename
    if legacy_path.exists():
        return legacy_path

    # Nuovo file: usa il path tenant-aware (futuro)
    locale_path.parent.mkdir(parents=True, exist_ok=True)
    return locale_path


def locale_data_dir() -> Path:
    """
    Ritorna la directory base dati per il locale corrente.
    Crea la cartella se non esiste.
    """
    locale = _current_locale()
    p = _REPO_ROOT / "locali" / locale / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p
