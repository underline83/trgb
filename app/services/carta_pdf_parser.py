# Modulo: banca
"""
TRGB — Parser estratto conto carta di credito BANCO BPM.

Riceve un PDF Banco BPM "Estratto carta", restituisce un dict strutturato
con anagrafica carta, header estratto, lista movimenti dettagliati e flag
`quadra` per il sanity check di chiusura.

NESSUNA scrittura su DB: questa funzione è solo parse + validate. L'ingestione
nel DB (banca_movimenti / carta_estratti / carte_credito) avviene in CC.2,
dentro al router /banca/carta/upload.

USO STANDALONE (per dev / test):
    python -m app.services.carta_pdf_parser path/to/estratto.pdf
    # stampa JSON su stdout

DIPENDENZA RUNTIME:
    pdftotext (poppler-utils) deve essere installato sul VPS.
    Sul VPS Aruba: già presente (`which pdftotext` → /usr/bin/pdftotext).

FORMATO PDF ATTESO (Banco BPM, "Carta Business" su CC TRE GOBBI 000000012200):
    Pagina 1   — Header rendiconto: codice posizione, totali, valuta addebito, CC.
    Pagina 2   — Riepilogo carta + inizio Dettaglio Operazioni.
    Pagina 3   — Continuazione dettaglio + TOTALE SPESE.
    Pagina 4   — Prospetto Statistico per categoria.

Le righe del dettaglio possono essere "normali" (in EUR) o "estere":
    Normale:  COD_RIF(23 cifre) MCC(8 cifre) GG/MM/AAAA GG/MM/AAAA DESCRIZIONE   IMPORTO
    Estera:   COD_RIF MCC DATE DATE DESCRIZIONE  IMP_ESTERO VAL CAMBIO IMP_EUR
              + riga successiva: "MAGG. CIRCUITO € X,XX MAGG. CAMBIO € Y,YY"

Versione: 0.1 (2026-06-02)
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Optional


# ─────────────────────────────────────────────────────────────────────
# Regex di parsing
# ─────────────────────────────────────────────────────────────────────

# Importo italiano: "1.234,56" o "1,20" o "12345,67" (sempre 2 decimali)
_IMP = r"[\d.]+,\d{2}"
# Cambio valuta: 5 decimali fissi (osservato sui 6 PDF di sample)
_CAMBIO = r"[\d.]+,\d{5}"
# Codice valuta ISO 4217 (USD, GBP, CHF, ...)
_VAL = r"[A-Z]{3}"
# Data italiana
_DATA = r"\d{2}/\d{2}/\d{4}"

# Riga movimento "normale" (solo EUR)
RIGA_NORMALE = re.compile(
    rf"^\s*(\d{{23}})\s+(\d{{8}})\s+({_DATA})\s+({_DATA})\s+(.+?)\s+({_IMP})\s*$"
)

# Riga movimento "estera" (valuta originale + cambio + importo in euro)
RIGA_ESTERA = re.compile(
    rf"^\s*(\d{{23}})\s+(\d{{8}})\s+({_DATA})\s+({_DATA})\s+"
    rf"(.+?)\s+({_IMP})\s+({_VAL})\s+({_CAMBIO})\s+({_IMP})\s*$"
)

# Riga "MAGG. CIRCUITO ... MAGG. CAMBIO ..." che segue una riga estera
RIGA_MAGG = re.compile(
    rf"MAGG\.\s+CIRCUITO\s+€\s+({_IMP})\s+MAGG\.\s+CAMBIO\s+€\s+({_IMP})"
)

# Header — pattern per valori che appaiono in formato "label-su-riga, valore-su-riga-successiva"
# Il PDF Banco BPM ha un layout colonnare a 3 colonne con barcode/junk frapposto tra le righe.
# Strategia: cerco la label, poi nel chunk successivo (max ~300 char ≈ 3 righe utili) il pattern del valore.
RE_DATA_CHIUSURA = re.compile(r"Data chiusura rendiconto\s*\n\s*(\d{2}\.\d{2}\.\d{4})")
RE_IMPORTO_ADDEBITATO = re.compile(rf"Importo addebitato:.*?\n.*?({_IMP})", re.DOTALL)
RE_CARTA_NUMERO = re.compile(r"Carta N:\s*(\d{4}\s+\d{2}\*{2}\s+\*{4}\s+\*\d{3})")
RE_INTESTATARIO = re.compile(r"Cognome Nome:\s*([A-ZÀ-Ÿ' ]+?)\s{2,}", re.IGNORECASE)
RE_CODICE_TITOLARE = re.compile(r"Codice Titolare\s+(\d{6,12})")
RE_FIDO = re.compile(r"Fido mensile:\s*([\d.]+)")

# Pattern di valore per _find_value_after_label
RE_VAL_NUM6_15 = re.compile(r"\b(\d{6,15})\b")
RE_VAL_NUM5 = re.compile(r"\b(\d{5})\b")
RE_VAL_NUM11 = re.compile(r"\b(\d{11})\b")
RE_VAL_DATA = re.compile(r"\b(\d{2}\.\d{2}\.\d{4})\b")
# Numero italiano: "1.234,56" o "3.000" o "12345". Punto è separatore migliaia, virgola decimali.
RE_VAL_IMP = re.compile(r"(\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\b)")
# Testo aziendale: ragione sociale "ALL CAPS S.R.L." (può essere seguita da spazi+altro come "CAB:").
# Prima lettera DEVE essere alfabetica (esclude codici barcode numerici tipo "70007446701067083").
RE_VAL_RAGIONE_SOCIALE = re.compile(r"^\s{2,}([A-Z][A-Z0-9. ,&'\-/]+?)(?:\s{2,}|\s*$)", re.MULTILINE)

# Riepilogo posizione (chiave: valore in colonna importi)
RE_RIEPILOGO_LINE = re.compile(rf"^(.+?)\s{{2,}}({_IMP})\s*$")

# Linee del riepilogo posizione che ci interessano
RIEPILOGO_KEYS = {
    "DEBITO RESIDUO PERIODO PRECEDENTE": "debito_residuo_precedente",
    "TOTALE ADDEBITATO SUL PRECEDENTE E/C": "totale_addebitato_precedente",
    "TOTALE MOVIMENTI": "totale_movimenti",
    "IMPOSTA DI BOLLO": "imposta_bollo",
    "ADDEBITO IN CONTO CORRENTE": "addebito_totale_cc",
    "SPESE DI INVIO ESTRATTO CONTO": "spese_invio",
}


# ─────────────────────────────────────────────────────────────────────
# Modelli dati
# ─────────────────────────────────────────────────────────────────────


@dataclass
class CartaInfo:
    codice_posizione: Optional[str] = None
    carta_numero_mask: Optional[str] = None     # "5534 35** **** *623"
    ultime_visibili: Optional[str] = None       # "623"
    intestatario: Optional[str] = None          # "CARMINATI MARCO"
    titolare: Optional[str] = None              # "TRE GOBBI S.R.L."
    codice_titolare: Optional[str] = None
    cc_addebito: Optional[str] = None
    abi: Optional[str] = None
    cab: Optional[str] = None
    piva: Optional[str] = None
    limite: Optional[float] = None


@dataclass
class EstrattoHeader:
    data_chiusura: Optional[str] = None         # ISO "YYYY-MM-DD"
    data_valuta_addebito: Optional[str] = None  # ISO "YYYY-MM-DD"
    debito_residuo_precedente: float = 0.0
    totale_addebitato_precedente: float = 0.0
    totale_movimenti: float = 0.0
    imposta_bollo: float = 0.0
    spese_invio: float = 0.0
    addebito_totale_cc: float = 0.0


@dataclass
class Movimento:
    codice_riferimento: str             # 23 cifre — dedup naturale
    mcc: str                            # 8 cifre — merchant category code (interno BPM)
    data_operazione: str                # ISO
    data_registrazione: str             # ISO
    descrizione: str
    importo: float                      # sempre in EUR, positivo (è una spesa)
    valuta_estera: Optional[str] = None
    importo_estero: Optional[float] = None
    cambio_valuta: Optional[float] = None
    magg_circuito: Optional[float] = None
    magg_cambio: Optional[float] = None


@dataclass
class ParseResult:
    carta: CartaInfo
    estratto: EstrattoHeader
    movimenti: list[Movimento]
    quadra: bool
    delta_quadratura: float             # totale_movimenti - sum(movimenti.importo)
    quadra_addebito: bool
    delta_addebito: float               # addebito_totale_cc - (totale_mov + bollo + spese + residuo - addebitato_prec)
    pdf_filename: Optional[str] = None
    pdf_sha256: Optional[str] = None
    warnings: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────
# Helpers parsing valori
# ─────────────────────────────────────────────────────────────────────


def _imp_to_float(s: str) -> float:
    """'1.234,56' -> 1234.56 ; '1,20' -> 1.20"""
    return float(s.replace(".", "").replace(",", "."))


def _data_to_iso(s: str) -> str:
    """'02.01.2026' o '04/12/2025' -> '2026-01-02' / '2025-12-04'"""
    sep = "." if "." in s else "/"
    gg, mm, aaaa = s.split(sep)
    return f"{aaaa}-{mm}-{gg}"


def _round2(x: float) -> float:
    return round(x + 1e-9, 2)


# ─────────────────────────────────────────────────────────────────────
# PDF → testo
# ─────────────────────────────────────────────────────────────────────


def pdf_to_text(pdf_path: Path) -> str:
    """Estrae testo da PDF mantenendo il layout colonnare (pdftotext -layout)."""
    res = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True, text=True, timeout=30,
    )
    if res.returncode != 0:
        raise RuntimeError(f"pdftotext failed: {res.stderr.strip()}")
    return res.stdout


def _sha256(pdf_path: Path) -> str:
    h = hashlib.sha256()
    with pdf_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ─────────────────────────────────────────────────────────────────────
# Parsing header e riepilogo
# ─────────────────────────────────────────────────────────────────────


def _find_value_after_label(
    text: str,
    label: str,
    value_re: re.Pattern,
    max_chars: int = 350,
    same_line: bool = False,
) -> Optional[str]:
    """Trova il prossimo match di value_re dopo la prima occorrenza di label.

    Default `same_line=False`: salta la riga della label e cerca dalla riga
    successiva. Necessario per layout BPM dove la label sta in COL1 e il
    valore sotto-in-stessa-colonna, mentre sulla stessa riga della label c'è
    il VALORE di un'altra label in COL2 (false positive sicuro).

    Esempio: la riga "Limite utilizzo posizione:    11102" ha "11102" che è il
    CAB della COL2, non il limite (che è "3.000" nella riga successiva).
    """
    idx = text.find(label)
    if idx < 0:
        return None
    start = idx + len(label)
    if not same_line:
        nl = text.find("\n", start)
        if nl < 0:
            return None
        start = nl + 1
    chunk = text[start : start + max_chars]
    m = value_re.search(chunk)
    return m.group(1) if m else None


def _parse_header(text: str) -> tuple[CartaInfo, EstrattoHeader, list[str]]:
    """Estrae anagrafica carta + header estratto dal testo completo."""
    carta = CartaInfo()
    estratto = EstrattoHeader()
    warnings: list[str] = []

    # ── Anagrafica carta ──
    # Codice posizione: cifre 6-15. Prima occorrenza = quella nell'header (la 2a
    # sta in "Riepilogo posizione XXXX" ma essendo trovata DOPO viene scartata).
    if (v := _find_value_after_label(text, "Codice posizione:", RE_VAL_NUM6_15)):
        carta.codice_posizione = v
    if (m := RE_CARTA_NUMERO.search(text)):
        carta.carta_numero_mask = m.group(1)
        ult = re.search(r"\*(\d{3})\s*$", m.group(1))
        if ult:
            carta.ultime_visibili = ult.group(1)
    if (m := RE_INTESTATARIO.search(text)):
        carta.intestatario = m.group(1).strip()
    if (m := RE_CODICE_TITOLARE.search(text)):
        carta.codice_titolare = m.group(1)
    if (v := _find_value_after_label(text, "Conto Corrente:", RE_VAL_NUM6_15)):
        carta.cc_addebito = v
    if (v := _find_value_after_label(text, "ABI:", RE_VAL_NUM5)):
        carta.abi = v
    if (v := _find_value_after_label(text, "CAB:", RE_VAL_NUM5)):
        carta.cab = v
    if (v := _find_value_after_label(text, "P.IVA:", RE_VAL_NUM11)):
        carta.piva = v
    if (v := _find_value_after_label(text, "Limite utilizzo posizione:", RE_VAL_IMP)):
        # "3.000" → 3000.0 ; "3.000,00" → 3000.0
        v_norm = v if "," in v else v + ",00"
        try:
            carta.limite = _imp_to_float(v_norm)
        except ValueError:
            pass
    if (v := _find_value_after_label(text, "Titolare posizione:", RE_VAL_RAGIONE_SOCIALE)):
        carta.titolare = v.strip()

    # ── Date estratto ──
    if (m := RE_DATA_CHIUSURA.search(text)):
        estratto.data_chiusura = _data_to_iso(m.group(1))
    # Valuta di addebito: cerca la prossima data dopo la label (multi-riga, junk frapposto)
    if (v := _find_value_after_label(text, "Valuta di addebito:", RE_VAL_DATA)):
        estratto.data_valuta_addebito = _data_to_iso(v)

    # Riepilogo posizione: scorri ogni riga del PDF, cerca chiave→valore
    for line in text.splitlines():
        m = RE_RIEPILOGO_LINE.match(line)
        if not m:
            continue
        label_raw = m.group(1).strip()
        imp = _imp_to_float(m.group(2))
        # Match diretto su chiavi note
        for label_match, attr in RIEPILOGO_KEYS.items():
            if label_match in label_raw:
                setattr(estratto, attr, imp)
                break

    # Sanity: se mancano campi critici, warning
    if not carta.codice_posizione:
        warnings.append("Codice posizione non trovato — anagrafica carta incompleta")
    if not estratto.data_chiusura:
        warnings.append("Data chiusura rendiconto non trovata")
    if not estratto.data_valuta_addebito:
        warnings.append("Valuta di addebito non trovata — match livello B su CC non possibile")

    return carta, estratto, warnings


# ─────────────────────────────────────────────────────────────────────
# Parsing dettaglio movimenti
# ─────────────────────────────────────────────────────────────────────


def _parse_movimenti(text: str) -> list[Movimento]:
    """Estrae le righe del dettaglio operazioni.

    Strategia: scansione lineare. Quando trovi una riga matching RIGA_ESTERA o
    RIGA_NORMALE crei il Movimento. Se la riga successiva matcha RIGA_MAGG (e
    l'ultimo era estero) attacchi le maggiorazioni a quel movimento.
    """
    movimenti: list[Movimento] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        m_est = RIGA_ESTERA.match(line)
        if m_est:
            mov = Movimento(
                codice_riferimento=m_est.group(1),
                mcc=m_est.group(2),
                data_operazione=_data_to_iso(m_est.group(3)),
                data_registrazione=_data_to_iso(m_est.group(4)),
                descrizione=m_est.group(5).strip(),
                importo=_imp_to_float(m_est.group(9)),
                importo_estero=_imp_to_float(m_est.group(6)),
                valuta_estera=m_est.group(7),
                cambio_valuta=_imp_to_float(m_est.group(8)),
            )
            # Riga MAGG (può esserci una riga vuota tra le due)
            j = i + 1
            while j < min(i + 3, len(lines)) and not lines[j].strip():
                j += 1
            if j < len(lines):
                mm = RIGA_MAGG.search(lines[j])
                if mm:
                    mov.magg_circuito = _imp_to_float(mm.group(1))
                    mov.magg_cambio = _imp_to_float(mm.group(2))
                    i = j
            movimenti.append(mov)
            i += 1
            continue

        m_norm = RIGA_NORMALE.match(line)
        if m_norm:
            mov = Movimento(
                codice_riferimento=m_norm.group(1),
                mcc=m_norm.group(2),
                data_operazione=_data_to_iso(m_norm.group(3)),
                data_registrazione=_data_to_iso(m_norm.group(4)),
                descrizione=m_norm.group(5).strip(),
                importo=_imp_to_float(m_norm.group(6)),
            )
            movimenti.append(mov)
        i += 1

    # Normalizza descrizione: collassa spazi multipli in singolo
    for mov in movimenti:
        mov.descrizione = re.sub(r"\s{2,}", " ", mov.descrizione)

    return movimenti


# ─────────────────────────────────────────────────────────────────────
# Validazione di chiusura
# ─────────────────────────────────────────────────────────────────────


def _validate(estratto: EstrattoHeader, movimenti: list[Movimento]) -> tuple[bool, float, bool, float, list[str]]:
    """Verifica le 2 equazioni di chiusura del PDF:

    1. somma(movimenti.importo) == estratto.totale_movimenti
    2. estratto.addebito_totale_cc == totale_movimenti + bollo + spese + residuo_prec - addebitato_prec
    """
    warnings: list[str] = []

    somma_mov = sum(m.importo for m in movimenti)
    delta_mov = _round2(estratto.totale_movimenti - somma_mov)
    quadra_mov = abs(delta_mov) < 0.02

    atteso_addebito = (
        estratto.totale_movimenti
        + estratto.imposta_bollo
        + estratto.spese_invio
        + estratto.debito_residuo_precedente
        - estratto.totale_addebitato_precedente
    )
    delta_add = _round2(estratto.addebito_totale_cc - atteso_addebito)
    quadra_add = abs(delta_add) < 0.02

    if not quadra_mov:
        warnings.append(
            f"Quadratura movimenti FAIL: dichiarato {estratto.totale_movimenti:.2f}, "
            f"sommato {somma_mov:.2f}, delta {delta_mov:+.2f}"
        )
    if not quadra_add:
        warnings.append(
            f"Quadratura addebito CC FAIL: dichiarato {estratto.addebito_totale_cc:.2f}, "
            f"atteso {atteso_addebito:.2f}, delta {delta_add:+.2f}"
        )

    return quadra_mov, delta_mov, quadra_add, delta_add, warnings


# ─────────────────────────────────────────────────────────────────────
# API pubblica
# ─────────────────────────────────────────────────────────────────────


def parse_estratto_carta(pdf_path: str | Path) -> ParseResult:
    """Parsa un PDF Banco BPM "Estratto carta" e restituisce ParseResult.

    Non scrive su DB. Solleva RuntimeError se pdftotext fallisce.
    Restituisce result.quadra=False se il sanity di chiusura non torna —
    spetta al chiamante decidere se rifiutare l'import o registrare warning.
    """
    pdf_path = Path(pdf_path)
    text = pdf_to_text(pdf_path)

    carta, estratto, w_header = _parse_header(text)
    movimenti = _parse_movimenti(text)
    quadra_mov, delta_mov, quadra_add, delta_add, w_val = _validate(estratto, movimenti)

    return ParseResult(
        carta=carta,
        estratto=estratto,
        movimenti=movimenti,
        quadra=quadra_mov,
        delta_quadratura=delta_mov,
        quadra_addebito=quadra_add,
        delta_addebito=delta_add,
        pdf_filename=pdf_path.name,
        pdf_sha256=_sha256(pdf_path),
        warnings=w_header + w_val,
    )


def to_dict(result: ParseResult) -> dict:
    """Converte ParseResult in dict serializzabile JSON (per debug / API)."""
    return {
        "carta": asdict(result.carta),
        "estratto": asdict(result.estratto),
        "movimenti": [asdict(m) for m in result.movimenti],
        "quadra": result.quadra,
        "delta_quadratura": result.delta_quadratura,
        "quadra_addebito": result.quadra_addebito,
        "delta_addebito": result.delta_addebito,
        "pdf_filename": result.pdf_filename,
        "pdf_sha256": result.pdf_sha256,
        "warnings": result.warnings,
        "stats": {
            "n_movimenti": len(result.movimenti),
            "n_esteri": sum(1 for m in result.movimenti if m.valuta_estera),
        },
    }


# ─────────────────────────────────────────────────────────────────────
# CLI (per dev / test)
# ─────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.services.carta_pdf_parser <pdf_path>", file=sys.stderr)
        sys.exit(2)
    result = parse_estratto_carta(sys.argv[1])
    print(json.dumps(to_dict(result), indent=2, ensure_ascii=False))
    sys.exit(0 if result.quadra and result.quadra_addebito else 1)
