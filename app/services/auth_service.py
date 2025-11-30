from datetime import timedelta
from fastapi import HTTPException, status
from app.core import security

USERS = {
    "marco": {
        "password": security.get_password_hash("marco123"),
        "role": "admin",
    },
    "viewer": {
        "password": security.get_password_hash("view"),
        "role": "viewer",
    },
}

def authenticate_user(username: str, password: str):
    user = USERS.get(username)
    if not user or not security.verify_password(password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenziali non valide",
        )
    access_token = security.create_access_token(
        {"sub": username, "role": user["role"]},
        timedelta(minutes=60),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["role"],
    }