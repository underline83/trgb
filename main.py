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


# ──────────────────────────────────────────────────────────────
# TRGB_LOCALE — identificativo del locale (R1, sessione 60, 2026-04-28)
# Default "tregobbi" per l'osteria di Marco. Override via env var TRGB_LOCALE.
# Vedi docs/refactor_monorepo.md §3 R1 e locali/README.md.
# ──────────────────────────────────────────────────────────────
import os
TRGB_LOCALE = os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"
print(f"🏠 TRGB_LOCALE: {TRGB_LOCALE}")


# Esegui le migrazioni PRIMA di creare l'app
run_migrations()   # ✅ esegue le migrazioni su foodcost.db prima di creare l'app


# ----------------------------------------
# APP
# ----------------------------------------
app = FastAPI(title="TRGB Gestionale Web", version="2025.12-web")


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
        "version": app.version,
    }


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
# ROUTERS
# ----------------------------------------

# VINI
app.include_router(vini_settings_router.router)
app.include_router(vini_router.router)
app.include_router(vini_magazzino_router.router)
app.include_router(vini_cantina_tools_router.router)

# FOODCOST
app.include_router(foodcost_router.router, prefix="/foodcost", tags=["foodcost"])
app.include_router(
    foodcost_ingredients_router.router,
    prefix="/foodcost",
    tags=["foodcost-ingredients"],
)
app.include_router(
    foodcost_recipes_router.router,
    prefix="/foodcost",
    tags=["foodcost-recipes"],
)
app.include_router(
    foodcost_matching_router.router,
    prefix="/foodcost",
    tags=["foodcost-matching"],
)

# MENU CARTA (sessione 57, mig 098-100)
app.include_router(
    menu_carta_router.router,
    prefix="/menu-carta",
    tags=["menu-carta"],
)
app.include_router(
    menu_carta_router.public_router,
    prefix="/menu-carta",
    tags=["menu-carta-public"],
)

# PRANZO DEL GIORNO (sessione 58, mig 102) — sub-modulo Cucina
# Init schema 1 volta al boot (pattern Vini magazzino) per evitare CREATE TABLE
# concorrenti su prima request (riduce rischio di lock SQLite).
try:
    from app.repositories.pranzo_repository import init_pranzo_db
    init_pranzo_db()
    print("[init] pranzo_db OK")
except Exception as _e:
    print(f"[init] pranzo_db WARN: {_e}")
app.include_router(pranzo_router.router)
app.include_router(pranzo_router.public_router)

# AMMINISTRAZIONE (corrispettivi, chiusure, stats, confronti, calendario)
app.include_router(admin_finance_router)
app.include_router(chiusure_turno_router)

# CONFIGURAZIONE CHIUSURE (giorno settimanale + ferie)
from app.routers.closures_config_router import router as closures_config_router
app.include_router(closures_config_router)

# FATTURAZIONE ELETTRONICA (XML)
app.include_router(fe_import.router)
app.include_router(fe_categorie_router.router)
app.include_router(fe_proforme_router.router)

# DIPENDENTI & TURNI
# (usa DB dedicato app/data/dipendenti.sqlite3, inizializzato in dipendenti_db.init_dipendenti_db)
app.include_router(dipendenti_router)
app.include_router(reparti_router)
app.include_router(turni_router)

# BANCA
app.include_router(banca_router.router)

# CONTROLLO DI GESTIONE
app.include_router(controllo_gestione_router.router)

# STATISTICHE
app.include_router(statistiche_router.router)

# AUTH E MENU
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
app.include_router(users_router)
app.include_router(modules_router)
app.include_router(menu_router.router, prefix="/menu", tags=["menu"])

# BACKUP
app.include_router(backup_router.router)
app.include_router(vini_pricing_router.router)
app.include_router(ipratico_products_router.router)

# CLIENTI CRM
# (usa DB dedicato app/data/clienti.sqlite3, inizializzato in clienti_db.init_clienti_db)
app.include_router(clienti_router)

# PRENOTAZIONI
app.include_router(prenotazioni_router)

# PREVENTIVI (modulo 10 — gestione preventivi eventi, usa clienti.sqlite3)
app.include_router(preventivi_router)
app.include_router(menu_templates_router)
app.include_router(menu_templates_preventivi_bridge_router)

# DASHBOARD HOME (widget Home v3)
app.include_router(dashboard_router)

# NOTIFICHE & COMUNICAZIONI (mattone M.A — infrastruttura trasversale)
# (usa DB dedicato app/data/notifiche.sqlite3, inizializzato in notifiche_db.init_notifiche_db)
app.include_router(notifiche_router)
app.include_router(comunicazioni_router)

# ALERT ENGINE (mattone M.F — controlla soglie/scadenze, genera notifiche via M.A)
app.include_router(alerts_router)

# HOME PER RUOLO — azioni rapide Home configurabili da Impostazioni per ogni ruolo
# (sostituisce gli array hardcoded ADMIN_ACTIONS/SALA_ACTIONS, sessione 49)
app.include_router(home_actions_router)

# SCELTA DEL MACELLAIO
app.include_router(scelta_macellaio_router)

# SCELTA DEI SALUMI — gemello macellaio per salumi con campi extra (sessione 50)
app.include_router(scelta_salumi_router)

# SCELTA DEI FORMAGGI — gemello macellaio per formaggi con campo latte (sessione 50)
app.include_router(scelta_formaggi_router)

# SCELTA DEL PESCATO — gemello macellaio con campo zona_fao (sessione 50, "Selezioni del Giorno")
app.include_router(scelta_pescato_router)

# FATTURE IN CLOUD
app.include_router(fattureincloud_router.router)

# TASK MANAGER — checklist ricorrenti + task singoli (ex-Cucina)
# (usa DB dedicato app/data/tasks.sqlite3, inizializzato in tasks_router al primo import)
app.include_router(tasks_router)

# HACCP — reportistica mensile read-only su tasks.sqlite3 (Modulo I)
app.include_router(haccp_router)

# LISTA SPESA CUCINA — Fase 1 MVP testuale (Modulo J)
app.include_router(lista_spesa_router)

# CARTA BEVANDE — sub-modulo Vini per sezioni statiche (Aperitivi, Birre, Distillati, …)
# (usa DB dedicato app/data/bevande.sqlite3, inizializzato dalla migration 089)
app.include_router(bevande_router)


# ----------------------------------------
# ROOT
# ----------------------------------------
@app.get("/")
def root():
    return {
        "message": "Benvenuto in TRGB Web API",
        "versione": "2025.12-web",
    }
