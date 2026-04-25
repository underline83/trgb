"""
TRGB — Auth Service

Utenti persistiti in app/data/users.json.
Per cambiare password tramite CLI: python scripts/gen_passwords.py
"""

import json
import secrets
from pathlib import Path
from datetime import timedelta
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer

from app.core import security

# ---------------------------------------------------------------------------
# PERCORSO STORE UTENTI
# ---------------------------------------------------------------------------
USERS_FILE = Path(__file__).resolve().parent.parent / "data" / "users.json"

# ---------------------------------------------------------------------------
# CARICA / SALVA UTENTI
# ---------------------------------------------------------------------------
def _load_users() -> dict:
    """Legge users.json e restituisce un dict {username: {password_hash, role, display_name}}.
    Se il file non esiste, crea un utente admin con PIN random a 6 cifre stampato a console.
    Modifica sicurezza 2026-04-25 (sessione 57 cont.): no piu' PIN '0000' di default per evitare
    rischio admin con PIN noto se il file viene perso. Marco legge il PIN dal log e lo cambia subito."""
    if not USERS_FILE.exists():
        # PIN random a 6 cifre, generato con secrets (cryptographically strong)
        random_pin = f"{secrets.randbelow(1_000_000):06d}"
        default_hash = security.get_password_hash(random_pin)
        default_users = [
            {"username": "admin", "display_name": "Admin", "password_hash": default_hash, "role": "superadmin"}
        ]
        USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(default_users, f, indent=2, ensure_ascii=False)
        print("=" * 70)
        print("⚠️  users.json non trovato — creato utente admin di emergenza")
        print(f"⚠️  Username: admin")
        print(f"⚠️  PIN temporaneo: {random_pin}")
        print(f"⚠️  CAMBIALO SUBITO dopo il primo login (Cambio PIN)")
        print("=" * 70)
        data = default_users
    else:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    return {
        u["username"]: {
            "password_hash": u["password_hash"],
            "role": u["role"],
            "display_name": u.get("display_name", u["username"].capitalize()),
            "dipendente_id": u.get("dipendente_id"),
        }
        for u in data
    }


def _save_users(users: dict) -> None:
    """Serializza il dict utenti e lo scrive su users.json."""
    data = []
    for k, v in users.items():
        row = {
            "username": k,
            "display_name": v.get("display_name", k.capitalize()),
            "password_hash": v["password_hash"],
            "role": v["role"],
        }
        if v.get("dipendente_id") is not None:
            row["dipendente_id"] = v["dipendente_id"]
        data.append(row)
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# Caricamento iniziale al boot
USERS: dict = _load_users()

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

    from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
    access_token = security.create_access_token(
        {"sub": username, "role": user["role"]},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["role"],
        "display_name": user.get("display_name", username.capitalize()),
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
        "dipendente_id": USERS[username].get("dipendente_id"),
    }

# ---------------------------------------------------------------------------
# CRUD UTENTI (usato da users_router)
# ---------------------------------------------------------------------------
VALID_ROLES = {
    "superadmin", "admin", "contabile",
    "chef", "sous_chef", "commis",
    "sommelier", "sala", "viewer",
}


def is_admin(role: str) -> bool:
    """True per admin e superadmin — usare per tutti i check admin generici."""
    return role in ("admin", "superadmin")


def is_superadmin(role: str) -> bool:
    """True solo per superadmin — usare per funzioni riservate (es. preconti)."""
    return role == "superadmin"


def is_cucina_brigade(role: str) -> bool:
    """True per chef, sous_chef, commis — i 3 ruoli della brigata cucina."""
    return role in ("chef", "sous_chef", "commis")

def list_users() -> list:
    return [
        {
            "username": k,
            "role": v["role"],
            "display_name": v.get("display_name", k.capitalize()),
            "dipendente_id": v.get("dipendente_id"),
        }
        for k, v in USERS.items()
    ]


def set_dipendente(username: str, dipendente_id) -> None:
    """Collega (o scollega, se dipendente_id=None) l'utente a un dipendente.

    Se `dipendente_id` e' gia' assegnato ad un altro utente, quel collegamento
    viene rimosso (1:1 user <-> dipendente).
    """
    if username not in USERS:
        raise HTTPException(status_code=404, detail=f"Utente '{username}' non trovato")
    if dipendente_id is None:
        USERS[username].pop("dipendente_id", None)
        _save_users(USERS)
        return
    try:
        dip_id = int(dipendente_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="dipendente_id non valido")
    # Forza unicita': rimuovi il link da qualsiasi altro utente che lo avesse
    for other, info in USERS.items():
        if other != username and info.get("dipendente_id") == dip_id:
            info.pop("dipendente_id", None)
    USERS[username]["dipendente_id"] = dip_id
    _save_users(USERS)


def add_user(username: str, password: str, role: str) -> dict:
    if username in USERS:
        raise HTTPException(status_code=400, detail=f"Utente '{username}' già esistente")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Ruolo non valido. Validi: {VALID_ROLES}")
    hashed = security.get_password_hash(password)
    USERS[username] = {"password_hash": hashed, "role": role}
    _save_users(USERS)
    return {"username": username, "role": role}


def delete_user(username: str) -> None:
    if username not in USERS:
        raise HTTPException(status_code=404, detail=f"Utente '{username}' non trovato")
    admins = [u for u, v in USERS.items() if is_admin(v["role"])]
    if is_admin(USERS[username]["role"]) and len(admins) <= 1:
        raise HTTPException(status_code=400, detail="Impossibile eliminare l'ultimo amministratore")
    del USERS[username]
    _save_users(USERS)


def change_password(username: str, new_password: str, current_password: str = None) -> None:
    if username not in USERS:
        raise HTTPException(status_code=404, detail=f"Utente '{username}' non trovato")
    if current_password is not None:
        if not security.verify_password(current_password, USERS[username]["password_hash"]):
            raise HTTPException(status_code=400, detail="Password attuale non corretta")
    USERS[username]["password_hash"] = security.get_password_hash(new_password)
    _save_users(USERS)


def list_tiles() -> list:
    """Restituisce la lista utenti per le tile di login (senza hash)."""
    return [
        {
            "username": k,
            "display_name": v.get("display_name", k.capitalize()),
            "role": v["role"],
        }
        for k, v in USERS.items()
    ]


def change_role(username: str, new_role: str) -> None:
    if username not in USERS:
        raise HTTPException(status_code=404, detail=f"Utente '{username}' non trovato")
    if new_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Ruolo non valido. Validi: {VALID_ROLES}")
    admins = [u for u, v in USERS.items() if is_admin(v["role"])]
    if is_admin(USERS[username]["role"]) and not is_admin(new_role) and len(admins) <= 1:
        raise HTTPException(status_code=400, detail="Impossibile degradare l'ultimo amministratore")
    USERS[username]["role"] = new_role
    _save_users(USERS)
