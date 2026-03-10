# @version: v1.2-zip-support
# -*- coding: utf-8 -*-
"""
Router per importazione fatture elettroniche XML (uso statistico / controllo acquisti).

- Salva i dati nelle tabelle:
    fe_fatture
    fe_righe

- Usa il DB: app/data/foodcost.db
- Supporta upload di file XML singoli, multipli, e archivi ZIP contenenti XML.
"""

import datetime
import hashlib
import io
import sqlite3
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/contabilita/fe",
    tags=["contabilita-fe"],
    dependencies=[Depends(get_current_user)],
)

# -------------------------------------------------------------------
# DB HELPERS
# -------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent  # app/
DATA_DIR = BASE_DIR / "data"
FOODCOST_DB_PATH = DATA_DIR / "foodcost.db"


def _get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(FOODCOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_tables(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS fe_fatture (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            fornitore_nome    TEXT NOT NULL,
            fornitore_piva    TEXT,
            numero_fattura    TEXT,
            data_fattura      TEXT,
            imponibile_totale REAL,
            iva_totale        REAL,
            totale_fattura    REAL,
            valuta            TEXT DEFAULT 'EUR',
            xml_hash          TEXT UNIQUE,
            xml_filename      TEXT,
            data_import       TEXT
        );
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS fe_righe (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            fattura_id       INTEGER NOT NULL,
            numero_linea     INTEGER,
            descrizione      TEXT,
            quantita         REAL,
            unita_misura     TEXT,
            prezzo_unitario  REAL,
            prezzo_totale    REAL,
            aliquota_iva     REAL,
            categoria_grezza TEXT,
            note_analisi     TEXT,
            FOREIGN KEY (fattura_id) REFERENCES fe_fatture(id) ON DELETE CASCADE
        );
        """
    )

    conn.commit()


# -------------------------------------------------------------------
# XML HELPERS
# -------------------------------------------------------------------

def _find_text(root: ET.Element, tag: str) -> str | None:
    """
    Cerca il primo nodo con nome `tag` ignorando il namespace FatturaPA.
    """
    el = root.find(f".//{{*}}{tag}")
    if el is not None and el.text is not None:
        return el.text.strip()
    return None


def _find_text_in(parent: ET.Element, tag: str) -> str | None:
    """Cerca un tag dentro un parent specifico (ignora namespace)."""
    if parent is None:
        return None
    el = parent.find(f".//{{*}}{tag}")
    if el is not None and el.text is not None:
        return el.text.strip()
    return None


def _find_node(root: ET.Element, tag: str) -> ET.Element | None:
    """Trova il primo nodo con nome `tag` (ignora namespace)."""
    return root.find(f".//{{*}}{tag}")


def _extract_fornitore(root: ET.Element) -> tuple[str | None, str | None]:
    """
    Estrae il fornitore (CedentePrestatore) dalla struttura FatturaPA.

    Struttura FatturaPA:
      FatturaElettronicaHeader
        ├─ DatiTrasmissione
        │   └─ IdTrasmittente (NON e' il fornitore!)
        ├─ CedentePrestatore (= FORNITORE REALE)
        │   └─ DatiAnagrafici
        │       ├─ IdFiscaleIVA → IdCodice
        │       └─ Anagrafica → Denominazione
        └─ CessionarioCommittente (= DESTINATARIO / noi)

    Il bug precedente: _find_text(root, "Denominazione") prendeva il
    primo <Denominazione> nell'XML, che poteva essere in DatiTrasmissione
    o CessionarioCommittente invece che in CedentePrestatore.
    """
    cedente = _find_node(root, "CedentePrestatore")
    if cedente is not None:
        nome = _find_text_in(cedente, "Denominazione")
        if nome is None:
            # Persona fisica: Nome + Cognome
            n = _find_text_in(cedente, "Nome")
            c = _find_text_in(cedente, "Cognome")
            if n and c:
                nome = f"{n} {c}"
            elif c:
                nome = c

        piva = _find_text_in(cedente, "IdCodice")
        if piva is None:
            piva = _find_text_in(cedente, "CodiceFiscale")

        return nome, piva

    # Fallback: vecchio metodo (per XML non standard)
    nome = _find_text(root, "Denominazione") or _find_text(root, "Nome")
    piva = _find_text(root, "IdCodice") or _find_text(root, "CodiceFiscale")
    return nome, piva


def _to_float(v: str | None) -> float | None:
    if v is None:
        return None
    v = v.replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


# -------------------------------------------------------------------
# ZIP HELPERS
# -------------------------------------------------------------------

def _extract_xmls_from_zip(zip_content: bytes, zip_filename: str) -> List[tuple[str, bytes]]:
    """
    Estrae tutti i file .xml da un archivio ZIP (anche annidato in sottocartelle).
    Supporta anche ZIP contenenti altri ZIP (un livello).
    Ritorna lista di (filename, content).
    """
    results: List[tuple[str, bytes]] = []
    try:
        with zipfile.ZipFile(io.BytesIO(zip_content)) as zf:
            for entry in zf.namelist():
                lower = entry.lower()
                # salta directory e file nascosti (es. __MACOSX)
                if entry.endswith("/") or "/__MACOSX" in entry or entry.startswith("__MACOSX"):
                    continue
                if lower.endswith(".xml"):
                    xml_data = zf.read(entry)
                    # usa solo il nome file, non il path interno allo zip
                    fname = entry.split("/")[-1] if "/" in entry else entry
                    results.append((fname, xml_data))
                elif lower.endswith(".zip"):
                    # ZIP annidato — un livello di ricorsione
                    inner_zip = zf.read(entry)
                    try:
                        inner_results = _extract_xmls_from_zip(inner_zip, entry)
                        results.extend(inner_results)
                    except Exception:
                        pass  # ZIP corrotto interno, skip
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File {zip_filename}: archivio ZIP non valido o corrotto",
        )
    return results


def _process_single_xml(
    content: bytes,
    filename: str,
    cur: sqlite3.Cursor,
    conn: sqlite3.Connection,
    importate: List[Dict[str, Any]],
    gia_presenti: List[Dict[str, Any]],
    errori: List[Dict[str, Any]],
) -> None:
    """
    Processa un singolo XML di fattura: dedup, parse, inserisci in DB.
    """
    if not content:
        return

    xml_hash = hashlib.sha256(content).hexdigest()

    # controllo duplicati
    cur.execute(
        "SELECT id, fornitore_nome, numero_fattura, data_fattura "
        "FROM fe_fatture WHERE xml_hash = ?",
        (xml_hash,),
    )
    existing = cur.fetchone()
    if existing:
        gia_presenti.append(
            {
                "filename": filename,
                "fattura_id": existing["id"],
                "fornitore": existing["fornitore_nome"],
                "numero_fattura": existing["numero_fattura"],
                "data_fattura": existing["data_fattura"],
            }
        )
        return

    # parsing XML
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        errori.append({"filename": filename, "errore": "XML non valido"})
        return

    # HEADER: tipo documento, fornitore, numero, data
    tipo_documento = _find_text(root, "TipoDocumento")  # TD01, TD04, TD16-TD19, ...

    # Autofatture: TD16-TD21, TD27 — il CedentePrestatore e' noi stessi
    AUTOFATTURA_TYPES = {"TD16", "TD17", "TD18", "TD19", "TD20", "TD21", "TD27"}
    is_autofattura = 1 if tipo_documento in AUTOFATTURA_TYPES else 0

    # Fornitore: estrai specificamente da CedentePrestatore
    fornitore_nome, fornitore_piva = _extract_fornitore(root)

    numero_fattura = _find_text(root, "Numero")
    data_fattura_str = _find_text(root, "Data")

    imponibile_str = _find_text(root, "ImponibileImporto")
    iva_str = _find_text(root, "Imposta")
    totale_str = _find_text(root, "ImportoTotaleDocumento")

    imponibile_totale = _to_float(imponibile_str)
    iva_totale = _to_float(iva_str)
    totale_fattura = _to_float(totale_str)

    now = datetime.datetime.now().isoformat(sep=" ", timespec="seconds")

    cur.execute(
        """
        INSERT INTO fe_fatture (
            fornitore_nome, fornitore_piva,
            numero_fattura, data_fattura,
            imponibile_totale, iva_totale, totale_fattura,
            valuta, xml_hash, xml_filename, data_import,
            tipo_documento, is_autofattura
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            fornitore_nome or "Sconosciuto",
            fornitore_piva,
            numero_fattura,
            data_fattura_str,
            imponibile_totale,
            iva_totale,
            totale_fattura,
            "EUR",
            xml_hash,
            filename,
            now,
            tipo_documento,
            is_autofattura,
        ),
    )
    fattura_id = cur.lastrowid

    # Righe fattura
    dettaglio_linee = root.findall(".//{*}DettaglioLinee")

    for line in dettaglio_linee:
        numero_linea_str = _find_text(line, "NumeroLinea")
        descrizione = _find_text(line, "Descrizione")
        quantita_str = _find_text(line, "Quantita")
        prezzo_unitario_str = _find_text(line, "PrezzoUnitario")
        prezzo_totale_str = _find_text(line, "PrezzoTotale")
        um = _find_text(line, "UnitaMisura")
        aliquota_str = _find_text(line, "AliquotaIVA")

        numero_linea = int(numero_linea_str) if numero_linea_str else None

        cur.execute(
            """
            INSERT INTO fe_righe (
                fattura_id, numero_linea, descrizione,
                quantita, unita_misura,
                prezzo_unitario, prezzo_totale, aliquota_iva,
                categoria_grezza, note_analisi
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fattura_id,
                numero_linea,
                descrizione,
                _to_float(quantita_str),
                um,
                _to_float(prezzo_unitario_str),
                _to_float(prezzo_totale_str),
                _to_float(aliquota_str),
                None,
                None,
            ),
        )

    conn.commit()

    importate.append(
        {
            "filename": filename,
            "fattura_id": fattura_id,
            "fornitore": fornitore_nome or "Sconosciuto",
            "numero_fattura": numero_fattura,
            "data_fattura": data_fattura_str,
            "totale_fattura": totale_fattura,
        }
    )


# -------------------------------------------------------------------
# ENDPOINTS PRINCIPALI
# -------------------------------------------------------------------

@router.post(
    "/import",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Importa file XML e/o ZIP di fatture elettroniche",
)
async def import_fatture_xml(
    files: List[UploadFile] = File(...),
):
    """
    Importa fatture elettroniche nel DB foodcost.db.
    Accetta:
    - File XML singoli o multipli (FatturaPA)
    - Archivi ZIP contenenti file XML (anche in sottocartelle)
    - Mix di XML e ZIP nella stessa richiesta
    Evita duplicati usando un hash SHA256 del contenuto XML.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    importate: List[Dict[str, Any]] = []
    gia_presenti: List[Dict[str, Any]] = []
    errori: List[Dict[str, Any]] = []

    for file in files:
        content = await file.read()
        if not content:
            continue

        fname = file.filename or "unknown"
        lower = fname.lower()

        if lower.endswith(".zip"):
            # estrai tutti gli XML dallo ZIP
            xml_entries = _extract_xmls_from_zip(content, fname)
            for xml_name, xml_content in xml_entries:
                _process_single_xml(
                    xml_content, xml_name, cur, conn,
                    importate, gia_presenti, errori,
                )
        elif lower.endswith(".xml"):
            _process_single_xml(
                content, fname, cur, conn,
                importate, gia_presenti, errori,
            )
        else:
            errori.append({"filename": fname, "errore": "Formato non supportato (solo XML e ZIP)"})

    conn.close()

    result: Dict[str, Any] = {
        "importate": importate,
        "gia_presenti": gia_presenti,
    }
    if errori:
        result["errori"] = errori

    return result


@router.delete(
    "/fatture",
    summary="Svuota tutte le fatture importate (reset completo)",
)
def reset_fatture():
    """
    Elimina tutte le fatture e righe dal DB.
    Utile per reimportare da zero.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()
    cur.execute("DELETE FROM fe_righe")
    cur.execute("DELETE FROM fe_fatture")
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Tutte le fatture sono state eliminate."}


@router.get(
    "/fatture",
    response_model=List[Dict[str, Any]],
    summary="Elenco fatture elettroniche importate",
)
def list_fatture():
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            id, fornitore_nome, fornitore_piva,
            numero_fattura, data_fattura,
            imponibile_totale, iva_totale, totale_fattura,
            valuta, xml_filename, data_import
        FROM fe_fatture
        ORDER BY
            COALESCE(data_fattura, '') DESC,
            id DESC
        """
    )
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


@router.get(
    "/fatture/{fattura_id}",
    response_model=Dict[str, Any],
    summary="Dettaglio di una fattura con righe",
)
def get_fattura_detail(fattura_id: int):
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            id, fornitore_nome, fornitore_piva,
            numero_fattura, data_fattura,
            imponibile_totale, iva_totale, totale_fattura,
            valuta, xml_filename, data_import
        FROM fe_fatture
        WHERE id = ?
        """,
        (fattura_id,),
    )
    fattura = cur.fetchone()
    if not fattura:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fattura non trovata"
        )

    cur.execute(
        """
        SELECT
            id, fattura_id,
            numero_linea, descrizione,
            quantita, unita_misura,
            prezzo_unitario, prezzo_totale,
            aliquota_iva, categoria_grezza, note_analisi
        FROM fe_righe
        WHERE fattura_id = ?
        ORDER BY numero_linea ASC, id ASC
        """,
        (fattura_id,),
    )
    righe = cur.fetchall()
    conn.close()

    return {
        **dict(fattura),
        "righe": [dict(r) for r in righe],
    }


# -------------------------------------------------------------------
# ENDPOINT STATISTICHE
# -------------------------------------------------------------------

@router.get(
    "/stats/fornitori",
    summary="Riepilogo acquisti per fornitore",
)
def stats_fornitori(
    year: int | None = Query(None, description="Anno di riferimento (es. 2025)"),
):
    """
    Ritorna un riepilogo per fornitore:
    - numero fatture
    - totale acquisti
    - primo / ultimo acquisto
    Filtrabile per anno (sulla data fattura).
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    params: list = []
    where_clauses: list[str] = ["f.data_fattura IS NOT NULL", "COALESCE(f.is_autofattura, 0) = 0"]

    if year is not None:
        where_clauses.append("substr(f.data_fattura, 1, 4) = ?")
        params.append(str(year))

    where_sql = " AND ".join(where_clauses)

    cur.execute(
        f"""
        SELECT
            f.fornitore_nome,
            f.fornitore_piva,
            COUNT(*) AS numero_fatture,
            SUM(COALESCE(f.totale_fattura, 0)) AS totale_fatture,
            MIN(f.data_fattura) AS primo_acquisto,
            MAX(f.data_fattura) AS ultimo_acquisto
        FROM fe_fatture f
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        WHERE {where_sql}
          AND COALESCE(fc.escluso, 0) = 0
        GROUP BY f.fornitore_nome, f.fornitore_piva
        ORDER BY totale_fatture DESC
        """,
        params,
    )

    rows = cur.fetchall()
    conn.close()

    return [dict(r) for r in rows]


@router.get(
    "/stats/mensili",
    summary="Riepilogo acquisti mensili per anno",
)
def stats_mensili(
    year: int | None = Query(None, description="Anno di riferimento (es. 2025)"),
):
    """
    Riepilogo mensile (per anno) degli acquisti:
    - numero fatture
    - totale fatture per mese
    Se year è None, ritorna tutti gli anni presenti.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    if year is not None:
        cur.execute(
            """
            SELECT
                substr(f.data_fattura, 1, 4) AS anno,
                substr(f.data_fattura, 6, 2) AS mese,
                COUNT(*) AS numero_fatture,
                SUM(COALESCE(f.totale_fattura, 0)) AS totale_fatture
            FROM fe_fatture f
            LEFT JOIN fe_fornitore_categoria fc
                ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
                OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
            WHERE f.data_fattura IS NOT NULL
              AND substr(f.data_fattura, 1, 4) = ?
              AND COALESCE(fc.escluso, 0) = 0
              AND COALESCE(f.is_autofattura, 0) = 0
            GROUP BY anno, mese
            ORDER BY mese ASC
            """,
            (str(year),),
        )
    else:
        cur.execute(
            """
            SELECT
                substr(f.data_fattura, 1, 4) AS anno,
                substr(f.data_fattura, 6, 2) AS mese,
                COUNT(*) AS numero_fatture,
                SUM(COALESCE(f.totale_fattura, 0)) AS totale_fatture
            FROM fe_fatture f
            LEFT JOIN fe_fornitore_categoria fc
                ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
                OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
            WHERE f.data_fattura IS NOT NULL
              AND COALESCE(fc.escluso, 0) = 0
              AND COALESCE(f.is_autofattura, 0) = 0
            GROUP BY anno, mese
            ORDER BY anno DESC, mese ASC
            """
        )

    rows = cur.fetchall()
    conn.close()

    return [dict(r) for r in rows]


# -------------------------------------------------------------------
# ENDPOINT STATISTICHE AVANZATE (dashboard v2)
# -------------------------------------------------------------------

# Filtro base per escludere autofatture e fornitori esclusi
_EXCL_JOIN = """
    LEFT JOIN fe_fornitore_categoria fc
        ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
        OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
"""
_EXCL_WHERE = "COALESCE(fc.escluso, 0) = 0 AND COALESCE(f.is_autofattura, 0) = 0"


@router.get("/stats/kpi", summary="KPI principali per la dashboard")
def stats_kpi(
    year: int | None = Query(None),
):
    """
    Ritorna KPI aggregati:
    - totale_spesa, n_fatture, n_fornitori, spesa_media_mensile
    - se year != None, confronta con anno precedente (delta %)
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    def _kpi_for_year(y: int | None):
        where = f"f.data_fattura IS NOT NULL AND {_EXCL_WHERE}"
        params: list = []
        if y is not None:
            where += " AND substr(f.data_fattura, 1, 4) = ?"
            params.append(str(y))
        cur.execute(f"""
            SELECT
                ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale_spesa,
                COUNT(*) AS n_fatture,
                COUNT(DISTINCT COALESCE(f.fornitore_piva, f.fornitore_nome)) AS n_fornitori,
                COUNT(DISTINCT substr(f.data_fattura, 1, 7)) AS n_mesi
            FROM fe_fatture f {_EXCL_JOIN}
            WHERE {where}
        """, params)
        row = dict(cur.fetchone())
        n_mesi = row.pop("n_mesi", 1) or 1
        row["spesa_media_mensile"] = round((row["totale_spesa"] or 0) / n_mesi, 2)
        return row

    kpi = _kpi_for_year(year)
    kpi["year"] = year

    # Confronto anno precedente
    if year is not None:
        prev = _kpi_for_year(year - 1)
        kpi["prev_year"] = year - 1
        kpi["prev_totale_spesa"] = prev["totale_spesa"]
        if prev["totale_spesa"] and prev["totale_spesa"] > 0:
            kpi["delta_pct"] = round(
                ((kpi["totale_spesa"] or 0) - prev["totale_spesa"]) / prev["totale_spesa"] * 100, 1
            )
        else:
            kpi["delta_pct"] = None
    else:
        kpi["prev_year"] = None
        kpi["prev_totale_spesa"] = None
        kpi["delta_pct"] = None

    conn.close()
    return kpi


@router.get("/stats/per-categoria", summary="Spesa per categoria (per donut chart)")
def stats_per_categoria_dashboard(
    year: int | None = Query(None),
):
    """Totale spesa raggruppato per Cat.1 (per la donut chart)."""
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    where = f"f.data_fattura IS NOT NULL AND {_EXCL_WHERE}"
    params: list = []
    if year is not None:
        where += " AND substr(f.data_fattura, 1, 4) = ?"
        params.append(str(year))

    cur.execute(f"""
        SELECT
            COALESCE(c.nome, '(Non categorizzato)') AS categoria,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale,
            COUNT(*) AS n_fatture
        FROM fe_fatture f
        {_EXCL_JOIN}
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        WHERE {where}
        GROUP BY c.nome
        ORDER BY totale DESC
    """, params)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.get("/stats/top-fornitori", summary="Top N fornitori con barre")
def stats_top_fornitori(
    year: int | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
):
    """Top fornitori per spesa, con percentuale sul totale."""
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    where = f"f.data_fattura IS NOT NULL AND {_EXCL_WHERE}"
    params: list = []
    if year is not None:
        where += " AND substr(f.data_fattura, 1, 4) = ?"
        params.append(str(year))

    # Totale globale per calcolo %
    cur.execute(f"""
        SELECT ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale_globale
        FROM fe_fatture f {_EXCL_JOIN}
        WHERE {where}
    """, params)
    totale_globale = cur.fetchone()["totale_globale"] or 1

    cur.execute(f"""
        SELECT
            f.fornitore_nome,
            f.fornitore_piva,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale,
            COUNT(*) AS n_fatture,
            COALESCE(c.nome, '') AS categoria
        FROM fe_fatture f
        {_EXCL_JOIN}
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        WHERE {where}
        GROUP BY f.fornitore_nome, f.fornitore_piva
        ORDER BY totale DESC
        LIMIT ?
    """, params + [limit])

    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d["pct"] = round(d["totale"] / totale_globale * 100, 1) if totale_globale else 0
        rows.append(d)

    conn.close()
    return {"fornitori": rows, "totale_globale": totale_globale}


@router.get("/stats/confronto-annuale", summary="Confronto mese per mese anno corrente vs precedente")
def stats_confronto_annuale(
    year: int = Query(..., description="Anno di riferimento"),
):
    """
    Per ogni mese, ritorna spesa anno corrente e anno precedente
    per il grafico di confronto.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    results = []
    for y in [year - 1, year]:
        cur.execute(f"""
            SELECT
                substr(f.data_fattura, 6, 2) AS mese,
                ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale
            FROM fe_fatture f
            {_EXCL_JOIN}
            WHERE f.data_fattura IS NOT NULL
              AND substr(f.data_fattura, 1, 4) = ?
              AND {_EXCL_WHERE}
            GROUP BY mese
            ORDER BY mese ASC
        """, (str(y),))
        data = {r["mese"]: r["totale"] for r in cur.fetchall()}
        results.append({"year": y, "data": data})

    # Costruisci array 12 mesi
    MESI = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
    NOMI_MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    chart_data = []
    for i, m in enumerate(MESI):
        prev_val = results[0]["data"].get(m, 0) or 0
        curr_val = results[1]["data"].get(m, 0) or 0
        chart_data.append({
            "mese": NOMI_MESI[i],
            "mese_num": m,
            f"{year - 1}": prev_val,
            f"{year}": curr_val,
        })

    conn.close()
    return {"year": year, "prev_year": year - 1, "chart_data": chart_data}


@router.get("/stats/anomalie", summary="Anomalie e variazioni significative fornitori")
def stats_anomalie(
    year: int = Query(...),
    soglia_pct: float = Query(30, description="Soglia variazione % per segnalazione"),
):
    """
    Identifica fornitori con variazioni significative anno su anno:
    - Nuovi fornitori (non presenti anno precedente)
    - Fornitori scomparsi (presenti anno prec, non quest'anno)
    - Variazioni > soglia_pct
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    def _fornitori_per_anno(y):
        cur.execute(f"""
            SELECT
                COALESCE(f.fornitore_piva, f.fornitore_nome) AS chiave,
                f.fornitore_nome,
                ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale,
                COUNT(*) AS n_fatture
            FROM fe_fatture f
            {_EXCL_JOIN}
            WHERE f.data_fattura IS NOT NULL
              AND substr(f.data_fattura, 1, 4) = ?
              AND {_EXCL_WHERE}
            GROUP BY chiave
        """, (str(y),))
        return {r["chiave"]: dict(r) for r in cur.fetchall()}

    curr = _fornitori_per_anno(year)
    prev = _fornitori_per_anno(year - 1)

    anomalie = []

    # Nuovi fornitori (non in anno precedente)
    for k, v in curr.items():
        if k not in prev:
            anomalie.append({
                "tipo": "nuovo",
                "fornitore": v["fornitore_nome"],
                "totale_corrente": v["totale"],
                "totale_precedente": 0,
                "delta_pct": None,
                "n_fatture": v["n_fatture"],
            })
        else:
            p = prev[k]
            if p["totale"] and p["totale"] > 0:
                delta = round((v["totale"] - p["totale"]) / p["totale"] * 100, 1)
                if abs(delta) >= soglia_pct:
                    anomalie.append({
                        "tipo": "aumento" if delta > 0 else "diminuzione",
                        "fornitore": v["fornitore_nome"],
                        "totale_corrente": v["totale"],
                        "totale_precedente": p["totale"],
                        "delta_pct": delta,
                        "n_fatture": v["n_fatture"],
                    })

    # Fornitori scomparsi
    for k, p in prev.items():
        if k not in curr:
            anomalie.append({
                "tipo": "scomparso",
                "fornitore": p["fornitore_nome"],
                "totale_corrente": 0,
                "totale_precedente": p["totale"],
                "delta_pct": -100,
                "n_fatture": 0,
            })

    # Ordina per impatto economico
    anomalie.sort(key=lambda x: abs(x.get("totale_corrente", 0) - x.get("totale_precedente", 0)), reverse=True)

    conn.close()
    return anomalie
