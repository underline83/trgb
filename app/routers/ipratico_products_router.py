# @version: v1.0-ipratico-products
# Router iPratico Products — import/export Excel prodotti, mapping ↔ vini TRGB
"""
Endpoints:
  POST /vini/ipratico/upload         Upload Excel export iPratico, parse Bottiglie, auto-match
  GET  /vini/ipratico/mappings       Lista mapping corrente (con dati iPratico + TRGB)
  PUT  /vini/ipratico/mappings/{id}  Aggiorna mapping manuale (assegna/rimuovi vino_id)
  POST /vini/ipratico/export         Genera Excel aggiornato con QTA e prezzi TRGB
  GET  /vini/ipratico/sync-log       Storico sincronizzazioni
"""
from __future__ import annotations

import io
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/vini/ipratico", tags=["ipratico-products"])

DB_WINE = Path("app/data/vini.sqlite3")
DB_MAG = Path("app/data/vini_magazzino.sqlite3")
DB_FC = Path("app/data/foodcost.db")  # migration tables live here

UPLOAD_DIR = Path("app/data/ipratico_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ─── helpers ────────────────────────────────────────────────────────
def _fc_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FC)
    conn.row_factory = sqlite3.Row
    return conn


def _wine_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_WINE)
    conn.row_factory = sqlite3.Row
    return conn


def _mag_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_MAG)
    conn.row_factory = sqlite3.Row
    return conn


_NAME_VINTAGE = re.compile(r"^(\d{4})\s+(.+?)\s+(\d{4})\s+(.+)$")
_NAME_SA = re.compile(r"^(\d{4})\s+(.+?)\s+s\.a\.?\s+(.+)$", re.IGNORECASE)


def _parse_ipratico_name(name: str) -> dict:
    """Estrae wine_id (4 cifre), nome vino, annata, produttore dal campo Name iPratico."""
    m = _NAME_VINTAGE.match(name)
    if m:
        return {
            "wine_id": m.group(1),
            "nome": m.group(2).strip(),
            "annata": m.group(3),
            "produttore": m.group(4).strip(),
        }
    m2 = _NAME_SA.match(name)
    if m2:
        return {
            "wine_id": m2.group(1),
            "nome": m2.group(2).strip(),
            "annata": "s.a.",
            "produttore": m2.group(3).strip(),
        }
    # Fallback: try to extract just the 4-digit ID
    if name[:4].isdigit():
        return {
            "wine_id": name[:4],
            "nome": name[5:].strip() if len(name) > 5 else name,
            "annata": None,
            "produttore": None,
        }
    return {"wine_id": None, "nome": name, "annata": None, "produttore": None}


def _normalize(s: str | None) -> str:
    if not s:
        return ""
    return s.strip().lower()


def _auto_match_wine(parsed: dict, trgb_wines: list[dict]) -> Optional[int]:
    """Tenta match automatico: produttore + annata."""
    prod = _normalize(parsed.get("produttore"))
    anno = _normalize(parsed.get("annata"))
    if not prod:
        return None

    candidates = []
    for w in trgb_wines:
        wp = _normalize(w["PRODUTTORE"])
        wa = _normalize(w["ANNATA"])
        if not wp:
            continue
        # Exact producer + vintage match
        if prod == wp and anno and anno == wa:
            candidates.append(w)
        # Producer contains / contained
        elif prod in wp or wp in prod:
            if anno and anno == wa:
                candidates.append(w)

    if len(candidates) == 1:
        return candidates[0]["id"]
    # If multiple matches, try to also match name fragments
    if len(candidates) > 1 and parsed.get("nome"):
        nome = _normalize(parsed["nome"])
        refined = [c for c in candidates if nome and (
            _normalize(c.get("DENOMINAZIONE") or "") in nome or
            nome in _normalize(c.get("DENOMINAZIONE") or "")
        )]
        if len(refined) == 1:
            return refined[0]["id"]
    return None


