# @version: v1.0-pdf-brand-service
# -*- coding: utf-8 -*-
"""
Servizio PDF Brand — TRGB Gestionale (mattone M.B)

Servizio centralizzato per generare PDF con branding TRGB-02 coerente.
Due modalità d'uso:

1. `genera_pdf_html(template, dati, ...)` → per contenuti NUOVI.
   Usa template Jinja2 in app/templates/pdf/ che estendono base.html.
   Output: bytes del PDF.

2. `wrappa_html_brand(titolo, sottotitolo, body_html, ...)` → per migrare
   endpoint che già generano HTML+tabelle proprie (es. inventario cantina).
   Avvolge il body_html in un layout brand con header/footer TRGB.

ESCLUSIONE: il PDF della Carta Vini (carta_vini_service.py + /vini/carta/pdf)
ha un motore suo e NON deve essere toccato. Questo servizio non lo sostituisce.

Asset brand:
- Logo icon SVG in app/templates/pdf/logo-icon.svg
- Strip gobbette SVG in app/templates/pdf/gobbette-strip.svg

Font: Helvetica Neue (system). Titoli in Playfair Display (fallback system serif).
Palette TRGB-02:
- brand-red     #E8402B
- brand-green   #2EB872
- brand-blue    #2E7BE8
- brand-ink     #111111
- brand-cream   #F4F1EC

Uso da router:
    from app.services.pdf_brand import genera_pdf_html, wrappa_html_brand

    # Content nuovo
    pdf_bytes = genera_pdf_html(
        template="preventivo.html",
        dati={"prev": preventivo_dict, "righe": righe},
        titolo=f"Preventivo {prev['numero']}",
        sottotitolo="Osteria Tre Gobbi — Bergamo",
        filename="preventivo_001.pdf",
    )

    # Endpoint HTML già esistente (es. inventario)
    pdf_bytes = wrappa_html_brand(
        titolo="INVENTARIO CANTINA",
        sottotitolo="Tutti i vini",
        body_html=table_html,          # HTML già costruito dal chiamante
        css_extra=_inventario_css(),   # CSS specifico del dominio
        orientamento="landscape",
    )
"""

from __future__ import annotations

import base64
from datetime import datetime
from pathlib import Path
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

# WeasyPrint viene importato lazy: così l'intero modulo non esplode
# se la lib manca in ambienti dev senza dipendenze native (Cairo/Pango).
# In produzione WeasyPrint è già installato (requirements.txt).


# ---------------------------------------------------------------------------
# Setup Jinja2
# ---------------------------------------------------------------------------

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "pdf"
_ASSETS_DIR = _TEMPLATES_DIR  # logo + strip vivono qui vicino ai template

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


# ---------------------------------------------------------------------------
# Wordmark TRGB: 3 gobbette colorate (rosso/verde/blu) inline — stessa
# struttura di frontend/src/components/TrgbWordmark.jsx. Il testo "TRGB"
# resta come <span> HTML accanto (vedi CLAUDE.md: gli SVG con <text> hanno
# problemi di viewBox nei renderer; composizione inline è la via sicura).
# ---------------------------------------------------------------------------

_GOBBETTE_WORDMARK_SVG = """<svg viewBox="15 28 45 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="5">
    <path stroke="#E8402B" d="M 20 50 L 20.3 48.8 L 20.6 47.7 L 21.0 46.5 L 21.4 45.4 L 21.9 44.3 L 22.4 43.2 L 23.0 42.2 L 23.6 41.1 L 24.3 40.1 L 25.0 39.2 L 25.9 38.2 L 26.8 37.3 L 27.7 36.6 L 28.7 35.9 L 29.7 35.3 L 30.7 34.8 L 31.8 34.4 L 32.9 34.1 L 34.1 33.9 L 35.3 33.8 L 36.5 33.8 L 37.7 33.9 L 38.8 34.1 L 40.0 34.2 L 41.1 34.5 L 42.2 34.8 L 43.3 35.2 L 44.3 35.6 L 45.4 36.1 L 46.4 36.6 L 47.4 37.2 L 48.4 37.8 L 49.4 38.4 L 50.4 39.0 L 51.3 39.7 L 52.3 40.3 L 53.3 41.0 L 54.2 41.7 L 55.2 42.4"/>
  </g>
</svg>"""
# Nota: solo la gobbetta rossa qui — il template ripete 3 volte l'SVG (rosso/verde/blu) oppure
# usiamo un SVG unico con tutte e 3. Scegliamo l'SVG unico qui sotto per rendering più pulito.

