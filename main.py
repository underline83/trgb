#!/usr/bin/env python3
from pathlib import Path

# Carica variabili d'ambiente da .env (se presente — ignorato da git)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv non installato — le env var vengono dal sistema

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# MODULO MIGRAZIONI
from app.migrations.migration_runner import run_migrations

# ROUTER ESISTENTI
from app.routers import auth_router
from app.routers.users_router import router as users_router
from app.routers.modules_router import router as modules_router
from app.routers import menu_router
from app.routers import vini_router
from app.routers import vini_settings_router
from app.routers import vini_magazzino_router
from app.routers import vini_cantina_tools_router
from app.routers import vini_anagrafiche_router  # V.6+V.7+V.8 Fase 2
from app.routers import foodcost_router
from app.routers import foodcost_ingredients_router
from app.routers import foodcost_recipes_router
from app.routers import foodcost_matching_router
from app.routers import menu_carta_router
from app.routers import pranzo_router

# AMMINISTRAZIONE (corrispettivi & analisi) — modulo unico
from app.routers.admin_finance import router as admin_finance_router
from app.routers.chiusure_turno import router as chiusure_turno_router

# FATTURAZIONE ELETTRONICA (XML)
from app.routers import fe_import
from app.routers import fe_categorie_router
from app.routers import fe_proforme_router

# DIPENDENTI & TURNI — nuovo modulo
from app.routers.dipendenti import router as dipendenti_router
from app.routers.reparti import router as reparti_router
from app.routers.turni_router import router as turni_router

# BANCA — movimenti bancari
from app.routers import banca_router

# CONTROLLO DI GESTIONE — dashboard unificata cross-modulo
from app.routers import controllo_gestione_router

# STATISTICHE — import iPratico e analytics vendite
from app.routers import statistiche_router

# BACKUP — download database
from app.routers import backup_router

# PRICING — calcolo automatico PREZZO_CARTA
from app.routers import vini_pricing_router

# IPRATICO PRODUCTS — sync prodotti iPratico ↔ vini TRGB
from app.routers import ipratico_products_router

# CLIENTI CRM
from app.routers.clienti_router import router as clienti_router

# PRENOTAZIONI
from app.routers.prenotazioni_router import router as prenotazioni_router

# PREVENTIVI — modulo 10 (gestione preventivi eventi)
from app.routers.preventivi_router import router as preventivi_router
from app.routers.menu_templates_router import (
    router as menu_templates_router,
    preventivi_bridge_router as menu_templates_preventivi_bridge_router,
)

# DASHBOARD HOME — widget aggregatore Home v3
from app.routers.dashboard_router import router as dashboard_router

# NOTIFICHE & COMUNICAZIONI — mattone M.A infrastruttura trasversale
from app.routers.notifiche_router import router as notifiche_router
from app.routers.notifiche_router import com_router as comunicazioni_router

# ALERT ENGINE — mattone M.F controllo soglie/scadenze
from app.routers.alerts_router import router as alerts_router

# HOME PER RUOLO — config pulsanti rapidi Home per ogni ruolo (sessione 49)
from app.routers.home_actions_router import router as home_actions_router

# SCELTA DEL MACELLAIO — tagli carne disponibili alla vendita
from app.routers.scelta_macellaio_router import router as scelta_macellaio_router

# SCELTA DEI SALUMI — salumi disponibili alla vendita (sessione 50)
from app.routers.scelta_salumi_router import router as scelta_salumi_router

# SCELTA DEI FORMAGGI — formaggi disponibili alla vendita (sessione 50)
from app.routers.scelta_formaggi_router import router as scelta_formaggi_router

# SCELTA DEL PESCATO — pesce/crostacei/molluschi (sessione 50, refactor "Selezioni del Giorno")
from app.routers.scelta_pescato_router import router as scelta_pescato_router

# PIATTI DEL GIORNO — 5a zona di "Selezioni del Giorno" (mig 107)
from app.routers.piatti_giorno_router import router as piatti_giorno_router

# FATTURE IN CLOUD — integrazione API v2
from app.routers import fattureincloud_router

