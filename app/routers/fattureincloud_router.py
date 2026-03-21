# @version: v1.1-fattureincloud-fix-sync
# -*- coding: utf-8 -*-
"""
Router per integrazione Fatture in Cloud API v2.

Endpoint:
  GET  /fic/status            — stato connessione + info azienda
  POST /fic/connect            — salva access token e recupera company_id
  POST /fic/disconnect         — rimuove token
  POST /fic/sync               — sincronizza fatture ricevute
  GET  /fic/fatture            — lista fatture ricevute (paginata)
  GET  /fic/fatture/{fic_id}   — dettaglio singola fattura
  GET  /fic/sync-log           — storico sincronizzazioni
  GET  /fic/fornitori          — lista fornitori da FIC
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user

# ─── CONFIG ───────────────────────────────────────────────
router = APIRouter(
    prefix="/fic",
    tags=["fattureincloud"],
    dependencies=[Depends(get_current_user)],
)

BASE_DIR = Path(__file__).resolve().parent.parent  # app/
DB_PATH = BASE_DIR / "data" / "foodcost.db"
FIC_BASE = "https://api-v2.fattureincloud.it"


# ─── HELPERS ──────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_config(conn) -> Optional[Dict]:
    """Ritorna la config FIC o None se non configurato."""
    row = conn.execute("SELECT * FROM fic_config WHERE id = 1").fetchone()
    return dict(row) if row else None


def fic_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }


def fic_get(token: str, path: str, params: dict = None) -> dict:
    """GET sincrono verso API FIC."""
    url = f"{FIC_BASE}{path}"
    print(f"🔵 FIC GET {url} params={params}")
    r = httpx.get(
        url,
        headers=fic_headers(token),
        params=params,
        timeout=30,
    )
    if r.status_code != 200:
        print(f"🔴 FIC error {r.status_code}: {r.text[:300]}")
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Fatture in Cloud API error ({r.status_code}): {r.text[:500]}",
        )
    return r.json()


# ─── MODELS ───────────────────────────────────────────────
class ConnectRequest(BaseModel):
    access_token: str = Field(..., description="Token personale FIC")


class SyncResult(BaseModel):
    nuove: int = 0
    aggiornate: int = 0
    errori: int = 0
    totale_api: int = 0
    note: str = ""


# ─── ENDPOINTS ────────────────────────────────────────────


@router.get("/status", summary="Stato connessione Fatture in Cloud")
def fic_status(current_user: Any = Depends(get_current_user)):
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            return {"connected": False}

        # Prova a verificare che il token funzioni
        try:
            data = fic_get(cfg["access_token"], "/user/companies")
            companies = data.get("data", {}).get("companies", [])
            return {
                "connected": True,
                "company_id": cfg["company_id"],
                "company_name": cfg["company_name"],
                "companies": [
                    {"id": c["id"], "name": c.get("name", "")}
                    for c in companies
                ],
            }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e),
                "token_saved": True,
            }
    finally:
        conn.close()


@router.post("/connect", summary="Salva token e collega azienda")
def fic_connect(
    req: ConnectRequest,
    current_user: Any = Depends(get_current_user),
):
    """Salva il token, recupera le aziende, seleziona la prima."""
    token = req.access_token.strip()

    # Verifica token chiamando /user/companies
    try:
        data = fic_get(token, "/user/companies")
    except HTTPException:
        raise HTTPException(400, "Token non valido o API non raggiungibile")

    companies = data.get("data", {}).get("companies", [])
    if not companies:
        raise HTTPException(400, "Nessuna azienda trovata per questo token")

    # Prendi la prima azienda (tipicamente una sola per token personale)
    company = companies[0]
    cid = company["id"]
    cname = company.get("name", "")

    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO fic_config (id, access_token, company_id, company_name, updated_at)
            VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                access_token = excluded.access_token,
                company_id   = excluded.company_id,
                company_name = excluded.company_name,
                updated_at   = CURRENT_TIMESTAMP
            """,
            (token, cid, cname),
        )
        conn.commit()
        return {
            "ok": True,
            "company_id": cid,
            "company_name": cname,
            "message": f"Collegato a: {cname} (ID {cid})",
        }
    finally:
        conn.close()


