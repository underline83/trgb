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

# AMMINISTRAZIONE (corrispettivi & analisi) — modulo unico
from app.routers.admin_finance import router as admin_finance_router
from app.routers.chiusure_turno import router as chiusure_turno_router

# FATTURAZIONE ELETTRONICA (XML)
from app.routers import fe_import
from app.routers import fe_categorie_router

# DIPENDENTI & TURNI — nuovo modulo
from app.routers.dipendenti import router as dipendenti_router

# BANCA — movimenti bancari
from app.routers import banca_router

# FINANZA — gestione finanziaria completa
from app.routers import finanza_router
from app.routers import finanza_scadenzario_router

# STATISTICHE — import iPratico e analytics vendite
from app.routers import statistiche_router


# Esegui le migrazioni PRIMA di creare l'app
run_migrations()   # ✅ esegue le migrazioni su foodcost.db prima di creare l'app


# ----------------------------------------
# APP
# ----------------------------------------
app = FastAPI(title="TRGB Gestionale Web", version="2025.12-web")


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

# AMMINISTRAZIONE (corrispettivi, chiusure, stats, confronti, calendario)
app.include_router(admin_finance_router)
app.include_router(chiusure_turno_router)

# FATTURAZIONE ELETTRONICA (XML)
app.include_router(fe_import.router)
app.include_router(fe_categorie_router.router)

# DIPENDENTI & TURNI
# (usa DB dedicato app/data/dipendenti.sqlite3, inizializzato in dipendenti_db.init_dipendenti_db)
app.include_router(dipendenti_router)

# BANCA
app.include_router(banca_router.router)

# FINANZA
app.include_router(finanza_router.router)
app.include_router(finanza_scadenzario_router.router)

# STATISTICHE
app.include_router(statistiche_router.router)

# AUTH E MENU
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
app.include_router(users_router)
app.include_router(modules_router)
app.include_router(menu_router.router, prefix="/menu", tags=["menu"])


# ----------------------------------------
# ROOT
# ----------------------------------------
@app.get("/")
def root():
    return {
        "message": "Benvenuto in TRGB Web API",
        "versione": "2025.12-web",
    }
