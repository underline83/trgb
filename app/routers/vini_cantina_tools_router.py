# @version: v1.0-cantina-tools
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Router Cantina Tools
File: app/routers/vini_cantina_tools_router.py

Strumenti per ponte Excel ↔ Cantina:

1. POST /vini/cantina-tools/sync-from-excel
   → Legge vini.sqlite3 (dopo import Excel tradizionale) e sincronizza
     nel DB cantina con upsert. Anagrafica/prezzi aggiornati,
     giacenze e movimenti intatti per vini già esistenti.

2. POST /vini/cantina-tools/import-excel
   → Import diretto di un file Excel nel DB cantina (senza passare
     per vini.sqlite3). Usa la stessa logica di normalizzazione.

3. GET /vini/cantina-tools/export-excel
   → Scarica un .xlsx dal DB cantina, formato compatibile con l'Excel
     storico di lavoro.

4. GET /vini/cantina-tools/carta-cantina
   → Genera la carta vini HTML leggendo dal DB cantina
5. GET /vini/cantina-tools/carta-cantina/pdf
   → Genera il PDF della carta leggendo dal DB cantina
6. GET /vini/cantina-tools/carta-cantina/docx
   → Genera il DOCX della carta leggendo dal DB cantina

Tutti gli endpoint richiedono autenticazione; sync/import solo admin.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional
from itertools import groupby

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from weasyprint import HTML, CSS
from docx import Document
from docx.shared import Inches

from app.services.auth_service import get_current_user, decode_access_token
from app.models import vini_magazzino_db as mag_db
from app.models.vini_db import get_connection as get_carta_connection
from app.models.vini_model import normalize_dataframe
from app.services.carta_vini_service import (
    build_carta_body_html,
    build_carta_body_html_htmlsafe,
    build_carta_toc_html,
    resolve_regione,
)
from app.repositories.vini_repository import _load_ordinamenti, _load_filtri


router = APIRouter(
    prefix="/vini/cantina-tools",
    tags=["Vini Cantina Tools"],
)

# PATH DI BASE
BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
CSS_HTML = STATIC_DIR / "css" / "carta_html.css"
CSS_PDF = STATIC_DIR / "css" / "carta_pdf.css"
LOGO_PATH = STATIC_DIR / "img" / "logo_tregobbi.png"


# ---------------------------------------------------------
# HELPER: verifica ruolo admin
# ---------------------------------------------------------
def _require_admin(current_user: Any):
    role = None
    if isinstance(current_user, dict):
        role = current_user.get("role")
    elif hasattr(current_user, "role"):
        role = current_user.role
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo admin può eseguire questa operazione.",
        )


def _get_user_from_query_token(token: Optional[str] = Query(None)) -> Any:
    """
    Autenticazione opzionale via query parameter ?token=...
    Utile per i download via window.open() dove non si può passare l'header.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token mancante. Passa ?token=... nell'URL.",
        )
    return decode_access_token(token)


def _get_username(current_user: Any) -> str:
    if isinstance(current_user, dict):
        return current_user.get("username") or current_user.get("sub") or "unknown"
    for attr in ("username", "sub"):
        if hasattr(current_user, attr):
            val = getattr(current_user, attr)
            if val:
                return str(val)
    return "unknown"


# ---------------------------------------------------------
# HELPER: carica vini ordinati dal DB cantina
# ---------------------------------------------------------
def _load_vini_cantina_ordinati() -> List[Dict[str, Any]]:
    """
    Equivalente di load_vini_ordinati() del repository,
    ma legge dal DB cantina (vini_magazzino.sqlite3).
    Applica stessi filtri e ordinamento delle impostazioni.
    """
    conn = mag_db.get_magazzino_connection()
    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT
            id, id_excel,
            TIPOLOGIA, NAZIONE, CODICE, REGIONE,
            PRODUTTORE, DESCRIZIONE, DENOMINAZIONE,
            ANNATA, FORMATO,
            PREZZO_CARTA, EURO_LISTINO,
            QTA_TOTALE, CARTA
        FROM vini_magazzino
        WHERE
            TIPOLOGIA IS NOT NULL
            AND TIPOLOGIA <> 'ERRORE'
            AND CARTA = 'SI'
        """
    ).fetchall()
    conn.close()

    # Filtri
    min_qta_stampa, mostra_negativi, mostra_senza_prezzo = _load_filtri()

    filtered = []
    for r in rows:
        qta = r["QTA_TOTALE"] or 0
        prezzo = r["PREZZO_CARTA"]

        if not (qta >= min_qta_stampa or (mostra_negativi and qta < 0)):
            continue

        if not mostra_senza_prezzo:
            if prezzo is None or prezzo == 0:
                continue

        filtered.append(dict(r))

    # Ordinamento
    tip_map, naz_map, reg_map = _load_ordinamenti()

    def sort_key(r):
        return (
            tip_map.get(r["TIPOLOGIA"], 9999),
            naz_map.get(r["NAZIONE"], 9999),
            reg_map.get(r["CODICE"], 9999),
            (r["PRODUTTORE"] or "").upper(),
            (r["DESCRIZIONE"] or "").upper(),
            r["ANNATA"] or "",
        )

    ordered = sorted(filtered, key=sort_key)

    # Adatta i nomi campo per compatibilità con carta_vini_service
    # (il service si aspetta "PREZZO", non "PREZZO_CARTA")
    for r in ordered:
        r["PREZZO"] = r.get("PREZZO_CARTA")
        r["QTA"] = r.get("QTA_TOTALE", 0)

    return ordered


