# @version: v1.2-statistiche
# -*- coding: utf-8 -*-
# Modulo: statistiche
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
8. GET  /statistiche/storico/yoy       — Storico incassi pluriennale (YoY)
9. GET  /statistiche/storico/weekday   — Media incassi/coperti per giorno settimana
10. GET /statistiche/coperto           — Spesa per coperto per categoria (mese per mese)
11. GET /statistiche/movimenti         — Prodotti in crescita/calo mese su mese

NOTA cross-modulo: gli endpoint 8-10 leggono `admin_finance.sqlite3`
(daily_closures + shift_closures, modulo cassa/banca) in SOLA LETTURA.
È l'eccezione prevista dalle regole modulari: il modulo statistiche è
l'aggregatore cross-modulo read-only.

Cucitura storica (pre-K.12): `daily_closures` copre 2021 → cutover,
`shift_closures` dal cutover in poi. Il cutover è dinamico =
MIN(date) di shift_closures, quindi il codice sopravvive al refactor
K.12 (quando daily_closures verrà dismessa il ramo daily restituirà 0 righe).
Fatturato giornaliero: daily → corrispettivi_tot (RT + fatture);
shift → preconto + fatture + shift_preconti (stessa formula di
/admin/finance/shift-closures/stats/daily).
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from datetime import date as date_type
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.services.auth_service import get_current_user, is_admin
from app.services.ipratico_parser import parse_ipratico_html
from app.models.foodcost_db import get_foodcost_connection
from app.utils.locale_data import locale_data_path


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
    if not is_admin(role):
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


# =============================================================
# HELPER: lettura cross-modulo READ-ONLY da admin_finance
# =============================================================
WEEKDAY_LABELS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]


def _get_finance_conn_ro() -> sqlite3.Connection:
    """Connessione SOLA LETTURA a admin_finance.sqlite3 (modulo cassa/banca).

    mode=ro a livello SQLite: qualsiasi scrittura accidentale fallisce.
    """
    path = locale_data_path("admin_finance.sqlite3")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _storico_daily_rows(anno: Optional[int] = None) -> tuple[Optional[str], List[Dict[str, Any]]]:
    """Righe giornaliere unificate daily_closures + shift_closures.

    Ritorna (cutover, rows). Ogni row: date, fatturato, coperti (None se
    fonte daily), fatt_pranzo/fatt_cena/coperti_pranzo/coperti_cena (None se daily).
    """
    conn = _get_finance_conn_ro()
    try:
        cutover = conn.execute("SELECT MIN(date) FROM shift_closures").fetchone()[0]

        rows: List[Dict[str, Any]] = []

        # --- Ramo storico: daily_closures fino al cutover ---
        sql_d = """
            SELECT date, COALESCE(corrispettivi_tot, 0) AS fatt
            FROM daily_closures
            WHERE COALESCE(corrispettivi_tot, 0) > 0
        """
        params_d: List[Any] = []
        if cutover:
            sql_d += " AND date < ?"
            params_d.append(cutover)
        if anno:
            sql_d += " AND CAST(substr(date, 1, 4) AS INTEGER) = ?"
            params_d.append(anno)
        for r in conn.execute(sql_d, params_d):
            rows.append({
                "date": r["date"], "fatturato": r["fatt"],
                "coperti": None, "fatt_pranzo": None, "fatt_cena": None,
                "coperti_pranzo": None, "coperti_cena": None,
            })

        # --- Ramo corrente: shift_closures dal cutover in poi ---
        if cutover:
            sql_s = """
                SELECT sc.date,
                       SUM(COALESCE(sc.preconto,0) + COALESCE(sc.fatture,0) + COALESCE(p.tot,0)) AS fatt,
                       SUM(COALESCE(sc.coperti,0)) AS cop,
                       SUM(CASE WHEN sc.turno = 'pranzo'
                            THEN COALESCE(sc.preconto,0) + COALESCE(sc.fatture,0) + COALESCE(p.tot,0)
                            ELSE 0 END) AS fatt_pranzo,
                       SUM(CASE WHEN sc.turno = 'cena'
                            THEN COALESCE(sc.preconto,0) + COALESCE(sc.fatture,0) + COALESCE(p.tot,0)
                            ELSE 0 END) AS fatt_cena,
                       SUM(CASE WHEN sc.turno = 'pranzo' THEN COALESCE(sc.coperti,0) ELSE 0 END) AS cop_pranzo,
                       SUM(CASE WHEN sc.turno = 'cena' THEN COALESCE(sc.coperti,0) ELSE 0 END) AS cop_cena
                FROM shift_closures sc
                LEFT JOIN (
                    SELECT shift_closure_id, SUM(importo) AS tot
                    FROM shift_preconti GROUP BY shift_closure_id
                ) p ON p.shift_closure_id = sc.id
                WHERE 1=1
            """
            params_s: List[Any] = []
            if anno:
                sql_s += " AND CAST(substr(sc.date, 1, 4) AS INTEGER) = ?"
                params_s.append(anno)
            sql_s += " GROUP BY sc.date"
            for r in conn.execute(sql_s, params_s):
                rows.append({
                    "date": r["date"], "fatturato": r["fatt"] or 0,
                    "coperti": r["cop"],
                    "fatt_pranzo": r["fatt_pranzo"], "fatt_cena": r["fatt_cena"],
                    "coperti_pranzo": r["cop_pranzo"], "coperti_cena": r["cop_cena"],
                })

        rows.sort(key=lambda x: x["date"])
        return cutover, rows
    finally:
        conn.close()


