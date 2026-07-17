# Modulo: controllo_gestione
"""
TRGB — Parser PDF Bollette A2A Energia (luce + gas) — spec docs/spec_utenze.md

Estrae i dati decisionali dalla "copia analogica" PDF delle bollette A2A:
consumi per fascia, letture, potenza, formula prezzo (indice+spread), scadenza
condizioni economiche e lo storico 18 mesi presente in ogni bolletta.

Layout atteso (formato A2A osservato su TRE GOBBI SRL, 2026):
  - Pag. 1: box riepilogo (fornitura, bolletta, offerta, scadenza condizioni,
            consumo annuo, totale, periodo, scadenza pagamento)
  - Pag. 2: "Scontrino dell'Energia" (quota consumi/fissa/potenza, accise) +
            "Box dell'Offerta" (formula prezzo, spread, indice) + POD/PDR
  - Pag. 3: letture e consumi (luce: per fascia F1/F2/F3; gas: rilevata/stimata)
            (gas: anche storico + consumo/spesa annua)
  - Pag. 4: (luce) informazioni storiche: potenza 12 mesi, storico 18 mesi per fascia

PATTERN (identico a elab_parser.py):
  - Il parser NON scrive nel DB. Ritorna SOLO dati strutturati + warnings.
  - Ogni campo mancante produce un warning, mai un crash.
  - Italian decimal (virgola → punto, punto = migliaia).

USO:
    from app.services.utenze_parser import parse_bolletta_a2a, UnsupportedLayoutError
    data = parse_bolletta_a2a("/path/bolletta.pdf")
    # data["tipo"] → "LUCE" | "GAS"; data["warnings"] → [...]

Validato il 2026-07-17 su:
  - luce n. 526509846068 (giugno 2026)
  - gas  n. 526509036373 (aprile-maggio 2026)
"""

import hashlib
import re
from pathlib import Path
from typing import Optional

import pdfplumber


class UnsupportedLayoutError(Exception):
    """PDF che non sembra una bolletta A2A nel layout atteso."""


MESI = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5,
    "giugno": 6, "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10,
    "novembre": 11, "dicembre": 12,
}


def _num(s: Optional[str]) -> Optional[float]:
    """'2.039,00' → 2039.0 · '892,501768' → 892.501768 · None-safe."""
    if s is None:
        return None
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _num_int_dots(s: Optional[str]) -> Optional[float]:
    """Numeri SENZA decimali dove il punto è solo migliaia: '66.499' → 66499."""
    if s is None:
        return None
    try:
        return float(s.strip().replace(".", ""))
    except ValueError:
        return None


def _data_it(giorno: str, mese_nome: str, anno: str) -> Optional[str]:
    """('16','Luglio','2026') → '2026-07-16'."""
    m = MESI.get(mese_nome.strip().lower())
    if not m:
        return None
    return f"{int(anno):04d}-{m:02d}-{int(giorno):02d}"


def _data_punti(s: Optional[str]) -> Optional[str]:
    """'30.11.2026' → '2026-11-30'."""
    if not s:
        return None
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", s.strip())
    if not m:
        return None
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"


def _mese_breve(s: str) -> Optional[str]:
    """'01/25' o '07/2025' → '2025-01' / '2025-07'."""
    m = re.match(r"(\d{2})/(\d{2,4})$", s.strip())
    if not m:
        return None
    anno = int(m.group(2))
    if anno < 100:
        anno += 2000
    return f"{anno:04d}-{int(m.group(1)):02d}"


def _search(pattern, text, warnings, label, flags=0):
    """re.search con warning automatico se il campo non si trova."""
    m = re.search(pattern, text, flags)
    if not m:
        warnings.append(f"Campo non trovato: {label}")
    return m


# ─────────────────────────────────────────────────────────────────
# Sezioni
# ─────────────────────────────────────────────────────────────────

def _parse_pagina1(t1: str, out: dict, warnings: list) -> None:
    m = _search(r"Fornitura n\.\s*(\d+)", t1, warnings, "numero fornitura")
    out["numero_fornitura"] = m.group(1) if m else None

    m = _search(r"Bolletta n\.\s*(\d+)", t1, warnings, "numero bolletta")
    out["numero_bolletta"] = m.group(1) if m else None

    m = _search(r"del\s+(\d{1,2})\s+(\w+)\s+(\d{4})", t1, warnings, "data emissione")
    out["data_emissione"] = _data_it(*m.groups()) if m else None

    m = _search(r"OFFERTA ATTIVA\s*\n(.+)", t1, warnings, "offerta attiva")
    out["offerta"] = m.group(1).strip() if m else None

    # Multi-colonna: la data appare su riga propria prima di "CONSUMO ANNUO"
    m = _search(r"(\d{2}\.\d{2}\.\d{4})\s*\n\s*CONSUMO ANNUO", t1, warnings,
                "scadenza condizioni economiche (pag.1)")
    out["scadenza_condizioni"] = _data_punti(m.group(1)) if m else None

    m = _search(r"CONSUMO ANNUO\s*\n\s*([\d\.]+)\s*(kWh|Smc)", t1, warnings, "consumo annuo")
    if m:
        out["consumo_annuo"] = _num_int_dots(m.group(1))
        out["unita"] = m.group(2)
    else:
        out["consumo_annuo"] = None

    # Consumo fatturato del periodo: primo valore con unità dopo l'header
    # (le colonne interlacciano altre righe in mezzo)
    m = _search(r"Consumo totale fatturato del periodo[\s\S]{0,100}?([\d\.]+(?:,\d+)?)\s*(kWh|Smc)",
                t1, warnings, "consumo fatturato periodo")
    if m:
        out["consumo_fatturato"] = _num(m.group(1)) if "," in m.group(1) else _num_int_dots(m.group(1))
        out.setdefault("unita", m.group(2))
    else:
        out["consumo_fatturato"] = None

    m = re.search(r"di cui consumi stimati\s+([\d\.,]+)", t1)
    out["consumo_stimato"] = _num(m.group(1)) if m else None  # gas; assente su luce

    # Periodo bolletta: il blocco "PERIODO / dal ... / al ..." (NON il range
    # del consumo annuo, che compare prima nel testo)
    idx = t1.find("PERIODO")
    zona = t1[idx:] if idx >= 0 else t1
    mm = re.findall(r"^(?:dal|al)\s+(\d{2})\s+(\w+)\s+(\d{4})\s*$", zona, re.M)
    if len(mm) >= 2:
        out["periodo_da"] = _data_it(*mm[0])
        out["periodo_a"] = _data_it(*mm[1])
    else:
        warnings.append("Campo non trovato: periodo bolletta (dal/al)")
        out["periodo_da"] = out["periodo_a"] = None

    # Scadenza pagamento: il cerchio "Entro il / 05 / Agosto / 2026" esce
    # spezzato e interlacciato con altre colonne. Cerco giorno (riga sola),
    # mese (parola-mese in qualunque riga) e anno (riga sola) nelle righe
    # successive a "Entro il".
    out["scadenza_pagamento"] = None
    righe = t1.split("\n")
    for i, r in enumerate(righe):
        if "Entro il" in r:
            giorno = mese = anno = None
            for rr in righe[i + 1:i + 8]:
                rr = rr.strip()
                if giorno is None and re.fullmatch(r"\d{1,2}", rr):
                    giorno = rr
                if anno is None and re.fullmatch(r"\d{4}", rr):
                    anno = rr
                if mese is None:
                    for w in rr.split():
                        if w.lower() in MESI:
                            mese = w
                            break
            if giorno and mese and anno:
                out["scadenza_pagamento"] = _data_it(giorno, mese, anno)
            break
    if not out["scadenza_pagamento"]:
        warnings.append("Campo non trovato: scadenza pagamento")


def _parse_scontrino(t2: str, out: dict, warnings: list) -> None:
    unita_re = r"(?:kWh|smc|Smc)"

    # Riga quota consumi: "<qta> kWh <prezzo> €/kWh <importo> €"
    m = _search(rf"([\d\.,]+)\s*{unita_re}\s+([\d,]+)\s*€/{unita_re}\s+([\d\.,]+)\s*€",
                t2, warnings, "quota consumi (scontrino)")
    if m:
        out["prezzo_medio"] = _num(m.group(2))
        out["importo_consumi"] = _num(m.group(3))
        if out.get("consumo_fatturato") is None:
            out["consumo_fatturato"] = _num(m.group(1))
    else:
        out["prezzo_medio"] = out["importo_consumi"] = None

    m = _search(rf"vendita di (?:energia elettrica|gas naturale)\s+([\d,]+)\s*€/{unita_re}",
                t2, warnings, "prezzo componente energia")
    out["prezzo_energia"] = _num(m.group(1)) if m else None

    m = _search(rf"rete e gli oneri generali di sistema\s+([\d,]+)\s*€/{unita_re}",
                t2, warnings, "prezzo componente rete/oneri")
    out["prezzo_rete_oneri"] = _num(m.group(1)) if m else None

    m = _search(r"([\d,]+)\s*mesi x\s+([\d,]+)\s*€/mese\s+([\d\.,]+)\s*€",
                t2, warnings, "quota fissa")
    if m:
        out["quota_fissa_mensile"] = _num(m.group(2))
        out["quota_fissa_importo"] = _num(m.group(3))
    else:
        out["quota_fissa_mensile"] = out["quota_fissa_importo"] = None

    # Solo luce: "30,00 kW per 1 mesi x 4,166000 €/kW/mese 124,98 €"
    m = re.search(r"([\d,]+)\s*kW per\s+[\d,]+\s*mesi x\s+([\d,]+)\s*€/kW/mese\s+([\d\.,]+)\s*€", t2)
    if m:
        out["potenza_impegnata_kw"] = _num(m.group(1))
        out["quota_potenza_importo"] = _num(m.group(3))
    else:
        out["potenza_impegnata_kw"] = out.get("potenza_impegnata_kw")
        out["quota_potenza_importo"] = None

    m = _search(r"Accise e IVA\s+([\d\.,]+)\s*€", t2, warnings, "accise e IVA")
    out["accise_iva"] = _num(m.group(1)) if m else None

    m = _search(r"Totale bolletta\s+([\d\.,]+)\s*€", t2, warnings, "totale bolletta")
    out["totale_bolletta"] = _num(m.group(1)) if m else None

    m = _search(r"Totale da pagare\s+([\d\.,]+)\s*€", t2, warnings, "totale da pagare")
    out["totale_da_pagare"] = _num(m.group(1)) if m else None

    # POD / PDR (colonna destra pag. 2)
    m = _search(r"POD \(punto di prelievo\)\s*\n\s*(IT[\w]+)|PDR \(punto di riconsegna\)\s*\n\s*(\d+)",
                t2, warnings, "POD/PDR")
    out["pod_pdr"] = (m.group(1) or m.group(2)) if m else None

    # Indirizzo fornitura: il testo a colonne lo interlaccia con lo scontrino;
    # estraggo il segmento "VIA ... - CAP" (best effort, niente warning)
    m = re.search(r"((?:VIA|VIALE|PIAZZA|CORSO|LARGO)\s.{0,50}?-\s*\d{5})", t2)
    out["indirizzo_fornitura"] = " ".join(m.group(1).split()) if m else None

    # Potenza impegnata (colonna destra pag. 2, solo luce)
    m = re.search(r"Potenza impegnata\s*\n\s*([\d,]+)\s*kW", t2)
    if m:
        out["potenza_impegnata_kw"] = _num(m.group(1))


def _parse_box_offerta(t2: str, out: dict, warnings: list) -> None:
    # Il layout a colonne affianca le label ("Nome offerta: Codice offerta: ...")
    # e i valori sulla riga successiva. Il codice offerta è il token lungo
    # numerico-alfanumerico (es. 000294ESVFL01XXSmartBus230918216).
    m = _search(r"\b(\d{6}[A-Za-z0-9]{10,})\b", t2, warnings, "codice offerta")
    out["codice_offerta"] = m.group(1) if m else None

    # Indice di riferimento: valore sulla riga dopo la label, eventualmente
    # seguito sulla stessa riga dai valori assunti ("PUN Index GME Giu.26: ...")
    out["indice_riferimento"] = None
    righe = t2.split("\n")
    for i, r in enumerate(righe):
        if "Indice di riferimento" in r:
            for rr in righe[i + 1:i + 3]:
                # ferma la cattura prima dei valori indice ("... Giu.26: F1=...")
                m = re.match(r"^([A-Z][\w_]*(?:\s+[A-Za-z][\w_]*?)*?)(?=\s+\w{3}\.\d{2}|\s*\(|\s*$)", rr.strip())
                if m and m.group(1) and m.group(1).lower() not in ("valori",):
                    out["indice_riferimento"] = m.group(1).strip()
                    break
            break
    if not out["indice_riferimento"]:
        warnings.append("Campo non trovato: indice di riferimento")

    m = _search(r"Spread\((\w+\.\d+)\)\s*=\s*([\d,]+)\s*€/(?:kWh|Smc)", t2, warnings, "spread")
    if m:
        out["spread"] = _num(m.group(2))
        out["spread_mese_rif"] = m.group(1)
    else:
        out["spread"] = out["spread_mese_rif"] = None

    # Valori indice: luce "Giu.26: F1=0,12576 €/kWh; F2=..." · gas "Apr.26:0,509917 €/Smc; Mag.26:..."
    valori = {}
    for mese, fascia, val in re.findall(r"(\w{3}\.\d{2}):\s*(?:(F\d)=)?([\d,]+)\s*€/(?:kWh|Smc)", t2):
        key = f"{mese}:{fascia}" if fascia else mese
        valori[key] = _num(val)
    for fascia, val in re.findall(r";\s*(F\d)=([\d,]+)\s*€/kWh", t2):
        valori[f"{out.get('spread_mese_rif') or '?'}:{fascia}"] = _num(val)
    out["valori_indice"] = valori
    if not valori:
        warnings.append("Campo non trovato: valori indice di riferimento")

    # Conferma scadenza condizioni dal Box (fallback se pag.1 fallisce)
    m = re.search(r"Data di scadenza\s*\n?\s*delle condizioni economiche:\s*\n?\s*(\d{2}\.\d{2}\.\d{4})", t2)
    if m and not out.get("scadenza_condizioni"):
        out["scadenza_condizioni"] = _data_punti(m.group(1))


