# @version: v1.0-dipendenti-router
# -*- coding: utf-8 -*-
"""
Router Dipendenti & Turni — TRGB Gestionale

Funzionalità v1:
- Anagrafica dipendenti (CRUD, soft delete)
- Tipi di turno (lista + CRUD base)
- Calendario turni (lista per periodo + inserimento / modifica / cancellazione)

Autenticazione:
- Tutti gli endpoint richiedono utente loggato (JWT),
  come per gli altri moduli del gestionale.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

from app.models.dipendenti_db import get_dipendenti_conn, init_dipendenti_db
from app.services.auth_service import get_current_user


router = APIRouter(prefix="/dipendenti", tags=["Dipendenti"])

# Inizializza DB alla prima importazione del router
init_dipendenti_db()


# ============================================================
# MODELLI Pydantic — Dipendenti
# ============================================================
class DipendenteBase(BaseModel):
  codice: str = Field(..., description="Codice univoco interno, es. DIP001")
  nome: str
  cognome: str
  ruolo: str
  telefono: Optional[str] = None
  email: Optional[EmailStr] = None
  note: Optional[str] = None
  attivo: bool = True


class DipendenteCreate(DipendenteBase):
  pass


class DipendenteUpdate(DipendenteBase):
  pass


# ============================================================
# MODELLI Pydantic — Tipi di turno
# ============================================================
class TurnoTipoBase(BaseModel):
  codice: str
  nome: str
  ruolo: str
  colore_bg: str
  colore_testo: str
  ora_inizio: str  # "HH:MM"
  ora_fine: str    # "HH:MM"
  ordine: int = 0
  attivo: bool = True


class TurnoTipoCreate(TurnoTipoBase):
  pass


class TurnoTipoUpdate(TurnoTipoBase):
  pass


# ============================================================
# MODELLI Pydantic — Calendario turni
# ============================================================
class TurnoCalendarioCreate(BaseModel):
  dipendente_id: int
  turno_tipo_id: int
  data: str  # "YYYY-MM-DD"
  ora_inizio: Optional[str] = None
  ora_fine: Optional[str] = None
  stato: str = "CONFERMATO"
  note: Optional[str] = None


class TurnoCalendarioUpdate(BaseModel):
  turno_tipo_id: Optional[int] = None
  data: Optional[str] = None
  ora_inizio: Optional[str] = None
  ora_fine: Optional[str] = None
  stato: Optional[str] = None
  note: Optional[str] = None


# ============================================================
# UTILS
# ============================================================
def _validate_date_str(d: str) -> str:
  try:
    date.fromisoformat(d)
  except Exception:
    raise HTTPException(status_code=400, detail=f"Data non valida: {d}")
  return d


# ============================================================
# ENDPOINT: Anagrafica dipendenti
# ============================================================
@router.get("/", response_class=JSONResponse)
def list_dipendenti(
  include_inactive: bool = Query(False, description="Se true include anche i disattivati"),
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  if include_inactive:
    cur.execute(
      """
      SELECT id, codice, nome, cognome, ruolo,
             telefono, email, note, attivo,
             created_at, updated_at
      FROM dipendenti
      ORDER BY cognome, nome;
      """
    )
  else:
    cur.execute(
      """
      SELECT id, codice, nome, cognome, ruolo,
             telefono, email, note, attivo,
             created_at, updated_at
      FROM dipendenti
      WHERE attivo = 1
      ORDER BY cognome, nome;
      """
    )

  rows = [dict(r) for r in cur.fetchall()]
  conn.close()

  for r in rows:
    r["attivo"] = bool(r["attivo"])

  return JSONResponse(content=rows)


@router.post("/", response_class=JSONResponse)
def create_dipendente(
  payload: DipendenteCreate,
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  try:
    cur.execute(
      """
      INSERT INTO dipendenti
        (codice, nome, cognome, ruolo, telefono, email, note, attivo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (
        payload.codice.strip(),
        payload.nome.strip(),
        payload.cognome.strip(),
        payload.ruolo.strip(),
        payload.telefono.strip() if payload.telefono else None,
        payload.email if payload.email else None,
        payload.note.strip() if payload.note else None,
        1 if payload.attivo else 0,
      ),
    )
    new_id = cur.lastrowid
    conn.commit()
  except Exception as e:
    conn.rollback()
    if "UNIQUE constraint failed: dipendenti.codice" in str(e):
      raise HTTPException(
        status_code=400,
        detail="Codice dipendente già esistente.",
      )
    raise HTTPException(status_code=500, detail=f"Errore inserimento dipendente: {e}")
  finally:
    cur.execute(
      """
      SELECT id, codice, nome, cognome, ruolo,
             telefono, email, note, attivo,
             created_at, updated_at
      FROM dipendenti
      WHERE id = ?;
      """,
      (new_id,),
    )
    row = cur.fetchone()
    conn.close()

  data = dict(row)
  data["attivo"] = bool(data["attivo"])
  return JSONResponse(content=data)


