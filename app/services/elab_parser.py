"""
TRGB — Parser PDF Riepilogo Paghe e Contributi "ELAB" (G.3 Fase E, 2026-05-16)

Estrae il "COSTO CONSUNTIVO DEL PERIODO" (tabella per dipendente + totale
azienda) e l'INAIL del mese dai PDF mensili del consulente paghe.

Layout PDF atteso (formato osservato per TRE GOBBI S.R.L. 2026):
  - Pagina 1:   Riepilogo per categoria (operai, collaboratori, ecc.)
  - Pagina 2:   Dati uso amministrativo + POSIZIONE INAIL
  - Pagine 3-5: Riepilogo paghe e contributi dettagliato (DARE/AVERE)
  - Pagina 6:   Distinta bonifici netti
  - Pagina 7:   Dettaglio debiti/crediti DM10
  - Pagina 8:   COSTO CONSUNTIVO DEL PERIODO  ← QUI il dato che ci serve

Tabella pagina 8, 13 colonne:
   0. Matr. Cognome e nome    (es. "73 SOLA PAOLO")
   1. Ore Lavorate ore
   2. Retribuzione lorda importo
   3. Retribuzione lorda contributi (carico ditta)
   4. Straordinario ore
   5. Straordinario importo
   6. Straordinario contributi
   7. Ratei (13a + 14a + ferie + permessi/ROL maturati nel mese)
   8. Contributi su ratei
   9. T.F.R. maturato
  10. Totale = costo aziendale vero
  11. Costo orario
  12. % di incidenza

La riga "T O T A L I A Z I E N D A" è il totale aggregato (sempre presente).

USO:
    from app.services.elab_parser import parse_elab_pdf
    data = parse_elab_pdf("/path/to/3GOBBI_ELAB_4.pdf")
    # data = {
    #   "anno": 2026, "mese": 4,
    #   "azienda_nome": "TRE GOBBI S.R.L.", "azienda_codice": "0078",
    #   "dipendenti": [ {matricola, cognome_nome, ore_lavorate, ...}, ... ],
    #   "totale_azienda": {ore_lavorate, retribuzione_lorda, ..., costo_totale},
    #   "inail_mese": 92.14,
    #   "warnings": [...],
    #   "fonte_pdf": "3GOBBI_ELAB_4.pdf",
    #   "fonte_hash": "sha256...",
    # }

ROBUSTEZZA:
- Tollera celle vuote (es. amministratore senza ratei/TFR).
- Tollera righe parziali (es. "86 PANICHI ELISA 0,10 0,10" — un solo importo).
- Riconosce la riga "T O T A L I AZIENDA" tramite testo nella colonna 0.
- Italian decimal: virgola → punto.
- Anno/mese: parsing dalla stringa "DAL MESE DI <Mese> <Anno>" in pagina 8.

NB: il parser non scrive nel DB. Lo fa il chiamante (router upload) dopo
revisione utente. Il parser ritorna SOLO i dati strutturati + warnings.
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


# ─────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────

def _to_float(s: Optional[str]) -> Optional[float]:
    """Converte stringa italiana (virgola) in float. None/'' → None."""
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    # Rimuove eventuali separatori migliaia (punto) e converte virgola
    s = s.replace(".", "").replace(",", ".")
    # Gestisce segno negativo
    if s.startswith("-") or s.endswith("-"):
        s = "-" + s.replace("-", "")
    try:
        return float(s)
    except ValueError:
        return None


def _sha256_file(path: str | Path) -> str:
    """Hash sha256 del file (per anti-doppio import)."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _split_matricola_nome(cell: str) -> tuple[Optional[str], Optional[str]]:
    """"73 SOLA PAOLO" → ("73", "SOLA PAOLO"). Match: ^\\d+\\s+rest$"""
    if not cell:
        return None, None
    cell = cell.strip()
    m = re.match(r"^(\d+)\s+(.+)$", cell)
    if m:
        return m.group(1), m.group(2).strip()
    return None, cell or None


def _parse_periodo_da_titolo(text: str) -> tuple[Optional[int], Optional[int]]:
    """
    Pagina 8 inizia con:
      "*** C O S T O C O N S U N T I V O ... DAL MESE DI Aprile 2026 AL MESE DI Aprile 2026"
    Estrae (anno, mese) dal primo "DAL MESE DI <X> <Y>".
    """
    # Match flessibile: "DAL MESE DI" può essere spacereggiato in vari modi nel PDF
    m = re.search(
        r"DAL\s+MESE\s+DI\s+(\w+)\s+(\d{4})", text, re.IGNORECASE
    )
    if not m:
        return None, None
    mese_str = m.group(1).lower()
    anno = int(m.group(2))
    mese = MESI_IT.get(mese_str)
    return anno, mese


