#!/usr/bin/env python3
# @version: v1.0-banca
# -*- coding: utf-8 -*-
"""
Router modulo Banca — movimenti bancari, categorie, dashboard, cross-ref fatture.

Endpoints:
  1. POST   /banca/import             — upload CSV Banco BPM
  2. GET    /banca/movimenti           — lista movimenti con filtri
  3. GET    /banca/dashboard           — stats aggregati (saldo, entrate/uscite, breakdown)
  4. GET    /banca/categorie           — lista categorie banca con mapping custom
  5. POST   /banca/categorie/map       — crea/aggiorna mapping categoria custom
  6. DELETE /banca/categorie/map/{id}  — elimina mapping custom
  7. GET    /banca/cross-ref           — movimenti con possibili fatture collegate
  8. POST   /banca/cross-ref/link      — collega movimento ↔ fattura
  9. DELETE /banca/cross-ref/link/{id} — scollega
 10. GET    /banca/import-log          — storico import CSV
 11. GET    /banca/andamento           — serie temporale entrate/uscite per grafici

DB: app/data/foodcost.db
"""

import csv
import hashlib
import io
import re
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "foodcost.db"

router = APIRouter(prefix="/banca", tags=["banca"])


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ═══════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════

class CategoriaMapRequest(BaseModel):
    categoria_banca: str
    sottocategoria_banca: Optional[str] = None
    categoria_custom: str
    colore: Optional[str] = "#6b7280"
    icona: Optional[str] = "📁"
    tipo: Optional[str] = "uscita"  # entrata | uscita | altro


class CrossRefLinkRequest(BaseModel):
    movimento_id: int
    fattura_id: int
    note: Optional[str] = None


# ═══════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════

def _parse_date_it(s: str) -> Optional[str]:
    """Converte 'dd/mm/yyyy' → 'yyyy-mm-dd'."""
    if not s:
        return None
    s = s.strip()
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return s


def _parse_importo_it(s: str) -> float:
    """Converte importo italiano: '1.234,56' o '-1234,56' → float."""
    if not s:
        return 0.0
    s = s.strip().replace('"', '').replace("'", "")
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _dedup_hash(data_contabile: str, importo: float, descrizione: str) -> str:
    """Genera hash per dedup: data + importo + descrizione."""
    raw = f"{data_contabile}|{importo:.2f}|{(descrizione or '').strip()}"
    return hashlib.md5(raw.encode()).hexdigest()


def _parse_categoria(cat_raw: str):
    """Splitta 'Categoria - Sottocategoria' → (cat, subcat)."""
    cat_raw = (cat_raw or "").strip()
    if " - " in cat_raw:
        parts = cat_raw.split(" - ", 1)
        return parts[0].strip(), parts[1].strip()
    return cat_raw, ""


# ═══════════════════════════════════════════════════════
# 1. IMPORT CSV
# ═══════════════════════════════════════════════════════

