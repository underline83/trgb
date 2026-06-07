#!/usr/bin/env python3
# @version: v3.1-pranzo-pdf-logo
# -*- coding: utf-8 -*-
# Modulo: cucina (sub-modulo pranzo)
"""
TRGB — Service PDF Menu Pranzo settimanale (restyle 2026-06-07)

PDF brand cliente Osteria Tre Gobbi — [locale:tregobbi].
v3.0 "Proposta A — Pagina di sezione": coerente con il MENU A5 stagionale
dell'osteria (NON con la carta vini): titolo Sabon LT Pro spaziato, piatti
in Courier Prime bold maiuscolo allineati a sinistra raggruppati per
categoria, box Menù Business con prezzi nudi (niente €), footer corsivo.
Pagina singola A4, testata/prezzi/footer presi sempre da `pranzo_settings`.

Font: Sabon LT Pro + Courier Prime (gli stessi del menu A5 primavera 2026,
verificati dai BaseFont del PDF di studio). Fallback Cormorant Garamond →
Times finché i file Sabon/Courier non sono caricati in static/fonts/.
"""
from __future__ import annotations

from datetime import date as date_cls, timedelta
from html import escape
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
CSS_PDF = STATIC_DIR / "css" / "menu_pranzo_pdf.css"
# Logo wordmark rifilato (v3.1): logo_tregobbi.png originale è un quadrato
# 5000x5000 con ~60% di aria — la versione _trim contiene solo il wordmark.
LOGO_TRIM = STATIC_DIR / "img" / "logo_tregobbi_trim.png"
LOGO_FALLBACK = STATIC_DIR / "img" / "logo_tregobbi.png"


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

# Etichette plurali per i blocchi categoria nel PDF (stile sezioni menu A5)
LABEL_CATEGORIA = {
    "antipasto": "Antipasti",
    "primo": "Primi",
    "secondo": "Secondi",
    "contorno": "Contorni",
    "dolce": "Dolci",
    "altro": "Dal mercato",
}


def _format_settimana(monday_iso: str) -> str:
    """
    'YYYY-MM-DD' (lunedi) -> 'settimana dell'8 - 12 giugno 2026' (lun-ven).
    Minuscolo: va in coda al sottotitolo corsivo. Articolo elide su 8 e 11.
    """
    try:
        lun = date_cls.fromisoformat(monday_iso)
    except Exception:
        return f"settimana del {monday_iso}"
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
    articolo = "dell'" if lun.day in (8, 11) else "del "
    return f"settimana {articolo}{intervallo}"


def _format_prezzo(p: Optional[float]) -> str:
    """Prezzo nudo come sul menu A5: '15', '14,50'. Niente simbolo €."""
    if p is None:
        return ""
    if float(p).is_integer():
        return str(int(p))
    return f"{p:.2f}".replace(".", ",")


# ─────────────────────────────────────────────────────────────
# HTML BUILDERS
# ─────────────────────────────────────────────────────────────
def _build_piatti_html(righe: List[Dict[str, Any]]) -> str:
    """
    Blocchi per categoria: etichetta serif spaziata + piatti typewriter.
    Le categorie senza piatti non compaiono. Ordine: ORDINE_CATEGORIA.
    """
    sorted_righe = sorted(
        righe or [],
        key=lambda r: (
            ORDINE_CATEGORIA.get((r.get("categoria") or "altro"), 99),
            int(r.get("ordine") or 0),
        ),
    )

    gruppi: List[tuple] = []  # [(categoria, [nomi])]
    for r in sorted_righe:
        nome = (r.get("nome") or "").strip()
        if not nome:
            continue
        cat = (r.get("categoria") or "altro").lower()
        if gruppi and gruppi[-1][0] == cat:
            gruppi[-1][1].append(nome)
        else:
            gruppi.append((cat, [nome]))

    if not gruppi:
        return '<div class="menu-piatti"><div class="piatto piatto-vuoto">Nessun piatto programmato</div></div>'

    blocchi = []
    for cat, nomi in gruppi:
        label = LABEL_CATEGORIA.get(cat, cat.capitalize())
        piatti = "".join(f'<div class="piatto">{escape(n)}</div>' for n in nomi)
        blocchi.append(
            f'<div class="categoria-label">{escape(label)}</div>'
            f'<div class="categoria-blocco">{piatti}</div>'
        )
    return '<div class="menu-piatti">' + "".join(blocchi) + "</div>"


def _build_business_box_html(settings: Dict[str, Any]) -> str:
    titolo_business = settings.get("titolo_business") or "Menù Business"
    p1 = settings.get("prezzo_1_default")
    p2 = settings.get("prezzo_2_default")
    p3 = settings.get("prezzo_3_default")

    return f"""
    <div class="menu-business">
        <div class="business-titolo">{escape(titolo_business)}</div>
        <div class="business-row"><span class="lbl">Una portata a scelta</span><span class="prz">{_format_prezzo(p1)}</span></div>
        <div class="business-row"><span class="lbl">Due portate a scelta</span><span class="prz">{_format_prezzo(p2)}</span></div>
        <div class="business-row"><span class="lbl">Tre portate a scelta</span><span class="prz">{_format_prezzo(p3)}</span></div>
    </div>
    """


def _build_html(menu: Dict[str, Any], settings: Dict[str, Any]) -> str:
    titolo = (settings.get("titolo_default") or "PRANZO").strip()
    sottotitolo = (settings.get("sottotitolo_default") or "la cucina del mercato").strip()
    footer = (settings.get("footer_default") or "").strip()
    settimana_str = _format_settimana(menu["settimana_inizio"])
    # Sottotitolo corsivo unico: "la cucina del mercato · settimana dell'8 - 12 giugno 2026"
    sottotitolo_riga = f"{sottotitolo} · {settimana_str}" if sottotitolo else settimana_str
    piatti_html = _build_piatti_html(menu.get("righe") or [])
    business_html = _build_business_box_html(settings)

    # Logo Osteria Tre Gobbi in testa (v3.1, richiesta Marco)
    logo_path = LOGO_TRIM if LOGO_TRIM.exists() else LOGO_FALLBACK
    logo_html = (
        f'<img class="menu-logo" src="file://{logo_path}" alt="Osteria Tre Gobbi">'
        if logo_path.exists() else ""
    )

    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <link rel="stylesheet" href="/static/css/menu_pranzo_pdf.css">
    </head>
    <body>
        <div class="menu-page">
            {logo_html}
            <div class="menu-titolo">{escape(titolo)}</div>
            <div class="menu-sottotitolo">{escape(sottotitolo_riga)}</div>

            {piatti_html}

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
