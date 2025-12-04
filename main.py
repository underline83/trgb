#!/usr/bin/env python3
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# MODULO MIGRAZIONI
from app.migrations.migration_runner import run_migrations

# ROUTER ESISTENTI
from app.routers import auth_router
from app.routers import menu_router
from app.routers import vini_router
from app.routers import vini_settings_router
from app.routers import vini_magazzino_router
from app.routers import foodcost_router
from app.routers import foodcost_ingredients_router
from app.routers import foodcost_recipes_router
from app.routers import admin_finance

# ⚠️ IMPORT CORRETTO DEL ROUTER FATTURE XML
from app.routers import fe_import


# Esegui le migrazioni PRIMA di creare l'app
run_migrations()   # ✅ esegue le migrazioni su foodcost.db prima di creare l'app


# ----------------------------------------
# APP
# ----------------------------------------
app = FastAPI(title="TRGB Gestionale Web", version="2025.11-web")


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

# AMMINISTRAZIONE (corrispettivi, ecc.)
app.include_router(admin_finance.router)

# FATTURAZIONE ELETTRONICA (XML) — NUOVO
app.include_router(fe_import.router)

# AUTH E MENU
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
app.include_router(menu_router.router, prefix="/menu", tags=["menu"])


# ----------------------------------------
# ROOT
# ----------------------------------------
@app.get("/")
def root():
  return {
      "message": "Benvenuto in TRGB Web API",
      "versione": "2025.11-web",
  }
