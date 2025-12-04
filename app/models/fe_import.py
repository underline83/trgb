# @version: v1.0
# -*- coding: utf-8 -*-
"""
Modelli SQLAlchemy per import fatture elettroniche (uso statistico).
"""

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class FEFattura(Base):
    __tablename__ = "fe_fatture"

    id = Column(Integer, primary_key=True, index=True)
    fornitore_nome = Column(String, nullable=False)
    fornitore_piva = Column(String, nullable=True)
    numero_fattura = Column(String, nullable=True, index=True)
    data_fattura = Column(Date, nullable=True, index=True)

    imponibile_totale = Column(Float, nullable=True)
    iva_totale = Column(Float, nullable=True)
    totale_fattura = Column(Float, nullable=True)
    valuta = Column(String, nullable=False, default="EUR")

    xml_hash = Column(String, unique=True, index=True)
    xml_filename = Column(String, nullable=True)
    data_import = Column(DateTime, nullable=False)

    righe = relationship(
        "FERiga",
        back_populates="fattura",
        cascade="all, delete-orphan",
        lazy="joined",
    )


class FERiga(Base):
    __tablename__ = "fe_righe"

    id = Column(Integer, primary_key=True, index=True)
    fattura_id = Column(Integer, ForeignKey("fe_fatture.id"), nullable=False, index=True)

    numero_linea = Column(Integer, nullable=True)
    descrizione = Column(String, nullable=True)
    quantita = Column(Float, nullable=True)
    unita_misura = Column(String, nullable=True)
    prezzo_unitario = Column(Float, nullable=True)
    prezzo_totale = Column(Float, nullable=True)
    aliquota_iva = Column(Float, nullable=True)

    categoria_grezza = Column(String, nullable=True)
    note_analisi = Column(String, nullable=True)

    fattura = relationship("FEFattura", back_populates="righe")
