# @version: v1.2-ipratico-reimport-fix
# Router iPratico Products — import/export Excel prodotti, mapping ↔ vini TRGB
# Il codice 4 cifre nel Name iPratico corrisponde DIRETTAMENTE a vini_magazzino.id
"""
Endpoints:
  POST /vini/ipratico/upload         Upload Excel export iPratico, parse Bottiglie, match per ID diretto
  GET  /vini/ipratico/mappings       Lista mapping corrente (con dati iPratico + TRGB)
  PUT  /vini/ipratico/mappings/{id}  Aggiorna mapping manuale (assegna/rimuovi vino_id)
  POST /vini/ipratico/export         Genera Excel aggiornato con QTA e prezzi TRGB
  GET  /vini/ipratico/sync-log       Storico sincronizzazioni
  GET  /vini/ipratico/stats          Riepilogo veloce
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

DB_MAG = Path("app/data/vini_magazzino.sqlite3")
DB_FC = Path("app/data/foodcost.db")  # migration tables live here

UPLOAD_DIR = Path("app/data/ipratico_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ─── helpers ────────────────────────────────────────────────────────
def _fc_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FC)
    conn.row_factory = sqlite3.Row
    return conn


def _mag_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_MAG)
    conn.row_factory = sqlite3.Row
    return conn


_RE_ID = re.compile(r"^(\d{4})")


def _extract_wine_id(name: str) -> Optional[int]:
    """Estrae il codice 4 cifre dal campo Name iPratico → corrisponde a vini_magazzino.id."""
    m = _RE_ID.match(name.strip())
    return int(m.group(1)) if m else None


# ─── Upload & Match diretto per ID ────────────────────────────────
@router.post("/upload")
async def upload_ipratico_export(file: UploadFile = File(...)):
    """Upload export Excel iPratico, parse Bottiglie, match diretto per ID."""
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

    # Load vini_magazzino IDs per verifica esistenza
    mag_ids = set()
    try:
        mconn = _mag_conn()
        for r in mconn.execute("SELECT id FROM vini_magazzino").fetchall():
            mag_ids.add(r["id"])
        mconn.close()
    except Exception:
        pass

    fc = _fc_conn()

    # Pulisci mapping precedenti e ricostruisci da zero
    fc.execute("DELETE FROM ipratico_product_map")
    fc.commit()

    n_matched = 0
    n_unmatched = 0

    for _, row in bottiglie.iterrows():
        ipratico_uuid = str(row.get("Id", ""))
        name = str(row.get("Name", ""))
        wine_id = _extract_wine_id(name)

        # Match diretto: wine_id = vini_magazzino.id
        vino_id = wine_id if wine_id and wine_id in mag_ids else None
        status = "auto" if vino_id else "unmatched"

        if vino_id:
            n_matched += 1
        else:
            n_unmatched += 1

        fc.execute(
            """INSERT INTO ipratico_product_map
               (ipratico_uuid, ipratico_wine_id, ipratico_name, ipratico_category,
                vino_id, match_status)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (ipratico_uuid, str(wine_id).zfill(4) if wine_id else None,
             name, "Bottiglie", vino_id, status),
        )

    fc.commit()

    # Log sync
    fc.execute(
        """INSERT INTO ipratico_sync_log (direction, filename, n_matched, n_unmatched)
           VALUES ('import', ?, ?, ?)""",
        (file.filename, n_matched, n_unmatched),
    )
    fc.commit()
    fc.close()

    return {
        "total_products": len(df),
        "total_bottiglie": len(bottiglie),
        "matched": n_matched,
        "unmatched": n_unmatched,
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

    # Load TRGB wine data per arricchire
    mag_map = {}
    try:
        mconn = _mag_conn()
        for r in mconn.execute(
            "SELECT id, DESCRIZIONE, DENOMINAZIONE, ANNATA, PRODUTTORE, "
            "FORMATO, QTA_TOTALE, PREZZO_CARTA FROM vini_magazzino"
        ).fetchall():
            mag_map[r["id"]] = dict(r)
        mconn.close()
    except Exception:
        pass

    result = []
    for r in rows:
        d = dict(r)
        vid = d.get("vino_id")
        trgb = mag_map.get(vid, {})
        d["trgb_produttore"] = trgb.get("PRODUTTORE", "")
        d["trgb_descrizione"] = trgb.get("DESCRIZIONE", "")
        d["trgb_annata"] = trgb.get("ANNATA", "")
        d["trgb_qta"] = trgb.get("QTA_TOTALE", 0)
        d["trgb_prezzo"] = trgb.get("PREZZO_CARTA", 0)
        d["trgb_formato"] = trgb.get("FORMATO", "")

        # Filter
        if status and d["match_status"] != status:
            continue
        if search:
            s = search.lower()
            searchable = f"{d.get('ipratico_name', '')} {d.get('trgb_produttore', '')} {d.get('trgb_descrizione', '')}".lower()
            if s not in searchable:
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

    status = "manual" if body.vino_id is not None else "unmatched"

    fc.execute(
        "UPDATE ipratico_product_map SET vino_id = ?, match_status = ?, updated_at = datetime('now') WHERE id = ?",
        (body.vino_id, status, map_id),
    )
    fc.commit()
    fc.close()
    return {"ok": True, "map_id": map_id, "vino_id": body.vino_id, "match_status": status}


# ─── TRGB wines list per match manuale ─────────────────────────────
@router.get("/trgb-wines")
def get_trgb_wines(search: Optional[str] = Query(None)):
    """Lista vini TRGB per dropdown selezione match manuale."""
    wines = []
    try:
        mconn = _mag_conn()
        rows = mconn.execute(
            "SELECT id, DESCRIZIONE, DENOMINAZIONE, ANNATA, PRODUTTORE, FORMATO, QTA_TOTALE, PREZZO_CARTA "
            "FROM vini_magazzino ORDER BY PRODUTTORE, ANNATA"
        ).fetchall()
        wines = [dict(r) for r in rows]
        mconn.close()
    except Exception:
        pass

    if search:
        s = search.lower()
        wines = [w for w in wines if
                 s in (w.get("PRODUTTORE") or "").lower() or
                 s in (w.get("DESCRIZIONE") or "").lower() or
                 s in str(w.get("id", ""))]

    return wines[:200]


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

    name_col = headers.get("Name")
    cat_col = headers.get("Category")
    qty_col = headers.get("Warehouse_quantity")

    if not name_col or not cat_col:
        raise HTTPException(400, "Colonne Name/Category non trovate")

    # Load TRGB data da magazzino
    mag_data = {}
    try:
        mconn = _mag_conn()
        for r in mconn.execute("SELECT id, QTA_TOTALE, PREZZO_CARTA FROM vini_magazzino").fetchall():
            mag_data[r["id"]] = dict(r)
        mconn.close()
    except Exception:
        pass

    # Price columns (Ristorante table price = PREZZO_CARTA)
    price_table_1_col = headers.get("Price_table_1")

    n_updated_qty = 0
    n_updated_price = 0
    n_matched = 0

    for row_idx in range(2, ws.max_row + 1):
        cat = ws.cell(row=row_idx, column=cat_col).value
        if cat != "Bottiglie":
            continue

        name = str(ws.cell(row=row_idx, column=name_col).value or "")
        wine_id = _extract_wine_id(name)
        if not wine_id or wine_id not in mag_data:
            continue

        n_matched += 1
        trgb = mag_data[wine_id]

        # Update Warehouse_quantity (TRGB → iPratico)
        if qty_col:
            trgb_qty = trgb.get("QTA_TOTALE", 0) or 0
            old_qty = ws.cell(row=row_idx, column=qty_col).value
            if trgb_qty != old_qty:
                ws.cell(row=row_idx, column=qty_col).value = trgb_qty
                n_updated_qty += 1

        # Update price Ristorante table = PREZZO_CARTA
        if price_table_1_col:
            trgb_price = trgb.get("PREZZO_CARTA")
            old_price = ws.cell(row=row_idx, column=price_table_1_col).value
            if trgb_price and trgb_price > 0 and trgb_price != old_price:
                ws.cell(row=row_idx, column=price_table_1_col).value = trgb_price
                n_updated_price += 1

    # Log
    fc = _fc_conn()
    fc.execute(
        """INSERT INTO ipratico_sync_log
           (direction, filename, n_matched, n_updated_qty, n_updated_price)
           VALUES ('export', ?, ?, ?, ?)""",
        (file.filename, n_matched, n_updated_qty, n_updated_price),
    )
    fc.commit()
    fc.close()

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
            "X-Total-Matched": str(n_matched),
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