@router.post("/import")
async def import_csv(file: UploadFile = File(...)):
    """
    Importa CSV export Banco BPM.
    Colonne attese: Ragione Sociale, Data contabile, Data valuta, Banca,
                    Rapporto, Importo, Divisa, Descrizione,
                    Categoria/sottocategoria, Hashtag
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Il file deve essere in formato .csv")

    content = await file.read()
    # Try utf-8, fallback to latin-1
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    conn = get_db()
    cur = conn.cursor()

    num_rows = 0
    num_new = 0
    num_dup = 0
    date_min = None
    date_max = None

    # Crea log entry
    cur.execute(
        "INSERT INTO banca_import_log (filename) VALUES (?)",
        (file.filename,)
    )
    import_id = cur.lastrowid

    for row in reader:
        num_rows += 1

        # Parse campi
        ragione = (row.get("Ragione Sociale") or "").strip()
        data_c = _parse_date_it(row.get("Data contabile", ""))
        data_v = _parse_date_it(row.get("Data valuta", ""))
        banca = (row.get("Banca") or "").strip()
        rapporto = (row.get("Rapporto") or "").strip()
        importo = _parse_importo_it(row.get("Importo", "0"))
        divisa = (row.get("Divisa") or "EUR").strip()
        descrizione = (row.get("Descrizione") or "").strip()
        cat_raw = (row.get("Categoria/sottocategoria") or "").strip()
        hashtag = (row.get("Hashtag") or "").strip()

        cat, subcat = _parse_categoria(cat_raw)
        dhash = _dedup_hash(data_c, importo, descrizione)

        # Track date range
        if data_c:
            if not date_min or data_c < date_min:
                date_min = data_c
            if not date_max or data_c > date_max:
                date_max = data_c

        try:
            cur.execute("""
                INSERT INTO banca_movimenti
                    (import_id, ragione_sociale, data_contabile, data_valuta,
                     banca, rapporto, importo, divisa, descrizione,
                     categoria_banca, sottocategoria_banca, hashtag, dedup_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (import_id, ragione, data_c, data_v, banca, rapporto,
                  importo, divisa, descrizione, cat, subcat, hashtag, dhash))
            num_new += 1
        except sqlite3.IntegrityError:
            # Duplicato
            num_dup += 1

    # Aggiorna log
    cur.execute("""
        UPDATE banca_import_log
        SET num_rows = ?, num_new = ?, num_duplicates = ?,
            date_from = ?, date_to = ?
        WHERE id = ?
    """, (num_rows, num_new, num_dup, date_min, date_max, import_id))

    conn.commit()
    conn.close()

    return {
        "import_id": import_id,
        "filename": file.filename,
        "total_rows": num_rows,
        "new": num_new,
        "duplicates": num_dup,
        "date_from": date_min,
        "date_to": date_max,
    }


# ═══════════════════════════════════════════════════════
# 2. MOVIMENTI (lista con filtri)
# ═══════════════════════════════════════════════════════

