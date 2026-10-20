"""
TRGB — Auth Service

Utenti persistiti in users.json — path tenant-aware:
locali/<TRGB_LOCALE>/data/users.json (path canonico, post R6.5 push 3 — niente
più fallback ad app/data/, vedi docs/problemi.md S60-INC1).
Per cambiare password tramite CLI: python scripts/gen_passwords.py
"""

import json
import secrets
from datetime import timedelta
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer

from app.core import security
from app.utils.locale_data import locale_data_path

# ---------------------------------------------------------------------------
# PERCORSO STORE UTENTI
# ---------------------------------------------------------------------------
# R6.5 — path tenant-aware. users.json e' un dato di locale (utenti del
# ristorante), va sotto locali/<TRGB_LOCALE>/data/.
USERS_FILE = locale_data_path("users.json")

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
            # Lunghezza del PIN (non il PIN): serve al tastierino di login per sapere
            # quante cifre mostrare. Assente per utenti vecchi -> si impara al 1o login.
            "pin_len": u.get("pin_len"),
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
        if v.get("pin_len"):
            row["pin_len"] = v["pin_len"]
        data.append(row)
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# Caricamento iniziale al boot
USERS: dict = _load_users()


# ---------------------------------------------------------------------------
# LOCKOUT BRUTE-FORCE + POLITICA PIN (audit 2026-06-12 A1-04)
# ---------------------------------------------------------------------------
import time as _time

# Soglie configurabili in locali/<locale>/data/auth_settings.json (default sotto).
# UI in Impostazioni prevista in una fase successiva (per ora file/endpoint).
AUTH_SETTINGS_FILE = locale_data_path("auth_settings.json")
_LOCKOUT_DEFAULTS = {
    "max_tentativi": 5,      # tentativi falliti consecutivi prima del blocco
    "blocco_base_sec": 30,   # durata del 1o blocco
    "blocco_max_sec": 900,   # tetto 15 min: la durata raddoppia a ogni fail oltre soglia
}

def _load_lockout_settings() -> dict:
    cfg = dict(_LOCKOUT_DEFAULTS)
    try:
        if AUTH_SETTINGS_FILE.exists():
            with open(AUTH_SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for k in _LOCKOUT_DEFAULTS:
                if isinstance(data.get(k), int) and data[k] > 0:
                    cfg[k] = data[k]
        else:
            AUTH_SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(AUTH_SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(_LOCKOUT_DEFAULTS, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
    return cfg

LOCKOUT_CFG = _load_lockout_settings()

# Stato in memoria (per-processo): {username: {"fails": int, "locked_until": float}}
_login_attempts: dict = {}

def _lockout_remaining(username: str) -> int:
    """Secondi di blocco residui per l'utente (0 se non bloccato)."""
    rec = _login_attempts.get(username)
    if not rec:
        return 0
    remaining = rec.get("locked_until", 0) - _time.time()
    return int(remaining) + 1 if remaining > 0 else 0

def _register_login_fail(username: str) -> None:
    rec = _login_attempts.setdefault(username, {"fails": 0, "locked_until": 0.0})
    rec["fails"] += 1
    if rec["fails"] >= LOCKOUT_CFG["max_tentativi"]:
        over = rec["fails"] - LOCKOUT_CFG["max_tentativi"]  # 0 al primo blocco
        durata = min(LOCKOUT_CFG["blocco_base_sec"] * (2 ** over),
                     LOCKOUT_CFG["blocco_max_sec"])
        rec["locked_until"] = _time.time() + durata

def _register_login_success(username: str) -> None:
    _login_attempts.pop(username, None)

# Politica PIN: i ruoli che vedono soldi/PII devono avere un PIN piu' lungo.
STRONG_PIN_ROLES = {"superadmin", "admin", "contabile"}
MIN_PIN_STRONG = 6

def _validate_pin_policy(password: str, role: str) -> None:
    if role in STRONG_PIN_ROLES and len(password or "") < MIN_PIN_STRONG:
        raise HTTPException(
            status_code=400,
            detail=(f"I ruoli amministrativi (admin/contabile) richiedono un PIN "
                    f"di almeno {MIN_PIN_STRONG} cifre."),
        )

# ---------------------------------------------------------------------------
# OAuth2 schema (BEARER TOKEN)
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ---------------------------------------------------------------------------
# LOGIN
# ---------------------------------------------------------------------------
def authenticate_user(username: str, password: str):
    # A1-04: blocco brute-force per-utente (in memoria, per-processo).
    remaining = _lockout_remaining(username)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Troppi tentativi falliti. Riprova tra {remaining} secondi.",
            headers={"Retry-After": str(remaining)},
        )

    user = USERS.get(username)

    if not user or not security.verify_password(password, user["password_hash"]):
        # Traccio i fallimenti solo per utenti reali: gli username sono gia'
        # pubblici via /auth/tiles, quindi nessun leak, ma il dict resta limitato.
        if user:
            _register_login_fail(username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenziali non valide",
        )

    _register_login_success(username)

    # Memorizza la lunghezza del PIN se non la conosciamo ancora (utenti creati
    # prima del 2026-10-19) o se e' cambiata: il tastierino la usa al prossimo login.
    if user.get("pin_len") != len(password):
        user["pin_len"] = len(password)
        _save_users(USERS)

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
# RI-VERIFICA PIN (blocco PIN di sezione, 2026-10-18)
# ---------------------------------------------------------------------------
def verifica_pin(username: str, pin: str) -> None:
    """Ricontrolla il PIN dell'utente GIA' loggato (es. per entrare in Dipendenti
    da un iPad lasciato aperto). Stessi contatori di blocco del login: chi prova
    PIN a caso qui finisce bloccato anche al login.

    PIN errato -> 403 (NON 401: il frontend su 401 butta fuori l'utente).
    """
    remaining = _lockout_remaining(username)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Troppi tentativi falliti. Riprova tra {remaining} secondi.",
            headers={"Retry-After": str(remaining)},
        )
    user = USERS.get(username)
    if not user or not security.verify_password(pin or "", user["password_hash"]):
        if user:
            _register_login_fail(username)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="PIN errato")
    _register_login_success(username)


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
# Q nel browser (2026-10-20): l'identità «Q», superadmin, NON è in users.json (non ha
# tile né PIN). Entra solo col link usa-e-getta del connettore (app/connettore/oauth.py
# crea_accesso_q / usa_accesso_q) e porta nel token q=True e q_fino (fine sessione:
# i rinnovi non la allungano). Senza TRGB_CHIAVE_Q nel .env i suoi token non valgono.
Q_USERNAME = "Q"


