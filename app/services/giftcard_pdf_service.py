# Modulo: clienti
# Classificazione: [core] — il generatore e' generico, l'identita' visiva
# arriva da locali/<id>/branding.json (chiave client_pdf). Nessuna stringa
# "Tre Gobbi" hardcoded qui dentro.

# @version: v1.0-giftcard-pdf
# -*- coding: utf-8 -*-
"""
PDF del buono regalo — TRGB Gestionale (modulo clienti).

PERCHE' NON USA pdf_brand (M.B):
  M.B produce documenti INTERNI col brand del gestionale (wordmark TRGB,
  strip gobbette, "generato il..."). Il buono regalo e' un pezzo di
  comunicazione verso il CLIENTE: deve avere l'identita' del locale, non
  quella del software. Stessa logica per cui la carta vini ha un motore suo.
  Qui riusiamo pero' lo stesso motore di rendering (weasyprint) e la stessa
  fonte di verita' del branding cliente (branding.json → client_pdf).

Formato: A5 orizzontale, sobrio, stampabile in bianco e nero senza perdere
nulla di essenziale (il codice resta leggibile anche fotocopiato).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("trgb.clienti.giftcard.pdf")

BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
FONTS_DIR = STATIC_DIR / "fonts"

MESI_IT = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
]

_FALLBACK_BRAND = {
    "nome": "",
    "primary_color": "#111111",
    "accent_color": "#8a7a5c",
    "page_bg": "#ffffff",
}


def _carica_branding() -> Dict[str, Any]:
    """
    Legge locali/<TRGB_LOCALE>/branding.json. Se manca (o manca client_pdf)
    si degrada a un buono neutro: meglio un PDF sobrio senza nome che un
    errore 500 al banco mentre il cliente aspetta.
    """
    brand = dict(_FALLBACK_BRAND)
    try:
        from app.utils.locale_data import locale_data_dir
        # locale_data_dir() = locali/<id>/data/ ; branding.json sta un livello sopra
        branding_file = locale_data_dir().parent / "branding.json"
        if branding_file.exists():
            data = json.loads(branding_file.read_text(encoding="utf-8"))
            cpdf = data.get("client_pdf") or {}
            brand["nome"] = data.get("tagline") or ""
            brand["primary_color"] = cpdf.get("primary_color") or brand["primary_color"]
            brand["accent_color"] = cpdf.get("accent_color") or brand["accent_color"]
            brand["page_bg"] = cpdf.get("page_bg") or brand["page_bg"]
    except Exception as e:
        logger.warning("branding.json non leggibile per il PDF gift card: %s", e)
    return brand


def _font_face_css() -> str:
    """Cormorant Garamond se i file ci sono, altrimenti serif di sistema."""
    regular = FONTS_DIR / "CormorantGaramond-Medium.ttf"
    bold = FONTS_DIR / "CormorantGaramond-Bold.ttf"
    if not (regular.exists() and bold.exists()):
        return ""
    return f"""
    @font-face {{
      font-family: 'CormorantG';
      src: url('file://{regular}') format('truetype');
      font-weight: 500;
    }}
    @font-face {{
      font-family: 'CormorantG';
      src: url('file://{bold}') format('truetype');
      font-weight: 700;
    }}
    """


def _data_lunga(iso: Optional[str]) -> str:
    if not iso:
        return ""
    try:
        d = datetime.strptime(iso, "%Y-%m-%d").date()
        return f"{d.day} {MESI_IT[d.month - 1]} {d.year}"
    except (ValueError, IndexError):
        return iso


def _valore_html(gc: Dict[str, Any]) -> str:
    """
    Cuore del buono. Su una card a valore mostriamo l'importo grande;
    su una esperienza mostriamo la descrizione, SENZA importo: il
    destinatario non deve leggere quanto e' stato speso per lui.
    """
    if gc.get("tipo") == "valore":
        importo = gc.get("importo") or 0
        testo = f"{importo:,.0f}".replace(",", ".") if float(importo).is_integer() else f"{importo:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f'<div class="valore">€ {testo}</div>'
    descrizione = escape(gc.get("descrizione") or "Esperienza")
    return f'<div class="esperienza">{descrizione}</div>'


def genera_pdf_giftcard(gc: Dict[str, Any]) -> bytes:
    """
    gc = dict della gift card (come lo serializza il router).
    Ritorna i bytes del PDF A5 orizzontale.
    """
    from weasyprint import HTML, CSS  # lazy import, come negli altri servizi

    brand = _carica_branding()
    intestatario = (gc.get("intestatario_nome") or "").strip()
    if not intestatario:
        nome = " ".join(
            p for p in [gc.get("cliente_nome"), gc.get("cliente_cognome")] if p
        ).strip()
        intestatario = nome

    scadenza = _data_lunga(gc.get("data_scadenza"))
    riga_scadenza = (
        f'<div class="scadenza">Valido fino al {escape(scadenza)}</div>'
        if scadenza else
        '<div class="scadenza">Senza scadenza</div>'
    )
    riga_intestatario = (
        f'<div class="per">per {escape(intestatario)}</div>' if intestatario else ""
    )
    nota = (gc.get("note") or "").strip()
    riga_nota = f'<div class="nota">{escape(nota)}</div>' if nota else ""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Buono regalo</title></head>
<body>
  <div class="card">
    <div class="testata">{escape(brand["nome"])}</div>
    <div class="titolo">Buono Regalo</div>
    {riga_intestatario}
    {_valore_html(gc)}
    {riga_nota}
    <div class="codice-label">codice</div>
    <div class="codice">{escape(gc.get("codice") or "")}</div>
    {riga_scadenza}
    <div class="piede">Da consegnare al personale al momento del conto. Non convertibile in denaro.</div>
  </div>
</body></html>"""

    css = f"""
    {_font_face_css()}
    @page {{ size: A5 landscape; margin: 0; }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: 'CormorantG', Georgia, 'Times New Roman', serif;
      color: {brand["primary_color"]};
      background: {brand["page_bg"]};
    }}
    .card {{
      width: 210mm; height: 148mm;
      padding: 14mm 16mm;
      text-align: center;
      /* cornice sottile: da' l'idea del buono ritagliabile senza sembrare un coupon */
      border: 0.6mm solid {brand["accent_color"]};
      outline: 0.2mm solid {brand["accent_color"]};
      outline-offset: 2.5mm;
    }}
    .testata {{
      font-size: 15pt; letter-spacing: 0.32em; text-transform: uppercase;
      margin-bottom: 7mm;
    }}
    .titolo {{
      font-size: 27pt; font-weight: 700; letter-spacing: 0.06em;
      margin-bottom: 2mm;
    }}
    .per {{ font-size: 13pt; font-style: italic; margin-bottom: 4mm; }}
    .valore {{ font-size: 48pt; font-weight: 700; margin: 3mm 0 4mm; }}
    .esperienza {{
      font-size: 20pt; font-weight: 700; margin: 5mm auto 5mm;
      max-width: 150mm; line-height: 1.3;
    }}
    .nota {{ font-size: 11pt; font-style: italic; margin-bottom: 4mm; }}
    .codice-label {{
      font-size: 8pt; letter-spacing: 0.28em; text-transform: uppercase;
      color: {brand["accent_color"]};
    }}
    .codice {{
      font-family: 'Courier New', Courier, monospace;
      font-size: 19pt; font-weight: 700; letter-spacing: 0.18em;
      margin: 1mm 0 5mm;
    }}
    .scadenza {{ font-size: 11pt; }}
    .piede {{
      font-size: 8pt; margin-top: 6mm; color: {brand["accent_color"]};
    }}
    """

    return HTML(string=html, base_url=str(STATIC_DIR)).write_pdf(
        stylesheets=[CSS(string=css)]
    )