# =============================================================
# 8. STORICO YoY — incassi pluriennali
# =============================================================
@router.get("/storico/yoy", summary="Storico incassi pluriennale (anno su anno)")
def storico_yoy(current_user: Any = Depends(get_current_user)):
    """
    Fatturato per anno e per mese, su tutta la storia disponibile
    (daily_closures 2021→cutover + shift_closures dal cutover).
    Coperti presenti solo dove la fonte è shift_closures.
    """
    cutover, rows = _storico_daily_rows()

    mensile: Dict[tuple, Dict[str, Any]] = {}
    for r in rows:
        anno = int(r["date"][0:4])
        mese = int(r["date"][5:7])
        key = (anno, mese)
        m = mensile.setdefault(key, {
            "anno": anno, "mese": mese, "fatturato": 0.0,
            "giorni": 0, "coperti": 0, "has_coperti": False,
        })
        m["fatturato"] += r["fatturato"]
        m["giorni"] += 1
        if r["coperti"] is not None:
            m["coperti"] += r["coperti"]
            m["has_coperti"] = True

    mensile_out = []
    for key in sorted(mensile.keys()):
        m = mensile[key]
        mensile_out.append({
            "anno": m["anno"], "mese": m["mese"],
            "fatturato": round(m["fatturato"], 2),
            "giorni": m["giorni"],
            "coperti": m["coperti"] if m["has_coperti"] else None,
        })

    annuale: Dict[int, Dict[str, Any]] = {}
    for m in mensile_out:
        a = annuale.setdefault(m["anno"], {"anno": m["anno"], "fatturato": 0.0, "giorni": 0, "coperti": 0, "has_coperti": False})
        a["fatturato"] += m["fatturato"]
        a["giorni"] += m["giorni"]
        if m["coperti"] is not None:
            a["coperti"] += m["coperti"]
            a["has_coperti"] = True

    annuale_out = []
    for anno in sorted(annuale.keys()):
        a = annuale[anno]
        annuale_out.append({
            "anno": a["anno"],
            "fatturato": round(a["fatturato"], 2),
            "giorni": a["giorni"],
            "media_giorno": round(a["fatturato"] / a["giorni"], 2) if a["giorni"] else 0,
            "coperti": a["coperti"] if a["has_coperti"] else None,
        })

    return {"cutover": cutover, "annuale": annuale_out, "mensile": mensile_out}


