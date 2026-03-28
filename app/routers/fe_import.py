# @version: v1.2-zip-support
# -*- coding: utf-8 -*-
"""
Router per importazione fatture elettroniche XML (uso statistico / controllo acquisti).

- Salva i dati nelle tabelle:
    fe_fatture
    fe_righe

- Usa il DB: app/data/foodcost.db
- Supporta upload di file XML singoli, multipli, e archivi ZIP contenenti XML.

LIMITI INFRASTRUTTURA:
  - Upload max: 100 MB  (nginx client_max_body_size)
  - Timeout:    600s     (nginx proxy_read_timeout + frontend AbortController 10 min)
  Se si cambia il limite, aggiornare anche:
    1. nginx config  → client_max_body_size
    2. frontend      → FattureImpostazioni.jsx (UPLOAD_TIMEOUT_MS)
    3. questo file   → docstring
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
    conn = sqlite3.connect(FOODCOST_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
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
            data_import       TEXT,
            -- Anagrafica fornitore (da XML CedentePrestatore)
            fornitore_cf      TEXT,
            fornitore_indirizzo TEXT,
            fornitore_cap     TEXT,
            fornitore_citta   TEXT,
            fornitore_provincia TEXT,
            fornitore_nazione TEXT
        );
        """
    )

    # Migrate: add columns if missing (existing DBs)
    try:
        cur.execute("SELECT fornitore_cf FROM fe_fatture LIMIT 1")
    except sqlite3.OperationalError:
        for col, typ in [
            ("fornitore_cf", "TEXT"),
            ("fornitore_indirizzo", "TEXT"),
            ("fornitore_cap", "TEXT"),
            ("fornitore_citta", "TEXT"),
            ("fornitore_provincia", "TEXT"),
            ("fornitore_nazione", "TEXT"),
        ]:
            try:
                cur.execute(f"ALTER TABLE fe_fatture ADD COLUMN {col} {typ}")
            except sqlite3.OperationalError:
                pass

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
    """Estrae nome e P.IVA dal CedentePrestatore."""
    info = _extract_fornitore_full(root)
    return info["nome"], info["piva"]


