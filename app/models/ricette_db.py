#!/usr/bin/env python3
# @version: v0.1
# -*- coding: utf-8 -*-
"""
TRE GOBBI — Modello DB Ricette & Ingredienti
────────────────────────────────────────────
Gestisce:
- Tabella ingredients (master condiviso con foodcost)
- Tabella recipes
- Tabella recipe_items (ingredienti + sotto-ricette)
- Tabella recipe_steps (procedimento)

Questo è un primo schema minimale, espandibile in seguito.
"""

import sqlite3
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

RICETTE_DB_PATH = DATA_DIR / "ricette.sqlite3"


def get_conn():
    conn = sqlite3.connect(RICETTE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_ricette_db():
    """Crea le tabelle se non esistono."""
    conn = get_conn()
    cur = conn.cursor()

    # MASTER INGREDIENTI
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ingredients (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            code            TEXT UNIQUE,
            name            TEXT NOT NULL,
            category        TEXT,
            unit_default    TEXT,
            yield_factor    REAL DEFAULT 1.0,
            last_price      REAL,
            last_price_unit TEXT,
            supplier_default TEXT
        );
        """
    )

    # RICETTE
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS recipes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_code     TEXT UNIQUE,
            name            TEXT NOT NULL,
            category        TEXT,
            portion_yield   REAL,
            unit_portion    TEXT,
            status          TEXT,  -- draft / test / confirmed
            notes           TEXT,
            version         TEXT,
            created_at      TEXT,
            updated_at      TEXT
        );
        """
    )

    # RIGHE INGREDIENTI / SOTTO-RICETTE
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id       INTEGER NOT NULL,
            ingredient_id   INTEGER,
            sub_recipe_id   INTEGER,
            quantity        REAL,
            unit            TEXT,
            note            TEXT,
            order_index     INTEGER,
            FOREIGN KEY (recipe_id)    REFERENCES recipes(id) ON DELETE CASCADE,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY (sub_recipe_id) REFERENCES recipes(id)
        );
        """
    )

    # STEP PROCEDIMENTO
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_steps (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id       INTEGER NOT NULL,
            order_index     INTEGER,
            text            TEXT,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        );
        """
    )

    conn.commit()
    conn.close()


# ─────────────────────────────────────────────────────────
# HELPER INGREDIENTI (SEMPLICI, PER AUTOCOMPLETE/CREAZIONE)
# ─────────────────────────────────────────────────────────

def search_ingredients(query: str | None = None, limit: int = 50):
    conn = get_conn()
    cur = conn.cursor()
    if query:
        cur.execute(
            """
            SELECT * FROM ingredients
            WHERE name LIKE ? OR code LIKE ?
            ORDER BY name
            LIMIT ?
            """,
            (f"%{query}%", f"%{query}%", limit),
        )
    else:
        cur.execute(
            """
            SELECT * FROM ingredients
            ORDER BY name
            LIMIT ?
            """,
            (limit,),
        )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def create_ingredient(data: dict) -> dict:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO ingredients
        (code, name, category, unit_default, yield_factor,
         last_price, last_price_unit, supplier_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("code"),
            data["name"],
            data.get("category"),
            data.get("unit_default"),
            data.get("yield_factor", 1.0),
            data.get("last_price"),
            data.get("last_price_unit"),
            data.get("supplier_default"),
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return get_ingredient(new_id)


def get_ingredient(ingredient_id: int) -> dict | None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM ingredients WHERE id = ?", (ingredient_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


# ─────────────────────────────────────────────────────────
# HELPER RICETTE (BASE CRUD + IMPORT/EXPORT JSON)
# ─────────────────────────────────────────────────────────

def list_recipes():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, recipe_code, name, category, status,
               version, updated_at
        FROM recipes
        ORDER BY updated_at DESC NULLS LAST, name
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_recipe_full(recipe_id: int) -> dict | None:
    """Restituisce ricetta con ingredienti e steps."""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,))
    r = cur.fetchone()
    if not r:
        conn.close()
        return None
    recipe = dict(r)

    # items
    cur.execute(
        """
        SELECT * FROM recipe_items
        WHERE recipe_id = ?
        ORDER BY order_index ASC, id ASC
        """,
        (recipe_id,),
    )
    recipe["items"] = [dict(row) for row in cur.fetchall()]

    # steps
    cur.execute(
        """
        SELECT * FROM recipe_steps
        WHERE recipe_id = ?
        ORDER BY order_index ASC, id ASC
        """,
        (recipe_id,),
    )
    recipe["steps"] = [dict(row) for row in cur.fetchall()]

    conn.close()
    return recipe