# =============================================================
# 9. STORICO WEEKDAY — media per giorno della settimana
# =============================================================
@router.get("/storico/weekday", summary="Media incassi e coperti per giorno della settimana")
def storico_weekday(
    anno: Optional[int] = Query(None, description="Anno; vuoto = tutta la storia"),
    current_user: Any = Depends(get_current_user),
):
    """
    Media fatturato per giorno della settimana (tutta la storia o un anno).
    Split pranzo/cena e coperti solo dove la fonte è shift_closures.
    """
    cutover, rows = _storico_daily_rows(anno)

    agg: Dict[int, Dict[str, Any]] = {
        i: {
            "weekday": i, "label": WEEKDAY_LABELS[i],
            "giorni": 0, "fatt_tot": 0.0,
            "giorni_turni": 0, "fatt_pranzo": 0.0, "fatt_cena": 0.0,
            "coperti": 0, "coperti_pranzo": 0, "coperti_cena": 0,
        }
        for i in range(7)
    }
    for r in rows:
        try:
            wd = date_type.fromisoformat(r["date"]).weekday()
        except ValueError:
            continue
        a = agg[wd]
        a["giorni"] += 1
        a["fatt_tot"] += r["fatturato"]
        if r["coperti"] is not None:
            a["giorni_turni"] += 1
            a["coperti"] += r["coperti"]
            a["coperti_pranzo"] += r["coperti_pranzo"] or 0
            a["coperti_cena"] += r["coperti_cena"] or 0
            a["fatt_pranzo"] += r["fatt_pranzo"] or 0
            a["fatt_cena"] += r["fatt_cena"] or 0

    out = []
    for i in range(7):
        a = agg[i]
        n, nt = a["giorni"], a["giorni_turni"]
        out.append({
            "weekday": i,
            "label": a["label"],
            "giorni": n,
            "fatt_medio": round(a["fatt_tot"] / n, 2) if n else 0,
            "fatt_tot": round(a["fatt_tot"], 2),
            # Dati per turno: solo giorni con fonte shift_closures
            "giorni_turni": nt,
            "coperti_medio": round(a["coperti"] / nt, 1) if nt else None,
            "fatt_pranzo_medio": round(a["fatt_pranzo"] / nt, 2) if nt else None,
            "fatt_cena_medio": round(a["fatt_cena"] / nt, 2) if nt else None,
            "coperti_pranzo_medio": round(a["coperti_pranzo"] / nt, 1) if nt else None,
            "coperti_cena_medio": round(a["coperti_cena"] / nt, 1) if nt else None,
        })

    return {"cutover": cutover, "anno": anno, "weekdays": out}


# =============================================================
# 10. SPESA PER COPERTO — incrocio iPratico × coperti
# =============================================================
@router.get("/coperto", summary="Spesa per coperto per categoria, mese per mese")
def spesa_per_coperto(
    anno: int = Query(..., description="Anno (es. 2026)"),
    current_user: Any = Depends(get_current_user),
):
    """
    Per ogni mese dell'anno: coperti e fatturato (da shift_closures),
    scontrino medio, e €/coperto per ogni categoria iPratico.
    Disponibile solo per i mesi coperti da shift_closures (da marzo 2026).
    """
    # Coperti + fatturato mensili da shift_closures (read-only)
    fin = _get_finance_conn_ro()
    try:
        mesi_fin: Dict[int, Dict[str, Any]] = {}
        sql = """
            SELECT CAST(substr(sc.date, 6, 2) AS INTEGER) AS mese,
                   SUM(COALESCE(sc.coperti, 0)) AS coperti,
                   SUM(COALESCE(sc.preconto,0) + COALESCE(sc.fatture,0) + COALESCE(p.tot,0)) AS fatt,
                   COUNT(DISTINCT sc.date) AS giorni
            FROM shift_closures sc
            LEFT JOIN (
                SELECT shift_closure_id, SUM(importo) AS tot
                FROM shift_preconti GROUP BY shift_closure_id
            ) p ON p.shift_closure_id = sc.id
            WHERE CAST(substr(sc.date, 1, 4) AS INTEGER) = ?
            GROUP BY mese
        """
        for r in fin.execute(sql, (anno,)):
            mesi_fin[r["mese"]] = {
                "coperti": r["coperti"], "fatturato": round(r["fatt"] or 0, 2), "giorni": r["giorni"],
            }
    finally:
        fin.close()

    # Categorie iPratico per mese
    conn = _get_conn()
    cat_rows = conn.execute(
        """SELECT mese, categoria, SUM(quantita) AS quantita, SUM(totale_cent) AS totale_cent
           FROM ipratico_categorie WHERE anno = ?
           GROUP BY mese, categoria""",
        (anno,),
    ).fetchall()
    conn.close()

    cat_per_mese: Dict[int, List[Any]] = {}
    for r in cat_rows:
        cat_per_mese.setdefault(r["mese"], []).append(r)

    out = []
    for mese in sorted(set(mesi_fin.keys()) | set(cat_per_mese.keys())):
        fin_m = mesi_fin.get(mese)
        coperti = fin_m["coperti"] if fin_m else None
        categorie = []
        for r in cat_per_mese.get(mese, []):
            tot = r["totale_cent"] / 100.0
            categorie.append({
                "categoria": r["categoria"],
                "quantita": r["quantita"],
                "totale_euro": round(tot, 2),
                "per_coperto": round(tot / coperti, 2) if coperti else None,
                "pezzi_per_coperto": round(r["quantita"] / coperti, 2) if coperti else None,
            })
        categorie.sort(key=lambda c: c["totale_euro"], reverse=True)
        out.append({
            "mese": mese,
            "coperti": coperti,
            "giorni": fin_m["giorni"] if fin_m else None,
            "fatturato": fin_m["fatturato"] if fin_m else None,
            "scontrino_medio": round(fin_m["fatturato"] / coperti, 2) if fin_m and coperti else None,
            "categorie": categorie,
        })

    return {"anno": anno, "mesi": out}