# ─── Upload & Auto-match ───────────────────────────────────────────
@router.post("/upload")
async def upload_ipratico_export(file: UploadFile = File(...)):
    """Upload export Excel iPratico, parse Bottiglie, auto-match con vini TRGB."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Il file deve essere in formato .xlsx o .xls")

    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "openpyxl non installato sul server")

    content = await file.read()

    # Save file
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    saved_path = UPLOAD_DIR / f"ipratico_{ts}.xlsx"
    saved_path.write_bytes(content)

    # Parse Excel
    try:
        import pandas as pd
        df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Errore lettura Excel: {e}")

    if "Category" not in df.columns or "Name" not in df.columns:
        raise HTTPException(400, "Colonne 'Category' e 'Name' non trovate nel file")

    bottiglie = df[df["Category"] == "Bottiglie"].copy()
    if bottiglie.empty:
        raise HTTPException(400, "Nessun prodotto con categoria 'Bottiglie' trovato")

    # Load TRGB wines for matching
    trgb_wines = []
    try:
        wconn = _wine_conn()
        rows = wconn.execute(
            "SELECT id, DENOMINAZIONE, ANNATA, PRODUTTORE, QTA, PREZZO, FORMATO "
            "FROM vini"
        ).fetchall()
        trgb_wines = [dict(r) for r in rows]
        wconn.close()
    except Exception:
        pass  # DB might not exist yet

    # Also try magazzino DB
    mag_wines = []
    try:
        mconn = _mag_conn()
        rows = mconn.execute(
            "SELECT id, DESCRIZIONE, ANNATA, PRODUTTORE, QTA_TOTALE, PREZZO_CARTA, FORMATO, id_excel "
            "FROM vini_magazzino"
        ).fetchall()
        mag_wines = [dict(r) for r in rows]
        mconn.close()
    except Exception:
        pass

    # Prefer magazzino wines if available, fallback to vini.sqlite3
    match_source = "magazzino" if mag_wines else "carta"
    match_pool = mag_wines if mag_wines else trgb_wines

    # Process each Bottiglia
    fc = _fc_conn()
    n_auto = 0
    n_existing = 0
    n_unmatched = 0
    results = []

    for _, row in bottiglie.iterrows():
        ipratico_uuid = str(row.get("Id", ""))
        name = str(row.get("Name", ""))
        parsed = _parse_ipratico_name(name)
        wine_id = parsed.get("wine_id")

        # Check if mapping already exists
        existing = fc.execute(
            "SELECT id, vino_id, match_status FROM ipratico_product_map WHERE ipratico_uuid = ?",
            (ipratico_uuid,)
        ).fetchone()

        if existing:
            n_existing += 1
            results.append({
                "map_id": existing["id"],
                "ipratico_uuid": ipratico_uuid,
                "wine_id": wine_id,
                "name": name,
                "vino_id": existing["vino_id"],
                "match_status": existing["match_status"],
                "action": "existing",
            })
            continue

        # Auto-match
        vino_id = None
        status = "unmatched"
        if match_pool:
            vino_id = _auto_match_wine(parsed, match_pool)
            if vino_id:
                status = "auto"
                n_auto += 1
            else:
                n_unmatched += 1
        else:
            n_unmatched += 1

        # Insert mapping
        fc.execute(
            """INSERT INTO ipratico_product_map
               (ipratico_uuid, ipratico_wine_id, ipratico_name, ipratico_category, vino_id, match_status)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (ipratico_uuid, wine_id, name, "Bottiglie", vino_id, status),
        )
        map_id = fc.execute("SELECT last_insert_rowid()").fetchone()[0]
        results.append({
            "map_id": map_id,
            "ipratico_uuid": ipratico_uuid,
            "wine_id": wine_id,
            "name": name,
            "vino_id": vino_id,
            "match_status": status,
            "action": "new",
        })

    fc.commit()

    # Log sync
    fc.execute(
        """INSERT INTO ipratico_sync_log (direction, filename, n_matched, n_unmatched)
           VALUES ('import', ?, ?, ?)""",
        (file.filename, n_auto + n_existing, n_unmatched),
    )
    fc.commit()
    fc.close()

    return {
        "total_products": len(df),
        "total_bottiglie": len(bottiglie),
        "new_mappings": len(bottiglie) - n_existing,
        "auto_matched": n_auto,
        "existing": n_existing,
        "unmatched": n_unmatched,
        "match_source": match_source,
        "filename": file.filename,
    }


