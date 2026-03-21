# @version: v2.0-unified-fe-fatture
# -*- coding: utf-8 -*-
"""
Router per integrazione Fatture in Cloud API v2.

IMPORTANTE: la sync scrive nella tabella UNIFICATA fe_fatture (stessa usata
dall'import XML), con fonte='fic' e fic_id per la deduplica.
Questo permette a dashboard, categorie, matching e finanza di funzionare
automaticamente senza modifiche.

Endpoint:
  GET  /fic/status            — stato connessione + info azienda
  POST /fic/connect            — salva access token e recupera company_id
  POST /fic/disconnect         — rimuove token
  POST /fic/sync               — sincronizza fatture ricevute → fe_fatture
  GET  /fic/fatture            — lista fatture FIC (da fe_fatture con fonte='fic')
  GET  /fic/sync-log           — storico sincronizzazioni
  GET  /fic/fornitori          — lista fornitori da FIC (live)
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

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
    duplicate_xml: int = 0
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

        try:
            data = fic_get(cfg["access_token"], "/user/companies")
            companies = data.get("data", {}).get("companies", [])

            # Conta fatture per fonte
            counts = conn.execute("""
                SELECT
                    COALESCE(fonte, 'xml') as fonte,
                    COUNT(*) as n
                FROM fe_fatture
                GROUP BY COALESCE(fonte, 'xml')
            """).fetchall()
            count_map = {r["fonte"]: r["n"] for r in counts}

            return {
                "connected": True,
                "company_id": cfg["company_id"],
                "company_name": cfg["company_name"],
                "fatture_xml": count_map.get("xml", 0),
                "fatture_fic": count_map.get("fic", 0),
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

    try:
        data = fic_get(token, "/user/companies")
    except HTTPException:
        raise HTTPException(400, "Token non valido o API non raggiungibile")

    companies = data.get("data", {}).get("companies", [])
    if not companies:
        raise HTTPException(400, "Nessuna azienda trovata per questo token")

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


@router.post("/sync", summary="Sincronizza fatture ricevute → fe_fatture", response_model=SyncResult)
def fic_sync(
    anno: int = Query(None, description="Anno da sincronizzare (default: anno corrente)"),
    current_user: Any = Depends(get_current_user),
):
    """
    Scarica fatture ricevute da FIC e le scrive nella tabella UNIFICATA fe_fatture.

    Deduplica:
    - Per fic_id: se la fattura FIC è già presente (fonte='fic'), la aggiorna.
    - Per piva+numero+data: se la fattura esiste già da XML, la salta (conta come 'duplicate_xml').
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
        duplicate_xml = 0
        errori = 0
        page = 1
        totale_api = 0

        while True:
            try:
                req_params = {
                    "type": "expense",
                    "per_page": 50,
                    "page": page,
                }
                if anno:
                    req_params["q"] = f"date >= '{anno}-01-01' and date <= '{anno}-12-31'"

                data = fic_get(token, f"/c/{cid}/received_documents", req_params)
            except HTTPException:
                # Fallback senza filtro data
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
            last_page = data.get("last_page", page)

            for doc in items:
                try:
                    fic_id = doc["id"]
                    doc_date = doc.get("date", "") or ""
                    doc_number = doc.get("number", "") or ""

                    # Filtro anno lato server (safety net)
                    if anno and doc_date and not doc_date.startswith(str(anno)):
                        continue

                    entity = doc.get("entity", {}) or {}
                    fornitore_nome = entity.get("name", "") or "Sconosciuto"
                    fornitore_piva = entity.get("vat_number", "") or ""

                    # Importi
                    amount_net = doc.get("amount_net", 0) or 0
                    amount_vat = doc.get("amount_vat", 0) or 0
                    amount_gross = doc.get("amount_gross", 0) or 0
                    if not amount_gross and (amount_net or amount_vat):
                        amount_gross = amount_net + amount_vat

                    # ── DEDUPLICA ──────────────────────────────────

                    # 1) Già presente come FIC? → aggiorna
                    existing_fic = conn.execute(
                        "SELECT id FROM fe_fatture WHERE fic_id = ?", (fic_id,)
                    ).fetchone()

                    if existing_fic:
                        conn.execute(
                            """
                            UPDATE fe_fatture SET
                                fornitore_nome = ?,
                                fornitore_piva = ?,
                                numero_fattura = ?,
                                data_fattura   = ?,
                                imponibile_totale = ?,
                                iva_totale     = ?,
                                totale_fattura = ?,
                                valuta         = ?
                            WHERE fic_id = ?
                            """,
                            (
                                fornitore_nome, fornitore_piva,
                                doc_number, doc_date,
                                amount_net, amount_vat, amount_gross,
                                "EUR",
                                fic_id,
                            ),
                        )
                        aggiornate += 1
                        continue

                    # 2) Già presente da XML? (match su piva + numero + data)
                    #    Confronto solo se abbiamo almeno piva e numero
                    if fornitore_piva and doc_number and doc_date:
                        existing_xml = conn.execute(
                            """
                            SELECT id FROM fe_fatture
                            WHERE fornitore_piva = ?
                              AND numero_fattura = ?
                              AND data_fattura = ?
                              AND COALESCE(fonte, 'xml') = 'xml'
                            """,
                            (fornitore_piva, doc_number, doc_date),
                        ).fetchone()

                        if existing_xml:
                            # Aggiorna con fic_id per tracciarla, ma non duplicarla
                            conn.execute(
                                "UPDATE fe_fatture SET fic_id = ? WHERE id = ?",
                                (fic_id, existing_xml["id"]),
                            )
                            duplicate_xml += 1
                            continue

                    # 3) Nuova fattura → inserisci
                    now = datetime.now().isoformat(sep=" ", timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO fe_fatture (
                            fornitore_nome, fornitore_piva,
                            numero_fattura, data_fattura,
                            imponibile_totale, iva_totale, totale_fattura,
                            valuta, data_import, fonte, fic_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'fic', ?)
                        """,
                        (
                            fornitore_nome, fornitore_piva,
                            doc_number, doc_date,
                            amount_net, amount_vat, amount_gross,
                            "EUR", now, fic_id,
                        ),
                    )
                    nuove += 1

                except Exception as e:
                    errori += 1
                    print(f"⚠️ FIC sync error doc {doc.get('id', '?')}: {e}")

            conn.commit()

            if page >= last_page:
                break
            page += 1

        # Aggiorna log
        note = f"Anno {anno}: {nuove} nuove, {aggiornate} agg, {duplicate_xml} già da XML, totale API: {totale_api}"
        conn.execute(
            """
            UPDATE fic_sync_log SET
                finished_at = CURRENT_TIMESTAMP,
                nuove = ?, aggiornate = ?, errori = ?,
                note = ?
            WHERE id = ?
            """,
            (nuove, aggiornate, errori, note, log_id),
        )
        conn.commit()

        return SyncResult(
            nuove=nuove,
            aggiornate=aggiornate,
            duplicate_xml=duplicate_xml,
            errori=errori,
            totale_api=totale_api,
            note=f"Sincronizzazione {anno} completata",
        )
    finally:
        conn.close()


@router.get("/fatture", summary="Lista fatture ricevute sincronizzate da FIC")
def fic_fatture_list(
    anno: int = Query(None),
    fornitore: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    current_user: Any = Depends(get_current_user),
):
    """Lista fatture dalla tabella unificata fe_fatture, filtrate per fonte='fic'."""
    conn = get_db()
    try:
        where = ["COALESCE(fonte, 'xml') = 'fic'"]
        params = []

        if anno:
            where.append("data_fattura LIKE ?")
            params.append(f"{anno}-%")
        if fornitore:
            where.append("fornitore_nome LIKE ?")
            params.append(f"%{fornitore}%")

        where_sql = " WHERE " + " AND ".join(where)
        offset = (page - 1) * per_page

        total = conn.execute(
            f"SELECT COUNT(*) FROM fe_fatture{where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT id, fic_id, numero_fattura as numero, data_fattura as data,
                   imponibile_totale as importo_netto,
                   iva_totale as importo_iva,
                   totale_fattura as importo_totale,
                   fornitore_nome, fornitore_piva, fonte
            FROM fe_fatture{where_sql}
            ORDER BY data_fattura DESC
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


@router.get("/sync-log", summary="Storico sincronizzazioni")
def fic_sync_log(
    limit: int = Query(20, ge=1, le=100),
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM fic_sync_log ORDER BY started_at DESC LIMIT ?",
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
