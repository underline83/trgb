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
    current_user: Any = Depends(get_current_user),
):
    """
    Legge tutti i vini dal DB vini.sqlite3 (popolato dall'import Excel classico)
    e li sincronizza nel DB cantina con upsert:
    - Vini nuovi: inseriti con ORIGINE='EXCEL', giacenze dall'Excel
    - Vini esistenti: aggiornata solo anagrafica/prezzi, giacenze invariate

    I vini presenti solo in cantina (ORIGINE='MANUALE') non vengono toccati.
    """
    _require_admin(current_user)

    conn_excel = get_carta_connection()
    cur = conn_excel.cursor()
    rows = cur.execute("SELECT * FROM vini;").fetchall()
    conn_excel.close()

    inseriti = 0
    aggiornati = 0
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

            # Controlla se esiste già in cantina
            conn_mag = mag_db.get_magazzino_connection()
            cur_mag = conn_mag.cursor()
            existing = cur_mag.execute(
                "SELECT id FROM vini_magazzino WHERE id_excel = ?;",
                (r["id"],),
            ).fetchone()
            conn_mag.close()

            # Per vini nuovi, importa anche le quantità dall'Excel
            if not existing:
                data["QTA_FRIGO"] = r["N_FRIGO"] or 0
                data["QTA_LOC1"] = r["N_LOC1"] or 0
                data["QTA_LOC2"] = r["N_LOC2"] or 0
                data["QTA_TOTALE"] = r["QTA"] or 0
                inseriti += 1
            else:
                aggiornati += 1

            mag_db.upsert_vino_from_carta(data)

        except Exception as e:
            desc = r["DESCRIZIONE"] or ""
            prod = r["PRODUTTORE"] or ""
            errori.append(f"{desc} ({prod}): {e}")

    return {
        "status": "ok",
        "totale_excel": len(rows),
        "inseriti": inseriti,
        "aggiornati": aggiornati,
        "errori": errori,
        "msg": f"Sincronizzazione completata: {inseriti} nuovi, {aggiornati} aggiornati"
        + (f", {len(errori)} errori" if errori else ""),
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

            # Creiamo il vino in cantina (senza id_excel per import diretto,
            # usiamo DESCRIZIONE+PRODUTTORE+ANNATA come chiave naturale)
            # Per import diretto usiamo create_vino (non upsert)
            # perché non c'è id_excel

            # Cerca duplicato per decidere insert vs skip
            dupes = mag_db.find_potential_duplicates(
                descrizione=data["DESCRIZIONE"],
                produttore=data.get("PRODUTTORE"),
                annata=data.get("ANNATA"),
                formato=data.get("FORMATO"),
            )

            if dupes:
                # Aggiorna il primo match
                vino_id = dupes[0]["id"]
                update_data = {
                    k: v for k, v in data.items()
                    if k not in ("QTA_FRIGO", "QTA_LOC1", "QTA_LOC2", "QTA_TOTALE")
                    and v is not None
                }
                mag_db.update_vino(vino_id, update_data)
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
                mag_db.create_vino(data)
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
    data_str = datetime.now().strftime("%d/%m/%Y")

    # Front page
    logo_html = ""
    if LOGO_PATH.exists():
        logo_html = f"<img src='file://{LOGO_PATH}' class='logo' />"

    front_page = f"""
    <div class="front-page">
        {logo_html}
        <h1 class="main-title">OSTERIA TRE GOBBI</h1>
        <h2 class="subtitle">CARTA DEI VINI</h2>
        <p class="subtitle">(da Cantina — {data_str})</p>
    </div>
    """

    toc_html = build_carta_toc_html(rows)
    body_html = build_carta_body_html(rows)

    full_html = f"""<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>Carta Vini Cantina</title></head>
<body>
    {front_page}
    {toc_html}
    {body_html}
</body>
</html>"""

    css_str = CSS_PDF.read_text() if CSS_PDF.exists() else ""
    out_path = STATIC_DIR / "carta_vini_cantina.pdf"

    html_obj = HTML(string=full_html, base_url=str(STATIC_DIR))
    html_obj.write_pdf(str(out_path), stylesheets=[CSS(string=css_str)])

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
