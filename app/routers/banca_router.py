#!/usr/bin/env python3
# @version: v1.1-csv-robust-import
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


class UpdateMovimentoCategoria(BaseModel):
    categoria_banca: str
    sottocategoria_banca: Optional[str] = ""


class CrossRefLinkRequest(BaseModel):
    movimento_id: int
    fattura_id: Optional[int] = None
    uscita_id: Optional[int] = None
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


def _get_csv_field(row: dict, *names: str) -> str:
    """Cerca un campo nel dict CSV provando diversi nomi (case-insensitive, strip spazi).
    Banco BPM cambia leggermente i nomi colonna tra versioni di export."""
    for name in names:
        # Prima prova match esatto
        val = row.get(name)
        if val is not None:
            return val.strip() if isinstance(val, str) else val
    # Fallback: cerca case-insensitive e strip whitespace dalle chiavi
    names_lower = [n.lower().strip() for n in names]
    for key, val in row.items():
        if key.strip().lower() in names_lower:
            return val.strip() if isinstance(val, str) else val
    return ""


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

    # Detecta separatore: se la prima riga ha più ";" che ",", usa ";"
    first_line = text.split("\n", 1)[0] if text else ""
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

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

        # Parse campi — usa _get_csv_field per matching robusto dei nomi colonna
        ragione = _get_csv_field(row, "Ragione Sociale", "Ragione sociale", "ragione sociale")
        data_c = _parse_date_it(_get_csv_field(row, "Data contabile", "Data Contabile", "data contabile"))
        data_v = _parse_date_it(_get_csv_field(row, "Data valuta", "Data Valuta", "data valuta"))
        banca = _get_csv_field(row, "Banca", "banca")
        rapporto = _get_csv_field(row, "Rapporto", "rapporto")
        causale = _get_csv_field(row, "Causale", "causale")
        # Se non c'è Rapporto ma c'è Causale (formato MovimentiCC), salva causale in rapporto
        if not rapporto and causale:
            rapporto = causale
        importo = _parse_importo_it(_get_csv_field(row, "Importo", "importo") or "0")
        divisa = _get_csv_field(row, "Divisa", "divisa") or "EUR"
        descrizione = _get_csv_field(row, "Descrizione", "descrizione")
        cat_raw = _get_csv_field(row, "Categoria/sottocategoria", "Categoria/Sottocategoria",
                                  "categoria/sottocategoria", "Categoria")
        hashtag = _get_csv_field(row, "Hashtag", "hashtag")
        canale = _get_csv_field(row, "Canale", "canale")
        # Se non c'è Hashtag ma c'è Canale (formato MovimentiCC), salva canale in hashtag
        if not hashtag and canale:
            hashtag = canale

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

    # Se tutte le righe sono "duplicate" e nessuna data trovata → probabile mismatch colonne
    warning = None
    if num_rows > 0 and num_new == 0 and date_min is None:
        # Nessuna data parsata + zero inserimenti → colonne CSV non riconosciute
        col_list = list(reader.fieldnames) if reader.fieldnames else []
        conn.rollback()
        conn.close()
        raise HTTPException(
            400,
            f"Nessuna colonna riconosciuta nel CSV. "
            f"Colonne trovate: {', '.join(col_list) if col_list else '(nessuna)'}. "
            f"Attese: Ragione Sociale, Data contabile, Data valuta, Importo, Descrizione..."
        )

    if num_rows > 0 and num_new == 0:
        warning = "Tutti i movimenti risultano già importati (duplicati)."

    # Aggiorna log
    cur.execute("""
        UPDATE banca_import_log
        SET num_rows = ?, num_new = ?, num_duplicates = ?,
            date_from = ?, date_to = ?
        WHERE id = ?
    """, (num_rows, num_new, num_dup, date_min, date_max, import_id))

    conn.commit()
    conn.close()

    result = {
        "import_id": import_id,
        "filename": file.filename,
        "total_rows": num_rows,
        "new": num_new,
        "duplicates": num_dup,
        "date_from": date_min,
        "date_to": date_max,
    }
    if warning:
        result["warning"] = warning
    return result


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