# TASK MANAGER — checklist ricorrenti + task singoli (ex-Cucina, rinominato Phase B sessione 46)
from app.routers.tasks_router import router as tasks_router

# HACCP — reportistica mensile (Modulo I sessione 59 cont., 2026-04-27)
from app.routers.haccp_router import router as haccp_router

# LISTA SPESA CUCINA — Fase 1 MVP (Modulo J sessione 59 cont. c, 2026-04-27)
from app.routers.lista_spesa_router import router as lista_spesa_router

# CARTA BEVANDE — sub-modulo del modulo Vini (Aperitivi, Birre, Distillati, Tisane, Tè, Amari)
from app.routers.bevande_router import router as bevande_router

# R8b — module loader: feature flags per locale.
# Legge locali/<TRGB_LOCALE>/moduli_attivi.json + core/moduli/<id>/module.json
# per decidere quali router montare. Default backward-compat: tutti attivi.
from app.platform import module_loader


# ──────────────────────────────────────────────────────────────
# TRGB_LOCALE — identificativo del locale (R1, sessione 60, 2026-04-28)
# Default "tregobbi" per l'osteria di Marco. Override via env var TRGB_LOCALE.
# Vedi docs/refactor_monorepo.md §3 R1 e locali/README.md.
# ──────────────────────────────────────────────────────────────
import os
TRGB_LOCALE = os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"
print(f"🏠 TRGB_LOCALE: {TRGB_LOCALE}")


# ──────────────────────────────────────────────────────────────
# GIT_COMMIT — hash del commit corrente (sessione 60 + R4 follow-up + 0.1.1 fix)
# Letto UNA volta al boot e cached per esporre via /system/info
# "quale codice gira ora?" senza bisogno di SSH al VPS.
#
# Lookup order (post issue 0.1.1, 5 mag 2026):
#   1. DEPLOYED_COMMIT.txt — scritto dal post-receive hook al deploy.
#      Path canonico, sempre aggiornato dal hook nuovo.
#   2. git rev-parse HEAD (fallback) — per dev locale o se DEPLOYED_COMMIT.txt
#      manca. ATTENZIONE: in produzione sul VPS questo torna stantio se il
#      vecchio post-receive (`git --git-dir=BARE --work-tree=WD checkout -f`)
#      è ancora in uso, perché aggiorna i file ma non .git/HEAD del working dir.
#      Il nuovo hook usa `cd WD && git fetch + reset --hard` che sincronizza
#      anche .git/HEAD, quindi questo fallback è di nuovo affidabile.
# Modulo: platform/diagnostica.
# ──────────────────────────────────────────────────────────────
import subprocess
def _read_git_commit() -> str | None:
    # 1. DEPLOYED_COMMIT.txt (autorevole post-deploy)
    try:
        deployed = Path(__file__).resolve().parent / "DEPLOYED_COMMIT.txt"
        if deployed.exists():
            txt = deployed.read_text(encoding="utf-8").strip()
            if txt:
                return txt[:8]   # short hash
    except Exception:
        pass
    # 2. git rev-parse (fallback)
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            cwd=os.path.dirname(os.path.abspath(__file__)) or ".",
            timeout=2,
        )
        return out.decode().strip() or None
    except Exception:
        return None

GIT_COMMIT = _read_git_commit()
if GIT_COMMIT:
    print(f"🔖 GIT_COMMIT: {GIT_COMMIT}")


# ──────────────────────────────────────────────────────────────
# APP_VERSION — single source of truth nel file VERSION root del repo
# (sessione 60, 2026-04-29). Sostituisce il vecchio "2025.12-web" hardcoded.
# Frontend (frontend/src/config/versions.jsx → sistema.version) deve
# restare allineato a questo file. Vedi CLAUDE.md sezione "Versioning".
# ──────────────────────────────────────────────────────────────
_VERSION_FILE = Path(__file__).resolve().parent / "VERSION"
try:
    APP_VERSION = _VERSION_FILE.read_text(encoding="utf-8").strip() or "0.0.0-unknown"
