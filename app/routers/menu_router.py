from fastapi import APIRouter, Query

router = APIRouter()

MENU_BY_ROLE = {
    "admin": ["Gestione Vini", "Gestione Ricette", "Gestione Acquisti", "Gestione Amministrativa"],
    "chef": ["Gestione Ricette", "Gestione Acquisti"],
    "sommelier": ["Gestione Vini"],
    "viewer": []
}

@router.get("/")
def get_menu(role: str = Query(..., description="Ruolo utente")):
    return {"menu": MENU_BY_ROLE.get(role, [])}
