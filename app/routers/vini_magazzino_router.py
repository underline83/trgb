# @version: v1.1-magazzino-duplicati
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Router Vini Magazzino
File: app/routers/vini_magazzino_router.py

API per il nuovo DB di magazzino vini:
- Lista / ricerca vini
- Dettaglio singolo vino
- Creazione / aggiornamento vino
- Movimenti di cantina (carico/scarico/vendita/rettifica) con utente
- Note operative per vino
- Controllo duplicati in fase di inserimento

⚠️ Questo router lavora SOLO su 'vini_magazzino.sqlite3' tramite
    app.models.vini_magazzino_db
    e NON tocca il vecchio DB 'vini.sqlite3' usato per la carta da Excel.
"""

from __future__ import annotations

from typing import Optional, List, Any, Dict, Literal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user
from app.models import vini_magazzino_db as db


router = APIRouter(
    prefix="/vini/magazzino",
    tags=["Vini Magazzino"],
)


# ---------------------------------------------------------
# SCHEMI Pydantic
# ---------------------------------------------------------
class VinoMagazzinoBase(BaseModel):
    id_excel: Optional[int] = Field(None, description="ID del vino nel DB Excel (se collegato)")

    TIPOLOGIA: str = Field(..., description="Tipologia (lista controllata)")
    NAZIONE: str = Field(..., description="Nazione (lista controllata)")

    CODICE: Optional[str] = None
    REGIONE: Optional[str] = None

    DESCRIZIONE: str = Field(..., description="Descrizione vino")
    DENOMINAZIONE: Optional[str] = None
    ANNATA: Optional[str] = None
    VITIGNI: Optional[str] = None
    GRADO_ALCOLICO: Optional[float] = None

    PRODUTTORE: Optional[str] = None
    DISTRIBUTORE: Optional[str] = None

    PREZZO_CARTA: Optional[float] = None
    EURO_LISTINO: Optional[float] = None
    SCONTO: Optional[float] = None
    NOTE_PREZZO: Optional[str] = None

    CARTA: Optional[str] = Field(
        None,
        description="Flag pubblicazione in carta (SI/NO)",
    )
    IPRATICO: Optional[str] = Field(
        None,
        description="Flag esportazione iPratico (SI/NO)",
    )

    STATO_VENDITA: Optional[str] = Field(
        None,
        description="Codice stato vendita/conservazione (es. N, T, V, F, S, 1,2,3, X, O, A...)",
    )
    NOTE_STATO: Optional[str] = None

    FRIGORIFERO: Optional[str] = None
    QTA_FRIGO: Optional[int] = 0

    LOCAZIONE_1: Optional[str] = None
    QTA_LOC1: Optional[int] = 0

    LOCAZIONE_2: Optional[str] = None
    QTA_LOC2: Optional[int] = 0

    LOCAZIONE_3: Optional[str] = None
    QTA_LOC3: Optional[int] = 0

    NOTE: Optional[str] = None


class VinoMagazzinoCreate(VinoMagazzinoBase):
    """Schema per creazione: eredita tutto da base."""
    pass


class VinoMagazzinoUpdate(BaseModel):
    """Tutti i campi opzionali per PATCH parziale."""
    id_excel: Optional[int] = None

    TIPOLOGIA: Optional[str] = None
    NAZIONE: Optional[str] = None

    CODICE: Optional[str] = None
    REGIONE: Optional[str] = None

    DESCRIZIONE: Optional[str] = None
    DENOMINAZIONE: Optional[str] = None
    ANNATA: Optional[str] = None
    VITIGNI: Optional[str] = None
    GRADO_ALCOLICO: Optional[float] = None

    PRODUTTORE: Optional[str] = None
    DISTRIBUTORE: Optional[str] = None

    PREZZO_CARTA: Optional[float] = None
    EURO_LISTINO: Optional[float] = None
    SCONTO: Optional[float] = None
    NOTE_PREZZO: Optional[str] = None

    CARTA: Optional[str] = None
    IPRATICO: Optional[str] = None

    STATO_VENDITA: Optional[str] = None
    NOTE_STATO: Optional[str] = None

    FRIGORIFERO: Optional[str] = None
    QTA_FRIGO: Optional[int] = None

    LOCAZIONE_1: Optional[str] = None
    QTA_LOC1: Optional[int] = None

    LOCAZIONE_2: Optional[str] = None
    QTA_LOC2: Optional[int] = None

    LOCAZIONE_3: Optional[str] = None
    QTA_LOC3: Optional[int] = None

    NOTE: Optional[str] = None


class MovimentoCreate(BaseModel):
    tipo: Literal["CARICO", "SCARICO", "VENDITA", "RETTIFICA"]
    qta: int = Field(..., gt=0)
    locazione: Optional[str] = None
    note: Optional[str] = None
    origine: Optional[str] = "GESTIONALE"
    data_mov: Optional[str] = Field(
        None,
        description="ISO datetime string; se None usa ora corrente del server",
    )


class NotaCreate(BaseModel):
    nota: str


# --------- DUPLICATI ------------------------------------------------
class VinoMagazzinoDuplicateCheckRequest(BaseModel):
    DESCRIZIONE: str
    PRODUTTORE: Optional[str] = None
    ANNATA: Optional[str] = None
    FORMATO: Optional[str] = None


class VinoMagazzinoDuplicate(BaseModel):
    id: int
    DESCRIZIONE: str
    PRODUTTORE: Optional[str] = None
    ANNATA: Optional[str] = None
    FORMATO: Optional[str] = None
    NAZIONE: Optional[str] = None
    REGIONE: Optional[str] = None
    QTA_TOTALE: int = 0
    PREZZO_CARTA: Optional[float] = None


class VinoMagazzinoDuplicateCheckResponse(BaseModel):
    duplicates: List[VinoMagazzinoDuplicate]


# ---------------------------------------------------------
# HELPER PER UTENTE CORRENTE
# ---------------------------------------------------------
def _get_username(current_user: Any) -> str:
    """
    Prova a ricavare un nome utente leggibile dal payload JWT o dal dict utente.
    Fallback sicuro se la struttura è diversa da quella prevista.
    """
    if isinstance(current_user, dict):
        return (
            current_user.get("username")
            or current_user.get("sub")
            or "unknown"
        )
    # se fosse un oggetto Pydantic o simile
    for attr in ("username", "sub"):
        if hasattr(current_user, attr):
            val = getattr(current_user, attr)
            if val:
                return str(val)
    return "unknown"


# ---------------------------------------------------------
# INIZIALIZZAZIONE DB (una volta al load del router)
# ---------------------------------------------------------
db.init_magazzino_database()


# ---------------------------------------------------------
# ENDPOINT: LISTA / RICERCA VINI
# ---------------------------------------------------------
@router.get("/", summary="Lista / ricerca vini magazzino")
def list_vini_magazzino(
    id: Optional[int] = Query(None, ge=1, description="Ricerca diretta per ID vino"),
    q: Optional[str] = Query(None, description="Ricerca libera (descrizione/produttore/denominazione)"),
    tipologia: Optional[str] = Query(None),
    nazione: Optional[str] = Query(None),
    produttore: Optional[str] = Query(None),
    solo_in_carta: bool = Query(False),
    min_qta: Optional[int] = Query(None, ge=0),
    current_user: Any = Depends(get_current_user),
):
    rows = db.search_vini(
        vino_id=id,
        text=q,
        tipologia=tipologia,
        nazione=nazione,
        produttore=produttore,
        solo_in_carta=solo_in_carta,
        min_qta=min_qta,
    )
    return [dict(r) for r in rows]


# ---------------------------------------------------------
# ENDPOINT: CHECK DUPLICATI PRIMA DELL'INSERIMENTO
# ---------------------------------------------------------
@router.post(
    "/check-duplicati",
    summary="Controlla possibili duplicati prima di inserire un nuovo vino",
    response_model=VinoMagazzinoDuplicateCheckResponse,
)
def check_duplicati_vino_magazzino(
    payload: VinoMagazzinoDuplicateCheckRequest,
    current_user: Any = Depends(get_current_user),
):
    """
    NON inserisce nulla, restituisce solo una lista sintetica di vini
    che hanno stessa DESCRIZIONE e (se presenti) stesso PRODUTTORE/ANNATA/FORMATO.
    Usata dal frontend 'Nuovo Vino' per avvisare di possibili doppioni.
    """
    rows = db.find_potential_duplicates(
        descrizione=payload.DESCRIZIONE,
        produttore=payload.PRODUTTORE,
        annata=payload.ANNATA,
        formato=payload.FORMATO,
        max_results=20,
    )

    duplicates = [
        VinoMagazzinoDuplicate(
            id=row["id"],
            DESCRIZIONE=row["DESCRIZIONE"],
            PRODUTTORE=row["PRODUTTORE"],
            ANNATA=row["ANNATA"],
            FORMATO=row["FORMATO"],
            NAZIONE=row["NAZIONE"],
            REGIONE=row["REGIONE"],
            QTA_TOTALE=row["QTA_TOTALE"],
            PREZZO_CARTA=row["PREZZO_CARTA"],
        )
        for row in rows
    ]

    return VinoMagazzinoDuplicateCheckResponse(duplicates=duplicates)


# ---------------------------------------------------------
# ENDPOINT: CREAZIONE VINO
# ---------------------------------------------------------
@router.post("/", summary="Crea un nuovo vino in magazzino")
def create_vino_magazzino(
    payload: VinoMagazzinoCreate,
    current_user: Any = Depends(get_current_user),
):
    data: Dict[str, Any] = payload.dict(exclude_unset=True)

    # Regola semplice: almeno una locazione NON vuota
    if not any(
        [
            data.get("FRIGORIFERO"),
            data.get("LOCAZIONE_1"),
            data.get("LOCAZIONE_2"),
            data.get("LOCAZIONE_3"),
        ]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deve essere specificata almeno una locazione (FRIGORIFERO o LOCAZIONE_1/2/3).",
        )

    vino_id = db.create_vino(data)
    row = db.get_vino_by_id(vino_id)
    return dict(row) if row else {"id": vino_id}


# ---------------------------------------------------------
# ENDPOINT: DETTAGLIO VINO
# ---------------------------------------------------------
@router.get("/{vino_id}", summary="Dettaglio singolo vino")
def get_vino_magazzino(
    vino_id: int,
    current_user: Any = Depends(get_current_user),
):
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")
    return dict(row)


# ---------------------------------------------------------
# ENDPOINT: UPDATE VINO
# ---------------------------------------------------------
@router.patch("/{vino_id}", summary="Aggiorna parzialmente un vino")
def update_vino_magazzino(
    vino_id: int,
    payload: VinoMagazzinoUpdate,
    current_user: Any = Depends(get_current_user),
):
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")

    data = payload.dict(exclude_unset=True)
    if not data:
        return {"status": "no_changes"}

    db.update_vino(vino_id, data)
    updated = db.get_vino_by_id(vino_id)
    return dict(updated) if updated else {"id": vino_id}


# ---------------------------------------------------------
# ENDPOINT: MOVIMENTI
# ---------------------------------------------------------
@router.get("/{vino_id}/movimenti", summary="Lista movimenti per vino")
def list_movimenti(
    vino_id: int,
    limit: int = Query(100, ge=1, le=1000),
    current_user: Any = Depends(get_current_user),
):
    # verifica vino
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")

    movs = db.list_movimenti_vino(vino_id, limit=limit)
    return [dict(m) for m in movs]


@router.post("/{vino_id}/movimenti", summary="Registra un movimento di cantina")
def crea_movimento(
    vino_id: int,
    payload: MovimentoCreate,
    current_user: Any = Depends(get_current_user),
):
    # verifica vino
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")

    utente = _get_username(current_user)

    db.registra_movimento(
        vino_id=vino_id,
        tipo=payload.tipo,
        qta=payload.qta,
        utente=utente,
        locazione=payload.locazione,
        note=payload.note,
        origine=payload.origine,
        data_mov=payload.data_mov,
    )

    # ritorna vino aggiornato + ultimi movimenti
    updated = db.get_vino_by_id(vino_id)
    movs = db.list_movimenti_vino(vino_id, limit=50)

    return {
        "vino": dict(updated) if updated else None,
        "movimenti": [dict(m) for m in movs],
    }


@router.delete("/movimenti/{movimento_id}", summary="Elimina un movimento e ricalcola QTA_TOTALE")
def delete_movimento(
    movimento_id: int,
    current_user: Any = Depends(get_current_user),
):
    # per ora nessun controllo di ruolo, ma potrebbe essere solo admin/sommelier
    db.delete_movimento(movimento_id)
    return {"status": "ok"}


# ---------------------------------------------------------
# ENDPOINT: NOTE
# ---------------------------------------------------------
@router.get("/{vino_id}/note", summary="Lista note per vino")
def list_note(
    vino_id: int,
    current_user: Any = Depends(get_current_user),
):
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")

    note = db.list_note_vino(vino_id)
    return [dict(n) for n in note]


@router.post("/{vino_id}/note", summary="Aggiungi nota per vino")
def aggiungi_nota(
    vino_id: int,
    payload: NotaCreate,
    current_user: Any = Depends(get_current_user),
):
    if not payload.nota.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La nota non può essere vuota")

    autore = _get_username(current_user)

    db.aggiungi_nota_vino(
        vino_id=vino_id,
        nota=payload.nota,
        autore=autore,
    )

    note = db.list_note_vino(vino_id)
    return [dict(n) for n in note]
    
@router.post("/duplicate-check", response_model=VinoMagazzinoDuplicateCheckResponse, summary="Controllo duplicati prima della creazione")
def duplicate_check(
    payload: VinoMagazzinoDuplicateCheckRequest,
    current_user: Any = Depends(get_current_user),
):
    descr = (payload.DESCRIZIONE or "").strip()
    if not descr:
        return {"duplicates": []}

    # Ricerca larga: uso search_vini su text e poi filtro in python
    rows = db.search_vini(text=descr)

    def norm(s: Any) -> str:
        return str(s or "").strip().lower()

    descr_n = norm(payload.DESCRIZIONE)
    prod_n = norm(payload.PRODUTTORE)
    ann_n = norm(payload.ANNATA)
    fmt_n = norm(payload.FORMATO)

    out = []
    for r in rows:
        rr = dict(r)
        # criteri “sani”: descrizione molto simile + (produttore o annata o formato)
        r_descr = norm(rr.get("DESCRIZIONE"))
        if not r_descr:
          continue

        # match semplice: contenimento (poi lo affiniamo domani se vuoi con fuzzy)
        if descr_n not in r_descr and r_descr not in descr_n:
            continue

        r_prod = norm(rr.get("PRODUTTORE"))
        r_ann = norm(rr.get("ANNATA"))
        r_fmt = norm(rr.get("FORMATO"))

        ok_extra = False
        if prod_n and r_prod and (prod_n in r_prod or r_prod in prod_n):
            ok_extra = True
        if ann_n and r_ann and ann_n == r_ann:
            ok_extra = True
        if fmt_n and r_fmt and fmt_n == r_fmt:
            ok_extra = True

        # se non ho extra, lo considero comunque “possibile duplicato” ma più soft:
        # qui lo includo lo stesso (scelta C: avviso), però potremmo limitarlo.
        out.append(
            {
                "id": rr.get("id"),
                "DESCRIZIONE": rr.get("DESCRIZIONE"),
                "PRODUTTORE": rr.get("PRODUTTORE"),
                "ANNATA": rr.get("ANNATA"),
                "FORMATO": rr.get("FORMATO"),
                "NAZIONE": rr.get("NAZIONE"),
                "REGIONE": rr.get("REGIONE"),
                "QTA_TOTALE": rr.get("QTA_TOTALE") or 0,
                "PREZZO_CARTA": rr.get("PREZZO_CARTA"),
            }
        )

    # Limite per non fare esplodere UI
    out = out[:50]
    return {"duplicates": out}