@router.post("/disconnect", summary="Scollega Fatture in Cloud")
def fic_disconnect(current_user: Any = Depends(get_current_user)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM fic_config WHERE id = 1")
        conn.commit()
        return {"ok": True, "message": "Scollegato da Fatture in Cloud"}
    finally:
        conn.close()


@router.post("/sync", summary="Sincronizza fatture ricevute", response_model=SyncResult)
def fic_sync(
    anno: int = Query(None, description="Anno da sincronizzare (default: anno corrente)"),
    current_user: Any = Depends(get_current_user),
):
    """
    Scarica tutte le fatture ricevute (passive) dall'API e le salva/aggiorna nel DB.
    Se anno non specificato, sincronizza l'anno corrente.
    """
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            raise HTTPException(400, "Fatture in Cloud non collegato")

        token = cfg["access_token"]
        cid = cfg["company_id"]
        if not anno:
            anno = datetime.now().year

        # Crea record nel log
        cur = conn.execute(
            "INSERT INTO fic_sync_log (started_at) VALUES (CURRENT_TIMESTAMP)"
        )
        log_id = cur.lastrowid
        conn.commit()

        nuove = 0
        aggiornate = 0
        errori = 0
        page = 1
        totale_api = 0

        while True:
            try:
                params = {
                    "type": "expense",
                    "per_page": 50,
                    "page": page,
                }
                # Filtro per anno via query 'q' — sintassi FIC: field op 'value'
                if anno:
                    params["q"] = f"date >= '{anno}-01-01' and date <= '{anno}-12-31'"

                data = fic_get(token, f"/c/{cid}/received_documents", params)
            except HTTPException as e:
                # Se il filtro q fallisce, riprova senza filtro (scarica tutto)
                if page == 1 and anno:
                    try:
                        data = fic_get(token, f"/c/{cid}/received_documents", {
                            "type": "expense",
                            "per_page": 50,
                            "page": page,
                        })
                    except HTTPException:
                        errori += 1
                        break
                else:
                    errori += 1
                    break

            items = data.get("data", [])
            totale_api = data.get("total", len(items))
            last_page = data.get("last_page", data.get("total_pages", page))

            for doc in items:
                try:
                    fic_id = doc["id"]
                    doc_date = doc.get("date", "")

                    # Filtro anno lato server (safety net)
                    if anno and doc_date and not doc_date.startswith(str(anno)):
                        continue

                    entity = doc.get("entity", {}) or {}

                    # Calcola importi
                    amount_net = doc.get("amount_net", 0) or 0
                    amount_vat = doc.get("amount_vat", 0) or 0
                    amount_gross = doc.get("amount_gross", 0) or 0

                    # Se gross è 0, calcolalo
                    if not amount_gross and (amount_net or amount_vat):
                        amount_gross = amount_net + amount_vat

                    existing = conn.execute(
                        "SELECT id FROM fic_fatture WHERE fic_id = ?", (fic_id,)
                    ).fetchone()

                    params = (
                        doc.get("type", "expense"),
                        doc.get("number", ""),
                        doc.get("date", ""),
                        doc.get("next_due_date", ""),
                        amount_net,
                        amount_vat,
                        amount_gross,
                        doc.get("currency", {}).get("id", "EUR") if isinstance(doc.get("currency"), dict) else "EUR",
                        entity.get("id"),
                        entity.get("name", ""),
                        entity.get("vat_number", ""),
                        doc.get("description", ""),
                        1 if doc.get("is_marked", False) else 0,
                        doc.get("category", ""),
                        json.dumps(doc, ensure_ascii=False, default=str),
                    )

                    if existing:
                        conn.execute(
                            """
                            UPDATE fic_fatture SET
                                tipo=?, numero=?, data=?, data_scadenza=?,
                                importo_netto=?, importo_iva=?, importo_totale=?,
                                valuta=?, fornitore_id=?, fornitore_nome=?,
                                fornitore_piva=?, descrizione=?, pagato=?,
                                categoria=?, raw_json=?, updated_at=CURRENT_TIMESTAMP
                            WHERE fic_id = ?
                            """,
                            (*params, fic_id),
                        )
                        aggiornate += 1
                    else:
                        conn.execute(
                            """
                            INSERT INTO fic_fatture (
                                fic_id, tipo, numero, data, data_scadenza,
                                importo_netto, importo_iva, importo_totale,
                                valuta, fornitore_id, fornitore_nome,
                                fornitore_piva, descrizione, pagato,
                                categoria, raw_json
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (fic_id, *params),
                        )
                        nuove += 1

                except Exception as e:
                    errori += 1
                    print(f"⚠️ FIC sync error doc {doc.get('id','?')}: {e}")

            conn.commit()

            if page >= last_page:
                break
            page += 1

        # Aggiorna log
        conn.execute(
            """
            UPDATE fic_sync_log SET
                finished_at = CURRENT_TIMESTAMP,
                nuove = ?, aggiornate = ?, errori = ?,
                note = ?
            WHERE id = ?
            """,
            (nuove, aggiornate, errori, f"Anno {anno}, totale API: {totale_api}", log_id),
        )
        conn.commit()

        return SyncResult(
            nuove=nuove,
            aggiornate=aggiornate,
            errori=errori,
            totale_api=totale_api,
            note=f"Sincronizzazione {anno} completata",
        )
    finally:
        conn.close()


@router.get("/fatture", summary="Lista fatture ricevute sincronizzate")
def fic_fatture_list(
    anno: int = Query(None),
    fornitore: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        where = []
        params = []

        if anno:
            where.append("data LIKE ?")
            params.append(f"{anno}-%")
        if fornitore:
            where.append("fornitore_nome LIKE ?")
            params.append(f"%{fornitore}%")

        where_sql = " WHERE " + " AND ".join(where) if where else ""
        offset = (page - 1) * per_page

        total = conn.execute(
            f"SELECT COUNT(*) FROM fic_fatture{where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT id, fic_id, tipo, numero, data, data_scadenza,
                   importo_netto, importo_iva, importo_totale,
                   fornitore_nome, fornitore_piva, descrizione, pagato, categoria
            FROM fic_fatture{where_sql}
            ORDER BY data DESC
            LIMIT ? OFFSET ?
            """,
            (*params, per_page, offset),
        ).fetchall()

        return {
            "total": total,
            "page": page,
            "per_page": per_page,
            "fatture": [dict(r) for r in rows],
        }
    finally:
        conn.close()


@router.get("/fatture/{fic_id}", summary="Dettaglio fattura ricevuta")
def fic_fattura_detail(
    fic_id: int,
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM fic_fatture WHERE fic_id = ?", (fic_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Fattura non trovata")
        d = dict(row)
        # Parse raw_json per il dettaglio completo
        if d.get("raw_json"):
            try:
                d["raw"] = json.loads(d["raw_json"])
            except Exception:
                pass
            del d["raw_json"]
        return d
    finally:
        conn.close()


@router.get("/sync-log", summary="Storico sincronizzazioni")
def fic_sync_log(
    limit: int = Query(20, ge=1, le=100),
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT * FROM fic_sync_log
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return {"log": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/fornitori", summary="Lista fornitori da Fatture in Cloud (live)")
def fic_fornitori(
    q: str = Query("", description="Filtro nome fornitore"),
    current_user: Any = Depends(get_current_user),
):
    """Chiama l'API FIC in tempo reale per la lista fornitori."""
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            raise HTTPException(400, "Fatture in Cloud non collegato")

        token = cfg["access_token"]
        cid = cfg["company_id"]

        params = {"per_page": 100, "fieldset": "basic"}
        if q:
            params["q"] = f"name contains '{q}'"

        data = fic_get(token, f"/c/{cid}/entities/suppliers", params)
        suppliers = data.get("data", [])

        return {
            "total": len(suppliers),
            "fornitori": [
                {
                    "id": s["id"],
                    "name": s.get("name", ""),
                    "vat_number": s.get("vat_number", ""),
                    "tax_code": s.get("tax_code", ""),
                }
                for s in suppliers
            ],
        }
    finally:
        conn.close()