except Exception:
    APP_VERSION = "0.0.0-unknown"
print(f"📦 APP_VERSION: {APP_VERSION}")


# Esegui le migrazioni PRIMA di creare l'app
run_migrations()   # ✅ esegue le migrazioni su foodcost.db prima di creare l'app


# ----------------------------------------
# APP
# ----------------------------------------
app = FastAPI(title="TRGB Gestionale Web", version=APP_VERSION)


# ──────────────────────────────────────────────────────────────
# /system/info — diagnostica + identificazione locale (R1)
# Endpoint pubblico read-only per:
#  - probe HTTP esterno (push.sh, monitoring)
#  - identificare il locale corrente (frontend, scripts, demo affiancata)
# Vedi docs/refactor_monorepo.md §3 R1.
# ──────────────────────────────────────────────────────────────
@app.get("/system/info")
def system_info():
    return {
        "locale": TRGB_LOCALE,
        "product": "TRGB",
        "version": app.version,    # versione semantica storica del backend FastAPI
        "commit": GIT_COMMIT,      # hash short del git HEAD in produzione (sessione 60)
    }


# ──────────────────────────────────────────────────────────────
# /system/modules — diagnostica feature flags moduli (R8b)
# Endpoint pubblico read-only consumato dal frontend (R8c useActiveModules
# hook) per nascondere voci menu di moduli disattivati per il locale.
# Vedi docs/refactor_monorepo.md §3 R8.
# Modulo: platform.
# ──────────────────────────────────────────────────────────────
@app.get("/system/modules")
def system_modules():
    return module_loader.get_module_info()


# ──────────────────────────────────────────────────────────────
# /system/backup-health — stato del sistema di backup (post-incidente 4 mag 2026)
# Modulo: platform.
# Endpoint protetto (JWT) per la dashboard "Backup" in Impostazioni Sistema.
# Legge i 2 file di stato scritti da backup_db.sh v2 e check_backup_health.sh,
# più ispeziona la cartella last_known_good/ per dare un quadro completo.
# Vedi docs/sicurezza_backup.md.
# ──────────────────────────────────────────────────────────────
from fastapi import Depends, HTTPException
from app.services.auth_service import get_current_user, is_admin
from pathlib import Path as _Path
from app.utils.locale_data import locale_data_dir as _ldd

@app.get("/system/backup-health")
def system_backup_health(user=Depends(get_current_user)):
    """Restituisce stato corrente del sistema backup.

    Ritorna:
        {
          "status": "healthy" | "unhealthy" | "unknown",
          "last_health_check": {...},   # da .last_health_status.json
          "last_backup_run": {...},     # da .last_backup_status.json
          "ages": {                     # età in minuti/ore
            "hourly_min": 23,
            "daily_h": 4,
            "drive_h": 4,
          },
          "lkg_files": [                # contenuto last_known_good/
            {"name": "...", "size_mb": 7.0, "age_h": 4, "integrity_ok": true},
            ...
          ],
          "issues": [...],
          "lkg_summary": {"ok": 10, "missing": 0, "stub": 0, "corrupt": 0}
        }
    """
    if not is_admin(user["role"]):
        raise HTTPException(status_code=403, detail="Solo admin può vedere lo stato backup")

    # Rilevo backup_dir relativo al locale (R6.5: app/data/backups/ legacy)
    # Il backup_db.sh scrive sempre in app/data/backups/, indipendentemente dal locale,
    # perché backup è cross-locale (proteggere il VPS, non un singolo locale).
    base_data = _Path(__file__).resolve().parent / "app" / "data"
    backup_dir = base_data / "backups"
    health_file = backup_dir / ".last_health_status.json"
    status_file = backup_dir / ".last_backup_status.json"
    drive_stamp = backup_dir / ".last_drive_sync"
    lkg_dir = backup_dir / "last_known_good"

    out = {
        "status": "unknown",
        "last_health_check": None,
        "last_backup_run": None,
        "ages": {},
        "lkg_files": [],
        "issues": [],
        "lkg_summary": {"ok": 0, "missing": 0, "stub": 0, "corrupt": 0, "total_expected": 0},
    }

    # 1. Health status
    if health_file.exists():
        try:
            out["last_health_check"] = json.loads(health_file.read_text())
            out["status"] = out["last_health_check"].get("status", "unknown")
            out["issues"] = out["last_health_check"].get("issues", [])
        except Exception as e:
            out["issues"].append(f"health_file_parse_error:{e}")

    # 2. Backup run status
    if status_file.exists():
        try:
            out["last_backup_run"] = json.loads(status_file.read_text())
        except Exception as e:
            out["issues"].append(f"status_file_parse_error:{e}")

    # 3. Età ultimo backup hourly (cerca file più recente in hourly/)
    import time as _time
    now = int(_time.time())
    hourly_dir = backup_dir / "hourly"
    daily_dir = backup_dir / "daily"

    def _newest_age_min(directory):
        if not directory.exists():
            return None
        try:
            files = list(directory.rglob("*"))
            files = [f for f in files if f.is_file()]
            if not files:
                return None
            newest = max(f.stat().st_mtime for f in files)
            return int((now - newest) / 60)
        except Exception:
            return None

    hm = _newest_age_min(hourly_dir)
    dm = _newest_age_min(daily_dir)
    out["ages"]["hourly_min"] = hm
    out["ages"]["daily_h"] = (dm // 60) if dm is not None else None

    # 4. Età ultimo Drive sync
    if drive_stamp.exists():
        try:
            ts = int(drive_stamp.read_text().strip())
            out["ages"]["drive_h"] = int((now - ts) / 3600)
        except Exception:
            out["ages"]["drive_h"] = None
    else:
        out["ages"]["drive_h"] = None

    # 5. Lista file last_known_good
    expected_files = [
        "foodcost.db", "admin_finance.sqlite3", "vini.sqlite3",
        "vini_magazzino.sqlite3", "vini_settings.sqlite3",
        "dipendenti.sqlite3", "clienti.sqlite3",
        "notifiche.sqlite3", "tasks.sqlite3", "bevande.sqlite3",
        "users.json", "modules.json", "modules.runtime.json",
        "modules.runtime.meta.json", "closures_config.json",
    ]
    out["lkg_summary"]["total_expected"] = len(expected_files)

    if lkg_dir.exists():
        for fname in expected_files:
            f = lkg_dir / fname
            if not f.exists():
                out["lkg_summary"]["missing"] += 1
                out["lkg_files"].append({
                    "name": fname, "size_mb": 0.0, "age_h": None,
                    "integrity_ok": False, "status": "missing",
                })
                continue
            sz = f.stat().st_size
            mb = round(sz / 1048576, 2)
            age_h = int((now - f.stat().st_mtime) / 3600)
            file_status = "ok"
            integrity_ok = True
            if sz < 8192 and not fname.endswith(".json"):
                out["lkg_summary"]["stub"] += 1
                file_status = "stub"
                integrity_ok = False
            elif sz < 20 and fname.endswith(".json"):
                out["lkg_summary"]["stub"] += 1
                file_status = "stub"
                integrity_ok = False
            else:
                # Per i SQLite, faccio anche integrity_check
                if not fname.endswith(".json"):
                    try:
                        import sqlite3
                        conn = sqlite3.connect(f"file:{f}?mode=ro", uri=True, timeout=2)
                        cur = conn.cursor()
                        cur.execute("PRAGMA integrity_check;")
                        result = cur.fetchone()
                        if result and result[0] == "ok":
                            out["lkg_summary"]["ok"] += 1
                        else:
                            out["lkg_summary"]["corrupt"] += 1
                            file_status = "corrupt"
                            integrity_ok = False
                        conn.close()
                    except Exception as e:
                        out["lkg_summary"]["corrupt"] += 1
                        file_status = f"error:{e}"
                        integrity_ok = False
                else:
                    out["lkg_summary"]["ok"] += 1

            out["lkg_files"].append({
                "name": fname, "size_mb": mb, "age_h": age_h,
                "integrity_ok": integrity_ok, "status": file_status,
            })
    else:
        out["issues"].append("lkg_dir_not_found")

    # Se non c'è health_file ma il backup è recente, deduco status
    if out["status"] == "unknown":
        if hm is not None and hm < 70 and out["lkg_summary"]["ok"] >= 8:
            out["status"] = "healthy"
        elif hm is None or hm > 24 * 60:
            out["status"] = "unhealthy"
            if hm is None:
                out["issues"].append("no_hourly_backup_found")

    return out


# ──────────────────────────────────────────────────────────────
# /locale/branding.json — config visivo del locale (R2, sessione 60)
# Endpoint pubblico read-only consumato dal frontend al boot per applicare
# palette/font/asset paths senza hardcoding TRGB-02 nel codice.
# Cached in memoria 60s per ridurre I/O. In dev mode disabilita la cache.
# Vedi docs/refactor_monorepo.md §3 R2 e locali/<id>/branding.json.
# ──────────────────────────────────────────────────────────────
import json
import time
_BRANDING_CACHE = {"data": None, "ts": 0, "locale": None}
_BRANDING_TTL = 60  # secondi

def _load_branding_for_locale(locale: str) -> dict:
    """
    Carica locali/<locale>/branding.json e ritorna il dict.
    Fallback al branding di 'tregobbi' se manca il file (caso boot
    iniziale per un nuovo cliente prima della configurazione).
    """
    candidate_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "locali", locale, "branding.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "locali", "tregobbi", "branding.json"),
    ]
    for path in candidate_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️ Errore lettura branding {path}: {e}")
                continue
    return {}

