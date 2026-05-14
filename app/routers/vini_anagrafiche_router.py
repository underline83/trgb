# Modulo: vini
"""
Router CRUD anagrafiche vini (refactor V.6+V.7+V.8 Fase 2).

Endpoint nuovi su prefisso `/vini/anagrafiche/...` — completamente paralleli
agli endpoint vecchi `/vini/magazzino/...`. La UI vecchia non li chiama (Fase 6
aggiungerà la UI "beta"). Le tabelle `_v2` sono pronte ma vuote in attesa
della migrazione (Fase 5).

Vedi `docs/refactor_anagrafiche_vini.md` per il design completo.

Tutte le scritture sono admin-only. Le letture sono disponibili a tutti gli
utenti autenticati (utile per autocomplete UI futuro).
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user, is_admin
from app.models import vini_anagrafiche_db as ana


router = APIRouter(
    prefix="/vini/anagrafiche",
    tags=["Vini Anagrafiche (refactor V.6+V.7+V.8)"],
)


# ============================================================
# AUTH HELPERS
# ============================================================
def _require_admin(current_user: Any):
    role = (
        current_user.get("role") if isinstance(current_user, dict)
        else getattr(current_user, "role", None)
    )
    if not is_admin(role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operazione riservata agli admin."
        )


# ============================================================
# PYDANTIC SCHEMI
# ============================================================

# --- Produttori ---
class ProduttoreBase(BaseModel):
    nome: str = Field(..., min_length=1)
    nazione: str = Field(..., min_length=1)
    regione: Optional[str] = None
    provincia: Optional[str] = None
    citta: Optional[str] = None
    note: Optional[str] = None


class ProduttoreUpdate(BaseModel):
    nome: Optional[str] = None
    nazione: Optional[str] = None
    regione: Optional[str] = None
    provincia: Optional[str] = None
    citta: Optional[str] = None
    note: Optional[str] = None


# --- Fornitori ---
class FornitoreBase(BaseModel):
    nome: str = Field(..., min_length=1)
    nazione: Optional[str] = None
    regione: Optional[str] = None
    provincia: Optional[str] = None
    citta: Optional[str] = None
    rappresentante_nome: Optional[str] = None
    rappresentante_telefono: Optional[str] = None
    rappresentante_email: Optional[str] = None
    note: Optional[str] = None


class FornitoreUpdate(BaseModel):
    nome: Optional[str] = None
    nazione: Optional[str] = None
    regione: Optional[str] = None
    provincia: Optional[str] = None
    citta: Optional[str] = None
    rappresentante_nome: Optional[str] = None
    rappresentante_telefono: Optional[str] = None
    rappresentante_email: Optional[str] = None
    note: Optional[str] = None


# --- Denominazioni ---
class DenominazioneBase(BaseModel):
    nome: str = Field(..., min_length=1)
    tipo: str = Field(..., min_length=1, description="DOC/DOCG/IGT/AOC/...")
    nazione: str = Field(..., min_length=1)
    codice_eambrosia: Optional[str] = None
    tipo_ue: Optional[str] = None
    regione: Optional[str] = None
    link_disciplinare: Optional[str] = None
    attiva: Optional[int] = 1
    source: Optional[str] = "user_manual"
    note: Optional[str] = None


class DenominazioneUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    nazione: Optional[str] = None
    codice_eambrosia: Optional[str] = None
    tipo_ue: Optional[str] = None
    regione: Optional[str] = None
    link_disciplinare: Optional[str] = None
    attiva: Optional[int] = None
    source: Optional[str] = None
    note: Optional[str] = None


# --- Vitigni ---
# Nazione_origine rimossa 2026-05-13: fuorviante (es. Gewürztraminer coltivato
# in Francia, Italia, Germania). Info storica eventuale finisce in `note`.
class VitignoBase(BaseModel):
    nome: str = Field(..., min_length=1)
    note: Optional[str] = None


class VitignoUpdate(BaseModel):
    nome: Optional[str] = None
    note: Optional[str] = None


# --- Madre ---
class MadreBase(BaseModel):
    produttore_id: int
    descrizione: str = Field(..., min_length=1)
    tipologia: str = Field(..., min_length=1)
    fornitore_id: Optional[int] = None
    denominazione_id: Optional[int] = None
    nazione: Optional[str] = None
    regione: Optional[str] = None
    grado_alcolico_tipico: Optional[float] = None
    abbinamenti: Optional[str] = None
    note_madre: Optional[str] = None


class MadreUpdate(BaseModel):
    produttore_id: Optional[int] = None
    descrizione: Optional[str] = None
    tipologia: Optional[str] = None
    fornitore_id: Optional[int] = None
    denominazione_id: Optional[int] = None
    nazione: Optional[str] = None
    regione: Optional[str] = None
    grado_alcolico_tipico: Optional[float] = None
    abbinamenti: Optional[str] = None
    note_madre: Optional[str] = None


# ============================================================
# STATS — overview per dashboard "beta"
# ============================================================
@router.get("/stats/", summary="Conteggi anagrafiche (dashboard beta)")
def stats(current_user: Any = Depends(get_current_user)):
    return ana.get_stats()


# ============================================================
# PRODUTTORI
# ============================================================
@router.get("/produttori/", summary="Lista produttori")
def list_produttori(
    search: Optional[str] = Query(None, description="filtro su nome"),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_produttori(search=search)


@router.get("/produttori/{pid}", summary="Dettaglio produttore")
def get_produttore(pid: int, current_user: Any = Depends(get_current_user)):
    row = ana.get_produttore(pid)
    if not row:
        raise HTTPException(404, "Produttore non trovato")
    return row


@router.post("/produttori/", summary="Crea produttore (admin)")
def create_produttore(payload: ProduttoreBase, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        new_id = ana.create_produttore(payload.dict(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ana.get_produttore(new_id)


@router.patch("/produttori/{pid}", summary="Modifica produttore (admin)")
def update_produttore(pid: int, payload: ProduttoreUpdate, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    if not ana.get_produttore(pid):
        raise HTTPException(404, "Produttore non trovato")
    ana.update_produttore(pid, payload.dict(exclude_unset=True))
    # TODO Fase 7: trigger sync_bottiglie_from_produttore(pid)
    return ana.get_produttore(pid)


@router.delete("/produttori/{pid}", summary="Elimina produttore (admin)")
def delete_produttore(pid: int, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        ok = ana.delete_produttore(pid)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not ok:
        raise HTTPException(404, "Produttore non trovato")
    return {"status": "ok", "deleted_id": pid}


# ============================================================
# FORNITORI
# ============================================================
@router.get("/fornitori/", summary="Lista fornitori")
def list_fornitori(
    search: Optional[str] = Query(None),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_fornitori(search=search)


@router.get("/fornitori/{fid}", summary="Dettaglio fornitore")
def get_fornitore(fid: int, current_user: Any = Depends(get_current_user)):
    row = ana.get_fornitore(fid)
    if not row:
        raise HTTPException(404, "Fornitore non trovato")
    return row


@router.post("/fornitori/", summary="Crea fornitore (admin)")
def create_fornitore(payload: FornitoreBase, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        new_id = ana.create_fornitore(payload.dict(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ana.get_fornitore(new_id)


@router.patch("/fornitori/{fid}", summary="Modifica fornitore (admin)")
def update_fornitore(fid: int, payload: FornitoreUpdate, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    if not ana.get_fornitore(fid):
        raise HTTPException(404, "Fornitore non trovato")
    ana.update_fornitore(fid, payload.dict(exclude_unset=True))
    # TODO Fase 7: trigger sync_bottiglie_from_fornitore(fid)
    return ana.get_fornitore(fid)


@router.delete("/fornitori/{fid}", summary="Elimina fornitore (admin)")
def delete_fornitore(fid: int, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        ok = ana.delete_fornitore(fid)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not ok:
        raise HTTPException(404, "Fornitore non trovato")
    return {"status": "ok", "deleted_id": fid}


# ============================================================
# DENOMINAZIONI
# ============================================================
@router.get("/denominazioni/", summary="Lista denominazioni")
def list_denominazioni(
    search: Optional[str] = Query(None),
    nazione: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None, description="DOC/DOCG/IGT/AOC/..."),
    solo_attive: bool = Query(True),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_denominazioni(
        search=search, nazione=nazione, tipo=tipo, solo_attive=solo_attive
    )


@router.get("/denominazioni/{did}", summary="Dettaglio denominazione")
def get_denominazione(did: int, current_user: Any = Depends(get_current_user)):
    row = ana.get_denominazione(did)
    if not row:
        raise HTTPException(404, "Denominazione non trovata")
    return row


@router.post("/denominazioni/", summary="Crea denominazione (admin)")
def create_denominazione(payload: DenominazioneBase, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        new_id = ana.create_denominazione(payload.dict(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ana.get_denominazione(new_id)


@router.patch("/denominazioni/{did}", summary="Modifica denominazione (admin)")
def update_denominazione(did: int, payload: DenominazioneUpdate, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    if not ana.get_denominazione(did):
        raise HTTPException(404, "Denominazione non trovata")
    ana.update_denominazione(did, payload.dict(exclude_unset=True))
    # TODO Fase 7: trigger sync_bottiglie_from_denominazione(did)
    return ana.get_denominazione(did)


# Sync da eAmbrosia API + PDF MASAF (Fase 3)
# =====  MIGRAZIONE DATI DAL VECCHIO MODELLO (Fase 5) =====
@router.post("/migrate-from-legacy", summary="Migra anagrafiche dai vini esistenti (admin)")
def migrate_from_legacy_endpoint(
    dry_run: bool = Query(True, description="Anteprima senza scrivere. SEMPRE provare prima con dry_run=true."),
    force_reset: bool = Query(False, description="ATTENZIONE: cancella le _v2 prima di ripopolare (solo testing)."),
    current_user: Any = Depends(get_current_user),
):
    """
    Pipeline completa di migrazione dei 1287 vini esistenti verso il nuovo
    schema anagrafiche (refactor V.6+V.7+V.8 Fase 5):
      1. produttori distinct → vini_produttori_v2
      2. fornitori distinct (con rappresentante inline) → vini_fornitori_v2
      3. denominazioni match best-effort → link a vini_denominazioni_v2
      4. clustering (produttore, descrizione) → vini_madre_v2
      5. link bottiglie → madre via madre_id
      6. parser vitigni TEXT → 5 slot strutturati

    Idempotente in modalità safe (non duplica righe esistenti).
    Con `force_reset=true` svuota _v2 prima — uso solo per testing iterativo.
    """
    _require_admin(current_user)
    from app.services.vini_anagrafiche_migrate import migrate_from_legacy
    try:
        return migrate_from_legacy(dry_run=dry_run, force_reset=force_reset)
    except Exception as e:
        raise HTTPException(500, f"Migrazione fallita: {e}")


@router.post("/denominazioni/sync", summary="Sync denominazioni da eAmbrosia + PDF MASAF (admin)")
def sync_denominazioni(
    dry_run: bool = Query(False, description="Se true, solo preview senza scrivere"),
    current_user: Any = Depends(get_current_user),
):
    """
    Scarica le denominazioni vino dall'API eAmbrosia (Commissione UE) e le
    arricchisce con la menzione tradizionale italiana (DOC/DOCG/IGT) dai PDF
    MASAF. Upsert su `codice_eambrosia` UNIQUE.

    Usage:
      - dry_run=true → preview con conteggi per nazione/tipo, nessuna scrittura
      - dry_run=false → commit, popola/aggiorna `vini_denominazioni_v2`
    """
    _require_admin(current_user)
    from app.services.vini_denominazioni_sync import sync_denominazioni as _sync
    try:
        return _sync(dry_run=dry_run)
    except Exception as e:
        raise HTTPException(500, f"Sync fallita: {e}")


@router.delete("/denominazioni/{did}", summary="Elimina denominazione (admin)")
def delete_denominazione(did: int, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        ok = ana.delete_denominazione(did)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not ok:
        raise HTTPException(404, "Denominazione non trovata")
    return {"status": "ok", "deleted_id": did}


# ============================================================
# VITIGNI
# ============================================================
@router.get("/vitigni/", summary="Lista vitigni")
def list_vitigni(
    search: Optional[str] = Query(None),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_vitigni(search=search)


@router.get("/vitigni/{vid}", summary="Dettaglio vitigno")
def get_vitigno(vid: int, current_user: Any = Depends(get_current_user)):
    row = ana.get_vitigno(vid)
    if not row:
        raise HTTPException(404, "Vitigno non trovato")
    return row


@router.post("/vitigni/", summary="Crea vitigno (admin)")
def create_vitigno(payload: VitignoBase, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        new_id = ana.create_vitigno(payload.dict(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ana.get_vitigno(new_id)


@router.patch("/vitigni/{vid}", summary="Modifica vitigno (admin)")
def update_vitigno(vid: int, payload: VitignoUpdate, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    if not ana.get_vitigno(vid):
        raise HTTPException(404, "Vitigno non trovato")
    ana.update_vitigno(vid, payload.dict(exclude_unset=True))
    return ana.get_vitigno(vid)


@router.delete("/vitigni/{vid}", summary="Elimina vitigno (admin)")
def delete_vitigno(vid: int, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        ok = ana.delete_vitigno(vid)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not ok:
        raise HTTPException(404, "Vitigno non trovato")
    return {"status": "ok", "deleted_id": vid}


# ============================================================
# MADRE
# ============================================================
@router.get("/madre/", summary="Lista vini madre")
def list_madre(
    search: Optional[str] = Query(None),
    produttore_id: Optional[int] = Query(None),
    denominazione_id: Optional[int] = Query(None),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_madre(
        search=search, produttore_id=produttore_id, denominazione_id=denominazione_id
    )


@router.get("/madre/{mid}", summary="Dettaglio vino madre")
def get_madre(mid: int, current_user: Any = Depends(get_current_user)):
    row = ana.get_madre(mid)
    if not row:
        raise HTTPException(404, "Vino madre non trovato")
    return row


@router.post("/madre/", summary="Crea vino madre (admin)")
def create_madre(payload: MadreBase, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    # Verifica FK
    if not ana.get_produttore(payload.produttore_id):
        raise HTTPException(400, f"Produttore {payload.produttore_id} non trovato")
    if payload.fornitore_id is not None and not ana.get_fornitore(payload.fornitore_id):
        raise HTTPException(400, f"Fornitore {payload.fornitore_id} non trovato")
    if payload.denominazione_id is not None and not ana.get_denominazione(payload.denominazione_id):
        raise HTTPException(400, f"Denominazione {payload.denominazione_id} non trovata")
    try:
        new_id = ana.create_madre(payload.dict(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ana.get_madre(new_id)


@router.patch("/madre/{mid}", summary="Modifica vino madre (admin)")
def update_madre(mid: int, payload: MadreUpdate, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    if not ana.get_madre(mid):
        raise HTTPException(404, "Vino madre non trovato")
    data = payload.dict(exclude_unset=True)
    # Verifica FK se modificate
    if data.get("produttore_id") is not None and not ana.get_produttore(data["produttore_id"]):
        raise HTTPException(400, f"Produttore {data['produttore_id']} non trovato")
    if data.get("fornitore_id") is not None and not ana.get_fornitore(data["fornitore_id"]):
        raise HTTPException(400, f"Fornitore {data['fornitore_id']} non trovato")
    if data.get("denominazione_id") is not None and not ana.get_denominazione(data["denominazione_id"]):
        raise HTTPException(400, f"Denominazione {data['denominazione_id']} non trovata")
    ana.update_madre(mid, data)
    # TODO Fase 7: trigger sync_bottiglie_from_madre(mid)
    return ana.get_madre(mid)


@router.delete("/madre/{mid}", summary="Elimina vino madre (admin)")
def delete_madre(mid: int, current_user: Any = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        ok = ana.delete_madre(mid)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not ok:
        raise HTTPException(404, "Vino madre non trovato")
    return {"status": "ok", "deleted_id": mid}
