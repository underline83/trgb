#!/usr/bin/env python3
# @version: v1.0-menu-carta-images (Modulo D, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Servizio gestione immagini piatti Menu Carta (Modulo D audit cucina).

Pipeline:
  upload bytes → resize max 1200x800 → JPEG quality 85
  → salvataggio in static/menu_carta/<edition_id>/<pub_id>.jpg
  → ritorno path relativo per menu_dish_publications.foto_path

Le immagini risiedono nella cartella `static/` montata da main.py su `/static`,
quindi il browser le richiama come https://<host>/static/menu_carta/<edition_id>/<pub_id>.jpg.

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

logger = logging.getLogger("menu_carta_image")


# ─────────────────────────────────────────────────────────────
# Path resolution
# ─────────────────────────────────────────────────────────────
# main.py: BASE_DIR = Path(__file__).resolve().parent (root del progetto)
# STATIC_DIR = BASE_DIR / "static"
# Qui ricostruiamo la stessa logica per consistenza.
_BASE_DIR = Path(__file__).resolve().parent.parent.parent  # app/services/this.py → root
STATIC_DIR = _BASE_DIR / "static"
MENU_CARTA_DIR = STATIC_DIR / "menu_carta"


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
        es. "/static/menu_carta/12/345.jpg"

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

    # Path destinazione
    edition_dir = MENU_CARTA_DIR / str(edition_id)
    _ensure_dir(edition_dir)
    dest_path = edition_dir / f"{pub_id}.jpg"

    # Salva JPEG
    img.save(dest_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)

    # Path relativo per FE/DB (cache-busting via mtime nel FE se serve)
    rel_path = f"/static/menu_carta/{edition_id}/{pub_id}.jpg"
    logger.info(f"[menu_carta_image] saved pub={pub_id} edition={edition_id} → {dest_path} ({dest_path.stat().st_size} bytes)")
    return rel_path


def delete_publication_image(edition_id: int, pub_id: int) -> bool:
    """
    Rimuove il file immagine di una pubblicazione (se esiste).
    Ritorna True se ha cancellato, False se il file non esisteva.
    """
    dest_path = MENU_CARTA_DIR / str(edition_id) / f"{pub_id}.jpg"
    if dest_path.exists():
        try:
            dest_path.unlink()
            logger.info(f"[menu_carta_image] deleted pub={pub_id} edition={edition_id}")
            return True
        except Exception as e:
            logger.error(f"[menu_carta_image] delete fail pub={pub_id}: {e}")
            return False
    return False


def get_image_size(edition_id: int, pub_id: int) -> Optional[Tuple[int, int]]:
    """Helper diagnostico: dimensioni dell'immagine se esiste, altrimenti None."""
    dest_path = MENU_CARTA_DIR / str(edition_id) / f"{pub_id}.jpg"
    if not dest_path.exists():
        return None
    try:
        with Image.open(dest_path) as img:
            return img.size
    except Exception:
        return None
