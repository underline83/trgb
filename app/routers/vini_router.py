# @version: v2.04-beta
# -*- coding: utf-8 -*-
"""
Router Vini — HTML + PDF + DOCX
Linea 2.x = motore carta avanzato (impaginazione + indice)

Changelog v2.04:
 - ADD: endpoint /vini/carta/pdf-staff (PDF staff)
        (per ora stesso contenuto del PDF standard, con label STAFF)
 - KEEP: /vini/carta/pdf invariato per il cliente
 - KEEP: HTML preview identica alla linea 1.3x
"""

from __future__ import annotations
from itertools import groupby
from pathlib import Path
from datetime import datetime
import unicodedata
import re

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
import pandas as pd
import tempfile

from weasyprint import HTML, CSS
from docx import Document
from docx.shared import Inches

from app.services.carta_vini_service import (
    build_carta_body_html,
    build_carta_body_html_htmlsafe,
    build_carta_toc_html,
)

from app.models.vini_db import get_connection, init_database
from app.models.vini_model import clear_vini_table, normalize_dataframe, insert_vini_rows
from app.repositories.vini_repository import load_vini_ordinati

router = APIRouter(prefix="/vini", tags=["Vini"])

print(">>>>> LOADING VINI_ROUTER v2.04   PATH:", __file__)

# PATH DI BASE
BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
CSS_HTML = STATIC_DIR / "css" / "carta_html.css"
CSS_PDF = STATIC_DIR / "css" / "carta_pdf.css"
LOGO_PATH = STATIC_DIR / "img" / "logo_tregobbi.png"


# ------------------------------------------------------------
# UTILS
# ------------------------------------------------------------

def slugify(value: str) -> str:
    """Crea un id CSS/HTML semplice per tipologie e regioni."""
    if not value:
        return "x"
    value_norm = unicodedata.normalize("NFKD", value)
    value_ascii = value_norm.encode("ascii", "ignore").decode("ascii")
    value_ascii = re.sub(r"[^a-zA-Z0-9]+", "-", value_ascii).strip("-").lower()
    return value_ascii or "x"


def resolve_regione(r):
    """Regola base: Regione → Nazione → Varie."""
    if r["REGIONE"]:
        return r["REGIONE"]
    if r["NAZIONE"]:
        return r["NAZIONE"]
    return "Varie"


# ------------------------------------------------------------
# UPLOAD
# ------------------------------------------------------------
@router.post("/upload")
async def upload_vini(
    file: UploadFile = File(...),
    format: str = Query("json", enum=["json", "html"])
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        xls = pd.ExcelFile(tmp_path)
        if "VINI" not in xls.sheet_names:
            raise HTTPException(400, "Foglio 'VINI' non trovato.")
        raw = pd.read_excel(xls, sheet_name="VINI")
    except Exception as e:
        raise HTTPException(400, f"Errore nel file Excel: {e}")

    raw = raw.fillna("")
    raw = raw[raw.apply(lambda r: any(str(x).strip() for x in r), axis=1)]
    tot = len(raw)

    df = normalize_dataframe(raw)

    conn = get_connection()
    init_database()
    clear_vini_table(conn)
    inserite, errori, count = insert_vini_rows(conn, df)
    conn.close()

    if format == "html":
        max_val = max(count.values()) if count else 1
        html = "<html><body><h2>Risultato Import</h2>"
        html += f"<p>Totali: {tot} — Inserite: {inserite}</p><table border='1' cellpadding='6'>"
        for t, c in sorted(count.items(), key=lambda x: (-x[1], x[0])):
            width = int((c / max_val) * 100)
            html += (
                f"<tr><td>{t}</td><td>{c}</td>"
                f"<td><div style='background:#90c490;height:14px;width:{width}%'></div></td></tr>"
            )
        html += "</table></body></html>"
        return HTMLResponse(html)

    return {
        "righe_totali": tot,
        "inserite": inserite,
        "errori": errori[:100]
    }


# ------------------------------------------------------------
# HTML PREVIEW
# ------------------------------------------------------------
@router.get("/carta", response_class=HTMLResponse)
def genera_carta_vini_html():
    rows = list(load_vini_ordinati())
    body = build_carta_body_html_htmlsafe(rows)

    html = f"""
    <html>
    <head>
        <meta charset='utf-8'>
        <link rel='stylesheet' href='/static/css/carta_html.css'>
    </head>
    <body>
        <h1 class='title'>OSTERIA TRE GOBBI — CARTA DEI VINI</h1>
        {body}
    </body>
    </html>
    """

    return HTMLResponse(html)


# ------------------------------------------------------------
# PDF CLIENTE
# ------------------------------------------------------------
@router.get("/carta/pdf")
def genera_carta_vini_pdf():

    data_oggi = datetime.now().strftime("%d/%m/%Y")
    rows = list(load_vini_ordinati())

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

    html = f"""
    <html>
    <head><meta charset='utf-8'>
        <link rel='stylesheet' href='/static/css/carta_pdf.css'>
    </head>
    <body>
        {frontespizio}
        {toc_html}
        {carta}
    </body>
    </html>
    """

    out = STATIC_DIR / "carta_vini.pdf"

    HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        str(out),
        stylesheets=[CSS(filename=str(CSS_PDF))]
    )

    return FileResponse(out, filename="carta_vini.pdf")