def _parse_letture_luce(t3: str, out: dict, warnings: list) -> None:
    # Totali di periodo per fascia (riga "Totale consumo fatturato di energia attiva")
    m = _search(
        r"Totale consumo fatturato di energia attiva\s+([\d\.]+)\s*kWh\s+([\d\.]+)\s*kWh\s+([\d\.]+)\s*kWh\s+([\d\.]+)\s*kWh",
        t3, warnings, "totali fascia periodo (luce)")
    if m:
        out["fasce_periodo"] = {
            "F1": _num_int_dots(m.group(1)),
            "F2": _num_int_dots(m.group(2)),
            "F3": _num_int_dots(m.group(3)),
        }
        out["fasce_periodo_tot"] = _num_int_dots(m.group(4))
    else:
        out["fasce_periodo"] = None
        out["fasce_periodo_tot"] = None

    # Potenza massima per fascia nel periodo ("22,640 kW Effettivo")
    pot = re.findall(r"Fascia oraria F\d\s+([\d\.,]+)\s*kW\s+Effettivo", t3)
    if pot:
        out["potenza_max_periodo_kw"] = max(_num(p) for p in pot)

    # Rapporto energia reattiva (soglia penali 33%)
    rea = re.findall(r"Rapporto Energia Reattiva/Energia Attiva\s+([\d,]+)%", t3)
    out["reattiva_rapporti_pct"] = [_num(r) for r in rea] or None

    cosfi = re.findall(r"Cos\(fi\)\s*(F\d)\s*=\s*([\d,]+)", t3)
    out["cos_fi"] = {f: _num(v) for f, v in cosfi} or None


def _parse_letture_gas(t3: str, out: dict, warnings: list) -> None:
    righe = re.findall(
        r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})\s+([\d\.]+)\s+(Rilevata|Stimata)\s+([\d\.]+)\s+(Rilevata|Stimata)\s+(\d+)\s+(Effettivo|Stimato)",
        t3)
    if not righe:
        warnings.append("Campo non trovato: righe letture gas")
    out["letture"] = [
        {
            "da": _data_punti(r[0]), "a": _data_punti(r[1]),
            "lettura_iniziale": _num_int_dots(r[2]), "tipo_iniziale": r[3],
            "lettura_finale": _num_int_dots(r[4]), "tipo_finale": r[5],
            "consumo_mc": _num_int_dots(r[6]), "tipo_consumo": r[7],
        }
        for r in righe
    ] or None

    m = re.search(r"Coefficiente di conversione \(C\):\s*([\d,]+)", t3)
    out["coeff_conversione"] = _num(m.group(1)) if m else None


