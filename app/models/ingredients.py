# app/models/ingredients.py
# @version: v1.0
# Database ingredienti — condiviso con Food Cost / Ricette

import sqlite3
from pathlib import Path

# Percorso DB: stesso di vini.db
BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "data" / "vini.db"


def get_conn():
    return sqlite3.connect(DB_PATH)


def init_ingredients_table():
    """Crea la tabella ingredienti se non esiste."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ingredients (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT NOT NULL,
                category        TEXT,
                unit            TEXT NOT NULL,   -- g, kg, ml, l, pz, ecc.
                cost_per_unit   REAL,           -- opzionale (€/unità base)
                notes           TEXT
            );
            """
        )
        conn.commit()


def list_ingredients():
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, category, unit, cost_per_unit, notes FROM ingredients ORDER BY name ASC"
        )
        rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "name": r[1],
            "category": r[2],
            "unit": r[3],
            "cost_per_unit": r[4],
            "notes": r[5],
        }
        for r in rows
    ]


def create_ingredient(data: dict) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO ingredients (name, category, unit, cost_per_unit, notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                data.get("name"),
                data.get("category"),
                data.get("unit"),
                data.get("cost_per_unit"),
                data.get("notes"),
            ),
        )
        conn.commit()
        return cur.lastrowid


def update_ingredient(ingredient_id: int, data: dict) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE ingredients
            SET name = ?, category = ?, unit = ?, cost_per_unit = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("name"),
                data.get("category"),
                data.get("unit"),
                data.get("cost_per_unit"),
                data.get("notes"),
                ingredient_id,
            ),
        )
        conn.commit()


def delete_ingredient(ingredient_id: int) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
        conn.commit()


def get_ingredient(ingredient_id: int) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, category, unit, cost_per_unit, notes FROM ingredients WHERE id = ?",
            (ingredient_id,),
        )
        r = cur.fetchone()

    if not r:
        return None

    return {
        "id": r[0],
        "name": r[1],
        "category": r[2],
        "unit": r[3],
        "cost_per_unit": r[4],
        "notes": r[5],
    }