# =============================================================
# 1. SYNC DA EXCEL (vini.sqlite3 → cantina)
# =============================================================
@router.post("/sync-from-excel", summary="Sincronizza DB Excel → Cantina")
def sync_from_excel(
    forza_giacenze: bool = Query(
        False,
        description="Se true, sovrascrive anche le giacenze dei vini già esistenti con i valori dell'Excel",
    ),
    current_user: Any = Depends(get_current_user),
):
    """
    Legge tutti i vini dal DB vini.sqlite3 (popolato dall'import Excel classico)
    e li sincronizza nel DB cantina con upsert:
    - Vini nuovi: inseriti con ORIGINE='EXCEL', giacenze dall'Excel
    - Vini esistenti: aggiornata solo anagrafica/prezzi
    - Se forza_giacenze=true: sovrascrive ANCHE le giacenze dei vini esistenti

    I vini presenti solo in cantina (ORIGINE='MANUALE') non vengono toccati.
    """
    _require_admin(current_user)

    # Leggi tutti i vini dall'Excel in una sola connessione
    conn_excel = get_carta_connection()
    cur = conn_excel.cursor()
    rows = cur.execute("SELECT * FROM vini;").fetchall()
    conn_excel.close()

    # Carica mappa id_excel → id_cantina in una sola query
    conn_mag = mag_db.get_magazzino_connection()
    cur_mag = conn_mag.cursor()
    existing_map = {}          # id_excel → id_cantina
    natural_key_map = {}       # (desc_upper, prod_upper, annata, formato) → (id_cantina, id_excel)
    for row in cur_mag.execute(
        "SELECT id, id_excel, DESCRIZIONE, PRODUTTORE, ANNATA, FORMATO FROM vini_magazzino;"
    ):
        if row["id_excel"] is not None:
            existing_map[row["id_excel"]] = row["id"]
        # Fallback: chiave naturale per recuperare match quando id_excel cambia
        nk = (
            (row["DESCRIZIONE"] or "").strip().upper(),
            (row["PRODUTTORE"] or "").strip().upper(),
            (row["ANNATA"] or "").strip(),
            (row["FORMATO"] or "").strip(),
        )
        natural_key_map[nk] = (row["id"], row["id_excel"])
    conn_mag.close()

    inseriti = 0
    aggiornati = 0
    ricollegati = 0           # vini matchati per chiave naturale (id_excel aggiornato)
    giacenze_forzate = 0
    errori = []

    for r in rows:
        try:
            data = {
                "id_excel": r["id"],
                "TIPOLOGIA": r["TIPOLOGIA"],
                "NAZIONE": r["NAZIONE"],
                "CODICE": r["CODICE"],
                "REGIONE": r["REGIONE"],
                "DESCRIZIONE": r["DESCRIZIONE"],
                "DENOMINAZIONE": r["DENOMINAZIONE"],
                "ANNATA": r["ANNATA"],
                "FORMATO": r["FORMATO"],
                "PRODUTTORE": r["PRODUTTORE"],
                "DISTRIBUTORE": r["DISTRIBUTORE"],
                "PREZZO_CARTA": r["PREZZO"],
                "EURO_LISTINO": r["EURO_LISTINO"],
                "SCONTO": r["SCONTO"],
                "CARTA": r["CARTA"],
                "IPRATICO": r["IPRATICO"],
                "FRIGORIFERO": r["FRIGORIFERO"],
                "LOCAZIONE_1": r["LOCAZIONE_1"],
                "LOCAZIONE_2": r["LOCAZIONE_2"],
                "ORIGINE": "EXCEL",
            }

            existing_id = existing_map.get(r["id"])

            # FALLBACK: se id_excel non matcha, cerca per chiave naturale
            # e aggiorna il collegamento id_excel nel DB cantina
            if not existing_id:
                nk = (
                    (r["DESCRIZIONE"] or "").strip().upper(),
                    (r["PRODUTTORE"] or "").strip().upper(),
                    (r["ANNATA"] or "").strip(),
                    (r["FORMATO"] or "").strip(),
                )
                match = natural_key_map.get(nk)
                if match:
                    cantina_id, old_id_excel = match
                    existing_id = cantina_id
                    # Aggiorna id_excel nel DB cantina per mantenere il collegamento
                    mag_db.update_vino(cantina_id, {"id_excel": r["id"]})
                    ricollegati += 1

            # Giacenze dall'Excel
            qta_frigo = r["N_FRIGO"] or 0
            qta_loc1 = r["N_LOC1"] or 0
            qta_loc2 = r["N_LOC2"] or 0
            qta_totale = r["QTA"] or 0

            if not existing_id:
                # Vino nuovo: importa sempre le giacenze
                data["QTA_FRIGO"] = qta_frigo
                data["QTA_LOC1"] = qta_loc1
                data["QTA_LOC2"] = qta_loc2
                data["QTA_TOTALE"] = qta_totale
                inseriti += 1
            else:
                aggiornati += 1

            mag_db.upsert_vino_from_carta(data)

            # Forza giacenze sui vini già esistenti (dopo l'upsert)
            if existing_id and forza_giacenze:
                mag_db.update_vino(existing_id, {
                    "QTA_FRIGO": qta_frigo,
                    "QTA_LOC1": qta_loc1,
                    "QTA_LOC2": qta_loc2,
                    "QTA_TOTALE": qta_totale,
                })
                giacenze_forzate += 1

        except Exception as e:
            desc = r["DESCRIZIONE"] or ""
            prod = r["PRODUTTORE"] or ""
            errori.append(f"{desc} ({prod}): {e}")

    msg = f"Sincronizzazione completata: {inseriti} nuovi, {aggiornati} aggiornati"
    if ricollegati:
        msg += f", {ricollegati} ricollegati per chiave naturale"
    if forza_giacenze:
        msg += f", {giacenze_forzate} giacenze sovrascritte da Excel"
    if errori:
        msg += f", {len(errori)} errori"

    return {
        "status": "ok",
        "totale_excel": len(rows),
        "inseriti": inseriti,
        "aggiornati": aggiornati,
        "ricollegati": ricollegati,
        "giacenze_forzate": giacenze_forzate,
        "forza_giacenze": forza_giacenze,
        "errori": errori,
        "msg": msg,
    }


