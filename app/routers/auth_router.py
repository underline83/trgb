from typing import List
from datetime import timedelta
from fastapi import APIRouter, Depends
from app.schemas.user_schema import LoginRequest, TokenResponse, UserTile, VerificaPinRequest, AccessoQRequest
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
    if username == auth_service.Q_USERNAME:
        # Q nel browser: il rinnovo non allunga la sessione oltre q_fino
        return auth_service.token_q(current_user.get("q_fino"))
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


@router.post("/verifica-pin", summary="Ricontrolla il PIN dell'utente loggato (blocco di sezione)")
def verifica_pin(data: VerificaPinRequest, current_user: dict = Depends(auth_service.get_current_user)):
    """Usato dal blocco PIN di sezione (SezionePinGate): chi entra in Dipendenti
    deve ridigitare il PIN dell'utente con cui il dispositivo e' loggato.
    Qualsiasi ruolo autenticato: verifica solo il PROPRIO PIN.
    200 {ok: true} · 403 PIN errato · 429 troppi tentativi (stesso blocco del login)."""
    if current_user["username"] == auth_service.Q_USERNAME:
        return {"ok": True}  # Q non ha PIN: il blocco di sezione serve all'iPad lasciato loggato
    auth_service.verifica_pin(current_user["username"], data.pin)
    return {"ok": True}


@router.post("/accesso-q", response_model=TokenResponse, summary="Q nel browser: scambia il link usa-e-getta con una sessione")
def accesso_q(data: AccessoQRequest):
    """Pubblico: il segreto vale da solo (256 bit, due minuti, una volta). Lo crea lo
    strumento `accesso_browser` del connettore MCP. Sessione dell'identità «Q»,
    superadmin, senza PIN. Doc: docs/connettore_mcp.md."""
    from fastapi import HTTPException
    from app.connettore import oauth
    if not oauth.usa_accesso_q(data.token):
        raise HTTPException(status_code=401, detail="Link scaduto o già usato")
    return auth_service.token_q()
