# @version: v1.0-fatturapa-parser
# -*- coding: utf-8 -*-
"""
Parser FatturaPA (tracciato SDI) — utility riusabile.

Serve a estrarre le righe dettaglio (DettaglioLinee) da un file
XML SDI / fattura elettronica italiana, partendo da bytes grezzi
(p7m firmati, zip, xml plain) scaricati tipicamente da
`attachment_url` di FIC.

Casistiche gestite:
  - file XML plain (`<?xml ...`)
  - file PKCS#7 firmato (`.xml.p7m`, formato CMS DER)
  - file zip contenente il XML
  - file UTF-16 (rari ma esistono)

Pubbliche:
  - extract_xml_bytes(data: bytes) -> bytes
      Normalizza un qualunque input in XML bytes "puliti".
  - parse_fatturapa(data: bytes) -> dict
      Parsa le bytes e ritorna:
        {
          "numero": str,
          "data": "YYYY-MM-DD",
          "totale_documento": float | None,
          "fornitore_piva": str,
          "fornitore_denominazione": str,
          "righe": [
             {
               "numero_linea": int,
               "codice_articolo": str,
               "descrizione": str,
               "quantita": float | None,
               "unita_misura": str,
               "prezzo_unitario": float | None,
               "prezzo_totale": float | None,
               "aliquota_iva": float | None,
               "sconto_percentuale": float | None,
             },
             ...
          ],
        }

Il parser è volutamente tollerante: ogni campo puo' essere assente
senza far fallire l'intera estrazione (la fattura sara' restituita
con quel campo None / "").
"""

from __future__ import annotations

import io
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, Optional


# ─── NORMALIZZAZIONE INPUT BYTES → XML ──────────────────────────

_XML_START_MARKERS = (
    b"<?xml",
    b"<p:FatturaElettronica",
    b"<ns2:FatturaElettronica",
    b"<ns3:FatturaElettronica",
    b"<FatturaElettronica",
)

_XML_END_MARKERS = (
    b"</p:FatturaElettronica>",
    b"</ns2:FatturaElettronica>",
    b"</ns3:FatturaElettronica>",
    b"</FatturaElettronica>",
)


def _strip_to_xml(data: bytes) -> Optional[bytes]:
    """
    Euristica: dato un blob binario (tipicamente p7m), estrae
    la parte XML cercando start/end marker. Funziona molto bene
    per i p7m di fattura elettronica italiana perche' il tracciato
    e' sempre embedded in chiaro.
    """
    start = -1
    for mk in _XML_START_MARKERS:
        idx = data.find(mk)
        if idx >= 0 and (start < 0 or idx < start):
            start = idx
    if start < 0:
        return None
    end = -1
    for mk in _XML_END_MARKERS:
        idx = data.rfind(mk)
        if idx >= 0:
            cand = idx + len(mk)
            if cand > end:
                end = cand
    if end < 0:
        return None
    return data[start:end]


def _openssl_extract(data: bytes) -> Optional[bytes]:
    """
    Fallback: usa openssl cms -verify -noverify per estrarre il
    payload da un p7m DER. Richiede openssl installato nel sistema.
    """
    try:
        # Prova prima come DER (il 95% dei p7m SDI e' DER)
        for fmt in ("DER", "PEM"):
            try:
                res = subprocess.run(
                    ["openssl", "cms", "-verify", "-noverify",
                     "-inform", fmt],
                    input=data,
                    capture_output=True,
                    timeout=10,
                    check=False,
                )
                if res.returncode == 0 and res.stdout:
                    return res.stdout
            except Exception:
                continue
        # Fallback smime (vecchie versioni openssl)
        for fmt in ("DER", "PEM"):
            try:
                res = subprocess.run(
                    ["openssl", "smime", "-verify", "-noverify",
                     "-inform", fmt],
                    input=data,
                    capture_output=True,
                    timeout=10,
                    check=False,
                )
                if res.returncode == 0 and res.stdout:
                    return res.stdout
            except Exception:
                continue
    except Exception:
        pass
    return None