# =============================================================
# 2. IMPORT DIRETTO EXCEL → CANTINA
# =============================================================
@router.post("/import-excel", summary="Import diretto Excel → Cantina")
async def import_excel_to_cantina(
    file: UploadFile = File(...),
    current_user: Any = Depends(get_current_user),
):
    """
    Importa un file Excel direttamente nel DB cantina (senza passare
    per vini.sqlite3). Usa normalize_dataframe per compatibilità.
    I vini con id già presente vengono aggiornati (upsert su id_excel).
    I vini nuovi vengono inseriti con giacenze dall'Excel.
    """
    _require_admin(current_user)

    # Salva file temporaneo
    suffix = Path(file.filename or "upload.xlsx").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        content = await file.read()
        tmp.write(content)
        tmp.close()

        df = pd.read_excel(tmp.name, sheet_name="VINI")
        df = df.dropna(how="all")
        df = normalize_dataframe(df)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Errore lettura Excel: {e}",
        )
    finally:
        os.unlink(tmp.name)

    # Pre-carica mappa di vini esistenti per match veloce
    conn_mag = mag_db.get_magazzino_connection()
    cur_mag = conn_mag.cursor()
    # Mappa: chiave naturale → id cantina (per match robusto)
    natural_key_map = {}
    for vrow in cur_mag.execute(
        "SELECT id, DESCRIZIONE, PRODUTTORE, ANNATA, FORMATO FROM vini_magazzino;"
    ):
        nk = (
            (vrow["DESCRIZIONE"] or "").strip().upper(),
            (vrow["PRODUTTORE"] or "").strip().upper(),
            (vrow["ANNATA"] or "").strip(),
            (vrow["FORMATO"] or "").strip(),
        )
        natural_key_map[nk] = vrow["id"]
    conn_mag.close()

    inseriti = 0
    aggiornati = 0
    errori = []

    for ridx, row in df.iterrows():
        try:
            data = {
                "TIPOLOGIA": row.get("TIPOLOGIA"),
                "NAZIONE": row.get("NAZIONE"),
                "CODICE": row.get("CODICE"),
                "REGIONE": row.get("REGIONE"),
                "DESCRIZIONE": row.get("DESCRIZIONE"),
                "DENOMINAZIONE": row.get("DENOMINAZIONE"),
                "ANNATA": row.get("ANNATA"),
                "FORMATO": row.get("FORMATO"),
                "PRODUTTORE": row.get("PRODUTTORE"),
                "DISTRIBUTORE": row.get("DISTRIBUTORE"),
                "PREZZO_CARTA": row.get("PREZZO"),
                "EURO_LISTINO": row.get("EURO_LISTINO"),
                "SCONTO": row.get("SCONTO"),
                "CARTA": row.get("CARTA"),
                "IPRATICO": row.get("IPRATICO"),
                "FRIGORIFERO": row.get("FRIGORIFERO"),
                "LOCAZIONE_1": row.get("LOCAZIONE_1"),
                "LOCAZIONE_2": row.get("LOCAZIONE_2"),
                "ORIGINE": "EXCEL",
            }

            # Pulizia None/NaN
            for k, v in data.items():
                if pd.isna(v) if isinstance(v, float) else False:
                    data[k] = None

            # Se DESCRIZIONE è necessaria
            if not data.get("DESCRIZIONE"):
                continue
            if not data.get("TIPOLOGIA"):
                data["TIPOLOGIA"] = "ERRORE"
            if not data.get("NAZIONE"):
                data["NAZIONE"] = "SCONOSCIUTA"

            # Cerca match per chiave naturale (DESCRIZIONE+PRODUTTORE+ANNATA+FORMATO)
            nk = (
                (data["DESCRIZIONE"] or "").strip().upper(),
                (data.get("PRODUTTORE") or "").strip().upper(),
                (data.get("ANNATA") or "").strip(),
                (data.get("FORMATO") or "").strip(),
            )
            existing_id = natural_key_map.get(nk)

            if existing_id:
                # Aggiorna il vino esistente (senza toccare giacenze)
                update_data = {
                    k: v for k, v in data.items()
                    if k not in ("QTA_FRIGO", "QTA_LOC1", "QTA_LOC2", "QTA_TOTALE")
                    and v is not None
                }
                mag_db.update_vino(existing_id, update_data)
                aggiornati += 1
            else:
                # Nuovo: importa con giacenze
                data["QTA_FRIGO"] = int(row.get("N_FRIGO", 0) or 0)
                data["QTA_LOC1"] = int(row.get("N_LOC1", 0) or 0)
                data["QTA_LOC2"] = int(row.get("N_LOC2", 0) or 0)
                data["QTA_TOTALE"] = int(row.get("QTA", 0) or 0)
                # Serve almeno una locazione per create_vino
                if not any([data.get("FRIGORIFERO"), data.get("LOCAZIONE_1"), data.get("LOCAZIONE_2")]):
                    data["FRIGORIFERO"] = "Frigo"
                new_id = mag_db.create_vino(data)
                # Aggiungi alla mappa per evitare doppi inserimenti nello stesso import
                natural_key_map[nk] = new_id
                inseriti += 1

        except Exception as e:
            desc = row.get("DESCRIZIONE") or ""
            prod = row.get("PRODUTTORE") or ""
            errori.append(f"riga {ridx}: {desc} ({prod}): {e}")

    return {
        "status": "ok",
        "righe_excel": len(df),
        "inseriti": inseriti,
        "aggiornati": aggiornati,
        "errori": errori,
        "msg": f"Import completato: {inseriti} nuovi, {aggiornati} aggiornati"
        + (f", {len(errori)} errori" if errori else ""),
    }


