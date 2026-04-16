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


# ─── SYNC PROGRESS (module-level) ─────────────────────────
_sync_progress: Dict[str, Any] = {
    "running": False,
    "phase": "",           # "count" | "lista" | "dettaglio" | "done"
    "total": 0,            # totale documenti da API
    "current": 0,          # documento corrente in elaborazione
    "phase1_done": 0,      # documenti processati in fase 1 (lista)
    "phase2_total": 0,     # documenti che necessitano dettaglio
    "phase2_done": 0,      # documenti con dettaglio completato
    "nuove": 0,
    "aggiornate": 0,
    "errori": 0,
    "last_fornitore": "",  # ultimo fornitore elaborato (feedback visivo)
}

def _reset_progress():
    _sync_progress.update({
        "running": False, "phase": "", "total": 0, "current": 0,
        "phase1_done": 0, "phase2_total": 0, "phase2_done": 0,
        "nuove": 0, "aggiornate": 0, "errori": 0, "last_fornitore": "",
    })


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
    - righe in fe_righe (da items_list, o fallback XML SDI)
    Ritorna dict con contatori: {"righe": N, "merged": 0|1, "fonte_righe": "fic"|"xml"|""}
    """
    result = {"righe": 0, "merged": 0, "no_detail": False, "fonte_righe": ""}
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
        e_invoice = bool(doc_data.get("e_invoice"))
        attachment_url = doc_data.get("attachment_url") or ""

        # ── STATO PAGAMENTO + DATI SCADENZA ──────────────
        payments = doc_data.get("payments_list") or []
        if payments:
            all_paid = all(
                (p.get("status", "") == "paid" or p.get("paid_date"))
                for p in payments
            )
            pagato = 1 if all_paid else 0
        else:
            pagato = 0

        # Estrai dati pagamento dalla prima rata (scadenza principale)
        fic_data_scadenza = None
        fic_importo_pagamento = None
        if payments:
            # Prendi la prima rata non pagata, oppure la prima in assoluto
            pmt = next((p for p in payments if p.get("status") != "paid"), payments[0])
            fic_data_scadenza = pmt.get("due_date") or None
            fic_importo_pagamento = pmt.get("amount") or None

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

        # Aggiorna header con dati dal dettaglio + pagamento
        conn.execute(
            """UPDATE fe_fatture SET
                numero_fattura = ?,
                pagato = ?,
                data_scadenza = COALESCE(data_scadenza, ?),
                importo_pagamento = COALESCE(importo_pagamento, ?)
            WHERE id = ?""",
            (invoice_number, pagato, fic_data_scadenza, fic_importo_pagamento, fattura_db_id),
        )

        # ── RIGHE / ITEMS ────────────────────────────────
        items_list = doc_data.get("items_list") or []

        # ★ FALLBACK XML: se FIC non ha righe strutturate ma la fattura e'
        # elettronica con XML allegato, proviamo a estrarre le righe dal
        # tracciato SDI (DettaglioLinee). Vedi app/utils/fatturapa_parser.py.
        if not items_list and e_invoice and attachment_url:
            try:
                from app.utils.fatturapa_parser import download_and_parse
                parsed = download_and_parse(attachment_url, timeout=25)
                xml_righe = parsed.get("righe", []) or []
                if xml_righe:
                    # Rimuovi righe precedenti (re-sync pulito)
                    conn.execute(
                        "DELETE FROM fe_righe WHERE fattura_id = ?",
                        (fattura_db_id,),
                    )
                    for xr in xml_righe:
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
                                fattura_db_id,
                                xr.get("numero_linea") or 0,
                                xr.get("descrizione", ""),
                                xr.get("quantita"),
                                xr.get("unita_misura", ""),
                                xr.get("prezzo_unitario"),
                                xr.get("prezzo_totale"),
                                xr.get("aliquota_iva"),
                                "",   # categoria_grezza non presente in SDI
                                xr.get("codice_articolo", ""),
                                None, None,  # fic_item_id / fic_product_id
                                None, 0,     # detraibilita / stock
                            ),
                        )
                        result["righe"] += 1
                    result["fonte_righe"] = "xml"
                    # Auto-categorizza anche le righe da XML
                    try:
                        from app.routers.fe_categorie_router import auto_categorize_righe
                        auto_categorize_righe(conn, fattura_db_id, fornitore_piva)
                    except Exception as ce:
                        print(f"⚠️ auto_categorize XML fail fic_id={fic_id}: {ce}")
                    return result
            except Exception as xe:
                # Non bloccare: passa al ramo no_detail
                print(f"⚠️ XML fallback fallito fic_id={fic_id}: {xe}")

        if not items_list:
            # Controlla se ci sono già righe (es. da XML import separato)
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

        result["fonte_righe"] = "fic"

        # Auto-categorizza righe in base a mapping prodotto + default fornitore
        from app.routers.fe_categorie_router import auto_categorize_righe
        auto_categorize_righe(conn, fattura_db_id, fornitore_piva)

    except Exception as e:
        # Log completo su stdout per diagnosi, NON swallowiare silenziosamente
        import traceback
        print(f"⚠️ FIC detail error fic_id={fic_id}: {e}")
        traceback.print_exc()

    return result


@router.get("/sync/count", summary="Conta veloce fatture da sincronizzare")
def fic_sync_count(
    anno: int = Query(None, description="Anno (default: corrente)"),
    current_user: Any = Depends(get_current_user),
):
    """Chiama l'API FIC con per_page=1 per ottenere il totale rapidamente."""
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            raise HTTPException(400, "Fatture in Cloud non collegato")
        token = cfg["access_token"]
        cid = cfg["company_id"]
        if not anno:
            anno = datetime.now().year
        params = {
            "type": "expense",
            "per_page": 1,
            "page": 1,
            "q": f"date >= '{anno}-01-01' and date <= '{anno}-12-31'",
        }
        data = fic_get(token, f"/c/{cid}/received_documents", params)
        total = data.get("total", 0)
        return {"anno": anno, "total": total}
    finally:
        conn.close()


