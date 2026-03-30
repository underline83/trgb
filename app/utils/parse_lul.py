"""
Parser PDF LUL (Libro Unico Lavoro) — cedolini buste paga
Estrae dati per dipendente dal PDF mensile del consulente del lavoro.

Formato atteso: PDF generato da TeamSystem con una sezione per dipendente.
Ogni sezione contiene header anagrafico, voci retributive, totali e NETTO BUSTA.
"""

import os
import re
import pdfplumber
from io import BytesIO
from typing import Optional


# ── Helpers ──────────────────────────────────────────────────────────

def _parse_it_decimal(s: str) -> Optional[float]:
    """Converte '1.397,10' o '9,82006' in float. Ritorna None se non parsabile."""
    if not s:
        return None
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _extract_between(text: str, start_pattern: str, end_pattern: str) -> str:
    """Estrae testo tra due pattern regex."""
    m = re.search(f"{start_pattern}(.*?){end_pattern}", text, re.DOTALL)
    return m.group(1).strip() if m else ""


MESI_MAP = {
    "GENNAIO": 1, "FEBBRAIO": 2, "MARZO": 3, "APRILE": 4,
    "MAGGIO": 5, "GIUGNO": 6, "LUGLIO": 7, "AGOSTO": 8,
    "SETTEMBRE": 9, "OTTOBRE": 10, "NOVEMBRE": 11, "DICEMBRE": 12,
}


# ── Estrazione campi da blocco testo ─────────────────────────────────