_WORDMARK_SVG_FULL = """<svg viewBox="15 28 155 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="5">
    <path stroke="#E8402B" d="M 20 50 L 20.3 48.8 L 20.6 47.7 L 21.0 46.5 L 21.4 45.4 L 21.9 44.3 L 22.4 43.2 L 23.0 42.2 L 23.6 41.1 L 24.3 40.1 L 25.0 39.2 L 25.9 38.2 L 26.8 37.3 L 27.7 36.6 L 28.7 35.9 L 29.7 35.3 L 30.7 34.8 L 31.8 34.4 L 32.9 34.1 L 34.1 33.9 L 35.3 33.8 L 36.5 33.8 L 37.7 33.9 L 38.8 34.1 L 40.0 34.2 L 41.1 34.5 L 42.2 34.8 L 43.3 35.2 L 44.3 35.6 L 45.4 36.1 L 46.4 36.6 L 47.4 37.2 L 48.4 37.8 L 49.4 38.4 L 50.4 39.0 L 51.3 39.7 L 52.3 40.3 L 53.3 41.0 L 54.2 41.7 L 55.2 42.4"/>
    <path stroke="#2EB872" d="M 75 50 L 75.3 48.8 L 75.6 47.7 L 76.0 46.5 L 76.4 45.4 L 76.9 44.3 L 77.4 43.2 L 78.0 42.2 L 78.6 41.1 L 79.3 40.1 L 80.0 39.2 L 80.9 38.2 L 81.8 37.3 L 82.7 36.6 L 83.7 35.9 L 84.7 35.3 L 85.7 34.8 L 86.8 34.4 L 87.9 34.1 L 89.1 33.9 L 90.3 33.8 L 91.5 33.8 L 92.7 33.9 L 93.8 34.1 L 95.0 34.2 L 96.1 34.5 L 97.2 34.8 L 98.3 35.2 L 99.3 35.6 L 100.4 36.1 L 101.4 36.6 L 102.4 37.2 L 103.4 37.8 L 104.4 38.4 L 105.4 39.0 L 106.3 39.7 L 107.3 40.3 L 108.3 41.0 L 109.2 41.7 L 110.2 42.4"/>
    <path stroke="#2E7BE8" d="M 130 50 L 130.3 48.8 L 130.6 47.7 L 131.0 46.5 L 131.4 45.4 L 131.9 44.3 L 132.4 43.2 L 133.0 42.2 L 133.6 41.1 L 134.3 40.1 L 135.0 39.2 L 135.9 38.2 L 136.8 37.3 L 137.7 36.6 L 138.7 35.9 L 139.7 35.3 L 140.7 34.8 L 141.8 34.4 L 142.9 34.1 L 144.1 33.9 L 145.3 33.8 L 146.5 33.8 L 147.7 33.9 L 148.8 34.1 L 150.0 34.2 L 151.1 34.5 L 152.2 34.8 L 153.3 35.2 L 154.3 35.6 L 155.4 36.1 L 156.4 36.6 L 157.4 37.2 L 158.4 37.8 L 159.4 38.4 L 160.4 39.0 L 161.3 39.7 L 162.3 40.3 L 163.3 41.0 L 164.2 41.7 L 165.2 42.4"/>
  </g>
</svg>"""


