from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core import config

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")


# ------------------------------------------------------------
# PASSWORD HASHING (compatibile con mock users)
# ------------------------------------------------------------
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)


# ------------------------------------------------------------
# TOKEN — CREAZIONE
# ------------------------------------------------------------
def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)


# ------------------------------------------------------------
# TOKEN — DECODIFICA / VALIDAZIONE
# ------------------------------------------------------------
def decode_access_token(token: str):
    """
    Ritorna il payload del token JWT oppure solleva eccezione.
    Usato da get_current_user().
    """
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        return payload
    except JWTError as e:
        raise ValueError(f"Token non valido: {e}")