# =============================================================
# 2b. PULIZIA DUPLICATI
# =============================================================
@router.post("/cleanup-duplicates", summary="Rimuovi vini duplicati dalla cantina")
def cleanup_duplicates(
    dry_run: bool = Query(
        True,
        description="Se true, mostra solo i duplicati senza eliminarli",
    ),
    current_user: Any = Depends(get_current_user),
):
    """
    Trova e rimuove vini duplicati nella cantina.
    Duplicati = stessa DESCRIZIONE + PRODUTTORE + ANNATA + FORMATO (case-insensitive).
    Mantiene il record con id più basso (il primo inserito).
    """
    _require_admin(current_user)

    conn = mag_db.get_magazzino_connection()
    cur = conn.cursor()

    # Trova gruppi di duplicati
    groups = cur.execute("""
        SELECT
            UPPER(TRIM(COALESCE(DESCRIZIONE, ''))) AS dk,
            UPPER(TRIM(COALESCE(PRODUTTORE, '')))  AS pk,
            TRIM(COALESCE(ANNATA, ''))              AS ak,
            TRIM(COALESCE(FORMATO, ''))             AS fk,
            COUNT(*) AS cnt,
            GROUP_CONCAT(id, ',') AS ids
        FROM vini_magazzino
        GROUP BY dk, pk, ak, fk
        HAVING cnt > 1
        ORDER BY cnt DESC, dk
    """).fetchall()

    duplicati = []
    ids_to_delete = []

    for g in groups:
        ids_list = sorted(int(x) for x in g["ids"].split(","))
        keep_id = ids_list[0]
        delete_ids = ids_list[1:]
        ids_to_delete.extend(delete_ids)
        duplicati.append({
            "descrizione": g["dk"],
            "produttore": g["pk"],
            "annata": g["ak"],
            "formato": g["fk"],
            "copie": g["cnt"],
            "keep_id": keep_id,
            "delete_ids": delete_ids,
        })

    eliminati = 0
    if not dry_run and ids_to_delete:
        placeholders = ",".join("?" * len(ids_to_delete))
        cur.execute(f"DELETE FROM vini_magazzino WHERE id IN ({placeholders})", ids_to_delete)
        conn.commit()
        eliminati = len(ids_to_delete)

    conn.close()

    return {
        "status": "ok",
        "dry_run": dry_run,
        "gruppi_duplicati": len(duplicati),
        "vini_da_eliminare": len(ids_to_delete),
        "eliminati": eliminati,
        "duplicati": duplicati[:50],  # limita output
        "msg": (
            f"Trovati {len(duplicati)} gruppi ({len(ids_to_delete)} copie). "
            + (f"Eliminati {eliminati} duplicati." if not dry_run else "Dry-run: nessuna modifica.")
        ),
    }


