# @version: v3.0-righe-pagato
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
    righe_importate: int = 0
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


def _fetch_detail_and_righe(conn, token: str, cid: int, fic_id: int, fattura_db_id: int) -> int:
    """
    Fetcha il dettaglio di un documento da FIC e aggiorna:
    - numero_fattura (invoice_number)
    - pagato (da payments_list)
    - righe in fe_righe (da items_list)
    Ritorna il numero di righe inserite.
    """
    righe_count = 0
    try:
        detail = fic_get(token, f"/c/{cid}/received_documents/{fic_id}", {
            "fieldset": "detailed",
        })
        doc_data = detail.get("data", {}) or {}

        # ── CAMPI DAL DETTAGLIO ──────────────────────────
        invoice_number = doc_data.get("invoice_number", "") or ""
        description = doc_data.get("description", "") or ""

        # ── STATO PAGAMENTO ──────────────────────────────
        payments = doc_data.get("payments_list") or []
        # Controlla se tutti i pagamenti hanno status "paid"
        if payments:
            all_paid = all(
                (p.get("status", "") == "paid" or p.get("paid_date"))
                for p in payments
            )
            pagato = 1 if all_paid else 0
        else:
            pagato = 0

        # Aggiorna header con dati dal dettaglio
        conn.execute(
            """UPDATE fe_fatture SET
                numero_fattura = CASE WHEN COALESCE(numero_fattura, '') = '' THEN ? ELSE numero_fattura END,
                pagato = ?
            WHERE id = ?""",
            (invoice_number, pagato, fattura_db_id),
        )

        # ── RIGHE / ITEMS ────────────────────────────────
        items_list = doc_data.get("items_list") or []
        if not items_list:
            return 0

        # Rimuovi righe precedenti per questa fattura (re-sync pulito)
        conn.execute("DELETE FROM fe_righe WHERE fattura_id = ?", (fattura_db_id,))

        for idx, item in enumerate(items_list, start=1):
            # FIC API: il campo è "name" (es. "MIELE MILLEFIORI G.750 RIGONI DI ASIAGO")
            descrizione = item.get("name", "") or item.get("description", "") or ""
            codice = item.get("code", "") or ""

            quantita = item.get("qty", None)
            unita_misura = item.get("measure", "") or ""
            prezzo_unitario = item.get("net_price", None)

            # Calcola totale riga = qty * net_price
            prezzo_totale = None
            if quantita and prezzo_unitario:
                prezzo_totale = round(quantita * prezzo_unitario, 2)

            # IVA: oggetto con 'value' (percentuale), es. {"id": 3, "value": 10}
            vat_info = item.get("vat") or {}
            if isinstance(vat_info, dict):
                aliquota_iva = vat_info.get("value", None)
            else:
                aliquota_iva = vat_info

            # Categoria direttamente sull'item
            categoria = item.get("category", "") or ""

            conn.execute(
                """
                INSERT INTO fe_righe (
                    fattura_id, numero_linea, descrizione,
                    quantita, unita_misura, prezzo_unitario,
                    prezzo_totale, aliquota_iva, categoria_grezza
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fattura_db_id, idx, descrizione,
                    quantita, unita_misura, prezzo_unitario,
                    prezzo_totale, aliquota_iva, categoria,
                ),
            )
            righe_count += 1

    except Exception as e:
        print(f"⚠️ FIC detail error fic_id={fic_id}: {e}")

    return righe_count


@router.post("/sync", summary="Sincronizza fatture ricevute → fe_fatture", response_model=SyncResult)
def fic_sync(
    anno: int = Query(None, description="Anno da sincronizzare (default: anno corrente)"),
    current_user: Any = Depends(get_current_user),
):
    """
    Scarica fatture ricevute da FIC e le scrive nella tabella UNIFICATA fe_fatture.

    Fase 1 — Lista: pagina tutte le fatture, inserisce/aggiorna header in fe_fatture.
    Fase 2 — Dettaglio: per ogni fattura nuova/aggiornata, fetcha il dettaglio
             con items_list e payments_list per popolare fe_righe e stato pagamento.

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
        righe_importate = 0
        page = 1
        totale_api = 0

        # Traccia documenti per cui fetchare il dettaglio (fic_id → fattura_db_id)
        docs_to_detail = []

        # ── FASE 1: LISTA (header) ──────────────────────────
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

            # DEBUG: log primo documento della prima pagina
            if page == 1 and items:
                print(f"🔍 FIC DOC KEYS: {list(items[0].keys())}")
                print(f"🔍 FIC DOC SAMPLE: { {k: v for k, v in items[0].items() if k not in ('entity',)} }")
                if items[0].get("entity"):
                    print(f"🔍 FIC DOC ENTITY: {items[0]['entity']}")

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
                        docs_to_detail.append((fic_id, existing_fic["id"]))
                        aggiornate += 1
                        continue

                    # 2) Già presente da XML? (match su piva + numero + data)
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
                            conn.execute(
                                "UPDATE fe_fatture SET fic_id = ? WHERE id = ?",
                                (fic_id, existing_xml["id"]),
                            )
                            # Fetcha dettaglio anche per XML linkate (righe + pagato)
                            docs_to_detail.append((fic_id, existing_xml["id"]))
                            duplicate_xml += 1
                            continue

                    # 3) Nuova fattura → inserisci
                    now = datetime.now().isoformat(sep=" ", timespec="seconds")
                    cur2 = conn.execute(
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
                    new_db_id = cur2.lastrowid
                    docs_to_detail.append((fic_id, new_db_id))
                    nuove += 1

                except Exception as e:
                    errori += 1
                    print(f"⚠️ FIC sync error doc {doc.get('id', '?')}: {e}")

            conn.commit()

            if page >= last_page:
                break
            page += 1

        # ── FASE 2: DETTAGLIO (righe + pagato) ──────────────
        print(f"🔵 FIC sync fase 2: fetching detail for {len(docs_to_detail)} documents")
        for fic_id, fattura_db_id in docs_to_detail:
            try:
                n = _fetch_detail_and_righe(conn, token, cid, fic_id, fattura_db_id)
                righe_importate += n
            except Exception as e:
                errori += 1
                print(f"⚠️ FIC detail error fic_id={fic_id}: {e}")

            # Commit ogni 20 documenti per non perdere tutto in caso di errore
            if righe_importate % 100 == 0:
                conn.commit()

        conn.commit()

        # Aggiorna log
        note = (
            f"Anno {anno}: {nuove} nuove, {aggiornate} agg, "
            f"{duplicate_xml} già da XML, {righe_importate} righe, "
            f"totale API: {totale_api}"
        )
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
            righe_importate=righe_importate,
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
        where = ["COALESCE(f.fonte, 'xml') = 'fic'"]
        params = []

        if anno:
            where.append("f.data_fattura LIKE ?")
            params.append(f"{anno}-%")
        if fornitore:
            where.append("f.fornitore_nome LIKE ?")
            params.append(f"%{fornitore}%")

        where_sql = " WHERE " + " AND ".join(where)
        offset = (page - 1) * per_page

        total = conn.execute(
            f"SELECT COUNT(*) FROM fe_fatture f{where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT f.id, f.fic_id, f.numero_fattura as numero, f.data_fattura as data,
                   f.imponibile_totale as importo_netto,
                   f.iva_totale as importo_iva,
                   f.totale_fattura as importo_totale,
                   f.fornitore_nome, f.fornitore_piva, f.fonte,
                   COALESCE(f.pagato, 0) as pagato,
                   (SELECT COUNT(*) FROM fe_righe r WHERE r.fattura_id = f.id) as n_righe
            FROM fe_fatture f{where_sql}
            ORDER BY f.data_fattura DESC
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


debug_router = APIRouter(prefix="/fic", tags=["FIC Debug"])

@debug_router.get("/debug-fields", summary="[TEMP] Mostra campi raw API per debug")
def fic_debug_fields():
    """Endpoint temporaneo: scorre documenti finché ne trova uno CON items_list."""
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            raise HTTPException(400, "Fatture in Cloud non collegato")

        token = cfg["access_token"]
        cid = cfg["company_id"]

        # Prendi documenti recenti (2026) che probabilmente hanno items
        list_data = fic_get(token, f"/c/{cid}/received_documents", {
            "type": "expense", "per_page": 20,
            "q": "date >= '2026-01-01'",
        })
        docs = list_data.get("data", [])
        if not docs:
            return {"error": "Nessun documento trovato"}

        # Scorre finché trova un doc con items
        found_with_items = None
        found_detail = None
        checked = 0
        for doc in docs:
            fic_id = doc["id"]
            detail_data = fic_get(token, f"/c/{cid}/received_documents/{fic_id}", {
                "fieldset": "detailed",
            })
            detail = detail_data.get("data", {}) or {}
            items = detail.get("items_list") or []
            checked += 1
            if items:
                found_with_items = doc
                found_detail = detail
                break

        if not found_detail:
            return {
                "error": f"Nessun doc con items trovato (controllati {checked})",
                "sample_detail_keys": list(detail.keys()) if detail else [],
                "is_detailed_values": [
                    {"id": d["id"], "has_entity_piva": bool((d.get("entity") or {}).get("vat_number"))}
                    for d in docs[:5]
                ],
            }

        items = found_detail.get("items_list") or []
        return {
            "doc_id": found_with_items["id"],
            "invoice_number": found_detail.get("invoice_number"),
            "is_detailed": found_detail.get("is_detailed"),
            "detail_keys": list(found_detail.keys()),
            "items_count": len(items),
            "first_item_ALL_FIELDS": items[0] if items else None,
            "second_item": items[1] if len(items) > 1 else None,
            "payments_list": found_detail.get("payments_list") or [],
        }
    finally:
        conn.close()
