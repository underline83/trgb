# @version: v1.1 — Modulo K + R4 locale-aware (sessione 60, 2026-04-29)
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
- In **produzione (VPS)**: directory esterna per locale.
  - Default tregobbi: `/home/marco/trgb_uploads` (storico, backward compat)
  - Default altri locali: `/home/marco/trgb_uploads_<TRGB_LOCALE>`
  - Override sempre disponibile via env var `TRGB_UPLOADS_DIR=/path/assoluto`
    (settato nel file `locali/<id>/deploy/env.production`).
- In **sviluppo locale**: fallback a `<repo>/static/uploads_dev/<TRGB_LOCALE>/`
  (gitignored, isolato per locale).
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


# Path storico tregobbi (R4: backward compat — non spostato per non rompere
# i path già scritti nei DB esistenti dell'osteria di Marco).
_DEFAULT_PROD_TREGOBBI = "/home/marco/trgb_uploads"

# Pattern per locali != tregobbi: path costruito da TRGB_LOCALE.
# Es. TRGB_LOCALE=trgb → /home/marco/trgb_uploads_trgb
_DEFAULT_PROD_PATTERN = "/home/marco/trgb_uploads_{locale}"

# Default sviluppo locale (Mac di Marco / sandbox): dentro il repo ma gitignored.
# Sotto-directory per locale per non mescolare upload di test fra istanze.
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


def _current_locale() -> str:
    """R4: ritorna il locale corrente (default 'tregobbi' per backward compat)."""
    return os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"


def get_uploads_dir() -> Path:
    """
    Ritorna la directory base per gli upload utente, garantendo che esista.

    Risoluzione path (in ordine di precedenza):
      1. Override esplicito via env `TRGB_UPLOADS_DIR=/path/assoluto`
         (di solito viene da locali/<id>/deploy/env.production via push.sh).
      2. In prod, locale=tregobbi → /home/marco/trgb_uploads (storico).
      3. In prod, locale=<altro>  → /home/marco/trgb_uploads_<locale>.
      4. In dev → <repo>/static/uploads_dev/<locale>/.

    Crea la directory se non esiste.
    """
    explicit = os.environ.get("TRGB_UPLOADS_DIR", "").strip()
    locale = _current_locale()

    if explicit:
        p = Path(explicit)
    elif _detect_environment() == "prod":
        if locale == "tregobbi":
            p = Path(_DEFAULT_PROD_TREGOBBI)
        else:
            p = Path(_DEFAULT_PROD_PATTERN.format(locale=locale))
    else:
        # Dev locale: isola gli upload di test per locale (così TRGB_LOCALE=trgb
        # non sovrascrive gli upload di tregobbi durante lo sviluppo).
        p = Path(__file__).resolve().parents[2] / _DEFAULT_DEV_PATH / locale

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


# ──────────────────────────────────────────────────────────────
# K-bis (sessione 2026-05-04): helper per moduli che oggi hanno
# UPLOAD_DIR/DOCS_BASE_DIR/_BACKUP_DIR hardcoded a `app/data/<subname>/`.
# Pattern speculare a app/utils/locale_data.py::locale_data_path() — graduale,
# zero downtime: se il path nuovo è vuoto e quello legacy ha file, usa legacy.
# ──────────────────────────────────────────────────────────────

def tenant_dir(subname: str) -> Path:
    """
    Ritorna `<UPLOADS_DIR>/<subname>/` tenant-aware, creandola se non esiste.
    Esempio:
        tenant_dir("admin_finance/uploads") → /home/marco/trgb_uploads/admin_finance/uploads/
        tenant_dir("ipratico_uploads")      → /home/marco/trgb_uploads/ipratico_uploads/
    """
    p = get_uploads_dir() / subname
    p.mkdir(parents=True, exist_ok=True)
    return p


def tenant_dir_with_legacy_fallback(subname: str, legacy_path: Path) -> Path:
    """
    Come tenant_dir(), MA se il nuovo path è vuoto/inesistente e legacy_path
    esiste con almeno un file, ritorna legacy_path. Pensato per la migrazione
    graduale (K-bis): backend continua a leggere file esistenti dal vecchio
    path finché un'operazione manuale (mv) non li sposta nel nuovo.

    Esempio:
        DOCS_BASE_DIR = tenant_dir_with_legacy_fallback(
            "documenti_dipendenti",
            Path("app/data/documenti_dipendenti")
        )

    Una volta che gli operativi hanno fatto `mv` dei file nel nuovo path,
    questa funzione ritorna automaticamente il nuovo path. Backward compat
    assoluta finché legacy_path esiste con dati.
    """
    new = get_uploads_dir() / subname
    if new.exists():
        try:
            if any(new.iterdir()):
                return new
        except Exception:
            pass
    # Nuovo vuoto: prova legacy
    if legacy_path.exists():
        try:
            if any(legacy_path.iterdir()):
                return legacy_path
        except Exception:
            pass
    # Niente trovato: crea il nuovo (futuro-compat)
    new.mkdir(parents=True, exist_ok=True)
    return new


def to_db_path(*parts: Union[str, int]) -> str:
    """
    Costruisce il path RELATIVO da salvare nel DB (servito via mount /uploads).
    Es.: to_db_path("menu_carta", edition_id, f"{pub_id}.jpg")
         → "/uploads/menu_carta/12/345.jpg"
    """
    cleaned = [str(p).strip("/") for p in parts]
    return "/uploads/" + "/".join(cleaned)
