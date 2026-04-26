#!/usr/bin/env python3
# @version: v2.0-pranzo-settimanale-recipes
# -*- coding: utf-8 -*-
"""
Repository Pranzo settimanale — sessione 58 cont. (2026-04-26)

Modulo Pranzo del Giorno (sub-voce Gestione Cucina).
Schema in foodcost.db (mig 102):
  - pranzo_menu      (chiave settimana_inizio = lunedi YYYY-MM-DD)
  - pranzo_menu_righe (FK opz. recipes, snapshot nome+categoria)
  - pranzo_settings  (default globali)

Decisioni architetturali (Marco, S58 cont.):
- Niente catalogo separato `pranzo_piatti`: i piatti si pescano dalle `recipes`
  con tipo servizio "Pranzo di lavoro" (mig 074, service_types).
- La pagina /pranzo e' solo un compositore. Prezzi, testata, footer NON sono
  override per settimana: vivono solo in `pranzo_settings`.
"""
from __future__ import annotations

from datetime import date as date_cls, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.models.foodcost_db import get_foodcost_connection


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
CATEGORIE_VALIDE = {"antipasto", "primo", "secondo", "contorno", "dolce", "altro"}
ORDINE_CATEGORIA = {"antipasto": 1, "primo": 2, "secondo": 3, "contorno": 4, "dolce": 5, "altro": 6}

# Mappatura nome categoria recipes (case-insensitive) -> categoria pranzo
_RECIPE_CAT_MAP = {
    "antipasto": "antipasto", "antipasti": "antipasto",
    "primo": "primo", "primi": "primo",
    "secondo": "secondo", "secondi": "secondo",
    "contorno": "contorno", "contorni": "contorno",
    "dolce": "dolce", "dolci": "dolce",
}


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _row_to_dict(row) -> Dict[str, Any]:
    return dict(row) if row else {}


def lunedi_di(data_iso: str) -> str:
    """
    Da una qualsiasi data 'YYYY-MM-DD' restituisce il lunedi della stessa
    settimana ISO, sempre come 'YYYY-MM-DD'. Solleva ValueError se la stringa
    non e' una data valida.
    """
    d = date_cls.fromisoformat(data_iso)
    return (d - timedelta(days=d.weekday())).isoformat()


def categoria_da_recipe(name: Optional[str]) -> str:
    """Mappa il nome di recipe_categories.name -> categoria pranzo."""
    if not name:
        return "altro"
    return _RECIPE_CAT_MAP.get(name.strip().lower(), "altro")


# ─────────────────────────────────────────────────────────────
# Schema bootstrap (idempotente) — fallback se la mig 102 non e' ancora girata
# ─────────────────────────────────────────────────────────────
_SCHEMA_READY = False