def _parse_cedolino_block(text: str) -> Optional[dict]:
    """
    Parsa un blocco di testo corrispondente a un singolo cedolino.
    Ritorna dict con i campi estratti, o None se non riesce a identificare il dipendente.
    """
    result = {}

    # --- Mensilità e anno ---
    m = re.search(r"MENSILIT[AÀ\u2019'`].*?\n\s*(\w+)\s+(\d{4})", text)
    if m:
        mese_str = m.group(1).upper()
        result["mese"] = MESI_MAP.get(mese_str, 0)
        result["anno"] = int(m.group(2))
    else:
        # Fallback: cerca il mese in qualsiasi formato
        for nome, num in MESI_MAP.items():
            if nome in text.upper():
                result["mese"] = num
                break
        # Anno
        m_anno = re.search(r"\b(202[0-9])\b", text)
        if m_anno:
            result["anno"] = int(m_anno.group(1))

    # --- Cognome e Nome ---
    # Riga header: MENSILIT[AÀ\u2019'`] COD. AZIE COD. FIL MATRICOLA INPS POSIZIONE INAIL CODICE COGNOME E NOME DATA NASCITA
    # Riga dati:   GENNAIO 2026 78 1 1213048807 22420684 21 52 LENTINI SARA 01/10/2004
    # Pattern: mese anno cod_azie cod_fil matricola(10dig) posizione(7-8dig) sub_cod codice(2-3dig) NOME data
    # Il "21" fisso tra posizione e codice dipendente è un sotto-codice INAIL
    m = re.search(
        r"COGNOME\s+E\s+NOME\s+DATA\s+NASCITA\s*\n"
        r"\s*\w+\s+\d{4}\s+\d+\s+\d+\s+\d{10}\s+\d{7,8}\s+\d{1,3}\s+(\d{2,3})\s+(.+?)\s+(\d{2}/\d{2}/\d{4})",
        text
    )
    if m:
        result["codice_dipendente"] = m.group(1)
        result["cognome_nome"] = m.group(2).strip()
        result["data_nascita"] = m.group(3)
    else:
        # Fallback: cerca il nome tra l'ultimo codice numerico e la data
        m2 = re.search(
            r"COGNOME\s+E\s+NOME.*?\n.*?\s(\d{2,3})\s+([A-Z][A-Z\s]+?)\s+(\d{2}/\d{2}/\d{4})",
            text
        )
        if m2:
            result["codice_dipendente"] = m2.group(1)
            result["cognome_nome"] = m2.group(2).strip()
            result["data_nascita"] = m2.group(3)

    if "cognome_nome" not in result:
        return None  # Non riusciamo a identificare il dipendente

    # --- Codice fiscale ---
    m = re.search(r"CODICE\s+FISCALE\s+INDIRIZZO.*?\n\s*([A-Z0-9]{16})", text)
    if m:
        result["codice_fiscale"] = m.group(1)

    # --- Qualifica e livello ---
    m = re.search(r"LIVELLO\s+QUALIFICA\s+TIPO\s+RETRIBUZIONE.*?\n\s*(.+)", text)
    if m:
        line = m.group(1).strip()
        # Il livello è all'inizio (es. "4' L", "7' L", "4^", "5^")
        m_liv = re.match(r"(\d+[''^]\s*\w?)\s+(.+?)(?:\s+(?:Oraria|Fissa mensile))", line)
        if m_liv:
            result["livello"] = m_liv.group(1).strip()
            result["qualifica"] = m_liv.group(2).strip()

    # --- Tipo rapporto ---
    m = re.search(r"TIPO\s+RAPPORTO.*?\n\s*\w+\s+(Determinato|Indeterminato)", text)
    if m:
        result["tipo_rapporto"] = m.group(1)

    # --- IBAN ---
    m = re.search(r"IBAN\s+(IT\w{25,30})", text)
    if m:
        result["iban"] = m.group(1)

    # --- Retribuzione base mensile (MCT) ---
    # Per dipendenti a paga fissa: è il lordo mensile
    # Per dipendenti orari: è la paga oraria (il totale effettivo è totale_competenze)
    m = re.search(r"MCT\s+TOTALE\s+RETRIBUZIONE.*?(\d[\d.,]+)", text)
    if m:
        result["retribuzione_base"] = _parse_it_decimal(m.group(1))

    # --- Contributi INPS ---
    m = re.search(r"39400\s+CONTRIBUTI\s+INPS\s+([\d.,]+)", text)
    if m:
        result["contributi_inps"] = _parse_it_decimal(m.group(1))

    # --- Ritenute IRPEF (può essere 32081 o 32100 per conguaglio) ---
    m = re.search(r"3208[01]\s+RITENUTE?\s+IRPEF(?:\s+CONGUAGLIO)?\s+([\d.,]+)", text)
    if not m:
        m = re.search(r"32100\s+RITENUTE\s+IRPEF\s+CONGUAGLIO\s+([\d.,]+)", text)
    if m:
        result["ritenute_irpef"] = _parse_it_decimal(m.group(1))

    # --- Addizionale regionale ---
    m = re.search(r"9117\s+RATA\s+ADDIZ\.?\s*REGIONALE.*?Res:\s*([\d.,]+)\s+([\d.,]+)", text)
    if m:
        result["addizionale_regionale_totale"] = _parse_it_decimal(m.group(1))
        result["addizionale_regionale_rata"] = _parse_it_decimal(m.group(2))
    else:
        # Conguaglio fine rapporto
        m2 = re.search(r"31051\s+ADD\.\s*REGIONALE\s+IRPEF\s+ANNO\s+([\d.,]+)", text)
        if m2:
            result["addizionale_regionale_rata"] = _parse_it_decimal(m2.group(1))

    # --- Addizionale comunale ---
    m = re.search(r"9119\s+RATA\s+ADD\.?\s*COMUNALE.*?Res:\s*([\d.,]+)\s+([\d.,]+)", text)
    if m:
        result["addizionale_comunale_totale"] = _parse_it_decimal(m.group(1))
        result["addizionale_comunale_rata"] = _parse_it_decimal(m.group(2))
    else:
        m2 = re.search(r"31052\s+ADD\.\s*COMUNALE\s+IRPEF\s+ANNO\s+([\d.,]+)", text)
        if m2:
            result["addizionale_comunale_rata"] = _parse_it_decimal(m2.group(1))

    # --- Ore lavorate ---
    m = re.search(r"32110\s+Ore\s+lavorate\s+([\d.,]+)", text)
    if m:
        result["ore_lavorate"] = _parse_it_decimal(m.group(1))

    # --- TFR ---
    m = re.search(r"8400\s+TRATTAMENTO\s+FINE\s+RAPPORTO\s+([\d.,]+)", text)
    if m:
        result["tfr_erogato"] = _parse_it_decimal(m.group(1))

    # --- Netto busta ---
    m = re.search(r"NETTO\s+BUSTA\s*\n\s*([\d.,]+)", text)
    if m:
        result["netto"] = _parse_it_decimal(m.group(1))

    # --- Totali competenze e trattenute ---
    m = re.search(r"T\s*O\s*T\s*A\s*L\s*I\s+([\d.,]+)\s+([\d.,]+)", text)
    if m:
        result["totale_competenze"] = _parse_it_decimal(m.group(1))
        result["totale_trattenute"] = _parse_it_decimal(m.group(2))
        # Il lordo effettivo del mese è totale_competenze
        result["lordo"] = result["totale_competenze"]

    # --- Imponibile IRPEF (dalla sezione riepilogo sotto ONERI DED.) ---
    # Pattern: "ONERI DED. IMPONIBILE IRPEF ..." header, poi "MESE importo importo ..."
    m = re.search(r"ONERI\s+DED\..*?IRPEF\s+NETTA\s*\n\s*MESE\s+([\d.,]+)\s+([\d.,]+)", text, re.DOTALL)
    if m:
        result["imponibile_irpef"] = _parse_it_decimal(m.group(1))
        result["irpef_lorda"] = _parse_it_decimal(m.group(2))

    return result


# ── Splitter: divide il PDF in blocchi per dipendente ────────────────

