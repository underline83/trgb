# Modulo: clienti (sub-modulo preventivi) — [core]
# -*- coding: utf-8 -*-
"""
PDF del preventivo per il cliente, nello stile del «menù gruppi» stampato
(2026-10-19). Usa il mattone M.B (pdf_brand.genera_pdf_html) con un template
proprio, A5, senza intestazione TRGB.

Pagine: copertina (logo del locale) → una pagina per menù → «Extra» (solo se
ci sono righe extra) → pagine di testo (note per il cliente e condizioni) →
retro. Niente pagina di riepilogo né totale (decisione di Marco, 2026-10-19):
il cliente legge il prezzo a persona di ogni menù.

Font: Bodoni Moda (titoli, prezzi) e Courier Prime (piatti, testi), in
static/fonts/ — entrambi OFL. Logo: locali/<locale>/assets/pdf/logo.svg; se
manca, il nome del locale in Bodoni.

Testo di condizioni e note (mini-markup, così le pagine «Dolci» e «Note» del
menù stampato si scrivono dal gestionale senza toccare il codice):
    # TITOLO          → nuova pagina con quel titolo
    ## VOCE           → riga maiuscola spaziata (come un piatto); le righe
                        subito sotto, senza riga vuota, sono la sua descrizione
    @dolci_carta      → i dolci della carta in corso (Menu Carta), uno per riga
    == 25 | nota      → prezzo grande con la nota sotto
    **grassetto**     → grassetto
    riga vuota        → nuovo paragrafo
"""

from __future__ import annotations

import html
import re
from datetime import datetime
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
_FONTS = _REPO / "static" / "fonts"

GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
        "agosto", "settembre", "ottobre", "novembre", "dicembre"]
OPZIONI = "ABCDEFGHIJ"


def _num(v) -> str:
    """50 → «50», 52.5 → «52,50», 1040 → «1.040»."""
    v = round(float(v or 0), 2)
    if v == int(v):
        return f"{int(v):,}".replace(",", ".")
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _data(iso: str | None) -> datetime | None:
    try:
        return datetime.strptime(iso or "", "%Y-%m-%d")
    except ValueError:
        return None


def _nome_menu(nome: str | None) -> str:
    """«Menù gruppi Quadri» → «Quadri»: in pagina c'è già «Menù» sopra."""
    n = (nome or "").strip()
    n = re.sub(r"^men[uù]\s+(gruppi\s+)?", "", n, flags=re.I).strip()
    return "" if n.lower() in ("", "menu", "menù") else n


def _prezzo_menu(m: dict) -> tuple[str, str]:
    """(numero grande, nota) al netto dello sconto menu. Mai i prezzi dei piatti."""
    sconto = float(m.get("sconto") or 0)
    if m.get("pricing_mode") == "corpo" and m.get("doppio_prezzo"):
        esc = max(0.0, float(m.get("prezzo_corpo") or 0) - sconto)
        inc = max(0.0, float(m.get("prezzo_corpo_vino") or 0) - sconto)
        return f"{_num(esc)}/{_num(inc)}", "vino escluso/incluso"
    return _num(m.get("prezzo_persona") or 0), "a persona"


def _inline(testo: str) -> str:
    t = html.escape(testo)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)


def _pagine_testo(testo: str | None, titolo_default: str = "",
                  dolci_carta: list[str] | None = None) -> list[dict]:
    """Mini-markup → pagine [{titolo, blocchi:[{tipo, html|num|nota, dettagli}]}].
    Le righe semplici subito sotto una «## VOCE» (senza riga vuota in mezzo)
    sono la sua descrizione. «@dolci_carta» diventa l'elenco dei dolci della
    carta in corso (una voce per dolce)."""
    if not (testo or "").strip():
        return []
    pagine: list[dict] = []
    cur = {"titolo": titolo_default, "blocchi": []}
    par: list[str] = []
    voce_aperta = False          # l'ultima riga era una voce (o una sua descrizione)

    def chiudi_par():
        if par:
            cur["blocchi"].append({"tipo": "p", "html": "<br>".join(_inline(x) for x in par)})
            par.clear()

    def voce(html_):
        cur["blocchi"].append({"tipo": "voce", "html": html_, "dettagli": []})

    for raw in testo.replace("\r\n", "\n").split("\n"):
        riga = raw.strip()
        if riga.startswith("# "):
            chiudi_par()
            if cur["blocchi"]:
                pagine.append(cur)
            cur = {"titolo": riga[2:].strip(), "blocchi": []}
            voce_aperta = False
        elif riga.startswith("## "):
            chiudi_par()
            voce(_inline(riga[3:].strip()))
            voce_aperta = True
        elif riga == "@dolci_carta":
            chiudi_par()
            for nome in dolci_carta or []:
                voce(html.escape(nome))
            voce_aperta = False
        elif riga.startswith("=="):
            chiudi_par()
            num, _, nota = riga[2:].partition("|")
            cur["blocchi"].append({"tipo": "prezzo", "num": num.strip(), "nota": nota.strip()})
            voce_aperta = False
        elif not riga:
            chiudi_par()
            voce_aperta = False
        elif voce_aperta:
            cur["blocchi"][-1]["dettagli"].append(_inline(riga))
        else:
            par.append(riga)
    chiudi_par()
    if cur["blocchi"]:
        pagine.append(cur)
    return pagine