# =============================================================
# 3. EXPORT CANTINA → EXCEL
# =============================================================
@router.get("/export-excel", summary="Esporta cantina in Excel")
def export_cantina_excel(
    current_user: Any = Depends(_get_user_from_query_token),
):
    """
    Genera un .xlsx con tutti i vini dal DB cantina,
    in formato compatibile con l'Excel storico di lavoro.
    """
    conn = mag_db.get_magazzino_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT *
        FROM vini_magazzino
        ORDER BY TIPOLOGIA, NAZIONE, REGIONE, PRODUTTORE, DESCRIZIONE, ANNATA
        """
    ).fetchall()
    conn.close()

    wb = Workbook()
    ws = wb.active
    ws.title = "VINI"

    # Header
    headers = [
        "ID", "TIPOLOGIA", "NAZIONE", "CODICE", "REGIONE",
        "CARTA", "DESCRIZIONE", "ANNATA", "PRODUTTORE",
        "DENOMINAZIONE", "FORMATO",
        "PREZZO", "LISTINO", "SCONTO",
        "FRIGORIFERO", "N", "LOCAZIONE 1", "N.1", "LOCAZIONE 2", "N.2",
        "Q.TA", "DISTRIBUTORE", "IPRATICO", "ORIGINE",
    ]

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="6B2D5B", end_color="6B2D5B", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border

    # Dati
    for row_idx, r in enumerate(rows, 2):
        values = [
            r["id"],
            r["TIPOLOGIA"],
            r["NAZIONE"],
            r["CODICE"],
            r["REGIONE"],
            r["CARTA"],
            r["DESCRIZIONE"],
            r["ANNATA"],
            r["PRODUTTORE"],
            r["DENOMINAZIONE"],
            r["FORMATO"],
            r["PREZZO_CARTA"],
            r["EURO_LISTINO"],
            r["SCONTO"],
            r["FRIGORIFERO"],
            r["QTA_FRIGO"],
            r["LOCAZIONE_1"],
            r["QTA_LOC1"],
            r["LOCAZIONE_2"],
            r["QTA_LOC2"],
            r["QTA_TOTALE"],
            r["DISTRIBUTORE"],
            r["IPRATICO"],
            r["ORIGINE"],
        ]
        for col_idx, val in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.border = thin_border

    # Auto-width
    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            try:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 3, 40)

    # Freeze header
    ws.freeze_panes = "A2"

    # Salva
    out_path = STATIC_DIR / "cantina_export.xlsx"
    wb.save(str(out_path))

    return FileResponse(
        str(out_path),
        filename=f"cantina_vini_{datetime.now().strftime('%Y%m%d')}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# =============================================================
# 4. CARTA DA CANTINA — HTML
# =============================================================
@router.get("/carta-cantina", summary="Carta vini HTML da DB cantina")
def carta_cantina_html():
    """
    Genera la carta dei vini leggendo dal DB cantina.
    Stessa logica di /vini/carta ma con fonte dati diversa.
    """
    rows = _load_vini_cantina_ordinati()
    body_html = build_carta_body_html_htmlsafe(rows)

    css_content = ""
    if CSS_HTML.exists():
        css_content = f"<style>{CSS_HTML.read_text()}</style>"

    html_doc = f"""<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <title>OSTERIA TRE GOBBI — CARTA DEI VINI (da Cantina)</title>
    {css_content}
</head>
<body>
    <div class="carta-container">
        {body_html}
    </div>
