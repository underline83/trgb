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
from app.services import vini_anagrafiche_sync as ana_sync


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
    # M2.9 (2026-05-16): descrizione composta
    nome_etichetta: Optional[str] = None
    descrizione_auto: Optional[int] = None  # 0=legacy testuale, 1=composta da ingredienti
    # M2.9-bis (mig 131, 2026-05-18): 5 slot vitigni strutturati "tipici" del madre
    vitigno_1_id: Optional[int] = None
    vitigno_1_pct: Optional[float] = None
    vitigno_2_id: Optional[int] = None
    vitigno_2_pct: Optional[float] = None
    vitigno_3_id: Optional[int] = None
    vitigno_3_pct: Optional[float] = None
    vitigno_4_id: Optional[int] = None
    vitigno_4_pct: Optional[float] = None
    vitigno_5_id: Optional[int] = None
    vitigno_5_pct: Optional[float] = None


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
    # M2.9 (2026-05-16): descrizione composta
    nome_etichetta: Optional[str] = None
    descrizione_auto: Optional[int] = None
    # M2.9-bis (mig 131, 2026-05-18): 5 slot vitigni strutturati
    vitigno_1_id: Optional[int] = None
    vitigno_1_pct: Optional[float] = None
    vitigno_2_id: Optional[int] = None
    vitigno_2_pct: Optional[float] = None
    vitigno_3_id: Optional[int] = None
    vitigno_3_pct: Optional[float] = None
    vitigno_4_id: Optional[int] = None
    vitigno_4_pct: Optional[float] = None
    vitigno_5_id: Optional[int] = None
    vitigno_5_pct: Optional[float] = None


# --- Promozione madre a descrizione composta (M2.9-bis, 2026-05-18) ---
class VitignoSlot(BaseModel):
    """Un singolo slot vitigno strutturato sul madre (mig 131). Max 5 slot."""
    vitigno_id: int
    pct: Optional[float] = None


class MadrePromotePayload(BaseModel):
    """
    Payload per promuovere un madre "legacy" (descrizione_auto=0) a
    descrizione composta. Tutti i campi sono opzionali: l'helper backend
    usa i valori passati se presenti, altrimenti tiene quelli già sul madre.

    L'effetto è:
      1) aggiorna i 4 ingredienti sul madre (se presenti nel payload)
      2) persiste i vitigni "tipici" del madre nei 5 slot strutturati (mig 131)
      3) ricompone `descrizione` con `componi_descrizione(...)`
      4) setta `descrizione_auto = 1`
      5) sparisce il badge "OLD" in UI (il madre è ora "standard")
    """
    denominazione_id: Optional[int] = None
    nome_etichetta: Optional[str] = None
    grado_alcolico_tipico: Optional[float] = None
    # M2.9-bis (mig 131): lista vitigni strutturati persistiti nei 5 slot.
    # Se passata, vince su vitigni_stringa per la composizione descrizione
    # (la stringa viene ricalcolata via JOIN sui nomi vitigno).
    vitigni: Optional[List[VitignoSlot]] = Field(
        None,
        description="Lista di max 5 vitigni strutturati [{vitigno_id, pct}] — persistiti negli slot del madre",
    )
    vitigni_stringa: Optional[str] = Field(
        None,
        description="DEPRECATO post-mig131: stringa già formattata 'Nebbiolo 100%' o 'Nebbiolo 95%, Barbera 5%'. Usata solo se `vitigni` non è passata.",
    )


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
    nazione: Optional[str] = Query(None, description="filtro esatto nazione"),
    with_counts: bool = Query(False, description="se true, include n_madre/n_bottiglie/qta_bottiglie per produttore"),
    only_orphans: bool = Query(False, description="se true, restituisce solo produttori senza madri collegati (forza with_counts)"),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_produttori(
        search=search, nazione=nazione,
        with_counts=with_counts, only_orphans=only_orphans,
    )


@router.get("/produttori/{pid}", summary="Dettaglio produttore (con conta vini collegati + lista madri)")
def get_produttore(
    pid: int,
    with_madri: bool = Query(False, description="se true, include la lista vini madre collegati"),
    current_user: Any = Depends(get_current_user),
):
    row = ana.get_produttore(pid)
    if not row:
        raise HTTPException(404, "Produttore non trovato")
    # Conta sempre i vini collegati: dato leggero, utile a UI per pulsanti delete
    row.update(ana.count_vini_per_produttore(pid))
    if with_madri:
        row["vini_madre"] = ana.list_madri_per_produttore(pid)
    return row