def _parse_azienda_da_riepilogo(text: str) -> tuple[Optional[str], Optional[str]]:
    """
    Cerca "Azienda : 0078 TRE GOBBI S.R.L." o variazioni.
    Ritorna (codice, ragione_sociale).
    """
    m = re.search(r"Azienda\s*:\s*(\d+)\s+(.+?)(?:\n|$)", text)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return None, None


# ─────────────────────────────────────────────────────────────
# PARSING TABELLA COSTO CONSUNTIVO
# ─────────────────────────────────────────────────────────────

# Indici colonna nella tabella pagina 8
COL_MATR_NOME = 0
COL_ORE_LAV = 1
COL_LORDO = 2
COL_CONTRIB_LORDO = 3
COL_STR_ORE = 4
COL_STR_LORDO = 5
COL_STR_CONTRIB = 6
COL_RATEI = 7
COL_CTR_RATEI = 8
COL_TFR = 9
COL_TOTALE = 10
COL_COSTO_ORARIO = 11
COL_PCT_INCID = 12


def _parse_costo_consuntivo_table(table: list[list]) -> dict:
    """
    Input: tabella estratta da pagina 8 (lista di righe, ognuna lista di 13 celle).
    Output: {dipendenti: [...], totale_azienda: {...}, warnings: [...]}
    """
    dipendenti = []
    totale = None
    warnings = []

    for row in table:
        # Normalizza riga: assicurati che abbia 13 celle (può venire troncata)
        if row is None or len(row) < 1:
            continue
        row = list(row) + [None] * (13 - len(row))
        cell0 = (row[COL_MATR_NOME] or "").strip()
        if not cell0:
            continue

        # Riga totale azienda
        if "A Z I E N D A" in cell0.upper() or cell0.upper().startswith("AZIENDA"):
            totale = {
                "ore_lavorate": _to_float(row[COL_ORE_LAV]),
                "retribuzione_lorda": _to_float(row[COL_LORDO]),
                "contributi_lordo": _to_float(row[COL_CONTRIB_LORDO]),
                "ore_straord": _to_float(row[COL_STR_ORE]),
                "retribuzione_straord": _to_float(row[COL_STR_LORDO]),
                "contributi_straord": _to_float(row[COL_STR_CONTRIB]),
                "ratei_importo": _to_float(row[COL_RATEI]),
                "contributi_su_ratei": _to_float(row[COL_CTR_RATEI]),
                "tfr_maturato": _to_float(row[COL_TFR]),
                "costo_totale": _to_float(row[COL_TOTALE]),
                "costo_orario": _to_float(row[COL_COSTO_ORARIO]),
            }
            continue

        # Skip header / "T O T A L I" senza riga azienda subito dopo
        if cell0.upper().startswith("T O T A L I"):
            continue
        if cell0.upper().startswith("MATR.") or cell0.upper().startswith("ORE"):
            continue

        # Riga dipendente: deve iniziare con un numero (matricola)
        matricola, cognome_nome = _split_matricola_nome(cell0)
        if matricola is None:
            # Non è una riga valida (probabilmente header/separatore)
            continue

        # Caso edge: dipendente con solo "0,10 0,10" (es. Panichi Elisa)
        # → riempi tutto a None tranne TOTALE
        dip = {
            "matricola": matricola,
            "cognome_nome": cognome_nome,
            "ore_lavorate": _to_float(row[COL_ORE_LAV]),
            "retribuzione_lorda": _to_float(row[COL_LORDO]),
            "contributi_lordo": _to_float(row[COL_CONTRIB_LORDO]),
            "ore_straord": _to_float(row[COL_STR_ORE]),
            "retribuzione_straord": _to_float(row[COL_STR_LORDO]),
            "contributi_straord": _to_float(row[COL_STR_CONTRIB]),
            "ratei_importo": _to_float(row[COL_RATEI]),
            "contributi_su_ratei": _to_float(row[COL_CTR_RATEI]),
            "tfr_maturato": _to_float(row[COL_TFR]),
            "costo_totale": _to_float(row[COL_TOTALE]),
            "costo_orario": _to_float(row[COL_COSTO_ORARIO]),
        }

        # Se costo_totale è None, salta (riga non-valida) e segnala
        if dip["costo_totale"] is None:
            warnings.append(f"riga dipendente matr.{matricola} '{cognome_nome}': totale costo mancante, scartata")
            continue

        dipendenti.append(dip)

    if totale is None:
        warnings.append("riga 'T O T A L I AZIENDA' non trovata: totale azienda non disponibile")

    return {
        "dipendenti": dipendenti,
        "totale_azienda": totale,
        "warnings": warnings,
    }


