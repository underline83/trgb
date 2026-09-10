# -*- coding: utf-8 -*-
"""
Default seed per la tabella home_actions (mattone "Home per ruolo" — sessione 49).

Usato da:
- migrazione 090 (app/migrations/090_home_actions.py) — seed iniziale
- router home_actions_router.py — endpoint /reset/

Tenere qui la fonte di verità in modo che un eventuale cambio al default
si rifletta uniformemente su seed iniziale e reset UI.

Palette tailwind centralizzata in CLAUDE.md; qui usiamo le combinazioni gia'
in uso in Home.jsx / DashboardSala.jsx per restare a parita' visiva.
"""

from typing import List, Dict

# Ogni azione: key slug stabile, label, sub, emoji, route, color (classi Tailwind)
ADMIN_ACTIONS_DEFAULTS: List[Dict] = [
    {
        "key": "chiusura-turno", "label": "Chiusura Turno", "sub": "Fine servizio",
        "emoji": "💵", "route": "/vendite/fine-turno",
        "color": "bg-indigo-50 border-indigo-200 text-indigo-900",
    },
    {
        "key": "prenotazioni", "label": "Prenotazioni", "sub": "Planning completo",
        "emoji": "📅", "route": "/prenotazioni",
        "color": "bg-indigo-50 border-indigo-200 text-indigo-900",
    },
    {
        "key": "cantina-vini", "label": "Cantina Vini", "sub": "Magazzino",
        "emoji": "🍷", "route": "/vini/magazzino",
        "color": "bg-amber-50 border-amber-200 text-amber-900",
    },
    {
        "key": "food-cost", "label": "Food Cost", "sub": "Ricette e costi",
        "emoji": "📘", "route": "/ricette/archivio",
        "color": "bg-orange-50 border-orange-200 text-orange-900",
    },
    {
        "key": "controllo-gestione", "label": "Controllo Gestione", "sub": "Dashboard P&L",
        "emoji": "📊", "route": "/controllo-gestione/dashboard",
        "color": "bg-emerald-50 border-emerald-200 text-emerald-900",
    },
]

# Tasto Cantina mobile (mig 175, 2026-09-10): solo ai ruoli che la route
# /vini/cantina-mobile la aprono davvero (vini/magazzino in modules.json).
CANTINA_MOBILE_ACTION: Dict = {
    "key": "cantina-mobile", "label": "Cantina mobile", "sub": "Trova e muovi bottiglie",
    "emoji": "📱", "route": "/vini/cantina-mobile",
    "color": "bg-amber-50 border-amber-200 text-amber-900",
}


def _dopo(lista: List[Dict], key: str, azione: Dict) -> List[Dict]:
    """Copia di `lista` con `azione` inserita subito dopo `key` (in coda se manca)."""
    keys = [a["key"] for a in lista]
    i = keys.index(key) + 1 if key in keys else len(lista)
    return lista[:i] + [azione] + lista[i:]


# admin / superadmin / sommelier: come admin + Cantina mobile dopo Cantina Vini
VINI_ACTIONS_DEFAULTS: List[Dict] = _dopo(ADMIN_ACTIONS_DEFAULTS, "cantina-vini", CANTINA_MOBILE_ACTION)

SALA_ACTIONS_DEFAULTS: List[Dict] = [
    {
        "key": "chiusura-turno", "label": "Chiusura Turno", "sub": "Fine servizio",
        "emoji": "💵", "route": "/vendite/fine-turno",
        "color": "bg-indigo-50 border-indigo-200 text-indigo-900",
    },
    {
        "key": "prenotazioni", "label": "Prenotazioni", "sub": "Planning completo",
        "emoji": "📅", "route": "/prenotazioni",
        "color": "bg-indigo-50 border-indigo-200 text-indigo-900",
    },
    {
        "key": "carta-vini", "label": "Carta dei Vini", "sub": "Cerca vini",
        "emoji": "🍷", "route": "/vini/carta",
        "color": "bg-amber-50 border-amber-200 text-amber-900",
    },
    CANTINA_MOBILE_ACTION,
    {
        "key": "mance", "label": "Mance", "sub": "Registra mance",
        "emoji": "💰", "route": "/flussi-cassa/mance",
        "color": "bg-emerald-50 border-emerald-200 text-emerald-900",
    },
]

# Mappa ruolo → lista default.
# Superadmin eredita admin a DB-level (seed replicato), così si puo' differenziare
# dalla UI se un giorno serve.
DEFAULTS_BY_ROLE: Dict[str, List[Dict]] = {
    "admin":      VINI_ACTIONS_DEFAULTS,
    "superadmin": VINI_ACTIONS_DEFAULTS,
    "contabile":  ADMIN_ACTIONS_DEFAULTS,
    "sommelier":  VINI_ACTIONS_DEFAULTS,
    "chef":       ADMIN_ACTIONS_DEFAULTS,
    "sous_chef":  ADMIN_ACTIONS_DEFAULTS,
    "commis":     ADMIN_ACTIONS_DEFAULTS,
    "viewer":     ADMIN_ACTIONS_DEFAULTS,
    "sala":       SALA_ACTIONS_DEFAULTS,
}

VALID_ROLES = set(DEFAULTS_BY_ROLE.keys())
