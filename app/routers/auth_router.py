from fastapi import APIRouter
from app.schemas.user_schema import LoginRequest, TokenResponse
from app.services import auth_service

router = APIRouter()

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    return auth_service.authenticate_user(data.username, data.password)
