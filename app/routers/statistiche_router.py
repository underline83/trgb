# @version: v1.0-statistiche
# -*- coding: utf-8 -*-
"""
TRGB — Router Statistiche (Modulo Statistiche)

Endpoint per import dati iPratico e query analytics.

1. POST /statistiche/import-ipratico   — Import export iPratico (.xls HTML)
2. GET  /statistiche/mesi              — Lista mesi importati
3. GET  /statistiche/categorie         — Riepilogo categorie (filtro anno/mese)
4. GET  /statistiche/prodotti          — Dettaglio prodotti (filtro anno/mese/categoria)
5. GET  /statistiche/top-prodotti      — Top N prodotti per fatturato
6. GET  /statistiche/trend             — Trend mensile per categoria o prodotto
7. DELETE /statistiche/mese/{anno}/{mese} — Elimina un mese importato
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.services.auth_service import get_current_user
from app.services.ipratico_parser import parse_ipratico_html
from app.models.foodcost_db import get_foodcost_connection


router = APIRouter(
    prefix="/statistiche",
    tags=["Statistiche"],
)


# ---------------------------------------------------------
# HELPER: connessione DB
# ---------------------------------------------------------
def _get_conn():
    return get_foodcost_connection()


def _require_admin(current_user: Any):
    role = None
    if isinstance(current_user, dict):
        role = current_user.get("role")
    elif hasattr(current_user, "role"):
        role = current_user.role
    if role not in ("admin",):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo admin può eseguire questa operazione.",
        )


# =============================================================
# 1. IMPORT iPRATICO
# =============================================================
@router.post("/import-ipratico", summary="Importa export mensile iPratico")
async def import_ipratico(
    anno: int = Query(..., description="Anno (es. 2025)"),
    mese: int = Query(..., ge=1, le=12, description="Mese (1-12)"),
    file: UploadFile = File(...),
    current_user: Any = Depends(get_current_user),
):
    """
    Importa un file export iPratico (.xls HTML) per un mese specifico.
    Sovrascrive eventuali dati già presenti per lo stesso anno/mese.
    """
    _require_admin(current_user)

    # Salva file temporaneo
    suffix = Path(file.filename or "export.xls").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        content = await file.read()
        tmp.write(content)
        tmp.close()

        categorie, prodotti = parse_ipratico_html(tmp.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore parsing file: {e}")
    finally:
        os.unlink(tmp.name)

    if not categorie and not prodotti:
        raise HTTPException(status_code=400, detail="Nessun dato trovato nel file")

    conn = _get_conn()
    cur = conn.cursor()

    # Elimina dati precedenti per questo mese (upsert)
    cur.execute("DELETE FROM ipratico_categorie WHERE anno = ? AND mese = ?", (anno, mese))
    cur.execute("DELETE FROM ipratico_prodotti WHERE anno = ? AND mese = ?", (anno, mese))
    cur.execute("DELETE FROM ipratico_imports WHERE anno = ? AND mese = ?", (anno, mese))

    # Inserisci categorie
    for c in categorie:
        cur.execute(
            """INSERT INTO ipratico_categorie (anno, mese, categoria, quantita, totale_cent)
               VALUES (?, ?, ?, ?, ?)""",
            (anno, mese, c["categoria"], c["quantita"], c["totale_cent"]),
        )

    # Inserisci prodotti
    for p in prodotti:
        cur.execute(
            """INSERT INTO ipratico_prodotti
               (anno, mese, categoria, prodotto, quantita, totale_cent, plu, barcode)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (anno, mese, p["categoria"], p["prodotto"], p["quantita"],
             p["totale_cent"], p["plu"], p["barcode"]),
        )

    # Log import
    totale = sum(c["totale_cent"] for c in categorie)
    cur.execute(
        """INSERT INTO ipratico_imports (anno, mese, filename, n_categorie, n_prodotti, totale_euro)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (anno, mese, file.filename, len(categorie), len(prodotti), totale / 100.0),
    )

    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "anno": anno,
        "mese": mese,
        "categorie": len(categorie),
        "prodotti": len(prodotti),
        "totale_euro": round(totale / 100.0, 2),
    }


# =============================================================
# 2. LISTA MESI IMPORTATI
# =============================================================
@router.get("/mesi", summary="Lista mesi importati")
def lista_mesi(current_user: Any = Depends(get_current_user)):
    conn = _get_conn()
    rows = conn.execute(
        """SELECT anno, mese, filename, n_categorie, n_prodotti,
                  totale_euro, imported_at
           FROM ipratico_imports
           ORDER BY anno DESC, mese DESC"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# =============================================================
# 3. RIEPILOGO CATEGORIE
# =============================================================
@router.get("/categorie", summary="Riepilogo categorie per mese o totale")
def riepilogo_categorie(
    anno: Optional[int] = Query(None),
    mese: Optional[int] = Query(None),
    current_user: Any = Depends(get_current_user),
):
    """
    Se anno+mese: dati di quel mese.
    Se solo anno: aggregato annuale.
    Se niente: aggregato totale.
    """
    conn = _get_conn()

    sql = """
        SELECT categoria,
               SUM(quantita) as quantita,
               SUM(totale_cent) as totale_cent
        FROM ipratico_categorie
    """
    params = []
    conditions = []

    if anno:
        conditions.append("anno = ?")
        params.append(anno)
    if mese:
        conditions.append("mese = ?")
        params.append(mese)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " GROUP BY categoria ORDER BY SUM(totale_cent) DESC"

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            "categoria": r["categoria"],
            "quantita": r["quantita"],
            "totale_euro": round(r["totale_cent"] / 100.0, 2),
        })
    return result


