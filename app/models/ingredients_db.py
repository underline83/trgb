# @version: v0.1
"""
Database ingredienti / materie prime — TRGB

• File: app/data/ingredients.sqlite3
• Tabella principale: ingredients
"""

import sqlite3
from pathlib import Path
from typing import List, Dict, Any, Optional

BASE_DIR = Path(__file__).resolve().parents[2]   # progetto /trgb_web
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "ingredients.sqlite3"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_ingredients_db() -> None:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ingredients (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            code        TEXT UNIQUE,
            name        TEXT NOT NULL,
            category    TEXT,
            unit        TEXT,
            last_price  REAL,
            notes       TEXT,
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    conn.commit()
    conn.close()
    print(f"✔ ingredients.sqlite3 pronto in {DB_PATH}")


def list_ingredients(
    q: Optional[str] = None,
    category: Optional[str] = None,
) -> List[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.cursor()

    sql = "SELECT * FROM ingredients WHERE is_active = 1"
    params: list[Any] = []

    if q:
        sql += " AND (name LIKE ? OR code LIKE ?)"
        like = f"%{q}%"
        params.extend([like, like])

    if category and category != "ALL":
        sql += " AND category = ?"
        params.append(category)

    sql += " ORDER BY name COLLATE NOCASE"

    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def list_categories() -> List[str]:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT DISTINCT category FROM ingredients WHERE category IS NOT NULL AND category <> '' ORDER BY category"
    )
    rows = [r[0] for r in cur.fetchall()]
    conn.close()
    return rows


def insert_ingredient(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO ingredients (code, name, category, unit, last_price, notes, is_active)
        VALUES (:code, :name, :category, :unit, :last_price, :notes, 1)
        """,
        {
            "code": data.get("code"),
            "name": data["name"],
            "category": data.get("category"),
            "unit": data.get("unit"),
            "last_price": data.get("last_price"),
            "notes": data.get("notes"),
        },
    )
    conn.commit()
    new_id = cur.lastrowid

    cur.execute("SELECT * FROM ingredients WHERE id = ?", (new_id,))
    row = dict(cur.fetchone())
    conn.close()
    return row


def update_ingredient(ing_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE ingredients
        SET code = :code,
            name = :name,
            category = :category,
            unit = :unit,
            last_price = :last_price,
            notes = :notes,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
        """,
        {
            "id": ing_id,
            "code": data.get("code"),
            "name": data["name"],
            "category": data.get("category"),
            "unit": data.get("unit"),
            "last_price": data.get("last_price"),
            "notes": data.get("notes"),
        },
    )
    conn.commit()

    cur.execute("SELECT * FROM ingredients WHERE id = ?", (ing_id,))
    row = dict(cur.fetchone())
    conn.close()
    return row


def delete_ingredient(ing_id: int) -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE ingredients SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (ing_id,),
    )
    conn.commit()
    conn.close()