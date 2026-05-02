"""
TRGB — Closures Config Router

Configurazione giorni di chiusura:
- Giorno settimanale fisso (es. mercoledì)
- Giorni specifici (ferie, festivi)

GET  /settings/closures-config  — leggi configurazione
PUT  /settings/closures-config  — aggiorna configurazione (solo admin)
"""

import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import get_current_user, is_admin
from app.utils.locale_data import locale_data_path

router = APIRouter(prefix="/settings/closures-config", tags=["closures-config"])

# R6.5 — path tenant-aware. closures_config.json e' un dato di locale
# (giorni di chiusura del ristorante), va sotto locali/<TRGB_LOCALE>/data/.
CONFIG_FILE = locale_data_path("closures_config.json")

GIORNI_SETTIMANA = {0: "Lunedì", 1: "Martedì", 2: "Mercoledì", 3: "Giovedì", 4: "Venerdì", 5: "Sabato", 6: "Domenica"}


class TurnoChiuso(BaseModel):
    data: str              # "2026-04-05"
    turno: str             # "pranzo" | "cena"
    motivo: str = ""       # "Pasqua", opzionale


class ClosuresConfig(BaseModel):
    giorno_chiusura_settimanale: Optional[int] = None  # 0=Lun..6=Dom, None=nessun giorno fisso
    giorni_chiusi: List[str] = []  # ["2026-01-01", "2026-08-15", ...]
    turni_chiusi: List[TurnoChiuso] = []  # chiusure parziali (solo un turno)


def _load() -> dict:
    if not CONFIG_FILE.exists():
        return {"giorno_chiusura_settimanale": 2, "giorni_chiusi": []}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_closures_config() -> dict:
    """Funzione pubblica per uso da altri moduli (es. admin_finance)."""
    return _load()


@router.get("/", response_model=ClosuresConfig)
def get_config(current_user: dict = Depends(get_current_user)):
    return ClosuresConfig(**_load())


@router.put("/", response_model=ClosuresConfig)
def update_config(payload: ClosuresConfig, current_user: dict = Depends(get_current_user)):
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")

    # Valida giorno settimanale
    if payload.giorno_chiusura_settimanale is not None:
        if payload.giorno_chiusura_settimanale < 0 or payload.giorno_chiusura_settimanale > 6:
            raise HTTPException(status_code=400, detail="Giorno settimanale deve essere 0-6 (Lun-Dom)")

    # Valida date
    import re
    date_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    for d in payload.giorni_chiusi:
        if not date_re.match(d):
            raise HTTPException(status_code=400, detail=f"Data non valida: {d}")

    # Valida turni chiusi
    for tc in payload.turni_chiusi:
        if not date_re.match(tc.data):
            raise HTTPException(status_code=400, detail=f"Data turno chiuso non valida: {tc.data}")
        if tc.turno not in ("pranzo", "cena"):
            raise HTTPException(status_code=400, detail=f"Turno non valido: {tc.turno}")

    # Deduplica e ordina
    giorni = sorted(set(payload.giorni_chiusi))

    # Deduplica turni chiusi per data+turno
    seen = set()
    turni_unici = []
    for tc in sorted(payload.turni_chiusi, key=lambda t: (t.data, t.turno)):
        key = (tc.data, tc.turno)
        if key not in seen:
            seen.add(key)
            turni_unici.append(tc.model_dump())

    data = {
        "giorno_chiusura_settimanale": payload.giorno_chiusura_settimanale,
        "giorni_chiusi": giorni,
        "turni_chiusi": turni_unici,
    }
    _save(data)
    return ClosuresConfig(**data)
