#!/usr/bin/env python3
# @version: v1.0-cucina-db-alias (Fase 0 split DB cucina, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Modulo cucina — connessione DB.

**Fase 0 split (2026-04-27)**: questa funzione e' un ALIAS di
`get_foodcost_connection()`. Punta allo stesso file `foodcost.db`. Zero
impatto runtime. Serve a marcare semanticamente "questa connessione e'
del modulo cucina" e a centralizzare il punto di switch quando arrivera'
la Fase 1 (split fisico in `cucina.sqlite3`).

**Fase 1 (futura)**: cambiare il body di `get_cucina_connection` per
puntare a `app/data/cucina.sqlite3` invece che a `foodcost.db`.
Tutto il codice che usa `get_cucina_connection()` migra automaticamente,
senza altri tocchi.

Cluster CUCINA verificato isolato (PRAGMA foreign_key_list, 2026-04-27):
nessuna FK enforced cross-modulo. Le 14 query del matching fatture
(`foodcost_matching_router.py`) sono cross-cluster ma usano JOIN logico,
non FK. In Fase 1 si gestiranno con ATTACH DATABASE.

Tabelle del cluster CUCINA:
  recipes, recipe_categories, recipe_items, recipe_service_types,
  service_types,
  ingredients, ingredient_categories, ingredient_prices,
  ingredient_supplier_map, ingredient_unit_conversions,
  suppliers,
  menu_editions, menu_dish_publications,
  menu_tasting_paths, menu_tasting_path_steps,
  pranzo_menu, pranzo_menu_righe, pranzo_settings,
  macellaio_*, formaggi_*, pescato_*, salumi_*  (selezioni del giorno)

Riferimenti:
  - docs/roadmap.md punto 1.5
  - docs/inventario_pulizia.md (TODO split DB cucina, 2026-04-27)
  - app/models/foodcost_db.py (sorgente reale della connessione)
"""
from app.models.foodcost_db import get_foodcost_connection


def get_cucina_connection():
    """
    Ritorna una connessione SQLite al cluster CUCINA.

    Fase 0: alias di `get_foodcost_connection()`. Stesso file `foodcost.db`.
    Fase 1: punta a `cucina.sqlite3` separato (con ATTACH DATABASE per
            le query cross-cluster del matching).
    """
    return get_foodcost_connection()