# =============================================================
# 11. MOVIMENTI PRODOTTI — crescita/calo mese su mese
# =============================================================
@router.get("/movimenti", summary="Prodotti in crescita/calo rispetto al mese precedente importato")
def movimenti_prodotti(
    anno: int = Query(..., description="Anno del mese di riferimento"),
    mese: int = Query(..., ge=1, le=12, description="Mese di riferimento"),
    min_euro: float = Query(50, ge=0, description="Soglia minima € (in uno dei due mesi) per filtrare il rumore"),
    n: int = Query(10, ge=1, le=50, description="Quanti prodotti per lista"),
    current_user: Any = Depends(get_current_user),
):
    """
    Confronta il mese richiesto con il mese immediatamente precedente
    tra quelli importati. Ritorna top crescite, top cali, nuovi e spariti.
    """
    conn = _get_conn()

    # Mese precedente = l'import più recente prima di (anno, mese)
    prev = conn.execute(
        """SELECT anno, mese FROM ipratico_imports
           WHERE (anno < ?) OR (anno = ? AND mese < ?)
           ORDER BY anno DESC, mese DESC LIMIT 1""",
        (anno, anno, mese),
    ).fetchone()

    if not prev:
        conn.close()
        return {"corrente": {"anno": anno, "mese": mese}, "precedente": None,
                "up": [], "down": [], "nuovi": [], "spariti": []}

    def _fetch(a: int, m: int) -> Dict[str, Dict[str, Any]]:
        rows = conn.execute(
            """SELECT categoria, prodotto, SUM(quantita) AS quantita, SUM(totale_cent) AS totale_cent
               FROM ipratico_prodotti WHERE anno = ? AND mese = ?
               GROUP BY categoria, prodotto""",
            (a, m),
        ).fetchall()
        return {f"{r['categoria']}||{r['prodotto']}": r for r in rows}

    cur_map = _fetch(anno, mese)
    prev_map = _fetch(prev["anno"], prev["mese"])
    conn.close()

    deltas, nuovi, spariti = [], [], []
    for key in set(cur_map) | set(prev_map):
        c, p = cur_map.get(key), prev_map.get(key)
        cur_tot = (c["totale_cent"] / 100.0) if c else 0.0
        prev_tot = (p["totale_cent"] / 100.0) if p else 0.0
        if max(cur_tot, prev_tot) < min_euro:
            continue
        r = c or p
        item = {
            "categoria": r["categoria"],
            "prodotto": r["prodotto"],
            "attuale_euro": round(cur_tot, 2),
            "precedente_euro": round(prev_tot, 2),
            "attuale_qta": c["quantita"] if c else 0,
            "precedente_qta": p["quantita"] if p else 0,
            "delta_euro": round(cur_tot - prev_tot, 2),
            "delta_pct": round((cur_tot - prev_tot) / prev_tot * 100, 1) if prev_tot > 0 else None,
        }
        if not p:
            nuovi.append(item)
        elif not c:
            spariti.append(item)
        else:
            deltas.append(item)

    up = sorted([d for d in deltas if d["delta_euro"] > 0], key=lambda d: -d["delta_euro"])[:n]
    down = sorted([d for d in deltas if d["delta_euro"] < 0], key=lambda d: d["delta_euro"])[:n]
    nuovi.sort(key=lambda d: -d["attuale_euro"])
    spariti.sort(key=lambda d: -d["precedente_euro"])

    return {
        "corrente": {"anno": anno, "mese": mese},
        "precedente": {"anno": prev["anno"], "mese": prev["mese"]},
        "min_euro": min_euro,
        "up": up, "down": down,
        "nuovi": nuovi[:n], "spariti": spariti[:n],
    }
