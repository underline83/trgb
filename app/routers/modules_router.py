"""
TRGB — Modules Router

Gestione abilitazione/disabilitazione macro-moduli.
GET  /settings/modules         — stato moduli (tutti gli utenti autenticati)
PUT  /settings/modules         — aggiorna stati (solo admin)
"""

import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List

from app.services.auth_service import get_current_user

router = APIRouter(prefix="/settings/modules", tags=["modules"])

MODULES_FILE = Path(__file__).resolve().parent.parent / "data" / "modules.json"


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def _load() -> list:
    with open(MODULES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: list) -> None:
    with open(MODULES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# SCHEMA
# ---------------------------------------------------------------------------
class ModuleUpdate(BaseModel):
    key: str
    enabled: bool


# ---------------------------------------------------------------------------
# GET /settings/modules — tutti gli utenti autenticati
# ---------------------------------------------------------------------------
@router.get("/")
def get_modules(current_user: dict = Depends(get_current_user)):
    return _load()


# ---------------------------------------------------------------------------
# PUT /settings/modules — solo admin, aggiorna lista di moduli
# ---------------------------------------------------------------------------
@router.put("/")
def update_modules(updates: List[ModuleUpdate], current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")

    modules = _load()
    update_map = {u.key: u.enabled for u in updates}

    for m in modules:
        if m["key"] in update_map:
            # Il modulo admin non può essere disabilitato (protezione)
            if m["key"] == "admin" and not update_map[m["key"]]:
                raise HTTPException(status_code=400, detail="Il modulo Amministrazione non può essere disabilitato")
            m["enabled"] = update_map[m["key"]]

    _save(modules)
    return modules
