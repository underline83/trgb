"""
TRGB — Auth Service (MOCK / DEBUG ONLY)

ATTENZIONE:
- Questo modulo NON usa un database.
- Autenticazione basata su utenti hardcoded.
- Password in chiaro, solo per sviluppo.
"""

from datetime import timedelta
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core import security
from app.core import config

# ---------------------------------------------------------------------------
# MOCK USERS (solo per debug)
# ---------------------------------------------------------------------------
USERS = {
    "admin": {"password": "admin", "role": "admin"},
    "chef": {"password": "chef", "role": "chef"},
    "sommelier": {"password": "vino", "role": "sommelier"},
    "viewer": {"password": "view", "role": "viewer"},
}

# ---------------------------------------------------------------------------
# OAuth2 schema (BEARER TOKEN)
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ---------------------------------------------------------------------------
# LOGIN
# ---------------------------------------------------------------------------
def authenticate_user(username: str, password: str):
    user = USERS.get(username)

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

# ---------------------------------------------------------------------------
# DECODE TOKEN
# ---------------------------------------------------------------------------
def decode_access_token(token: str):
    try:
        payload = jwt.decode(
            token,
            config.SECRET_KEY,
            algorithms=[config.ALGORITHM],
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token non valido",
        )

# ---------------------------------------------------------------------------
# UTENTE CORRENTE
# ---------------------------------------------------------------------------
def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_access_token(token)

    username: str = payload.get("sub")
    role: str = payload.get("role")

    if not username or username not in USERS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utente non valido",
        )

    return {
        "username": username,
        "role": role,
    }