from typing import List
from fastapi import APIRouter
from app.schemas.user_schema import LoginRequest, TokenResponse, UserTile
from app.services import auth_service

router = APIRouter()


@router.get("/tiles", response_model=List[UserTile], summary="Lista utenti per tile login (pubblico)")
def get_tiles():
    """Endpoint pubblico — restituisce username, display_name, role per le tile di login."""
    return auth_service.list_tiles()


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    return auth_service.authenticate_user(data.username, data.password)