def _extract_fornitore_full(root: ET.Element) -> dict:
    """
    Estrae dati completi del fornitore (CedentePrestatore) dalla FatturaPA:
    nome, piva, cf, indirizzo, cap, citta, provincia, nazione.
    """
    result = {
        "nome": None, "piva": None, "cf": None,
        "indirizzo": None, "cap": None, "citta": None,
        "provincia": None, "nazione": None,
    }
    cedente = _find_node(root, "CedentePrestatore")
    if cedente is not None:
        nome = _find_text_in(cedente, "Denominazione")
        if nome is None:
            n = _find_text_in(cedente, "Nome")
            c = _find_text_in(cedente, "Cognome")
            if n and c:
                nome = f"{n} {c}"
            elif c:
                nome = c
        result["nome"] = nome

        piva = _find_text_in(cedente, "IdCodice")
        result["piva"] = piva
        result["cf"] = _find_text_in(cedente, "CodiceFiscale")
        if result["piva"] is None:
            result["piva"] = result["cf"]

        # Sede (indirizzo)
        sede = _find_node(cedente, "Sede")
        if sede is not None:
            result["indirizzo"] = _find_text_in(sede, "Indirizzo")
            result["cap"] = _find_text_in(sede, "CAP")
            result["citta"] = _find_text_in(sede, "Comune")
            result["provincia"] = _find_text_in(sede, "Provincia")
            result["nazione"] = _find_text_in(sede, "Nazione")
    else:
        # Fallback per XML non standard
        result["nome"] = _find_text(root, "Denominazione") or _find_text(root, "Nome")
        result["piva"] = _find_text(root, "IdCodice") or _find_text(root, "CodiceFiscale")

    return result


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

    # Fornitore: estrai specificamente da CedentePrestatore (con anagrafica completa)
    forn_info = _extract_fornitore_full(root)
    fornitore_nome = forn_info["nome"]
    fornitore_piva = forn_info["piva"]

    numero_fattura = _find_text(root, "Numero")
    data_fattura_str = _find_text(root, "Data")

    imponibile_str = _find_text(root, "ImponibileImporto")
    iva_str = _find_text(root, "Imposta")
    totale_str = _find_text(root, "ImportoTotaleDocumento")

    imponibile_totale = _to_float(imponibile_str)
    iva_totale = _to_float(iva_str)
    totale_fattura = _to_float(totale_str)

    now = datetime.datetime.now().isoformat(sep=" ", timespec="seconds")

    # ── Deduplica cross-fonte: se la fattura esiste già da FIC, aggiorna con hash XML ──
    # Strategia:
    #   1. Match esatto: piva + numero + data (fatture FIC con numero compilato)
    #   2. Fallback: piva + data + totale (fatture FIC con numero vuoto)
    fic_existing = None
    if fornitore_piva and data_fattura_str:
        if numero_fattura:
            cur.execute(
                """
                SELECT id FROM fe_fatture
                WHERE fornitore_piva = ?
                  AND numero_fattura = ?
                  AND data_fattura = ?
                  AND COALESCE(fonte, 'xml') = 'fic'
                """,
                (fornitore_piva, numero_fattura, data_fattura_str),
            )
            fic_existing = cur.fetchone()

        # Fallback: match per piva + data + totale (FIC spesso non ha numero_fattura)
        if not fic_existing and totale_fattura is not None:
            cur.execute(
                """
                SELECT id FROM fe_fatture
                WHERE fornitore_piva = ?
                  AND data_fattura = ?
                  AND ABS(totale_fattura - ?) < 0.02
                  AND COALESCE(fonte, 'xml') = 'fic'
                """,
                (fornitore_piva, data_fattura_str, totale_fattura),
            )
            fic_existing = cur.fetchone()
        if fic_existing:
            fic_id = fic_existing["id"]
            # La fattura è già presente da FIC — arricchisci con dati XML
            # Aggiorna campi XML + importi (XML ha i valori precisi dal SdI)
            update_fields = [
                "xml_hash = ?", "xml_filename = ?",
                "tipo_documento = ?", "is_autofattura = ?",
            ]
            update_params = [xml_hash, filename, tipo_documento, is_autofattura]

            # Numero fattura: aggiorna se FIC non ce l'ha
            if numero_fattura:
                update_fields.append("numero_fattura = CASE WHEN numero_fattura IS NULL OR numero_fattura = '' THEN ? ELSE numero_fattura END")
                update_params.append(numero_fattura)

            if imponibile_totale is not None:
                update_fields.append("imponibile_totale = ?")
                update_params.append(imponibile_totale)
            if iva_totale is not None:
                update_fields.append("iva_totale = ?")
                update_params.append(iva_totale)
            if totale_fattura is not None:
                update_fields.append("totale_fattura = ?")
                update_params.append(totale_fattura)

            # Anagrafica fornitore da XML
            if forn_info["cf"]:
                update_fields.append("fornitore_cf = ?")
                update_params.append(forn_info["cf"])
            if forn_info["indirizzo"]:
                update_fields.append("fornitore_indirizzo = ?")
                update_params.append(forn_info["indirizzo"])
            if forn_info["cap"]:
                update_fields.append("fornitore_cap = ?")
                update_params.append(forn_info["cap"])
            if forn_info["citta"]:
                update_fields.append("fornitore_citta = ?")
                update_params.append(forn_info["citta"])
            if forn_info["provincia"]:
                update_fields.append("fornitore_provincia = ?")
                update_params.append(forn_info["provincia"])
            if forn_info["nazione"]:
                update_fields.append("fornitore_nazione = ?")
                update_params.append(forn_info["nazione"])

            update_params.append(fic_id)
            cur.execute(
                f"UPDATE fe_fatture SET {', '.join(update_fields)} WHERE id = ?",
                update_params,
            )

            # Arricchisci con righe XML se la fattura FIC non ne ha
            existing_righe = cur.execute(
                "SELECT COUNT(*) AS cnt FROM fe_righe WHERE fattura_id = ?", (fic_id,)
            ).fetchone()["cnt"]

            if existing_righe == 0:
                dettaglio_linee_fic = root.findall(".//{*}DettaglioLinee")
                righe_aggiunte = 0
                for line in dettaglio_linee_fic:
                    numero_linea_str = _find_text(line, "NumeroLinea")
                    descrizione = _find_text(line, "Descrizione")
                    quantita_str = _find_text(line, "Quantita")
                    prezzo_unitario_str = _find_text(line, "PrezzoUnitario")
                    prezzo_totale_str = _find_text(line, "PrezzoTotale")
                    um = _find_text(line, "UnitaMisura")
                    aliquota_str = _find_text(line, "AliquotaIVA")
                    numero_linea = int(numero_linea_str) if numero_linea_str else None

                    cur.execute(
                        """INSERT INTO fe_righe (
                            fattura_id, numero_linea, descrizione,
                            quantita, unita_misura,
                            prezzo_unitario, prezzo_totale, aliquota_iva,
                            categoria_grezza, note_analisi
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (fic_id, numero_linea, descrizione,
                         _to_float(quantita_str), um,
                         _to_float(prezzo_unitario_str), _to_float(prezzo_totale_str),
                         _to_float(aliquota_str), None, None),
                    )
                    righe_aggiunte += 1

                # Auto-categorizza righe arricchite
                if righe_aggiunte > 0:
                    from app.routers.fe_categorie_router import auto_categorize_righe
                    auto_categorize_righe(conn, fic_id, fornitore_piva)

                nota = f"arricchita con {righe_aggiunte} righe da XML" if righe_aggiunte > 0 else "già presente da Fatture in Cloud"
            else:
                nota = "già presente da Fatture in Cloud (righe già presenti)"

            gia_presenti.append(
                {
                    "filename": filename,
                    "fattura_id": fic_id,
                    "fornitore": fornitore_nome,
                    "numero_fattura": numero_fattura,
                    "data_fattura": data_fattura_str,
                    "nota": nota,
                }
            )
            return

    cur.execute(
        """
        INSERT INTO fe_fatture (
            fornitore_nome, fornitore_piva,
            numero_fattura, data_fattura,
            imponibile_totale, iva_totale, totale_fattura,
            valuta, xml_hash, xml_filename, data_import,
            tipo_documento, is_autofattura, fonte,
            fornitore_cf, fornitore_indirizzo, fornitore_cap,
            fornitore_citta, fornitore_provincia, fornitore_nazione
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'xml', ?, ?, ?, ?, ?, ?)
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
            forn_info["cf"],
            forn_info["indirizzo"],
            forn_info["cap"],
            forn_info["citta"],
            forn_info["provincia"],
            forn_info["nazione"],
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

    # Auto-categorizza righe in base a mapping prodotto + default fornitore
    from app.routers.fe_categorie_router import auto_categorize_righe
    auto_categorize_righe(conn, fattura_id, fornitore_piva)

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


@router.post(
    "/fatture/merge-duplicati",
    summary="Unisce fatture duplicate FIC+XML: sposta righe da XML a FIC e cancella copia XML",
)
def merge_duplicati():
    """
    Trova fatture duplicate (stessa piva + data + totale, una FIC e una XML),
    sposta righe e metadati XML nella fattura FIC, poi cancella la copia XML.
    Approccio incrementale: scorre le fatture FIC e cerca match XML uno a uno.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    # Step 1: prendi tutte le fatture FIC
    cur.execute("""
        SELECT id, fornitore_nome, fornitore_piva, data_fattura, totale_fattura, numero_fattura, xml_hash
        FROM fe_fatture
        WHERE COALESCE(fonte, 'xml') = 'fic'
    """)
    fic_rows = cur.fetchall()

    merged = []
    for fic in fic_rows:
        fic_id = fic["id"]
        piva = fic["fornitore_piva"]
        data = fic["data_fattura"]
        totale = fic["totale_fattura"]

        if not piva or not data or totale is None:
            continue

        # Se la FIC ha già xml_hash, è già stata unita
        if fic["xml_hash"]:
            continue

        # Step 2: cerca match XML per questa fattura FIC
        cur.execute("""
            SELECT id, xml_hash, xml_filename, numero_fattura,
                   tipo_documento, is_autofattura,
                   fornitore_cf, fornitore_indirizzo, fornitore_cap,
                   fornitore_citta, fornitore_provincia, fornitore_nazione
            FROM fe_fatture
            WHERE fornitore_piva = ?
              AND data_fattura = ?
              AND ABS(totale_fattura - ?) < 0.02
              AND COALESCE(fonte, 'xml') = 'xml'
              AND xml_hash IS NOT NULL
              AND id != ?
            LIMIT 1
        """, (piva, data, totale, fic_id))
        xml_row = cur.fetchone()

        if not xml_row:
            continue

        xml_id = xml_row["id"]

        # Salva valori XML prima di cancellare
        xml_hash = xml_row["xml_hash"]
        xml_filename = xml_row["xml_filename"]
        xml_numero = xml_row["numero_fattura"]
        xml_tipo = xml_row["tipo_documento"]
        xml_auto = xml_row["is_autofattura"]

        # Step 3: sposta righe da XML a FIC (se FIC non ne ha)
        fic_righe_cnt = cur.execute(
            "SELECT COUNT(*) AS cnt FROM fe_righe WHERE fattura_id = ?", (fic_id,)
        ).fetchone()["cnt"]
        xml_righe_cnt = cur.execute(
            "SELECT COUNT(*) AS cnt FROM fe_righe WHERE fattura_id = ?", (xml_id,)
        ).fetchone()["cnt"]

        if fic_righe_cnt == 0 and xml_righe_cnt > 0:
            cur.execute(
                "UPDATE fe_righe SET fattura_id = ? WHERE fattura_id = ?",
                (fic_id, xml_id),
            )
            righe_spostate = xml_righe_cnt
        else:
            righe_spostate = 0

        # Step 4: PRIMA cancella copia XML (libera vincolo UNIQUE su xml_hash)
        cur.execute("DELETE FROM fe_righe WHERE fattura_id = ?", (xml_id,))
        cur.execute("DELETE FROM fe_fatture WHERE id = ?", (xml_id,))

        # Step 5: POI aggiorna FIC con metadati XML (ora xml_hash è libero)
        cur.execute("""
            UPDATE fe_fatture SET
                xml_hash = ?, xml_filename = ?,
                numero_fattura = CASE WHEN numero_fattura IS NULL OR numero_fattura = '' THEN ? ELSE numero_fattura END,
                tipo_documento = COALESCE(?, tipo_documento),
                is_autofattura = COALESCE(?, is_autofattura)
            WHERE id = ?
        """, (xml_hash, xml_filename, xml_numero, xml_tipo, xml_auto, fic_id))

        merged.append({
            "fic_id": fic_id,
            "xml_id_rimosso": xml_id,
            "fornitore": fic["fornitore_nome"],
            "data": fic["data_fattura"],
            "totale": fic["totale_fattura"],
            "righe_spostate": righe_spostate,
        })

    conn.commit()
    conn.close()

    return {"merged": len(merged), "dettagli": merged}


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
    summary="Elenco fatture elettroniche importate con filtri",
)
def list_fatture(
    search: str | None = Query(None, description="Cerca per fornitore, numero, P.IVA"),
    year: int | None = Query(None),
    month: str | None = Query(None),
    fornitore: str | None = Query(None, description="Nome fornitore esatto"),
    fornitore_piva: str | None = Query(None, description="P.IVA fornitore esatta"),
    importo_min: float | None = Query(None),
    importo_max: float | None = Query(None),
    categoria: str | None = Query(None),
    limit: int = Query(500, ge=1, le=50000),
    offset: int = Query(0, ge=0),
):
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    where_parts = ["1=1"]
    params: list = []

    if search:
        where_parts.append(
            "(UPPER(f.fornitore_nome) LIKE ? OR f.fornitore_piva LIKE ? OR f.numero_fattura LIKE ?)"
        )
        q = f"%{search.upper()}%"
        params.extend([q, f"%{search}%", f"%{search}%"])

    if year is not None:
        where_parts.append("substr(f.data_fattura, 1, 4) = ?")
        params.append(str(year))

    if month is not None:
        where_parts.append("substr(f.data_fattura, 6, 2) = ?")
        params.append(month.zfill(2))

    if fornitore:
        where_parts.append("f.fornitore_nome = ?")
        params.append(fornitore)

    if fornitore_piva:
        where_parts.append(
            "(f.fornitore_piva = ? OR (f.fornitore_piva IS NULL AND f.fornitore_nome = ?))"
        )
        params.extend([fornitore_piva, fornitore_piva])

    if importo_min is not None:
        where_parts.append("COALESCE(f.totale_fattura, 0) >= ?")
        params.append(importo_min)

    if importo_max is not None:
        where_parts.append("COALESCE(f.totale_fattura, 0) <= ?")
        params.append(importo_max)

    need_cat_join = categoria is not None
    cat_join = ""
    if need_cat_join:
        cat_join = f"""
            {_CAT_JOIN}
            LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        """
        if categoria == "(Non categorizzato)":
            where_parts.append("fc.categoria_id IS NULL")
        else:
            where_parts.append("c.nome = ?")
            params.append(categoria)

    where_sql = " AND ".join(where_parts)

    # Count totale
    cur.execute(f"""
        SELECT COUNT(*) AS cnt, ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS tot
        FROM fe_fatture f {cat_join}
        WHERE {where_sql}
    """, params)
    summary = dict(cur.fetchone())

    cur.execute(f"""
        SELECT
            f.id, f.fornitore_nome, f.fornitore_piva,
            f.numero_fattura, f.data_fattura,
            f.imponibile_totale, f.iva_totale, f.totale_fattura,
            f.valuta, f.xml_filename, f.data_import,
            COALESCE(f.fonte, 'xml') AS fonte,
            COALESCE(f.pagato, 0) AS pagato,
            (SELECT COUNT(*) FROM fe_righe r WHERE r.fattura_id = f.id) AS n_righe,
            COALESCE(f.is_autofattura, 0) AS is_autofattura
        FROM fe_fatture f {cat_join}
        WHERE {where_sql}
        ORDER BY COALESCE(f.data_fattura, '') DESC, f.id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return {"fatture": rows, "total": summary["cnt"] or 0, "totale_importo": summary["tot"] or 0}


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
            valuta, xml_filename, data_import,
            COALESCE(fonte, 'xml') AS fonte,
            COALESCE(pagato, 0) AS pagato
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
            aliquota_iva, categoria_grezza, note_analisi,
            COALESCE(codice_articolo, '') AS codice_articolo
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
            sub.fornitore_nome,
            sub.fornitore_piva,
            sub.numero_fatture,
            sub.totale_fatture,
            sub.primo_acquisto,
            sub.ultimo_acquisto,
            fc.categoria_id,
            cat.nome AS categoria_nome
        FROM (
            SELECT
                f.fornitore_nome,
                f.fornitore_piva,
                COUNT(*) AS numero_fatture,
                SUM(COALESCE(f.totale_fattura, 0)) AS totale_fatture,
                MIN(f.data_fattura) AS primo_acquisto,
                MAX(f.data_fattura) AS ultimo_acquisto
            FROM fe_fatture f
            WHERE {where_sql}
            GROUP BY f.fornitore_nome, f.fornitore_piva
        ) sub
        LEFT JOIN fe_fornitore_categoria fc
            ON (sub.fornitore_piva IS NOT NULL AND sub.fornitore_piva != '' AND sub.fornitore_piva = fc.fornitore_piva)
            OR (COALESCE(sub.fornitore_piva, '') = '' AND sub.fornitore_nome = fc.fornitore_nome AND fc.fornitore_piva IS NULL)
        LEFT JOIN fe_categorie cat ON fc.categoria_id = cat.id
        ORDER BY sub.totale_fatture DESC
        """,
        params,
    )

    rows = [dict(r) for r in cur.fetchall()]

    # ── Conteggi righe con/senza categoria per fornitore ──
    # Per ogni fornitore conta: righe_totali, righe con categoria_id assegnata
    cat_params: list = []
    cat_where = ["f.data_fattura IS NOT NULL", "COALESCE(f.is_autofattura, 0) = 0"]
    if year is not None:
        cat_where.append("substr(f.data_fattura, 1, 4) = ?")
        cat_params.append(str(year))

    cat_where_sql = " AND ".join(cat_where)
    cur.execute(
        f"""
        SELECT
            CASE WHEN f.fornitore_piva IS NOT NULL AND f.fornitore_piva != '' THEN f.fornitore_piva ELSE f.fornitore_nome END AS forn_key,
            COUNT(r.id) AS righe_totali,
            SUM(CASE WHEN r.categoria_id IS NOT NULL THEN 1 ELSE 0 END) AS righe_categorizzate,
            SUM(CASE WHEN r.categoria_id IS NOT NULL AND COALESCE(r.categoria_auto, 0) = 1 THEN 1 ELSE 0 END) AS righe_auto
        FROM fe_righe r
        JOIN fe_fatture f ON r.fattura_id = f.id
        WHERE {cat_where_sql}
          AND COALESCE(r.prezzo_totale, 0) != 0
        GROUP BY forn_key
        """,
        cat_params,
    )
    cat_map = {r["forn_key"]: (r["righe_totali"], r["righe_categorizzate"], r["righe_auto"]) for r in cur.fetchall()}

    conn.close()

    for row in rows:
        key = row["fornitore_piva"] or row["fornitore_nome"]
        righe_tot, righe_cat, righe_auto = cat_map.get(key, (0, 0, 0))
        row["righe_totali"] = righe_tot
        row["righe_categorizzate"] = righe_cat
        row["righe_auto"] = righe_auto
        # cat_status: "ok" tutte manuali, "auto" ha ereditate, "partial" alcune, "none" nessuna, "empty" 0 righe
        if righe_tot == 0:
            row["cat_status"] = "empty"
        elif righe_cat == righe_tot and righe_auto == 0:
            row["cat_status"] = "ok"
        elif righe_cat == righe_tot and righe_auto > 0:
            row["cat_status"] = "auto"
        elif righe_cat > 0:
            row["cat_status"] = "partial"
        else:
            row["cat_status"] = "none"

    return rows


@router.get(
    "/fornitori/{fornitore_key}/anagrafica",
    summary="Anagrafica fornitore (da XML)",
)
def fornitore_anagrafica(fornitore_key: str):
    """
    Ritorna i dati anagrafici del fornitore estratti dalle fatture XML.
    Cerca per P.IVA, fallback per nome.
    Prende i dati dalla fattura più recente che li ha.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            fornitore_nome, fornitore_piva, fornitore_cf,
            fornitore_indirizzo, fornitore_cap, fornitore_citta,
            fornitore_provincia, fornitore_nazione
        FROM fe_fatture
        WHERE (fornitore_piva = ? OR fornitore_nome = ?)
          AND fornitore_indirizzo IS NOT NULL
        ORDER BY data_fattura DESC
        LIMIT 1
        """,
        (fornitore_key, fornitore_key),
    )
    row = cur.fetchone()
    conn.close()

    if row:
        return dict(row)
    return {
        "fornitore_nome": fornitore_key,
        "fornitore_piva": None,
        "fornitore_cf": None,
        "fornitore_indirizzo": None,
        "fornitore_cap": None,
        "fornitore_citta": None,
        "fornitore_provincia": None,
        "fornitore_nazione": None,
    }


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
            WHERE f.data_fattura IS NOT NULL
              AND substr(f.data_fattura, 1, 4) = ?
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
            WHERE f.data_fattura IS NOT NULL
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

# Join per categorie fornitore (usato da stats/drill e filtro categoria)
# Gestisce sia fornitore_piva NULL che "" (empty string da FIC)
_CAT_JOIN = """
    LEFT JOIN fe_fornitore_categoria fc
        ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva != '' AND f.fornitore_piva = fc.fornitore_piva)
        OR (COALESCE(f.fornitore_piva, '') = '' AND f.fornitore_nome = fc.fornitore_nome AND fc.fornitore_piva IS NULL)
