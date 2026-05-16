"""
TRGB — Parser PDF F24 "Bozza Entratel" (G.3 Fase E, 2026-05-16)

Estrae i dati di un Modello F24 dal PDF Entratel che il consulente paghe
genera ogni mese. Un singolo PDF F24 può contenere più "moduli F24"
(una pagina = una delega di pagamento autonoma) — sono raggruppati nella
stessa scadenza ma trattati come deleghe separate.

LAYOUT PDF:
  Il PDF è un template fisso (preamble del modulo F24 vuoto) con i dati
  compilati nelle ultime ~20-30 righe della pagina. I dati vivono nelle
  sezioni:
    SEZIONE ERARIO       — IRPEF, ritenute (codici 1001, 1040, 1704, ...)
    SEZIONE INPS         — DM10, EBTU, EST1, C10 (con matricola INPS)
    SEZIONE REGIONI      — Addizionale regionale 3802 (con codice regione)
    SEZIONE TRIBUTI LOCALI — Addizionali comunali 3847/3848 (codice catastale)
    SEZIONE INAIL        — Codice tributo INAIL 13100

FORMATO IMPORTI:
  Gli importi nelle bozze Entratel sono "compressi": le virgole sono
  rimosse e gli ultimi 2 caratteri rappresentano sempre i centesimi.
  Es:  "9000"     → 90,00 €
       "20835"    → 208,35 €
       "1.41247"  → 1.412,47 €  (il punto è separatore migliaia)
       "5.30553"  → 5.305,53 €

ESEMPIO DATI F24 stipendi Aprile 2026 (3GOBBI_F24_4.pdf pag.2):
  Erario:
    6781 2025                 →  -375,86  (credito IRPEF mese prec.)
    1704 12 2025              →  -799,57  (compensazione)
    1001 04 2026              →  1.412,47 (IRPEF dipendenti dovuta)
  INPS:
    DM10  1213048807 04 2026  →  4.628,00 (INPS dipendenti)
    C10   24122 BERGAMO 04 2026 → 592,00 (INPS collaboratori)
  Regioni:
    10 3802 04 2025           →  116,65   (add. regionale Lombardia 2025)
  Comuni:
    A794 3847 04 2026         →  14,30    (Bergamo acconto 2026)
  INAIL:
    13100 19667632 P 902026   →  208,35

USO:
    from app.services.f24_parser import parse_f24_pdf
    data = parse_f24_pdf("/path/to/3GOBBI_F24_4.pdf")
    # data = {
    #   "fonte_pdf": "...", "fonte_hash": "sha256...",
    #   "deleghe": [
    #     {  "pagina": 1, "data_scadenza": "2026-05-18",
    #        "saldo_finale": 90.0,
    #        "righe": [ {sezione, codice_tributo, periodo_rif_anno, periodo_rif_mese,
    #                    importo_debito, importo_credito, ...}, ... ]
    #     }, ...
    #   ],
    #   "warnings": [...]
    # }

NB: il parser non scrive su DB. Lo fa il chiamante.
"""

import hashlib
import re
from pathlib import Path
from typing import Optional

import pdfplumber


MESI_IT = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4,
    "maggio": 5, "giugno": 6, "luglio": 7, "agosto": 8,
    "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}


# Codici tributo che sono SEMPRE in colonna credito (compensazioni)
# nelle bozze Entratel F24: il PDF mostra l'importo nella colonna destra
# senza "-" esplicito, ma logicamente è un credito che compensa il debito.
CODICI_CREDITO = {
    "1704",  # Compensazione IRPEF anni precedenti (credito riportato)
    "6781",  # Credito IRPEF mese precedente
    "6731",  # Credito IRES (compensazione)
    # NB: 1001/1040/1002/1075/1012 restano sempre a debito (IRPEF dovuta)
}