@router.put("/{dipendente_id}", response_class=JSONResponse)
def update_dipendente(
  dipendente_id: int,
  payload: DipendenteUpdate,
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  cur.execute("SELECT id FROM dipendenti WHERE id = ?;", (dipendente_id,))
  if not cur.fetchone():
    conn.close()
    raise HTTPException(status_code=404, detail="Dipendente non trovato.")

  try:
    cur.execute(
      """
      UPDATE dipendenti
      SET codice = ?,
          nome = ?,
          cognome = ?,
          ruolo = ?,
          telefono = ?,
          email = ?,
          note = ?,
          attivo = ?
      WHERE id = ?;
      """,
      (
        payload.codice.strip(),
        payload.nome.strip(),
        payload.cognome.strip(),
        payload.ruolo.strip(),
        payload.telefono.strip() if payload.telefono else None,
        payload.email if payload.email else None,
        payload.note.strip() if payload.note else None,
        1 if payload.attivo else 0,
        dipendente_id,
      ),
    )
    conn.commit()
  except Exception as e:
    conn.rollback()
    if "UNIQUE constraint failed: dipendenti.codice" in str(e):
      raise HTTPException(
        status_code=400,
        detail="Codice dipendente già esistente.",
      )
    raise HTTPException(status_code=500, detail=f"Errore aggiornamento dipendente: {e}")
  finally:
    cur.execute(
      """
      SELECT id, codice, nome, cognome, ruolo,
             telefono, email, note, attivo,
             created_at, updated_at
      FROM dipendenti
      WHERE id = ?;
      """,
      (dipendente_id,),
    )
    row = cur.fetchone()
    conn.close()

  data = dict(row)
  data["attivo"] = bool(data["attivo"])
  return JSONResponse(content=data)


@router.delete("/{dipendente_id}", response_class=JSONResponse)
def soft_delete_dipendente(
  dipendente_id: int,
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  """
  Soft delete: imposta attivo = 0, non cancella i turni storici.
  """
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  cur.execute("SELECT id FROM dipendenti WHERE id = ?;", (dipendente_id,))
  if not cur.fetchone():
    conn.close()
    raise HTTPException(status_code=404, detail="Dipendente non trovato.")

  cur.execute(
    "UPDATE dipendenti SET attivo = 0 WHERE id = ?;",
    (dipendente_id,),
  )
  conn.commit()
  conn.close()

  return JSONResponse(content={"status": "ok", "message": "Dipendente disattivato."})


# ============================================================
# ENDPOINT: Tipi di turno
# ============================================================
@router.get("/turni/tipi", response_class=JSONResponse)
def list_turni_tipi(
  include_inactive: bool = Query(False, description="Se true include anche i tipi disattivati"),
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  if include_inactive:
    cur.execute(
      """
      SELECT id, codice, nome, ruolo, colore_bg, colore_testo,
             ora_inizio, ora_fine, ordine, attivo,
             created_at, updated_at
      FROM turni_tipi
      ORDER BY ordine, nome;
      """
    )
  else:
    cur.execute(
      """
      SELECT id, codice, nome, ruolo, colore_bg, colore_testo,
             ora_inizio, ora_fine, ordine, attivo,
             created_at, updated_at
      FROM turni_tipi
      WHERE attivo = 1
      ORDER BY ordine, nome;
      """
    )

  rows = [dict(r) for r in cur.fetchall()]
  conn.close()

  for r in rows:
    r["attivo"] = bool(r["attivo"])

  return JSONResponse(content=rows)


@router.post("/turni/tipi", response_class=JSONResponse)
def create_turno_tipo(
  payload: TurnoTipoCreate,
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  try:
    cur.execute(
      """
      INSERT INTO turni_tipi (
        codice, nome, ruolo, colore_bg, colore_testo,
        ora_inizio, ora_fine, ordine, attivo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (
        payload.codice.strip(),
        payload.nome.strip(),
        payload.ruolo.strip(),
        payload.colore_bg.strip(),
        payload.colore_testo.strip(),
        payload.ora_inizio.strip(),
        payload.ora_fine.strip(),
        payload.ordine,
        1 if payload.attivo else 0,
      ),
    )
    new_id = cur.lastrowid
    conn.commit()
  except Exception as e:
    conn.rollback()
    if "UNIQUE constraint failed: turni_tipi.codice" in str(e):
      raise HTTPException(
        status_code=400,
        detail="Codice tipo turno già esistente.",
      )
    raise HTTPException(status_code=500, detail=f"Errore inserimento tipo turno: {e}")
  finally:
    cur.execute(
      """
      SELECT id, codice, nome, ruolo, colore_bg, colore_testo,
             ora_inizio, ora_fine, ordine, attivo,
             created_at, updated_at
      FROM turni_tipi
      WHERE id = ?;
      """,
      (new_id,),
    )
    row = cur.fetchone()
    conn.close()

  data = dict(row)
  data["attivo"] = bool(data["attivo"])
  return JSONResponse(content=data)


@router.put("/turni/tipi/{turno_tipo_id}", response_class=JSONResponse)
def update_turno_tipo(
  turno_tipo_id: int,
  payload: TurnoTipoUpdate,
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  cur.execute("SELECT id FROM turni_tipi WHERE id = ?;", (turno_tipo_id,))
  if not cur.fetchone():
    conn.close()
    raise HTTPException(status_code=404, detail="Tipo turno non trovato.")

  try:
    cur.execute(
      """
      UPDATE turni_tipi
      SET codice = ?,
          nome = ?,
          ruolo = ?,
          colore_bg = ?,
          colore_testo = ?,
          ora_inizio = ?,
          ora_fine = ?,
          ordine = ?,
          attivo = ?
      WHERE id = ?;
      """,
      (
        payload.codice.strip(),
        payload.nome.strip(),
        payload.ruolo.strip(),
        payload.colore_bg.strip(),
        payload.colore_testo.strip(),
        payload.ora_inizio.strip(),
        payload.ora_fine.strip(),
        payload.ordine,
        1 if payload.attivo else 0,
        turno_tipo_id,
      ),
    )
    conn.commit()
  except Exception as e:
    conn.rollback()
    if "UNIQUE constraint failed: turni_tipi.codice" in str(e):
      raise HTTPException(
        status_code=400,
        detail="Codice tipo turno già esistente.",
      )
    raise HTTPException(status_code=500, detail=f"Errore aggiornamento tipo turno: {e}")
  finally:
    cur.execute(
      """
      SELECT id, codice, nome, ruolo, colore_bg, colore_testo,
             ora_inizio, ora_fine, ordine, attivo,
             created_at, updated_at
      FROM turni_tipi
      WHERE id = ?;
      """,
      (turno_tipo_id,),
    )
    row = cur.fetchone()
    conn.close()

  data = dict(row)
  data["attivo"] = bool(data["attivo"])
  return JSONResponse(content=data)


@router.delete("/turni/tipi/{turno_tipo_id}", response_class=JSONResponse)
def delete_turno_tipo(
  turno_tipo_id: int,
  current_user: Dict[str, Any] = Depends(get_current_user),
):
  """
  Soft delete: imposta attivo = 0 per il tipo di turno.
  """
  conn = get_dipendenti_conn()
  cur = conn.cursor()

  cur.execute("SELECT id FROM turni_tipi WHERE id = ?;", (turno_tipo_id,))
  if not cur.fetchone():
    conn.close()
    raise HTTPException(status_code=404, detail="Tipo turno non trovato.")

  cur.execute(
    "UPDATE turni_tipi SET attivo = 0 WHERE id = ?;",
    (turno_tipo_id,),
  )
  conn.commit()
  conn.close()

  return JSONResponse(content={"status": "ok", "message": "Tipo turno disattivato."})


# ============================================================
# ENDPOINT: Calendario turni
# ============================================================
@router.get("/turni/calendario", response_class=JSONResponse)
def list_turni_calendario(
  from_date: Optional[str] = Query(None, alias="from"),
  t