@app.get("/locale/branding.json")
def get_locale_branding():
    """Branding tenant-aware: palette + font + asset paths del locale corrente."""
    now = time.time()
    if (_BRANDING_CACHE["data"] is not None
        and _BRANDING_CACHE["locale"] == TRGB_LOCALE
        and now - _BRANDING_CACHE["ts"] < _BRANDING_TTL):
        return _BRANDING_CACHE["data"]
    data = _load_branding_for_locale(TRGB_LOCALE)
    _BRANDING_CACHE["data"] = data
    _BRANDING_CACHE["locale"] = TRGB_LOCALE
    _BRANDING_CACHE["ts"] = now
    return data


# ──────────────────────────────────────────────────────────────
# /locale/strings.json — testi UI tenant-aware (R5, sessione 60)
# Endpoint pubblico read-only consumato dal frontend per il helper t().
# Vedi app/utils/locale_strings.py + frontend/src/utils/localeStrings.js.
# ──────────────────────────────────────────────────────────────
@app.get("/locale/strings.json")
def get_locale_strings():
    """Strings UI tenant-aware: chiavi dot-notation con valori tradotti per il locale corrente."""
    from app.utils.locale_strings import get_all_strings
    return get_all_strings()


# ----------------------------------------
# CORS (per frontend React/Vite)
# ----------------------------------------
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://app.tregobbi.it",
    "https://trgb.tregobbi.it",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-Updated-Qty",
        "X-Updated-Price",
        "X-Updated-Name",
        "X-Total-Matched",
        "X-Added-Missing",
    ],
)


# ----------------------------------------
# MIDDLEWARE READ-ONLY PER RUOLO "viewer"
# Blocca POST/PUT/PATCH/DELETE per utenti con ruolo viewer.
# Permette solo GET/HEAD/OPTIONS + il login POST.
# ----------------------------------------
class ReadOnlyViewerMiddleware(BaseHTTPMiddleware):
    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    # Endpoint permessi anche in scrittura (login)
    ALLOWED_WRITE_PATHS = {"/auth/login"}

    async def dispatch(self, request: Request, call_next):
        if request.method in self.WRITE_METHODS:
            # Controlla se è un path sempre permesso
            if request.url.path not in self.ALLOWED_WRITE_PATHS:
                # Estrai token dall'header Authorization
                auth = request.headers.get("authorization", "")
                if auth.startswith("Bearer "):
                    token = auth[7:]
                    try:
                        from app.core.security import decode_access_token
                        payload = decode_access_token(token)
                        if payload.get("role") == "viewer":
                            return JSONResponse(
                                status_code=403,
                                content={"detail": "Accesso in sola lettura — operazione non permessa per l'utente ospite"},
                            )
                    except Exception:
                        pass  # Token invalido — lascia gestire al router
        return await call_next(request)