"""
# Filtro base: solo autofatture escluse.
# NOTA: il campo `escluso` in fe_fornitore_categoria è SOLO per il modulo
# Ricette/Matching — NON usarlo mai nelle query acquisti/dashboard.
_EXCL_JOIN = ""
_EXCL_WHERE = "COALESCE(f.is_autofattura, 0) = 0"


@router.get("/stats/drill", summary="Drill-down fatture filtrate per mese e/o categoria")
def stats_drill(
    year: int | None = Query(None),
    month: str | None = Query(None, description="Mese in formato 01-12"),
    categoria: str | None = Query(None, description="Nome categoria (Cat.1)"),
):
    """
    Ritorna lista fatture filtrate per mese e/o categoria.
    Usato dal drill-down della dashboard quando si clicca su un mese o una fetta.
    """
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    where_parts = [f"f.data_fattura IS NOT NULL", _EXCL_WHERE]
    params: list = []

    if year is not None:
        where_parts.append("substr(f.data_fattura, 1, 4) = ?")
        params.append(str(year))

    if month is not None:
        where_parts.append("substr(f.data_fattura, 6, 2) = ?")
        params.append(month.zfill(2))

    if categoria is not None:
        if categoria == "(Non categorizzato)":
            where_parts.append("fc.categoria_id IS NULL")
        else:
            where_parts.append("c.nome = ?")
            params.append(categoria)

    where_sql = " AND ".join(where_parts)

    cur.execute(f"""
        SELECT
            f.id,
            f.fornitore_nome,
            f.fornitore_piva,
            f.numero_fattura,
            f.data_fattura,
            ROUND(COALESCE(f.totale_fattura, 0), 2) AS totale_fattura,
            COALESCE(c.nome, '') AS categoria
        FROM fe_fatture f
        {_CAT_JOIN}
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        WHERE {where_sql}
        ORDER BY f.data_fattura DESC, f.totale_fattura DESC
        LIMIT 200
    """, params)

    rows = [dict(r) for r in cur.fetchall()]

    # Calcola totale e conteggio
    cur.execute(f"""
        SELECT
            COUNT(*) AS n_fatture,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale
        FROM fe_fatture f
        {_CAT_JOIN}
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        WHERE {where_sql}
    """, params)
    summary = dict(cur.fetchone())

    conn.close()
    return {"fatture": rows, "n_fatture": summary["n_fatture"], "totale": summary["totale"]}


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

    def _kpi_for_year(y: int | None, max_date: str | None = None):
        where = f"f.data_fattura IS NOT NULL AND {_EXCL_WHERE}"
        params: list = []
        if y is not None:
            where += " AND substr(f.data_fattura, 1, 4) = ?"
            params.append(str(y))
        if max_date is not None:
            where += " AND f.data_fattura <= ?"
            params.append(max_date)
        cur.execute(f"""
            SELECT
                ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale_spesa,
                COUNT(*) AS n_fatture,
                COUNT(DISTINCT CASE WHEN f.fornitore_piva IS NOT NULL AND f.fornitore_piva != '' THEN f.fornitore_piva ELSE f.fornitore_nome END) AS n_fornitori,
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

    # Confronto anno precedente — stesso periodo (es. gen-mar 2026 vs gen-mar 2025)
    if year is not None:
        # Trova la data piu' recente nell'anno selezionato
        cur.execute(f"""
            SELECT MAX(f.data_fattura) FROM fe_fatture f
            {_EXCL_JOIN}
            WHERE substr(f.data_fattura, 1, 4) = ? AND f.data_fattura IS NOT NULL
              AND {_EXCL_WHERE}
        """, (str(year),))
        max_row = cur.fetchone()
        max_date_current = max_row[0] if max_row else None

        # Calcola la data equivalente nell'anno precedente
        prev_max_date = None
        if max_date_current:
            prev_max_date = str(year - 1) + max_date_current[4:]  # es. 2026-03-28 → 2025-03-28

        prev = _kpi_for_year(year - 1, max_date=prev_max_date)
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
    """Totale spesa raggruppato per Cat.1, con dettaglio sottocategorie."""
    conn = _get_conn()
    _ensure_tables(conn)
    cur = conn.cursor()

    where = f"f.data_fattura IS NOT NULL AND {_EXCL_WHERE}"
    params: list = []
    if year is not None:
        where += " AND substr(f.data_fattura, 1, 4) = ?"
        params.append(str(year))

    # Categorie principali
    cur.execute(f"""
        SELECT
            COALESCE(c.nome, '(Non categorizzato)') AS categoria,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale,
            COUNT(*) AS n_fatture
        FROM fe_fatture f
        {_CAT_JOIN}
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        WHERE {where}
        GROUP BY c.nome
        ORDER BY totale DESC
    """, params)
    rows = [dict(r) for r in cur.fetchall()]

    # Sottocategorie (solo dove fc.sottocategoria_id IS NOT NULL)
    cur.execute(f"""
        SELECT
            COALESCE(c.nome, '(Non categorizzato)') AS categoria,
            s.nome AS sottocategoria,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale,
            COUNT(*) AS n_fatture
        FROM fe_fatture f
        {_CAT_JOIN}
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        LEFT JOIN fe_sottocategorie s ON fc.sottocategoria_id = s.id
        WHERE {where}
          AND fc.sottocategoria_id IS NOT NULL
        GROUP BY c.nome, s.nome
        ORDER BY c.nome, totale DESC
    """, params)
    sub_rows = cur.fetchall()

    # Mappa sottocategorie per categoria
    sub_map: dict = {}
    for sr in sub_rows:
        cat_name = sr["categoria"]
        sub_map.setdefault(cat_name, []).append({
            "sottocategoria": sr["sottocategoria"],
            "totale": sr["totale"],
            "n_fatture": sr["n_fatture"],
        })

    for row in rows:
        row["sottocategorie"] = sub_map.get(row["categoria"], [])

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
        {_CAT_JOIN}
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

    # Trova la data piu' recente nell'anno selezionato per confronto stesso periodo
    cur.execute(f"""
        SELECT MAX(f.data_fattura) FROM fe_fatture f
        WHERE substr(f.data_fattura, 1, 4) = ? AND f.data_fattura IS NOT NULL
          AND {_EXCL_WHERE}
    """, (str(year),))
    max_row = cur.fetchone()
    max_date_current = max_row[0] if max_row else None
    prev_max_date = str(year - 1) + max_date_current[4:] if max_date_current else None

    def _fornitori_per_anno(y, max_date=None):
        extra = ""
        params = [str(y)]
        if max_date:
            extra = " AND f.data_fattura <= ?"
            params.append(max_date)
        cur.execute(f"""
            SELECT
                CASE WHEN f.fornitore_piva IS NOT NULL AND f.fornitore_piva != '' THEN f.fornitore_piva ELSE f.fornitore_nome END AS chiave,
                f.fornitore_nome,
                ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale,
                COUNT(*) AS n_fatture
            FROM fe_fatture f
            {_EXCL_JOIN}
            WHERE f.data_fattura IS NOT NULL
              AND substr(f.data_fattura, 1, 4) = ?
              AND {_EXCL_WHERE}
              {extra}
            GROUP BY chiave
        """, params)
        return {r["chiave"]: dict(r) for r in cur.fetchall()}

    curr = _fornitori_per_anno(year)
    prev = _fornitori_per_anno(year - 1, max_date=prev_max_date)

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
