# @version: v1.0-carta-vini-service
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
    def k_reg(r): return resolve_regione(r)
    def k_prod(r): return r["PRODUTTORE"] or "Produttore sconosciuto"

    html = ""

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        html += f"<h2 class='tipologia'>{tip}</h2>"

        for reg, g2 in groupby(g1, k_reg):
            g2 = list(g2)
            html += f"<h3 class='regione'>{reg}</h3>"

            for prod, g3 in groupby(g2, k_prod):
                g3 = list(g3)
                html += "<div class='producer-block'>"
                html += "<div class='spacer'></div>"
                html += f"<h4 class='produttore'>{prod}</h4>"
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
    def k_reg(r): return resolve_regione(r)
    def k_prod(r): return r["PRODUTTORE"] or "Produttore sconosciuto"

    html = ""

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        html += f"<h2 class='tipologia'>{tip}</h2>"

        for reg, g2 in groupby(g1, k_reg):
            g2 = list(g2)
            html += f"<h3 class='regione'>{reg}</h3>"

            for prod, g3 in groupby(g2, k_prod):
                g3 = list(g3)
                html += "<div class='spacer'></div>"
                html += f"<h4 class='produttore'>{prod}</h4>"
                html += "<table class='vini'><tbody>"

                for r in g3:
                    desc = r["DESCRIZIONE"] or ""
                    annata = r["ANNATA"] or ""
                    prezzo = r["PREZZO"]
                    if prezzo:
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
    def k_reg(r): return resolve_regione(r)

    html = [
        "<div class='toc-page'>",
        "<div class='toc-title'>INDICE</div>"
    ]

    for tip, g1 in groupby(rows, k_tip):
        g1 = list(g1)
        html.append(f"<div class='toc-tipologia'>{tip}</div>")

        seen = set()
        for reg, g2 in groupby(g1, k_reg):
            g2 = list(g2)
            if reg not in seen:
                seen.add(reg)
                html.append(f"<div class='toc-regione'>· {reg}</div>")

        html.append("<div class='toc-spacer'></div>")

    html.append("</div>")
    return "".join(html)
