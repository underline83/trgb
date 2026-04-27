#!/usr/bin/env python3
# @version: v1.0-foodcost-history (Modulo F.2, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Servizio storico variazione Food Cost ricette (Modulo F.2 audit cucina).

Ricostruisce il Food Cost di una ricetta in N snapshot temporali (mensili
o settimanali) usando i prezzi degli ingredienti **vigenti in quella data**
(query `ingredient_prices` con `price_date <= snapshot_date`).

Per ogni snapshot:
  - costo_totale = sum(item.qty * unit_price_alla_data)
  - cost_per_unit = costo_totale / yield_qty
  - food_cost_pct = (cost_per_unit / selling_price) * 100

Use case (Modulo F.2):
  - UI scheda ricetta tab Storico: grafico Recharts trend FC ultimi 6 mesi
  - Alert M.F (futuro): se variazione FC >20% in 30 giorni → notifica admin/chef
  - Reportistica: identifica ricette con prezzi instabili

Formato output:
[
  {
    "data": "2025-11-01",
    "label": "nov 2025",
    "total_cost": 4.50,
    "cost_per_unit": 4.50,
    "food_cost_pct": 18.0,
    "selling_price": 25.00,
    "n_ingredienti_con_prezzo": 5,
    "n_ingredienti_totali": 6,
    "completezza_pct": 83.3
  },
  ...
]

I valori `null` su una data significano: non c'erano abbastanza prezzi storici
per ricostruire il FC (es. mese precedente alla prima fattura).
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from app.models.cucina_db import get_cucina_connection

logger = logging.getLogger("foodcost_history")

MESI_ABBR = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]


def _label_data(d: date, intervallo: str = "mese") -> str:
    if intervallo == "mese":
        return f"{MESI_ABBR[d.month - 1]} {d.year}"
    return d.isoformat()


