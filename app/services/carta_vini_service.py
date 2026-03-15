# @version: v1.1-carta-vini-service
# -*- coding: utf-8 -*-
"""
TRGB — Service Carta Vini

Responsabilità:
- Funzioni pure di costruzione HTML per:
  - corpo carta (PDF)
  - corpo carta (preview HTML safe)
  - indice (toc)

NON si occupa di:
- Lettura/scrittura file
- Endpoints FastAPI
- Gestione richieste
- Scelta paths su disco

Queste funzioni sono usate dal router vini.
"""

from __future__ import annotations
from itertools import groupby
from typing import Iterable, Dict, Any

import unicodedata
import re


# ------------------------------------------------------------
# UTILS CONDIVISE
# ------------------------------------------------------------

def slugify(value: str) -> str:
    """Crea un id CSS/HTML semplice per tipologie e regioni."""
    if not value:
        return "x"
    value_norm = unicodedata.normalize("NFKD", value)
    value_ascii = value_norm.encode("ascii", "ignore").decode("ascii")
    value_ascii = re.sub(r"[^a-zA-Z0-9]+", "-", value_ascii).strip("-").lower()
    return value_ascii or "x"


def resolve_regione(r: Dict[str, Any]) -> str:
    """Regola base: Regione → Nazione → Varie."""
    if r.get("REGIONE"):
        return r["REGIONE"]
    if r.get("NAZIONE"):
        return r["NAZIONE"]
    return "Varie"


# ------------------------------------------------------------
# BUILDER — CORPO CARTA (PDF)
# ------------------------------------------------------------
def build_carta_body_html(rows: Iterable[Dict[str, Any]]) -> str:
    rows = list(rows)
    if not rows:
        return "<p><em>Nessun vino da mostrare.</em></p>"

    def k_tip(r): return r["TIPOLOGIA"] or "Senza tipologia"
    def k_naz(r): return r.get("NAZIONE") or "Varie"
    def k_reg(r): return resolve_regione(r)
    def k_prod(r): return r["PRODUTTORE"] or "Produttore sconosciuto"

    html = ""

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        html += f"<h2 class='tipologia'>{tip}</h2>"

        for naz, g1b in groupby(g1, k_naz):
            g1b = list(g1b)
            html += (
                f"<div class='nazione'>"
                f"<span class='naz-line'></span>"
                f"<span class='naz-label'>{naz}</span>"
                f"<span class='naz-line'></span>"
                f"</div>"
            )

            for reg, g2 in groupby(g1b, k_reg):
                g2 = list(g2)
                html += f"<h4 class='regione'>{reg}</h4>"

                for prod, g3 in groupby(g2, k_prod):
                    g3 = list(g3)
                    html += "<div class='producer-block'>"
                    html += "<div class='spacer'></div>"
                    html += f"<h5 class='produttore'>{prod}</h5>"
                    html += "<table class='vini'><tbody>"

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

                        html += (
                            "<tr>"
                            f"<td class='vino'>{desc}</td>"
                            f"<td class='annata'>{annata}</td>"
                            f"<td class='prezzo'>{prezzo}</td>"
                            "</tr>"
                        )

                    html += "</tbody></table></div>"

    return html


# ------------------------------------------------------------
# BUILDER — HTML SAFE (PREVIEW)
# ------------------------------------------------------------
def build_carta_body_html_htmlsafe(rows: Iterable[Dict[str, Any]]) -> str:
    """Preview HTML identica alla 1.33 (senza producer-block)."""
    rows = list(rows)
    if not rows:
        return "<p><em>Nessun vino.</em></p>"

    def k_tip(r): return r["TIPOLOGIA"] or "Senza tipologia"
    def k_naz(r): return r.get("NAZIONE") or "Varie"
    def k_reg(r): return resolve_regione(r)
    def k_prod(r): return r["PRODUTTORE"] or "Produttore sconosciuto"

    html = ""

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        html += f"<h2 class='tipologia'>{tip}</h2>"

        for naz, g1b in groupby(g1, k_naz):
            g1b = list(g1b)
            html += (
                f"<div class='nazione'>"
                f"<span class='naz-line'></span>"
                f"<span class='naz-label'>{naz}</span>"
                f"<span class='naz-line'></span>"
                f"</div>"
            )

            for reg, g2 in groupby(g1b, k_reg):
                g2 = list(g2)
                html += f"<h4 class='regione'>{reg}</h4>"

                for prod, g3 in groupby(g2, k_prod):
                    g3 = list(g3)
                    html += "<div class='spacer'></div>"
                    html += f"<h5 class='produttore'>{prod}</h5>"
                    html += "<table class='vini'><tbody>"

                    for r in g3:
                        desc = r["DESCRIZIONE"] or ""
                        annata = r["ANNATA"] or ""
                        prezzo = r["PREZZO"]
                        if prezzo not in (None, ""):
                            try:
                                prezzo = f"€ {float(prezzo):.2f}".replace(".", ",")
                            except Exception:
                                prezzo = str(prezzo)

                        html += (
                            "<tr>"
                            f"<td class='vino'>{desc}</td>"
                            f"<td class='annata'>{annata}</td>"
                            f"<td class='prezzo'>{prezzo}</td>"
                            "</tr>"
                        )

                    html += "</tbody></table>"

    return html


