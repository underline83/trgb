"""
TRGB — Modules Router

Permessi moduli per ruolo.
GET  /settings/modules   — stato moduli (tutti gli utenti autenticati)
PUT  /settings/modules   — aggiorna permessi (solo admin)
"""

import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List

from app.services.auth_service import get_current_user

router = APIRouter(prefix="/settings/modules", tags=["modules"])

MODULES_FILE = Path(__file__).resolve().parent.parent / "data" / "modules.json"
VALID_ROLES = {"admin", "chef", "sommelier", "viewer"}


def _load() -> list:
    with open(MODULES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: list) -> None:
    with open(MODULES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


class ModuleUpdate(BaseModel):
    key: str
    roles: List[str]


@router.get("/")
def get_modules(current_user: dict = Depends(get_current_user)):
    return _load()


@router.put("/")
def update_modules(updates: List[ModuleUpdate], current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")

    modules = _load()
    update_map = {u.key: u.roles for u in updates}

    for m in modules:
        if m["key"] not in update_map:
            continue
        if m["key"] == "admin":
            # Il modulo admin ha sempre e solo il ruolo admin
            m["roles"] = ["admin"]
            continue
        # Valida i ruoli, forza sempre admin nella lista
        roles = [r for r in update_map[m["key"]] if r in VALID_ROLES]
        if "admin" not in roles:
            roles.append("admin")
        m["roles"] = roles

    _save(modules)
    return modules
