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
# FINE FILE
# ============================================================

