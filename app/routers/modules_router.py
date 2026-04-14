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

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
# modules.json = seed tracciato in git (default ruoli)
# modules.runtime.json = stato effettivo, NON tracciato (sopravvive ai push)
MODULES_SEED_FILE = _DATA_DIR / "modules.json"
MODULES_FILE = _DATA_DIR / "modules.runtime.json"
VALID_ROLES = {"superadmin", "admin", "contabile", "chef", "sommelier", "sala", "viewer"}

# Struttura default — usata se modules.json non esiste (es. primo deploy, file perso)
# Aggiornata 2026-04-14 — Allineata al seed con matrice ruoli definita da Marco (sessione 39)
DEFAULT_MODULES = [
    {
        "key": "vini", "label": "Gestione Vini", "icon": "\U0001f377",
        "description": "Carta vini, magazzino, vendite, impostazioni",
        "roles": ["superadmin", "admin", "sommelier", "sala"],
        "sub": [
            {"key": "carta",     "label": "Carta dei Vini", "roles": ["superadmin", "admin", "sommelier", "sala"]},
            {"key": "vendite",   "label": "Vendite",        "roles": ["superadmin", "admin", "sommelier", "sala"]},
            {"key": "magazzino", "label": "Cantina",        "roles": ["superadmin", "admin", "sommelier", "sala"]},
            {"key": "dashboard", "label": "Dashboard",      "roles": ["superadmin", "admin", "sommelier", "sala"]},
            {"key": "ipratico",  "label": "iPratico Sync",  "roles": ["superadmin", "admin"]},
            {"key": "settings",  "label": "Impostazioni",   "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "acquisti", "label": "Gestione Acquisti", "icon": "\U0001f4e6",
        "description": "Fatture XML, fornitori, dashboard acquisti, categorie",
        "roles": ["superadmin", "admin", "contabile"],
        "sub": [
            {"key": "dashboard",    "label": "Dashboard",    "roles": ["superadmin", "admin", "contabile"]},
            {"key": "fatture",      "label": "Fatture",      "roles": ["superadmin", "admin", "contabile"]},
            {"key": "fornitori",    "label": "Fornitori",    "roles": ["superadmin", "admin", "contabile"]},
            {"key": "proforme",     "label": "Pro-forme",    "roles": ["superadmin", "admin"]},
            {"key": "impostazioni", "label": "Impostazioni", "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "ricette", "label": "Gestione Cucina", "icon": "\U0001f4d8",
        "description": "Archivio ricette, food cost, scelta del macellaio",
        "roles": ["superadmin", "admin", "chef", "sala", "sommelier"],
        "sub": [
            {"key": "archivio",    "label": "Archivio",             "roles": ["superadmin", "admin", "chef"]},
            {"key": "ingredienti", "label": "Ingredienti",          "roles": ["superadmin", "admin", "chef"]},
            {"key": "macellaio",   "label": "Scelta del Macellaio", "roles": ["superadmin", "admin", "chef", "sala", "sommelier"]},
            {"key": "matching",    "label": "Matching",             "roles": ["superadmin", "admin"]},
            {"key": "dashboard",   "label": "Dashboard",            "roles": ["superadmin", "admin", "chef"]},
            {"key": "settings",    "label": "Impostazioni",         "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "vendite", "label": "Gestione Vendite", "icon": "\U0001f4b5",
        "description": "Corrispettivi, chiusure cassa, dashboard vendite",
        "roles": ["superadmin", "admin", "sala", "sommelier", "contabile"],
        "sub": [
            {"key": "fine-turno",   "label": "Chiusura Turno", "roles": ["superadmin", "admin", "sala", "sommelier", "contabile"]},
            {"key": "chiusure",     "label": "Lista Chiusure", "roles": ["superadmin", "admin"]},
            {"key": "riepilogo",    "label": "Riepilogo",      "roles": ["superadmin", "admin", "contabile"]},
            {"key": "dashboard",    "label": "Dashboard",      "roles": ["superadmin", "admin", "contabile"]},
            {"key": "impostazioni", "label": "Impostazioni",   "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "flussi-cassa", "label": "Flussi di Cassa", "icon": "\U0001f3e6",
        "description": "Conti correnti, carta di credito, contanti, mance",
        "roles": ["superadmin", "admin", "contabile", "sala", "sommelier", "chef"],
        "sub": [
            {"key": "dashboard",    "label": "Dashboard",        "roles": ["superadmin", "admin", "contabile"]},
            {"key": "cc",           "label": "Conti Correnti",   "roles": ["superadmin", "admin", "contabile"]},
            {"key": "crossref",     "label": "Riconciliazione",  "roles": ["superadmin", "admin", "contabile"]},
            {"key": "carta",        "label": "Carta di Credito", "roles": ["superadmin", "admin", "contabile"]},
            {"key": "contanti",     "label": "Contanti",         "roles": ["superadmin", "admin"]},
            {"key": "mance",        "label": "Mance",            "roles": ["superadmin", "admin", "contabile", "sala", "sommelier", "chef"]},
            {"key": "impostazioni", "label": "Impostazioni",     "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "controllo-gestione", "label": "Controllo di Gestione", "icon": "\U0001f3af",
        "description": "Panorama finanziario unificato \u2014 vendite, acquisti, banca, scadenze, margine",
        "roles": ["superadmin", "admin", "contabile"],
        "sub": [
            {"key": "dashboard",   "label": "Dashboard",   "roles": ["superadmin", "admin", "contabile"]},
            {"key": "uscite",      "label": "Scadenzario", "roles": ["superadmin", "admin", "contabile"]},
            {"key": "confronto",   "label": "Confronto",   "roles": ["superadmin", "admin", "contabile"]},
            {"key": "spese-fisse", "label": "Spese Fisse", "roles": ["superadmin", "admin", "contabile"]},
        ],
    },
    {
        "key": "statistiche", "label": "Statistiche", "icon": "\U0001f4c8",
        "description": "Analisi vendite iPratico, categorie, prodotti, trend",
        "roles": ["superadmin", "admin"],
        "sub": [
            {"key": "dashboard", "label": "Cucina",            "roles": ["superadmin", "admin"]},
            {"key": "coperti",   "label": "Coperti & Incassi", "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "dipendenti", "label": "Dipendenti", "icon": "\U0001f465",
        "description": "Personale, buste paga, turni, scadenze documenti, costi",
        "roles": ["superadmin", "admin", "sala", "sommelier", "chef", "contabile"],
        "sub": [
            {"key": "anagrafica",   "label": "Anagrafica",   "roles": ["superadmin", "admin"]},
            {"key": "buste-paga",   "label": "Buste Paga",   "roles": ["superadmin", "admin"]},
            {"key": "turni",        "label": "Turni",        "roles": ["superadmin", "admin", "sala", "sommelier", "chef", "contabile"]},
            {"key": "scadenze",     "label": "Scadenze",     "roles": ["superadmin", "admin"]},
            {"key": "costi",        "label": "Costi",        "roles": ["superadmin", "admin"]},
            {"key": "impostazioni", "label": "Impostazioni", "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "prenotazioni", "label": "Prenotazioni", "icon": "\U0001f4c5",
        "description": "Planning giornaliero, gestione prenotazioni, tavoli",
        "roles": ["superadmin", "admin", "sala", "sommelier"],
        "sub": [
            {"key": "planning",     "label": "Planning",      "roles": ["superadmin", "admin", "sala", "sommelier"]},
            {"key": "mappa",        "label": "Mappa Tavoli",  "roles": ["superadmin", "admin", "sala", "sommelier"]},
            {"key": "settimana",    "label": "Settimana",     "roles": ["superadmin", "admin", "sala", "sommelier"]},
            {"key": "tavoli",       "label": "Editor Tavoli", "roles": ["superadmin", "admin"]},
            {"key": "impostazioni", "label": "Impostazioni",  "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "clienti", "label": "Gestione Clienti", "icon": "\U0001f91d",
        "description": "Anagrafica clienti, CRM, tag, note, import TheFork",
        "roles": ["superadmin", "admin", "sala", "sommelier", "contabile"],
        "sub": [
            {"key": "lista",        "label": "Anagrafica",   "roles": ["superadmin", "admin", "sala", "sommelier", "contabile"]},
            {"key": "prenotazioni", "label": "Prenotazioni", "roles": ["superadmin", "admin", "sala", "sommelier", "contabile"]},
            {"key": "preventivi",   "label": "Preventivi",   "roles": ["superadmin", "admin", "sala", "sommelier", "contabile"]},
            {"key": "dashboard",    "label": "Dashboard",    "roles": ["superadmin", "admin", "sala", "sommelier", "contabile"]},
            {"key": "import",       "label": "Import",       "roles": ["superadmin", "admin"]},
            {"key": "impostazioni", "label": "Impostazioni", "roles": ["superadmin", "admin"]},
        ],
    },
    {
        "key": "impostazioni", "label": "Impostazioni", "icon": "\u2699\ufe0f",
        "description": "Utenti, ruoli, configurazione sistema",
        "roles": ["superadmin", "admin"],
    },
]


def _load() -> list:
    """
    Strategia di caricamento ruoli/permessi moduli:
    1. Se esiste modules.runtime.json → lo legge (stato effettivo, mai sovrascritto dal push)
    2. Altrimenti, copia il seed da modules.json (tracciato in git) e lo salva come runtime
    3. Se manca anche il seed → cade su DEFAULT_MODULES hardcoded
    In questo modo Marco puo' modificare i ruoli in produzione senza che un futuro
    `push.sh` sovrascriva le sue modifiche (era il bug B1 / problemi.md).
    """
    if MODULES_FILE.exists():
        with open(MODULES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    # Prima volta dopo il fix: bootstrap dal seed tracciato in git
    if MODULES_SEED_FILE.exists():
        try:
            with open(MODULES_SEED_FILE, "r", encoding="utf-8") as f:
                seed = json.load(f)
        except Exception:
            seed = DEFAULT_MODULES
    else:
        seed = DEFAULT_MODULES
    _save(seed)
    return seed


def _save(data: list) -> None:
    """Salva sempre su modules.runtime.json (file gitignored)."""
    MODULES_FILE.parent.mkdir(parents=True, exist_ok=True)
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


@router.post("/reset-to-seed")
def reset_modules_to_seed(current_user: dict = Depends(get_current_user)):
    """
    Forza il reset del runtime ai ruoli del seed (modules.json tracciato in git).
    Usalo quando il seed e' stato aggiornato in git e serve ri-applicare al volo
    senza cancellare il file manualmente sul VPS.
    Solo admin/superadmin.
    """
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")

    if MODULES_SEED_FILE.exists():
        try:
            with open(MODULES_SEED_FILE, "r", encoding="utf-8") as f:
                seed = json.load(f)
        except Exception:
            seed = DEFAULT_MODULES
    else:
        seed = DEFAULT_MODULES

    _save(seed)
    return {"ok": True, "source": "seed" if MODULES_SEED_FILE.exists() else "default", "modules": seed}


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