app.add_middleware(ReadOnlyViewerMiddleware)


# ----------------------------------------
# STATIC FILES (CSS, Fonts, Images)
#   /static → trgb_web/static
# ----------------------------------------
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

if not STATIC_DIR.exists():
    print("⚠️ Attenzione: la cartella static NON esiste:", STATIC_DIR)

app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static",
)

# ──────────────────────────────────────────────────────────────
# /uploads → directory upload utente FUORI dal repo (Modulo K)
# Default prod: /home/marco/trgb_uploads · dev: <repo>/static/uploads_dev
# Override via env TRGB_UPLOADS_DIR=/path/desiderato
# ──────────────────────────────────────────────────────────────
from app.utils.uploads import get_uploads_dir as _get_uploads_dir
UPLOADS_DIR = _get_uploads_dir()
print(f"📁 Upload utente: {UPLOADS_DIR}")
app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOADS_DIR), check_dir=False),
    name="uploads",
)


# ----------------------------------------
# ROUTERS — montaggio condizionale via module_loader (R8b)
# ----------------------------------------
# Ogni include_router è ora wrappato da _mount: il loader controlla se il
# modulo associato è attivo per il locale corrente (locali/<TRGB_LOCALE>/
# moduli_attivi.json). Default backward-compat: '*' o file mancante → tutti
# attivi (zero behavior change su tregobbi).
#
# Mappa router_file → module_id in core/moduli/<id>/module.json (R8a).

_mount_log_active = []
_mount_log_skipped = []


def _mount(router_file: str, router, **kwargs) -> None:
    """Monta un router solo se il modulo associato è attivo per il locale."""
    if module_loader.is_router_active(router_file):
        app.include_router(router, **kwargs)
        _mount_log_active.append(router_file)
    else:
        _mount_log_skipped.append(router_file)


# VINI
_mount("vini_settings_router", vini_settings_router.router)
_mount("vini_router", vini_router.router)
_mount("vini_magazzino_router", vini_magazzino_router.router)
_mount("vini_cantina_tools_router", vini_cantina_tools_router.router)
_mount("vini_anagrafiche_router", vini_anagrafiche_router.router)  # V.6+V.7+V.8 Fase 2

# FOODCOST (modulo: ricette)
_mount("foodcost_router", foodcost_router.router, prefix="/foodcost", tags=["foodcost"])
_mount("foodcost_ingredients_router", foodcost_ingredients_router.router, prefix="/foodcost", tags=["foodcost-ingredients"])
_mount("foodcost_recipes_router", foodcost_recipes_router.router, prefix="/foodcost", tags=["foodcost-recipes"])
_mount("foodcost_matching_router", foodcost_matching_router.router, prefix="/foodcost", tags=["foodcost-matching"])

# MENU CARTA (sessione 57, mig 098-100)
_mount("menu_carta_router", menu_carta_router.router, prefix="/menu-carta", tags=["menu-carta"])
_mount("menu_carta_router", menu_carta_router.public_router, prefix="/menu-carta", tags=["menu-carta-public"])

# PRANZO DEL GIORNO (sessione 58, mig 102) — sub-modulo menu_carta
# Init schema 1 volta al boot (pattern Vini magazzino) per evitare CREATE TABLE
# concorrenti su prima request (riduce rischio di lock SQLite).
# NB: l'init avviene anche se il modulo è disattivato — è no-op (CREATE IF NOT EXISTS).
if module_loader.is_router_active("pranzo_router"):
    try:
        from app.repositories.pranzo_repository import init_pranzo_db
        init_pranzo_db()
        print("[init] pranzo_db OK")
    except Exception as _e:
        print(f"[init] pranzo_db WARN: {_e}")