@router.get("/movimenti")
def get_movimenti(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    categoria: Optional[str] = None,
    tipo: Optional[str] = None,  # entrata | uscita
    search: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    """Lista movimenti con filtri opzionali."""
    conn = get_db()
    cur = conn.cursor()

    where = []
    params = []

    if data_da:
        where.append("m.data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("m.data_contabile <= ?")
        params.append(data_a)
    if categoria:
        where.append("m.categoria_banca = ?")
        params.append(categoria)
    if tipo == "entrata":
        where.append("m.importo > 0")
    elif tipo == "uscita":
        where.append("m.importo < 0")
    if search:
        where.append("(m.descrizione LIKE ? OR m.categoria_banca LIKE ? OR m.sottocategoria_banca LIKE ?)")
        params.extend([f"%{search}%"] * 3)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    # Total count
    cur.execute(f"SELECT COUNT(*) FROM banca_movimenti m {where_sql}", params)
    total = cur.fetchone()[0]

    # Data with custom category mapping
    cur.execute(f"""
        SELECT m.*,
               cm.categoria_custom,
               cm.colore AS cat_colore,
               cm.icona AS cat_icona
        FROM banca_movimenti m
        LEFT JOIN banca_categorie_map cm
            ON m.categoria_banca = cm.categoria_banca
            AND COALESCE(m.sottocategoria_banca, '') = COALESCE(cm.sottocategoria_banca, '')
        {where_sql}
        ORDER BY m.data_contabile DESC, m.id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return {"total": total, "movimenti": rows}


# ═══════════════════════════════════════════════════════
# 3. DASHBOARD — stats aggregati
# ═══════════════════════════════════════════════════════

@router.get("/dashboard")
def get_dashboard(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
):
    """Dashboard con totali, breakdown per categoria, ultimi movimenti."""
    conn = get_db()
    cur = conn.cursor()

    where = []
    params = []
    if data_da:
        where.append("data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("data_contabile <= ?")
        params.append(data_a)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    # Totali
    cur.execute(f"""
        SELECT
            COUNT(*) as num_movimenti,
            SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END) as totale_entrate,
            SUM(CASE WHEN importo < 0 THEN importo ELSE 0 END) as totale_uscite,
            SUM(importo) as saldo_periodo,
            MIN(data_contabile) as data_primo,
            MAX(data_contabile) as data_ultimo
        FROM banca_movimenti
        {where_sql}
    """, params)
    totals = dict(cur.fetchone())

    # Breakdown per categoria (uscite)
    cur.execute(f"""
        SELECT
            categoria_banca,
            sottocategoria_banca,
            COUNT(*) as num,
            SUM(importo) as totale
        FROM banca_movimenti
        {where_sql}
        {"AND" if where else "WHERE"} importo < 0
        GROUP BY categoria_banca, sottocategoria_banca
        ORDER BY totale ASC
    """, params)
    uscite_per_cat = [dict(r) for r in cur.fetchall()]

    # Breakdown per categoria (entrate)
    cur.execute(f"""
        SELECT
            categoria_banca,
            sottocategoria_banca,
            COUNT(*) as num,
            SUM(importo) as totale
        FROM banca_movimenti
        {where_sql}
        {"AND" if where else "WHERE"} importo > 0
        GROUP BY categoria_banca, sottocategoria_banca
        ORDER BY totale DESC
    """, params)
    entrate_per_cat = [dict(r) for r in cur.fetchall()]

    # Ultimi 10 movimenti
    cur.execute(f"""
        SELECT * FROM banca_movimenti
        {where_sql}
        ORDER BY data_contabile DESC, id DESC
        LIMIT 10
    """, params)
    ultimi = [dict(r) for r in cur.fetchall()]

    conn.close()

    return {
        "totals": totals,
        "uscite_per_categoria": uscite_per_cat,
        "entrate_per_categoria": entrate_per_cat,
        "ultimi_movimenti": ultimi,
    }


# ═══════════════════════════════════════════════════════
# 4-6. CATEGORIE MAPPING
# ═══════════════════════════════════════════════════════

@router.get("/categorie")
def get_categorie():
    """Lista categorie banca con eventuale mapping custom."""
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            m.categoria_banca,
            m.sottocategoria_banca,
            COUNT(*) as num_movimenti,
            SUM(m.importo) as totale,
            cm.id as map_id,
            cm.categoria_custom,
            cm.colore,
            cm.icona,
            cm.tipo
        FROM banca_movimenti m
        LEFT JOIN banca_categorie_map cm
            ON m.categoria_banca = cm.categoria_banca
            AND COALESCE(m.sottocategoria_banca, '') = COALESCE(cm.sottocategoria_banca, '')
        GROUP BY m.categoria_banca, m.sottocategoria_banca
        ORDER BY totale ASC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/categorie/map")
def upsert_categoria_map(req: CategoriaMapRequest):
    """Crea o aggiorna mapping categoria banca → custom."""
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO banca_categorie_map
            (categoria_banca, sottocategoria_banca, categoria_custom, colore, icona, tipo)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(categoria_banca, sottocategoria_banca)
        DO UPDATE SET
            categoria_custom = excluded.categoria_custom,
            colore = excluded.colore,
            icona = excluded.icona,
            tipo = excluded.tipo
    """, (req.categoria_banca, req.sottocategoria_banca or "",
          req.categoria_custom, req.colore, req.icona, req.tipo))

    conn.commit()
    map_id = cur.lastrowid
    conn.close()
    return {"ok": True, "id": map_id}


@router.delete("/categorie/map/{map_id}")
def delete_categoria_map(map_id: int):
    """Elimina mapping custom."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM banca_categorie_map WHERE id = ?", (map_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if not deleted:
        raise HTTPException(404, "Mapping non trovato")
    return {"ok": True}


# ═══════════════════════════════════════════════════════
# 7-9. CROSS-REF FATTURE
# ═══════════════════════════════════════════════════════

@router.get("/cross-ref")
def get_cross_ref(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    solo_non_collegati: bool = False,
):
    """
    Movimenti con possibili fatture collegate.
    Per uscite fornitori, cerca fatture con importo simile ±5 giorni.
    """
    conn = get_db()
    cur = conn.cursor()

    where = ["m.importo < 0"]
    params = []
    if data_da:
        where.append("m.data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("m.data_contabile <= ?")
        params.append(data_a)

    # Movimenti con link esistenti
    cur.execute(f"""
        SELECT m.*,
               bl.id as link_id,
               bl.fattura_id,
               f.fornitore_nome,
               f.numero_fattura,
               f.data_fattura,
               f.totale_fattura
        FROM banca_movimenti m
        LEFT JOIN banca_fatture_link bl ON m.id = bl.movimento_id
        LEFT JOIN fe_fatture f ON bl.fattura_id = f.id
        WHERE {" AND ".join(where)}
        ORDER BY m.data_contabile DESC
        LIMIT 500
    """, params)

    movimenti = []
    for row in cur.fetchall():
        mov = dict(row)
        mov_id = mov["id"]

        if solo_non_collegati and mov.get("link_id"):
            continue

        # Se non ha link, cerca possibili match
        if not mov.get("link_id"):
            abs_importo = abs(mov["importo"])
            data_c = mov["data_contabile"]
            # Cerca fatture con totale simile (±5%) entro ±10 giorni
            cur2 = conn.cursor()
            cur2.execute("""
                SELECT id, fornitore_nome, fornitore_piva, numero_fattura,
                       data_fattura, totale_fattura
                FROM fe_fatture
                WHERE ABS(totale_fattura - ?) / MAX(?, 0.01) < 0.05
                  AND data_fattura BETWEEN date(?, '-10 days') AND date(?, '+10 days')
                ORDER BY ABS(totale_fattura - ?) ASC
                LIMIT 5
            """, (abs_importo, abs_importo, data_c, data_c, abs_importo))
            mov["possibili_fatture"] = [dict(r) for r in cur2.fetchall()]
        else:
            mov["possibili_fatture"] = []

        movimenti.append(mov)

    conn.close()
    return movimenti


@router.post("/cross-ref/link")
def create_link(req: CrossRefLinkRequest):
    """Collega un movimento bancario a una fattura."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO banca_fatture_link (movimento_id, fattura_id, note)
            VALUES (?, ?, ?)
        """, (req.movimento_id, req.fattura_id, req.note))
        conn.commit()
        link_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, "Collegamento già esistente")
    conn.close()
    return {"ok": True, "id": link_id}


@router.delete("/cross-ref/link/{link_id}")
def delete_link(link_id: int):
    """Rimuove collegamento movimento ↔ fattura."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM banca_fatture_link WHERE id = ?", (link_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if not deleted:
        raise HTTPException(404, "Collegamento non trovato")
    return {"ok": True}


# ═══════════════════════════════════════════════════════
# 10. IMPORT LOG
# ═══════════════════════════════════════════════════════

@router.get("/import-log")
def get_import_log():
    """Storico degli import CSV."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM banca_import_log
        ORDER BY created_at DESC
        LIMIT 50
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ═══════════════════════════════════════════════════════
# 11. ANDAMENTO (serie temporale)
# ═══════════════════════════════════════════════════════

@router.get("/andamento")
def get_andamento(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    raggruppamento: str = Query("giorno", regex="^(giorno|settimana|mese)$"),
):
    """Serie temporale entrate/uscite per grafici."""
    conn = get_db()
    cur = conn.cursor()

    where = []
    params = []
    if data_da:
        where.append("data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("data_contabile <= ?")
        params.append(data_a)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    if raggruppamento == "giorno":
        group_expr = "data_contabile"
    elif raggruppamento == "settimana":
        group_expr = "strftime('%Y-W%W', data_contabile)"
    else:  # mese
        group_expr = "strftime('%Y-%m', data_contabile)"

    cur.execute(f"""
        SELECT
            {group_expr} as periodo,
            SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END) as entrate,
            SUM(CASE WHEN importo < 0 THEN ABS(importo) ELSE 0 END) as uscite,
            SUM(importo) as netto,
            COUNT(*) as num_movimenti
        FROM banca_movimenti
        {where_sql}
        GROUP BY {group_expr}
        ORDER BY periodo ASC
    """, params)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows
