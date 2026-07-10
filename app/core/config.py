import os
from datetime import timedelta

# Chiave di firma JWT. In produzione DEVE arrivare dall'ambiente (.env del locale
# o systemd Environment=). Il default sotto serve solo allo sviluppo locale.
_SECRET_KEY_DEFAULT = "trgb_secret_key_2025"
SECRET_KEY = os.getenv("SECRET_KEY", _SECRET_KEY_DEFAULT)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 ore


def _is_production() -> bool:
    """Vero se giriamo su un VPS di produzione.

    Stessa euristica di app/utils/uploads.py:_detect_environment()
    (env TRGB_ENV=prod|production oppure presenza del repo deploy /home/marco/trgb),
    tenuta inline per non introdurre un import dal layer config.
    """
    if os.environ.get("TRGB_ENV", "").lower() in ("prod", "production"):
        return True
    return os.path.isdir("/home/marco/trgb")


# A9-02 (audit 2026-06-12): fail-loud. In produzione, se SECRET_KEY non è settata
# nell'ambiente, ci si rifiuta di firmare JWT con la chiave di default pubblica
# (presente nel repo, anche su GitHub): chiunque la conosca potrebbe forgiare un
# token superadmin. Meglio non far partire il backend che partire insicuri.
# In sviluppo (Mac di Marco / sandbox) il default resta comodo e non blocca nulla.
if SECRET_KEY == _SECRET_KEY_DEFAULT and _is_production():
    raise RuntimeError(
        "SECRET_KEY non impostata in produzione: mi rifiuto di firmare i JWT con "
        "la chiave di default pubblica del repo. Impostare SECRET_KEY nell'ambiente "
        "del backend (es. .env del locale o Environment= nella systemd unit) e "
        "riavviare. Vedi docs/installazione_nuovo_server.md §5.1."
    )