def _parse_storico(testo: str, tipo: str, out: dict, warnings: list) -> None:
    """Storico 18 mesi (pag.4 luce / pag.3 gas) + consumo/spesa annua."""
    # Riga combinata sotto l'header "Consumo Annuo  Spesa annua sostenuta":
    # "66.499 kWh 23.089,07 €" / "5.106 Smc 6.016,07 €"
    m = _search(r"([\d\.]+)\s*(?:kWh|Smc)\s+([\d\.]+,\d{2})\s*€", testo,
                warnings, "consumo/spesa annua")
    if m:
        out["consumo_annuo"] = _num_int_dots(m.group(1)) or out.get("consumo_annuo")
        out["spesa_annua"] = _num(m.group(2))
    else:
        out["spesa_annua"] = None

    # Riga dei mesi dello storico: sequenza di soli token MM/YY.
    # (La label "Mese" della tabella NON arriva nel testo estratto.)
    storico: dict = {}
    mesi_labels: list = []
    m = re.search(r"^((?:\d{2}/\d{2}\s+)+\d{2}/\d{2})\s*$", testo, re.M)
    if m:
        mesi_labels = [_mese_breve(x) for x in m.group(1).split()]

    if tipo == "LUCE":
        # Potenza mensile: riga di soli MM/YYYY + riga "kW 23,650 22,620 ..."
        m_mesi_pot = re.search(r"^((?:\d{2}/\d{4}\s+)+\d{2}/\d{4})\s*$", testo, re.M)
        m_kw = re.search(r"^kW\s+((?:[\d\.,]+\s*)+)$", testo, re.M)
        if m_mesi_pot and m_kw:
            mesi_pot = [_mese_breve(x) for x in m_mesi_pot.group(1).split()]
            kw = [_num(x) for x in m_kw.group(1).split()]
            out["potenza_max_mensile"] = dict(zip(mesi_pot, kw))
        else:
            out["potenza_max_mensile"] = None
            warnings.append("Campo non trovato: potenza prelevata mensile")

        for fascia_label, fascia in (("Fascia 1", "F1"), ("Fascia 2", "F2"), ("Fascia 3", "F3")):
            m = re.search(rf"^{fascia_label}\s+((?:[\d\.]+\s*)+)$", testo, re.M)
            if not m:
                warnings.append(f"Campo non trovato: storico {fascia_label}")
                continue
            valori = [_num_int_dots(x) for x in m.group(1).split()]
            if mesi_labels and len(valori) >= len(mesi_labels):
                # difesa: alcune estrazioni accodano valori spuri (assi grafico)
                valori = valori[:len(mesi_labels)]
                for mese, v in zip(mesi_labels, valori):
                    storico.setdefault(mese, {})[fascia] = v
    else:  # GAS
        for label, key in (("Reale", "reale"), ("Stimata", "stimata")):
            m = re.search(rf"^{label}\s+((?:[\d\.,]+\s*)+)$", testo, re.M)
            if not m:
                warnings.append(f"Campo non trovato: storico gas riga {label}")
                continue
            valori = [_num(x) for x in m.group(1).split()]
            if mesi_labels and len(valori) >= len(mesi_labels):
                valori = valori[:len(mesi_labels)]
                for mese, v in zip(mesi_labels, valori):
                    storico.setdefault(mese, {})[key] = v

    if not mesi_labels:
        warnings.append("Campo non trovato: intestazione mesi dello storico 18 mesi")
    out["storico_mensile"] = storico or None


# ─────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────

def parse_bolletta_a2a(path: str | Path) -> dict:
    """
    Parsa una bolletta A2A (luce o gas). Ritorna dict strutturato + warnings.
    Solleva UnsupportedLayoutError se il PDF non sembra una bolletta A2A.
    """
    path = Path(path)
    raw = path.read_bytes()
    fonte_hash = hashlib.sha256(raw).hexdigest()

    with pdfplumber.open(path) as pdf:
        testi = [(p.extract_text() or "") for p in pdf.pages]

    if not testi or "A2A" not in testi[0] or "Bolletta" not in testi[0]:
        raise UnsupportedLayoutError(
            f"{path.name}: non riconosciuto come bolletta A2A (layout diverso o scansione)"
        )

    if "Energia Elettrica" in testi[0]:
        tipo = "LUCE"
    elif re.search(r"\bGas\b", testi[0]):
        tipo = "GAS"
    else:
        raise UnsupportedLayoutError(f"{path.name}: tipo fornitura non riconosciuto (né luce né gas)")

    warnings: list = []
    out: dict = {
        "tipo": tipo,
        "fornitore": "A2A Energia",
        "fonte_pdf": path.name,
        "fonte_hash": fonte_hash,
    }

    t1 = testi[0]
    t2 = testi[1] if len(testi) > 1 else ""
    t3 = testi[2] if len(testi) > 2 else ""
    t4 = testi[3] if len(testi) > 3 else ""

    _parse_pagina1(t1, out, warnings)
    _parse_scontrino(t2, out, warnings)
    _parse_box_offerta(t2, out, warnings)

    if tipo == "LUCE":
        _parse_letture_luce(t3, out, warnings)
        _parse_storico(t4, tipo, out, warnings)
    else:
        _parse_letture_gas(t3, out, warnings)
        _parse_storico(t3, tipo, out, warnings)

    out["unita"] = out.get("unita") or ("kWh" if tipo == "LUCE" else "Smc")
    out["warnings"] = warnings
    return out