# Mapping codice tributo → descrizione human-readable
CODICI_TRIBUTO_LABEL = {
    # Erario
    "1001": "IRPEF dipendenti",
    "1002": "IRPEF assimilati",
    "1004": "IRPEF lavoratori sportivi",
    "1012": "Imposta sost. premi produttività",
    "1040": "Ritenute redditi lavoro autonomo",
    "1075": "Imposta sostitutiva incrementi produttività",
    "1704": "Compensazione IRPEF anni precedenti",
    "6781": "Credito IRPEF mese precedente",
    # Regioni
    "3802": "Addizionale regionale IRPEF",
    # Comuni
    "3847": "Addizionale comunale acconto",
    "3848": "Addizionale comunale saldo",
    # INPS (codici causale)
    "DM10": "INPS dipendenti (DM10)",
    "C10": "INPS collaboratori/amministratori",
    "EBTU": "Ente Bilaterale Turismo",
    "EST1": "Ente Sanitario Integrativo Turismo",
    # INAIL
    "13100": "INAIL premio + addizionale",
}


# ─────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────

def _sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _entratel_to_euro(s: Optional[str]) -> Optional[float]:
    """Converte importo F24 Entratel compresso (es. '9000', '1.41247')
    in float euro: rimuove '.', divide per 100.
    None / vuoto / non-numerico → None."""
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    # Rimuove segno '-' (verrà gestito a parte se serve)
    negativo = s.endswith("-") or s.startswith("-")
    s = s.replace("-", "").replace(".", "").replace(",", "")
    if not s.isdigit():
        return None
    val = int(s) / 100.0
    return -val if negativo else val


def _parse_data_scadenza(text: str) -> Optional[str]:
    """Cerca 'Scadenza 18 Maggio 2026' → '2026-05-18'.
    Ritorna ISO YYYY-MM-DD o None."""
    m = re.search(r"Scadenza\s+(\d{1,2})\s+(\w+)\s+(\d{4})", text, re.IGNORECASE)
    if not m:
        return None
    giorno = int(m.group(1))
    mese = MESI_IT.get(m.group(2).lower())
    anno = int(m.group(3))
    if mese is None:
        return None
    return f"{anno}-{mese:02d}-{giorno:02d}"


# ─────────────────────────────────────────────────────────────
# RICONOSCIMENTO RIGHE DATI F24
# ─────────────────────────────────────────────────────────────

# Codici tributo Erario (4 cifre)
RE_ERARIO = re.compile(
    r"^(?P<codice>\d{4})\s+(?:(?P<mese_rif>\d{2})\s+)?(?P<anno_rif>\d{4})\s+(?P<imp1>[\d.]+)(?:-)?(?:\s+(?P<imp2>[\d.]+-?))?(?:\s+(?P<imp3>[\d.]+-?))?$"
)

# Sezione INPS: "1200 C10 24122BERGAMO 042026 59200"
#                 sede causale  matricola/dest    periodo importo
RE_INPS = re.compile(
    r"^(?P<sede>\d{4})\s+(?P<causale>C10|DM10|EBTU|EST\d+|RA\d+|TUR\d+)\s+(?P<matricola>\S+)\s+(?P<periodo>\d{6})\s+(?P<importo>[\d.]+)$"
)

# Sezione Regioni: "10 3802 04 2025 11665"
#                  cod_regione cod_tributo mese anno importo
RE_REGIONI = re.compile(
    r"^(?P<cod_regione>\d{1,2})\s+(?P<codice>\d{4})\s+(?P<mese_rif>\d{2})\s+(?P<anno_rif>\d{4})\s+(?P<importo>[\d.]+)$"
)

# Sezione Comuni: "A794 3847 04 2026 1430"
#                 cod_catastale cod_tributo mese anno importo
RE_COMUNI = re.compile(
    r"^(?P<cod_comune>[A-Z]\d{3})\s+(?P<codice>\d{4})\s+(?P<mese_rif>\d{2})\s+(?P<anno_rif>\d{4})\s+(?P<importo>[\d.]+)$"
)

# Sezione INAIL: "13100 19667632 27 902026 P 20835"
RE_INAIL = re.compile(
    r"^(?P<cod_sede>\d{5})\s+(?P<cod_ditta>\d+)\s+(?P<cc>\d+)\s+(?P<periodo>\d{6})\s+(?P<causale>\w+)\s+(?P<importo>[\d.]+)$"
)


