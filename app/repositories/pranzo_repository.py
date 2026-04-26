#!/usr/bin/env python3
# @version: v1.0-pranzo-repository
# -*- coding: utf-8 -*-
"""
Repository Pranzo — sessione 58 (2026-04-26)

Modulo Pranzo del Giorno (sub-voce Gestione Cucina).
Schema in foodcost.db (mig 102): pranzo_piatti, pranzo_menu,
pranzo_menu_righe, pranzo_settings.

Funzioni:
  - Catalogo: list_piatti, get_piatto, create_piatto, update_piatto, delete_piatto
  - Settings: get_settings, update_settings
  - Menu del giorno (upsert per data): get_menu_by_data, upsert_menu, delete_menu
  - Archivio: list_menu (con filtri data_da/data_a)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.foodcost_db import get_foodcost_connection


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _row_to_dict(row) -> Dict[str, Any]:
    return dict(row) if row else {}


# ─────────────────────────────────────────────────────────────
# CATALOGO PIATTI
# ─────────────────────────────────────────────────────────────
CATEGORIE_VALIDE = {"antipasto", "primo", "secondo", "contorno", "dolce", "altro"}
ORDINE_CATEGORIA = {"antipasto": 1, "primo": 2, "secondo": 3, "contorno": 4, "dolce": 5, "altro": 6}


def list_piatti(solo_attivi: bool = True) -> List[Dict[str, Any]]:
    conn = get_foodcost_connection()
    try:
        sql = "SELECT * FROM pranzo_piatti"
        params: List[Any] = []
        if solo_attivi:
            sql += " WHERE attivo = 1"
        sql += " ORDER BY categoria, nome COLLATE NOCASE"
        rows = conn.execute(sql, params).fetchall()
        # ordino per ORDINE_CATEGORIA fisso (antipasto<primo<secondo...)
        result = [_row_to_dict(r) for r in rows]
        result.sort(key=lambda p: (ORDINE_CATEGORIA.get(p["categoria"], 99), p["nome"].lower()))
        return result
    finally:
        conn.close()


def get_piatto(piatto_id: int) -> Optional[Dict[str, Any]]:
    conn = get_foodcost_connection()
    try:
        row = conn.execute("SELECT * FROM pranzo_piatti WHERE id = ?", (piatto_id,)).fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def create_piatto(nome: str, categoria: str, note: str = None, recipe_id: int = None) -> Dict[str, Any]:
    if categoria not in CATEGORIE_VALIDE:
        raise ValueError(f"categoria non valida: {categoria}")
    conn = get_foodcost_connection()
    try:
        cur = conn.execute(
            """INSERT INTO pranzo_piatti (nome, categoria, note, recipe_id, attivo, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, ?, ?)""",
            (nome.strip(), categoria, note, recipe_id, _now(), _now()),
        )
        conn.commit()
        return get_piatto(cur.lastrowid)
    finally:
        conn.close()


def update_piatto(piatto_id: int, **fields) -> Optional[Dict[str, Any]]:
    allowed = {"nome", "categoria", "note", "recipe_id", "attivo"}
    set_fields = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not set_fields:
        return get_piatto(piatto_id)
    if "categoria" in set_fields and set_fields["categoria"] not in CATEGORIE_VALIDE:
        raise ValueError(f"categoria non valida: {set_fields['categoria']}")
    conn = get_foodcost_connection()
    try:
        sets = ", ".join(f"{k} = ?" for k in set_fields)
        params = list(set_fields.values()) + [_now(), piatto_id]
        conn.execute(f"UPDATE pranzo_piatti SET {sets}, updated_at = ? WHERE id = ?", params)
        conn.commit()
        return get_piatto(piatto_id)
    finally:
        conn.close()


def delete_piatto(piatto_id: int, hard: bool = False) -> bool:
    """Soft delete (attivo=0) di default. hard=True elimina davvero (CASCADE su righe scarica piatto_id a NULL)."""
    conn = get_foodcost_connection()
    try:
        if hard:
            conn.execute("DELETE FROM pranzo_piatti WHERE id = ?", (piatto_id,))
        else:
            conn.execute("UPDATE pranzo_piatti SET attivo = 0, updated_at = ? WHERE id = ?", (_now(), piatto_id))
        conn.commit()
        return True
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────────────────────────
def get_settings() -> Dict[str, Any]:
    conn = get_foodcost_connection()
    try:
        row = conn.execute("SELECT * FROM pranzo_settings WHERE id = 1").fetchone()
        if not row:
            # safety: rein-seed se assente
            conn.execute("INSERT OR IGNORE INTO pranzo_settings (id) VALUES (1)")
            conn.commit()
            row = conn.execute("SELECT * FROM pranzo_settings WHERE id = 1").fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


def update_settings(**fields) -> Dict[str, Any]:
    allowed = {
        "titolo_default",
        "sottotitolo_default",
        "titolo_business",
        "prezzo_1_default",
        "prezzo_2_default",
        "prezzo_3_default",
        "footer_default",
    }
    set_fields = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not set_fields:
        return get_settings()
    conn = get_foodcost_connection()
    try:
        sets = ", ".join(f"{k} = ?" for k in set_fields)
        params = list(set_fields.values()) + [_now()]
        conn.execute(f"UPDATE pranzo_settings SET {sets}, updated_at = ? WHERE id = 1", params)
        conn.commit()
    finally:
        conn.close()
    return get_settings()


# ─────────────────────────────────────────────────────────────
# MENU DEL GIORNO
# ─────────────────────────────────────────────────────────────
def get_menu_by_data(data: str) -> Optional[Dict[str, Any]]:
    """
    Ritorna menu del giorno completo: testata + righe ordinate.
    data formato 'YYYY-MM-DD'.
    """
    conn = get_foodcost_connection()
    try:
        row = conn.execute("SELECT * FROM pranzo_menu WHERE data = ?", (data,)).fetchone()
        if not row:
            return None
        menu = _row_to_dict(row)
        righe = conn.execute(
            """SELECT r.*, p.nome AS piatto_nome_catalogo
                 FROM pranzo_menu_righe r
                 LEFT JOIN pranzo_piatti p ON p.id = r.piatto_id
                WHERE r.menu_id = ?
                ORDER BY r.ordine, r.id""",
            (menu["id"],),
        ).fetchall()
        menu["righe"] = [_row_to_dict(r) for r in righe]
        return menu
    finally:
        conn.close()


def list_menu(data_da: Optional[str] = None, data_a: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    """Archivio: lista testate (no righe) ordinata per data DESC."""
    conn = get_foodcost_connection()
    try:
        sql = """SELECT m.*, COUNT(r.id) AS n_piatti
                   FROM pranzo_menu m
                   LEFT JOIN pranzo_menu_righe r ON r.menu_id = m.id
                  WHERE 1=1"""
        params: List[Any] = []
        if data_da:
            sql += " AND m.data >= ?"
            params.append(data_da)
        if data_a:
            sql += " AND m.data <= ?"
            params.append(data_a)
        sql += " GROUP BY m.id ORDER BY m.data DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def upsert_menu(
    data: str,
    righe: List[Dict[str, Any]],
    *,
    titolo: Optional[str] = None,
    sottotitolo: Optional[str] = None,
    prezzo_1: Optional[float] = None,
    prezzo_2: Optional[float] = None,
    prezzo_3: Optional[float] = None,
    footer_note: Optional[str] = None,
    stato: str = "bozza",
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Crea o sostituisce il menu del giorno per `data`.
    righe = [{"piatto_id": int|None, "nome": str, "categoria": str, "ordine": int, "note": str|None}, ...]
    """
    if stato not in ("bozza", "pubblicato", "archiviato"):
        raise ValueError(f"stato non valido: {stato}")

    settings = get_settings()
    # default da settings se non passati
    if prezzo_1 is None:
        prezzo_1 = settings["prezzo_1_default"]
    if prezzo_2 is None:
        prezzo_2 = settings["prezzo_2_default"]
    if prezzo_3 is None:
        prezzo_3 = settings["prezzo_3_default"]

    conn = get_foodcost_connection()
    try:
        existing = conn.execute("SELECT id FROM pranzo_menu WHERE data = ?", (data,)).fetchone()
        if existing:
            menu_id = existing["id"]
            conn.execute(
                """UPDATE pranzo_menu
                      SET titolo = ?, sottotitolo = ?,
                          prezzo_1 = ?, prezzo_2 = ?, prezzo_3 = ?,
                          footer_note = ?, stato = ?, updated_at = ?
                    WHERE id = ?""",
                (titolo, sottotitolo, prezzo_1, prezzo_2, prezzo_3, footer_note, stato, _now(), menu_id),
            )
            conn.execute("DELETE FROM pranzo_menu_righe WHERE menu_id = ?", (menu_id,))
        else:
            cur = conn.execute(
                """INSERT INTO pranzo_menu (data, titolo, sottotitolo,
                                            prezzo_1, prezzo_2, prezzo_3,
                                            footer_note, stato, created_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (data, titolo, sottotitolo, prezzo_1, prezzo_2, prezzo_3,
                 footer_note, stato, created_by, _now(), _now()),
            )
            menu_id = cur.lastrowid

        for idx, r in enumerate(righe):
            categoria = r.get("categoria", "primo")
            if categoria not in CATEGORIE_VALIDE:
                categoria = "altro"
            conn.execute(
                """INSERT INTO pranzo_menu_righe (menu_id, piatto_id, nome, categoria, ordine, note)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    menu_id,
                    r.get("piatto_id"),
                    (r.get("nome") or "").strip(),
                    categoria,
                    r.get("ordine", idx),
                    r.get("note"),
                ),
            )
        conn.commit()
    finally:
        conn.close()

    return get_menu_by_data(data)


def delete_menu(data: str) -> bool:
    conn = get_foodcost_connection()
    try:
        cur = conn.execute("DELETE FROM pranzo_menu WHERE data = ?", (data,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
