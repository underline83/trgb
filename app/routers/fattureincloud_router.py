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


class SyncResultItem(BaseModel):
    fornitore: str = ""
    numero: str = ""
    data: str = ""
    totale: float = 0
    stato: str = ""  # "nuova" | "aggiornata" | "merged_xml"

class SyncResult(BaseModel):
    nuove: int = 0
    aggiornate: int = 0
    duplicate_xml: int = 0
    merged_xml: int = 0
    errori: int = 0
    righe_importate: int = 0
    totale_api: int = 0
    note: str = ""
    error_details: list[str] = []
    items: list[SyncResultItem] = []
    senza_dettaglio: list[SyncResultItem] = []


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


def _fetch_detail_and_righe(conn, token: str, cid: int, fic_id: int, fattura_db_id: int) -> dict:
    """
    Fetcha il dettaglio di un documento da FIC e aggiorna:
    - numero_fattura (invoice_number)
    - pagato (da payments_list)
    - dedup con XML (ora che abbiamo invoice_number)
    - righe in fe_righe (da items_list)
    Ritorna dict con contatori: {"righe": N, "merged": 0|1}
    """
    result = {"righe": 0, "merged": 0, "no_detail": False}
    try:
        detail = fic_get(token, f"/c/{cid}/received_documents/{fic_id}", {
            "fieldset": "detailed",
        })
        doc_data = detail.get("data", {}) or {}

        # ── CAMPI DAL DETTAGLIO ──────────────────────────
        invoice_number = doc_data.get("invoice_number", "") or ""
        entity = doc_data.get("entity", {}) or {}
        fornitore_piva = entity.get("vat_number", "") or ""
        doc_date = doc_data.get("date", "") or ""

        # ── STATO PAGAMENTO ──────────────────────────────
        payments = doc_data.get("payments_list") or []
        if payments:
            all_paid = all(
                (p.get("status", "") == "paid" or p.get("paid_date"))
                for p in payments
            )
            pagato = 1 if all_paid else 0
        else:
            pagato = 0

        # ── DEDUP CON XML (ora che abbiamo invoice_number) ───
        # Cerca se esiste un duplicato XML con stessa piva+numero+data
        if fornitore_piva and invoice_number and doc_date:
            xml_dup = conn.execute(
                """SELECT id FROM fe_fatture
                WHERE fornitore_piva = ? AND numero_fattura = ? AND data_fattura = ?
                  AND COALESCE(fonte, 'xml') = 'xml' AND id != ?""",
                (fornitore_piva, invoice_number, doc_date, fattura_db_id),
            ).fetchone()

            if xml_dup:
                xml_id = xml_dup["id"]
                # Sposta le righe XML sotto il record FIC
                conn.execute(
                    "UPDATE fe_righe SET fattura_id = ? WHERE fattura_id = ?",
                    (fattura_db_id, xml_id),
                )
                # Copia xml_hash e xml_filename dal record XML al FIC
                conn.execute(
                    """UPDATE fe_fatture SET
                        xml_hash = (SELECT xml_hash FROM fe_fatture WHERE id = ?),
                        xml_filename = (SELECT xml_filename FROM fe_fatture WHERE id = ?)
                    WHERE id = ?""",
                    (xml_id, xml_id, fattura_db_id),
                )
                # Elimina il duplicato XML
                conn.execute("DELETE FROM fe_fatture WHERE id = ?", (xml_id,))
                result["merged"] = 1

        # Aggiorna header con dati dal dettaglio
        conn.execute(
            """UPDATE fe_fatture SET
                numero_fattura = ?,
                pagato = ?
            WHERE id = ?""",
            (invoice_number, pagato, fattura_db_id),
        )

        # ── RIGHE / ITEMS ────────────────────────────────
        items_list = doc_data.get("items_list") or []
        if not items_list:
            # Controlla se ci sono già righe (es. da XML)
            existing_righe = conn.execute(
                "SELECT COUNT(*) FROM fe_righe WHERE fattura_id = ?", (fattura_db_id,)
            ).fetchone()[0]
            if existing_righe == 0:
                result["no_detail"] = True
            return result

        # Rimuovi righe precedenti per questa fattura (re-sync pulito)
        conn.execute("DELETE FROM fe_righe WHERE fattura_id = ?", (fattura_db_id,))

        for idx, item in enumerate(items_list, start=1):
            # Tutti i campi dall'API FIC
            descrizione = item.get("name", "") or item.get("description", "") or ""
            codice = item.get("code", "") or ""
            quantita = item.get("qty", None)
            unita_misura = item.get("measure", "") or ""
            prezzo_unitario = item.get("net_price", None)
            fic_item_id = item.get("id", None)
            fic_product_id = item.get("product_id", None)
            detraibilita_iva = item.get("deductibility_vat_percentage", None)
            stock = item.get("stock", 0) or 0
            categoria = item.get("category", "") or ""

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

            conn.execute(
                """
                INSERT INTO fe_righe (
                    fattura_id, numero_linea, descrizione,
                    quantita, unita_misura, prezzo_unitario,
                    prezzo_totale, aliquota_iva, categoria_grezza,
                    codice_articolo, fic_item_id, fic_product_id,
                    detraibilita_iva, stock
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fattura_db_id, idx, descrizione,
                    quantita, unita_misura, prezzo_unitario,
                    prezzo_totale, aliquota_iva, categoria,
                    codice, fic_item_id, fic_product_id,
                    detraibilita_iva, stock,
                ),
            )
            result["righe"] += 1

    except Exception as e:
        print(f"⚠️ FIC detail error fic_id={fic_id}: {e}")

    return result


@router.post("/sync", summary="Sincronizza fatture ricevute → fe_fatture", response_model=SyncResult)
def fic_sync(
    anno: int = Query(None, description="Anno da sincronizzare (default: anno corrente)"),
    force_detail: bool = Query(False, description="Forza re-fetch dettaglio per tutte le fatture (ripara numeri mancanti)"),
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
        error_details: list[str] = []
        sync_items: list[dict] = []

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
                    except HTTPException as he:
                        errori += 1
                        error_details.append(f"Fase1 API fallback pag.{page}: {he.detail}")
                        break
                else:
                    errori += 1
                    error_details.append(f"Fase1 API errore pag.{page}")
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
                        # NON sovrascrivere numero_fattura se la lista API non lo fornisce
                        # (il numero viene dal detail endpoint in fase 2)
                        if doc_number:
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
                        else:
                            conn.execute(
                                """
                                UPDATE fe_fatture SET
                                    fornitore_nome = ?,
                                    fornitore_piva = ?,
                                    data_fattura   = ?,
                                    imponibile_totale = ?,
                                    iva_totale     = ?,
                                    totale_fattura = ?,
                                    valuta         = ?
                                WHERE fic_id = ?
                                """,
                                (
                                    fornitore_nome, fornitore_piva,
                                    doc_date,
                                    amount_net, amount_vat, amount_gross,
                                    "EUR",
                                    fic_id,
                                ),
                            )
                        docs_to_detail.append((fic_id, existing_fic["id"]))
                        aggiornate += 1
                        sync_items.append({"fornitore": fornitore_nome, "numero": doc_number or "", "data": doc_date or "", "totale": amount_gross or 0, "stato": "aggiornata"})
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
                            sync_items.append({"fornitore": fornitore_nome, "numero": doc_number or "", "data": doc_date or "", "totale": amount_gross or 0, "stato": "merged_xml"})
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
                    sync_items.append({"fornitore": fornitore_nome, "numero": doc_number or "", "data": doc_date or "", "totale": amount_gross or 0, "stato": "nuova"})

                except Exception as e:
                    errori += 1
                    err_msg = f"Fase1 doc fic_id={doc.get('id', '?')}: {e}"
                    error_details.append(err_msg)
                    print(f"⚠️ {err_msg}")

            conn.commit()

            if page >= last_page:
                break
            page += 1

        # ── FASE 2: DETTAGLIO (righe + pagato + dedup XML) ──
        merged_xml = 0
        senza_dettaglio: list[dict] = []
        for i, (fic_id, fattura_db_id) in enumerate(docs_to_detail):
            try:
                res = _fetch_detail_and_righe(conn, token, cid, fic_id, fattura_db_id)
                righe_importate += res["righe"]
                merged_xml += res["merged"]
                if res.get("no_detail"):
                    # Recupera info fattura per la segnalazione
                    fat_info = conn.execute(
                        "SELECT fornitore_nome, numero_fattura, data_fattura, totale_fattura FROM fe_fatture WHERE id = ?",
                        (fattura_db_id,)
                    ).fetchone()
                    if fat_info:
                        senza_dettaglio.append({
                            "fornitore": fat_info["fornitore_nome"] or "",
                            "numero": fat_info["numero_fattura"] or "",
                            "data": fat_info["data_fattura"] or "",
                            "totale": fat_info["totale_fattura"] or 0,
                            "stato": "senza_dettaglio",
                        })
            except Exception as e:
                errori += 1
                error_details.append(f"Fase2 dettaglio fic_id={fic_id}, db_id={fattura_db_id}: {e}")

            # Commit ogni 20 documenti
            if (i + 1) % 20 == 0:
                conn.commit()

        conn.commit()

        # Aggiorna log
        note = (
            f"Anno {anno}: {nuove} nuove, {aggiornate} agg, "
            f"{duplicate_xml} già da XML (fase1), {merged_xml} uniti (fase2), "
            f"{righe_importate} righe, totale API: {totale_api}"
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
            merged_xml=merged_xml,
            errori=errori,
            righe_importate=righe_importate,
            totale_api=totale_api,
            note=f"Sincronizzazione {anno} completata",
            error_details=error_details[:50],  # max 50 errori dettagliati
            items=[SyncResultItem(**it) for it in sync_items],
            senza_dettaglio=[SyncResultItem(**it) for it in senza_dettaglio],
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


@router.get("/debug-detail/{fic_id}", summary="Debug: dettaglio raw da FIC API")
def debug_fic_detail(
    fic_id: int,
    current_user: Any = Depends(get_current_user),
):
    """Restituisce il payload grezzo dell'API FIC per un documento specifico."""
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            raise HTTPException(400, "Fatture in Cloud non collegato")

        token = cfg["access_token"]
        cid = cfg["company_id"]

        detail = fic_get(token, f"/c/{cid}/received_documents/{fic_id}", {
            "fieldset": "detailed",
        })
        doc_data = detail.get("data", {}) or {}

        items = doc_data.get("items_list") or []
        payments = doc_data.get("payments_list") or []

        e_inv = doc_data.get("e_invoice")
        return {
            "fic_id": fic_id,
            "invoice_number": doc_data.get("invoice_number", ""),
            "date": doc_data.get("date", ""),
            "entity_name": (doc_data.get("entity", {}) or {}).get("name", ""),
            "is_detailed": doc_data.get("is_detailed"),
            "auto_calculate": doc_data.get("auto_calculate"),
            "type": doc_data.get("type"),
            "n_items": len(items),
            "items_list_raw": items,
            "n_payments": len(payments),
            "payments_preview": payments[:3],
            "e_invoice": e_inv,
            "raw_keys": list(doc_data.keys()),
        }
    finally:
        conn.close()

