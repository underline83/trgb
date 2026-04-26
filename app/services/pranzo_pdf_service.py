#!/usr/bin/env python3
# @version: v2.0-pranzo-pdf-settimanale
# -*- coding: utf-8 -*-
"""
TRGB — Service PDF Menu Pranzo settimanale (sessione 58 cont., 2026-04-26)

PDF brand cliente Osteria Tre Gobbi.
Layout coerente con carta vini cliente (Cormorant Garamond, sfondo bianco).
v2.0: settimanale (testata "Settimana del DD - DD MMMM YYYY"), niente logo,
pagina singola A4, testata/prezzi/footer presi sempre da `pranzo_settings`.
"""
from __future__ import annotations

from datetime import date as date_cls, timedelta
from html import escape
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
CSS_PDF = STATIC_DIR / "css" / "menu_pranzo_pdf.css"


# ─────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────
MESI_IT = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
]

ORDINE_CATEGORIA = {
    "antipasto": 1, "primo": 2, "secondo": 3,
    "contorno": 4, "dolce": 5, "altro": 6,
}


def _format_settimana(monday_iso: str) -> str:
    """
    'YYYY-MM-DD' (lunedi) -> 'Settimana del 27 aprile - 1 maggio 2026' (lun-ven).
    """
    try:
        lun = date_cls.fromisoformat(monday_iso)
    except Exception:
        return f"Settimana del {monday_iso}"
    ven = lun + timedelta(days=4)
    if lun.month == ven.month:
        intervallo = f"{lun.day} - {ven.day} {MESI_IT[lun.month - 1]} {lun.year}"
    elif lun.year == ven.year:
        intervallo = f"{lun.day} {MESI_IT[lun.month - 1]} - {ven.day} {MESI_IT[ven.month - 1]} {lun.year}"
    else:
        intervallo = (
            f"{lun.day} {MESI_IT[lun.month - 1]} {lun.year} - "
            f"{ven.day} {MESI_IT[ven.month - 1]} {ven.year}"
        )
    return f"Settimana del {intervallo}"


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
        return '<ul class="menu-piatti"><li class="piatto-vuoto">Nessun piatto programmato</li></ul>'

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
        return '<ul class="menu-piatti"><li class="piatto-vuoto">Nessun piatto programmato</li></ul>'
    return '<ul class="menu-piatti">' + "".join(items) + "</ul>"


def _build_business_box_html(settings: Dict[str, Any]) -> str:
    titolo_business = settings.get("titolo_business") or "Menù Business"
    p1 = settings.get("prezzo_1_default")
    p2 = settings.get("prezzo_2_default")
    p3 = settings.get("prezzo_3_default")

    return f"""
    <div class="menu-business">
        <div class="business-titolo">{escape(titolo_business)}</div>
        <div class="business-row"><span class="lbl">Una portata a scelta</span>   <span class="prz">{_format_prezzo(p1)}*</span></div>
        <div class="business-row"><span class="lbl">Due portate a scelta</span>   <span class="prz">{_format_prezzo(p2)}*</span></div>
        <div class="business-row"><span class="lbl">Tre portate a scelta</span>   <span class="prz">{_format_prezzo(p3)}*</span></div>
    </div>
    """


def _build_html(menu: Dict[str, Any], settings: Dict[str, Any]) -> str:
    titolo = (settings.get("titolo_default") or "OGGI A PRANZO: LA CUCINA DEL MERCATO").strip()
    sottotitolo = (settings.get("sottotitolo_default")
                   or "Piatti in base agli acquisti del giorno, soggetti a disponibilità.").strip()
    footer = (settings.get("footer_default") or "").strip()
    settimana_str = _format_settimana(menu["settimana_inizio"])
    piatti_html = _build_piatti_html(menu.get("righe") or [])
    business_html = _build_business_box_html(settings)

    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <link rel="stylesheet" href="/static/css/menu_pranzo_pdf.css">
    </head>
    <body>
        <div class="menu-page">
            <div class="menu-header">
                <div class="data">{escape(settimana_str)}</div>
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
    """Bytes del PDF. `menu` deve avere `settimana_inizio` e `righe[]`."""
    from weasyprint import HTML, CSS  # lazy
    html = _build_html(menu, settings)
    return HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        stylesheets=[CSS(filename=str(CSS_PDF))],
    )


def genera_html_menu_pranzo(menu: Dict[str, Any], settings: Dict[str, Any]) -> str:
    """HTML del PDF (per anteprima/test)."""
    return _build_html(menu, settings)