# ---------------------------------------------------------------------------
# Asset loader (SVG inline, per compatibilità WeasyPrint senza file://)
# ---------------------------------------------------------------------------

def _read_svg(name: str) -> str:
    """Legge un SVG dal folder assets e lo ritorna come stringa.
    Robusto se il file non c'è: ritorna stringa vuota (il template gestirà il fallback).
    """
    p = _ASSETS_DIR / name
    if not p.exists():
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return ""


def _svg_data_uri(name: str) -> str:
    """SVG → data URI base64. Utile quando serve un <img src="..."> sicuro in WeasyPrint."""
    svg = _read_svg(name)
    if not svg:
        return ""
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


# ---------------------------------------------------------------------------
# CSS base brand (palette TRGB-02, layout pagina, header/footer)
# ---------------------------------------------------------------------------

def _base_css_brand(orientamento: str = "portrait") -> str:
    """CSS comune a tutti i PDF brand TRGB. Imposta @page, palette, tipografia, tabelle base.
    `orientamento`: "portrait" | "landscape".
    """
    size = "A4 portrait" if orientamento == "portrait" else "A4 landscape"
    return f"""
    @page {{
        size: {size};
        margin: 18mm 14mm 18mm 14mm;
        @bottom-left {{
            content: "TRGB — Osteria Tre Gobbi";
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 8px;
            color: #999;
        }}
        @bottom-right {{
            content: "Pag. " counter(page) " / " counter(pages);
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 8px;
            color: #999;
        }}
    }}

    :root {{
        --brand-red:   #E8402B;
        --brand-green: #2EB872;
        --brand-blue:  #2E7BE8;
        --brand-ink:   #111111;
        --brand-cream: #F4F1EC;
    }}

    html, body {{
        margin: 0;
        padding: 0;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 10pt;
        color: #111111;
        background: #ffffff;
        line-height: 1.4;
    }}

    /* Header brand */
    .brand-header {{
        display: table;
        width: 100%;
        border-bottom: 2px solid #111111;
        padding-bottom: 8px;
        margin-bottom: 14px;
    }}
    .brand-header .wordmark-cell {{
        display: table-cell;
        vertical-align: middle;
    }}
    /* Wordmark = gobbette SVG (rosso/verde/blu) + testo TRGB (come Home/Login) */
    .brand-header .wordmark-inline {{
        display: table;
        line-height: 1;
    }}
    .brand-header .wordmark-svg {{
        display: table-cell;
        vertical-align: middle;
    }}
    .brand-header .wordmark-svg svg {{
        height: 28pt;
        width: auto;
        display: block;
    }}
    .brand-header .wordmark-text {{
        display: table-cell;
        vertical-align: middle;
        padding-left: 10px;
        font-size: 26pt;
        font-weight: 800;
        letter-spacing: -0.5px;
        color: #111111;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }}
    .brand-header .org-sub {{
        font-size: 8.5pt;
        color: #666;
        margin-top: 6px;
    }}
    .brand-header .title-cell {{
        display: table-cell;
        vertical-align: middle;
        text-align: right;
    }}
    .brand-header .doc-title {{
        font-size: 13pt;
        font-weight: bold;
        color: #111;
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.4px;
    }}
    .brand-header .doc-sub {{
        font-size: 8.5pt;
        color: #666;
        margin-top: 2px;
    }}

    /* Strip decorativa sotto header (opzionale, via classe .with-strip) */
    .gobbette-strip {{
        display: block;
        height: 6px;
        background: linear-gradient(
            to right,
            var(--brand-red) 0%, var(--brand-red) 33.3%,
            var(--brand-green) 33.3%, var(--brand-green) 66.6%,
            var(--brand-blue) 66.6%, var(--brand-blue) 100%
        );
        margin: -10px 0 14px 0;
        border-radius: 2px;
    }}

    h1, h2, h3 {{ color: #111; margin-top: 0.8em; }}
    h1 {{ font-size: 16pt; }}
    h2 {{ font-size: 13pt; border-bottom: 1px solid #ddd; padding-bottom: 3px; }}
    h3 {{ font-size: 11pt; color: #333; }}

    /* Tabelle base */
    table.brand {{
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0 14px 0;
        page-break-inside: auto;
    }}
    table.brand tr {{ page-break-inside: avoid; }}
    table.brand th {{
        background: #F4F1EC;
        color: #111;
        font-weight: bold;
        text-align: left;
        padding: 6px 8px;
        font-size: 8.5pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        border-bottom: 2px solid #111;
    }}
    table.brand td {{
        padding: 5px 8px;
        border-bottom: 1px solid #e5e5e5;
        vertical-align: top;
        font-size: 9.5pt;
    }}
    table.brand .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    table.brand .tot-row td {{
        font-weight: bold;
        border-top: 2px solid #111;
        background: #F4F1EC;
    }}

    /* Summary boxes */
    .summary-row {{ margin: 4px 0 14px 0; }}
    .summary-box {{
        display: inline-block;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 5px 14px;
        margin: 0 6px 6px 0;
        text-align: center;
        background: #fafafa;
    }}
    .summary-box .label {{ font-size: 7.5pt; color: #777; text-transform: uppercase; letter-spacing: 0.4px; }}
    .summary-box .value {{ font-size: 13pt; font-weight: bold; color: #111; }}

    /* Info block (preventivo cliente/evento) */
    .info-grid {{ display: table; width: 100%; margin: 10px 0 14px 0; }}
    .info-cell {{ display: table-cell; vertical-align: top; width: 50%; padding-right: 12px; }}
    .info-cell .label {{ font-size: 7.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }}
    .info-cell .value {{ font-size: 10pt; color: #111; margin-bottom: 6px; }}

    /* Colori semantici */
    .text-red   {{ color: var(--brand-red); }}
    .text-green {{ color: var(--brand-green); }}
    .text-blue  {{ color: var(--brand-blue); }}
    .text-muted {{ color: #888; }}

    .pill {{
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 8pt;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}
    .pill-red   {{ background: #fde1dc; color: #b8321f; }}
    .pill-green {{ background: #d6f0e0; color: #1f7a4a; }}
    .pill-blue  {{ background: #dde9fb; color: #1e5ab8; }}
    .pill-gray  {{ background: #eee;    color: #555; }}

    .small {{ font-size: 8.5pt; color: #666; }}
    """


