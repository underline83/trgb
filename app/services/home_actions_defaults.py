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
    "admin":      ADMIN_ACTIONS_DEFAULTS,
    "superadmin": ADMIN_ACTIONS_DEFAULTS,
    "contabile":  ADMIN_ACTIONS_DEFAULTS,
    "sommelier":  ADMIN_ACTIONS_DEFAULTS,
    "chef":       ADMIN_ACTIONS_DEFAULTS,
    "sous_chef":  ADMIN_ACTIONS_DEFAULTS,
    "commis":     ADMIN_ACTIONS_DEFAULTS,
    "viewer":     ADMIN_ACTIONS_DEFAULTS,
    "sala":       SALA_ACTIONS_DEFAULTS,
}

VALID_ROLES = set(DEFAULTS_BY_ROLE.keys())
