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

from app.models.cucina_db import get_cucina_connection


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


def _cols(cur, table: str) -> set:
    """Helper: ritorna set delle colonne di una tabella (vuoto se non esiste)."""
    try:
        return {r[1] for r in cur.execute(f"PRAGMA table_info({table})").fetchall()}
    except Exception:
        return set()


def _ensure_schema(conn) -> None:
    """
    Schema bootstrap idempotente per le tabelle del modulo Pranzo.

    Iter 11: SOFT MIGRATION robusta — gestisce 3 scenari:
      A) DB pulito → CREATE TABLE crea schema nuovo
      B) DB con schema NUOVO (settimanale, recipe_id) → no-op
      C) DB con schema VECCHIO (mig 102 v1: catalogo + 'data' invece di
         'settimana_inizio', 'piatto_id' invece di 'recipe_id') → ALTER TABLE
         ADD COLUMN per riallineare. La causa del 502 sul VPS era questa:
         `pranzo_menu` esisteva con schema vecchio, CREATE INDEX su colonna
         inesistente → OperationalError → 502.

    Eseguito 1 volta per processo (cache `_SCHEMA_READY`).
    """
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    cur = conn.cursor()

    # ── pranzo_menu ───────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pranzo_menu (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            settimana_inizio    TEXT NOT NULL UNIQUE,
            created_by          TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cols_pm = _cols(cur, "pranzo_menu")
    if "settimana_inizio" not in cols_pm:
        # Schema vecchio (mig 102 v1: aveva 'data' come chiave settimanale).
        cur.execute("ALTER TABLE pranzo_menu ADD COLUMN settimana_inizio TEXT")
        if "data" in cols_pm:
            cur.execute("UPDATE pranzo_menu SET settimana_inizio = data WHERE settimana_inizio IS NULL")
            print("  [pranzo] migrato pranzo_menu.data → settimana_inizio")
        else:
            print("  [pranzo] WARN: pranzo_menu schema strano, settimana_inizio aggiunta vuota")
    # Altre colonne richieste dallo schema attuale
    if "created_by" not in cols_pm:
        try: cur.execute("ALTER TABLE pranzo_menu ADD COLUMN created_by TEXT")
        except Exception: pass
    if "created_at" not in cols_pm:
        try: cur.execute("ALTER TABLE pranzo_menu ADD COLUMN created_at TEXT")
        except Exception: pass
    if "updated_at" not in cols_pm:
        try: cur.execute("ALTER TABLE pranzo_menu ADD COLUMN updated_at TEXT")
        except Exception: pass
    # Indice creato DOPO ALTER (ora la colonna esiste sicuro)
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_settimana ON pranzo_menu(settimana_inizio DESC)")
    except Exception as e:
        print(f"  [pranzo] WARN skip idx settimana: {e}")

    # ── pranzo_menu_righe ─────────────────────────────────────
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
    cols_pmr = _cols(cur, "pranzo_menu_righe")
    # Aggiungo TUTTE le colonne mancanti dello schema atteso.
    expected_cols_pmr = {
        "recipe_id":  "ALTER TABLE pranzo_menu_righe ADD COLUMN recipe_id INTEGER",
        "categoria":  "ALTER TABLE pranzo_menu_righe ADD COLUMN categoria TEXT NOT NULL DEFAULT 'altro'",
        "ordine":     "ALTER TABLE pranzo_menu_righe ADD COLUMN ordine INTEGER NOT NULL DEFAULT 0",
        "note":       "ALTER TABLE pranzo_menu_righe ADD COLUMN note TEXT",
        "nome":       "ALTER TABLE pranzo_menu_righe ADD COLUMN nome TEXT",
    }
    for col, alter in expected_cols_pmr.items():
        if col not in cols_pmr:
            try:
                cur.execute(alter)
                print(f"  [pranzo] aggiunta colonna pranzo_menu_righe.{col}")
            except Exception as e:
                print(f"  [pranzo] WARN ALTER {col}: {e}")
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_righe_menu ON pranzo_menu_righe(menu_id, ordine)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_pranzo_menu_righe_recipe ON pranzo_menu_righe(recipe_id)")
    except Exception as e:
        print(f"  [pranzo] WARN skip idx righe: {e}")

    # ── pranzo_settings ───────────────────────────────────────
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

    # Soft-migration colonne settings (se schema vecchio aveva meno campi)
    cols_ps = _cols(cur, "pranzo_settings")
    expected_settings = {
        "titolo_default":      ("TEXT", "OGGI A PRANZO: LA CUCINA DEL MERCATO"),
        "sottotitolo_default": ("TEXT", "Piatti in base agli acquisti del giorno, soggetti a disponibilità."),
        "titolo_business":     ("TEXT", "Menù Business"),
        "prezzo_1_default":    ("REAL", "15.0"),
        "prezzo_2_default":    ("REAL", "25.0"),
        "prezzo_3_default":    ("REAL", "35.0"),
        "footer_default":      ("TEXT", "*acqua, coperto e servizio inclusi"),
        "updated_at":          ("TEXT", None),
    }
    for col, (tipo, default) in expected_settings.items():
        if col not in cols_ps:
            try:
                cur.execute(f"ALTER TABLE pranzo_settings ADD COLUMN {col} {tipo}")
                if default is not None:
                    cur.execute(f"UPDATE pranzo_settings SET {col} = ? WHERE id = 1 AND {col} IS NULL", (default,))
                print(f"  [pranzo] aggiunta colonna pranzo_settings.{col}")
            except Exception as e:
                print(f"  [pranzo] WARN ALTER settings.{col}: {e}")

    conn.commit()
    _SCHEMA_READY = True