# ─── Mappings CRUD ─────────────────────────────────────────────────
@router.get("/mappings")
def get_mappings(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """Lista mapping iPratico ↔ TRGB con dati arricchiti."""
    fc = _fc_conn()
    rows = fc.execute(
        "SELECT * FROM ipratico_product_map ORDER BY ipratico_wine_id"
    ).fetchall()
    fc.close()

    # Load TRGB wine data for enrichment
    wine_map = {}
    try:
        wconn = _wine_conn()
        for r in wconn.execute("SELECT id, DENOMINAZIONE, ANNATA, PRODUTTORE, QTA, PREZZO, FORMATO FROM vini").fetchall():
            wine_map[r["id"]] = dict(r)
        wconn.close()
    except Exception:
        pass

    mag_map = {}
    try:
        mconn = _mag_conn()
        for r in mconn.execute(
            "SELECT id, DESCRIZIONE, ANNATA, PRODUTTORE, QTA_TOTALE, PREZZO_CARTA, FORMATO, id_excel FROM vini_magazzino"
        ).fetchall():
            mag_map[r["id"]] = dict(r)
        mconn.close()
    except Exception:
        pass

    result = []
    for r in rows:
        d = dict(r)
        vid = d.get("vino_id")
        # Enrich with TRGB data
        trgb = mag_map.get(vid) or wine_map.get(vid) or {}
        d["trgb_produttore"] = trgb.get("PRODUTTORE", "")
        d["trgb_denominazione"] = trgb.get("DESCRIZIONE") or trgb.get("DENOMINAZIONE", "")
        d["trgb_annata"] = trgb.get("ANNATA", "")
        d["trgb_qta"] = trgb.get("QTA_TOTALE") if "QTA_TOTALE" in trgb else trgb.get("QTA", 0)
        d["trgb_prezzo"] = trgb.get("PREZZO_CARTA") or trgb.get("PREZZO", 0)
        d["trgb_formato"] = trgb.get("FORMATO", "")

        # Parse iPratico name
        parsed = _parse_ipratico_name(d.get("ipratico_name", ""))
        d["ip_produttore"] = parsed.get("produttore", "")
        d["ip_annata"] = parsed.get("annata", "")
        d["ip_nome"] = parsed.get("nome", "")

        # Filter
        if status and d["match_status"] != status:
            continue
        if search:
            s = search.lower()
            if s not in (d.get("ipratico_name") or "").lower() and \
               s not in (d.get("trgb_produttore") or "").lower() and \
               s not in (d.get("trgb_denominazione") or "").lower():
                continue

        result.append(d)

    return result


class MappingUpdate(BaseModel):
    vino_id: Optional[int] = None


@router.put("/mappings/{map_id}")
def update_mapping(map_id: int, body: MappingUpdate):
    """Aggiorna mapping: assegna o rimuovi collegamento a vino TRGB."""
    fc = _fc_conn()
    existing = fc.execute("SELECT id FROM ipratico_product_map WHERE id = ?", (map_id,)).fetchone()
    if not existing:
        fc.close()
        raise HTTPException(404, "Mapping non trovato")

    if body.vino_id is not None:
        status = "manual"
    else:
        status = "unmatched"

    fc.execute(
        "UPDATE ipratico_product_map SET vino_id = ?, match_status = ?, updated_at = datetime('now') WHERE id = ?",
        (body.vino_id, status, map_id),
    )
    fc.commit()
    fc.close()
    return {"ok": True, "map_id": map_id, "vino_id": body.vino_id, "match_status": status}


# ─── TRGB wines list for manual matching ───────────────────────────
@router.get("/trgb-wines")
def get_trgb_wines(search: Optional[str] = Query(None)):
    """Lista vini TRGB per dropdown selezione match manuale."""
    wines = []
    try:
        wconn = _wine_conn()
        rows = wconn.execute(
            "SELECT id, DENOMINAZIONE, ANNATA, PRODUTTORE, QTA, PREZZO, FORMATO FROM vini ORDER BY PRODUTTORE, ANNATA"
        ).fetchall()
        wines = [dict(r) for r in rows]
        wconn.close()
    except Exception:
        pass

    if search:
        s = search.lower()
        wines = [w for w in wines if
                 s in (w.get("PRODUTTORE") or "").lower() or
                 s in (w.get("DENOMINAZIONE") or "").lower() or
                 s in (w.get("ANNATA") or "").lower()]

    return wines[:200]  # limit for performance


# ─── Export Excel ──────────────────────────────────────────────────
@router.post("/export")
async def export_ipratico(file: UploadFile = File(...)):
    """
    Riceve l'export iPratico originale, aggiorna Warehouse_quantity e prezzi
    dai dati TRGB per le Bottiglie matchate, ritorna l'Excel modificato.
    """
    import openpyxl

    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content))
    ws = wb.active

    # Build header map
    headers = {}
    for col_idx, cell in enumerate(ws[1], 1):
        if cell.value:
            headers[str(cell.value).strip()] = col_idx

    id_col = headers.get("Id")
    cat_col = headers.get("Category")
    qty_col = headers.get("Warehouse_quantity")
    name_col = headers.get("Name")

    if not id_col or not cat_col:
        raise HTTPException(400, "Colonne Id/Category non trovate")

    # Load mappings
    fc = _fc_conn()
    mappings = {}
    for r in fc.execute("SELECT ipratico_uuid, vino_id FROM ipratico_product_map WHERE vino_id IS NOT NULL").fetchall():
        mappings[r["ipratico_uuid"]] = r["vino_id"]
    fc.close()

    # Load TRGB quantities
    wine_data = {}
    try:
        wconn = _wine_conn()
        for r in wconn.execute("SELECT id, QTA, PREZZO FROM vini").fetchall():
            wine_data[r["id"]] = dict(r)
        wconn.close()
    except Exception:
        pass

    mag_data = {}
    try:
        mconn = _mag_conn()
        for r in mconn.execute("SELECT id, QTA_TOTALE, PREZZO_CARTA FROM vini_magazzino").fetchall():
            mag_data[r["id"]] = dict(r)
        mconn.close()
    except Exception:
        pass

    n_updated_qty = 0
    n_updated_price = 0

    # Price columns to update (Ristorante table price = PREZZO_CARTA)
    price_table_1_col = headers.get("Price_table_1")  # Ristorante

    for row_idx in range(2, ws.max_row + 1):
        cat = ws.cell(row=row_idx, column=cat_col).value
        if cat != "Bottiglie":
            continue

        uuid = str(ws.cell(row=row_idx, column=id_col).value or "")
        vino_id = mappings.get(uuid)
        if not vino_id:
            continue

        # Get TRGB data (prefer magazzino)
        trgb = mag_data.get(vino_id) or wine_data.get(vino_id)
        if not trgb:
            continue

        # Update Warehouse_quantity
        if qty_col:
            trgb_qty = trgb.get("QTA_TOTALE") if "QTA_TOTALE" in trgb else trgb.get("QTA", 0)
            old_qty = ws.cell(row=row_idx, column=qty_col).value
            if trgb_qty is not None and trgb_qty != old_qty:
                ws.cell(row=row_idx, column=qty_col).value = trgb_qty or 0
                n_updated_qty += 1

        # Update price (Ristorante table = PREZZO_CARTA)
        if price_table_1_col:
            trgb_price = trgb.get("PREZZO_CARTA") or trgb.get("PREZZO")
            old_price = ws.cell(row=row_idx, column=price_table_1_col).value
            if trgb_price and trgb_price > 0 and trgb_price != old_price:
                ws.cell(row=row_idx, column=price_table_1_col).value = trgb_price
                n_updated_price += 1

    # Log
    fc2 = _fc_conn()
    fc2.execute(
        """INSERT INTO ipratico_sync_log
           (direction, filename, n_matched, n_updated_qty, n_updated_price, n_unmatched)
           VALUES ('export', ?, ?, ?, ?, ?)""",
        (file.filename, len(mappings), n_updated_qty, n_updated_price,
         sum(1 for row_idx in range(2, ws.max_row + 1)
             if ws.cell(row=row_idx, column=cat_col).value == "Bottiglie"
             and str(ws.cell(row=row_idx, column=id_col).value or "") not in mappings)),
    )
    fc2.commit()
    fc2.close()

    # Return modified Excel
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="ipratico_sync_{ts}.xlsx"',
            "X-Updated-Qty": str(n_updated_qty),
            "X-Updated-Price": str(n_updated_price),
            "X-Total-Matched": str(len(mappings)),
        },
    )


