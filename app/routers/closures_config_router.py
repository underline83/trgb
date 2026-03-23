"""
TRGB — Closures Config Router

Configurazione giorni di chiusura:
- Giorno settimanale fisso (es. mercoledì)
- Giorni specifici (ferie, festivi)

GET  /settings/closures-config  — leggi configurazione
PUT  /settings/closures-config  — aggiorna configurazione (solo admin)
"""

import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import get_current_user, is_admin

router = APIRouter(prefix="/settings/closures-config", tags=["closures-config"])

CONFIG_FILE = Path(__file__).resolve().parent.parent / "data" / "closures_config.json"

GIORNI_SETTIMANA = {0: "Lunedì", 1: "Martedì", 2: "Mercoledì", 3: "Giovedì", 4: "Venerdì", 5: "Sabato", 6: "Domenica"}


class ClosuresConfig(BaseModel):
    giorno_chiusura_settimanale: Optional[int] = None  # 0=Lun..6=Dom, None=nessun giorno fisso
    giorni_chiusi: List[str] = []  # ["2026-01-01", "2026-08-15", ...]


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

    # Deduplica e ordina
    giorni = sorted(set(payload.giorni_chiusi))

    data = {
        "giorno_chiusura_settimanale": payload.giorno_chiusura_settimanale,
        "giorni_chiusi": giorni,
    }
    _save(data)
    return ClosuresConfig(**data)
