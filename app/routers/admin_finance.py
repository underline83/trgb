# app/routers/admin_finance.py
# @version: v1.0

from datetime import date as date_type
from pathlib import Path
import shutil
import sqlite3
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.services.corrispettivi_import import (
    DB_PATH,
    ensure_table,
    import_df_into_db,
    load_corrispettivi_from_excel,
)

router = APIRouter(
    prefix="/admin/finance",
    tags=["admin-finance"],
)

UPLOAD_DIR = Path("app/data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------
# MODELLI Pydantic
# ---------------------------------------------------------

class ImportResult(BaseModel):
    status: str
    year: int
    inserted: int
    updated: int


class DailyClosureBase(BaseModel):
    date: date_type
    corrispettivi: float
    iva_10: float = 0
    iva_22: float = 0
    fatture: float = 0
    contanti_finali: float = 0
    pos: float = 0
    sella: float = 0
    stripe_pay: float = 0
    bonifici: float = 0
    mance: float = 0
    note: str | None = None


class DailyClosureOut(DailyClosureBase):
    weekday: str
    totale_incassi_