# ─── Sync log ─────────────────────────────────────────────────────
@router.get("/sync-log")
def get_sync_log():
    fc = _fc_conn()
    rows = fc.execute("SELECT * FROM ipratico_sync_log ORDER BY created_at DESC LIMIT 50").fetchall()
    fc.close()
    return [dict(r) for r in rows]


# ─── Stats ─────────────────────────────────────────────────────────
@router.get("/stats")
def get_ipratico_stats():
    """Riepilogo veloce: quanti match, unmatched, totali."""
    fc = _fc_conn()
    total = fc.execute("SELECT COUNT(*) FROM ipratico_product_map").fetchone()[0]
    matched = fc.execute(
        "SELECT COUNT(*) FROM ipratico_product_map WHERE vino_id IS NOT NULL"
    ).fetchone()[0]
    auto = fc.execute(
        "SELECT COUNT(*) FROM ipratico_product_map WHERE match_status = 'auto'"
    ).fetchone()[0]
    manual = fc.execute(
        "SELECT COUNT(*) FROM ipratico_product_map WHERE match_status = 'manual'"
    ).fetchone()[0]
    unmatched = fc.execute(
        "SELECT COUNT(*) FROM ipratico_product_map WHERE vino_id IS NULL"
    ).fetchone()[0]
    fc.close()
    return {
        "total": total,
        "matched": matched,
        "auto": auto,
        "manual": manual,
        "unmatched": unmatched,
    }
