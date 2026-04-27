# @version: v1.0 — Modulo K Upload utente fuori repo (sessione 59 cont. d, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Helper centralizzato per la directory degli upload utente.

Razionale (Bug D3 + roadmap K):
- Gli upload utente (foto Menu Carta, in futuro: foto/firma HACCP, allegati ricette,
  ecc.) NON devono finire dentro il repo git. Motivi:
  - vengono SOVRASCRITTI/CANCELLATI ai redeploy (`git clean -fd`)
  - il service worker li cacha come asset SPA → mostra index.html al posto della foto
  - non sono persistenti tra deploy
  - non vanno backuppati con git (sono dati utente, non codice)

Soluzione:
- In **produzione (VPS)**: directory esterna `/home/marco/trgb_uploads/` (override
  via env var `TRGB_UPLOADS_DIR`).
- In **sviluppo locale**: fallback a `<repo>/static/uploads_dev/` (gitignored).
- FastAPI monta `/uploads` → `<UPLOADS_DIR>/` separato da `/static`.
- Il path nel DB diventa `/uploads/<categoria>/<id>/<file>`.

Uso:
    from app.utils.uploads import get_uploads_dir, ensure_subdir

    base = get_uploads_dir()
    foto_dir = ensure_subdir("menu_carta", str(edition_id))
    foto_path = foto_dir / f"{pub_id}.jpg"
    # path da salvare nel DB:
    db_path = f"/uploads/menu_carta/{edition_id}/{pub_id}.jpg"
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Union


# Default produzione: home dell'utente che gira il backend
_DEFAULT_PROD_PATH = "/home/marco/trgb_uploads"

# Default sviluppo locale (Mac di Marco / sandbox): dentro il repo ma gitignored
_DEFAULT_DEV_PATH = "static/uploads_dev"


def _detect_environment() -> str:
    """
    Ritorna "prod" se siamo sul VPS Aruba (produzione), "dev" altrimenti.
    Euristica: presenza di /home/marco/trgb (il repo deploy) o env TRGB_ENV=prod.
    """
    if os.environ.get("TRGB_ENV", "").lower() in ("prod", "production"):
        return "prod"
    if Path("/home/marco/trgb").exists():
        return "prod"
    return "dev"


def get_uploads_dir() -> Path:
    """
    Ritorna la directory base per gli upload utente, garantendo che esista.

    Override esplicito via env: `TRGB_UPLOADS_DIR=/path/assoluto/desiderato`.
    Altrimenti usa il default per environment.

    Crea la directory se non esiste.
    """
    explicit = os.environ.get("TRGB_UPLOADS_DIR", "").strip()
    if explicit:
        p = Path(explicit)
    elif _detect_environment() == "prod":
        p = Path(_DEFAULT_PROD_PATH)
    else:
        # In dev usa path relativo al cwd del backend (BASE_DIR del repo)
        p = Path(__file__).resolve().parents[2] / _DEFAULT_DEV_PATH

    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"⚠️ get_uploads_dir: impossibile creare {p}: {e}")
    return p


def ensure_subdir(*parts: Union[str, int]) -> Path:
    """
    Ritorna un sotto-path di get_uploads_dir() creandolo se non esiste.
    Es.: ensure_subdir("menu_carta", str(edition_id))
    """
    base = get_uploads_dir()
    sub = base.joinpath(*[str(p) for p in parts])
    sub.mkdir(parents=True, exist_ok=True)
    return sub


def to_db_path(*parts: Union[str, int]) -> str:
    """
    Costruisce il path RELATIVO da salvare nel DB (servito via mount /uploads).
    Es.: to_db_path("menu_carta", edition_id, f"{pub_id}.jpg")
         → "/uploads/menu_carta/12/345.jpg"
    """
    cleaned = [str(p).strip("/") for p in parts]
    return "/uploads/" + "/".join(cleaned)