def extract_xml_bytes(data: bytes) -> bytes:
    """
    Normalizza un qualunque blob ricevuto (zip, p7m, xml plain,
    utf-16) in XML bytes UTF-8 (o comunque ASCII/UTF-8 compatibile
    per un parser XML standard).

    Raises:
        ValueError: se non riesce a estrarre nulla di sensato.
    """
    if not data:
        raise ValueError("Input vuoto")

    # 1. ZIP?
    if data[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                # Cerca il primo file .xml o .p7m
                names = zf.namelist()
                target = None
                for n in names:
                    if n.lower().endswith(".xml") or n.lower().endswith(".xml.p7m"):
                        target = n
                        break
                if target is None and names:
                    target = names[0]
                if target:
                    inner = zf.read(target)
                    return extract_xml_bytes(inner)
        except Exception as e:
            raise ValueError(f"ZIP non leggibile: {e}")

    # 2. Gia' XML in chiaro?
    stripped = data.lstrip()
    if stripped.startswith(b"<?xml") or stripped.startswith(b"<"):
        # UTF-16?
        if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
            try:
                return data.decode("utf-16").encode("utf-8")
            except Exception:
                pass
        return data

    # 3. Probabile p7m (CMS DER, inizia con 0x30 0x80 o 0x30 0x82)
    # Prima provo l'estrazione euristica (veloce, no subprocess)
    xml = _strip_to_xml(data)
    if xml:
        return xml

    # 4. Fallback openssl
    xml = _openssl_extract(data)
    if xml:
        # L'output potrebbe contenere ancora prefissi CMS residui
        cleaned = _strip_to_xml(xml) or xml
        return cleaned

    raise ValueError("Impossibile estrarre XML dal blob ricevuto")


# ─── PARSER FATTURAPA ───────────────────────────────────────────

def _f(text: Optional[str]) -> Optional[float]:
    """Parse float tollerante (accetta None, stringa vuota, virgola)."""
    if text is None:
        return None
    t = text.strip().replace(",", ".")
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _i(text: Optional[str]) -> Optional[int]:
    if text is None:
        return None
    t = text.strip()
    if not t:
        return None
    try:
        return int(t)
    except ValueError:
        return None


def _text(el: Optional[ET.Element], path: str) -> str:
    """Estrae testo da un subpath, ritorna '' se mancante."""
    if el is None:
        return ""
    found = el.find(path)
    if found is None or found.text is None:
        return ""
    return found.text.strip()


def _strip_namespace(tree: ET.Element) -> ET.Element:
    """
    Rimuove i namespace XML (es. {...}FatturaElettronica → FatturaElettronica)
    per semplificare XPath. Modifica l'albero in-place e lo ritorna.
    """
    for el in tree.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return tree


def parse_fatturapa(data: bytes) -> dict[str, Any]:
    """
    Parsa un FatturaPA (XML o p7m) e ritorna dati strutturati.
    Vedi docstring modulo per lo schema del return.
    """
    xml_bytes = extract_xml_bytes(data)

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        # Ultimo tentativo: prova a togliere BOM e riparsare
        try:
            root = ET.fromstring(xml_bytes.lstrip(b"\xef\xbb\xbf"))
        except ET.ParseError:
            raise ValueError(f"XML non valido: {e}")

    root = _strip_namespace(root)

    # Percorsi standard FatturaPA
    header = root.find("FatturaElettronicaHeader")
    bodies = root.findall("FatturaElettronicaBody")
    if not bodies:
        raise ValueError("FatturaElettronicaBody mancante nel XML")

    # ── HEADER: fornitore ────────────────────────────────────
    fornitore_piva = ""
    fornitore_denom = ""
    if header is not None:
        cedente = header.find("CedentePrestatore")
        if cedente is not None:
            dati_anag = cedente.find("DatiAnagrafici")
            if dati_anag is not None:
                id_fisc = dati_anag.find("IdFiscaleIVA")
                if id_fisc is not None:
                    paese = _text(id_fisc, "IdPaese")
                    codice = _text(id_fisc, "IdCodice")
                    fornitore_piva = f"{paese}{codice}" if paese and codice else codice
                anag = dati_anag.find("Anagrafica")
                if anag is not None:
                    fornitore_denom = (
                        _text(anag, "Denominazione")
                        or f"{_text(anag, 'Nome')} {_text(anag, 'Cognome')}".strip()
                    )

    # ── BODY: prendiamo il primo (FatturaPA supporta multi-body,
    # ma nella stragrande maggioranza dei casi n=1) ───────────
    body = bodies[0]

    dati_gen = body.find("DatiGenerali/DatiGeneraliDocumento")
    numero = _text(dati_gen, "Numero")
    data_doc = _text(dati_gen, "Data")
    totale_doc = _f(_text(dati_gen, "ImportoTotaleDocumento"))

    # ── RIGHE: DatiBeniServizi/DettaglioLinee ────────────────
    righe: list[dict[str, Any]] = []
    dati_beni = body.find("DatiBeniServizi")
    if dati_beni is not None:
        for dl in dati_beni.findall("DettaglioLinee"):
            numero_linea = _i(_text(dl, "NumeroLinea")) or (len(righe) + 1)

            # Codici articolo: puo' esserci piu' di un CodiceArticolo
            # (tipicamente INTERNO, EAN, ecc.). Prendiamo il primo "INTERNO"
            # o il primo disponibile.
            codice_art = ""
            for ca in dl.findall("CodiceArticolo"):
                tipo = _text(ca, "CodiceTipo")
                valore = _text(ca, "CodiceValore")
                if tipo.upper() == "INTERNO" and valore:
                    codice_art = valore
                    break
                if not codice_art and valore:
                    codice_art = valore

            descrizione = _text(dl, "Descrizione")
            quantita = _f(_text(dl, "Quantita"))
            unita_misura = _text(dl, "UnitaMisura")
            prezzo_unitario = _f(_text(dl, "PrezzoUnitario"))
            prezzo_totale = _f(_text(dl, "PrezzoTotale"))
            aliquota_iva = _f(_text(dl, "AliquotaIVA"))

            # ScontoMaggiorazione (opzionale)
            sconto_pct = None
            sm = dl.find("ScontoMaggiorazione")
            if sm is not None:
                tipo_sm = _text(sm, "Tipo")  # SC = sconto, MG = maggiorazione
                perc = _f(_text(sm, "Percentuale"))
                if perc is not None:
                    sconto_pct = perc if tipo_sm == "SC" else -perc

            righe.append({
                "numero_linea": numero_linea,
                "codice_articolo": codice_art,
                "descrizione": descrizione,
                "quantita": quantita,
                "unita_misura": unita_misura,
                "prezzo_unitario": prezzo_unitario,
                "prezzo_totale": prezzo_totale,
                "aliquota_iva": aliquota_iva,
                "sconto_percentuale": sconto_pct,
            })

    return {
        "numero": numero,
        "data": data_doc,
        "totale_documento": totale_doc,
        "fornitore_piva": fornitore_piva,
        "fornitore_denominazione": fornitore_denom,
        "righe": righe,
    }


# ─── DOWNLOAD HELPER ────────────────────────────────────────────

def download_and_parse(url: str, timeout: int = 30) -> dict[str, Any]:
    """
    Helper: scarica da un URL pre-signed (es. attachment_url di FIC)
    e parsa direttamente. Usato nel flusso sync FIC.

    Non richiede autenticazione aggiuntiva: i URL FIC sono pre-signed.
    """
    import httpx
    r = httpx.get(url, timeout=timeout, follow_redirects=True)
    if r.status_code != 200:
        raise ValueError(f"Download fallito HTTP {r.status_code} su {url[:80]}...")
    return parse_fatturapa(r.content)