# ------------------------------------------------------------
# PDF STAFF
# ------------------------------------------------------------
@router.get("/carta/pdf-staff")
def genera_carta_vini_pdf_staff():
    """
    Versione STAFF.
    Per ora identica al PDF cliente, ma con label 'VERSIONE STAFF' nel frontespizio.
    TODO (quando mi dirai le regole): togliere/modificare prezzi, aggiungere info interne, ecc.
    """

    data_oggi = datetime.now().strftime("%d/%m/%Y")
    rows = list(load_vini_ordinati())

    frontespizio = f"""
    <div class="front-page">
        <img src="file://{LOGO_PATH}" class="front-logo">
        <div class="front-title">CARTA VINI — STAFF</div>
        <div class="front-subtitle">VERSIONE INTERNA</div>
        <div class="front-date">Aggiornata al {data_oggi}</div>
    </div>
    """

    toc_html = build_carta_toc_html(rows)
    body_html = build_carta_body_html(rows)
    carta = f"<div class='carta-body'>{body_html}</div>"

    html = f"""
    <html>
    <head><meta charset='utf-8'>
        <link rel='stylesheet' href='/static/css/carta_pdf.css'>
    </head>
    <body>
        {frontespizio}
        {toc_html}
        {carta}
    </body>
    </html>
    """

    out = STATIC_DIR / "carta_vini_staff.pdf"

    HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        str(out),
        stylesheets=[CSS(filename=str(CSS_PDF))]
    )

    return FileResponse(out, filename="carta_vini_staff.pdf")


# ------------------------------------------------------------
# DOCX (semplice)
# ------------------------------------------------------------
@router.get("/carta/docx")
def genera_carta_vini_docx():
    rows = list(load_vini_ordinati())
    doc = Document()

    if LOGO_PATH.exists():
        doc.add_picture(str(LOGO_PATH), width=Inches(1.8))

    doc.add_heading("CARTA DEI VINI — OSTERIA TRE GOBBI", level=1)

    def k_tip(r): return r["TIPOLOGIA"] or "Senza tipologia"
    def k_reg(r): return resolve_regione(r)
    def k_prod(r): return r["PRODUTTORE"] or "Produttore sconosciuto"

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        doc.add_heading(tip, level=2)

        for reg, g2 in groupby(g1, k_reg):
            g2 = list(g2)
            doc.add_heading(reg, level=3)

            for prod, g3 in groupby(g2, k_prod):
                g3 = list(g3)
                p = doc.add_paragraph()
                r = p.add_run(prod)
                r.bold = True

                for riga in g3:
                    desc = riga["DESCRIZIONE"] or ""
                    annata = riga["ANNATA"] or ""
                    prezzo = riga["PREZZO"]
                    if prezzo:
                        try:
                            prezzo = f"€ {float(prezzo):.2f}"
                        except Exception:
                            pass

                    line = "    " + desc
                    if annata:
                        line += f" — {annata}"
                    if prezzo:
                        line += f" — {prezzo}"

                    doc.add_paragraph(line)

    out = STATIC_DIR / "carta_vini.docx"
    doc.save(str(out))

    return FileResponse(out, filename="carta_vini.docx")