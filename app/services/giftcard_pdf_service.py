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
    """
    Cormorant Garamond (font PDF cliente da branding.json).

    Doppia strada, come fa il CSS del menu pranzo: `@font-face` dai file del
    repo E il nome della famiglia installata a sistema. Su alcune build di
    WeasyPrint l'`@font-face` da `file://` viene ignorato in silenzio e il
    PDF esce in Times senza dirlo: il nome di famiglia in `font-family` fa
    da rete di sicurezza quando il font e' installato sul server.
    """
    facce = []
    for nome_file, peso, stile in [
        ("CormorantGaramond-Medium.ttf", 400, "normal"),
        ("CormorantGaramond-Bold.ttf", 700, "normal"),
        ("CormorantGaramond-MediumItalic.ttf", 400, "italic"),
    ]:
        percorso = FONTS_DIR / nome_file
        if not percorso.exists():
            continue
        facce.append(f"""
    @font-face {{
      font-family: 'CormorantG';
      src: url('file://{percorso}') format('truetype'),
           url('/usr/local/share/fonts/tre_gobbi/{nome_file}') format('truetype');
      font-weight: {peso};
      font-style: {stile};
    }}""")
    return "\n".join(facce)


# Il primo nome e' la famiglia installata a sistema, il secondo quello
# definito da @font-face: chi risponde per primo vince, e in ultima
# istanza si finisce su un serif di sistema (leggibile comunque).
FONT_TESTO = "'Cormorant Garamond', 'CormorantG', Georgia, 'Times New Roman', serif"
FONT_CODICE = "'Courier Prime', 'Courier New', Courier, monospace"


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
  <div class="cornice"><div class="centro">
    <div class="testata">{escape(brand["nome"])}</div>
    <div class="filetto"></div>
    <div class="titolo">Buono Regalo</div>
    {riga_intestatario}
    {_valore_html(gc)}
    {riga_nota}
    <div class="codice-label">codice</div>
    <div class="codice">{escape(gc.get("codice") or "")}</div>
    {riga_scadenza}
    <div class="piede">Da consegnare al personale al momento del conto. Non convertibile in denaro.</div>
  </div></div>
</body></html>"""

    css = f"""
    {_font_face_css()}
    /* Margine di pagina reale: la cornice ci sta dentro invece di finire
       tagliata dal bordo foglio (e resta stampabile su qualsiasi stampante,
       che l'area non stampabile la mangia sempre). */
    @page {{ size: A5 landscape; margin: 7mm; }}
    * {{ box-sizing: border-box; }}
    html, body {{ margin: 0; padding: 0; height: 100%; }}
    body {{
      font-family: {FONT_TESTO};
      color: {brand["primary_color"]};
      background: {brand["page_bg"]};
    }}
    /* Centratura verticale con flexbox. NON usare `display:table` +
       `vertical-align:middle`: su WeasyPrint la table-cell ignora
       l'allineamento e sputa tutto in cima alla pagina (misurato: testo a
       y=22 su 350px invece di y=175). Con flex il centro cade dove deve. */
    .cornice {{
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%; height: 134mm;
      border: 0.5mm double {brand["accent_color"]};
      padding: 8mm 14mm;
      text-align: center;
    }}
    .centro {{ width: 100%; }}

    .testata {{
      font-size: 13pt; letter-spacing: 0.34em; text-transform: uppercase;
    }}
    .filetto {{
      width: 22mm; height: 0.3mm; margin: 4mm auto 5mm;
      background: {brand["accent_color"]};
    }}
    .titolo {{
      font-size: 30pt; font-weight: 700; letter-spacing: 0.04em;
      line-height: 1.1;
    }}
    .per {{ font-size: 13pt; font-style: italic; margin-top: 1.5mm; }}
    /* Cifre allineate (lining): di default Cormorant usa le old-style e
       "100" viene letto "IOO". Su un buono l'importo e' la cosa che deve
       leggersi meglio di tutte. Vale anche per le date. */
    .valore, .scadenza, .codice {{
      font-feature-settings: "lnum" 1, "onum" 0;
      font-variant-numeric: lining-nums;
    }}
    .valore {{ font-size: 50pt; font-weight: 700; margin: 6mm 0 5mm; line-height: 1; }}
    .esperienza {{
      font-size: 18pt; font-weight: 700; margin: 6mm auto 5mm;
      max-width: 145mm; line-height: 1.35;
    }}
    .nota {{ font-size: 11pt; font-style: italic; margin-bottom: 4mm; }}
    .codice-label {{
      font-size: 7.5pt; letter-spacing: 0.3em; text-transform: uppercase;
      color: {brand["accent_color"]};
    }}
    .codice {{
      font-family: {FONT_CODICE};
      font-size: 18pt; font-weight: 700; letter-spacing: 0.16em;
      margin: 1.5mm 0 4mm;
    }}
    .scadenza {{ font-size: 10.5pt; }}
    .piede {{
      font-size: 7.5pt; margin-top: 7mm; color: {brand["accent_color"]};
    }}
    """

    return HTML(string=html, base_url=str(STATIC_DIR)).write_pdf(
        stylesheets=[CSS(string=css)]
    )
