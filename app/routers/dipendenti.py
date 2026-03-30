# ============================================================
# FILE: app/routers/dipendenti.py
# Router Dipendenti & Turni — COMPLETO con CRUD calendario
# ============================================================

# @version: v1.1-dipendenti-router
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

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
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
    indirizzo_via: Optional[str] = None
    indirizzo_cap: Optional[str] = None
    indirizzo_citta: Optional[str] = None
    indirizzo_provincia: Optional[str] = None
    indirizzo_paese: Optional[str] = None
    iban: Optional[str] = None
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
                   telefono, email,
                   indirizzo_via, indirizzo_cap, indirizzo_citta,
                   indirizzo_provincia, indirizzo_paese,
                   iban,
                   note, attivo,
                   created_at, updated_at
            FROM dipendenti
            ORDER BY cognome, nome;
            """
        )
    else:
        cur.execute(
            """
            SELECT id, codice, nome, cognome, ruolo,
                   telefono, email,
                   indirizzo_via, indirizzo_cap, indirizzo_citta,
                   indirizzo_provincia, indirizzo_paese,
                   iban,
                   note, attivo,
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
              (codice, nome, cognome, ruolo,
               telefono, email,
               indirizzo_via, indirizzo_cap, indirizzo_citta,
               indirizzo_provincia, indirizzo_paese,
               iban,
               note, attivo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.codice.strip(),
                payload.nome.strip(),
                payload.cognome.strip(),
                payload.ruolo.strip(),
                payload.telefono.strip() if payload.telefono else None,
                payload.email if payload.email else None,
                payload.indirizzo_via.strip() if payload.indirizzo_via else None,
                payload.indirizzo_cap.strip() if payload.indirizzo_cap else None,
                payload.indirizzo_citta.strip() if payload.indirizzo_citta else None,
                payload.indirizzo_provincia.strip() if payload.indirizzo_provincia else None,
                payload.indirizzo_paese.strip() if payload.indirizzo_paese else None,
                payload.iban.strip() if payload.iban else None,
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
                   telefono, email,
                   indirizzo_via, indirizzo_cap, indirizzo_citta,
                   indirizzo_provincia, indirizzo_paese,
                   iban,
                   note, attivo,
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
                indirizzo_via = ?,
                indirizzo_cap = ?,
                indirizzo_citta = ?,
                indirizzo_provincia = ?,
                indirizzo_paese = ?,
                iban = ?,
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
                payload.indirizzo_via.strip() if payload.indirizzo_via else None,
                payload.indirizzo_cap.strip() if payload.indirizzo_cap else None,
                payload.indirizzo_citta.strip() if payload.indirizzo_citta else None,
                payload.indirizzo_provincia.strip() if payload.indirizzo_provincia else None,
                payload.indirizzo_paese.strip() if payload.indirizzo_paese else None,
                payload.iban.strip() if payload.iban else None,
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
                   telefono, email,
                   indirizzo_via, indirizzo_cap, indirizzo_citta,
                   indirizzo_provincia, indirizzo_paese,
                   iban,
                   note, attivo,
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
# ENDPOINT: Calendario turni — LISTA
# ============================================================
@router.get("/turni/calendario", response_class=JSONResponse)
def list_turni_calendario(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    dipendente_id: Optional[int] = None,
    ruolo: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Restituisce i turni nel periodo richiesto (settimana/mese),
    con join su dipendenti e tipi di turno.
    """
    if not from_date or not to_date:
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        sunday = monday + timedelta(days=6)
        from_date = monday.isoformat()
        to_date = sunday.isoformat()

    from_date = _validate_date_str(from_date)
    to_date = _validate_date_str(to_date)

    params: List[Any] = [from_date, to_date]
    filters = ["tc.data BETWEEN ? AND ?"]

    if dipendente_id is not None:
        filters.append("tc.dipendente_id = ?")
        params.append(dipendente_id)

    if ruolo:
        filters.append("tt.ruolo = ?")
        params.append(ruolo.strip())

    where_clause = " AND ".join(filters)

    conn = get_dipendenti_conn()
    cur = conn.cursor()

    cur.execute(
        f"""
        SELECT
          tc.id,
          tc.data,
          COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
          COALESCE(tc.ora_fine, tt.ora_fine)     AS ora_fine,
          tc.stato,
          tc.note,
          d.id   AS dipendente_id,
          d.nome AS dipendente_nome,
          d.cognome AS dipendente_cognome,
          d.ruolo AS dipendente_ruolo,
          tt.id  AS turno_tipo_id,
          tt.nome AS turno_nome,
          tt.ruolo AS turno_ruolo,
          tt.colore_bg,
          tt.colore_testo
        FROM turni_calendario tc
        JOIN dipendenti d ON d.id = tc.dipendente_id
        JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
        WHERE {where_clause}
        ORDER BY tc.data, d.cognome, d.nome, tt.ordine;
        """,
        params,
    )

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return JSONResponse(content=rows)


# ============================================================
# ENDPOINT: Calendario turni — CREA / MODIFICA / CANCELLA
# ============================================================
@router.post("/turni/calendario", response_class=JSONResponse)
def create_turno_calendario(
    payload: TurnoCalendarioCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Crea un nuovo turno per un dipendente in una data.
    Se ora_inizio/ora_fine non sono specificate, usa quelle del tipo di turno.
    """
    data_str = _validate_date_str(payload.data)

    conn = get_dipendenti_conn()
    cur = conn.cursor()

    # Controllo dipendente
    cur.execute("SELECT id, attivo FROM dipendenti WHERE id = ?;", (payload.dipendente_id,))
    dip_row = cur.fetchone()
    if not dip_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Dipendente non trovato.")
    if not bool(dip_row["attivo"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Dipendente non attivo.")

    # Controllo tipo turno
    cur.execute(
        "SELECT id, ora_inizio, ora_fine, attivo FROM turni_tipi WHERE id = ?;",
        (payload.turno_tipo_id,),
    )
    tt = cur.fetchone()
    if not tt:
        conn.close()
        raise HTTPException(status_code=404, detail="Tipo turno non trovato.")
    if not bool(tt["attivo"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Tipo turno non attivo.")

    ora_inizio = payload.ora_inizio.strip() if payload.ora_inizio else tt["ora_inizio"]
    ora_fine = payload.ora_fine.strip() if payload.ora_fine else tt["ora_fine"]
    stato = payload.stato.strip() if payload.stato else "CONFERMATO"
    note = payload.note.strip() if payload.note else None

    try:
        cur.execute(
            """
            INSERT INTO turni_calendario (
              dipendente_id, turno_tipo_id, data,
              ora_inizio, ora_fine, stato, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (
                payload.dipendente_id,
                payload.turno_tipo_id,
                data_str,
                ora_inizio,
                ora_fine,
                stato,
                note,
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Errore inserimento turno: {e}")

    # Ricarico record con le join, stesso formato della lista
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
          tc.id,
          tc.data,
          COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
          COALESCE(tc.ora_fine, tt.ora_fine)     AS ora_fine,
          tc.stato,
          tc.note,
          d.id   AS dipendente_id,
          d.nome AS dipendente_nome,
          d.cognome AS dipendente_cognome,
          d.ruolo AS dipendente_ruolo,
          tt.id  AS turno_tipo_id,
          tt.nome AS turno_nome,
          tt.ruolo AS turno_ruolo,
          tt.colore_bg,
          tt.colore_testo
        FROM turni_calendario tc
        JOIN dipendenti d ON d.id = tc.dipendente_id
        JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
        WHERE tc.id = ?;
        """,
        (new_id,),
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=500, detail="Turno creato ma non trovato in lettura.")

    return JSONResponse(content=dict(row))


@router.put("/turni/calendario/{turno_id}", response_class=JSONResponse)
def update_turno_calendario(
    turno_id: int,
    payload: TurnoCalendarioUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Aggiorna un turno esistente (data, tipo, orari, stato, note).
    """
    conn = get_dipendenti_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM turni_calendario WHERE id = ?;", (turno_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Turno non trovato.")

    updates: List[str] = []
    params: List[Any] = []

    if payload.turno_tipo_id is not None:
        # Validazione tipo turno
        cur.execute(
            "SELECT id, attivo FROM turni_tipi WHERE id = ?;",
            (payload.turno_tipo_id,),
        )
        tt = cur.fetchone()
        if not tt:
            conn.close()
            raise HTTPException(status_code=404, detail="Tipo turno non trovato.")
        if not bool(tt["attivo"]):
            conn.close()
            raise HTTPException(status_code=400, detail="Tipo turno non attivo.")
        updates.append("turno_tipo_id = ?")
        params.append(payload.turno_tipo_id)

    if payload.data is not None:
        data_str = _validate_date_str(payload.data)
        updates.append("data = ?")
        params.append(data_str)

    if payload.ora_inizio is not None:
        updates.append("ora_inizio = ?")
        params.append(payload.ora_inizio.strip())

    if payload.ora_fine is not None:
        updates.append("ora_fine = ?")
        params.append(payload.ora_fine.strip())

    if payload.stato is not None:
        updates.append("stato = ?")
        params.append(payload.stato.strip())

    if payload.note is not None:
        updates.append("note = ?")
        params.append(payload.note.strip() if payload.note else None)

    if not updates:
        # Niente da aggiornare → restituisco il record corrente
        cur.execute(
            """
            SELECT
              tc.id,
              tc.data,
              COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
              COALESCE(tc.ora_fine, tt.ora_fine)     AS ora_fine,
              tc.stato,
              tc.note,
              d.id   AS dipendente_id,
              d.nome AS dipendente_nome,
              d.cognome AS dipendente_cognome,
              d.ruolo AS dipendente_ruolo,
              tt.id  AS turno_tipo_id,
              tt.nome AS turno_nome,
              tt.ruolo AS turno_ruolo,
              tt.colore_bg,
              tt.colore_testo
            FROM turni_calendario tc
            JOIN dipendenti d ON d.id = tc.dipendente_id
            JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
            WHERE tc.id = ?;
            """,
            (turno_id,),
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Turno non trovato.")
        return JSONResponse(content=dict(row))

    sql = f"UPDATE turni_calendario SET {', '.join(updates)} WHERE id = ?;"
    params.append(turno_id)

    try:
        cur.execute(sql, params)
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento turno: {e}")

    # Ricarico record aggiornato con join
    cur.execute(
        """
        SELECT
          tc.id,
          tc.data,
          COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
          COALESCE(tc.ora_fine, tt.ora_fine)     AS ora_fine,
          tc.stato,
          tc.note,
          d.id   AS dipendente_id,
          d.nome AS dipendente_nome,
          d.cognome AS dipendente_cognome,
          d.ruolo AS dipendente_ruolo,
          tt.id  AS turno_tipo_id,
          tt.nome AS turno_nome,
          tt.ruolo AS turno_ruolo,
          tt.colore_bg,
          tt.colore_testo
        FROM turni_calendario tc
        JOIN dipendenti d ON d.id = tc.dipendente_id
        JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
        WHERE tc.id = ?;
        """,
        (turno_id,),
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Turno non trovato dopo aggiornamento.")

    return JSONResponse(content=dict(row))


@router.delete("/turni/calendario/{turno_id}", response_class=JSONResponse)
def delete_turno_calendario(
    turno_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Cancellazione hard del turno (non tocca l'anagrafica).
    """
    conn = get_dipendenti_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM turni_calendario WHERE id = ?;", (turno_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Turno non trovato.")

    try:
        cur.execute("DELETE FROM turni_calendario WHERE id = ?;", (turno_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Errore cancellazione turno: {e}")

    conn.close()
    return JSONResponse(content={"status": "ok", "message": "Turno cancellato."})


# ============================================================
# SCADENZE DOCUMENTI — HACCP, corsi, visite, permessi
# ============================================================

TIPI_SCADENZA = [
    "HACCP", "SICUREZZA_GENERALE", "SICUREZZA_SPECIFICA",
    "ANTINCENDIO", "PRIMO_SOCCORSO", "VISITA_MEDICA",
    "PERMESSO_SOGGIORNO", "ALTRO",
]

TIPI_SCADENZA_LABELS = {
    "HACCP": "HACCP",
    "SICUREZZA_GENERALE": "Sicurezza generale",
    "SICUREZZA_SPECIFICA": "Sicurezza specifica",
    "ANTINCENDIO": "Antincendio",
    "PRIMO_SOCCORSO": "Primo soccorso",
    "VISITA_MEDICA": "Visita medica",
    "PERMESSO_SOGGIORNO": "Permesso di soggiorno",
    "ALTRO": "Altro",
}

ALERT_DEFAULTS = {
    "HACCP": 30,
    "SICUREZZA_GENERALE": 60,
    "SICUREZZA_SPECIFICA": 60,
    "ANTINCENDIO": 60,
    "PRIMO_SOCCORSO": 60,
    "VISITA_MEDICA": 30,
    "PERMESSO_SOGGIORNO": 90,
    "ALTRO": 30,
}


@router.get("/scadenze")
def lista_scadenze(
    dipendente_id: Optional[int] = None,
    tipo: Optional[str] = None,
    stato: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Lista scadenze documenti con stato calcolato dinamicamente."""
    conn = get_dipendenti_conn()
    query = """
        SELECT s.*, d.nome, d.cognome, d.ruolo
        FROM dipendenti_scadenze s
        JOIN dipendenti d ON d.id = s.dipendente_id
        WHERE d.attivo = 1
    """
    params = []
    if dipendente_id:
        query += " AND s.dipendente_id = ?"
        params.append(dipendente_id)
    if tipo:
        query += " AND s.tipo = ?"
        params.append(tipo)
    query += " ORDER BY s.data_scadenza ASC"

    rows = conn.execute(query, params).fetchall()
    oggi = date.today().isoformat()

    result = []
    for r in rows:
        row = dict(r)
        # Calcola stato dinamico
        alert_gg = row.get("alert_giorni") or 30
        scad = row["data_scadenza"]
        if scad < oggi:
            row["stato_calc"] = "SCADUTO"
        else:
            try:
                d_scad = date.fromisoformat(scad)
                d_alert = (d_scad - timedelta(days=alert_gg)).isoformat()
                row["stato_calc"] = "IN_SCADENZA" if oggi >= d_alert else "VALIDO"
            except ValueError:
                row["stato_calc"] = "VALIDO"
        row["tipo_label"] = TIPI_SCADENZA_LABELS.get(row["tipo"], row["tipo"])
        if stato and row["stato_calc"] != stato:
            continue
        result.append(row)

    # Riepilogo
    n_scaduti = sum(1 for r in result if r["stato_calc"] == "SCADUTO")
    n_in_scadenza = sum(1 for r in result if r["stato_calc"] == "IN_SCADENZA")
    n_validi = sum(1 for r in result if r["stato_calc"] == "VALIDO")

    conn.close()
    return {
        "scadenze": result,
        "riepilogo": {
            "totale": len(result),
            "scaduti": n_scaduti,
            "in_scadenza": n_in_scadenza,
            "validi": n_validi,
        },
        "tipi": TIPI_SCADENZA,
        "tipi_labels": TIPI_SCADENZA_LABELS,
    }


@router.post("/scadenze")
def crea_scadenza(
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Crea una nuova scadenza documento."""
    required = ["dipendente_id", "tipo", "data_scadenza"]
    for f in required:
        if not payload.get(f):
            raise HTTPException(400, f"Campo obbligatorio mancante: {f}")

    tipo = payload["tipo"]
    if tipo not in TIPI_SCADENZA:
        raise HTTPException(400, f"Tipo scadenza non valido: {tipo}")

    alert_gg = payload.get("alert_giorni") or ALERT_DEFAULTS.get(tipo, 30)

    conn = get_dipendenti_conn()
    try:
        conn.execute("""
            INSERT INTO dipendenti_scadenze
            (dipendente_id, tipo, descrizione, data_rilascio, data_scadenza,
             ente_rilascio, alert_giorni, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            payload["dipendente_id"], tipo,
            payload.get("descrizione"), payload.get("data_rilascio"),
            payload["data_scadenza"], payload.get("ente_rilascio"),
            alert_gg, payload.get("note"),
        ])
        conn.commit()
        scadenza_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    finally:
        conn.close()

    return {"ok": True, "id": scadenza_id}


@router.put("/scadenze/{scadenza_id}")
def modifica_scadenza(
    scadenza_id: int,
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Modifica una scadenza documento."""
    conn = get_dipendenti_conn()
    existing = conn.execute("SELECT id FROM dipendenti_scadenze WHERE id = ?", [scadenza_id]).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "Scadenza non trovata")

    allowed = ["tipo", "descrizione", "data_rilascio", "data_scadenza",
               "ente_rilascio", "alert_giorni", "note"]
    sets = []
    vals = []
    for k in allowed:
        if k in payload:
            sets.append(f"{k} = ?")
            vals.append(payload[k])

    if sets:
        vals.append(scadenza_id)
        conn.execute(f"UPDATE dipendenti_scadenze SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()

    conn.close()
    return {"ok": True}


@router.delete("/scadenze/{scadenza_id}")
def elimina_scadenza(
    scadenza_id: int,
    current_user=Depends(get_current_user),
):
    """Elimina una scadenza documento."""
    conn = get_dipendenti_conn()
    conn.execute("DELETE FROM dipendenti_scadenze WHERE id = ?", [scadenza_id])
    conn.commit()
    conn.close()
    return {"ok": True}


# ============================================================
# BUSTE PAGA — Import PDF cedolini, lista, generazione scadenze
# ============================================================

MESI_IT = [
    "", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]


@router.get("/buste-paga")
def lista_buste_paga(
    dipendente_id: Optional[int] = None,
    anno: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    """Lista cedolini importati."""
    conn = get_dipendenti_conn()
    query = """
        SELECT bp.*, d.nome, d.cognome, d.ruolo, d.giorno_paga
        FROM buste_paga bp
        JOIN dipendenti d ON d.id = bp.dipendente_id
        WHERE 1=1
    """
    params = []
    if dipendente_id:
        query += " AND bp.dipendente_id = ?"
        params.append(dipendente_id)
    if anno:
        query += " AND bp.anno = ?"
        params.append(anno)
    query += " ORDER BY bp.anno DESC, bp.mese DESC, d.cognome ASC"

    rows = conn.execute(query, params).fetchall()
    result = []
    for r in rows:
        row = dict(r)
        row["mese_label"] = MESI_IT[row["mese"]] if 1 <= row["mese"] <= 12 else str(row["mese"])
        result.append(row)

    # Riepilogo per anno
    totale_netto = sum(r["netto"] or 0 for r in result)
    totale_lordo = sum(r["lordo"] or 0 for r in result)

    conn.close()
    return {
        "buste_paga": result,
        "riepilogo": {
            "totale": len(result),
            "totale_netto": totale_netto,
            "totale_lordo": totale_lordo,
        },
    }


@router.post("/buste-paga")
def crea_busta_paga(
    payload: dict,
    current_user=Depends(get_current_user),
):
    """
    Crea (o aggiorna) una busta paga manualmente.
    Genera anche la scadenza nello scadenzario CG se richiesto.
    Body: { dipendente_id, mese, anno, netto, lordo?, contributi_inps?, irpef?,
            addizionali?, tfr_maturato?, ore_lavorate?, ore_straordinario?,
            note?, genera_scadenza?: bool }
    """
    required = ["dipendente_id", "mese", "anno", "netto"]
    for f in required:
        if payload.get(f) is None:
            raise HTTPException(400, f"Campo obbligatorio mancante: {f}")

    conn = get_dipendenti_conn()
    try:
        # Check se esiste già
        existing = conn.execute(
            "SELECT id FROM buste_paga WHERE dipendente_id = ? AND mese = ? AND anno = ?",
            [payload["dipendente_id"], payload["mese"], payload["anno"]]
        ).fetchone()

        if existing:
            # Update
            conn.execute("""
                UPDATE buste_paga
                SET netto = ?, lordo = ?, contributi_inps = ?, irpef = ?,
                    addizionali = ?, tfr_maturato = ?, ore_lavorate = ?,
                    ore_straordinario = ?, note = ?
                WHERE id = ?
            """, [
                payload["netto"], payload.get("lordo"),
                payload.get("contributi_inps"), payload.get("irpef"),
                payload.get("addizionali"), payload.get("tfr_maturato"),
                payload.get("ore_lavorate"), payload.get("ore_straordinario"),
                payload.get("note"), existing["id"],
            ])
            bp_id = existing["id"]
        else:
            # Insert
            conn.execute("""
                INSERT INTO buste_paga
                (dipendente_id, mese, anno, netto, lordo, contributi_inps, irpef,
                 addizionali, tfr_maturato, ore_lavorate, ore_straordinario, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                payload["dipendente_id"], payload["mese"], payload["anno"],
                payload["netto"], payload.get("lordo"),
                payload.get("contributi_inps"), payload.get("irpef"),
                payload.get("addizionali"), payload.get("tfr_maturato"),
                payload.get("ore_lavorate"), payload.get("ore_straordinario"),
                payload.get("note"),
            ])
            bp_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        conn.commit()

        # Genera scadenza nello scadenzario CG
        uscita_id = None
        if payload.get("genera_scadenza", True):
            uscita_id = _genera_scadenza_stipendio(conn, bp_id, payload)

    finally:
        conn.close()

    return {"ok": True, "id": bp_id, "uscita_id": uscita_id}


def _genera_scadenza_stipendio(conn_dip, bp_id, payload):
    """Genera una riga in cg_uscite (foodcost.db) per lo stipendio netto."""
    import sqlite3 as _sqlite3

    FOODCOST_DB = "app/data/foodcost.db"

    # Recupera dati dipendente
    dip = conn_dip.execute(
        "SELECT nome, cognome, giorno_paga FROM dipendenti WHERE id = ?",
        [payload["dipendente_id"]]
    ).fetchone()
    if not dip:
        return None

    giorno = dip["giorno_paga"] or 27
    mese = payload["mese"]
    anno = payload["anno"]
    netto = payload["netto"]
    nome_completo = f"{dip['nome']} {dip['cognome']}"

    # Calcola data scadenza stipendio
    import calendar
    max_gg = calendar.monthrange(anno, mese)[1]
    giorno_eff = min(giorno, max_gg)
    data_scadenza = f"{anno}-{mese:02d}-{giorno_eff:02d}"

    # Scrivi in foodcost.db
    fc_conn = _sqlite3.connect(FOODCOST_DB)
    fc_conn.row_factory = _sqlite3.Row
    try:
        # Check se esiste già per questo cedolino
        existing = fc_conn.execute("""
            SELECT id FROM cg_uscite
            WHERE fornitore_nome = ? AND data_scadenza = ? AND tipo_uscita = 'STIPENDIO'
        """, [f"Stipendio - {nome_completo}", data_scadenza]).fetchone()

        if existing:
            fc_conn.execute("""
                UPDATE cg_uscite SET totale = ?, importo_pagato = 0, stato = 'DA_PAGARE'
                WHERE id = ?
            """, [netto, existing["id"]])
            uscita_id = existing["id"]
        else:
            fc_conn.execute("""
                INSERT INTO cg_uscite
                (fornitore_nome, totale, data_scadenza, stato, tipo_uscita,
                 periodo_riferimento, note)
                VALUES (?, ?, ?, 'DA_PAGARE', 'STIPENDIO', ?, ?)
            """, [
                f"Stipendio - {nome_completo}",
                netto, data_scadenza,
                f"{MESI_IT[mese]} {anno}",
                f"Cedolino {MESI_IT[mese]} {anno}",
            ])
            uscita_id = fc_conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        fc_conn.commit()

        # Aggiorna riferimento in buste_paga
        conn_dip.execute("UPDATE buste_paga SET uscita_netto_id = ? WHERE id = ?", [uscita_id, bp_id])
        conn_dip.commit()

        return uscita_id
    finally:
        fc_conn.close()


@router.delete("/buste-paga/{bp_id}")
def elimina_busta_paga(
    bp_id: int,
    current_user=Depends(get_current_user),
):
    """Elimina una busta paga."""
    conn = get_dipendenti_conn()
    conn.execute("DELETE FROM buste_paga WHERE id = ?", [bp_id])
    conn.commit()
    conn.close()
    return {"ok": True}


# ============================================================
# UPLOAD PDF LUL — Import automatico cedolini
# ============================================================

def _match_dipendente(conn, cedolino: dict) -> Optional[dict]:
    """
    Cerca di abbinare un cedolino PDF a un dipendente in anagrafica.
    Strategia: prima per codice_fiscale, poi per cognome+nome (fuzzy).
    """
    cf = cedolino.get("codice_fiscale")
    if cf:
        row = conn.execute(
            "SELECT id, nome, cognome, codice_fiscale, giorno_paga FROM dipendenti WHERE codice_fiscale = ? AND attivo = 1",
            [cf]
        ).fetchone()
        if row:
            return dict(row)

    # Fallback: cerca per cognome e nome
    cognome_nome = cedolino.get("cognome_nome", "")
    if not cognome_nome:
        return None

    # Il PDF ha "COGNOME NOME", splitto e cerco
    parts = cognome_nome.split()
    if len(parts) >= 2:
        # Prova: primo token = cognome, resto = nome
        cognome = parts[0]
        nome = " ".join(parts[1:])
        row = conn.execute(
            "SELECT id, nome, cognome, codice_fiscale, giorno_paga FROM dipendenti WHERE UPPER(cognome) = ? AND UPPER(nome) LIKE ? AND attivo = 1",
            [cognome.upper(), nome.upper() + "%"]
        ).fetchone()
        if row:
            return dict(row)

        # Prova con cognome composto (primi 2 token)
        if len(parts) >= 3:
            cognome2 = " ".join(parts[:2])
            nome2 = " ".join(parts[2:])
            row = conn.execute(
                "SELECT id, nome, cognome, codice_fiscale, giorno_paga FROM dipendenti WHERE UPPER(cognome) = ? AND UPPER(nome) LIKE ? AND attivo = 1",
                [cognome2.upper(), nome2.upper() + "%"]
            ).fetchone()
            if row:
                return dict(row)

    return None


@router.post("/buste-paga/upload-pdf")
async def upload_lul_pdf(
    file: UploadFile = File(...),
    genera_scadenze: bool = Query(True, description="Genera scadenze nello scadenzario"),
    current_user=Depends(get_current_user),
):
    """
    Upload PDF LUL (Libro Unico Lavoro) dal consulente.
    Parsa i cedolini ed importa automaticamente le buste paga.

    Returns:
        importati: lista cedolini importati con successo
        non_abbinati: lista cedolini senza corrispondenza in anagrafica
        errori: lista errori durante l'import
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Il file deve essere un PDF")

    try:
        from app.utils.parse_lul import parse_lul_pdf
    except ImportError as e:
        raise HTTPException(500, f"Parser PDF non disponibile: {e}")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, "File vuoto")

    try:
        cedolini = parse_lul_pdf(file_bytes=file_bytes)
    except Exception as e:
        raise HTTPException(400, f"Errore parsing PDF: {e}")

    if not cedolini:
        raise HTTPException(400, "Nessun cedolino trovato nel PDF")

    conn = get_dipendenti_conn()
    importati = []
    non_abbinati = []
    errori = []

    try:
        for ced in cedolini:
            # Salta cedolini senza netto (conguagli a zero)
            if not ced.get("netto"):
                continue

            # Abbina a dipendente
            dip = _match_dipendente(conn, ced)
            if not dip:
                non_abbinati.append({
                    "cognome_nome": ced.get("cognome_nome", "?"),
                    "codice_fiscale": ced.get("codice_fiscale"),
                    "netto": ced.get("netto"),
                    "mese": ced.get("mese"),
                    "anno": ced.get("anno"),
                })
                continue

            try:
                # Prepara payload per crea_busta_paga logic
                addizionali = (ced.get("addizionale_regionale_rata") or 0) + \
                              (ced.get("addizionale_comunale_rata") or 0)

                mese = ced.get("mese")
                anno = ced.get("anno")
                netto = ced.get("netto")

                # Check se esiste già
                existing = conn.execute(
                    "SELECT id FROM buste_paga WHERE dipendente_id = ? AND mese = ? AND anno = ?",
                    [dip["id"], mese, anno]
                ).fetchone()

                if existing:
                    conn.execute("""
                        UPDATE buste_paga
                        SET netto = ?, lordo = ?, contributi_inps = ?, irpef = ?,
                            addizionali = ?, tfr_maturato = ?, ore_lavorate = ?,
                            note = ?, fonte = 'PDF'
                        WHERE id = ?
                    """, [
                        netto, ced.get("lordo"),
                        ced.get("contributi_inps"), ced.get("ritenute_irpef"),
                        addizionali if addizionali else None,
                        ced.get("tfr_erogato"),
                        ced.get("ore_lavorate"),
                        f"Import PDF {file.filename}",
                        existing["id"],
                    ])
                    bp_id = existing["id"]
                    azione = "aggiornato"
                else:
                    conn.execute("""
                        INSERT INTO buste_paga
                        (dipendente_id, mese, anno, netto, lordo, contributi_inps, irpef,
                         addizionali, tfr_maturato, ore_lavorate, note, fonte)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PDF')
                    """, [
                        dip["id"], mese, anno,
                        netto, ced.get("lordo"),
                        ced.get("contributi_inps"), ced.get("ritenute_irpef"),
                        addizionali if addizionali else None,
                        ced.get("tfr_erogato"),
                        ced.get("ore_lavorate"),
                        f"Import PDF {file.filename}",
                    ])
                    bp_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                    azione = "creato"

                conn.commit()

                # Genera scadenza stipendio nello scadenzario
                uscita_id = None
                if genera_scadenze:
                    payload_sc = {
                        "dipendente_id": dip["id"],
                        "mese": mese,
                        "anno": anno,
                        "netto": netto,
                    }
                    uscita_id = _genera_scadenza_stipendio(conn, bp_id, payload_sc)

                # Aggiorna codice_fiscale e IBAN se mancanti in anagrafica
                updates = []
                params_upd = []
                if ced.get("codice_fiscale") and not dip.get("codice_fiscale"):
                    updates.append("codice_fiscale = ?")
                    params_upd.append(ced["codice_fiscale"])
                if ced.get("iban"):
                    # Aggiorna sempre l'IBAN (potrebbe cambiare)
                    updates.append("iban = ?")
                    params_upd.append(ced["iban"])
                if updates:
                    params_upd.append(dip["id"])
                    conn.execute(
                        f"UPDATE dipendenti SET {', '.join(updates)} WHERE id = ?",
                        params_upd
                    )
                    conn.commit()

                importati.append({
                    "dipendente_id": dip["id"],
                    "cognome_nome": f"{dip['cognome']} {dip['nome']}",
                    "mese": mese,
                    "anno": anno,
                    "netto": netto,
                    "lordo": ced.get("lordo"),
                    "azione": azione,
                    "uscita_id": uscita_id,
                })

            except Exception as e:
                errori.append({
                    "cognome_nome": ced.get("cognome_nome", "?"),
                    "errore": str(e),
                })

    finally:
        conn.close()

    return {
        "ok": True,
        "totale_cedolini": len(cedolini),
        "importati": importati,
        "non_abbinati": non_abbinati,
        "errori": errori,
    }


# ============================================================
# FINE FILE
# ============================================================