</body>
</html>"""

    return HTMLResponse(content=html_doc)


# =============================================================
# 5. CARTA DA CANTINA — PDF
# =============================================================
@router.get("/carta-cantina/pdf", summary="Carta vini PDF da DB cantina")
def carta_cantina_pdf(
    current_user: Any = Depends(_get_user_from_query_token),
):
    """
    Genera il PDF della carta vini dal DB cantina.
    """
    rows = _load_vini_cantina_ordinati()
    data_oggi = datetime.now().strftime("%d/%m/%Y")

    # Front page — identico al vecchio sistema (stesse classi CSS)
    frontespizio = f"""
    <div class="front-page">
        <img src="file://{LOGO_PATH}" class="front-logo">
        <div class="front-title">CARTA VINI</div>
        <div class="front-subtitle">Aggiornata al {data_oggi}</div>
    </div>
    """

    toc_html = build_carta_toc_html(rows)
    body_html = build_carta_body_html(rows)
    carta = f"<div class='carta-body'>{body_html}</div>"

    full_html = f"""
    <html>
    <head>
        <meta charset='utf-8'>
        <link rel='stylesheet' href='/static/css/carta_pdf.css'>
    </head>
    <body>
        {frontespizio}
        {toc_html}
        {carta}
    </body>
    </html>
    """

    out_path = STATIC_DIR / "carta_vini_cantina.pdf"

    HTML(string=full_html, base_url=str(BASE_DIR)).write_pdf(
        str(out_path),
        stylesheets=[CSS(filename=str(CSS_PDF))],
    )

    return FileResponse(
        str(out_path),
        filename=f"carta_vini_cantina_{datetime.now().strftime('%Y%m%d')}.pdf",
        media_type="application/pdf",
    )


# =============================================================
# 6. CARTA DA CANTINA — DOCX
# =============================================================
@router.get("/carta-cantina/docx", summary="Carta vini Word da DB cantina")
def carta_cantina_docx(
    current_user: Any = Depends(_get_user_from_query_token),
):
    """
    Genera il DOCX della carta vini dal DB cantina.
    """
    rows = _load_vini_cantina_ordinati()

    doc = Document()

    # Logo
    if LOGO_PATH.exists():
        doc.add_picture(str(LOGO_PATH), width=Inches(1.8))

    doc.add_heading("OSTERIA TRE GOBBI — CARTA DEI VINI", level=0)
    doc.add_paragraph(
        f"(da Cantina — {datetime.now().strftime('%d/%m/%Y')})"
    )

    # Raggruppamento
    def k_tip(r): return r["TIPOLOGIA"] or "Senza tipologia"
    def k_reg(r): return resolve_regione(r)
    def k_prod(r): return r["PRODUTTORE"] or "Produttore sconosciuto"

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        doc.add_heading(tip, level=1)

        for reg, g2 in groupby(g1, k_reg):
            g2 = list(g2)
            doc.add_heading(reg, level=2)

            for prod, g3 in groupby(g2, k_prod):
                g3 = list(g3)
                doc.add_heading(prod, level=3)

                for r in g3:
                    desc = r["DESCRIZIONE"] or ""
                    annata = r["ANNATA"] or ""
                    prezzo = r["PREZZO"]
                    if prezzo not in (None, ""):
                        try:
                            prezzo = f"€ {float(prezzo):.2f}".replace(".", ",")
                        except Exception:
                            prezzo = str(prezzo)
                    else:
                        prezzo = ""

                    line = f"{desc}"
                    if annata:
                        line += f" — {annata}"
                    if prezzo:
                        line += f" — {prezzo}"
                    doc.add_paragraph(line)

    out_path = STATIC_DIR / "carta_vini_cantina.docx"
    doc.save(str(out_path))

    return FileResponse(
        str(out_path),
        filename=f"carta_vini_cantina_{datetime.now().strftime('%Y%m%d')}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


# =============================================================
# 7. INVENTARIO PDF — TUTTI I VINI
# =============================================================
def _load_all_vini_inventario(solo_giacenza: bool = False) -> List[Dict[str, Any]]:
    """
    Carica tutti i vini dal DB cantina per report inventario.
    Se solo_giacenza=True, filtra solo quelli con QTA_TOTALE > 0.
    """
    conn = mag_db.get_magazzino_connection()
    cur = conn.cursor()
    where = "WHERE QTA_TOTALE > 0" if solo_giacenza else ""
    rows = cur.execute(f"""
        SELECT
            id, TIPOLOGIA, NAZIONE, REGIONE, CODICE,
            DESCRIZIONE, DENOMINAZIONE, PRODUTTORE,
            ANNATA, FORMATO,
            PREZZO_CARTA, EURO_LISTINO,
            FRIGORIFERO, QTA_FRIGO,
            LOCAZIONE_1, QTA_LOC1,
            LOCAZIONE_2, QTA_LOC2,
            LOCAZIONE_3, QTA_LOC3,
            QTA_TOTALE,
            CARTA, STATO_VENDITA, STATO_RIORDINO,
            DISCONTINUATO
        FROM vini_magazzino
        {where}
        ORDER BY TIPOLOGIA, NAZIONE, REGIONE, PRODUTTORE, DESCRIZIONE, ANNATA
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _inventario_css() -> str:
    """CSS inline per i report inventario."""
    return """
    @page {
        size: A4 landscape;
        margin: 12mm 10mm 12mm 10mm;
        @bottom-center {
            content: "Pagina " counter(page) " di " counter(pages);
            font-size: 8px;
            color: #666;
        }
    }
    body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 9px;
        color: #222;
        margin: 0;
        padding: 0;
    }
    .header {
        text-align: center;
        margin-bottom: 10px;
        border-bottom: 2px solid #6B2D5B;
        padding-bottom: 8px;
    }
    .header h1 {
        font-size: 18px;
        color: #6B2D5B;
        margin: 0 0 4px 0;
    }
    .header .subtitle {
        font-size: 10px;
        color: #666;
    }
    .section-title {
        font-size: 13px;
        font-weight: bold;
        color: #6B2D5B;
        margin: 14px 0 6px 0;
        padding: 3px 6px;
        background: #f3e8f0;
        border-left: 3px solid #6B2D5B;
        page-break-after: avoid;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 8px;
        page-break-inside: auto;
    }
    tr { page-break-inside: avoid; }
    th {
        background: #6B2D5B;
        color: white;
        font-weight: bold;
        padding: 4px 5px;
        text-align: left;
        font-size: 8px;
        text-transform: uppercase;
    }
    td {
        padding: 3px 5px;
        border-bottom: 1px solid #ddd;
        vertical-align: top;
    }
    tr:nth-child(even) td { background: #faf7fa; }
    .num { text-align: right; }
    .qta-zero { color: #bbb; }
    .qta-pos { color: #1a7d1a; font-weight: bold; }
    .totale-row {
        font-weight: bold;
        background: #f3e8f0 !important;
        border-top: 2px solid #6B2D5B;
    }
    .totale-row td { background: #f3e8f0 !important; padding: 5px; }
    .loc-header {
        font-size: 14px;
        font-weight: bold;
        color: #fff;
        background: #6B2D5B;
        margin: 16px 0 6px 0;
        padding: 6px 10px;
        border-radius: 4px;
        page-break-after: avoid;
    }
    .summary-box {
        display: inline-block;
        background: #f3e8f0;
        border: 1px solid #d4b8cc;
        border-radius: 6px;
        padding: 6px 14px;
        margin: 2px 6px;
        text-align: center;
    }
    .summary-box .label { font-size: 8px; color: #666; }
    .summary-box .value { font-size: 14px; font-weight: bold; color: #6B2D5B; }
    .summary-row { text-align: center; margin: 10px 0 14px 0; }
    """


def _fmt_qta(q: int) -> str:
    """Formatta quantita con classe CSS."""
    if q == 0:
        return '<span class="qta-zero">0</span>'
    return f'<span class="qta-pos">{q}</span>'