@router.patch("/movimenti/{movimento_id}/categoria")
def update_movimento_categoria(movimento_id: int, req: UpdateMovimentoCategoria):
    """Aggiorna categoria di un singolo movimento."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE banca_movimenti
        SET categoria_banca = ?, sottocategoria_banca = ?
        WHERE id = ?
    """, (req.categoria_banca, req.sottocategoria_banca or "", movimento_id))
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(404, "Movimento non trovato")
    conn.close()
    return {"ok": True}


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
# 7-9. RICONCILIAZIONE SPESE (ex Cross-Ref Fatture)
# Match movimenti bancari ↔ fatture + spese fisse
# ═══════════════════════════════════════════════════════

@router.get("/cross-ref")
def get_cross_ref(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
):
    """
    Movimenti bancari (uscite) con possibili match.
    Cerca in fe_fatture E in cg_uscite (spese fisse, affitti, tasse…).
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

    # ── Movimenti con eventuali link fattura ──
    cur.execute(f"""
        SELECT m.*,
               bl.id       AS link_id,
               bl.fattura_id,
               f.fornitore_nome  AS link_fornitore,
               f.numero_fattura  AS link_numero,
               f.data_fattura    AS link_data,
               f.totale_fattura  AS link_totale,
               'FATTURA'         AS link_tipo
        FROM banca_movimenti m
        LEFT JOIN banca_fatture_link bl ON m.id = bl.movimento_id
        LEFT JOIN fe_fatture f ON bl.fattura_id = f.id
        WHERE {" AND ".join(where)}
        ORDER BY m.data_contabile DESC
        LIMIT 500
    """, params)
    raw = [dict(r) for r in cur.fetchall()]

    # ── Anche movimenti collegati direttamente a cg_uscite (spese fisse) ──
    cur.execute(f"""
        SELECT m.id AS mov_id,
               cu.id AS uscita_id,
               cu.fornitore_nome AS link_fornitore,
               cu.numero_fattura AS link_numero,
               cu.data_scadenza  AS link_data,
               cu.totale         AS link_totale,
               COALESCE(cu.tipo_uscita, 'FATTURA') AS link_tipo
        FROM banca_movimenti m
        JOIN cg_uscite cu ON cu.banca_movimento_id = m.id
        WHERE cu.fattura_id IS NULL
          AND {" AND ".join(where)}
    """, params)
    uscite_links = {r["mov_id"]: dict(r) for r in cur.fetchall()}

    movimenti = []
    seen_ids = set()
    for mov in raw:
        mid = mov["id"]
        if mid in seen_ids:
            continue
        seen_ids.add(mid)

        # Se ha link fattura, ok
        if mov.get("link_id"):
            movimenti.append(mov)
            continue

        # Se ha link uscita diretta (spesa fissa)
        if mid in uscite_links:
            ul = uscite_links[mid]
            mov["link_id"] = f"u{ul['uscita_id']}"  # prefisso u per distinguere
            mov["link_fornitore"] = ul["link_fornitore"]
            mov["link_numero"] = ul["link_numero"]
            mov["link_data"] = ul["link_data"]
            mov["link_totale"] = ul["link_totale"]
            mov["link_tipo"] = ul["link_tipo"]
            mov["uscita_id"] = ul["uscita_id"]
            movimenti.append(mov)
            continue

        # ── Nessun link: cerca suggerimenti ──
        abs_imp = abs(mov["importo"])
        data_c = mov["data_contabile"]
        suggestions = []

        # 1) Fatture non collegate con importo simile (±5%) entro ±10 giorni
        cur2 = conn.cursor()
        cur2.execute("""
            SELECT f.id, f.fornitore_nome, f.numero_fattura,
                   f.data_fattura AS data_ref, f.totale_fattura AS totale,
                   'FATTURA' AS tipo
            FROM fe_fatture f
            LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
            WHERE bfl.id IS NULL
              AND ABS(f.totale_fattura - ?) / MAX(?, 0.01) < 0.05
              AND f.data_fattura BETWEEN date(?, '-10 days') AND date(?, '+10 days')
            ORDER BY ABS(f.totale_fattura - ?) ASC
            LIMIT 5
        """, (abs_imp, abs_imp, data_c, data_c, abs_imp))
        for r in cur2.fetchall():
            d = dict(r)
            d["source"] = "fattura"
            d["source_id"] = d["id"]
            suggestions.append(d)

        # 2) Uscite CG non pagate (spese fisse, affitti, tasse…) con importo simile
        cur3 = conn.cursor()
        cur3.execute("""
            SELECT cu.id, cu.fornitore_nome, cu.numero_fattura,
                   cu.data_scadenza AS data_ref, cu.totale,
                   COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo
            FROM cg_uscite cu
            WHERE cu.banca_movimento_id IS NULL
              AND cu.fattura_id IS NULL
              AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
              AND ABS(cu.totale - ?) / MAX(?, 0.01) < 0.10
              AND cu.data_scadenza BETWEEN date(?, '-20 days') AND date(?, '+20 days')
            ORDER BY ABS(cu.totale - ?) ASC
            LIMIT 5
        """, (abs_imp, abs_imp, data_c, data_c, abs_imp))
        for r in cur3.fetchall():
            d = dict(r)
            d["source"] = "uscita"
            d["source_id"] = d["id"]
            suggestions.append(d)

        mov["possibili_match"] = suggestions
        movimenti.append(mov)

    conn.close()
    return movimenti


@router.post("/cross-ref/link")
def create_link(req: CrossRefLinkRequest):
    """
    Collega un movimento bancario a una fattura O a un'uscita CG.
    - fattura_id: link via banca_fatture_link + propaga a cg_uscite
    - uscita_id: link diretto su cg_uscite.banca_movimento_id
    """
    if not req.fattura_id and not req.uscita_id:
        raise HTTPException(400, "Specificare fattura_id o uscita_id")

    conn = get_db()
    cur = conn.cursor()

    mov = cur.execute("SELECT data_contabile FROM banca_movimenti WHERE id = ?", (req.movimento_id,)).fetchone()
    data_mov = dict(mov)["data_contabile"] if mov else None

    try:
        if req.fattura_id:
            # ── Link fattura (come prima) ──
            cur.execute("""
                INSERT INTO banca_fatture_link (movimento_id, fattura_id, note)
                VALUES (?, ?, ?)
            """, (req.movimento_id, req.fattura_id, req.note))
            # Propaga a cg_uscite
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = ?,
                    stato = 'PAGATA',
                    data_pagamento = COALESCE(data_pagamento, ?),
                    importo_pagato = totale,
                    updated_at = datetime('now')
                WHERE fattura_id = ?
                  AND banca_movimento_id IS NULL
            """, (req.movimento_id, data_mov, req.fattura_id))
        else:
            # ── Link uscita diretta (spesa fissa, affitto, tassa…) ──
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = ?,
                    stato = 'PAGATA',
                    data_pagamento = COALESCE(data_pagamento, ?),
                    importo_pagato = totale,
                    updated_at = datetime('now')
                WHERE id = ?
                  AND banca_movimento_id IS NULL
            """, (req.movimento_id, data_mov, req.uscita_id))
            if cur.rowcount == 0:
                conn.close()
                raise HTTPException(409, "Uscita già collegata o non trovata")

        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, "Collegamento già esistente")
    conn.close()
    return {"ok": True}


@router.delete("/cross-ref/link/{link_id}")
def delete_link(link_id: str):
    """
    Rimuove collegamento. link_id può essere:
    - numerico: banca_fatture_link.id (fattura)
    - "uNNN": cg_uscite.id (uscita diretta)
    """
    conn = get_db()
    cur = conn.cursor()

    if str(link_id).startswith("u"):
        # ── Scollega uscita diretta ──
        uscita_id = int(str(link_id)[1:])
        cur.execute("""
            UPDATE cg_uscite
            SET banca_movimento_id = NULL,
                stato = CASE WHEN data_scadenza < date('now') THEN 'SCADUTA' ELSE 'DA_PAGARE' END,
                importo_pagato = 0,
                data_pagamento = NULL,
                updated_at = datetime('now')
            WHERE id = ? AND banca_movimento_id IS NOT NULL
        """, (uscita_id,))
        if cur.rowcount == 0:
            conn.close()
            raise HTTPException(404, "Collegamento non trovato")
    else:
        # ── Scollega fattura ──
        numeric_id = int(link_id)
        link = cur.execute(
            "SELECT movimento_id, fattura_id FROM banca_fatture_link WHERE id = ?", (numeric_id,)
        ).fetchone()
        cur.execute("DELETE FROM banca_fatture_link WHERE id = ?", (numeric_id,))
        if cur.rowcount == 0:
            conn.close()
            raise HTTPException(404, "Collegamento non trovato")
        if link:
            l = dict(link)
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = NULL,
                    stato = CASE WHEN data_scadenza < date('now') THEN 'SCADUTA' ELSE 'DA_PAGARE' END,
                    importo_pagato = 0,
                    data_pagamento = NULL,
                    updated_at = datetime('now')
                WHERE fattura_id = ? AND banca_movimento_id = ?
            """, (l["fattura_id"], l["movimento_id"]))

    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/cross-ref/search")
