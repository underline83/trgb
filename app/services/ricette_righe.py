# Modulo: ricette (servizio platform: scrittura puntuale per altri moduli)  ·  [core]
# @version: v1.0 — grammatura di una riga di ricetta dal Controllo menu (2026-11-13)
# -*- coding: utf-8 -*-
"""
ricette_righe — la sola scrittura sulle righe di ricetta che un altro modulo
puo' chiedere: cambiare la grammatura (quantita' e unita') di UNA riga.

Serve al Controllo menu (modulo cucina), che e' il «libro mastro» di Marco:
da li' si corregge la grammatura a porzione senza aprire la ricetta. Passa di
qui e non dal router delle ricette (regole 2 e 4 della disciplina modulare).

Non tocca ingredienti ne' preparazioni della riga: gli allergeni non cambiano,
quindi nessun ricalcolo. Il food cost si calcola alla lettura.
"""
from typing import Any, Dict

from app.services.ricette_qb import is_qb


def aggiorna_grammatura(conn, item_id: int, qty: float, unit: str) -> Dict[str, Any]:
    unit = (unit or "").strip()
    if not unit:
        raise ValueError("serve l'unità (g, ml, pz…)")
    if is_qb(unit):
        qty, unit = 0.0, "qb"
    elif qty is None or qty <= 0:
        raise ValueError("quantità maggiore di zero (o unità 'qb')")
    riga = conn.execute("SELECT id, recipe_id FROM recipe_items WHERE id = ?", (item_id,)).fetchone()
    if not riga:
        raise ValueError("riga di ricetta non trovata")
    conn.execute("UPDATE recipe_items SET qty = ?, unit = ? WHERE id = ?", (qty, unit, item_id))
    conn.execute("UPDATE recipes SET updated_at = datetime('now','localtime') WHERE id = ?", (riga[1],))
    return {"item_id": item_id, "recipe_id": riga[1], "qty": qty, "unit": unit}
