# @version: v1.1 — chiuso ad admin (2026-09-01). CANDIDATO ALLA CANCELLAZIONE.
"""
Menu per ruolo — router LEGACY, di fatto codice morto.

STATO (audit permessi 2026-09-01, docs/audit_permessi_2026-09-01.md §2):
era montato in main.py SENZA alcuna autenticazione, quindi pubblico su
internet. Restituisce un dizionario hardcoded che non tocca il database.

Perche' e' morto:
- nessun chiamante nel frontend (la navigazione reale passa da
  `modules.json` + `useModuleAccess`, non da qui);
- i ruoli elencati sono obsoleti: mancano `contabile`, `sous_chef`, `commis`,
  e i nomi dei moduli non corrispondono piu' a quelli veri;
- i nomi dei moduli sono l'unica informazione esposta, quindi il danno era
  minimo — ma un endpoint pubblico che nessuno usa e' solo superficie di
  attacco in piu'.

Chiuso ad admin invece che cancellato: rimuovere un router e' una decisione
di Marco, non una scelta collaterale di un fix di sicurezza. Se confermato
inutile, si cancellano questo file e la riga `_mount("menu_router", ...)`
in main.py.
"""

from fastapi import APIRouter, Depends, Query

from app.services.permessi import solo_admin

router = APIRouter(dependencies=[Depends(solo_admin(cosa="il menu legacy per ruolo"))])

MENU_BY_ROLE = {
    "admin": ["Gestione Vini", "Gestione Ricette", "Gestione Acquisti", "Gestione Amministrativa"],
    "chef": ["Gestione Ricette", "Gestione Acquisti"],
    "sommelier": ["Gestione Vini"],
    "sala": ["Gestione Vini"],
    "viewer": []
}


@router.get("/", deprecated=True)
def get_menu(role: str = Query(..., description="Ruolo utente")):
    """DEPRECATO — usare `GET /settings/modules/` (modules_router)."""
    return {"menu": MENU_BY_ROLE.get(role, [])}