@router.post("/produttori/{source_id}/merge", summary="Fonde un produttore dentro un altro (admin)")
def merge_produttori_endpoint(
    source_id: int,
    target_id: int = Query(..., description="id del produttore di destinazione"),
    current_user: Any = Depends(get_current_user),
):
    """
    Sposta tutti i vini madre dal produttore `source_id` a `target_id`, poi
    elimina il produttore source. Riallinea la cache dei campi anagrafici
    nelle bottiglie via cascade sync sul target.

    Errori:
      - 400 se source==target
      - 404 se uno dei due id non esiste
    """
    _require_admin(current_user)
    try:
        report = ana.merge_produttori(source_id, target_id)
    except ValueError as e:
        msg = str(e)
        if "non trovato" in msg:
            raise HTTPException(404, msg)
        raise HTTPException(400, msg)
    # Cascade sync sul target: rinfresca i campi cache nelle bottiglie ereditate
    sync_report = ana_sync.sync_bottiglie_from_produttore(target_id)
    report["_sync"] = sync_report
    report["target"] = ana.get_produttore(target_id)
    return report


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
    # Fase 7: cascade sync su tutti i madre+bottiglie che usano questo produttore
    sync_report = ana_sync.sync_bottiglie_from_produttore(pid)
    row = ana.get_produttore(pid)
    row["_sync"] = sync_report
    return row


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
@router.get("/fornitori/", summary="Lista fornitori (con counts opzionali)")
def list_fornitori(
    search: Optional[str] = Query(None),
    with_counts: bool = Query(False, description="aggiunge n_madre / n_bottiglie / qta_bottiglie"),
    only_orphans: bool = Query(False, description="solo fornitori senza vini collegati"),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_fornitori(search=search, with_counts=with_counts, only_orphans=only_orphans)


@router.get("/fornitori/{fid}", summary="Dettaglio fornitore (con conta + lista madri)")
def get_fornitore(
    fid: int,
    with_madri: bool = Query(False, description="include lista vini madre distribuiti"),
    current_user: Any = Depends(get_current_user),
):
    row = ana.get_fornitore(fid)
    if not row:
        raise HTTPException(404, "Fornitore non trovato")
    row.update(ana.count_vini_per_fornitore(fid))
    if with_madri:
        row["vini_madre"] = ana.list_madri_per_fornitore(fid)
    return row


@router.post("/fornitori/{source_id}/merge", summary="Fonde un fornitore dentro un altro (admin)")
def merge_fornitori_endpoint(
    source_id: int,
    target_id: int = Query(..., description="id del fornitore di destinazione"),
    current_user: Any = Depends(get_current_user),
):
    """Sposta tutti i vini madre dal fornitore source al target, sync cache su bottiglie, elimina source."""
    _require_admin(current_user)
    try:
        report = ana.merge_fornitori(source_id, target_id)
    except ValueError as e:
        msg = str(e)
        if "non trovato" in msg:
            raise HTTPException(404, msg)
        raise HTTPException(400, msg)
    sync_report = ana_sync.sync_bottiglie_from_fornitore(target_id)
    report["_sync"] = sync_report
    report["target"] = ana.get_fornitore(target_id)
    return report


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
    # Fase 7: cascade sync su tutti i madre+bottiglie che usano questo fornitore
    sync_report = ana_sync.sync_bottiglie_from_fornitore(fid)
    row = ana.get_fornitore(fid)
    row["_sync"] = sync_report
    return row


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


@router.get("/denominazioni/{did}", summary="Dettaglio denominazione (con conta + lista madri)")
def get_denominazione(
    did: int,
    with_madri: bool = Query(False, description="include lista vini madre con questa denominazione"),
    current_user: Any = Depends(get_current_user),
):
    row = ana.get_denominazione(did)
    if not row:
        raise HTTPException(404, "Denominazione non trovata")
    row.update(ana.count_vini_per_denominazione(did))
    if with_madri:
        row["vini_madre"] = ana.list_madri_per_denominazione(did)
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
    # Fase 7: cascade sync su tutti i madre+bottiglie che usano questa denominazione
    sync_report = ana_sync.sync_bottiglie_from_denominazione(did)
    row = ana.get_denominazione(did)
    row["_sync"] = sync_report
    return row


@router.post("/denominazioni/{source_id}/merge", summary="Fonde una denominazione dentro un'altra (admin)")
def merge_denominazioni_endpoint(
    source_id: int,
    target_id: int = Query(..., description="id della denominazione di destinazione"),
    current_user: Any = Depends(get_current_user),
):
    """
    Caso d'uso tipico: hai aggiunto a mano una denominazione custom, poi il sync
    eAmbrosia/MASAF ne ha portata una con codice ufficiale → fondi la custom
    nella seedata. I vini madre passano alla nuova denominazione, la cache
    DENOMINAZIONE delle bottiglie viene risincronizzata sul target.
    """
    _require_admin(current_user)
    try:
        report = ana.merge_denominazioni(source_id, target_id)
    except ValueError as e:
        msg = str(e)
        if "non trovata" in msg:
            raise HTTPException(404, msg)
        raise HTTPException(400, msg)
    # Cascade sync sul target: rinfresca campo cache DENOMINAZIONE sulle bottiglie
    sync_report = ana_sync.sync_bottiglie_from_denominazione(target_id)
    report["_sync"] = sync_report
    report["target"] = ana.get_denominazione(target_id)
    return report


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
      1. produttori distinct → vini_produttori
      2. fornitori distinct (con rappresentante inline) → vini_fornitori
      3. denominazioni match best-effort → link a vini_denominazioni
      4. clustering (produttore, descrizione) → vini_madre
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
      - dry_run=false → commit, popola/aggiorna `vini_denominazioni`
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
@router.get("/vitigni/", summary="Lista vitigni (con counts opzionali)")
def list_vitigni(
    search: Optional[str] = Query(None),
    with_counts: bool = Query(False, description="aggiunge n_madre / n_bottiglie / qta_bottiglie"),
    only_orphans: bool = Query(False, description="solo vitigni senza bottiglie collegate"),
    current_user: Any = Depends(get_current_user),
):
    return ana.list_vitigni(search=search, with_counts=with_counts, only_orphans=only_orphans)


@router.get("/vitigni/{vid}", summary="Dettaglio vitigno (con conta + lista madri)")
def get_vitigno(
    vid: int,
    with_madri: bool = Query(False, description="include lista vini madre che usano il vitigno"),
    current_user: Any = Depends(get_current_user),
):
    row = ana.get_vitigno(vid)
    if not row:
        raise HTTPException(404, "Vitigno non trovato")
    row.update(ana.count_vini_per_vitigno(vid))
    if with_madri:
        row["vini_madre"] = ana.list_madri_per_vitigno(vid)
    return row


@router.post("/vitigni/{source_id}/merge", summary="Fonde un vitigno dentro un altro (admin)")
def merge_vitigni_endpoint(
    source_id: int,
    target_id: int = Query(..., description="id del vitigno di destinazione"),
    current_user: Any = Depends(get_current_user),
):
    """
    Fonde i vitigni duplicati. Tipico caso: hai aggiunto a mano "Nebbiolo " (con
    spazio finale) prima del seed, oppure "nebbiolo" minuscolo e poi è arrivato
    "Nebbiolo" canonico → si fondono.
    Per ogni bottiglia: nei 5 slot vitigno_X_id, source viene sostituito da target.
    Se la bottiglia aveva già target in un altro slot, lo slot source viene azzerato
    (evita duplicati con stesso id). Percentuali NON ridistribuite automaticamente.
    """
    _require_admin(current_user)
    try:
        report = ana.merge_vitigni(source_id, target_id)
    except ValueError as e:
        msg = str(e)
        if "non trovato" in msg:
            raise HTTPException(404, msg)
        raise HTTPException(400, msg)
    return report


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
    # Fase 7: propaga campi anagrafici a tutte le bottiglie del madre
    n_bot = ana_sync.sync_bottiglie_from_madre(mid)
    row = ana.get_madre(mid)
    row["_sync"] = {"n_bottiglie": n_bot}
    return row


@router.post(
    "/madre/{mid}/promote-composto",
    summary="Promuove un madre legacy a descrizione composta (M2.9-bis, admin)",
)
def promote_madre_composto(
    mid: int,
    payload: MadrePromotePayload,
    current_user: Any = Depends(get_current_user),
):
    """
    Promuove un vino madre dalla descrizione legacy (testuale, descrizione_auto=0)
    alla descrizione composta automatica (descrizione_auto=1).

    Vedi `app/services/vini_descrizione.py` per la regola di composizione.

    Use case: l'utente sta creando un nuovo "figlio" (annata) di un madre vecchio
    e il wizard "Nuovo Vino" gli mostra un banner "questo madre è ancora in formato
    legacy → vuoi sistemarlo?". L'utente compila i 4 ingredienti (denominazione,
    nome_etichetta, vitigni con %, grado), il frontend invia il payload qui, il
    backend ricompone la descrizione e setta `descrizione_auto = 1`.

    Errori:
      - 404 se madre non esiste
      - 400 se la denominazione_id passata non esiste
      - 400 se la composizione risulterebbe vuota (mancano tutti gli ingredienti)
    """
    _require_admin(current_user)
    if not ana.get_madre(mid):
        raise HTTPException(404, "Vino madre non trovato")

    # Verifica FK denominazione se passata
    if payload.denominazione_id is not None and not ana.get_denominazione(payload.denominazione_id):
        raise HTTPException(
            400, f"Denominazione {payload.denominazione_id} non trovata"
        )

    try:
        updated = ana.promote_madre_a_composto(
            mid=mid,
            denominazione_id=payload.denominazione_id,
            nome_etichetta=payload.nome_etichetta,
            grado_alcolico_tipico=payload.grado_alcolico_tipico,
            vitigni_stringa=payload.vitigni_stringa,
            vitigni=[v.dict() for v in payload.vitigni] if payload.vitigni else None,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    if updated is None:
        raise HTTPException(404, "Vino madre non trovato")

    # Cascade sync sulle bottiglie del madre (la descrizione è cache anche lì)
    n_bot = ana_sync.sync_bottiglie_from_madre(mid)
    updated["_sync"] = {"n_bottiglie": n_bot}
    return updated


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


# ============================================================
# BOTTIGLIE — POST per creazione (Fase 8 wizard attivato, 2026-05-18)
# ============================================================
class BottigliaCreate(BaseModel):
    """
    Payload per creare una bottiglia (annata di un madre) via wizard.

    `madre_id` e `ANNATA` sono gli unici obbligatori; il resto è opzionale.
    I campi anagrafici (PRODUTTORE/DESCRIZIONE/REGIONE/...) NON sono nel payload:
    vengono propagati dal madre via cascade sync. Solo `madre_id` lega.
    """
    madre_id: int
    ANNATA: str = Field(..., min_length=1)
    id_excel: Optional[int] = None

    FORMATO: Optional[str] = None
    VITIGNI: Optional[str] = None
    GRADO_ALCOLICO: Optional[float] = None

    # Prezzi
    PREZZO_CARTA: Optional[float] = None
    EURO_LISTINO: Optional[float] = None
    SCONTO: Optional[float] = None
    NOTE_PREZZO: Optional[str] = None
    PREZZO_CALICE: Optional[float] = None
    PREZZO_CALICE_MANUALE: Optional[int] = 0

    # Flag (INTEGER 0/1)
    CARTA: Optional[int] = None
    IPRATICO: Optional[int] = None
    BIOLOGICO: Optional[int] = 0
    VENDITA_CALICE: Optional[int] = 0
    FORZA_PREZZO: Optional[int] = 0

    # Stati
    STATO_VENDITA: Optional[int] = None
    STATO_RIORDINO: Optional[str] = None
    STATO_CONSERVAZIONE: Optional[str] = None
    NOTE_STATO: Optional[str] = None

    # Locazioni + quantità
    FRIGORIFERO: Optional[str] = None
    QTA_FRIGO: Optional[int] = 0
    LOCAZIONE_1: Optional[str] = None
    QTA_LOC1: Optional[int] = 0
    LOCAZIONE_2: Optional[str] = None
    QTA_LOC2: Optional[int] = 0
    LOCAZIONE_3: Optional[str] = None
    QTA_LOC3: Optional[int] = 0

    # 5 slot vitigno per annata (possono divergere dal madre)
    vitigno_1_id: Optional[int] = None
    vitigno_1_pct: Optional[float] = None
    vitigno_2_id: Optional[int] = None
    vitigno_2_pct: Optional[float] = None
    vitigno_3_id: Optional[int] = None
    vitigno_3_pct: Optional[float] = None
    vitigno_4_id: Optional[int] = None
    vitigno_4_pct: Optional[float] = None
    vitigno_5_id: Optional[int] = None
    vitigno_5_pct: Optional[float] = None

    # Metadati
    NOTE: Optional[str] = None
    ORIGINE: Optional[str] = "wizard_v2"


@router.post("/bottiglia/", summary="Crea bottiglia (annata di un madre) — Fase 8 wizard attivato")
def create_bottiglia(
    payload: BottigliaCreate,
    current_user: Any = Depends(get_current_user),
):
    """
    Endpoint principale per la creazione di una nuova annata via wizard
    Cantina 2. Crea la bottiglia in `vini_bottiglie` linkata al madre,
    chiama il cascade sync per popolare i campi anagrafici ridondanti.

    Errori:
      - 400 se madre_id non esiste o ANNATA manca/empty
      - 500 su altri errori
    """
    _require_admin(current_user)
    try:
        new_id = ana.create_bottiglia(payload.dict(exclude_unset=False))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ana.get_bottiglia(new_id) if hasattr(ana, "get_bottiglia") else {"id": new_id, "status": "created"}


@router.get("/madre/{mid}/bottiglie", summary="Bottiglie (annate) collegate al madre")
def get_bottiglie_by_madre(mid: int, current_user: Any = Depends(get_current_user)):
    """
    Vista esplorativa Fase 8 (opzione C, read-only): per il madre `mid`,
    ritorna l'elenco delle annate disponibili in cantina con campi
    annata-specifici (formato, prezzi, giacenze, stati).

    I campi anagrafici (PRODUTTORE/DESCRIZIONE/...) NON sono ripetuti qui:
    sono ridondanza sincronizzata dal madre, accessibili via GET /madre/{mid}.
    """
    if not ana.get_madre(mid):
        raise HTTPException(404, "Vino madre non trovato")
    return ana.list_bottiglie_by_madre(mid)


# ============================================================
# SYNC FULL — safety net (Fase 7)
# ============================================================
@router.post("/sync-all", summary="Risincronizza tutte le bottiglie dalle anagrafiche (admin)")
def sync_all_endpoint(current_user: Any = Depends(get_current_user)):
    """
    Full resync: propaga i campi anagrafici da `vini_madre` (+ produttori,
    fornitori, denominazioni) verso `vini_bottiglie` per TUTTI i madre.

    Safety net contro drift accidentali. Idempotente. Le bottiglie orfane
    (madre_id IS NULL) non vengono toccate.

    Ritorna un report con n_madre_processati, n_bottiglie_aggiornate,
    n_orfani_skippati, durata_sec.
    """
    _require_admin(current_user)
    try:
        return ana_sync.sync_all_bottiglie()
    except Exception as e:
        raise HTTPException(500, f"Sync fallita: {e}")


# ============================================================
# ROLLBACK — drop tabelle _v2 (Fase 7, safety blue-green)
# ============================================================
@router.post("/rollback", summary="Rollback: droppa tutte le tabelle _v2 (admin, distruttivo)")
def rollback_v2_tables(
    confirm: str = Query(
        "",
        description="Per sicurezza, passare confirm=YES_DROP_V2_TABLES per eseguire davvero."
    ),
    current_user: Any = Depends(get_current_user),
):
    """
    DISTRUTTIVO: cancella le 6 tabelle `_v2` del refactor anagrafiche
    (produttori, fornitori, denominazioni, vitigni, madre, bottiglie),
    riportando il DB allo stato pre-refactor.

    Prima del drop, fa un backup esplicito del file DB con timestamp.

    Da usare SOLO in finestra di rollback (fino a 24h dopo lo swap, vedi
    docs/refactor_anagrafiche_vini.md §1).

    Richiede confirm=YES_DROP_V2_TABLES per evitare click accidentali.
    """
    _require_admin(current_user)
    if confirm != "YES_DROP_V2_TABLES":
        raise HTTPException(
            400,
            "Rollback bloccato: passare ?confirm=YES_DROP_V2_TABLES per confermare."
        )

    import shutil
    import sqlite3 as _sqlite3
    from datetime import datetime
    from app.models.vini_anagrafiche_db import TABELLE
    from app.utils.locale_data import locale_data_path

    db_path = locale_data_path("vini_magazzino.sqlite3")
    if not db_path.exists():
        raise HTTPException(500, f"DB non trovato: {db_path}")

    # 1) Backup esplicito pre-drop
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(db_path.name + f".pre-rollback-{ts}")
    shutil.copy2(db_path, backup_path)

    # 2) Drop in ordine inverso alle FK (bottiglie -> madre -> resto)
    drop_order = ["bottiglie", "madre", "vitigni", "denominazioni", "fornitori", "produttori"]
    droppate = []
    conn = _sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        for key in drop_order:
            tbl = TABELLE[key]
            cur.execute(f"DROP TABLE IF EXISTS {tbl}")
            droppate.append(tbl)
        conn.commit()
    finally:
        conn.close()

    return {
        "status": "ok",
        "backup": str(backup_path),
        "tabelle_droppate": droppate,
        "timestamp": ts,
        "warning": (
            "Refactor anagrafiche rollbackato. Per ripartire da zero, "
            "rilancia le mig 125 + 126 + 127 (boot backend) e re-esegui "
            "POST /vini/anagrafiche/migrate-from-legacy."
        ),
    }
