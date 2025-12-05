# @version: v1.1-sqlite-fe
# -*- coding: utf-8 -*-
"""
Router per importazione fatture elettroniche XML (uso statistico / controllo acquisti).

- Salva i dati nelle tabelle:
    fe_fatture
    fe_righe

- Usa il DB: app/data/foodcost.db
"""

import datetime
import hashlib
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

router = APIRouter(
    prefix="/contabilita/fe",
    tags=["contabilita-fe"],
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


def _to_float(v: str | None) -> float | None:
    if v is None:
        return None
    v = v.replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


# -------------------------------------------------------------------
# ENDPOINTS PRINCIPALI
# -------------------------------------------------------------------

@router.post(
    "/import",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Importa uno o più file XML di fattura elettronica",
)
async def import_fatture_xml(
    files: List[UploadFile] = File(...),
):
    """
    Importa uno o più file XML di fattura elettronica nel DB foodcost.db.
    Evita duplicati usando un hash del contenuto XML.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    importate: List[Dict[str, Any]] = []
    gia_presenti: List[Dict[str, Any]] = []

    for file in files:
        content = await file.read()
        if not content:
            continue

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
                    "filename": file.filename,
                    "fattura_id": existing["id"],
                    "fornitore": existing["fornitore_nome"],
                    "numero_fattura": existing["numero_fattura"],
                    "data_fattura": existing["data_fattura"],
                }
            )
            continue

        # parsing XML
        try:
            root = ET.fromstring(content)
        except ET.ParseError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File {file.filename}: XML non valido",
            )

        # HEADER: fornitore, numero, data
        fornitore_nome = _find_text(root, "Denominazione") or _find_text(
            root, "Nome"
        )
        fornitore_piva = _find_text(root, "IdCodice") or _find_text(
            root, "CodiceFiscale"
        )

        numero_fattura = _find_text(root, "Numero")
        data_fattura_str = _find_text(root, "Data")

        imponibile_str = _find_text(root, "ImponibileImporto")
        iva_str = _find_text(root, "Imposta")
        totale_str = _find_text(root, "ImportoTotaleDocumento")

        imponibile_totale = _to_float(imponibile_str)
        iva_totale = _to_float(iva_str)
        totale_fattura = _to_float(totale_str)

        now = datetime.datetime.now().isoformat(sep=" ", timespec="seconds")

        # Inserimento fattura
        cur.execute(
            """
            INSERT INTO fe_fatture (
                fornitore_nome, fornitore_piva,
                numero_fattura, data_fattura,
                imponibile_totale, iva_totale, totale_fattura,
                valuta, xml_hash, xml_filename, data_import
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            ,
            (
                fornitore_nome or "Sconosciuto",
                fornitore_piva,
                numero_fattura,
                data_fattura_str,  # salvo stringa ISO originale
                imponibile_totale,
                iva_totale,
                totale_fattura,
                "EUR",
                xml_hash,
                file.filename,
                now,
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
                """
                ,
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
                "filename": file.filename,
                "fattura_id": fattura_id,
                "fornitore": fornitore_nome or "Sconosciuto",
                "numero_fattura": numero_fattura,
                "data_fattura": data_fattura_str,
                "totale_fattura": totale_fattura,
            }
        )

    conn.close()

    return {
        "importate": importate,
        "gia_presenti": gia_presenti,
    }


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
    where_clauses: list[str] = ["data_fattura IS NOT NULL"]

    if year is not None:
        where_clauses.append("substr(data_fattura, 1, 4) = ?")
        params.append(str(year))

    where_sql = " AND ".join(where_clauses)

    cur.execute(
        f"""
        SELECT
            fornitore_nome,
            fornitore_piva,
            COUNT(*) AS numero_fatture,
            SUM(COALESCE(totale_fattura, 0)) AS totale_fatture,
            MIN(data_fattura) AS primo_acquisto,
            MAX(data_fattura) AS ultimo_acquisto
        FROM fe_fatture
        WHERE {where_sql}
        GROUP BY fornitore_nome, fornitore_piva
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
                substr(data_fattura, 1, 4) AS anno,
                substr(data_fattura, 6, 2) AS mese,
                COUNT(*) AS numero_fatture,
                SUM(COALESCE(totale_fattura, 0)) AS totale_fatture
            FROM fe_fatture
            WHERE data_fattura IS NOT NULL
              AND substr(data_fattura, 1, 4) = ?
            GROUP BY anno, mese
            ORDER BY mese ASC
            """,
            (str(year),),
        )
    else:
        cur.execute(
            """
            SELECT
                substr(data_fattura, 1, 4) AS anno,
                substr(data_fattura, 6, 2) AS mese,
                COUNT(*) AS numero_fatture,
                SUM(COALESCE(totale_fattura, 0)) AS totale_fatture
            FROM fe_fatture
            WHERE data_fattura IS NOT NULL
            GROUP BY anno, mese
            ORDER BY anno DESC, mese ASC
            """
        )

    rows = cur.fetchall()
    conn.close()

    return [dict(r) for r in rows]