# ─────────────────────────────────────────────────────────────
# PARSING INAIL (pagina 2)
# ─────────────────────────────────────────────────────────────

def _parse_inail_da_pag2(text: str) -> Optional[float]:
    """
    Pagina 2 contiene:
      POSIZIONE INAIL  n.dip. ore gg  Impon.INAIL  ...  TOTALE
       22420684/21       1   19  7    255,00       ...     2,16
       22420684/21       9  857 123   12.800,86    ...    89,98
       T O T A L E      10  876 130   13.055,86    ...    92,14

    Ritorna il TOTALE INAIL (somma premio + addizionale), es. 92,14.
    """
    # Cerca riga "T O T A L E ... ultimo numero", in contesto di POSIZIONE INAIL
    if "POSIZIONE INAIL" not in text.upper():
        return None

    # Trova blocco INAIL: dalla riga POSIZIONE INAIL in poi
    idx = text.upper().find("POSIZIONE INAIL")
    block = text[idx:]

    # Cerca pattern "T O T A L E" seguito da numeri, prende l'ultimo numero della riga
    for line in block.split("\n"):
        if re.search(r"T\s*O\s*T\s*A\s*L\s*E", line, re.IGNORECASE):
            # Estrai tutti i numeri italiani (formato "12.800,86" o "92,14")
            numeri = re.findall(r"[\d.]+,\d{2}", line)
            if numeri:
                # Ultimo numero = TOTALE INAIL (premio + addizionale)
                return _to_float(numeri[-1])
    return None


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────

def parse_elab_pdf(pdf_path: str | Path) -> dict:
    """
    Parsea un PDF "ELAB" (Riepilogo paghe e contributi) ed estrae:
      - anno, mese del periodo
      - azienda (codice + ragione sociale)
      - lista dipendenti con costo consuntivo dettagliato
      - totale azienda (aggregato dello stesso)
      - INAIL del mese (somma premio + addizionale)
      - fonte_hash (sha256 del PDF, per anti-doppio import)

    Ritorna dict con tutte queste info + lista warnings.
    Solleva FileNotFoundError se path non esiste.
    Non scrive su DB.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"ELAB pdf non trovato: {pdf_path}")

    result = {
        "fonte_pdf": pdf_path.name,
        "fonte_hash": _sha256_file(pdf_path),
        "anno": None,
        "mese": None,
        "azienda_codice": None,
        "azienda_nome": None,
        "dipendenti": [],
        "totale_azienda": None,
        "inail_mese": None,
        "warnings": [],
    }

    with pdfplumber.open(pdf_path) as pdf:
        n_pages = len(pdf.pages)
        if n_pages == 0:
            result["warnings"].append("PDF senza pagine")
            return result

        # Cerca la pagina con "COSTO CONSUNTIVO"
        page_costo = None
        for i, page in enumerate(pdf.pages):
            txt = page.extract_text() or ""
            if "COSTO CONSUNTIVO" in txt.upper() or "C O S T O" in txt.upper():
                page_costo = page
                break
        if page_costo is None:
            result["warnings"].append("pagina 'COSTO CONSUNTIVO' non trovata nel PDF")
            return result

        # Estrai testo + tabella
        costo_text = page_costo.extract_text() or ""

        # Anno / mese
        anno, mese = _parse_periodo_da_titolo(costo_text)
        result["anno"] = anno
        result["mese"] = mese
        if anno is None or mese is None:
            result["warnings"].append(
                "anno/mese del periodo non estratto dal titolo 'DAL MESE DI ...'"
            )

        # Azienda
        codice, nome = _parse_azienda_da_riepilogo(costo_text)
        result["azienda_codice"] = codice
        result["azienda_nome"] = nome

        # Tabella costo consuntivo
        tables = page_costo.extract_tables()
        if not tables:
            result["warnings"].append("nessuna tabella estratta dalla pagina costo consuntivo")
        else:
            # Prendiamo la tabella più grande (più righe)
            table = max(tables, key=lambda t: len(t))
            parsed = _parse_costo_consuntivo_table(table)
            result["dipendenti"] = parsed["dipendenti"]
            result["totale_azienda"] = parsed["totale_azienda"]
            result["warnings"].extend(parsed["warnings"])

        # INAIL: cerca nella pagina 2 (Dati uso amministrativo)
        for page in pdf.pages:
            txt = page.extract_text() or ""
            if "POSIZIONE INAIL" in txt.upper():
                inail = _parse_inail_da_pag2(txt)
                if inail is not None:
                    result["inail_mese"] = inail
                break

    return result
