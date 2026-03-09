"""
TRGB — Auth Service

Password verificate con sha256_crypt via passlib.
Per cambiare/aggiungere password: python scripts/gen_passwords.py
"""

from datetime import timedelta
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer

from app.core import security
from app.core import config

# ---------------------------------------------------------------------------
# UTENTI — password hashes sha256_crypt
# Generati con: python scripts/gen_passwords.py
# Per cambiare password: rigenera hash e aggiorna il campo password_hash.
# ---------------------------------------------------------------------------
USERS = {
    "admin": {
        "password_hash": "$5$X/.O19euidOegoW9$8F.ApBdUZy67588LyekZAL5.cVYMHGiPZoSDaSk0RA3",
        "role": "admin",
    },
    "chef": {
        "password_hash": "$5$V5KShl1s1aLo9nFv$Lv1v0PFx76dn2SynC/1UVrEjPyJhyvyVUlqHy60.s05",
        "role": "chef",
    },
    "sommelier": {
        "password_hash": "$5$uMpiNxRx83Zuwrr.$rvlIuFBC41O5k0x8Zn0t.bR5JIlvbmvvEjwt7s87510",
        "role": "sommelier",
    },
    "viewer": {
        "password_hash": "$5$3HJCr/2adr.CcHHS$HARAdFBkrVmUSQ9OZ6bO2ewbrkImK5PKanJIM3tZw/8",
        "role": "viewer",
    },
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

    if not user or not security.verify_password(password, user["password_hash"]):
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
        return security.decode_access_token(token)
    except ValueError:
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
