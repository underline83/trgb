# Modulo: vini
"""
Service: sync denominazioni vini (refactor V.6+V.7+V.8 Fase 3).

Popola/aggiorna `vini_denominazioni_v2` da 2 fonti:
1. **API eAmbrosia** (Commissione europea, sempre aggiornata):
   GET https://webgate.ec.europa.eu/eambrosia-api/api/v1/geographical-indications
   → ~3995 voci totali EU, filtrate per productType="WINE".
   Da ognuna estraiamo: codice_eambrosia (fileNumber), nome (primo protectedName),
   tipo_ue (PDO/PGI), nazione (countries[0]), link_disciplinare.

2. **PDF MASAF** (`app/data/seed_denominazioni/masaf_{dop,igp}_italiani.pdf`):
   forniscono la menzione tradizionale italiana (DOC vs DOCG vs IGT) che
   l'API non espone. Match via `codice_eambrosia` (PDO-IT-A0277, PGI-IT-A0852).

Per voci non italiane si applica un mapping euristico:
  - Francia : PDO → AOC, PGI → IGP
  - Germania: PDO → QbA, PGI → Landwein
  - Austria : PDO → DAC, PGI → Landwein
  - altre   : tipo = tipo_ue (PDO/PGI come fallback)

Idempotente: UPSERT su `codice_eambrosia` UNIQUE.

USO (endpoint admin):
  POST /vini/anagrafiche/denominazioni/sync?dry_run=true   → preview
  POST /vini/anagrafiche/denominazioni/sync                → commit
"""

from __future__ import annotations
import json
import re
import sqlite3
import subprocess
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.vini_anagrafiche_db import TABELLE
from app.models.vini_magazzino_db import get_magazzino_connection


# ============================================================
# Config
# ============================================================
EAMBROSIA_URL = "https://webgate.ec.europa.eu/eambrosia-api/api/v1/geographical-indications"

# Path dei PDF MASAF (asset di seed, copiati in repo)
SEED_DIR = Path(__file__).resolve().parent.parent / "data" / "seed_denominazioni"
PDF_DOP = SEED_DIR / "masaf_dop_italiani.pdf"
PDF_IGP = SEED_DIR / "masaf_igp_italiani.pdf"

# Mappa codice ISO nazione → nome italiano canonico
NAZIONI_MAP = {
    "IT": "Italia",
    "FR": "Francia",
    "DE": "Germania",
    "AT": "Austria",
    "ES": "Spagna",
    "PT": "Portogallo",
    "GR": "Grecia",
    "HU": "Ungheria",
    "SI": "Slovenia",
    "HR": "Croazia",
    "CH": "Svizzera",
    "RO": "Romania",
    "BG": "Bulgaria",
    "CZ": "Repubblica Ceca",
    "SK": "Slovacchia",
    "LU": "Lussemburgo",
    "GB": "Regno Unito",
    "MT": "Malta",
    "CY": "Cipro",
}

# Mapping euristico: per i paesi NON italiani, tipo "umano" derivato da tipo_ue.
# Per Italia il tipo viene preso dal PDF MASAF (DOC/DOCG/IGT).
TIPO_HEURISTICO = {
    "FR": {"PDO": "AOC", "PGI": "IGP"},
    "DE": {"PDO": "QbA", "PGI": "Landwein"},
    "AT": {"PDO": "DAC", "PGI": "Landwein"},
    "ES": {"PDO": "DO",  "PGI": "VdT"},
    "PT": {"PDO": "DOC", "PGI": "Vinho Regional"},
}


