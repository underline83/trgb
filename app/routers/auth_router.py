from typing import List
from datetime import timedelta
from fastapi import APIRouter, Depends
from app.schemas.user_schema import LoginRequest, TokenResponse, UserTile
from app.services import auth_service
from app.core import security, config

router = APIRouter()


@router.get("/tiles", response_model=List[UserTile], summary="Lista utenti per tile login (pubblico)")
def get_tiles():
    """Endpoint pubblico — restituisce username, display_name, role per le tile di login."""
    return auth_service.list_tiles()


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    return auth_service.authenticate_user(data.username, data.password)


@router.post("/refresh", response_model=TokenResponse, summary="Rinnova il token JWT")
def refresh_token(current_user: dict = Depends(auth_service.get_current_user)):
    """
    Riceve un token valido e ne emette uno nuovo con scadenza rinnovata.
    Il frontend chiama questo endpoint periodicamente per evitare la scaduta sessione.
    """
    username = current_user["username"]
    role = current_user["role"]
    user = auth_service.USERS.get(username, {})

    new_token = security.create_access_token(
        {"sub": username, "role": role},
        timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": new_token,
        "token_type": "bearer",
        "role": role,
        "display_name": user.get("display_name", username.capitalize()),
    }