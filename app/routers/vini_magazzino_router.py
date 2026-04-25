# @version: v1.5-modifica-log
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

from fastapi import APIRouter, Body, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user, is_admin
from app.services.wine_pricing import calcola_prezzo_carta
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

    REGIONE: Optional[str] = None

    DESCRIZIONE: str = Field(..., description="Descrizione vino")
    DENOMINAZIONE: Optional[str] = None
    ANNATA: Optional[str] = None
    VITIGNI: Optional[str] = None
    GRADO_ALCOLICO: Optional[float] = None

    PRODUTTORE: Optional[str] = None
    DISTRIBUTORE: Optional[str] = None
    RAPPRESENTANTE: Optional[str] = None

    PREZZO_CARTA: Optional[float] = None
    EURO_LISTINO: Optional[float] = None
    SCONTO: Optional[float] = None
    NOTE_PREZZO: Optional[str] = None

    PREZZO_CALICE: Optional[float] = None
    PREZZO_CALICE_MANUALE: Optional[int] = 0

    CARTA: Optional[str] = Field(
        None,
        description="Flag pubblicazione in carta (SI/NO)",
    )
    IPRATICO: Optional[str] = Field(
        None,
        description="Flag esportazione iPratico (SI/NO)",
    )
    BIOLOGICO: Optional[str] = Field(
        "NO",
        description="Flag vino biologico (SI/NO)",
    )
    VENDITA_CALICE: Optional[str] = Field(
        "NO",
        description="Flag vendita al calice (SI/NO)",
    )
    DISCONTINUATO: Optional[str] = Field(
        None,
        description="Flag vino non da riordinare (SI/NO)",
    )
    FORZA_PREZZO: Optional[int] = Field(
        0,
        description="Flag forza prezzo (0=no, 1=prezzo fissato manualmente, ignora markup)",
    )
    BOTTIGLIA_APERTA: Optional[int] = Field(
        0,
        description="Flag bottiglia aperta in mescita (0=no, 1=si). Sessione 58. "
                    "Quando 1, il vino appare nella carta calici anche con QTA_TOTALE=0.",
    )

    STATO_VENDITA: Optional[str] = Field(
        None,
        description="Comportamento commerciale: N=Non vendere, T=Cautela, V=Vendere, F=Spingere, S=Aggressivo, C=Controllare",
    )
    STATO_RIORDINO: Optional[str] = Field(
        None,
        description="Gestione stock: D=Da ordinare, O=Finito/ordinare, 0=Ordinato, A=Annata esaurita, X=Non ricomprare",
    )
    STATO_CONSERVAZIONE: Optional[str] = Field(
        None,
        description="Condizione bottiglia: 1=Difficile/urgente, 2=Buona/vendere, 3=Perfetta/non urgente",
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

    REGIONE: Optional[str] = None

    DESCRIZIONE: Optional[str] = None
    DENOMINAZIONE: Optional[str] = None
    ANNATA: Optional[str] = None
    VITIGNI: Optional[str] = None
    GRADO_ALCOLICO: Optional[float] = None

    PRODUTTORE: Optional[str] = None
    DISTRIBUTORE: Optional[str] = None
    RAPPRESENTANTE: Optional[str] = None

    PREZZO_CARTA: Optional[float] = None
    PREZZO_CALICE: Optional[float] = None
    PREZZO_CALICE_MANUALE: Optional[int] = None
    EURO_LISTINO: Optional[float] = None
    SCONTO: Optional[float] = None
    NOTE_PREZZO: Optional[str] = None

    CARTA: Optional[str] = None
    IPRATICO: Optional[str] = None
    BIOLOGICO: Optional[str] = None
    VENDITA_CALICE: Optional[str] = None
    DISCONTINUATO: Optional[str] = None
    FORZA_PREZZO: Optional[int] = None
    BOTTIGLIA_APERTA: Optional[int] = None

    STATO_VENDITA: Optional[str] = None
    STATO_RIORDINO: Optional[str] = None
    STATO_CONSERVAZIONE: Optional[str] = None
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
    celle_matrice: Optional[list] = Field(
        None,
        description="Lista di [riga, colonna] da svuotare per vendita/scarico da matrice",
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

    # Auto-calcolo PREZZO_CARTA se EURO_LISTINO presente e PREZZO_CARTA non impostato
    euro = data.get("EURO_LISTINO")
    pc = data.get("PREZZO_CARTA")
    if euro and euro > 0 and not pc:
        data["PREZZO_CARTA"] = calcola_prezzo_carta(euro)

    vino_id = db.create_vino(data)
    row = db.get_vino_by_id(vino_id)
    return dict(row) if row else {"id": vino_id}


# ---------------------------------------------------------
# ENDPOINT: DASHBOARD OPERATIVA
# ---------------------------------------------------------
@router.get("/dashboard", summary="Statistiche aggregate per la dashboard")
def get_dashboard(
    current_user: Any = Depends(get_current_user),
    includi_giacenza_positiva: bool = False,
):
    """
    Restituisce in un'unica chiamata:
    - KPI (totale vini, bottiglie, in carta, con giacenza, senza listino)
    - Alert: vini in carta con giacenza = 0
    - Ultimi 10 movimenti cross-vino
    - Distribuzione bottiglie per tipologia
    - Riordini per fornitore (con flag per includere giacenze positive)
    """
    return db.get_dashboard_stats(includi_giacenza_positiva=includi_giacenza_positiva)


# ---------------------------------------------------------
# ENDPOINT: BULK UPDATE + DELETE (solo admin)
# ⚠️ Dichiarati PRIMA di /{vino_id} per evitare conflitti path
# ---------------------------------------------------------
@router.patch("/bulk-update", summary="Aggiornamento massivo vini (solo admin)")
def bulk_update(
    payload: Dict[str, Any],
    current_user: Any = Depends(get_current_user),
):
    role = (
        current_user.get("role") if isinstance(current_user, dict)
        else getattr(current_user, "role", None)
    )
    if not is_admin(role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operazione riservata agli admin.",
        )

    updates = payload.get("updates", [])
    if not updates or not isinstance(updates, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campo 'updates' mancante o vuoto.",
        )

    count = db.bulk_update_vini(updates)
    return {"status": "ok", "updated": count}


@router.post("/{vino_id}/duplica", summary="Duplica un vino esistente (copia anagrafica, azzera giacenze)")
def duplicate_vino_endpoint(
    vino_id: int,
    request_body: Optional[dict] = Body(default=None),
    current_user: Any = Depends(get_current_user),
):
    """
    Body opzionale:
    - `annata` (str): se presente, imposta ANNATA del duplicato e applica i
      default "nuova annata" → STATO_RIORDINO='0' (Ordinato), CARTA='NO'.
      Usato dal widget "Riordini per fornitore" per duplicare un vino con
      un'annata nuova senza aprire il dettaglio.
    - `overrides` (dict): override avanzati di altri campi.

    Senza body (o body vuoto) → comportamento storico: copia esatta
    anagrafica, giacenze a zero.
    """
    annata = None
    overrides = None
    if isinstance(request_body, dict):
        annata = request_body.get("annata")
        overrides = request_body.get("overrides")

    try:
        new_id = db.duplicate_vino(vino_id, annata=annata, overrides=overrides)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Errore duplicazione: {e}")
    row = db.get_vino_by_id(new_id)
    return dict(row) if row else {"id": new_id}


@router.post("/bulk-duplicate", summary="Duplica più vini in una volta (copia anagrafica, azzera giacenze)")
def bulk_duplicate_vini(
    request_body: dict = Body(...),
    current_user: Any = Depends(get_current_user),
):
    """
    Duplica più vini. Body: { "ids": [1, 2, 3] }
    Ogni vino viene duplicato con giacenze a zero.
    """
    role = (
        current_user.get("role") if isinstance(current_user, dict)
        else getattr(current_user, "role", None)
    )
    if not is_admin(role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operazione riservata agli admin.",
        )
    ids = request_body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="Nessun id fornito")

    created = []
    errors = []
    for vino_id in ids:
        try:
            new_id = db.duplicate_vino(vino_id)
            created.append({"original_id": vino_id, "new_id": new_id})
        except Exception as e:
            errors.append({"id": vino_id, "error": str(e)})

    return {
        "status": "ok",
        "duplicati": len(created),
        "errori": len(errors),
        "created": created,
        "errors": errors,
        "msg": f"Duplicati {len(created)} vini" + (f", {len(errors)} errori" if errors else ""),
    }


@router.delete("/delete-vino/{vino_id}", summary="Elimina un vino e tutti i dati collegati (solo admin)")
def delete_vino_endpoint(
    vino_id: int,
    current_user: Any = Depends(get_current_user),
):
    role = (
        current_user.get("role") if isinstance(current_user, dict)
        else getattr(current_user, "role", None)
    )
    if not is_admin(role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operazione riservata agli admin.",
        )

    deleted = db.delete_vino(vino_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")
    return {"status": "ok", "deleted_id": vino_id}


# ---------------------------------------------------------
# ENDPOINT: MOVIMENTI GLOBALI (hub vendite)
# ---------------------------------------------------------
@router.get("/movimenti-globali", summary="Lista movimenti globali con filtri e paginazione")
def list_movimenti_globali(
    tipo: Optional[str] = Query(None, description="Filtra per tipo: CARICO, SCARICO, VENDITA, RETTIFICA"),
    text: Optional[str] = Query(None, description="Ricerca per descrizione/produttore vino"),
    data_da: Optional[str] = Query(None, description="Data inizio (YYYY-MM-DD)"),
    data_a: Optional[str] = Query(None, description="Data fine (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: Any = Depends(get_current_user),
):
    return db.list_movimenti_globali(
        tipo=tipo, text=text, data_da=data_da, data_a=data_a,
        limit=limit, offset=offset,
    )


@router.get("/autocomplete", summary="Ricerca vini per autocompletamento")
def autocomplete_vini(
    q: str = Query(..., min_length=1, description="Testo da cercare"),
    limit: int = Query(10, ge=1, le=30),
    solo_disponibili: bool = Query(False, description="Se true, mostra solo vini con giacenza > 0"),
    current_user: Any = Depends(get_current_user),
):
    rows = db.search_vini_autocomplete(q, limit=limit, solo_disponibili=solo_disponibili)
    return [dict(r) for r in rows]


# ---------------------------------------------------------
# ENDPOINT: CALICI DISPONIBILI (sessione 58 — 2026-04-25)
# Lista compatta dei vini con BOTTIGLIA_APERTA=1, per il widget rapido in
# Vendite e in Home Sala/Sommelier (toggle on/off al volo).
# ---------------------------------------------------------
@router.get("/carta-staff/", summary="Vini in carta — vista sommelier (locazione, prezzo calice, status)")
def list_carta_staff(current_user: Any = Depends(get_current_user)):
    """
    Sessione 58 fase 2 (2026-04-25). Lista flat dei vini in carta per la
    pagina staff `/vini/carta-staff`. Include tutti i campi utili al
    sommelier: locazioni con quantita', prezzo bottiglia + calice
    (con fallback PREZZO_CARTA/5), flag in_mescita, status calcolato.
    """
    conn = db.get_magazzino_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT id, id_excel, TIPOLOGIA, NAZIONE, REGIONE, PRODUTTORE, DESCRIZIONE,
               DENOMINAZIONE, ANNATA, VITIGNI, GRADO_ALCOLICO, FORMATO,
               PREZZO_CARTA, PREZZO_CALICE, VENDITA_CALICE, BOTTIGLIA_APERTA,
               FRIGORIFERO, QTA_FRIGO,
               LOCAZIONE_1, QTA_LOC1,
               LOCAZIONE_2, QTA_LOC2,
               LOCAZIONE_3, QTA_LOC3,
               QTA_TOTALE, STATO_VENDITA, STATO_RIORDINO
          FROM vini_magazzino
         WHERE CARTA = 'SI'
           AND TIPOLOGIA IS NOT NULL AND TIPOLOGIA <> 'ERRORE'
        ORDER BY TIPOLOGIA, NAZIONE, REGIONE, PRODUTTORE, DESCRIZIONE
        """
    ).fetchall()
    conn.close()

    out = []
    for r in rows:
        d = dict(r)
        qta_tot = int(d.get("QTA_TOTALE") or 0)
        bottiglia_aperta = bool(d.get("BOTTIGLIA_APERTA") or 0)
        # Prezzo calice effettivo (fallback PREZZO_CARTA / 5)
        prezzo_calice = d.get("PREZZO_CALICE")
        if prezzo_calice is None or prezzo_calice == 0:
            pc = d.get("PREZZO_CARTA")
            if pc and pc > 0:
                prezzo_calice = round(pc / 5, 2)
            else:
                prezzo_calice = None
        is_calice = (d.get("VENDITA_CALICE") or "") == "SI" or bottiglia_aperta
        # Locazioni con qta non zero
        loc_list = []
        for label, q in [
            (d.get("FRIGORIFERO"), d.get("QTA_FRIGO")),
            (d.get("LOCAZIONE_1"), d.get("QTA_LOC1")),
            (d.get("LOCAZIONE_2"), d.get("QTA_LOC2")),
            (d.get("LOCAZIONE_3"), d.get("QTA_LOC3")),
        ]:
            qn = int(q or 0)
            if qn > 0 and label:
                loc_list.append({"nome": label, "qta": qn})
        # Status semantico
        if qta_tot == 0 and not bottiglia_aperta:
            status = "esaurita"
        elif bottiglia_aperta:
            status = "in_mescita"
        elif qta_tot <= 2:
            status = "scarsa"
        else:
            status = "in_carta"
        out.append({
            "id": d["id"],
            "codice": d.get("id_excel"),
            "tipologia": d.get("TIPOLOGIA"),
            "nazione": d.get("NAZIONE"),
            "regione": d.get("REGIONE"),
            "produttore": d.get("PRODUTTORE"),
            "descrizione": d.get("DESCRIZIONE"),
            "denominazione": d.get("DENOMINAZIONE"),
            "annata": d.get("ANNATA"),
            "vitigni": d.get("VITIGNI"),
            "grado_alcolico": d.get("GRADO_ALCOLICO"),
            "formato": d.get("FORMATO"),
            "prezzo_carta": d.get("PREZZO_CARTA"),
            "prezzo_calice": prezzo_calice if is_calice else None,
            "vendita_calice": (d.get("VENDITA_CALICE") or "") == "SI",
            "in_mescita": bottiglia_aperta,
            "locazioni": loc_list,
            "qta_totale": qta_tot,
            "stato_vendita": d.get("STATO_VENDITA"),
            "stato_riordino": d.get("STATO_RIORDINO"),
            "status": status,
        })
    return out


@router.get("/calici-disponibili/", summary="Vini con bottiglia aperta in mescita")
def list_calici_disponibili(current_user: Any = Depends(get_current_user)):
    conn = db.get_magazzino_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT id, DESCRIZIONE, ANNATA, TIPOLOGIA, PRODUTTORE, REGIONE,
               PREZZO_CALICE, PREZZO_CARTA, QTA_TOTALE, BOTTIGLIA_APERTA,
               VENDITA_CALICE
        FROM vini_magazzino
        WHERE BOTTIGLIA_APERTA = 1
          AND (TIPOLOGIA IS NOT NULL AND TIPOLOGIA <> 'ERRORE')
        ORDER BY TIPOLOGIA, DESCRIZIONE;
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


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


@router.get("/{vino_id}/stats", summary="Statistiche di vendita per il vino")
def get_vino_stats_endpoint(
    vino_id: int,
    current_user: Any = Depends(get_current_user),
):
    """
    Ritorna vendite_totali, ultima_vendita, ritmo_vendita (dict completo) e
    vendite_per_mese per il singolo vino. Alimenta la sezione "Statistiche"
    in SchedaVino.
    """
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")
    return db.get_vino_stats(vino_id)


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

    # Auto-calcolo PREZZO_CARTA se EURO_LISTINO cambia e PREZZO_CARTA non è nel payload
    if "EURO_LISTINO" in data and "PREZZO_CARTA" not in data:
        euro = data["EURO_LISTINO"]
        if euro and euro > 0:
            data["PREZZO_CARTA"] = calcola_prezzo_carta(euro)

    # Salva valori prima dell'aggiornamento per il log
    qta_prima = int(row["QTA_TOTALE"] or 0)
    qta_fields = {"QTA_FRIGO", "QTA_LOC1", "QTA_LOC2", "QTA_LOC3", "QTA_TOTALE"}
    loc_fields = {"FRIGORIFERO", "LOCAZIONE_1", "LOCAZIONE_2", "LOCAZIONE_3"}
    skip_fields = qta_fields | loc_fields  # loggati separatamente come RETTIFICA

    # Individua campi anagrafica effettivamente cambiati
    campi_modificati = {}
    valori_prima = {}
    for campo, nuovo_val in data.items():
        if campo in skip_fields:
            continue
        vecchio_val = row[campo] if campo in row.keys() else None
        # Normalizza per confronto (None vs "" vs 0)
        v_norm = vecchio_val if vecchio_val not in (None, "") else None
        n_norm = nuovo_val if nuovo_val not in (None, "") else None
        # Confronto numerico se possibile
        try:
            if float(v_norm) == float(n_norm):
                continue
        except (TypeError, ValueError):
            pass
        if str(v_norm) != str(n_norm):
            campi_modificati[campo] = nuovo_val
            valori_prima[campo] = vecchio_val

    utente = _get_username(current_user)
    db.update_vino(vino_id, data, utente=utente, origine="GESTIONALE-EDIT")
    updated = db.get_vino_by_id(vino_id)

    # Log MODIFICA per campi anagrafica
    if campi_modificati:
        try:
            db.registra_modifica(
                vino_id=vino_id,
                utente=utente,
                campi_modificati=campi_modificati,
                valori_prima=valori_prima,
                origine="GESTIONALE-EDIT",
            )
        except Exception:
            pass  # Il salvataggio è già avvenuto; il log fallisce silenziosamente

    # Se sono stati toccati campi QTA_*, registra RETTIFICA automatica
    if qta_fields.intersection(data.keys()):
        qta_dopo = int((updated["QTA_TOTALE"] if updated else 0) or 0)
        if qta_dopo != qta_prima:
            try:
                db.registra_movimento(
                    vino_id=vino_id,
                    tipo="RETTIFICA",
                    qta=qta_dopo if qta_dopo > 0 else 0,
                    utente=utente,
                    note=f"Aggiornamento diretto giacenze (da {qta_prima} a {qta_dopo} bt)",
                    origine="GESTIONALE-EDIT",
                )
                # Rilegge dopo la rettifica per avere QTA_TOTALE aggiornata
                updated = db.get_vino_by_id(vino_id)
            except Exception:
                pass

    return dict(updated) if updated else {"id": vino_id}



# ---------------------------------------------------------
# ENDPOINT: MOVIMENTI PER VINO
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

    try:
        # Converti celle_matrice da [[r,c], ...] a [(r,c), ...]
        celle = None
        if payload.celle_matrice:
            celle = [(int(pair[0]), int(pair[1])) for pair in payload.celle_matrice]
        db.registra_movimento(
            vino_id=vino_id,
            tipo=payload.tipo,
            qta=payload.qta,
            utente=utente,
            locazione=payload.locazione,
            note=payload.note,
            origine=payload.origine,
            data_mov=payload.data_mov,
            celle_matrice=celle,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
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
    # Solo admin, sommelier o sala possono eliminare movimenti
    role = (
        current_user.get("role") if isinstance(current_user, dict)
        else getattr(current_user, "role", None)
    )
    if not (is_admin(role) or role in ("sommelier", "sala")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operazione riservata ad admin, sommelier o sala.",
        )
    db.delete_movimento(movimento_id)
    return {"status": "ok"}


# ---------------------------------------------------------
# ENDPOINT: ORDINI PENDING  (Widget Riordini — Fase 3, sessione 2026-04-20)
# Design: docs/modulo_vini_riordini.md §4
# Un solo ordine aperto per vino (UNIQUE su vino_id lato DB).
# ---------------------------------------------------------
class OrdinePendingCreate(BaseModel):
    qta: int = Field(..., ge=1, description="Bottiglie ordinate (> 0)")
    note: Optional[str] = Field(None, description="Note opzionali sull'ordine")


@router.get("/ordini-pending/", summary="Lista ordini pending (un record per vino con ordine aperto)")
def list_ordini_pending_endpoint(
    current_user: Any = Depends(get_current_user),
):
    return db.list_ordini_pending()


@router.post("/{vino_id}/ordine-pending", summary="Crea o aggiorna l'ordine pending per un vino (upsert)")
def upsert_ordine_pending_endpoint(
    vino_id: int,
    payload: OrdinePendingCreate,
    current_user: Any = Depends(get_current_user),
):
    utente = _get_username(current_user)
    try:
        rec = db.upsert_ordine_pending(
            vino_id=vino_id,
            qta=payload.qta,
            utente=utente,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"status": "ok", "ordine": rec}


@router.delete("/{vino_id}/ordine-pending", summary="Cancella l'ordine pending di un vino")
def delete_ordine_pending_endpoint(
    vino_id: int,
    current_user: Any = Depends(get_current_user),
):
    existed = db.delete_ordine_pending(vino_id)
    if not existed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nessun ordine pending da cancellare per questo vino.",
        )
    return {"status": "ok"}


# ---------------------------------------------------------
# ENDPOINT: ARRIVO ORDINE (Fase 5, sessione 2026-04-20)
# Design: docs/modulo_vini_riordini.md §5
# Transazione atomica: cancella pending + crea CARICO nel movimenti.
# ---------------------------------------------------------
class ConfermaArrivoPayload(BaseModel):
    qta_ricevuta: int = Field(..., ge=1, description="Bottiglie effettivamente arrivate (> 0)")
    note: Optional[str] = Field(None, description="Note opzionali da allegare al movimento CARICO")


@router.post(
    "/{vino_id}/ordine-pending/conferma-arrivo",
    summary="Conferma arrivo merce: chiude il pending e registra CARICO in atomica",
)
def conferma_arrivo_ordine_pending_endpoint(
    vino_id: int,
    payload: ConfermaArrivoPayload,
    current_user: Any = Depends(get_current_user),
):
    utente = _get_username(current_user)
    try:
        result = db.conferma_arrivo_ordine_pending(
            vino_id=vino_id,
            qta_ricevuta=payload.qta_ricevuta,
            utente=utente,
            note=payload.note,
        )
    except ValueError as e:
        msg = str(e)
        low = msg.lower()
        if "non trovato" in low or "nessun ordine pending" in low:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    return {"status": "ok", **result}


# ---------------------------------------------------------
# ENDPOINT: STORICO PREZZI (Fase 6, sessione 2026-04-20)
# ---------------------------------------------------------
_PREZZI_CAMPI_VALIDI = ("EURO_LISTINO", "PREZZO_CARTA", "PREZZO_CALICE", "SCONTO")


@router.get(
    "/{vino_id}/prezzi-storico/",
    summary="Storico cambi prezzo di un vino (ordinato dal piu' recente)",
)
def list_prezzi_storico_endpoint(
    vino_id: int,
    campo: Optional[str] = None,
    limit: int = 200,
    current_user: Any = Depends(get_current_user),
):
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")
    if campo and campo not in _PREZZI_CAMPI_VALIDI:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"campo non valido. Ammessi: {', '.join(_PREZZI_CAMPI_VALIDI)}",
        )
    if limit < 1 or limit > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="limit deve essere tra 1 e 1000",
        )
    try:
        rows = db.list_prezzi_storico(vino_id=vino_id, campo=campo, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"vino_id": vino_id, "count": len(rows), "items": rows}


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


@router.delete("/{vino_id}/note/{nota_id}", summary="Elimina una nota")
def elimina_nota(
    vino_id: int,
    nota_id: int,
    current_user: Any = Depends(get_current_user),
):
    # Verifica che il vino esista
    row = db.get_vino_by_id(vino_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vino non trovato")

    db.delete_nota(nota_id)

    note = db.list_note_vino(vino_id)
    return [dict(n) for n in note]