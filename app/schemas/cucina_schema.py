# @version: v1.0-cucina-schema
# -*- coding: utf-8 -*-
"""
Schemi Pydantic per il modulo Cucina (MVP).
"""

from typing import List, Optional
from pydantic import BaseModel, Field


# ── Costanti enum-like (validate nel router per chiarezza messaggio) ───
FREQUENZE = {"GIORNALIERA"}  # MVP: solo giornaliera
REPARTI = {"CUCINA", "BAR", "SALA", "ALTRO"}
TURNI = {"APERTURA", "PRANZO", "POMERIGGIO", "CENA", "CHIUSURA", "GIORNATA"}
ITEM_TIPI = {"CHECKBOX", "NUMERICO", "TEMPERATURA", "TESTO"}
INSTANCE_STATI = {"APERTA", "IN_CORSO", "COMPLETATA", "SCADUTA", "SALTATA"}
EXEC_STATI = {"OK", "FAIL", "SKIPPED", "PENDING"}
TASK_STATI = {"APERTO", "IN_CORSO", "COMPLETATO", "SCADUTO", "ANNULLATO"}
TASK_PRIORITA = {"BASSA", "MEDIA", "ALTA"}


# ── CHECKLIST ITEM ─────────────────────────────────────────────────────

class ChecklistItemIn(BaseModel):
    titolo: str
    tipo: str = "CHECKBOX"
    ordine: int = 0
    obbligatorio: bool = True
    min_valore: Optional[float] = None
    max_valore: Optional[float] = None
    unita_misura: Optional[str] = None
    note: Optional[str] = None


class ChecklistItemOut(ChecklistItemIn):
    id: int
    template_id: int


# ── CHECKLIST TEMPLATE ─────────────────────────────────────────────────

class ChecklistTemplateIn(BaseModel):
    nome: str
    reparto: str = "CUCINA"
    frequenza: str = "GIORNALIERA"
    turno: Optional[str] = None
    ora_scadenza_entro: Optional[str] = None     # HH:MM
    attivo: bool = False
    note: Optional[str] = None
    items: List[ChecklistItemIn] = Field(default_factory=list)


class ChecklistTemplateUpdate(BaseModel):
    nome: Optional[str] = None
    reparto: Optional[str] = None
    frequenza: Optional[str] = None
    turno: Optional[str] = None
    ora_scadenza_entro: Optional[str] = None
    attivo: Optional[bool] = None
    note: Optional[str] = None
    # Se presente, sostituisce interamente gli items (pattern "replace all")
    items: Optional[List[ChecklistItemIn]] = None


class ChecklistTemplateOut(BaseModel):
    id: int
    nome: str
    reparto: str
    frequenza: str
    turno: Optional[str]
    ora_scadenza_entro: Optional[str]
    attivo: bool
    note: Optional[str]
    created_by: Optional[str]
    created_at: str
    updated_at: str
    items: List[ChecklistItemOut] = Field(default_factory=list)


# ── CHECKLIST INSTANCE / EXECUTION ─────────────────────────────────────

class AssegnaInstanceIn(BaseModel):
    user: str


class SaltaInstanceIn(BaseModel):
    motivo: Optional[str] = None


class CheckItemIn(BaseModel):
    instance_id: int
    stato: str  # OK / FAIL / SKIPPED
    valore_numerico: Optional[float] = None
    valore_testo: Optional[str] = None
    note: Optional[str] = None


class ChecklistExecutionOut(BaseModel):
    id: Optional[int] = None  # None = non ancora iniziata (PENDING virtuale)
    instance_id: int
    item_id: int
    stato: str = "PENDING"
    valore_numerico: Optional[float] = None
    valore_testo: Optional[str] = None
    completato_at: Optional[str] = None
    completato_da: Optional[str] = None
    note: Optional[str] = None
    # Dati item denormalizzati per il FE (evita fetch aggiuntivo)
    item_titolo: Optional[str] = None
    item_tipo: Optional[str] = None
    item_ordine: Optional[int] = None
    item_obbligatorio: Optional[bool] = None
    item_min: Optional[float] = None
    item_max: Optional[float] = None
    item_unita: Optional[str] = None


class ChecklistInstanceOut(BaseModel):
    id: int
    template_id: int
    template_nome: Optional[str] = None
    reparto: Optional[str] = None
    data_riferimento: str
    turno: Optional[str]
    scadenza_at: Optional[str]
    stato: str
    assegnato_user: Optional[str]
    completato_at: Optional[str]
    completato_da: Optional[str]
    score_compliance: Optional[int]
    note: Optional[str]
    items: List[ChecklistExecutionOut] = Field(default_factory=list)


# ── AGENDA ─────────────────────────────────────────────────────────────

class AgendaTurnoBucket(BaseModel):
    turno: str
    instances: List[ChecklistInstanceOut] = Field(default_factory=list)


class AgendaGiornoOut(BaseModel):
    data: str
    turni: List[AgendaTurnoBucket] = Field(default_factory=list)
    tasks: List["TaskSingoloOut"] = Field(default_factory=list)


class GeneraIstanzeIn(BaseModel):
    data_da: str     # YYYY-MM-DD
    data_a: str      # YYYY-MM-DD (inclusa)


# ── TASK SINGOLO ───────────────────────────────────────────────────────

class TaskSingoloIn(BaseModel):
    titolo: str
    descrizione: Optional[str] = None
    data_scadenza: Optional[str] = None     # YYYY-MM-DD
    ora_scadenza: Optional[str] = None      # HH:MM
    assegnato_user: Optional[str] = None
    priorita: str = "MEDIA"
    ref_modulo: Optional[str] = None
    ref_id: Optional[int] = None


class TaskSingoloUpdate(BaseModel):
    titolo: Optional[str] = None
    descrizione: Optional[str] = None
    data_scadenza: Optional[str] = None
    ora_scadenza: Optional[str] = None
    assegnato_user: Optional[str] = None
    priorita: Optional[str] = None
    stato: Optional[str] = None


class CompletaTaskIn(BaseModel):
    note_completamento: Optional[str] = None


class TaskSingoloOut(BaseModel):
    id: int
    titolo: str
    descrizione: Optional[str]
    data_scadenza: Optional[str]
    ora_scadenza: Optional[str]
    assegnato_user: Optional[str]
    priorita: str
    stato: str
    completato_at: Optional[str]
    completato_da: Optional[str]
    note_completamento: Optional[str]
    origine: str
    ref_modulo: Optional[str]
    ref_id: Optional[int]
    created_by: Optional[str]
    created_at: str
    updated_at: str


AgendaGiornoOut.model_rebuild()