def _parse_riga_erario(line: str) -> Optional[dict]:
    """Erario: codice 4-cifre + (mese)? anno + 1-3 importi.
    Esempi:
      "6781 2025 37586"             → credito 375,86
      "1704 12 2025 79957"          → credito 799,57
      "1001 04 2026 1.41247"        → debito 1.412,47
      "1.41247 1.61328- 20081"      → riga di TOTALE A B SALDO (skip)
    Quando si trovano 2 importi: il primo è debito, il secondo è credito.
    Quando 3: sono totale_debito, totale_credito, saldo (skip).
    """
    parts = line.strip().split()
    if not parts:
        return None
    # Codice 4 cifre?
    if not re.match(r"^\d{4}$", parts[0]):
        return None

    codice = parts[0]
    rest = parts[1:]

    # Cerco mese + anno
    mese_rif = None
    anno_rif = None
    idx = 0
    if idx < len(rest) and re.match(r"^\d{1,2}$", rest[idx]) and int(rest[idx]) <= 12:
        # Potrebbe essere il mese
        if idx + 1 < len(rest) and re.match(r"^\d{4}$", rest[idx + 1]):
            mese_rif = int(rest[idx])
            anno_rif = int(rest[idx + 1])
            idx += 2
        elif re.match(r"^\d{4}$", rest[idx]):
            anno_rif = int(rest[idx])
            idx += 1
    elif idx < len(rest) and re.match(r"^\d{4}$", rest[idx]):
        anno_rif = int(rest[idx])
        idx += 1

    importi = rest[idx:]

    # Filtra righe spurie (es. "1.41247 1.61328- 20081" = riga saldo)
    # → quando codice è 4 cifre ma seguito da importi che sembrano saldo grezzo
    # Riconoscibile dal fatto che non c'è anno_rif tra il codice e gli importi
    if anno_rif is None and len(importi) > 1:
        return None

    if not importi:
        return None

    # Determina importo a debito / credito
    importo_debito = 0.0
    importo_credito = 0.0
    if len(importi) == 1:
        # Regola: il codice tributo determina debito vs credito.
        # - Codici in CODICI_CREDITO (1704, 6781, ...) → sempre credito.
        # - Segno '-' esplicito → credito.
        # - Altrimenti → debito.
        val = _entratel_to_euro(importi[0]) or 0.0
        if codice in CODICI_CREDITO or importi[0].endswith("-"):
            importo_credito = val
        else:
            importo_debito = val
    elif len(importi) >= 2:
        importo_debito = _entratel_to_euro(importi[0]) or 0.0
        importo_credito = _entratel_to_euro(importi[1]) or 0.0

    return {
        "sezione": "ERARIO",
        "codice_tributo": codice,
        "descrizione_tributo": CODICI_TRIBUTO_LABEL.get(codice),
        "periodo_rif_anno": anno_rif,
        "periodo_rif_mese": mese_rif,
        "importo_debito": round(importo_debito, 2),
        "importo_credito": round(importo_credito, 2),
        "saldo": round(importo_debito - importo_credito, 2),
    }


def _parse_riga_inps(line: str) -> Optional[dict]:
    """INPS: '1200 DM10 1213048807 042026 4.62800'
    Periodo è MMYYYY (es. '042026' → mese=04, anno=2026)."""
    m = RE_INPS.match(line.strip())
    if not m:
        return None
    g = m.groupdict()
    periodo = g["periodo"]
    mese_rif = int(periodo[:2])
    anno_rif = int(periodo[2:])
    importo = _entratel_to_euro(g["importo"]) or 0.0
    return {
        "sezione": "INPS",
        "codice_tributo": g["causale"],
        "descrizione_tributo": CODICI_TRIBUTO_LABEL.get(g["causale"]),
        "codice_sede": g["sede"],
        "matricola_inps": g["matricola"],
        "codice_ente": g["causale"],
        "periodo_rif_anno": anno_rif,
        "periodo_rif_mese": mese_rif,
        "importo_debito": importo,
        "importo_credito": 0.0,
        "saldo": importo,
    }