def _has_cedolino_header(text: str) -> bool:
    """Verifica se il testo contiene un header cedolino (flessibile su apostrofi/encoding)."""
    # MENSILITA con qualsiasi tipo di apostrofo/accento
    has_mensilita = bool(re.search(r"MENSILIT[AÀ\u2019'`]", text))
    has_cognome = bool(re.search(r"COGNOME\s+E\s+NOME", text))
    return has_mensilita and has_cognome


def _has_netto_busta(text: str) -> bool:
    """Verifica se il testo contiene il netto busta (flessibile)."""
    return bool(re.search(r"NETTO\s+BUSTA", text)) or bool(re.search(r"T\s*O\s*T\s*A\s*L\s*I\s+[\d.,]+", text))


def _split_into_cedolini(pages_text: list[str]) -> list[tuple[str, list[int]]]:
    """
    Dato il testo di ogni pagina, raggruppa le pagine in blocchi cedolino.
    Un nuovo cedolino inizia quando appare un header con MENSILITA e COGNOME E NOME.
    Pagine senza header si appendono al blocco corrente (continuazione).

    Ritorna: lista di tuple (testo_blocco, [indici_pagine_0based])
    """
    blocks = []
    current_block = ""
    current_pages = []

    for page_idx, page_text in enumerate(pages_text):
        if not page_text:
            continue

        is_new_cedolino = _has_cedolino_header(page_text)
        is_presenze = bool(re.search(r"RIEPILOGO\s+PRESENZE|CALENDARIO\s+PRESENZE", page_text))

        if is_new_cedolino and not is_presenze:
            # Salva il blocco precedente se aveva dati utili
            if current_block and (_has_netto_busta(current_block) or _has_cedolino_header(current_block)):
                blocks.append((current_block, current_pages))
            current_block = page_text
            current_pages = [page_idx]
        else:
            # Pagina di continuazione
            current_block += "\n" + page_text
            current_pages.append(page_idx)

    # Ultimo blocco
    if current_block:
        blocks.append((current_block, current_pages))

    return blocks


# ── API pubblica ─────────────────────────────────────────────────────

def parse_lul_pdf(file_path: str = None, file_bytes: bytes = None) -> list[dict]:
    """
    Parsa un PDF LUL e ritorna una lista di dict, uno per cedolino.

    Args:
        file_path: percorso al file PDF
        file_bytes: bytes del PDF (alternativa a file_path, per upload via API)

    Returns:
        Lista di dict con campi:
            cognome_nome, codice_fiscale, codice_dipendente,
            mese, anno, netto, totale_retribuzione,
            contributi_inps, ritenute_irpef,
            addizionale_regionale_rata, addizionale_comunale_rata,
            ore_lavorate, tfr_erogato, iban, livello, qualifica, ...
    """
    if file_bytes:
        pdf = pdfplumber.open(BytesIO(file_bytes))
    elif file_path:
        pdf = pdfplumber.open(file_path)
    else:
        raise ValueError("Specificare file_path o file_bytes")

    pages_text = []
    for page in pdf.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text)

    pdf.close()

    blocks = _split_into_cedolini(pages_text)
    cedolini = []

    for block_text, block_pages in blocks:
        parsed = _parse_cedolino_block(block_text)
        if parsed and "cognome_nome" in parsed:
            parsed["pagine"] = block_pages  # indici 0-based delle pagine PDF
            cedolini.append(parsed)

    return cedolini


# ── Utility: lordo approssimato ──────────────────────────────────────

def estrai_pagine_pdf(file_bytes: bytes, pagine: list[int], output_path: str) -> str:
    """
    Estrae le pagine specificate (indici 0-based) dal PDF e le salva in un nuovo file.
    Usa pikepdf per manipolare le pagine senza perdere qualità.

    Args:
        file_bytes: bytes del PDF originale
        pagine: lista di indici pagina 0-based da estrarre
        output_path: percorso dove salvare il PDF estratto

    Returns:
        Il percorso del file salvato
    """
    try:
        import pikepdf
    except ImportError:
        # Fallback: salva tutto il PDF se pikepdf non è disponibile
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(file_bytes)
        return output_path

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    src = pikepdf.open(BytesIO(file_bytes))
    dst = pikepdf.new()
    for idx in sorted(pagine):
        if idx < len(src.pages):
            dst.pages.append(src.pages[idx])
    dst.save(output_path)
    dst.close()
    src.close()

    return output_path


def calcola_lordo_approssimato(c: dict) -> float:
    """
    Calcola il costo lordo azienda approssimato partendo dai dati del cedolino.
    lordo ≈ netto + irpef + inps_dipendente + addizionali + inps_azienda (stimato ~30% dell'imponibile)
    """
    netto = c.get("netto", 0) or 0
    irpef = c.get("ritenute_irpef", 0) or 0
    inps = c.get("contributi_inps", 0) or 0
    add_reg = c.get("addizionale_regionale_rata", 0) or 0
    add_com = c.get("addizionale_comunale_rata", 0) or 0
    return round(netto + irpef + inps + add_reg + add_com, 2)
