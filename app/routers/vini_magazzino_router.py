# @version: v1.0-beta
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Router Magazzino Vini
File: app/routers/vini_magazzino_router.py

Funzionalità (prima tranche):
- Elenco / ricerca vini (con filtri base)
- Inserimento nuovo vino
- Tutto agganciato a utente loggato (JWT)

ATTENZIONE:
- Usa ancora la tabella `vini` esistente.
- Il “doppio binario” Excel vs Magazzino verrà strutturato in passaggi successivi.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.models.vini_db import get_connection, init_database
from app.services.auth_service import get_current_user  # presupposto: già esiste
from app.schemas.user_schema import UserSchema  # presupposto: schema utente base

router = APIRouter(prefix="/vini-magazzino", tags=["Magazzino Vini"])


# ---------------------------------------------------------
# SCHEMI Pydantic
# ---------------------------------------------------------
class VinoBase(BaseModel):
    tipologia: Optional[str] = Field(None, description="TIPOLOGIA")
    nazione: Optional[str] = Field(None, description="NAZIONE")
    codice: Optional[str] = Field(None, description="CODICE interno o etichetta")
    regione: Optional[str] = Field(None, description="REGIONE")
    carta: Optional[bool] = Field(
        True, description="Se il vino è in carta (True → 'SI', False → 'NO')"
    )
    descrizione: str = Field(..., description="Nome vino / cuvée")
    annata: Optional[str] = Field(None, description="ANNATA")
    produttore: Optional[str] = Field(None, description="PRODUTTORE")
    prezzo: Optional[float] = Field(None, description="Prezzo al cliente")
    formato: Optional[str] = Field(None, description="FORMATO codice (BT, MG, DM, ...)")
    qta: int = Field(0, description="Quantità a magazzino")


class VinoCreate(VinoBase):
    """Payload per creazione vino a magazzino."""
    pass


class VinoOut(VinoBase):
    id: int

    class Config:
        from_attributes = True


class ViniListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: List[VinoOut]


# ---------------------------------------------------------
# UTILITY
# ---------------------------------------------------------
def _bool_to_carta(value: Optional[bool]) -> Optional[str]:
    if value is None:
        return None
    return "SI" if value else "NO"


# ---------------------------------------------------------
# ENDPOINT: LISTA / RICERCA VINI
# ---------------------------------------------------------
@router.get("/vini", response_model=ViniListResponse)
def lista_vini_magazzino(
    q: Optional[str] = Query(
        None,
        description="Ricerca libera su PRODUTTORE / DESCRIZIONE / REGIONE / NAZIONE",
    ),
    tipologia: Optional[str] = Query(None),
    nazione: Optional[str] = Query(None),
    regione: Optional[str] = Query(None),
    solo_in_carta: bool = Query(False, description="Solo vini con CARTA='SI'"),
    esauriti: bool = Query(
        False, description="Solo vini con QTA <= 0 (ignorato se specificato diversamente)"
    ),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: UserSchema = Depends(get_current_user),
):
    """
    Restituisce una lista paginata di vini partendo dalla tabella `vini`.

    Filtri:
    - q           → match LIKE su PRODUTTORE / DESCRIZIONE / REGIONE / NAZIONE
    - tipologia   → filtro esatto su TIPOLOGIA
    - nazione     → filtro esatto su NAZIONE
    - regione     → filtro esatto su REGIONE
    - solo_in_carta → CARTA = 'SI'
    - esauriti    → QTA <= 0 (se True)
    """
    init_database()
    conn = get_connection()
    cur = conn.cursor()

    where = []
    params: list = []

    if q:
        like = f"%{q.strip()}%"
        where.append(
            "(PRODUTTORE LIKE ? OR DESCRIZIONE LIKE ? OR REGIONE LIKE ? OR NAZIONE LIKE ?)"
        )
        params.extend([like, like, like, like])

    if tipologia:
        where.append("TIPOLOGIA = ?")
        params.append(tipologia)

    if nazione:
        where.append("NAZIONE = ?")
        params.append(nazione)

    if regione:
        where.append("REGIONE = ?")
        params.append(regione)

    if solo_in_carta:
        where.append("CARTA = 'SI'")

    if esauriti:
        where.append("QTA <= 0")

    where_clause = ""
    if where:
        where_clause = "WHERE " + " AND ".join(where)

    # Conteggio totale
    count_sql = f"SELECT COUNT(*) AS n FROM vini {where_clause};"
    row_count = cur.execute(count_sql, params).fetchone()
    total = int(row_count["n"]) if row_count else 0

    # Paginazione
    offset = (page - 1) * per_page
    list_sql = f"""
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            CODICE,
            REGIONE,
            CARTA,
            DESCRIZIONE,
            ANNATA,
            PRODUTTORE,
            PREZZO,
            FORMATO,
            QTA
        FROM vini
        {where_clause}
        ORDER BY
            TIPOLOGIA IS NULL,
            TIPOLOGIA,
            NAZIONE,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA
        LIMIT ? OFFSET ?;
    """
    params_list = params + [per_page, offset]
    rows = cur.execute(list_sql, params_list).fetchall()
    conn.close()

    items: list[VinoOut] = []
    for r in rows:
        items.append(
            VinoOut(
                id=r["id"],
                tipologia=r["TIPOLOGIA"],
                nazione=r["NAZIONE"],
                codice=r["CODICE"],
                regione=r["REGIONE"],
                carta=(r["CARTA"] == "SI") if r["CARTA"] is not None else None,
                descrizione=r["DESCRIZIONE"],
                annata=r["ANNATA"],
                produttore=r["PRODUTTORE"],
                prezzo=r["PREZZO"],
                formato=r["FORMATO"],
                qta=r["QTA"],
            )
        )

    return ViniListResponse(
        total=total,
        page=page,
        per_page=per_page,
        items=items,
    )


