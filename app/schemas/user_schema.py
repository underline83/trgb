from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    display_name: Optional[str] = None


class UserTile(BaseModel):
    username: str
    display_name: str
    role: str