def init_pranzo_db() -> None:
    """
    Init esplicito da chiamare 1 volta al boot del backend (main.py).
    Riduce la probabilita' di lock SQLite causati da CREATE TABLE in
    contemporanea su request concorrenti.

    Idempotente: usa la stessa _ensure_schema gated da `_SCHEMA_READY`.
    """
    conn = get_cucina_connection()
    try:
        _ensure_schema(conn)
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# SETTINGS (riga unica id=1)
# ─────────────────────────────────────────────────────────────
def get_settings() -> Dict[str, Any]:
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
    try:
        _ensure_schema(conn)
        row = conn.execute("SELECT * FROM pranzo_menu WHERE settimana_inizio = ?", (monday,)).fetchone()
        if not row:
            return None
        menu = _row_to_dict(row)
        # Iter 11: query semplificata, niente LEFT JOIN su recipes
        # (i campi recipe_menu_name/recipe_name non sono usati dal frontend
        # e il JOIN era una potenziale fonte di hang/timeout su DB con molti rec).
        righe = conn.execute(
            """SELECT id, menu_id, recipe_id, nome, categoria, ordine, note
                 FROM pranzo_menu_righe
                WHERE menu_id = ?
                ORDER BY ordine, id""",
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
    conn = get_cucina_connection()
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

    conn = get_cucina_connection()
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

    Iter 12 (D2 fix, 2026-04-27): gestione colonne legacy v1.0 della tabella
    pranzo_menu. Sul VPS la mig 102 v1.0 ha lasciato 'data' (TEXT NOT NULL UNIQUE)
    che non puo' essere droppata per UNIQUE constraint. Detect runtime + include
    nell'INSERT con valore = monday. Stesso pattern per altre eventuali colonne
    NOT NULL legacy senza default.
    """
    monday = lunedi_di(settimana_inizio)
    conn = get_cucina_connection()
    try:
        _ensure_schema(conn)
        # Detect colonne legacy NOT NULL senza default (residuo schema v1.0)
        # PRAGMA table_info ritorna: (cid, name, type, notnull, dflt_value, pk)
        legacy_cols = {}
        for row in conn.execute("PRAGMA table_info(pranzo_menu)").fetchall():
            name = row[1]
            notnull = bool(row[3])
            dflt = row[4]
            # Solo colonne NOT NULL senza default (le altre prendono il loro default)
            if notnull and dflt is None and name not in (
                "id", "settimana_inizio", "created_by", "created_at", "updated_at",
            ):
                legacy_cols[name] = monday  # default fallback: usa monday come valore
        # Caso noto: 'data' (chiave settimana v1.0) vuole monday → coerente con UNIQUE su data
        # Casi imprevisti (titolo NOT NULL, ecc.): mettiamo string vuota
        for k in list(legacy_cols.keys()):
            if k != "data":
                legacy_cols[k] = ""

        existing = conn.execute("SELECT id FROM pranzo_menu WHERE settimana_inizio = ?", (monday,)).fetchone()
        if existing:
            menu_id = existing["id"]
            conn.execute(
                "UPDATE pranzo_menu SET updated_at = ? WHERE id = ?",
                (_now(), menu_id),
            )
            conn.execute("DELETE FROM pranzo_menu_righe WHERE menu_id = ?", (menu_id,))
        else:
            # INSERT dinamico: include settimana_inizio + audit + colonne legacy NOT NULL
            base_cols = ["settimana_inizio", "created_by", "created_at", "updated_at"]
            base_vals = [monday, created_by, _now(), _now()]
            extra_cols = list(legacy_cols.keys())
            extra_vals = [legacy_cols[c] for c in extra_cols]
            all_cols = base_cols + extra_cols
            all_vals = base_vals + extra_vals
            placeholders = ", ".join(["?"] * len(all_vals))
            sql = f"INSERT INTO pranzo_menu ({', '.join(all_cols)}) VALUES ({placeholders})"
            cur = conn.execute(sql, all_vals)
            menu_id = cur.lastrowid

        # Stesso pattern per pranzo_menu_righe: detect colonne legacy NOT NULL
        legacy_cols_pmr = {}
        for row in conn.execute("PRAGMA table_info(pranzo_menu_righe)").fetchall():
            name = row[1]
            notnull = bool(row[3])
            dflt = row[4]
            if notnull and dflt is None and name not in (
                "id", "menu_id", "recipe_id", "nome", "categoria", "ordine", "note",
            ):
                legacy_cols_pmr[name] = ""  # fallback: vuoto

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
            base_cols = ["menu_id", "recipe_id", "nome", "categoria", "ordine", "note"]
            base_vals = [menu_id, recipe_id, nome, categoria, r.get("ordine", idx), r.get("note")]
            extra_cols = list(legacy_cols_pmr.keys())
            extra_vals = [legacy_cols_pmr[c] for c in extra_cols]
            all_cols = base_cols + extra_cols
            all_vals = base_vals + extra_vals
            placeholders = ", ".join(["?"] * len(all_vals))
            sql = f"INSERT INTO pranzo_menu_righe ({', '.join(all_cols)}) VALUES ({placeholders})"
            conn.execute(sql, all_vals)
        conn.commit()
    finally:
        conn.close()

    return get_menu_by_settimana(monday)


def delete_menu(settimana_inizio: str) -> bool:
    monday = lunedi_di(settimana_inizio)
    conn = get_cucina_connection()
    try:
        _ensure_schema(conn)
        cur = conn.execute("DELETE FROM pranzo_menu WHERE settimana_inizio = ?", (monday,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