# ---------------------------------------------------------
# ENDPOINT: INSERIMENTO NUOVO VINO
# ---------------------------------------------------------
@router.post("/vini", response_model=VinoOut, status_code=status.HTTP_201_CREATED)
def crea_vino_magazzino(
    payload: VinoCreate,
    current_user: UserSchema = Depends(get_current_user),
):
    """
    Crea un nuovo vino nella tabella `vini`.

    - Converte `carta: bool` → 'SI'/'NO'
    - Loggare l'utente avverrà in modo completo quando agganciamo i movimenti;
      per ora l'azione è tracciata solo tramite audit log applicativo / web-server.
    """
    if not payload.descrizione.strip():
        raise HTTPException(status_code=400, detail="DESCRIZIONE obbligatoria.")

    init_database()
    conn = get_connection()
    cur = conn.cursor()

    carta_val = _bool_to_carta(payload.carta)

    cur.execute(
        """
        INSERT INTO vini (
            TIPOLOGIA,
            NAZIONE,
            CODICE,
            REGIONE,
            CARTA,
            DESCRIZIONE,
            ANNATA,
            PRODUTTORE,
            PREZZO,
            FORMATO,
            QTA
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload.tipologia,
            payload.nazione,
            payload.codice,
            payload.regione,
            carta_val,
            payload.descrizione,
            payload.annata,
            payload.produttore,
            payload.prezzo,
            payload.formato,
            payload.qta,
        ),
    )
    new_id = cur.lastrowid
    conn.commit()

    row = cur.execute(
        """
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            CODICE,
            REGIONE,
            CARTA,
            DESCRIZIONE,
            ANNATA,
            PRODUTTORE,
            PREZZO,
            FORMATO,
            QTA
        FROM vini
        WHERE id = ?;
        """,
        (new_id,),
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=500, detail="Errore interno nella creazione vino.")

    return VinoOut(
        id=row["id"],
        tipologia=row["TIPOLOGIA"],
        nazione=row["NAZIONE"],
        codice=row["CODICE"],
        regione=row["REGIONE"],
        carta=(row["CARTA"] == "SI") if row["CARTA"] is not None else None,
        descrizione=row["DESCRIZIONE"],
        annata=row["ANNATA"],
        produttore=row["PRODUTTORE"],
        prezzo=row["PREZZO"],
        formato=row["FORMATO"],
        qta=row["QTA"],
    )