@router.get("/sync/progress", summary="Progresso sincronizzazione in corso")
def fic_sync_progress(current_user: Any = Depends(get_current_user)):
    """Ritorna lo stato attuale della sincronizzazione."""
    return dict(_sync_progress)


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
        skipped_non_fattura = 0  # mig 061 / problemi.md A1
        page = 1
        totale_api = 0
        error_details: list[str] = []
        sync_items: list[dict] = []

        # Traccia documenti per cui fetchare il dettaglio (fic_id → fattura_db_id)
        docs_to_detail = []

        # ── PROGRESS INIT ────────────────────────────────────
        _reset_progress()
        _sync_progress["running"] = True
        _sync_progress["phase"] = "lista"

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
            _sync_progress["total"] = totale_api

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
                    _sync_progress["last_fornitore"] = fornitore_nome

                    # ── FILTRO NON-FATTURA (mig 061 / problemi.md A1) ──
                    # FIC esporta come "received_documents expense" anche
                    # registrazioni di prima nota (affitti, spese cassa) che
                    # non hanno né numero di documento né P.IVA del fornitore.
                    # Questi record non devono finire in fe_fatture.
                    #
                    # Upgrade (mig 062): oltre a skippare, salvo un warning in
                    # fic_sync_warnings così Marco può controllarli dal pannello
                    # e sapere se FIC ha cambiato formato (es. una vera fattura
                    # senza P.IVA in futuro).
                    if not (doc_number or "").strip() and not (fornitore_piva or "").strip():
                        skipped_non_fattura += 1
                        sync_items.append({
                            "fornitore": fornitore_nome,
                            "numero": "",
                            "data": doc_date or "",
                            "totale": doc.get("amount_gross", 0) or 0,
                            "stato": "skipped_non_fattura",
                        })
                        # Persist warning (dedup via UNIQUE (tipo, fic_document_id))
                        try:
                            conn.execute(
                                """
                                INSERT OR IGNORE INTO fic_sync_warnings
                                    (sync_at, tipo, fornitore_nome, fornitore_piva,
                                     numero_documento, data_documento, importo,
                                     fic_document_id, raw_payload_json)
                                VALUES (CURRENT_TIMESTAMP, 'non_fattura', ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    fornitore_nome,
                                    fornitore_piva or "",
                                    doc_number or "",
                                    doc_date or "",
                                    float(doc.get("amount_gross", 0) or 0),
                                    fic_id,
                                    json.dumps(doc, ensure_ascii=False),
                                ),
                            )
                        except Exception as wex:
                            # Non bloccante: se il warning fallisce, skippo comunque
                            error_details.append(f"Warning insert fallito per fic_id={fic_id}: {wex}")
                        _sync_progress["phase1_done"] += 1
                        continue

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
                        db_id = existing_fic["id"]

                        # Controlla se serve aggiornare l'header
                        cur_row = conn.execute(
                            "SELECT fornitore_nome, fornitore_piva, data_fattura, "
                            "imponibile_totale, iva_totale, totale_fattura, numero_fattura "
                            "FROM fe_fatture WHERE id = ?", (db_id,)
                        ).fetchone()

                        header_changed = (
                            cur_row["fornitore_nome"] != fornitore_nome
                            or cur_row["fornitore_piva"] != fornitore_piva
                            or cur_row["data_fattura"] != doc_date
                            or round(cur_row["imponibile_totale"] or 0, 2) != round(amount_net, 2)
                            or round(cur_row["iva_totale"] or 0, 2) != round(amount_vat, 2)
                            or round(cur_row["totale_fattura"] or 0, 2) != round(amount_gross, 2)
                        )

                        if header_changed:
                            if doc_number:
                                conn.execute(
                                    """UPDATE fe_fatture SET
                                        fornitore_nome=?, fornitore_piva=?, numero_fattura=?,
                                        data_fattura=?, imponibile_totale=?, iva_totale=?,
                                        totale_fattura=?, valuta=? WHERE fic_id=?""",
                                    (fornitore_nome, fornitore_piva, doc_number, doc_date,
                                     amount_net, amount_vat, amount_gross, "EUR", fic_id),
                                )
                            else:
                                conn.execute(
                                    """UPDATE fe_fatture SET
                                        fornitore_nome=?, fornitore_piva=?,
                                        data_fattura=?, imponibile_totale=?, iva_totale=?,
                                        totale_fattura=?, valuta=? WHERE fic_id=?""",
                                    (fornitore_nome, fornitore_piva, doc_date,
                                     amount_net, amount_vat, amount_gross, "EUR", fic_id),
                                )

                        # Ri-fetch dettaglio solo se mancano dati o force_detail
                        needs_detail = force_detail or not cur_row["numero_fattura"]
                        if not needs_detail:
                            # Controlla se mancano righe o dati pagamento
                            extra = conn.execute(
                                "SELECT (SELECT COUNT(*) FROM fe_righe WHERE fattura_id = ?) as n_righe, "
                                "data_scadenza FROM fe_fatture WHERE id = ?",
                                (db_id, db_id)
                            ).fetchone()
                            needs_detail = (extra["n_righe"] == 0) or (extra["data_scadenza"] is None)

                        if needs_detail:
                            docs_to_detail.append((fic_id, db_id))

                        if header_changed or needs_detail:
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
                finally:
                    _sync_progress["phase1_done"] += 1
                    _sync_progress["nuove"] = nuove
                    _sync_progress["aggiornate"] = aggiornate
                    _sync_progress["errori"] = errori

            conn.commit()

            if page >= last_page:
                break
            page += 1

        # ── FASE 2: DETTAGLIO (righe + pagato + dedup XML) ──
        merged_xml = 0
        senza_dettaglio: list[dict] = []
        _sync_progress["phase"] = "dettaglio"
        _sync_progress["phase2_total"] = len(docs_to_detail)
        _sync_progress["phase2_done"] = 0
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

            _sync_progress["phase2_done"] = i + 1
            _sync_progress["errori"] = errori

            # Commit ogni 20 documenti
            if (i + 1) % 20 == 0:
                conn.commit()

        conn.commit()

        # Aggiorna log
        note = (
            f"Anno {anno}: {nuove} nuove, {aggiornate} agg, "
            f"{duplicate_xml} già da XML (fase1), {merged_xml} uniti (fase2), "
            f"{skipped_non_fattura} non-fatture skippate, "
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

        _sync_progress["phase"] = "done"
        _sync_progress["running"] = False

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
    except Exception:
        _sync_progress["phase"] = "done"
        _sync_progress["running"] = False
        raise
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


@router.get("/warnings", summary="Lista warning sync FIC (mig 062 / problemi.md A1)")
def fic_warnings_list(
    tipo: str = Query("", description="Filtro per tipo (es. 'non_fattura'). Vuoto = tutti"),
    visto: Optional[int] = Query(None, description="0=non visti, 1=visti, null=tutti"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    current_user: Any = Depends(get_current_user),
):
    """
    Lista warning generati dal sync FIC (es. prima-nota senza P.IVA).
    Marco può usare questa lista per verificare se FIC ha iniziato a inviare
    documenti in formato inatteso (es. fatture vere senza P.IVA).
    """
    conn = get_db()
    try:
        where = []
        params: list = []
        if tipo:
            where.append("tipo = ?")
            params.append(tipo)
        if visto is not None:
            where.append("COALESCE(visto, 0) = ?")
            params.append(int(bool(visto)))

        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        offset = (page - 1) * per_page

        total = conn.execute(
            f"SELECT COUNT(*) FROM fic_sync_warnings{where_sql}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT id, sync_at, tipo, fornitore_nome, fornitore_piva,
                   numero_documento, data_documento, importo,
                   fic_document_id, COALESCE(visto, 0) AS visto,
                   visto_at, note
            FROM fic_sync_warnings
            {where_sql}
            ORDER BY sync_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            params + [per_page, offset],
        ).fetchall()

        return {
            "total": total,
            "page": page,
            "per_page": per_page,
            "warnings": [dict(r) for r in rows],
        }
    finally:
        conn.close()


@router.get("/warnings/count", summary="Conta warning non visti (per badge)")
def fic_warnings_count(
    visto: int = Query(0, description="0=non visti, 1=visti"),
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        # La tabella può non esistere su DB vecchi — difensivo
        try:
            total = conn.execute(
                "SELECT COUNT(*) FROM fic_sync_warnings WHERE COALESCE(visto, 0) = ?",
                (int(bool(visto)),),
            ).fetchone()[0]
        except sqlite3.OperationalError:
            total = 0
        return {"count": total}
    finally:
        conn.close()


@router.get("/warnings/{warning_id}", summary="Dettaglio warning + raw payload FIC")
def fic_warning_detail(
    warning_id: int,
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM fic_sync_warnings WHERE id = ?", (warning_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Warning non trovato")
        out = dict(row)
        # Parse raw_payload_json per UI più comoda
        raw = out.get("raw_payload_json")
        if raw:
            try:
                out["raw_payload"] = json.loads(raw)
            except Exception:
                out["raw_payload"] = None
        return out
    finally:
        conn.close()


@router.post("/warnings/{warning_id}/visto", summary="Marca warning come visto")
def fic_warning_mark_seen(
    warning_id: int,
    note: str = Query("", description="Nota opzionale"),
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM fic_sync_warnings WHERE id = ?", (warning_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Warning non trovato")
        conn.execute(
            """
            UPDATE fic_sync_warnings
               SET visto = 1,
                   visto_at = CURRENT_TIMESTAMP,
                   note = CASE WHEN ? = '' THEN note ELSE ? END
             WHERE id = ?
            """,
            (note, note, warning_id),
        )
        conn.commit()
        return {"ok": True, "id": warning_id}
    finally:
        conn.close()


@router.post("/warnings/{warning_id}/unvisto", summary="Rimetti warning come non visto")
def fic_warning_mark_unseen(
    warning_id: int,
    current_user: Any = Depends(get_current_user),
):
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM fic_sync_warnings WHERE id = ?", (warning_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Warning non trovato")
        conn.execute(
            """
            UPDATE fic_sync_warnings
               SET visto = 0, visto_at = NULL
             WHERE id = ?
            """,
            (warning_id,),
        )
        conn.commit()
        return {"ok": True, "id": warning_id}
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
    try_xml: bool = Query(True, description="Se True e is_detailed=false, tenta parsing XML da attachment_url"),
    current_user: Any = Depends(get_current_user),
):
    """
    Restituisce il payload grezzo dell'API FIC per un documento specifico.

    Se `try_xml=True` e la fattura e' senza items_list ma ha attachment_url
    + e_invoice=true, tenta anche il parsing del XML SDI allegato per
    mostrare una preview delle righe effettive.
    """
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
        is_detailed = doc_data.get("is_detailed")
        attachment_url = doc_data.get("attachment_url") or ""
        attachment_preview_url = doc_data.get("attachment_preview_url") or ""

        # Preview parsing XML se applicabile (fattura elettronica senza righe)
        xml_parse = None
        if try_xml and e_inv and not items and attachment_url:
            try:
                from app.utils.fatturapa_parser import download_and_parse
                parsed = download_and_parse(attachment_url, timeout=20)
                righe_preview = parsed.get("righe", []) or []
                xml_parse = {
                    "ok": True,
                    "n_righe": len(righe_preview),
                    "numero_xml": parsed.get("numero", ""),
                    "data_xml": parsed.get("data", ""),
                    "fornitore_piva": parsed.get("fornitore_piva", ""),
                    "totale_xml": parsed.get("totale_documento"),
                    "righe_preview": righe_preview[:5],
                }
            except Exception as e:
                xml_parse = {"ok": False, "error": str(e)[:300]}

        return {
            "fic_id": fic_id,
            # Alias invoice_number → numero (frontend legge `numero`)
            "numero": doc_data.get("invoice_number", ""),
            "invoice_number": doc_data.get("invoice_number", ""),
            "date": doc_data.get("date", ""),
            "entity_name": (doc_data.get("entity", {}) or {}).get("name", ""),
            "is_detailed": is_detailed,
            "auto_calculate": doc_data.get("auto_calculate"),
            "type": doc_data.get("type"),
            "n_items": len(items),
            "items_list_raw": items,
            "n_payments": len(payments),
            "payments_preview": payments[:3],
            "e_invoice": e_inv,
            "attachment_url": attachment_url[:200] + ("..." if len(attachment_url) > 200 else ""),
            "attachment_url_full": attachment_url,
            "attachment_preview_url": attachment_preview_url[:200] + ("..." if len(attachment_preview_url) > 200 else ""),
            "raw_keys": list(doc_data.keys()),
            "xml_parse": xml_parse,
        }
    finally:
        conn.close()


# ─── REFETCH RIGHE DA XML (retroattivo) ──────────────────────────

def _refetch_righe_xml_single(conn, token: str, cid: int, db_id: int) -> dict:
    """
    Helper: per una singola fattura (fe_fatture.id), chiama FIC detail,
    scarica XML da attachment_url, parsa e reinserisce fe_righe.

    Ritorna:
      {"ok": bool, "db_id": int, "fic_id": int, "righe": N,
       "numero": "...", "fornitore": "...", "error": "..."}
    """
    row = conn.execute(
        """SELECT id, fic_id, numero_fattura, fornitore_piva, fornitore_denominazione
           FROM fe_fatture WHERE id = ?""",
        (db_id,),
    ).fetchone()
    if not row:
        return {"ok": False, "db_id": db_id, "error": "fattura non trovata"}

    fic_id = row["fic_id"]
    if not fic_id:
        return {
            "ok": False, "db_id": db_id,
            "error": "fattura senza fic_id (non da FIC)",
        }

    try:
        detail = fic_get(token, f"/c/{cid}/received_documents/{fic_id}", {
            "fieldset": "detailed",
        })
        doc_data = detail.get("data", {}) or {}
        attachment_url = doc_data.get("attachment_url") or ""
        e_invoice = bool(doc_data.get("e_invoice"))
        entity = doc_data.get("entity", {}) or {}
        fornitore_piva = entity.get("vat_number", "") or row["fornitore_piva"] or ""

        if not e_invoice:
            return {
                "ok": False, "db_id": db_id, "fic_id": fic_id,
                "error": "non e' fattura elettronica (no XML disponibile)",
            }
        if not attachment_url:
            return {
                "ok": False, "db_id": db_id, "fic_id": fic_id,
                "error": "attachment_url mancante da FIC",
            }

        from app.utils.fatturapa_parser import download_and_parse
        parsed = download_and_parse(attachment_url, timeout=25)
        xml_righe = parsed.get("righe", []) or []

        if not xml_righe:
            return {
                "ok": False, "db_id": db_id, "fic_id": fic_id,
                "error": "XML scaricato ma nessun DettaglioLinee trovato",
            }

        # Pulisci righe precedenti e reinserisci
        conn.execute("DELETE FROM fe_righe WHERE fattura_id = ?", (db_id,))
        for xr in xml_righe:
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
                    db_id,
                    xr.get("numero_linea") or 0,
                    xr.get("descrizione", ""),
                    xr.get("quantita"),
                    xr.get("unita_misura", ""),
                    xr.get("prezzo_unitario"),
                    xr.get("prezzo_totale"),
                    xr.get("aliquota_iva"),
                    "",
                    xr.get("codice_articolo", ""),
                    None, None,
                    None, 0,
                ),
            )

        # Auto-categorizza
        try:
            from app.routers.fe_categorie_router import auto_categorize_righe
            auto_categorize_righe(conn, db_id, fornitore_piva)
        except Exception as ce:
            print(f"⚠️ auto_categorize dopo refetch XML fail db_id={db_id}: {ce}")

        return {
            "ok": True,
            "db_id": db_id,
            "fic_id": fic_id,
            "righe": len(xml_righe),
            "numero": parsed.get("numero", row["numero_fattura"] or ""),
            "fornitore": row["fornitore_denominazione"] or parsed.get("fornitore_denominazione", ""),
        }
    except HTTPException as he:
        return {
            "ok": False, "db_id": db_id, "fic_id": fic_id,
            "error": f"FIC API {he.status_code}: {str(he.detail)[:200]}",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "ok": False, "db_id": db_id, "fic_id": fic_id,
            "error": str(e)[:300],
        }


@router.post("/refetch-righe-xml/{db_id}", summary="Recupera righe da XML SDI per una fattura")
def fic_refetch_righe_xml(
    db_id: int,
    current_user: Any = Depends(get_current_user),
):
    """
    Per una singola fattura (fe_fatture.id), scarica l'XML dalla FIC via
    attachment_url e rigenera le righe in fe_righe parsando il DettaglioLinee.

    Usare dopo il sync normale per recuperare le righe di fatture dove
    FIC restituisce items_list vuoto (is_detailed=false).
    """
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            raise HTTPException(400, "Fatture in Cloud non collegato")
        token = cfg["access_token"]
        cid = cfg["company_id"]

        res = _refetch_righe_xml_single(conn, token, cid, db_id)
        conn.commit()
        return res
    finally:
        conn.close()


@router.post("/bulk-refetch-righe-xml", summary="Recupero massivo righe da XML per fatture FIC senza dettaglio")
def fic_bulk_refetch_righe_xml(
    anno: int = Query(None, description="Filtra per anno (default: tutti)"),
    solo_senza_righe: bool = Query(True, description="Solo fatture con n_righe=0"),
    limit: int = Query(500, ge=1, le=2000, description="Limite massimo di fatture"),
    current_user: Any = Depends(get_current_user),
):
    """
    Esegue il recupero righe da XML su TUTTE le fatture FIC che hanno
    n_righe=0 e sono fatture elettroniche (e_invoice).

    Per ogni fattura chiama l'API FIC per ottenere attachment_url,
    scarica l'XML, parsa DettaglioLinee, popola fe_righe.

    Body: nessuno. Query params: anno, solo_senza_righe, limit.
    """
    conn = get_db()
    try:
        cfg = get_config(conn)
        if not cfg:
            raise HTTPException(400, "Fatture in Cloud non collegato")
        token = cfg["access_token"]
        cid = cfg["company_id"]

        # Trova candidate: fatture FIC che:
        #  - hanno fic_id
        #  - hanno n_righe = 0 (solo_senza_righe=True) oppure tutte
        #  - opzionale filtro anno su data_fattura
        where_clauses = [
            "fic_id IS NOT NULL",
            "COALESCE(fonte, '') = 'fic'",
        ]
        params: list = []

        if solo_senza_righe:
            where_clauses.append(
                "(SELECT COUNT(*) FROM fe_righe r WHERE r.fattura_id = fe_fatture.id) = 0"
            )
        if anno:
            where_clauses.append("substr(data_fattura, 1, 4) = ?")
            params.append(str(anno))

        sql = f"""
            SELECT id FROM fe_fatture
            WHERE {' AND '.join(where_clauses)}
            ORDER BY data_fattura DESC, id DESC
            LIMIT ?
        """
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        candidate_ids = [r["id"] for r in rows]

        risultati = []
        ok_count = 0
        fail_count = 0
        righe_recuperate = 0

        for db_id in candidate_ids:
            res = _refetch_righe_xml_single(conn, token, cid, db_id)
            risultati.append(res)
            if res.get("ok"):
                ok_count += 1
                righe_recuperate += res.get("righe", 0)
            else:
                fail_count += 1
            # Commit intermedio ogni 10 per non perdere tutto in caso di errore
            if (ok_count + fail_count) % 10 == 0:
                conn.commit()

        conn.commit()

        return {
            "ok": True,
            "anno": anno,
            "candidate": len(candidate_ids),
            "ok_count": ok_count,
            "fail_count": fail_count,
            "righe_recuperate": righe_recuperate,
            "dettaglio": risultati,
        }
    finally:
        conn.close()

