"""
TRGB — Users Router

Endpoint per la gestione utenti (solo admin, tranne cambio password proprio).
Montato su /auth/users da main.py.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import (
    get_current_user,
    list_users,
    add_user,
    delete_user,
    change_password,
    change_role,
    set_dipendente,
    is_admin,
)

router = APIRouter(prefix="/auth/users", tags=["users"])


# ---------------------------------------------------------------------------
# SCHEMI
# ---------------------------------------------------------------------------
class NewUserRequest(BaseModel):
    username: str
    password: str
    role: str


class ChangePasswordRequest(BaseModel):
    new_password: str
    current_password: str | None = None  # richiesto solo per utenti non-admin


class ChangeRoleRequest(BaseModel):
    new_role: str


class SetDipendenteRequest(BaseModel):
    dipendente_id: int | None = None  # None => scollega


# ---------------------------------------------------------------------------
# GET /auth/users — lista utenti (admin only)
# ---------------------------------------------------------------------------
@router.get("/")
def get_users(current_user: dict = Depends(get_current_user)):
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")
    return list_users()


# ---------------------------------------------------------------------------
# POST /auth/users — crea utente (admin only)
# ---------------------------------------------------------------------------
@router.post("/", status_code=201)
def create_user(data: NewUserRequest, current_user: dict = Depends(get_current_user)):
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")
    return add_user(data.username, data.password, data.role)


# ---------------------------------------------------------------------------
# DELETE /auth/users/{username} — elimina utente (admin only)
# ---------------------------------------------------------------------------
@router.delete("/{username}", status_code=204)
def remove_user(username: str, current_user: dict = Depends(get_current_user)):
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")
    if username == current_user["username"]:
        raise HTTPException(status_code=400, detail="Non puoi eliminare te stesso")
    delete_user(username)


# ---------------------------------------------------------------------------
# PUT /auth/users/{username}/password — cambia password
#   - Admin: può cambiare la password di chiunque senza current_password
#   - Non-admin: può cambiare solo la propria, deve fornire current_password
# ---------------------------------------------------------------------------
@router.put("/{username}/password")
def update_password(username: str, data: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    is_admin_user = is_admin(current_user["role"])
    is_self = current_user["username"] == username

    if not is_admin_user and not is_self:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Puoi cambiare solo la tua password")

    if not is_admin_user and not is_self:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso negato")

    # Non-admin deve fornire la password corrente
    current_pw = None if is_admin else data.current_password
    if not is_admin and not current_pw:
        raise HTTPException(status_code=400, detail="Fornisci la password attuale")

    change_password(username, data.new_password, current_pw)
    return {"message": "Password aggiornata"}


# ---------------------------------------------------------------------------
# PUT /auth/users/{username}/role — cambia ruolo (admin only)
# ---------------------------------------------------------------------------
@router.put("/{username}/role")
def update_role(username: str, data: ChangeRoleRequest, current_user: dict = Depends(get_current_user)):
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")
    change_role(username, data.new_role)
    return {"message": "Ruolo aggiornato"}


# ---------------------------------------------------------------------------
# PUT /auth/users/{username}/dipendente — collega/scollega utente a dipendente (admin only)
#   Body: { "dipendente_id": int | null }
#   Usato da DipendentiAnagrafica (campo "Utente collegato") per abilitare
#   la vista self-service "/miei-turni" al dipendente.
# ---------------------------------------------------------------------------
@router.put("/{username}/dipendente")
def update_dipendente(username: str, data: SetDipendenteRequest, current_user: dict = Depends(get_current_user)):
    if not is_admin(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato agli amministratori")
    set_dipendente(username, data.dipendente_id)
    return {"message": "Collegamento aggiornato", "username": username, "dipendente_id": data.dipendente_id}