def _parse_riga_regioni(line: str) -> Optional[dict]:
    """Regioni: '10 3802 04 2025 11665'"""
    m = RE_REGIONI.match(line.strip())
    if not m:
        return None
    g = m.groupdict()
    # Filtro: codice_tributo deve essere ~regionale (3802) e codice regione 1-20
    if g["codice"] not in ("3802",):
        return None
    if not (1 <= int(g["cod_regione"]) <= 20):
        return None
    importo = _entratel_to_euro(g["importo"]) or 0.0
    return {
        "sezione": "REGIONI",
        "codice_tributo": g["codice"],
        "descrizione_tributo": CODICI_TRIBUTO_LABEL.get(g["codice"]),
        "codice_regione": g["cod_regione"],
        "periodo_rif_anno": int(g["anno_rif"]),
        "periodo_rif_mese": int(g["mese_rif"]),
        "importo_debito": importo,
        "importo_credito": 0.0,
        "saldo": importo,
    }


def _parse_riga_comuni(line: str) -> Optional[dict]:
    """Comuni: 'A794 3847 04 2026 1430'
    Codice catastale = 1 lettera + 3 cifre (A794 Bergamo, C937 Comun Nuovo,
    D221 Curno, E769 Luvinate)."""
    m = RE_COMUNI.match(line.strip())
    if not m:
        return None
    g = m.groupdict()
    if g["codice"] not in ("3847", "3848"):
        return None
    importo = _entratel_to_euro(g["importo"]) or 0.0
    return {
        "sezione": "IMU_TRIBUTI_LOCALI",
        "codice_tributo": g["codice"],
        "descrizione_tributo": CODICI_TRIBUTO_LABEL.get(g["codice"]),
        "codice_comune": g["cod_comune"],
        "periodo_rif_anno": int(g["anno_rif"]),
        "periodo_rif_mese": int(g["mese_rif"]),
        "importo_debito": importo,
        "importo_credito": 0.0,
        "saldo": importo,
    }


def _parse_riga_inail(line: str) -> Optional[dict]:
    """INAIL: '13100 19667632 27 902026 P 20835'
       cod_sede cod_ditta cc periodo causale importo"""
    m = RE_INAIL.match(line.strip())
    if not m:
        return None
    g = m.groupdict()
    importo = _entratel_to_euro(g["importo"]) or 0.0
    # Periodo nel formato 902026 → potrebbe essere "90"+anno (autoliquidazione)
    periodo = g["periodo"]
    anno_rif = int(periodo[-4:]) if len(periodo) >= 4 else None
    return {
        "sezione": "INAIL",
        "codice_tributo": g["cod_sede"],
        "descrizione_tributo": CODICI_TRIBUTO_LABEL.get(g["cod_sede"], "INAIL"),
        "codice_sede": g["cod_sede"],
        "matricola_inps": g["cod_ditta"],  # cod_ditta INAIL nel campo matricola
        "periodo_rif_anno": anno_rif,
        "periodo_rif_mese": None,
        "importo_debito": importo,
        "importo_credito": 0.0,
        "saldo": importo,
    }


# ─────────────────────────────────────────────────────────────
# PARSING PAGINA
# ─────────────────────────────────────────────────────────────