def _logo_svg() -> str | None:
    try:
        from app.utils.locale_data import locale_data_dir
        p = locale_data_dir().parent / "assets" / "pdf" / "logo.svg"
        if p.exists():
            s = p.read_text(encoding="utf-8")
            return re.sub(r"^<\?xml[^>]*\?>\s*", "", s)
    except Exception:  # noqa: BLE001 — senza logo si usa il nome
        pass
    return None


def dati_pdf_menu(prev: dict, dolci_carta: list[str] | None = None) -> dict:
    """Dati già pronti per il template preventivo_menu.html.
    dolci_carta: nomi dei dolci della carta in corso, per «@dolci_carta»."""
    d = _data(prev.get("data_evento"))
    cliente = " ".join(x for x in [(prev.get("cliente_nome") or "").strip(),
                                    (prev.get("cliente_cognome") or "").strip()] if x)

    info = []
    if prev.get("n_persone"):
        info.append(f"{prev['n_persone']} persone")
    if prev.get("ora_evento"):
        info.append(f"ore {prev['ora_evento']}")
    cover = {
        "titolo": ["PROPOSTA", "MENÙ"],
        "per": f"per {cliente}" if cliente else "",
        "data": f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]} {d.year}" if d else "",
        "info": " · ".join(info),
        "numero": prev.get("numero") or "",
    }

    tutti = [m for m in prev.get("menu_list") or [] if m.get("righe")]
    scelto = prev.get("menu_scelto_id")
    menus = []
    for i, m in enumerate(tutti):
        if scelto and len(tutti) > 1 and m["id"] != scelto:
            continue
        nome = _nome_menu(m.get("nome"))
        if not nome and len(tutti) > 1 and not scelto:
            nome = f"Opzione {OPZIONI[i] if i < len(OPZIONI) else i + 1}"
        prezzo, nota = _prezzo_menu(m)
        menus.append({
            "kicker": "Menù",
            "nome": nome,
            "piatti": [
                {"nome": r.get("name") or "",
                 "dettagli": [x.strip() for x in re.split(r"\s+·\s+|\n", r.get("description") or "") if x.strip()]}
                for r in m["righe"]
            ],
            "prezzo": prezzo,
            "prezzo_nota": nota,
        })

    extra = []
    for r in prev.get("righe") or []:
        desc = (r.get("descrizione") or "").strip()
        if not desc:
            continue
        if r.get("tipo_riga") == "nota":
            extra.append({"descrizione": desc, "importo": ""})
            continue
        qta = float(r.get("qta") or 0)
        pu = float(r.get("prezzo_unitario") or 0)
        segno = "−" if r.get("tipo_riga") == "sconto" else ""
        if qta != 1:
            q = int(qta) if qta == int(qta) else qta
            desc = f"{desc} ({q} × {_num(pu)})"
        extra.append({"descrizione": desc, "importo": f"{segno}{_num(qta * pu)} €"})

    note_cliente = _pagine_testo(prev.get("note_cliente"), "NOTE")

    return {
        "cover": cover,
        "menus": menus,
        "extra": extra,
        "pagine_testo": note_cliente + _pagine_testo(prev.get("condizioni"), "NOTE", dolci_carta),
        "logo_svg": _logo_svg(),
        "css_font": css_font_face(),
    }


def css_font_face() -> str:
    """@font-face nel <style> del documento: WeasyPrint carica i font web solo dai
    fogli del documento (quelli passati a parte vogliono un FontConfiguration
    che pdf_brand non usa)."""
    f = _FONTS.as_uri()
    return f"""
    @font-face {{ font-family: "Bodoni Moda"; font-weight: 400; src: url("{f}/BodoniModa-Regular.ttf"); }}
    @font-face {{ font-family: "Bodoni Moda"; font-weight: 700; src: url("{f}/BodoniModa-Bold.ttf"); }}
    @font-face {{ font-family: "Courier Prime"; font-weight: 400; src: url("{f}/CourierPrime-Regular.ttf"); }}
    @font-face {{ font-family: "Courier Prime"; font-weight: 700; src: url("{f}/CourierPrime-Bold.ttf"); }}
    """