_mount("pranzo_router", pranzo_router.router)
_mount("pranzo_router", pranzo_router.public_router)

# AMMINISTRAZIONE / CASSA (corrispettivi, chiusure, stats, confronti, calendario)
_mount("admin_finance", admin_finance_router)
_mount("chiusure_turno", chiusure_turno_router)

# CONFIGURAZIONE CHIUSURE (giorno settimanale + ferie) — modulo cassa
from app.routers.closures_config_router import router as closures_config_router
_mount("closures_config_router", closures_config_router)

# FATTURAZIONE ELETTRONICA (XML) — modulo acquisti
_mount("fe_import", fe_import.router)
_mount("fe_categorie_router", fe_categorie_router.router)
_mount("fe_proforme_router", fe_proforme_router.router)

# DIPENDENTI & TURNI
_mount("dipendenti", dipendenti_router)
_mount("reparti", reparti_router)
_mount("turni_router", turni_router)

# BANCA
_mount("banca_router", banca_router.router)

# CONTROLLO DI GESTIONE
_mount("controllo_gestione_router", controllo_gestione_router.router)

# STATISTICHE
_mount("statistiche_router", statistiche_router.router)

# AUTH E MENU (platform — sempre attivi, eccetto menu che è di menu_carta)
_mount("auth_router", auth_router.router, prefix="/auth", tags=["auth"])
_mount("users_router", users_router)
_mount("modules_router", modules_router)
_mount("menu_router", menu_router.router, prefix="/menu", tags=["menu"])

# BACKUP / VINI / IPRATICO
_mount("backup_router", backup_router.router)
_mount("vini_pricing_router", vini_pricing_router.router)
_mount("ipratico_products_router", ipratico_products_router.router)

# CLIENTI CRM
_mount("clienti_router", clienti_router)

# PRENOTAZIONI
_mount("prenotazioni_router", prenotazioni_router)

# PREVENTIVI (modulo prenotazioni — gestione preventivi eventi)
_mount("preventivi_router", preventivi_router)
_mount("menu_templates_router", menu_templates_router)
_mount("menu_templates_router", menu_templates_preventivi_bridge_router)

# DASHBOARD HOME (platform)
_mount("dashboard_router", dashboard_router)

# NOTIFICHE & COMUNICAZIONI (mattone M.A — platform)
_mount("notifiche_router", notifiche_router)
_mount("notifiche_router", comunicazioni_router)

# ALERT ENGINE (mattone M.F — platform)
_mount("alerts_router", alerts_router)

# HOME ACTIONS (platform)
_mount("home_actions_router", home_actions_router)

# SELEZIONI DEL GIORNO (modulo ricette)
_mount("scelta_macellaio_router", scelta_macellaio_router)
_mount("scelta_salumi_router", scelta_salumi_router)
_mount("scelta_formaggi_router", scelta_formaggi_router)
_mount("scelta_pescato_router", scelta_pescato_router)
_mount("piatti_giorno_router", piatti_giorno_router)

# FATTURE IN CLOUD (modulo acquisti)
_mount("fattureincloud_router", fattureincloud_router.router)

# TASK MANAGER — checklist ricorrenti + task singoli
_mount("tasks_router", tasks_router)

# HACCP — reportistica mensile (modulo task_manager)
_mount("haccp_router", haccp_router)

# LISTA SPESA CUCINA — Fase 1 MVP (modulo cucina)
_mount("lista_spesa_router", lista_spesa_router)

# CARTA BEVANDE — sub-modulo Vini
_mount("bevande_router", bevande_router)


# Banner finale del module loader
print(f"🧩 {module_loader.boot_banner()}")
if _mount_log_skipped:
    print(f"   ↳ skipped: {','.join(_mount_log_skipped)}")


# ----------------------------------------
# ROOT
# ----------------------------------------
@app.get("/")
def root():
    return {
        "message": "Benvenuto in TRGB Web API",
        "versione": "2025.12-web",
    }
