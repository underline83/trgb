# @version: v1.0-reparti
# -*- coding: utf-8 -*-
"""
Router Reparti — TRGB Gestionale (Turni v2)

Gestisce i reparti operativi dell'osteria (SALA, CUCINA, …).
I reparti definiscono:
- orari standard pranzo/cena (usati dal Foglio Settimana come default)
- pause staff in minuti (scalate dal calcolo ore lavorate)
- colore/icona per la UI (tab del foglio)

Ogni dipendente appartiene a un reparto (`dipendenti.reparto_id`).

DB: dipendenti.sqlite3, tabella `reparti` (creata da migrazione 071).
Auth: tutti gli endpoint richiedono JWT.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.dipendenti_db import get_dipendenti_conn, init_dipendenti_db
from app.services.auth_service import get_current_user


router = APIRouter(prefix="/reparti", tags=["Reparti"])

# Inizializza DB alla prima importazione (idempotente)
init_dipendenti_db()


# ============================================================
# MODELLI
# ============================================================
class RepartoBase(BaseModel):
    codice: str = Field(..., description="Codice univoco, es. SALA, CUCINA")
    nome: str
    icona: Optional[str] = None          # emoji
    colore: Optional[str] = None         # HEX
    ordine: int = 0
    attivo: bool = True

    # Orari standard del reparto
    pranzo_inizio: Optional[str] = None   # "HH:MM"
    pranzo_fine: Optional[str] = None
    cena_inizio: Optional[str] = None
    cena_fine: Optional[str] = None

    # Pause staff (minuti da scalare dal calcolo ore nette)
    pausa_pranzo_min: int = 30
    pausa_cena_min: int = 30


class RepartoCreate(RepartoBase):
    pass


class RepartoUpdate(RepartoBase):
    pass


SELECT_COLS = """
    id, codice, nome, icona, colore, ordine, attivo,
    pranzo_inizio, pranzo_fine, cena_inizio, cena_fine,
    pausa_pranzo_min, pausa_cena_min,
    created_at, updated_at
"""


def _row_to_dict(row) -> Dict[str, Any]:
    d = dict(row)
    d["attivo"] = bool(d["attivo"])
    return d


# ============================================================
# GET /reparti/
# ============================================================
@router.get("/", response_class=JSONResponse)
def list_reparti(
    include_inactive: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    cur = conn.cursor()
    if include_inactive:
        cur.execute(f"SELECT {SELECT_COLS} FROM reparti ORDER BY ordine, nome")
    else:
        cur.execute(
            f"SELECT {SELECT_COLS} FROM reparti WHERE attivo = 1 ORDER BY ordine, nome"
        )
    rows = [_row_to_dict(r) for r in cur.fetchall()]
    conn.close()
    return JSONResponse(content=rows)


# ============================================================
# GET /reparti/{id}
# ============================================================
@router.get("/{reparto_id}", response_class=JSONResponse)
def get_reparto(
    reparto_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    cur = conn.cursor()
    cur.execute(f"SELECT {SELECT_COLS} FROM reparti WHERE id = ?", (reparto_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Reparto non trovato")
    return JSONResponse(content=_row_to_dict(row))


# ============================================================
# POST /reparti/
# ============================================================
@router.post("/", response_class=JSONResponse)
def create_reparto(
    payload: RepartoCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO reparti
              (codice, nome, icona, colore, ordine, attivo,
               pranzo_inizio, pranzo_fine, cena_inizio, cena_fine,
               pausa_pranzo_min, pausa_cena_min)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.codice.strip().upper(),
                payload.nome.strip(),
                payload.icona.strip() if payload.icona else None,
                payload.colore.strip() if payload.colore else None,
                payload.ordine,
                1 if payload.attivo else 0,
                payload.pranzo_inizio,
                payload.pranzo_fine,
                payload.cena_inizio,
                payload.cena_fine,
                max(0, int(payload.pausa_pranzo_min or 0)),
                max(0, int(payload.pausa_cena_min or 0)),
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
    except Exception as e:
        conn.rollback()
        if "UNIQUE constraint failed: reparti.codice" in str(e):
            raise HTTPException(status_code=400, detail="Codice reparto già esistente.")
        raise HTTPException(status_code=500, detail=f"Errore inserimento reparto: {e}")

    cur.execute(f"SELECT {SELECT_COLS} FROM reparti WHERE id = ?", (new_id,))
    row = cur.fetchone()
    conn.close()
    return JSONResponse(content=_row_to_dict(row))


# ============================================================
# PUT /reparti/{id}
# ============================================================
@router.put("/{reparto_id}", response_class=JSONResponse)
def update_reparto(
    reparto_id: int,
    payload: RepartoUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM reparti WHERE id = ?", (reparto_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Reparto non trovato")
    try:
        cur.execute(
            """
            UPDATE reparti SET
              codice = ?, nome = ?, icona = ?, colore = ?,
              ordine = ?, attivo = ?,
              pranzo_inizio = ?, pranzo_fine = ?,
              cena_inizio = ?, cena_fine = ?,
              pausa_pranzo_min = ?, pausa_cena_min = ?
            WHERE id = ?
            """,
            (
                payload.codice.strip().upper(),
                payload.nome.strip(),
                payload.icona.strip() if payload.icona else None,
                payload.colore.strip() if payload.colore else None,
                payload.ordine,
                1 if payload.attivo else 0,
                payload.pranzo_inizio,
                payload.pranzo_fine,
                payload.cena_inizio,
                payload.cena_fine,
                max(0, int(payload.pausa_pranzo_min or 0)),
                max(0, int(payload.pausa_cena_min or 0)),
                reparto_id,
            ),
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        if "UNIQUE constraint failed: reparti.codice" in str(e):
            raise HTTPException(status_code=400, detail="Codice reparto già esistente.")
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento reparto: {e}")

    cur.execute(f"SELECT {SELECT_COLS} FROM reparti WHERE id = ?", (reparto_id,))
    row = cur.fetchone()
    conn.close()
    return JSONResponse(content=_row_to_dict(row))


# ============================================================
# DELETE /reparti/{id}  (soft delete: attivo=0)
# ============================================================
@router.delete("/{reparto_id}", response_class=JSONResponse)
def soft_delete_reparto(
    reparto_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM reparti WHERE id = ?", (reparto_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Reparto non trovato")

    # Blocca l'eliminazione se esistono dipendenti attivi associati
    cur.execute(
        "SELECT COUNT(*) FROM dipendenti WHERE reparto_id = ? AND attivo = 1",
        (reparto_id,)
    )
    count = cur.fetchone()[0]
    if count > 0:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"Reparto ha {count} dipendenti attivi. Riassegnali prima di disattivarlo."
        )

    cur.execute("UPDATE reparti SET attivo = 0 WHERE id = ?", (reparto_id,))
    conn.commit()
    conn.close()
    return JSONResponse(content={"status": "ok", "message": "Reparto disattivato"})