def _build_inventario_table(vini: List[Dict], show_locations: bool = True) -> str:
    """Costruisce tabella HTML per inventario."""
    loc_cols = ""
    if show_locations:
        loc_cols = """
            <th>Frigo</th><th class="num">Qta</th>
            <th>Loc. 1</th><th class="num">Qta</th>
            <th>Loc. 2</th><th class="num">Qta</th>
            <th>Loc. 3</th><th class="num">Qta</th>
        """

    html = f"""
    <table>
        <thead><tr>
            <th>Tipologia</th>
            <th>Nazione</th>
            <th>Regione</th>
            <th>Produttore</th>
            <th>Descrizione</th>
            <th>Annata</th>
            <th>Formato</th>
            <th class="num">Prezzo</th>
            {loc_cols}
            <th class="num">Totale</th>
        </tr></thead>
        <tbody>
    """

    tot_bottiglie = 0
    for v in vini:
        qta = v.get("QTA_TOTALE") or 0
        tot_bottiglie += qta
        prezzo = v.get("PREZZO_CARTA")
        prezzo_str = f"&euro; {float(prezzo):.2f}" if prezzo else ""

        loc_tds = ""
        if show_locations:
            loc_tds = f"""
                <td>{v.get('FRIGORIFERO') or ''}</td>
                <td class="num">{_fmt_qta(v.get('QTA_FRIGO') or 0)}</td>
                <td>{v.get('LOCAZIONE_1') or ''}</td>
                <td class="num">{_fmt_qta(v.get('QTA_LOC1') or 0)}</td>
                <td>{v.get('LOCAZIONE_2') or ''}</td>
                <td class="num">{_fmt_qta(v.get('QTA_LOC2') or 0)}</td>
                <td>{v.get('LOCAZIONE_3') or ''}</td>
                <td class="num">{_fmt_qta(v.get('QTA_LOC3') or 0)}</td>
            """

        html += f"""
        <tr>
            <td>{v.get('TIPOLOGIA') or ''}</td>
            <td>{v.get('NAZIONE') or ''}</td>
            <td>{v.get('REGIONE') or ''}</td>
            <td>{v.get('PRODUTTORE') or ''}</td>
            <td>{v.get('DESCRIZIONE') or ''}</td>
            <td>{v.get('ANNATA') or ''}</td>
            <td>{v.get('FORMATO') or ''}</td>
            <td class="num">{prezzo_str}</td>
            {loc_tds}
            <td class="num">{_fmt_qta(qta)}</td>
        </tr>
        """

    colspan = 12 + (8 if show_locations else 0)
    html += f"""
        <tr class="totale-row">
            <td colspan="{colspan - 1}">TOTALE: {len(vini)} vini</td>
            <td class="num">{tot_bottiglie}</td>
        </tr>
        </tbody>
    </table>
    """
    return html


@router.get("/inventario/pdf", summary="PDF inventario completo")
def inventario_pdf(
    current_user: Any = Depends(_get_user_from_query_token),
):
    """
    Genera PDF con tutti i vini in cantina — inventario completo.
    """
    vini = _load_all_vini_inventario(solo_giacenza=False)
    data_oggi = datetime.now().strftime("%d/%m/%Y %H:%M")
    tot_bott = sum(v.get("QTA_TOTALE") or 0 for v in vini)
    tot_con_giacenza = sum(1 for v in vini if (v.get("QTA_TOTALE") or 0) > 0)

    table_html = _build_inventario_table(vini, show_locations=True)

    full_html = f"""
    <html><head><meta charset="utf-8">
    <style>{_inventario_css()}</style>
    </head><body>
        <div class="header">
            <h1>INVENTARIO CANTINA &mdash; TUTTI I VINI</h1>
            <div class="subtitle">Osteria Tre Gobbi &mdash; Generato il {data_oggi}</div>
        </div>
        <div class="summary-row">
            <div class="summary-box">
                <div class="label">Referenze</div>
                <div class="value">{len(vini)}</div>
            </div>
            <div class="summary-box">
                <div class="label">Con giacenza</div>
                <div class="value">{tot_con_giacenza}</div>
            </div>
            <div class="summary-box">
                <div class="label">Bottiglie totali</div>
                <div class="value">{tot_bott}</div>
            </div>
        </div>
        {table_html}
    </body></html>
    """

    out_path = STATIC_DIR / "inventario_completo.pdf"
    HTML(string=full_html).write_pdf(
        str(out_path),
        stylesheets=[CSS(string=_inventario_css())],
    )

    return FileResponse(
        str(out_path),
        filename=f"inventario_completo_{datetime.now().strftime('%Y%m%d')}.pdf",
        media_type="application/pdf",
    )


# =============================================================
# 8. INVENTARIO PDF — SOLO CON GIACENZA
# =============================================================
@router.get("/inventario/giacenza/pdf", summary="PDF inventario con giacenza")
def inventario_giacenza_pdf(
    current_user: Any = Depends(_get_user_from_query_token),
):
    """
    Genera PDF con solo i vini che hanno giacenza > 0.
    """
    vini = _load_all_vini_inventario(solo_giacenza=True)
    data_oggi = datetime.now().strftime("%d/%m/%Y %H:%M")
    tot_bott = sum(v.get("QTA_TOTALE") or 0 for v in vini)

    table_html = _build_inventario_table(vini, show_locations=True)

    full_html = f"""
    <html><head><meta charset="utf-8">
    <style>{_inventario_css()}</style>
    </head><body>
        <div class="header">
            <h1>INVENTARIO CANTINA &mdash; VINI CON GIACENZA</h1>
            <div class="subtitle">Osteria Tre Gobbi &mdash; Generato il {data_oggi}</div>
        </div>
        <div class="summary-row">
            <div class="summary-box">
                <div class="label">Referenze con giacenza</div>
                <div class="value">{len(vini)}</div>
            </div>
            <div class="summary-box">
                <div class="label">Bottiglie totali</div>
                <div class="value">{tot_bott}</div>
            </div>
        </div>
        {table_html}
    </body></html>
    """

    out_path = STATIC_DIR / "inventario_giacenza.pdf"
    HTML(string=full_html).write_pdf(
        str(out_path),
        stylesheets=[CSS(string=_inventario_css())],
    )

    return FileResponse(
        str(out_path),
        filename=f"inventario_giacenza_{datetime.now().strftime('%Y%m%d')}.pdf",
        media_type="application/pdf",
    )