# ---------------------------------------------------------------------------
# Helpers template context
# ---------------------------------------------------------------------------

def _context_base(titolo: str, sottotitolo: Optional[str] = None) -> dict:
    """Context condiviso da tutti i template PDF."""
    return {
        "titolo": titolo,
        "sottotitolo": sottotitolo or "",
        "org_nome": "Osteria Tre Gobbi",
        "org_sub": "Bergamo — trgb.tregobbi.it",
        "data_oggi": datetime.now().strftime("%d/%m/%Y"),
        "data_oggi_lunga": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "logo_data_uri": _svg_data_uri("logo-icon.svg"),
        "wordmark_svg": _WORDMARK_SVG_FULL,
    }


# ---------------------------------------------------------------------------
# API PUBBLICA 1: genera PDF da template Jinja2
# ---------------------------------------------------------------------------

def genera_pdf_html(
    template: str,
    dati: dict,
    titolo: str,
    sottotitolo: Optional[str] = None,
    orientamento: str = "portrait",
    filename: Optional[str] = None,
    css_extra: Optional[str] = None,
) -> bytes:
    """
    Genera un PDF brandizzato a partire da un template Jinja2.

    Args:
        template: nome file template (es. "preventivo.html") — deve estendere base.html
        dati: dict con le variabili specifiche del template (es. {"prev": ..., "righe": ...})
        titolo: titolo documento (mostrato in header destro)
        sottotitolo: sottotitolo opzionale
        orientamento: "portrait" | "landscape"
        filename: nome file suggerito (non usato internamente ma ritornato per comodità)
        css_extra: CSS aggiuntivo da applicare dopo il base

    Returns:
        bytes del PDF. Il router chiamante lo ritorna con FastAPI Response.
    """
    from weasyprint import HTML, CSS  # lazy import

    tpl = _env.get_template(template)
    ctx = _context_base(titolo=titolo, sottotitolo=sottotitolo)
    ctx.update(dati or {})
    html_str = tpl.render(**ctx)

    stylesheets = [CSS(string=_base_css_brand(orientamento=orientamento))]
    if css_extra:
        stylesheets.append(CSS(string=css_extra))

    pdf_bytes = HTML(string=html_str, base_url=str(_TEMPLATES_DIR)).write_pdf(
        stylesheets=stylesheets,
    )
    return pdf_bytes