def css_pdf_menu() -> str:
    return f"""
    @page {{
        size: A5 portrait;
        margin: 0;
        @bottom-left {{ content: none; }}
        @bottom-right {{ content: none; }}
    }}
    html, body {{ margin: 0; padding: 0; background: #fff; color: #262728; }}
    body {{ font-family: "Courier Prime", "Courier New", monospace; font-size: 9pt; }}

    .pg {{ position: relative; width: 148mm; height: 209.9mm; box-sizing: border-box;
           padding: 15mm 8mm 14mm; text-align: center; page-break-after: always; overflow: hidden; }}
    .pg:last-child {{ page-break-after: auto; }}

    /* copertina e retro: logo a metà pagina come nel menù stampato */
    .cover-logo {{ width: 76mm; margin: 0 auto; }}
    .cover-logo svg {{ width: 100%; height: auto; display: block; }}
    .logo-testo {{ font-family: "Bodoni Moda", serif; font-size: 28pt; letter-spacing: .18em; }}
    .cover .cover-logo {{ margin-top: 72mm; }}
    .retro .cover-logo {{ margin-top: 74mm; }}
    .cover-title {{ margin-top: 20mm; font-family: "Bodoni Moda", serif; font-weight: 700;
                    font-size: 23pt; line-height: 1.25; letter-spacing: .34em; padding-left: .34em; }}
    .cover-per {{ margin-top: 6mm; font-family: "Bodoni Moda", serif; font-weight: 700;
                  font-size: 12pt; letter-spacing: .5em; padding-left: .5em; }}
    .cover-data {{ margin-top: 2.5mm; font-family: "Bodoni Moda", serif; font-weight: 700;
                   font-size: 14pt; letter-spacing: .2em; padding-left: .2em; color: #b4532a; }}
    .cover-info {{ margin-top: 3mm; font-size: 9pt; letter-spacing: .25em; text-transform: uppercase; }}
    .cover-numero {{ position: absolute; left: 0; right: 0; bottom: 9mm; font-size: 6.5pt;
                     letter-spacing: .2em; color: #9a9a9a; }}

    /* pagina menù */
    .menu-head {{ font-family: "Bodoni Moda", serif; font-weight: 700; }}
    .menu-kicker {{ font-size: 23pt; letter-spacing: .14em; padding-left: .14em; line-height: 1.1; }}
    .menu-nome {{ margin-top: 4mm; font-size: 29pt; letter-spacing: .14em; padding-left: .14em;
                  line-height: 1.1; text-transform: uppercase; }}
    .menu-piatti {{ margin-top: 15mm; padding: 0 3mm; }}
    .piatto {{ margin-bottom: 7mm; }}
    .piatto-nome {{ font-size: 13.4pt; line-height: 1.4; letter-spacing: .17em; padding-left: .17em;
                    text-transform: uppercase; }}
    .piatto-det {{ font-size: 10.6pt; line-height: 1.4; letter-spacing: .06em; }}

    .prezzo {{ position: absolute; left: 0; right: 0; bottom: 21mm; }}
    .prezzo-inline {{ margin: 8mm 0 2mm; }}
    .testo-corpo .prezzo-inline:last-child {{ position: absolute; left: 0; right: 0; bottom: 21mm; margin: 0; }}
    .prezzo-num {{ font-family: "Bodoni Moda", serif; font-weight: 700; font-size: 28pt; letter-spacing: .02em; line-height: 1; }}
    .prezzo-nota {{ margin-top: 2.5mm; font-family: "Bodoni Moda", serif; font-weight: 700;
                    font-size: 8pt; letter-spacing: .16em; }}

    /* pagine di testo: extra, dolci, note */
    .testo-titolo {{ margin-top: 3mm; font-family: "Bodoni Moda", serif; font-weight: 700; font-size: 29pt;
                     letter-spacing: .14em; padding-left: .14em; line-height: 1.1; text-transform: uppercase; }}
    .testo-corpo {{ margin-top: 17mm; font-size: 11.4pt; line-height: 1.42; letter-spacing: .05em; }}
    .testo-corpo .voce {{ margin: 0 0 6.5mm; }}
    .voce-nome {{ font-size: 12.4pt; line-height: 1.4; letter-spacing: .16em; padding-left: .16em; text-transform: uppercase; }}
    .voce-det {{ font-size: 10.2pt; line-height: 1.4; letter-spacing: .04em; }}
    .testo-corpo .par + .voce {{ margin-top: 7mm; }}
    .testo-corpo .par {{ margin: 0 0 5mm; }}
    .extra {{ margin: 8mm auto 6mm; width: 112mm; text-align: left; font-size: 9.6pt; }}
    .extra-riga {{ display: flex; justify-content: space-between; border-bottom: .3pt solid #c9c9c9; padding: 1.5mm 0; }}
    .extra-imp {{ white-space: nowrap; padding-left: 4mm; }}
    """


def genera_pdf_menu(prev: dict, dolci_carta: list[str] | None = None) -> bytes:
    from app.services.pdf_brand import genera_pdf_html
    return genera_pdf_html(
        template="preventivo_menu.html",
        dati=dati_pdf_menu(prev, dolci_carta),
        titolo=f"Proposta {prev.get('numero') or ''}".strip(),
        css_extra=css_pdf_menu(),
    )
