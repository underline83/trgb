#!/usr/bin/env python3
# @version: v1.1-uploads-fuori-repo (Modulo K, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Servizio gestione immagini piatti Menu Carta (Modulo D audit cucina).

Pipeline:
  upload bytes → resize max 1200x800 → JPEG quality 85
  → salvataggio in <UPLOADS_DIR>/menu_carta/<edition_id>/<pub_id>.jpg
  → ritorno path relativo `/uploads/menu_carta/<edition_id>/<pub_id>.jpg`
    da salvare in menu_dish_publications.foto_path

Modulo K (sessione 59 cont. d, 2026-04-27): le immagini ORA risiedono FUORI
dal repo git (default `/home/marco/trgb_uploads/` in produzione, dev usa
`<repo>/static/uploads_dev/`). Vedi `app/utils/uploads.py`. Risolve bug D3
(SW cache + git clean al deploy).

I path legacy `/static/menu_carta/...` salvati nel DB prima di K continuano
a funzionare perché il mount `/static` resta attivo — i file vecchi sono
sotto `static/menu_carta/` finché non vengono ricaricati o spostati a mano
sul VPS (vedi docs/deploy.md sezione "Upload utente").

Resize a 1200x800 max (mantiene aspect ratio): coerente con uso futuro:
  - Anteprima editoriale in MenuCartaDettaglio
  - Carta cliente pubblica (Modulo G) — risoluzione retina, bandwidth contenuta
  - PDF stampabile — qualita' sufficiente a 300dpi su slot 8x6cm

Format JPEG quality 85: bilancio qualita'/dimensione (~150-300KB per foto piatto).
PNG e WebP non gestiti per semplicita': converti tutto a JPEG con sfondo bianco
in caso di trasparenza.
"""
from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image, ImageOps

from app.utils.uploads import get_uploads_dir, ensure_subdir, to_db_path

logger = logging.getLogger("menu_carta_image")


# ─────────────────────────────────────────────────────────────
# Path resolution — Modulo K: tutto via app.utils.uploads
# ─────────────────────────────────────────────────────────────
# Il path nel DB diventa /uploads/menu_carta/<eid>/<pid>.jpg.
# I path legacy `/static/menu_carta/<eid>/<pid>.jpg` restano leggibili dal
# mount /static esistente, finche' non vengono ricaricati o migrati a mano
# (vedi docs/deploy.md sezione "Upload utente").

# Path legacy (per compat read di vecchi file ancora dentro il repo).
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
LEGACY_STATIC_MENU_CARTA = _BASE_DIR / "static" / "menu_carta"


def _menu_carta_dir(edition_id: int) -> Path:
    """Sotto-directory degli upload per un'edizione di Menu Carta."""
    return ensure_subdir("menu_carta", str(edition_id))


def _ensure_dir(path: Path) -> None:
    """Crea la directory se non esiste, idempotente."""
    path.mkdir(parents=True, exist_ok=True)


# ─────────────────────────────────────────────────────────────
# Costanti immagine
# ─────────────────────────────────────────────────────────────
MAX_WIDTH = 1200
MAX_HEIGHT = 800
JPEG_QUALITY = 85
ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB hard limit (input cliente)


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────
def save_publication_image(
    edition_id: int,
    pub_id: int,
    file_bytes: bytes,
    original_filename: Optional[str] = None,
) -> str:
    """
    Salva l'immagine ridimensionata per una pubblicazione Menu Carta.

    Args:
        edition_id: id dell'edizione (per organizzazione cartelle)
        pub_id: id della pubblicazione (filename)
        file_bytes: bytes raw caricati dall'utente
        original_filename: nome originale (per validare estensione, opzionale)

    Returns:
        Path relativo da salvare in menu_dish_publications.foto_path,
        es. "/uploads/menu_carta/12/345.jpg" (Modulo K, dal 2026-04-27).
        Pre-K il path era "/static/menu_carta/...". Vedi compat in
        delete/get sotto.

    Raises:
        ValueError: file troppo grande, formato non supportato, o immagine corrotta
    """
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(f"File troppo grande: {len(file_bytes) // 1024}KB > 10MB max")

    if original_filename:
        ext = Path(original_filename).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise ValueError(f"Estensione non supportata: {ext}. Ammesse: {', '.join(ALLOWED_EXT)}")

    # Apri con Pillow (gestisce automaticamente molti formati)
    try:
        img = Image.open(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"Immagine non valida o corrotta: {e}")

    # Auto-rotate via EXIF (foto da smartphone hanno orientation tag)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # Convert to RGB (gestisce PNG con alpha → sfondo bianco)
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Resize mantenendo aspect ratio (Pillow .thumbnail modifica in-place)
    img.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.Resampling.LANCZOS)

    # Path destinazione — Modulo K: FUORI dal repo
    edition_dir = _menu_carta_dir(edition_id)
    dest_path = edition_dir / f"{pub_id}.jpg"

    # Salva JPEG
    img.save(dest_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)

    # Path relativo per FE/DB — servito via mount /uploads
    rel_path = to_db_path("menu_carta", edition_id, f"{pub_id}.jpg")
    logger.info(f"[menu_carta_image] saved pub={pub_id} edition={edition_id} → {dest_path} ({dest_path.stat().st_size} bytes) → DB={rel_path}")
    return rel_path


def _resolve_existing_path(edition_id: int, pub_id: int) -> Optional[Path]:
    """
    Trova il file immagine in uno dei due path possibili:
    - NUOVO (Modulo K): <UPLOADS_DIR>/menu_carta/<eid>/<pid>.jpg
    - LEGACY (pre-K):   <repo>/static/menu_carta/<eid>/<pid>.jpg

    Restituisce il primo path che esiste, None se nessuno.
    """
    new_path = get_uploads_dir() / "menu_carta" / str(edition_id) / f"{pub_id}.jpg"
    if new_path.exists():
        return new_path
    legacy_path = LEGACY_STATIC_MENU_CARTA / str(edition_id) / f"{pub_id}.jpg"
    if legacy_path.exists():
        return legacy_path
    return None


def delete_publication_image(edition_id: int, pub_id: int) -> bool:
    """
    Rimuove il file immagine di una pubblicazione (se esiste, cerca in entrambi i path).
    Ritorna True se ha cancellato, False se il file non esisteva.
    """
    dest_path = _resolve_existing_path(edition_id, pub_id)
    if dest_path is not None:
        try:
            dest_path.unlink()
            logger.info(f"[menu_carta_image] deleted pub={pub_id} edition={edition_id} ({dest_path})")
            return True
        except Exception as e:
            logger.error(f"[menu_carta_image] delete fail pub={pub_id}: {e}")
            return False
    return False


def get_image_size(edition_id: int, pub_id: int) -> Optional[Tuple[int, int]]:
    """Helper diagnostico: dimensioni dell'immagine se esiste, altrimenti None."""
    dest_path = _resolve_existing_path(edition_id, pub_id)
    if dest_path is None:
        return None
    try:
        with Image.open(dest_path) as img:
            return img.size
    except Exception:
        return None
