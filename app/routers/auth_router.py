# Modulo: platform (auth) — [core] · v1.1 2026-11-06: «Vedi come» del superadmin (/auth/vedi-come/*)
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import timedelta
from fastapi import APIRouter, Depends
from app.schemas.user_schema import LoginRequest, TokenResponse, UserTile, VerificaPinRequest, AccessoQRequest
from app.services import auth_service, vedi_come
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
    if current_user.get("vedi_come"):
        # «Vedi come»: il rinnovo non allunga la durata decisa all'inizio
        out = vedi_come.token_come(current_user["vero_username"], current_user.get("come_username"),
                                   role, current_user.get("come_id"), int(current_user["come_fino"]))
        return {**out, "role": role}
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
    # In «Vedi come» il PIN di sezione è quello del superadmin vero, mai quello della persona
    auth_service.verifica_pin(current_user.get("vero_username") or current_user["username"], data.pin)
    return {"ok": True}


# ---------------------------------------------------------------------------
# «VEDI COME» — solo superadmin (logica in app/services/vedi_come.py)
# ---------------------------------------------------------------------------
class VediComeInizio(BaseModel):
    username: Optional[str] = None   # una persona (ruolo + dipendente suoi)
    ruolo: Optional[str] = None      # oppure un ruolo «vuoto», senza dipendente


class VediComeFine(BaseModel):
    id: int
    scaduto: bool = False


class VediComeMinuti(BaseModel):
    minuti: int = Field(..., ge=1, le=vedi_come.MINUTI_MAX)


@router.post("/vedi-come/inizia", summary="Superadmin: inizia a vedere TRGB come una persona o un ruolo")
def vedi_come_inizia(data: VediComeInizio, current_user: dict = Depends(auth_service.get_current_user)):
    return vedi_come.inizia(current_user, (data.username or "").strip() or None, (data.ruolo or "").strip() or None)


@router.post("/vedi-come/fine", summary="Superadmin (pass vero): chiude «Vedi come» e lo scrive nel registro")
def vedi_come_fine(data: VediComeFine, current_user: dict = Depends(auth_service.get_current_user)):
    return vedi_come.fine(current_user, data.id, data.scaduto)


@router.get("/vedi-come/impostazioni", summary="Superadmin: durata di «Vedi come» e registro")
def vedi_come_impostazioni(current_user: dict = Depends(auth_service.get_current_user)):
    vedi_come._verifica_superadmin_vero(current_user)
    return {"minuti": vedi_come.minuti(), "registro": vedi_come.registro()}


@router.put("/vedi-come/impostazioni", summary="Superadmin: cambia la durata di «Vedi come»")
def vedi_come_imposta(data: VediComeMinuti, current_user: dict = Depends(auth_service.get_current_user)):
    vedi_come._verifica_superadmin_vero(current_user)
    return {"minuti": vedi_come.imposta_minuti(data.minuti)}


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
