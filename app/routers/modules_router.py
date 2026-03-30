"""
TRGB — Modules Router

Permessi moduli e sotto-moduli per ruolo.
GET  /settings/modules   — stato moduli con sotto-moduli (tutti gli utenti autenticati)
PUT  /settings/modules   — aggiorna permessi moduli + sotto-moduli (solo admin)
"""

import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from app.services.auth_service import get_current_user, is_admin

router = APIRouter(prefix="/settings/modules", tags=["modules"])

MODULES_FILE = Path(__file__).resolve().parent.parent / "data" / "modules.json"
VALID_ROLES = {"superadmin", "admin", "chef", "sommelier", "sala", "viewer"}


def _load() -> list:
    with open(MODULES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: list) -> None:
    with open(MODULES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


class SubModuleUpdate(BaseModel):
    key: str
    roles: List[str]


class ModuleUpdate(BaseModel):
    key: str
    roles: List[str]
    sub: Optional[List[SubModuleUpdate]] = None


def _force_admin_roles(roles: list) -> list:
    """Assicura che admin e superadmin siano sempre presenti."""
    r = [x for x in roles if x in VALID_ROLES]
    if "admin" not in r:
        r.append("admin")
    if "superadmin" not in r:
        r.append("superadmin")
    return r


@router.get("/")
def get_modules(current_user: dict = Depends(get_current_user)):
    return _load()


@router.put("/")
def update_modules(updates: List[ModuleUpdate], current_user: dict = Depends(get_current_user)):
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")

    modules = _load()
    update_map = {u.key: u for u in updates}

    for m in modules:
        upd = update_map.get(m["key"])
        if not upd:
            continue

        if m["key"] == "impostazioni":
            # Impostazioni ha sempre e solo i ruoli admin/superadmin
            m["roles"] = ["superadmin", "admin"]
            continue

        # Aggiorna ruoli modulo
        m["roles"] = _force_admin_roles(upd.roles)

        # Aggiorna sotto-moduli se forniti
        if upd.sub and "sub" in m:
            sub_map = {s.key: s.roles for s in upd.sub}
            for s in m["sub"]:
                if s["key"] in sub_map:
                    new_roles = _force_admin_roles(sub_map[s["key"]])
                    # I ruoli del sotto-modulo non possono superare quelli del modulo padre
                    s["roles"] = [r for r in new_roles if r in m["roles"]]

    _save(modules)
    return modules