def _ensure_schema(conn) -> None:
    """
    CREATE TABLE IF NOT EXISTS per le 3 tabelle del modulo Pranzo.
    Pattern preso da `vini_magazzino_db.init_magazzino_database`. Cosi'
    anche se la mig 102 non e' ancora stata applicata al DB di prod
    (es. push appena fatto e backend non riavviato col runner migrations),
    le tabelle si creano al primo accesso e l'endpoint non da' 500.

    Idempotente. Eseguito una sola volta per processo (cache `_SCHEMA_READY`).
    """
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_menu (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            settimana_inizio    TEXT NOT NULL UNIQUE,
            created_by          TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_settimana ON pranzo_menu(settimana_inizio DESC)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_menu_righe (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            menu_id         INTEGER NOT NULL,
            recipe_id       INTEGER,
            nome            TEXT NOT NULL,
            categoria       TEXT NOT NULL DEFAULT 'altro',
            ordine          INTEGER NOT NULL DEFAULT 0,
            note            TEXT,
            FOREIGN KEY (menu_id)   REFERENCES pranzo_menu(id) ON DELETE CASCADE,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id)    ON DELETE SET NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_righe_menu ON pranzo_menu_righe(menu_id, ordine)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_righe_recipe ON pranzo_menu_righe(recipe_id)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_settings (
            id                   INTEGER PRIMARY KEY CHECK (id = 1),
            titolo_default       TEXT NOT NULL DEFAULT 'OGGI A PRANZO: LA CUCINA DEL MERCATO',
            sottotitolo_default  TEXT NOT NULL DEFAULT 'Piatti in base agli acquisti del giorno, soggetti a disponibilità.',
            titolo_business      TEXT NOT NULL DEFAULT 'Menù Business',
            prezzo_1_default     REAL NOT NULL DEFAULT 15.0,
            prezzo_2_default     REAL NOT NULL DEFAULT 25.0,
            prezzo_3_default     REAL NOT NULL DEFAULT 35.0,
            footer_default       TEXT NOT NULL DEFAULT '*acqua, coperto e servizio inclusi
**da Lunedì a Venerdì',
            updated_at           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("INSERT OR IGNORE INTO pranzo_settings (id) VALUES (1)")
    conn.commit()
    _SCHEMA_READY = True


# ─────────────────────────────────────────────────────────────
# SETTINGS (riga unica id=1)
# ─────────────────────────────────────────────────────────────
def get_settings() -> Dict[str, Any]:
    conn = get_foodcost_connection()
    try:
        _ensure_schema(conn)
        row = conn.execute("SELECT * FROM pranzo_settings WHERE id = 1").fetchone()
        if not row:
            conn.execute("INSERT OR IGNORE INTO pranzo_settings (id) VALUES (1)")
            conn.commit()
            row = conn.execute("SELECT * FROM pranzo_settings WHERE id = 1").fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


def update_settings(**fields) -> Dict[str, Any]:
    allowed = {
        "titolo_default", "sottotitolo_default", "titolo_business",
        "prezzo_1_default", "prezzo_2_default", "prezzo_3_default",
        "footer_default",
    }
    set_fields = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not set_fields:
        return get_settings()
    conn = get_foodcost_connection()
    try:
        _ensure_schema(conn)
        sets = ", ".join(f"{k} = ?" for k in set_fields)
        params = list(set_fields.values()) + [_now()]
        conn.execute(f"UPDATE pranzo_settings SET {sets}, updated_at = ? WHERE id = 1", params)
        conn.commit()
    finally:
        conn.close()
    return get_settings()


# ─────────────────────────────────────────────────────────────
# PIATTI DISPONIBILI (da `recipes` via service_type "Pranzo di lavoro")
# ─────────────────────────────────────────────────────────────
def list_piatti_disponibili() -> List[Dict[str, Any]]:
    """
    Pesca tutte le ricette attive (kind='dish' o is_base=0) collegate al
    service_type "Pranzo di lavoro". Ritorna `[{recipe_id, nome, categoria,
    selling_price, menu_description}]`.

    Il `nome` preferito e' `recipes.menu_name` (nome poetico per stampa);
    fallback su `recipes.name` se `menu_name` e' NULL/vuoto.

    `categoria` e' mappata da `recipe_categories.name` -> antipasto|primo|...
    Se la categoria della ricetta non e' tra quelle riconosciute, va in 'altro'.
    """
    conn = get_foodcost_connection()
    try:
        sql = """
            SELECT
                r.id              AS recipe_id,
                r.name            AS name_interno,
                r.menu_name       AS menu_name,
                r.menu_description AS menu_description,
                r.selling_price   AS selling_price,
                rc.name           AS categoria_recipe
              FROM recipes r
              JOIN recipe_service_types rst ON rst.recipe_id = r.id
              JOIN service_types st         ON st.id = rst.service_type_id
              LEFT JOIN recipe_categories rc ON rc.id = r.category_id
             WHERE st.name = 'Pranzo di lavoro'
               AND st.active = 1
               AND r.is_active = 1
               AND COALESCE(r.is_base, 0) = 0
             ORDER BY rc.sort_order, COALESCE(r.menu_name, r.name) COLLATE NOCASE
        """
        rows = conn.execute(sql).fetchall()
        out = []
        for r in rows:
            d = _row_to_dict(r)
            d["nome"] = (d.get("menu_name") or d.get("name_interno") or "").strip()
            d["categoria"] = categoria_da_recipe(d.get("categoria_recipe"))
            out.append(d)
        # ordinamento finale per categoria + nome (gestisce le 'altro' in fondo)
        out.sort(key=lambda p: (ORDINE_CATEGORIA.get(p["categoria"], 99), p["nome"].lower()))
        return out
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# MENU SETTIMANALE
# ─────────────────────────────────────────────────────────────
def get_menu_by_settimana(settimana_inizio: str) -> Optional[Dict[str, Any]]:
    """
    settimana_inizio = lunedi YYYY-MM-DD.
    Ritorna {id, settimana_inizio, created_by, created_at, updated_at, righe[]}.
    """
    monday = lunedi_di(settimana_inizio)
    conn = get_foodcost_connection()
    try:
        _ensure_schema(conn)
        row = conn.execute("SELECT * FROM pranzo_menu WHERE settimana_inizio = ?", (monday,)).fetchone()
        if not row:
            return None
        menu = _row_to_dict(row)
        righe = conn.execute(
            """SELECT r.*, rec.menu_name AS recipe_menu_name, rec.name AS recipe_name
                 FROM pranzo_menu_righe r
                 LEFT JOIN recipes rec ON rec.id = r.recipe_id
                WHERE r.menu_id = ?
                ORDER BY r.ordine, r.id""",
            (menu["id"],),
        ).fetchall()
        menu["righe"] = [_row_to_dict(x) for x in righe]
        return menu
    finally:
        conn.close()


def list_menu(data_da: Optional[str] = None, data_a: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    """
    Archivio settimanale: lista testate ordinate per settimana DESC.
    `data_da` / `data_a` sono confrontati contro `settimana_inizio`.
    """
    conn = get_foodcost_connection()
    try:
        _ensure_schema(conn)
        sql = """SELECT m.*, COUNT(r.id) AS n_piatti
                   FROM pranzo_menu m
                   LEFT JOIN pranzo_menu_righe r ON r.menu_id = m.id
                  WHERE 1=1"""
        params: List[Any] = []
        if data_da:
            sql += " AND m.settimana_inizio >= ?"
            params.append(data_da)
        if data_a:
            sql += " AND m.settimana_inizio <= ?"
            params.append(data_a)
        sql += " GROUP BY m.id ORDER BY m.settimana_inizio DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def list_programmazione(n_settimane: int = 8, fino_a: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Vista comparativa: ritorna le ultime `n_settimane` settimane CON le righe
    incluse, fino a `fino_a` (default: settimana corrente). Utile per
    consultare cosa e' stato proposto nelle settimane precedenti e non
    ripetersi.
    """
    if fino_a:
        anchor = lunedi_di(fino_a)
    else:
        oggi = date_cls.today()
        anchor = (oggi - timedelta(days=oggi.weekday())).isoformat()

    da_date = date_cls.fromisoformat(anchor) - timedelta(weeks=n_settimane - 1)
    da = da_date.isoformat()

    conn = get_foodcost_connection()
    try:
        _ensure_schema(conn)
        menus = conn.execute(
            """SELECT * FROM pranzo_menu
                WHERE settimana_inizio BETWEEN ? AND ?
                ORDER BY settimana_inizio DESC""",
            (da, anchor),
        ).fetchall()
        out = []
        for m in menus:
            md = _row_to_dict(m)
            righe = conn.execute(
                """SELECT * FROM pranzo_menu_righe
                    WHERE menu_id = ?
                    ORDER BY ordine, id""",
                (md["id"],),
            ).fetchall()
            md["righe"] = [_row_to_dict(x) for x in righe]
            out.append(md)
        return out
    finally:
        conn.close()


def upsert_menu(
    settimana_inizio: str,
    righe: List[Dict[str, Any]],
    *,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Crea o sostituisce il menu della settimana.
    `righe` = [{recipe_id?: int, nome: str, categoria: str, ordine?: int, note?: str}, ...]
    Se `recipe_id` viene passato, valida (esiste in recipes) e usa il nome dalla
    ricetta come snapshot se `nome` e' vuoto.
    """
    monday = lunedi_di(settimana_inizio)
    conn = get_foodcost_connection()
    try:
        _ensure_schema(conn)
        existing = conn.execute("SELECT id FROM pranzo_menu WHERE settimana_inizio = ?", (monday,)).fetchone()
        if existing:
            menu_id = existing["id"]
            conn.execute(
                "UPDATE pranzo_menu SET updated_at = ? WHERE id = ?",
                (_now(), menu_id),
            )
            conn.execute("DELETE FROM pranzo_menu_righe WHERE menu_id = ?", (menu_id,))
        else:
            cur = conn.execute(
                """INSERT INTO pranzo_menu (settimana_inizio, created_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (monday, created_by, _now(), _now()),
            )
            menu_id = cur.lastrowid

        for idx, r in enumerate(righe):
            categoria = (r.get("categoria") or "altro").strip().lower()
            if categoria not in CATEGORIE_VALIDE:
                categoria = "altro"
            recipe_id = r.get("recipe_id")
            nome = (r.get("nome") or "").strip()
            # se ha recipe_id ma nome vuoto, fallback al menu_name della ricetta
            if recipe_id and not nome:
                rec = conn.execute(
                    "SELECT COALESCE(menu_name, name) AS nome FROM recipes WHERE id = ?",
                    (recipe_id,),
                ).fetchone()
                nome = (rec["nome"] if rec else "") or ""
            if not nome:
                continue
            conn.execute(
                """INSERT INTO pranzo_menu_righe (menu_id, recipe_id, nome, categoria, ordine, note)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (menu_id, recipe_id, nome, categoria, r.get("ordine", idx), r.get("note")),
            )
        conn.commit()
    finally:
        conn.close()

    return get_menu_by_settimana(monday)


def delete_menu(settimana_inizio: str) -> bool:
    monday = lunedi_di(settimana_inizio)
    conn = get_foodcost_connection()
    try:
        _ensure_schema(conn)
        cur = conn.execute("DELETE FROM pranzo_menu WHERE settimana_inizio = ?", (monday,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
