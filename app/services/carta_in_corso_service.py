# Modulo: platform (lettura condivisa del modulo menu_carta) — [core]
# -*- coding: utf-8 -*-
"""
Carta in corso — lettura read-only per gli altri moduli (2026-10-19).

Perché esiste: il PDF dei preventivi (modulo clienti) mostra i dolci della
carta attiva («@dolci_carta» nelle condizioni), così cambia da solo quando
cambia la carta. Regola 4 dei moduli: niente import tra router, il dato
cross-modulo passa da un servizio platform. Questo è quel servizio: legge
menu_editions / menu_dish_publications (foodcost.db, mig 098) e non scrive mai.
"""

from __future__ import annotations

import logging
import re

from app.models.foodcost_db import get_foodcost_connection

logger = logging.getLogger("trgb.carta_in_corso")


def _virgolette(s: str) -> str:
    """"Solero" → “Solero” (le virgolette dritte in carta, curve in stampa)."""
    return re.sub(r'"([^"]+)"', "“\\1”", s)


def piatti_sezione(sezione: str) -> list[str]:
    """Nomi dei piatti visibili di una sezione della carta in_carta, in ordine.
    Lista vuota se non c'è una carta in corso o la sezione è vuota."""
    try:
        conn = get_foodcost_connection()
    except Exception:                               # noqa: BLE001
        logger.exception("foodcost.db non raggiungibile")
        return []
    try:
        ed = conn.execute(
            "SELECT id FROM menu_editions WHERE stato = 'in_carta' LIMIT 1"
        ).fetchone()
        if not ed:
            return []
        rows = conn.execute(
            """SELECT COALESCE(NULLIF(TRIM(p.titolo_override), ''), r.menu_name) AS nome
               FROM menu_dish_publications p
               LEFT JOIN recipes r ON r.id = p.recipe_id
               WHERE p.edition_id = ? AND p.sezione = ? AND p.is_visible = 1
               ORDER BY p.sort_order, p.id""",
            (ed[0], sezione),
        ).fetchall()
        return [_virgolette(r[0].strip()) for r in rows if r[0] and r[0].strip()]
    except Exception:                               # noqa: BLE001 — tabelle assenti su DB vecchi
        logger.exception("Lettura carta in corso fallita")
        return []
    finally:
        conn.close()


def dolci_in_carta() -> list[str]:
    return piatti_sezione("dolci")