# ---------------------------------------------------------------------------
# API PUBBLICA 2: wrappa HTML esistente in layout brand
# ---------------------------------------------------------------------------

def wrappa_html_brand(
    titolo: str,
    body_html: str,
    sottotitolo: Optional[str] = None,
    css_extra: Optional[str] = None,
    orientamento: str = "portrait",
    strip: bool = True,
) -> bytes:
    """
    Avvolge un blocco HTML già costruito dal chiamante in un layout brand TRGB.
    Utile per migrare endpoint esistenti (es. inventario cantina) senza riscriverli:
    basta passare il body_html (la tabella) + il css_extra (gli stili specifici).

    Args:
        titolo: titolo documento (header destro)
        body_html: HTML già pronto (stringa) da inserire dopo l'header
        sottotitolo: sottotitolo opzionale (sotto al titolo, es. filtri attivi)
        css_extra: CSS specifico del dominio (es. _inventario_css())
        orientamento: "portrait" | "landscape"
        strip: se True mostra la striscia rosso/verde/blu sotto l'header

    Returns:
        bytes del PDF.
    """
    from weasyprint import HTML, CSS  # lazy import

    ctx = _context_base(titolo=titolo, sottotitolo=sottotitolo)
    strip_html = '<div class="gobbette-strip"></div>' if strip else ""
    sottot_html = (
        f'<div class="doc-sub">{ctx["sottotitolo"]}</div>' if ctx.get("sottotitolo") else ""
    )

    full_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{titolo}</title></head>
<body>
  <div class="brand-header">
    <div class="wordmark-cell">
      <div class="wordmark-inline">
        <span class="wordmark-svg">{_WORDMARK_SVG_FULL}</span>
        <span class="wordmark-text">TRGB</span>
      </div>
      <div class="org-sub">{ctx["org_nome"]} — {ctx["org_sub"]}</div>
    </div>
    <div class="title-cell">
      <div class="doc-title">{titolo}</div>
      {sottot_html}
      <div class="doc-sub">Generato il {ctx["data_oggi_lunga"]}</div>
    </div>
  </div>
  {strip_html}
  {body_html}
</body></html>"""

    stylesheets = [CSS(string=_base_css_brand(orientamento=orientamento))]
    if css_extra:
        stylesheets.append(CSS(string=css_extra))

    pdf_bytes = HTML(string=full_html, base_url=str(_TEMPLATES_DIR)).write_pdf(
        stylesheets=stylesheets,
    )
    return pdf_bytes


# ---------------------------------------------------------------------------
# Utility: filename safe
# ---------------------------------------------------------------------------

def safe_filename(base: str, ext: str = "pdf") -> str:
    """Genera un nome file sicuro con data odierna."""
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in base.strip())
    return f"{safe}_{datetime.now().strftime('%Y%m%d')}.{ext}"