def create_or_update_recipe(payload: dict, recipe_id: int | None = None) -> int:
    """
    Crea o aggiorna una ricetta + sue righe + steps.
    payload deve contenere:
      metadata, items, steps (vedi schema JSON che abbiamo definito).
    """
    now = datetime.utcnow().isoformat(timespec="seconds")

    meta = payload.get("metadata", {})
    items = payload.get("ingredients", [])
    steps = payload.get("steps", [])

    conn = get_conn()
    cur = conn.cursor()

    if recipe_id is None:
        cur.execute(
            """
            INSERT INTO recipes
            (recipe_code, name, category, portion_yield, unit_portion,
             status, notes, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                meta.get("code"),
                meta["name"],
                meta.get("category"),
                meta.get("portion_yield"),
                meta.get("unit_portion"),
                meta.get("status"),
                meta.get("notes"),
                meta.get("version"),
                now,
                now,
            ),
        )
        recipe_id = cur.lastrowid
    else:
        cur.execute(
            """
            UPDATE recipes
            SET recipe_code = ?, name = ?, category = ?,
                portion_yield = ?, unit_portion = ?, status = ?,
                notes = ?, version = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                meta.get("code"),
                meta["name"],
                meta.get("category"),
                meta.get("portion_yield"),
                meta.get("unit_portion"),
                meta.get("status"),
                meta.get("notes"),
                meta.get("version"),
                now,
                recipe_id,
            ),
        )

        # puliamo righe e steps per reinserirli
        cur.execute("DELETE FROM recipe_items WHERE recipe_id = ?", (recipe_id,))
        cur.execute("DELETE FROM recipe_steps WHERE recipe_id = ?", (recipe_id,))

    # inserisci items
    order_idx = 0
    for it in items:
        order_idx += 1
        item_type = it.get("type", "ingredient")

        ingredient_id = it.get("ingredient_id")
        sub_recipe_id = it.get("sub_recipe_id")

        # supporto per "type": "sub_recipe"/"ingredient" lato JSON:
        if item_type == "sub_recipe" and not sub_recipe_id:
            sub_recipe_id = it.get("recipe_id")
        # ingredient_id può essere risolto a monte da API (per ora lo prendiamo come id diretto)

        cur.execute(
            """
            INSERT INTO recipe_items
            (recipe_id, ingredient_id, sub_recipe_id,
             quantity, unit, note, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recipe_id,
                ingredient_id,
                sub_recipe_id,
                it.get("quantity"),
                it.get("unit"),
                it.get("note"),
                order_idx,
            ),
        )

    # inserisci steps
    order_idx = 0
    for text in steps:
        order_idx += 1
        cur.execute(
            """
            INSERT INTO recipe_steps
            (recipe_id, order_index, text)
            VALUES (?, ?, ?)
            """,
            (recipe_id, order_idx, text),
        )

    conn.commit()
    conn.close()
    return recipe_id


def delete_recipe(recipe_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM recipe_items WHERE recipe_id = ?", (recipe_id,))
    cur.execute("DELETE FROM recipe_steps WHERE recipe_id = ?", (recipe_id,))
    cur.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    conn.commit()
    conn.close()