def _parse_pagina(text: str, pagina_n: int) -> Optional[dict]:
    """Estrae una singola delega F24 da una pagina.
    Ritorna None se la pagina non contiene dati (template vuoto)."""
    data_scadenza = _parse_data_scadenza(text)

    righe = []
    saldo_finale_pagina = None

    # Le righe dati sono dopo "TRE GOBBI S.R.L." (azienda) e prima di "Scadenza"
    # oppure dopo "BERGAMO BG VIA BROSETA"
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    in_data_section = False
    for line in lines:
        # Inizia la sezione dati dopo l'indirizzo azienda
        if "BROSETA" in line.upper() or "TRE GOBBI" in line.upper():
            in_data_section = True
            continue
        # Termina alla scadenza
        if line.startswith("Scadenza") or "1a COPIA" in line:
            break
        if not in_data_section:
            continue

        # Skip righe template / spurie
        if not line:
            continue
        if "EURO" in line and "+" in line:
            continue
        # Riga saldo intermedio "11665 + 11665" o "9000 + 9000"
        if re.match(r"^[\d.]+\s+\+\s+[\d.]+$", line):
            # Non è una riga dato — è un totale di sezione
            continue
        # Riga totale finale solitaria "5.48390" o "9000"
        if re.match(r"^[\d.]+$", line):
            # Singolo numero: potrebbe essere il saldo finale della delega
            val = _entratel_to_euro(line)
            if val and (saldo_finale_pagina is None or val > saldo_finale_pagina):
                saldo_finale_pagina = val
            continue
        # Riga "0 5 2 0 2 6" (data versamento) o "0 4 0 6 2 6 4 0 1 6 6" (CF):
        # tutti i token sono singole cifre. Skip.
        # ATTENZIONE: NON usare `^[\d\s]+$` perché matcherebbe anche righe dati
        # legittime come "6781 2025 37586" (codice + anno + importo).
        if all(re.match(r"^\d$", t) for t in line.split()):
            continue
        # Riga "0 5 2 0 2 6 05034 11102" — singole cifre spaziate + altri token
        # Riga ABI/CAB "81L0503411102000000012200" — un solo token alfanumerico
        if re.match(r"^[0-9A-Z]{20,}$", line):
            continue

        # Tenta i 5 parser nell'ordine: erario, INPS, regioni, comuni, INAIL
        for parser in [_parse_riga_erario, _parse_riga_inps,
                       _parse_riga_regioni, _parse_riga_comuni,
                       _parse_riga_inail]:
            r = parser(line)
            if r is not None:
                r["pagina_pdf"] = pagina_n
                righe.append(r)
                break

    if not righe:
        return None  # pagina template senza dati

    # Saldo come somma dei saldi delle righe
    saldo_calc = round(sum(r.get("saldo", 0) or 0 for r in righe), 2)

    # Anno/mese di competenza: il più frequente fra le righe (di solito coincide
    # col mese di lavoro, es. Aprile 2026 per stipendi)
    from collections import Counter
    ym = [(r["periodo_rif_anno"], r["periodo_rif_mese"])
          for r in righe
          if r["periodo_rif_anno"] and r["periodo_rif_mese"]]
    anno_comp, mese_comp = (None, None)
    if ym:
        anno_comp, mese_comp = Counter(ym).most_common(1)[0][0]

    return {
        "pagina_pdf": pagina_n,
        "data_scadenza": data_scadenza,
        "anno_competenza": anno_comp,
        "mese_competenza": mese_comp,
        "saldo_finale": saldo_finale_pagina,
        "saldo_calcolato": saldo_calc,
        "righe": righe,
    }


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────

def parse_f24_pdf(pdf_path: str | Path) -> dict:
    """
    Parsea un PDF Modello F24 (Bozza Entratel) ed estrae:
      - una lista di "deleghe" (una per pagina compilata)
      - per ogni delega: data_scadenza, anno_competenza, mese_competenza,
        saldo, lista righe (sezione, codice tributo, periodo, importi)
      - fonte_hash (sha256, anti-doppio import)

    Solleva FileNotFoundError se path non esiste.
    Non scrive su DB.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"F24 pdf non trovato: {pdf_path}")

    result = {
        "fonte_pdf": pdf_path.name,
        "fonte_hash": _sha256_file(pdf_path),
        "deleghe": [],
        "warnings": [],
    }

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            delega = _parse_pagina(text, i)
            if delega is not None:
                result["deleghe"].append(delega)

    if not result["deleghe"]:
        result["warnings"].append("nessuna delega F24 con dati trovata nel PDF")

    return result