# ============================================================
# 1. Fetch eAmbrosia
# ============================================================
def fetch_eambrosia_wines() -> List[Dict[str, Any]]:
    """
    Scarica tutte le denominazioni eAmbrosia, filtra productType='WINE'.
    Ritorna lista di dict normalizzati.
    """
    req = urllib.request.Request(
        EAMBROSIA_URL,
        headers={"Accept": "application/json", "User-Agent": "TRGB/1.0"}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    wines: List[Dict[str, Any]] = []
    for entry in data:
        if entry.get("productType") != "WINE":
            continue
        if entry.get("status") != "registered":
            continue
        if entry.get("removedFlag"):
            continue
        # Skip voci third-country (extra EU) per ora
        if entry.get("thirdCountryFlag"):
            continue

        protected = entry.get("protectedNames") or []
        if not protected:
            continue
        countries = entry.get("countries") or []
        if not countries:
            continue

        # Il link al disciplinare può non esserci; lo cerchiamo nelle publications
        link = None
        pubs = entry.get("publications") or []
        for p in pubs:
            if p.get("uri", "").startswith("http"):
                link = p["uri"]
                break

        wines.append({
            "file_number": entry.get("fileNumber"),       # es. "PDO-IT-A0277"
            "nome": protected[0],                          # primo protectedName
            "alias": protected[1:] if len(protected) > 1 else [],
            "tipo_ue": entry.get("giType"),                # "PDO" / "PGI"
            "country_code": countries[0],                  # "IT" / "FR" / ...
            "eu_protection_date": entry.get("euProtectionDate"),
            "link_disciplinare": link,
        })

    return wines


# ============================================================
# 2. Parse PDF MASAF italiani
# ============================================================
_CODICE_RE = re.compile(r"((?:PDO|PGI)-IT-[A-Z0-9]+)")


def _pdftotext(pdf_path: Path) -> str:
    """Estrae testo dal PDF con layout preservato (richiede pdftotext da poppler-utils)."""
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftotext failed: {result.stderr}")
    return result.stdout


def parse_masaf_pdf(pdf_path: Path) -> Dict[str, Dict[str, str]]:
    """
    Parsa un PDF MASAF e ritorna mappa `codice_eambrosia → {menzione, regione}`.

    Strategia: per ogni riga che contiene un codice (PDO-IT-... o PGI-IT-...),
    estraggo la menzione tradizionale (DOC/DOCG/IGT) e la regione dalla stessa riga.
    """
    if not pdf_path.exists():
        return {}

    text = _pdftotext(pdf_path)
    result: Dict[str, Dict[str, str]] = {}

    # Pattern per righe con codice:
    # es. "  1   Abruzzo  DOP  DOC  PDO-IT-A0880  ABRUZZO"
    #     " 13   Alto Adige  DOP  DOC  PDO-IT-A0293  PROVINCIA AUTONOMA DI"
    # Regex: cattura espressione (DOP|IGP), menzione (DOC|DOCG|IGT), codice, regione (testo finale).
    riga_re = re.compile(
        r"(?P<espressione>DOP|IGP)\s+"
        r"(?P<menzione>DOCG|DOC|IGT)\s+"
        r"(?P<codice>(?:PDO|PGI)-IT-[A-Z0-9]+)\s+"
        r"(?P<regione>.+?)\s*$",
        re.IGNORECASE,
    )

    for line in text.splitlines():
        match = riga_re.search(line)
        if not match:
            continue
        codice = match.group("codice").strip()
        menzione = match.group("menzione").strip().upper()
        regione_raw = match.group("regione").strip()
        # Pulizia regione: TITLE CASE, rimuovi multi-spazi
        regione = re.sub(r"\s+", " ", regione_raw).strip().title()
        result[codice] = {
            "menzione": menzione,        # DOC / DOCG / IGT
            "regione": regione,           # PIEMONTE → Piemonte
        }

    return result


def parse_masaf_all() -> Dict[str, Dict[str, str]]:
    """Parsa entrambi i PDF italiani (DOP + IGP) e ritorna mappa unificata."""
    mapping: Dict[str, Dict[str, str]] = {}
    if PDF_DOP.exists():
        mapping.update(parse_masaf_pdf(PDF_DOP))
    if PDF_IGP.exists():
        mapping.update(parse_masaf_pdf(PDF_IGP))
    return mapping


# ============================================================
# 3. Compose & upsert
# ============================================================
def compose_denominazioni(
    eambrosia: List[Dict[str, Any]],
    masaf_mapping: Dict[str, Dict[str, str]],
) -> List[Dict[str, Any]]:
    """
    Combina dati eAmbrosia + PDF MASAF in lista di righe pronte per upsert.
    """
    rows: List[Dict[str, Any]] = []
    for w in eambrosia:
        cc = w["country_code"]
        nazione = NAZIONI_MAP.get(cc, cc)

        # Determinazione tipo "umano":
        if cc == "IT" and w["file_number"] in masaf_mapping:
            tipo = masaf_mapping[w["file_number"]]["menzione"]   # DOC/DOCG/IGT
            regione = masaf_mapping[w["file_number"]]["regione"]
        elif cc in TIPO_HEURISTICO:
            tipo = TIPO_HEURISTICO[cc].get(w["tipo_ue"], w["tipo_ue"])
            regione = None
        else:
            tipo = w["tipo_ue"]   # PDO o PGI come fallback
            regione = None

        rows.append({
            "codice_eambrosia": w["file_number"],
            "nome": w["nome"],
            "tipo": tipo,
            "tipo_ue": w["tipo_ue"],
            "nazione": nazione,
            "regione": regione,
            "link_disciplinare": w["link_disciplinare"],
            "attiva": 1,
            "source": "eambrosia_api",
        })
    return rows


def upsert_denominazioni(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    UPSERT su `codice_eambrosia` UNIQUE.
    Ritorna counts: inseriti, aggiornati, invariati.
    """
    if not rows:
        return {"inseriti": 0, "aggiornati": 0, "invariati": 0}

    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_ins = 0
    n_upd = 0
    n_same = 0
    now = "datetime('now')"

    for r in rows:
        codice = r["codice_eambrosia"]
        existing = cur.execute(
            f"SELECT id, nome, tipo, tipo_ue, nazione, regione, link_disciplinare "
            f"FROM {TABELLE['denominazioni']} WHERE codice_eambrosia = ?",
            (codice,),
        ).fetchone()
        if existing:
            existing_dict = dict(zip(
                ("id", "nome", "tipo", "tipo_ue", "nazione", "regione", "link_disciplinare"),
                existing,
            ))
            # Confronto valori "che contano"
            changed = any([
                existing_dict["nome"] != r["nome"],
                existing_dict["tipo"] != r["tipo"],
                existing_dict["tipo_ue"] != r["tipo_ue"],
                existing_dict["nazione"] != r["nazione"],
                existing_dict["regione"] != r["regione"],
                existing_dict["link_disciplinare"] != r["link_disciplinare"],
            ])
            if changed:
                cur.execute(
                    f"""UPDATE {TABELLE['denominazioni']}
                        SET nome=?, tipo=?, tipo_ue=?, nazione=?, regione=?,
                            link_disciplinare=?, source=?,
                            last_synced_at=datetime('now'),
                            updated_at=datetime('now')
                        WHERE id=?""",
                    (r["nome"], r["tipo"], r["tipo_ue"], r["nazione"], r["regione"],
                     r["link_disciplinare"], r["source"], existing_dict["id"]),
                )
                n_upd += 1
            else:
                # Aggiorna solo last_synced_at
                cur.execute(
                    f"UPDATE {TABELLE['denominazioni']} SET last_synced_at=datetime('now') WHERE id=?",
                    (existing_dict["id"],),
                )
                n_same += 1
        else:
            cur.execute(
                f"""INSERT INTO {TABELLE['denominazioni']}
                    (codice_eambrosia, nome, tipo, tipo_ue, nazione, regione,
                     link_disciplinare, attiva, source, last_synced_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (codice, r["nome"], r["tipo"], r["tipo_ue"], r["nazione"],
                 r["regione"], r["link_disciplinare"], r["attiva"], r["source"]),
            )
            n_ins += 1

    conn.commit()
    conn.close()
    return {"inseriti": n_ins, "aggiornati": n_upd, "invariati": n_same}


# ============================================================
# 4. Orchestratore
# ============================================================
def sync_denominazioni(dry_run: bool = False) -> Dict[str, Any]:
    """
    Pipeline completa di sync:
      1. fetch eAmbrosia
      2. parse PDF MASAF
      3. compose
      4. upsert (skipped se dry_run)
    """
    report: Dict[str, Any] = {
        "dry_run": dry_run,
        "eambrosia_voci_totali": 0,
        "masaf_voci_italiane": 0,
        "denominazioni_pronte": 0,
        "by_nazione": {},
        "by_tipo": {},
        "upsert": None,
        "warnings": [],
    }

    # 1. eAmbrosia
    try:
        eambrosia = fetch_eambrosia_wines()
        report["eambrosia_voci_totali"] = len(eambrosia)
    except Exception as e:
        report["warnings"].append(f"eAmbrosia fetch fallita: {e}")
        return report

    # 2. MASAF
    try:
        masaf = parse_masaf_all()
        report["masaf_voci_italiane"] = len(masaf)
    except FileNotFoundError as e:
        report["warnings"].append(f"PDF MASAF mancante: {e}")
        masaf = {}
    except Exception as e:
        report["warnings"].append(f"Parser MASAF fallito: {e}")
        masaf = {}

    # 3. Compose
    rows = compose_denominazioni(eambrosia, masaf)
    report["denominazioni_pronte"] = len(rows)
    # Statistiche
    by_nazione: Dict[str, int] = {}
    by_tipo: Dict[str, int] = {}
    for r in rows:
        by_nazione[r["nazione"]] = by_nazione.get(r["nazione"], 0) + 1
        by_tipo[r["tipo"]] = by_tipo.get(r["tipo"], 0) + 1
    report["by_nazione"] = dict(sorted(by_nazione.items(), key=lambda x: -x[1]))
    report["by_tipo"] = dict(sorted(by_tipo.items(), key=lambda x: -x[1]))

    # 4. Upsert (skipped se dry_run)
    if not dry_run:
        report["upsert"] = upsert_denominazioni(rows)

    return report