# =============================================================
# 9. INVENTARIO PDF — PER LOCAZIONE
# =============================================================
@router.get("/inventario/locazioni/pdf", summary="PDF inventario per locazione")
def inventario_locazioni_pdf(
    current_user: Any = Depends(_get_user_from_query_token),
):
    """
    Genera PDF con vini raggruppati e separati per locazione fisica.
    Ogni locazione ha la sua sezione con i vini presenti li.
    """
    vini = _load_all_vini_inventario(solo_giacenza=True)
    data_oggi = datetime.now().strftime("%d/%m/%Y %H:%M")

    # Raggruppa per locazione
    locazioni: Dict[str, List[Dict]] = {}

    for v in vini:
        # Frigorifero
        qta_f = v.get("QTA_FRIGO") or 0
        if qta_f > 0:
            loc_name = v.get("FRIGORIFERO") or "Frigorifero"
            loc_key = f"FRIGO:{loc_name}"
            locazioni.setdefault(loc_key, []).append({**v, "_qta_loc": qta_f})

        # Locazione 1
        qta_1 = v.get("QTA_LOC1") or 0
        if qta_1 > 0:
            loc_name = v.get("LOCAZIONE_1") or "Locazione 1"
            loc_key = f"LOC1:{loc_name}"
            locazioni.setdefault(loc_key, []).append({**v, "_qta_loc": qta_1})

        # Locazione 2
        qta_2 = v.get("QTA_LOC2") or 0
        if qta_2 > 0:
            loc_name = v.get("LOCAZIONE_2") or "Locazione 2"
            loc_key = f"LOC2:{loc_name}"
            locazioni.setdefault(loc_key, []).append({**v, "_qta_loc": qta_2})

        # Locazione 3
        qta_3 = v.get("QTA_LOC3") or 0
        if qta_3 > 0:
            loc_name = v.get("LOCAZIONE_3") or "Locazione 3"
            loc_key = f"LOC3:{loc_name}"
            locazioni.setdefault(loc_key, []).append({**v, "_qta_loc": qta_3})

    # Costruisci HTML per ogni locazione
    sections_html = ""
    grand_total = 0

    for loc_key in sorted(locazioni.keys()):
        loc_vini = locazioni[loc_key]
        loc_label = loc_key.split(":", 1)[1] if ":" in loc_key else loc_key
        tot_loc = sum(v["_qta_loc"] for v in loc_vini)
        grand_total += tot_loc

        sections_html += f'<div class="loc-header">{loc_label} &mdash; {len(loc_vini)} vini, {tot_loc} bottiglie</div>'
        sections_html += """
        <table>
            <thead><tr>
                <th>Tipologia</th>
                <th>Produttore</th>
                <th>Descrizione</th>
                <th>Annata</th>
                <th>Formato</th>
                <th class="num">Prezzo</th>
                <th class="num">Qta in loc.</th>
                <th class="num">Qta totale</th>
            </tr></thead>
            <tbody>
        """

        for v in loc_vini:
            prezzo = v.get("PREZZO_CARTA")
            prezzo_str = f"&euro; {float(prezzo):.2f}" if prezzo else ""
            sections_html += f"""
            <tr>
                <td>{v.get('TIPOLOGIA') or ''}</td>
                <td>{v.get('PRODUTTORE') or ''}</td>
                <td>{v.get('DESCRIZIONE') or ''}</td>
                <td>{v.get('ANNATA') or ''}</td>
                <td>{v.get('FORMATO') or ''}</td>
                <td class="num">{prezzo_str}</td>
                <td class="num">{_fmt_qta(v['_qta_loc'])}</td>
                <td class="num">{_fmt_qta(v.get('QTA_TOTALE') or 0)}</td>
            </tr>
            """

        sections_html += f"""
            <tr class="totale-row">
                <td colspan="6">Totale {loc_label}</td>
                <td class="num">{tot_loc}</td>
                <td></td>
            </tr>
            </tbody>
        </table>
        """

    tot_bott = sum(v.get("QTA_TOTALE") or 0 for v in vini)

    full_html = f"""
    <html><head><meta charset="utf-8">
    <style>{_inventario_css()}</style>
    </head><body>
        <div class="header">
            <h1>INVENTARIO CANTINA &mdash; PER LOCAZIONE</h1>
            <div class="subtitle">Osteria Tre Gobbi &mdash; Generato il {data_oggi}</div>
        </div>
        <div class="summary-row">
            <div class="summary-box">
                <div class="label">Locazioni</div>
                <div class="value">{len(locazioni)}</div>
            </div>
            <div class="summary-box">
                <div class="label">Referenze con giacenza</div>
                <div class="value">{len(vini)}</div>
            </div>
            <div class="summary-box">
                <div class="label">Bottiglie totali</div>
                <div class="value">{tot_bott}</div>
            </div>
        </div>
        {sections_html}
    </body></html>
    """

    out_path = STATIC_DIR / "inventario_locazioni.pdf"
    HTML(string=full_html).write_pdf(
        str(out_path),
        stylesheets=[CSS(string=_inventario_css())],
    )

    return FileResponse(
        str(out_path),
        filename=f"inventario_locazioni_{datetime.now().strftime('%Y%m%d')}.pdf",
        media_type="application/pdf",
    )