# =============================================================
# 4. DETTAGLIO PRODOTTI
# =============================================================
@router.get("/prodotti", summary="Dettaglio prodotti con filtri")
def dettaglio_prodotti(
    anno: Optional[int] = Query(None),
    mese: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Ricerca testo nel nome prodotto"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: Any = Depends(get_current_user),
):
    conn = _get_conn()

    sql = """
        SELECT categoria, prodotto,
               SUM(quantita) as quantita,
               SUM(totale_cent) as totale_cent
        FROM ipratico_prodotti
    """
    params = []
    conditions = []

    if anno:
        conditions.append("anno = ?")
        params.append(anno)
    if mese:
        conditions.append("mese = ?")
        params.append(mese)
    if categoria:
        conditions.append("categoria = ?")
        params.append(categoria)
    if q:
        conditions.append("UPPER(prodotto) LIKE UPPER(?)")
        params.append(f"%{q.strip()}%")

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " GROUP BY categoria, prodotto ORDER BY SUM(totale_cent) DESC"
    sql += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        qta = r["quantita"]
        tot = r["totale_cent"] / 100.0
        result.append({
            "categoria": r["categoria"],
            "prodotto": r["prodotto"],
            "quantita": qta,
            "totale_euro": round(tot, 2),
            "prezzo_medio": round(tot / qta, 2) if qta > 0 else 0,
        })
    return result


# =============================================================
# 5. TOP PRODOTTI
# =============================================================
@router.get("/top-prodotti", summary="Top N prodotti per fatturato")
def top_prodotti(
    anno: Optional[int] = Query(None),
    mese: Optional[int] = Query(None),
    n: int = Query(20, ge=1, le=100),
    current_user: Any = Depends(get_current_user),
):
    conn = _get_conn()

    sql = """
        SELECT categoria, prodotto,
               SUM(quantita) as quantita,
               SUM(totale_cent) as totale_cent
        FROM ipratico_prodotti
    """
    params = []
    conditions = []

    if anno:
        conditions.append("anno = ?")
        params.append(anno)
    if mese:
        conditions.append("mese = ?")
        params.append(mese)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " GROUP BY categoria, prodotto ORDER BY SUM(totale_cent) DESC LIMIT ?"
    params.append(n)

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        qta = r["quantita"]
        tot = r["totale_cent"] / 100.0
        result.append({
            "categoria": r["categoria"],
            "prodotto": r["prodotto"],
            "quantita": qta,
            "totale_euro": round(tot, 2),
            "prezzo_medio": round(tot / qta, 2) if qta > 0 else 0,
        })
    return result


# =============================================================
# 6. TREND MENSILE
# =============================================================
@router.get("/trend", summary="Trend mensile per categoria o prodotto")
def trend_mensile(
    anno: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    prodotto: Optional[str] = Query(None),
    current_user: Any = Depends(get_current_user),
):
    """
    Ritorna i dati mese per mese.
    Se categoria: trend della categoria.
    Se prodotto: trend del prodotto specifico.
    Se niente: trend totale.
    """
    conn = _get_conn()

    if prodotto:
        sql = """
            SELECT anno, mese,
                   SUM(quantita) as quantita,
                   SUM(totale_cent) as totale_cent
            FROM ipratico_prodotti
            WHERE UPPER(prodotto) = UPPER(?)
        """
        params = [prodotto]
    elif categoria:
        sql = """
            SELECT anno, mese,
                   SUM(quantita) as quantita,
                   SUM(totale_cent) as totale_cent
            FROM ipratico_categorie
            WHERE categoria = ?
        """
        params = [categoria]
    else:
        sql = """
            SELECT anno, mese,
                   SUM(quantita) as quantita,
                   SUM(totale_cent) as totale_cent
            FROM ipratico_categorie
        """
        params = []

    if anno:
        sql += " AND anno = ?" if "WHERE" in sql else " WHERE anno = ?"
        params.append(anno)

    sql += " GROUP BY anno, mese ORDER BY anno, mese"

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    return [
        {
            "anno": r["anno"],
            "mese": r["mese"],
            "label": f"{r['mese']:02d}/{r['anno']}",
            "quantita": r["quantita"],
            "totale_euro": round(r["totale_cent"] / 100.0, 2),
        }
        for r in rows
    ]


# =============================================================
# 7. ELIMINA MESE
# =============================================================
@router.delete("/mese/{anno}/{mese}", summary="Elimina dati di un mese")
def elimina_mese(
    anno: int,
    mese: int,
    current_user: Any = Depends(get_current_user),
):
    _require_admin(current_user)

    conn = _get_conn()
    cur = conn.cursor()

    cur.execute("DELETE FROM ipratico_categorie WHERE anno = ? AND mese = ?", (anno, mese))
    cur.execute("DELETE FROM ipratico_prodotti WHERE anno = ? AND mese = ?", (anno, mese))
    cur.execute("DELETE FROM ipratico_imports WHERE anno = ? AND mese = ?", (anno, mese))

    conn.commit()
    conn.close()

    return {"status": "ok", "deleted": f"{mese:02d}/{anno}"}
