# Modulo: ricette (food cost) — legge l'impostazione del sotto-modulo pranzo
"""
Prezzo di riferimento per il food cost di una ricetta (2026-10-25, mig 212).

Il food cost è costo per porzione / prezzo di vendita. I piatti del pranzo di
lavoro non hanno un prezzo proprio (il cliente paga il Menù Business), quindi
si usa un valore fisso per piatto, configurato in Impostazioni → Menu Pranzo
(`pranzo_settings.valore_piatto_fc`, default 10 €).

Regola (decisione Marco 2026-10-25):
  - la ricetta ha un prezzo suo (> 0)          → vince quello   (fonte "ricetta")
  - piatto del pranzo senza prezzo suo          → valore pranzo  (fonte "pranzo")
  - altrimenti                                  → nessun prezzo  (food cost n/d)
  - piatto del pranzo CON prezzo suo            → in più si calcola il food cost
    «pranzo» (food_cost_pct_pranzo), mostrato solo nella scheda ricetta.

Un piatto è «del pranzo» se è collegato al tipo servizio PRANZO_SERVICE_NAME
(stessa identificazione di pranzo_repository.list_piatti_disponibili, che usa
questa costante). Le basi (is_base=1) non sono mai piatti del pranzo.

Servizio platform: il router ricette e lo storico FC lo chiamano invece di
leggere a mano pranzo_settings (niente import fra router di moduli diversi).
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, Optional, Set

PRANZO_SERVICE_NAME = "Pranzo di lavoro"


def valore_piatto_pranzo(cur) -> Optional[float]:
    """Valore di vendita del piatto del pranzo da Impostazioni (None se assente o 0)."""
    try:
        row = cur.execute(
            "SELECT valore_piatto_fc FROM pranzo_settings WHERE id = 1"
        ).fetchone()
    except Exception:
        return None  # tabella/colonna non ancora create (pre-mig 212)
    if not row:
        return None
    v = row[0]
    return float(v) if v is not None and float(v) > 0 else None


def ricette_pranzo(cur, recipe_ids: Optional[Iterable[int]] = None) -> Set[int]:
    """Id delle ricette (non basi) collegate al tipo servizio del pranzo, attivo."""
    sql = """
        SELECT DISTINCT rst.recipe_id
          FROM recipe_service_types rst
          JOIN service_types st ON st.id = rst.service_type_id
          JOIN recipes r        ON r.id = rst.recipe_id
         WHERE st.name = ? AND st.active = 1 AND COALESCE(r.is_base, 0) = 0
    """
    params: list = [PRANZO_SERVICE_NAME]
    ids = list(recipe_ids) if recipe_ids is not None else None
    if ids is not None:
        if not ids:
            return set()
        sql += f" AND rst.recipe_id IN ({','.join('?' * len(ids))})"
        params.extend(ids)
    try:
        return {row[0] for row in cur.execute(sql, params).fetchall()}
    except Exception:
        return set()  # tabelle servizi assenti (pre-mig 074)


def contesto_pranzo(cur, recipe_ids: Optional[Iterable[int]] = None) -> Dict[str, Any]:
    """Una lettura sola per le liste: {"valore": float|None, "ids": set}."""
    valore = valore_piatto_pranzo(cur)
    return {"valore": valore, "ids": ricette_pranzo(cur, recipe_ids) if valore else set()}


def prezzo_riferimento(cur, recipe: Dict[str, Any], ctx: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Ritorna {"prezzo": float|None, "fonte": "ricetta"|"pranzo"|None,
             "valore_pranzo": float|None}.
    `valore_pranzo` è valorizzato quando la ricetta è un piatto del pranzo
    (anche se ha un prezzo suo: serve per il food cost «pranzo» secondario).
    """
    if ctx is None:
        ctx = contesto_pranzo(cur, [recipe["id"]])
    valore = ctx.get("valore")
    is_pranzo = bool(valore) and recipe["id"] in ctx.get("ids", set())
    valore_pranzo = valore if is_pranzo else None

    sp = recipe.get("selling_price")
    if sp is not None and sp > 0:
        return {"prezzo": float(sp), "fonte": "ricetta", "valore_pranzo": valore_pranzo}
    if is_pranzo:
        return {"prezzo": valore, "fonte": "pranzo", "valore_pranzo": valore_pranzo}
    return {"prezzo": None, "fonte": None, "valore_pranzo": None}
