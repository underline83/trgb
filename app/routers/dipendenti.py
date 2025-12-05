# @version: v1.1-dipendenti-router
# -*- coding: utf-8 -*-
"""
Router Dipendenti & Turni — TRGB Gestionale

Funzionalità v1.1:
- Anagrafica dipendenti (CRUD, soft delete) con:
  codice, nome, cognome, ruolo (menu), telefono, email, IBAN, indirizzo, note, attivo
- Tipi di turno (lista + CRUD base)
- Calendario turni (lista per periodo + filtri dipendente/ruolo)
- Documenti dipendente (upload file, lista, delete)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4
import os

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    UploadFile,
    File,
    Form,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.dipendenti_db import get_dipendenti_conn, init_dipendenti_db
from app.services.auth_service import get_current_user


router = APIRouter(prefix="/dipendenti", tags=["Dipendenti"])

# Inizializza DB alla prima importazione del router
init_dipendenti_db()

# Directory per i file allegati
BASE_DIR = Path(__file__).resolve().parents[2]
DOCS_BASE_DIR = BASE_DIR / "app" / "data" / "dipendenti_docs"
DOCS_BASE_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# MODELLI Pydantic — Dipendenti
# ============================================================
class DipendenteBase(BaseModel):
    codice: str = Field(..., description="Codice univoco interno, es. DIP001")
    nome: str
    cognome: str
    ruolo: str  # lato FE: menu a discesa con ruoli predefiniti
    telefono: Optional[str] = None
    email: Optional[str] = None
    iban: Optional[str] = Field(
        default=None,
        description="IBAN per pagamenti stipendi (solo memoria, non validato lato server)",
    )
    indirizzo_via: Optional[str] = None
    indirizzo_cap: Optional[str] = None
    indirizzo_citta: Optional[str] = None
    indirizzo_provincia: Optional[str] = None
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
# MODELLI Pydantic — Documenti dipendente
# ============================================================
class DipendenteDocumentoOut(BaseModel):
    id: int
    dipendente_id: int
    categoria: str
    descrizione: Optional[str]
    filename_originale: str
    filepath: str
    uploaded_at: str


# ============================================================
# UTILS
# ============================================================
def _validate_date_str(d: str) -> str:
    try:
        date.fromisoformat(d)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Data non valida: {d}")
    return d


def _row_to_dipendente_dict(row) -> Dict[str, Any]:
    data = dict(row)
    data["attivo"] = bool(data["attivo"])
    return data


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

    base_select = """
      SELECT id, codice, nome, cognome, ruolo,
             telefono, email, iban,
             indirizzo_via, indirizzo_cap, indirizzo_citta, indirizzo_provincia,
             note, attivo,
             created_at, updated_at
      FROM dipendenti
    """

    if include_inactive:
        cur.execute(base_select + " ORDER BY cognome, nome;")
    else:
        cur.execute(base_select + " WHERE attivo = 1 ORDER BY cognome, nome;")

    rows = [_row_to_dipendente_dict(r) for r in cur.fetchall()]
    conn.close()

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
            INSERT INTO dipendenti (
              codice, nome, cognome, ruolo,
              telefono, email, iban,
              indirizzo_via, indirizzo_cap, indirizzo_citta, indirizzo_provincia,
              note, attivo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.codice.strip(),
                payload.nome.strip(),
                payload.cognome.strip(),
                payload.ruolo.strip(),
                payload.telefono.strip() if payload.telefono else None,
                payload.email.strip() if payload.email else None,
                payload.iban.strip() if payload.iban else None,
                payload.indirizzo_via.strip() if payload.indirizzo_via else None,
                payload.indirizzo_cap.strip() if payload.indirizzo_cap else None,
                payload.indirizzo_citta.strip() if payload.indirizzo_citta else None,
                payload.indirizzo_provincia.strip() if payload.indirizzo_provincia else None,
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
                   telefono, email, iban,
                   indirizzo_via, indirizzo_cap, indirizzo_citta, indirizzo_provincia,
                   note, attivo,
                   created_at, updated_at
            FROM dipendenti
            WHERE id = ?;
            """,
            (new_id,),
        )
        row = cur.fetchone()
        conn.close()

    data = _row_to_dipendente_dict(row)
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
                iban = ?,
                indirizzo_via = ?,
                indirizzo_cap = ?,
                indirizzo_citta = ?,
                indirizzo_provincia = ?,
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
                payload.email.strip() if payload.email else None,
                payload.iban.strip() if payload.iban else None,
                payload.indirizzo_via.strip() if payload.indirizzo_via else None,
                payload.indirizzo_cap.strip() if payload.indirizzo_cap else None,
                payload.indirizzo_citta.strip() if payload.indirizzo_citta else None,
                payload.indirizzo_provincia.strip() if payload.indirizzo_provincia else None,
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
                   telefono, email, iban,
                   indirizzo_via, indirizzo_cap, indirizzo_citta, indirizzo_provincia,
                   note, attivo,
                   created_at, updated_at
            FROM dipendenti
            WHERE id = ?;
            """,
            (dipendente_id,),
        )
        row = cur.fetchone()
        conn.close()

    data = _row_to_dipendente_dict(row)
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

    base_select = """
      SELECT id, codice, nome, ruolo, colore_bg, colore_testo,
             ora_inizio, ora_fine, ordine, attivo,
             created_at, updated_at
      FROM turni_tipi
    """

    if include_inactive:
        cur.execute(base_select + " ORDER BY ordine, nome;")
    else:
        cur.execute(base_select + " WHERE attivo = 1 ORDER BY ordine, nome;")

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
# ENDPOINT: Documenti dipendente (allegati)
# ============================================================
@router.get("/{dipendente_id}/documenti", response_model=List[DipendenteDocumentoOut])
def list_documenti_dipendente(
    dipendente_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM dipendenti WHERE id = ?;", (dipendente_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Dipendente non trovato.")

    cur.execute(
        """
        SELECT id, dipendente_id, categoria, descrizione,
               filename_originale, filepath, uploaded_at
        FROM dipendenti_documenti
        WHERE dipendente_id = ?
        ORDER BY uploaded_at DESC;
        """,
        (dipendente_id,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/{dipendente_id}/documenti", response_model=DipendenteDocumentoOut)
async def upload_documento_dipendente(
    dipendente_id: int,
    categoria: str = Form(..., description="Es: CONTRATTO, CORSO, ALTRO"),
    descrizione: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Upload di un documento associato al dipendente.

    Salva il file in app/data/dipendenti_docs/dip_{id}/
    e memorizza path + metadati nel DB.
    """
    conn = get_dipendenti_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM dipendenti WHERE id = ?;", (dipendente_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Dipendente non trovato.")

    # Preparo directory
    subdir = DOCS_BASE_DIR / f"dip_{dipendente_id}"
    subdir.mkdir(parents=True, exist_ok=True)

    # Filename sicuro
    original_name = file.filename or "documento"
    ext = Path(original_name).suffix
    safe_name = f"{uuid4().hex}{ext}"
    dest_path = subdir / safe_name

    # Scrivo file su disco
    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)

    try:
        cur.execute(
            """
            INSERT INTO dipendenti_documenti (
              dipendente_id, categoria, descrizione,
              filename_originale, filepath
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                dipendente_id,
                categoria.strip(),
                descrizione.strip() if descrizione else None,
                original_name,
                str(dest_path),
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
    except Exception as e:
        conn.rollback()
        # provo a cancellare il file appena scritto
        try:
            os.remove(dest_path)
        except Exception:
            pass
        conn.close()
        raise HTTPException(status_code=500, detail=f"Errore salvataggio documento: {e}")

    cur.execute(
        """
        SELECT id, dipendente_id, categoria, descrizione,
               filename_originale, filepath, uploaded_at
        FROM dipendenti_documenti
        WHERE id = ?;
        """,
        (new_id,),
    )
    row = cur.fetchone()
    conn.close()

    return DipendenteDocumentoOut(**dict(row))


@router.delete("/documenti/{documento_id}", response_class=JSONResponse)
def delete_documento_dipendente(
    documento_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Cancella un documento (record + file su disco se presente).
    """
    conn = get_dipendenti_conn()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, filepath
        FROM dipendenti_documenti
        WHERE id = ?;
        """,
        (documento_id,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Documento non trovato.")

    filepath = row["filepath"]

    cur.execute("DELETE FROM dipendenti_documenti WHERE id = ?;", (documento_id,))
    conn.commit()
    conn.close()

    # Cancello file su disco (se esiste)
    if filepath:
        try:
            p = Path(filepath)
            if p.exists():
                p.unlink()
        except Exception:
            # non blocco l'API se la delete del file fallisce
            pass

    return JSONResponse(content={"status": "ok", "message": "Documento cancellato."})
