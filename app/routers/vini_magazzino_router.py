# @version: v1.0-magazzino
# -*- coding: utf-8 -*-
"""
Router Magazzino Vini

- Endpoints per:
  - leggere i dati di un vino
  - registrare movimenti (CARICO / SCARICO / VENDITA / RETTIFICA)
  - leggere / cancellare movimenti
  - aggiungere / leggere / cancellare note
- Tutto protetto da JWT tramite get_current_user (mock auth).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Literal, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import get_current_user
from app.models.vini_db import (
    init_database,
    get_vino_by_id,
    registra_movimento,
    list_movimenti_vino,
    aggiungi_nota_vino,
    list_note_vino,
    delete_movimento,
    delete_nota,
)

router = APIRouter(prefix="/vini/magazzino", tags=["Vini Magazzino"])

# Tipo per l'utente corrente (payload del token mock)
CurrentUser = Dict[str, Any]


# ---------------------------------------------------------
# SCHEMI Pydantic
# ---------------------------------------------------------
class MovimentoCreate(BaseModel):
    tipo: Literal["CARICO", "SCARICO", "VENDITA", "RETTIFICA"]
    qta: int
    note: Optional[str] = None
    data_mov: Optional[datetime] = None  # opzionale, default = now


class NotaCreate(BaseModel):
    nota: str


# ---------------------------------------------------------
# UTILS
# ---------------------------------------------------------
def row_to_dict(row) -> Dict[str, Any]:
    return {k: row[k] for k in row.keys()}


# ---------------------------------------------------------
# INFO VINO
# ---------------------------------------------------------
@router.get("/vini/{vino_id}")
def get_vino_detail(
    vino_id: int,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Dettaglio di un vino (anagrafica + QTA).
    """
    init_database()
    row = get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")
    return row_to_dict(row)


# ---------------------------------------------------------
# MOVIMENTI
# ---------------------------------------------------------
@router.get("/vini/{vino_id}/movimenti")
def get_movimenti_vino(
    vino_id: int,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Ritorna lo storico movimenti per un vino.
    """
    init_database()
    movs = list_movimenti_vino(vino_id)
    return [row_to_dict(m) for m in movs]


@router.post("/vini/{vino_id}/movimenti", status_code=status.HTTP_201_CREATED)
def create_movimento_vino(
    vino_id: int,
    payload: MovimentoCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Registra un movimento (CARICO / SCARICO / VENDITA / RETTIFICA) per un vino.
    Logga anche l'utente nelle note (per ora, in modo semplice).
    """
    init_database()

    # Verifica esistenza vino
    if not get_vino_by_id(vino_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")

    note = payload.note or ""
    # aggiungo info utente nelle note finché non abbiamo un campo dedicato
    if current_user and current_user.get("username"):
        note = (note + f" [utente: {current_user['username']}]").strip()

    # data_mov: se non fornita, uso ora
    data_mov_str: Optional[str]
    if payload.data_mov:
        # converto in ISO string
        data_mov_str = payload.data_mov.isoformat(timespec="seconds")
    else:
        data_mov_str = None  # la funzione userà _now_iso()

    try:
        registra_movimento(
            vino_id=vino_id,
            tipo=payload.tipo,
            qta=payload.qta,
            note=note or None,
            origine="GESTIONALE",
            data_mov=data_mov_str,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {"status": "ok"}


@router.delete("/movimenti/{mov_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_movimento_vino(
    mov_id: int,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Cancella un movimento (senza ricalcolare automaticamente la QTA).
    ATTENZIONE:
    - per ora è solo hard delete; in futuro potremmo fare 'soft delete' + ricalcolo stock.
    """
    init_database()
    delete_movimento(mov_id)
    return


# ---------------------------------------------------------
# NOTE
# ---------------------------------------------------------
@router.get("/vini/{vino_id}/note")
def get_note_vino(
    vino_id: int,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Ritorna le note associate a un vino.
    """
    init_database()
    notes = list_note_vino(vino_id)
    return [row_to_dict(n) for n in notes]


@router.post("/vini/{vino_id}/note", status_code=status.HTTP_201_CREATED)
def create_nota_vino(
    vino_id: int,
    payload: NotaCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Aggiunge una nota per un vino.
    L'utente viene salvato nel campo 'autore' quando disponibile.
    """
    init_database()

    autore = current_user.get("username") if current_user else None

    try:
        aggiungi_nota_vino(
            vino_id=vino_id,
            nota=payload.nota,
            autore=autore,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {"status": "ok"}


@router.delete("/note/{nota_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_nota_vino(
    nota_id: int,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Cancella una nota.
    """
    init_database()
    delete_nota(nota_id)
    return