def _q_configurato() -> bool:
    from app.connettore.oauth import chiave_q  # import tardivo: oauth importa questo modulo
    return bool(chiave_q())


def token_q(fino: float | None = None) -> dict:
    """Una sessione di Q nel browser (stessa forma di authenticate_user). `fino` = fine
    della sessione in epoch: alla prima emissione adesso + ACCESS_TOKEN_EXPIRE_MINUTES."""
    from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
    ora = _time.time()
    if fino is None:
        fino = ora + ACCESS_TOKEN_EXPIRE_MINUTES * 60
    resta = fino - ora
    if resta <= 0:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessione di Q finita")
    access_token = security.create_access_token(
        {"sub": Q_USERNAME, "role": "superadmin", "q": True, "q_fino": int(fino)},
        timedelta(seconds=resta),
    )
    return {"access_token": access_token, "token_type": "bearer",
            "role": "superadmin", "display_name": Q_USERNAME}


def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_access_token(token)

    username: str = payload.get("sub")
    role: str = payload.get("role")

    if username == Q_USERNAME and payload.get("q") is True:
        if not _q_configurato():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utente non valido")
        return {"username": Q_USERNAME, "role": "superadmin", "dipendente_id": None,
                "q_fino": payload.get("q_fino")}

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


def is_vini_manager(role: str) -> bool:
    """True per admin, superadmin, sommelier — i ruoli abilitati a GESTIRE il
    catalogo vini (anagrafiche produttori/fornitori/denominazioni/vitigni/madre
    + scheda bottiglia). Gli altri ruoli (sala, viewer, cucina...) hanno sola
    lettura sul modulo Vini. Le operazioni distruttive di massa (merge, migrate,
    sync) restano comunque riservate ai soli admin via is_admin()."""
    return role in ("admin", "superadmin", "sommelier")


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
    if username.strip().upper() == Q_USERNAME:
        raise HTTPException(status_code=400, detail="«Q» è riservato (l'identità di Q, la memoria di Marco)")
    if username in USERS:
        raise HTTPException(status_code=400, detail=f"Utente '{username}' già esistente")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Ruolo non valido. Validi: {VALID_ROLES}")
    _validate_pin_policy(password, role)  # A1-04: PIN >= 6 per admin/contabile
    hashed = security.get_password_hash(password)
    USERS[username] = {"password_hash": hashed, "role": role, "pin_len": len(password)}
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
    _validate_pin_policy(new_password, USERS[username]["role"])  # A1-04
    USERS[username]["password_hash"] = security.get_password_hash(new_password)
    USERS[username]["pin_len"] = len(new_password)
    _save_users(USERS)


def list_tiles() -> list:
    """Restituisce la lista utenti per le tile di login (senza hash)."""
    return [
        {
            "username": k,
            "display_name": v.get("display_name", k.capitalize()),
            "role": v["role"],
            "pin_len": v.get("pin_len"),
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
