#!/usr/bin/env python3
# @version: v1.0-pranzo-pdf
# -*- coding: utf-8 -*-
"""
TRGB — Service PDF Menu Pranzo (sessione 58, 2026-04-26)

Genera il PDF "del giorno" con brand cliente Osteria Tre Gobbi
(NON brand TRGB-02 software). Layout coerente con carta vini cliente:
font Cormorant Garamond, sfondo bianco, logo logo_tregobbi.png.

CSS: static/css/menu_pranzo_pdf.css
Logo: static/img/logo_tregobbi.png

Il chiamante (router) passa dict `menu` (con `righe`) e `settings`.
"""
from __future__ import annotations

from datetime import date as date_cls, datetime
from html import escape
from pathlib import Path
from typing import Any, Dict, List, Optional

# WeasyPrint lazy import: il modulo si carica anche senza Cairo/Pango installato.
# In produzione e' presente.

BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
CSS_PDF = STATIC_DIR / "css" / "menu_pranzo_pdf.css"


# ─────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────
GIORNI_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
MESI_IT = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
]

# Ordine di stampa (lista flat per cliente, ordinata per categoria)
ORDINE_CATEGORIA = {
    "antipasto": 1, "primo": 2, "secondo": 3,
    "contorno": 4, "dolce": 5, "altro": 6,
}


def _format_data_estesa(s: str) -> str:
    """'2026-04-26' -> 'Domenica 26 aprile 2026'"""
    try:
        d = date_cls.fromisoformat(s)
    except Exception:
        return s
    return f"{GIORNI_IT[d.weekday()]} {d.day} {MESI_IT[d.month - 1]} {d.year}"


def _format_prezzo(p: Optional[float]) -> str:
    if p is None:
        return ""
    if float(p).is_integer():
        return f"{int(p)}€"
    return f"{p:.2f}€".replace(".", ",")


# ─────────────────────────────────────────────────────────────
# HTML BUILDERS
# ─────────────────────────────────────────────────────────────
def _build_piatti_html(righe: List[Dict[str, Any]]) -> str:
    if not righe:
        return '<ul class="menu-piatti"><li class="piatto-vuoto">Nessun piatto inserito</li></ul>'

    sorted_righe = sorted(
        righe,
        key=lambda r: (
            ORDINE_CATEGORIA.get((r.get("categoria") or "altro"), 99),
            int(r.get("ordine") or 0),
        ),
    )
    items = []
    for r in sorted_righe:
        nome = (r.get("nome") or "").strip()
        if not nome:
            continue
        items.append(f"<li>{escape(nome)}</li>")
    if not items:
        return '<ul class="menu-piatti"><li class="piatto-vuoto">Nessun piatto inserito</li></ul>'
    return '<ul class="menu-piatti">' + "".join(items) + "</ul>"


def _build_business_box_html(menu: Dict[str, Any], settings: Dict[str, Any]) -> str:
    titolo_business = settings.get("titolo_business") or "Menù Business"
    p1 = menu.get("prezzo_1") or settings.get("prezzo_1_default")
    p2 = menu.get("prezzo_2") or settings.get("prezzo_2_default")
    p3 = menu.get("prezzo_3") or settings.get("prezzo_3_default")

    return f"""
    <div class="menu-business">
        <div class="business-titolo">{escape(titolo_business)}</div>
        <div class="business-row"><span class="lbl">Una portata a scelta</span>   <span class="prz">{_format_prezzo(p1)}*</span></div>
        <div class="business-row"><span class="lbl">Due portate a scelta</span>   <span class="prz">{_format_prezzo(p2)}*</span></div>
        <div class="business-row"><span class="lbl">Tre portate a scelta</span>   <span class="prz">{_format_prezzo(p3)}*</span></div>
    </div>
    """


def _build_html(menu: Dict[str, Any], settings: Dict[str, Any]) -> str:
    titolo = (menu.get("titolo") or settings.get("titolo_default") or "OGGI A PRANZO: LA CUCINA DEL MERCATO").strip()
    sottotitolo = (
        menu.get("sottotitolo")
        or settings.get("sottotitolo_default")
        or "Piatti in base agli acquisti del giorno, soggetti a disponibilità."
    ).strip()
    footer = (menu.get("footer_note") or settings.get("footer_default") or "").strip()
    data_str = _format_data_estesa(menu["data"])
    piatti_html = _build_piatti_html(menu.get("righe") or [])
    business_html = _build_business_box_html(menu, settings)

    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <link rel="stylesheet" href="/static/css/menu_pranzo_pdf.css">
    </head>
    <body>
        <div class="menu-page">
            <div class="menu-header">
                <div class="data">{escape(data_str)}</div>
            </div>

            <div class="menu-titolo">{escape(titolo)}</div>
            <div class="menu-sottotitolo">{escape(sottotitolo)}</div>

            <div class="menu-divider"></div>

            {piatti_html}

            <div class="menu-divider"></div>

            {business_html}

            <div class="menu-footer">{escape(footer)}</div>
        </div>
    </body>
    </html>
    """
    return html


# ─────────────────────────────────────────────────────────────
# API PUBBLICA
# ─────────────────────────────────────────────────────────────
def genera_pdf_menu_pranzo(menu: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """
    Ritorna i bytes del PDF.
    `menu`:    dict con almeno data, titolo, sottotitolo, prezzi, footer_note, righe[]
    `settings`: dict da pranzo_settings (riga unica id=1)
    """
    from weasyprint import HTML, CSS  # lazy

    html = _build_html(menu, settings)
    pdf_bytes = HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        stylesheets=[CSS(filename=str(CSS_PDF))],
    )
    return pdf_bytes


def genera_html_menu_pranzo(menu: Dict[str, Any], settings: Dict[str, Any]) -> str:
    """
    Ritorna l'HTML usato dal PDF, comodo per anteprima / debug.
    """
    return _build_html(menu, settings)