# ------------------------------------------------------------
# BUILDER — INDICE
# ------------------------------------------------------------
def build_carta_toc_html(rows: Iterable[Dict[str, Any]]) -> str:
    rows = list(rows)
    if not rows:
        return ""

    def k_tip(r): return r["TIPOLOGIA"] or "Senza tipologia"
    def k_naz(r): return r.get("NAZIONE") or "Varie"
    def k_reg(r): return resolve_regione(r)

    html = [
        "<div class='toc-page'>",
        "<div class='toc-title'>INDICE</div>"
    ]

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        html.append(f"<div class='toc-tipologia'>{tip}</div>")

        for naz, g1b in groupby(g1, k_naz):
            g1b = list(g1b)
            html.append(f"<div class='toc-nazione'>· {naz}</div>")

            seen = set()
            for reg, g2 in groupby(g1b, k_reg):
                g2 = list(g2)
                if reg not in seen:
                    seen.add(reg)
                    html.append(f"<div class='toc-regione'>&nbsp;&nbsp;— {reg}</div>")

        html.append("<div class='toc-spacer'></div>")

    html.append("</div>")
    return "".join(html)


# ------------------------------------------------------------
# BUILDER — DOCX (condiviso tra /carta/docx e /cantina/docx)
# ------------------------------------------------------------
def build_carta_docx(rows: Iterable[Dict[str, Any]], logo_path=None) -> "Document":
    """
    Genera un oggetto Document python-docx con la carta vini completa.
    Usa tab stops per allineare descrizione / annata / prezzo in 3 colonne.
    """
    from docx import Document
    from docx.shared import Inches, Pt, Cm, RGBColor
    from docx.enum.text import WD_TAB_ALIGNMENT

    rows = list(rows)
    doc = Document()

    # -- Stile base: margini pagina ridotti per più spazio
    for section in doc.sections:
        section.left_margin = Cm(2)
        section.right_margin = Cm(2)

    # -- Logo
    if logo_path and logo_path.exists():
        doc.add_picture(str(logo_path), width=Inches(1.8))

    # -- Titolo
    from datetime import datetime
    data_oggi = datetime.now().strftime("%d/%m/%Y")
    h = doc.add_heading("CARTA DEI VINI", level=0)
    doc.add_paragraph(f"Osteria Tre Gobbi — Aggiornata al {data_oggi}")

    if not rows:
        doc.add_paragraph("Nessun vino da mostrare.")
        return doc

    # -- Grouping keys
    def k_tip(r): return r["TIPOLOGIA"] or "Senza tipologia"
    def k_naz(r): return r.get("NAZIONE") or "Varie"
    def k_reg(r): return resolve_regione(r)
    def k_prod(r): return r["PRODUTTORE"] or "Produttore sconosciuto"

    # -- Tab stops per le colonne vino
    # Annata a 12 cm (center), Prezzo a 16.5 cm (right)
    TAB_ANNATA = Cm(12)
    TAB_PREZZO = Cm(16.5)

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        doc.add_heading(tip, level=1)

        for naz, g1b in groupby(g1, k_naz):
            g1b = list(g1b)
            # Nazione come heading livello 2
            p_naz = doc.add_heading(naz, level=2)

            for reg, g2 in groupby(g1b, k_reg):
                g2 = list(g2)
                # Regione: corsivo + grassetto
                p_reg = doc.add_paragraph()
                run_reg = p_reg.add_run(reg)
                run_reg.italic = True
                run_reg.bold = True
                run_reg.font.size = Pt(11)

                for prod, g3 in groupby(g2, k_prod):
                    g3 = list(g3)
                    # Produttore: grassetto
                    p_prod = doc.add_paragraph()
                    p_prod.paragraph_format.space_before = Pt(6)
                    p_prod.paragraph_format.space_after = Pt(2)
                    rr = p_prod.add_run(prod)
                    rr.bold = True
                    rr.font.size = Pt(10)

                    for r in g3:
                        desc = r["DESCRIZIONE"] or ""
                        annata = r["ANNATA"] or ""
                        prezzo = r["PREZZO"]
                        if prezzo not in (None, "", 0):
                            try:
                                prezzo = f"€ {float(prezzo):.2f}".replace(".", ",")
                            except Exception:
                                prezzo = str(prezzo)
                        else:
                            prezzo = ""

                        # Riga vino con tab stops
                        p = doc.add_paragraph()
                        p.paragraph_format.space_before = Pt(0)
                        p.paragraph_format.space_after = Pt(1)
                        p.paragraph_format.left_indent = Cm(0.5)

                        # Tab stops
                        p.paragraph_format.tab_stops.add_tab_stop(
                            TAB_ANNATA, WD_TAB_ALIGNMENT.CENTER
                        )
                        p.paragraph_format.tab_stops.add_tab_stop(
                            TAB_PREZZO, WD_TAB_ALIGNMENT.RIGHT
                        )

                        # Descrizione
                        run_desc = p.add_run(desc)
                        run_desc.font.size = Pt(9)

                        # Annata (tab + valore)
                        if annata:
                            run_ann = p.add_run(f"\t{annata}")
                            run_ann.font.size = Pt(9)
                            run_ann.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

                        # Prezzo (tab + valore)
                        if prezzo:
                            run_pr = p.add_run(f"\t{prezzo}")
                            run_pr.font.size = Pt(9)
                            run_pr.bold = True

    return doc