def _genera_snapshot_dates(giorni: int, intervallo: str = "mese") -> List[date]:
    """
    Genera date snapshot retroattive da oggi.
    intervallo='mese' → 1 snapshot al primo di ogni mese, ultimi N giorni
    intervallo='settimana' → 1 snapshot a lunedì di ogni settimana, ultimi N giorni
    """
    oggi = date.today()
    dates: List[date] = []
    if intervallo == "mese":
        # Calcola N mesi retroattivi
        n_mesi = max(1, (giorni // 30) + 1)
        anno, mese = oggi.year, oggi.month
        for _ in range(n_mesi):
            dates.append(date(anno, mese, 1))
            mese -= 1
            if mese == 0:
                mese = 12
                anno -= 1
        dates.reverse()
    else:
        # Settimanale: lunedì
        d = oggi - timedelta(days=oggi.weekday())
        n_sett = max(1, giorni // 7)
        for i in range(n_sett):
            dates.append(d - timedelta(weeks=(n_sett - 1 - i)))
    return dates


def _compute_recipe_cost_at_date(
    conn, recipe_id: int, snapshot_date: date, _visited: Optional[set] = None
) -> Dict[str, Any]:
    """
    Calcola costo ricetta usando prezzi vigenti alla data snapshot.

    Ritorna dict con:
      - total_cost: float | None
      - cost_per_unit: float | None
      - n_ingredienti_con_prezzo: int
      - n_ingredienti_totali: int
    """
    if _visited is None:
        _visited = set()
    if recipe_id in _visited:
        return {"total_cost": None, "cost_per_unit": None, "n_ingredienti_con_prezzo": 0, "n_ingredienti_totali": 0}
    _visited = _visited | {recipe_id}

    rec = conn.execute(
        "SELECT yield_qty FROM recipes WHERE id = ?",
        (recipe_id,),
    ).fetchone()
    if not rec or not rec["yield_qty"]:
        return {"total_cost": None, "cost_per_unit": None, "n_ingredienti_con_prezzo": 0, "n_ingredienti_totali": 0}
    yield_qty = rec["yield_qty"]

    items = conn.execute(
        "SELECT ingredient_id, sub_recipe_id, qty FROM recipe_items WHERE recipe_id = ?",
        (recipe_id,),
    ).fetchall()
    if not items:
        return {"total_cost": None, "cost_per_unit": None, "n_ingredienti_con_prezzo": 0, "n_ingredienti_totali": 0}

    total = 0.0
    n_ok = 0
    n_tot = len(items)
    for it in items:
        qty = it["qty"] or 0
        unit_cost = None
        if it["ingredient_id"]:
            # Ultimo prezzo <= snapshot_date
            p = conn.execute(
                """SELECT unit_price FROM ingredient_prices
                    WHERE ingredient_id = ? AND price_date <= ?
                    ORDER BY price_date DESC, id DESC LIMIT 1""",
                (it["ingredient_id"], snapshot_date.isoformat()),
            ).fetchone()
            if p:
                unit_cost = p["unit_price"]
        elif it["sub_recipe_id"]:
            sub = _compute_recipe_cost_at_date(conn, it["sub_recipe_id"], snapshot_date, _visited)
            unit_cost = sub.get("cost_per_unit")
        if unit_cost is not None:
            total += qty * unit_cost
            n_ok += 1

    if n_ok == 0:
        return {"total_cost": None, "cost_per_unit": None, "n_ingredienti_con_prezzo": 0, "n_ingredienti_totali": n_tot}

    cost_per_unit = total / yield_qty if yield_qty else None
    return {
        "total_cost": total,
        "cost_per_unit": cost_per_unit,
        "n_ingredienti_con_prezzo": n_ok,
        "n_ingredienti_totali": n_tot,
    }


def compute_recipe_fc_history(
    recipe_id: int,
    giorni: int = 180,
    intervallo: str = "mese",
) -> Dict[str, Any]:
    """
    Genera storico FC ricetta su finestra temporale.

    Args:
        recipe_id: id ricetta
        giorni: finestra retroattiva (default 180 = 6 mesi)
        intervallo: 'mese' (default) o 'settimana'

    Returns:
        {
          "recipe_id": int,
          "recipe_name": str,
          "selling_price": float | None,
          "intervallo": "mese" | "settimana",
          "snapshots": [
              {data, label, total_cost, cost_per_unit, food_cost_pct, ...},
              ...
          ],
          "delta_30gg": {prima: float, dopo: float, delta_pct: float} | None,
          "delta_90gg": {...} | None,
        }
    """
    conn = get_cucina_connection()
    try:
        rec = conn.execute(
            "SELECT id, name, yield_qty, selling_price FROM recipes WHERE id = ?",
            (recipe_id,),
        ).fetchone()
        if not rec:
            return {"recipe_id": recipe_id, "snapshots": [], "error": "Ricetta non trovata"}

        snapshot_dates = _genera_snapshot_dates(giorni, intervallo)
        snapshots = []
        for d in snapshot_dates:
            stats = _compute_recipe_cost_at_date(conn, recipe_id, d)
            food_cost_pct = None
            if stats["cost_per_unit"] is not None and rec["selling_price"]:
                food_cost_pct = (stats["cost_per_unit"] / rec["selling_price"]) * 100
            completezza = 0
            if stats["n_ingredienti_totali"] > 0:
                completezza = (stats["n_ingredienti_con_prezzo"] / stats["n_ingredienti_totali"]) * 100
            snapshots.append({
                "data": d.isoformat(),
                "label": _label_data(d, intervallo),
                "total_cost": round(stats["total_cost"], 2) if stats["total_cost"] is not None else None,
                "cost_per_unit": round(stats["cost_per_unit"], 2) if stats["cost_per_unit"] is not None else None,
                "food_cost_pct": round(food_cost_pct, 1) if food_cost_pct is not None else None,
                "selling_price": rec["selling_price"],
                "n_ingredienti_con_prezzo": stats["n_ingredienti_con_prezzo"],
                "n_ingredienti_totali": stats["n_ingredienti_totali"],
                "completezza_pct": round(completezza, 1),
            })

        # Delta 30gg / 90gg (vs ora vs N gg fa)
        delta_30 = _compute_delta(snapshots, 30)
        delta_90 = _compute_delta(snapshots, 90)

        return {
            "recipe_id": recipe_id,
            "recipe_name": rec["name"],
            "selling_price": rec["selling_price"],
            "intervallo": intervallo,
            "snapshots": snapshots,
            "delta_30gg": delta_30,
            "delta_90gg": delta_90,
        }
    finally:
        conn.close()


def _compute_delta(snapshots: List[Dict[str, Any]], giorni_indietro: int) -> Optional[Dict[str, Any]]:
    """
    Calcola delta % tra snapshot più recente e quello di N giorni fa.
    Ritorna {prima, dopo, delta_pct, delta_assoluto, alert} oppure None se mancano dati.
    """
    if not snapshots or len(snapshots) < 2:
        return None
    # snapshot più recente con dato valido
    snap_now = next((s for s in reversed(snapshots) if s.get("food_cost_pct") is not None), None)
    if not snap_now:
        return None
    target_date = date.fromisoformat(snap_now["data"]) - timedelta(days=giorni_indietro)
    # snapshot più vicino a target_date con dato valido
    candidati = [s for s in snapshots if s.get("food_cost_pct") is not None and date.fromisoformat(s["data"]) <= target_date]
    if not candidati:
        return None
    snap_prima = candidati[-1]  # ultimo prima del target

    fc_prima = snap_prima["food_cost_pct"]
    fc_dopo = snap_now["food_cost_pct"]
    if fc_prima == 0:
        return None
    delta_pct = ((fc_dopo - fc_prima) / fc_prima) * 100
    return {
        "prima": fc_prima,
        "prima_data": snap_prima["data"],
        "dopo": fc_dopo,
        "dopo_data": snap_now["data"],
        "delta_pct": round(delta_pct, 1),
        "delta_assoluto": round(fc_dopo - fc_prima, 1),
        "alert": abs(delta_pct) >= 20,  # alert se variazione >= 20%
    }