def search_uscite_for_link(q: str = "", limit: int = 20):
    """
    Ricerca manuale fatture + uscite CG per collegamento.
    Cerca per fornitore, numero fattura, tipo spesa o importo.
    """
    conn = get_db()
    cur = conn.cursor()

    if not q.strip():
        conn.close()
        return []

    results = []

    # Prova a interpretare come importo
    try:
        importo = float(q.replace(",", ".").replace("€", "").strip())
        is_importo = True
    except (ValueError, AttributeError):
        is_importo = False
        importo = 0.0

    if is_importo:
        # Fatture per importo
        cur.execute("""
            SELECT f.id, f.fornitore_nome, f.numero_fattura,
                   f.data_fattura AS data_ref, f.totale_fattura AS totale,
                   'FATTURA' AS tipo
            FROM fe_fatture f
            LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
            WHERE bfl.id IS NULL
              AND ABS(f.totale_fattura - ?) < MAX(? * 0.1, 1.0)
            ORDER BY ABS(f.totale_fattura - ?) ASC
            LIMIT ?
        """, (importo, importo, importo, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "fattura"; d["source_id"] = d["id"]
            results.append(d)

        # Uscite CG per importo
        cur.execute("""
            SELECT cu.id, cu.fornitore_nome, cu.numero_fattura,
                   cu.data_scadenza AS data_ref, cu.totale,
                   COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo
            FROM cg_uscite cu
            WHERE cu.banca_movimento_id IS NULL
              AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
              AND ABS(cu.totale - ?) < MAX(? * 0.1, 1.0)
            ORDER BY ABS(cu.totale - ?) ASC
            LIMIT ?
        """, (importo, importo, importo, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "uscita"; d["source_id"] = d["id"]
            results.append(d)
    else:
        term = f"%{q.strip()}%"
        # Fatture per testo
        cur.execute("""
            SELECT f.id, f.fornitore_nome, f.numero_fattura,
                   f.data_fattura AS data_ref, f.totale_fattura AS totale,
                   'FATTURA' AS tipo
            FROM fe_fatture f
            LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
            WHERE bfl.id IS NULL
              AND (f.fornitore_nome LIKE ? OR f.numero_fattura LIKE ?)
            ORDER BY f.data_fattura DESC
            LIMIT ?
        """, (term, term, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "fattura"; d["source_id"] = d["id"]
            results.append(d)

        # Uscite CG per testo
        cur.execute("""
            SELECT cu.id, cu.fornitore_nome, cu.numero_fattura,
                   cu.data_scadenza AS data_ref, cu.totale,
                   COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo
            FROM cg_uscite cu
            WHERE cu.banca_movimento_id IS NULL
              AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
              AND (cu.fornitore_nome LIKE ? OR cu.numero_fattura LIKE ?)
            ORDER BY cu.data_scadenza DESC
            LIMIT ?
        """, (term, term, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "uscita"; d["source_id"] = d["id"]
            results.append(d)

    conn.close()
    return results


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
