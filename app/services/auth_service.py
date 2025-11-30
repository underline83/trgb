from datetime import timedelta
from fastapi import HTTPException, status
from app.core import security

# 🔴 DEBUG: password in chiaro per sbloccare login
USERS = {
    "admin": {"password": "admin", "role": "admin"},
    "chef": {"password": "chef", "role": "chef"},
    "sommelier": {"password": "vino", "role": "sommelier"},
    "viewer": {"password": "view", "role": "viewer"},
}

def authenticate_user(username: str, password: str):
    user = USERS.get(username)
    # confronto diretto, SENZA hash (solo per debug)
    if not user or password != user["password"]:
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