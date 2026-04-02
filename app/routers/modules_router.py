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

# Struttura default — usata se modules.json non esiste (es. primo deploy, file perso)
DEFAULT_MODULES = [
    {
        "key": "vini", "label": "Gestione Vini", "icon": "\U0001f377",
        "description": "Carta vini, magazzino, vendite, impostazioni",
        "roles": ["superadmin", "admin", "sommelier", "sala", "viewer"],
        "sub": [
            {"key": "carta",     "label": "Carta dei Vini", "roles": ["superadmin", "admin", "sommelier", "sala", "viewer"]},
            {"key": "vendite",   "label": "Vendite",        "roles": ["superadmin", "admin", "sommelier", "sala"]},
            {"key": "magazzino", "label": "Cantina",        "roles": ["superadmin", "admin", "sommelier"]},
            {"key": "dashboard", "label": "Dashboard",      "roles": ["superadmin", "admin", "sommelier", "viewer"]},
            {"key": "ipratico",  "label": "iPratico Sync",  "roles": ["superadmin", "admin"]},
            {"key": "settings",  "label": "Impostazioni",   "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "acquisti", "label": "Gestione Acquisti", "icon": "\U0001f4e6",
        "description": "Fatture XML, fornitori, dashboard acquisti, categorie",
        "roles": ["superadmin", "admin", "viewer"],
        "sub": [
            {"key": "dashboard",    "label": "Dashboard",    "roles": ["superadmin", "admin", "viewer"]},
            {"key": "fatture",      "label": "Fatture",      "roles": ["superadmin", "admin", "viewer"]},
            {"key": "fornitori",    "label": "Fornitori",    "roles": ["superadmin", "admin", "viewer"]},
            {"key": "impostazioni", "label": "Impostazioni", "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "ricette", "label": "Gestione Ricette", "icon": "\U0001f4d8",
        "description": "Archivio ricette, costi, stampa PDF",
        "roles": ["superadmin", "admin", "chef", "viewer"],
        "sub": [
            {"key": "archivio",    "label": "Archivio",    "roles": ["superadmin", "admin", "chef", "viewer"]},
            {"key": "ingredienti", "label": "Ingredienti", "roles": ["superadmin", "admin", "chef"]},
            {"key": "matching",    "label": "Matching",    "roles": ["superadmin", "admin"]},
            {"key": "dashboard",   "label": "Dashboard",   "roles": ["superadmin", "admin", "chef", "viewer"]},
            {"key": "settings",    "label": "Strumenti",   "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "vendite", "label": "Gestione Vendite", "icon": "\U0001f4b5",
        "description": "Corrispettivi, chiusure cassa, dashboard vendite",
        "roles": ["superadmin", "admin", "sala", "viewer"],
        "sub": [
            {"key": "fine-turno",   "label": "Chiusura Turno", "roles": ["superadmin", "admin", "sala"]},
            {"key": "chiusure",     "label": "Lista Chiusure", "roles": ["superadmin", "admin"]},
            {"key": "riepilogo",    "label": "Riepilogo",      "roles": ["superadmin", "admin"]},
            {"key": "dashboard",    "label": "Dashboard",      "roles": ["superadmin", "admin", "viewer"]},
            {"key": "impostazioni", "label": "Impostazioni",   "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "flussi-cassa", "label": "Flussi di Cassa", "icon": "\U0001f3e6",
        "description": "Conti correnti, carta di credito, contanti, mance",
        "roles": ["superadmin", "admin", "sala", "viewer"],
        "sub": [
            {"key": "dashboard",    "label": "Dashboard",        "roles": ["superadmin", "admin"]},
            {"key": "cc",           "label": "Conti Correnti",   "roles": ["superadmin", "admin"]},
            {"key": "crossref",     "label": "Riconciliazione",  "roles": ["superadmin", "admin"]},
            {"key": "carta",        "label": "Carta di Credito", "roles": ["superadmin", "admin"]},
            {"key": "contanti",     "label": "Contanti",         "roles": ["superadmin", "admin"]},
            {"key": "mance",        "label": "Mance",            "roles": ["superadmin", "admin", "sala"]},
            {"key": "impostazioni", "label": "Impostazioni",     "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "controllo-gestione", "label": "Controllo di Gestione", "icon": "\U0001f3af",
        "description": "Panorama finanziario unificato \u2014 vendite, acquisti, banca, scadenze, margine",
        "roles": ["superadmin", "admin"],
        "sub": [
            {"key": "dashboard",   "label": "Dashboard",   "roles": ["superadmin", "admin"]},
            {"key": "uscite",      "label": "Scadenzario", "roles": ["superadmin", "admin"]},
            {"key": "confronto",   "label": "Confronto",   "roles": ["superadmin", "admin"]},
            {"key": "spese-fisse", "label": "Spese Fisse", "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "statistiche", "label": "Statistiche", "icon": "\U0001f4c8",
        "description": "Analisi vendite iPratico, categorie, prodotti, trend",
        "roles": ["superadmin", "admin", "viewer"],
        "sub": [
            {"key": "dashboard", "label": "Cucina",            "roles": ["superadmin", "admin", "viewer"]},
            {"key": "coperti",   "label": "Coperti & Incassi", "roles": ["superadmin", "admin", "viewer"]},
        ],
    },
    {
        "key": "dipendenti", "label": "Dipendenti", "icon": "\U0001f465",
        "description": "Personale, buste paga, turni, scadenze documenti, costi",
        "roles": ["superadmin", "admin"],
        "sub": [
            {"key": "anagrafica", "label": "Anagrafica", "roles": ["superadmin", "admin"]},
            {"key": "buste-paga", "label": "Buste Paga", "roles": ["superadmin", "admin"]},
            {"key": "turni",      "label": "Turni",      "roles": ["superadmin", "admin"]},
            {"key": "scadenze",   "label": "Scadenze",   "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "impostazioni", "label": "Impostazioni", "icon": "\u2699\ufe0f",
        "description": "Utenti, ruoli, configurazione sistema",
        "roles": ["superadmin", "admin"],
    },
]


def _load() -> list:
    if not MODULES_FILE.exists():
        # Genera modules.json di default se non esiste
        _save(DEFAULT_MODULES)
        return DEFAULT_MODULES
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
