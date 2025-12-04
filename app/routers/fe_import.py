# @version: v1.0
# -*- coding: utf-8 -*-
"""
Router per importazione fatture elettroniche XML (uso statistico / controllo acquisti).
"""

import datetime
import hashlib
import xml.etree.ElementTree as ET
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.fe_import import FEFattura, FERiga
from app.schemas.fe_import import FEFatturaDetailOut, FEFatturaOut, FERigaOut

router = APIRouter(
    prefix="/contabilita/fe",
    tags=["contabilita-fe"],
)


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


@router.post(
    "/import",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Importa uno o più file XML di fattura elettronica",
)
async def import_fatture_xml(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    importate: list[dict] = []
    gia_presenti: list[dict] = []

    for file in files:
        content = await file.read()
        if not content:
            continue

        xml_hash = hashlib.sha256(content).hexdigest()

        # controllo duplicati
        existing = (
            db.query(FEFattura).filter(FEFattura.xml_hash == xml_hash).one_or_none()
        )
        if existing:
            gia_presenti.append(
                {
                    "filename": file.filename,
                    "fattura_id": existing.id,
                    "fornitore": existing.fornitore_nome,
                    "numero_fattura": existing.numero_fattura,
                    "data_fattura": str(existing.data_fattura),
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

        data_fattura = None
        if data_fattura_str:
            try:
                data_fattura = datetime.date.fromisoformat(data_fattura_str)
            except ValueError:
                data_fattura = None

        imponibile_str = _find_text(root, "ImponibileImporto")
        iva_str = _find_text(root, "Imposta")
        totale_str = _find_text(root, "ImportoTotaleDocumento")

        imponibile_totale = _to_float(imponibile_str)
        iva_totale = _to_float(iva_str)
        totale_fattura = _to_float(totale_str)

        now = datetime.datetime.now()

        fattura = FEFattura(
            fornitore_nome=fornitore_nome or "Sconosciuto",
            fornitore_piva=fornitore_piva,
            numero_fattura=numero_fattura,
            data_fattura=data_fattura,
            imponibile_totale=imponibile_totale,
            iva_totale=iva_totale,
            totale_fattura=totale_fattura,
            valuta="EUR",
            xml_hash=xml_hash,
            xml_filename=file.filename,
            data_import=now,
        )

        db.add(fattura)
        db.flush()  # per avere fattura.id

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

            riga = FERiga(
                fattura_id=fattura.id,
                numero_linea=numero_linea,
                descrizione=descrizione,
                quantita=_to_float(quantita_str),
                unita_misura=um,
                prezzo_unitario=_to_float(prezzo_unitario_str),
                prezzo_totale=_to_float(prezzo_totale_str),
                aliquota_iva=_to_float(aliquota_str),
                categoria_grezza=None,
                note_analisi=None,
            )
            db.add(riga)

        db.commit()
        db.refresh(fattura)

        importate.append(
            {
                "filename": file.filename,
                "fattura_id": fattura.id,
                "fornitore": fattura.fornitore_nome,
                "numero_fattura": fattura.numero_fattura,
                "data_fattura": str(fattura.data_fattura),
                "totale_fattura": fattura.totale_fattura,
            }
        )

    return {
        "importate": importate,
        "gia_presenti": gia_presenti,
    }


@router.get(
    "/fatture",
    response_model=List[FEFatturaOut],
    summary="Elenco fatture elettroniche importate",
)
def list_fatture(
    db: Session = Depends(get_db),
):
    fatture = (
        db.query(FEFattura)
        .order_by(FEFattura.data_fattura.desc().nullslast(), FEFattura.id.desc())
        .all()
    )
    return fatture


@router.get(
    "/fatture/{fattura_id}",
    response_model=FEFatturaDetailOut,
    summary="Dettaglio di una fattura con righe",
)
def get_fattura_detail(
    fattura_id: int,
    db: Session = Depends(get_db),
):
    fattura = db.query(FEFattura).filter(FEFattura.id == fattura_id).one_or_none()
    if not fattura:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fattura non trovata"
        )
    return fattura


@router.get(
    "/fatture/{fattura_id}/righe",
    response_model=List[FERigaOut],
    summary="Righe dettagliate di una fattura",
)
def get_fattura_righe(
    fattura_id: int,
    db: Session = Depends(get_db),
):
    righe = db.query(FERiga).filter(FERiga.fattura_id == fattura_id).all()
    return righe
