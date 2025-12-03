# app/routers/admin_finance.py
# @version: v1.0

from datetime import date as date_type
from pathlib import Path
import shutil
import sqlite3
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.security import get_current_admin_user  # adatta al tuo progetto
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


# ---------- MODELLI ----------

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
    totale_incassi: float
    cash_diff: float


# ---------- IMPORT FILE ----------

@router.post("/import-corrispettivi-file", response_model=ImportResult)
async def import_corrispettivi_file(
    file: UploadFile = File(...),
    year: int = 2025,
    current_user=Depends(get_current_admin_user),
):
    filename = (file.filename or "").lower()

    if not filename.endswith((".xlsb", ".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato file non supportato. Usa .xlsb / .xlsx / .xls",
        )

    tmp_name = f"{uuid.uuid4().hex}_{file.filename}"
    tmp_path = UPLOAD_DIR / tmp_name

    # salva file temporaneo
    with tmp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        df = load_corrispettivi_from_excel(tmp_path, year=year)
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Errore nella lettura del file: {e}",
        )

    conn = sqlite3.connect(DB_PATH)
    ensure_table(conn)

    try:
        inserted, updated = import_df_into_db(df, conn, created_by=current_user.username)
    finally:
        conn.close()
        tmp_path.unlink(missing_ok=True)

    return ImportResult(
        status="ok",
        year=year,
        inserted=inserted,
        updated=updated,
    )


# ---------- DAILY CLOSURES (per il modulo digitale) ----------

@router.get("/daily-closures/{date_str}", response_model=DailyClosureOut)
async def get_daily_closure(
    date_str: str,
    current_user=Depends(get_current_admin_user),
):
    """
    Restituisce la chiusura cassa per una data (YYYY-MM-DD).
    Usato da CorrispettiviGestione per pre-caricare i dati.
    """
    conn = sqlite3.connect(DB_PATH)
    ensure_table(conn)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT date, weekday,
                   corrispettivi, iva_10, iva_22, fatture,
                   contanti_finali, pos, sella, stripe_pay, bonifici, mance,
                   totale_incassi, cash_diff, note
            FROM daily_closures
            WHERE date = ?
            """,
            (date_str,),
        )
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Nessuna chiusura trovata per questa data.")

    (
        date_val,
        weekday,
        corrispettivi,
        iva_10,
        iva_22,
        fatture,
        contanti_finali,
        pos,
        sella,
        stripe_pay,
        bonifici,
        mance,
        totale_incassi,
        cash_diff,
        note,
    ) = row

    return DailyClosureOut(
        date=date_val,
        weekday=weekday,
        corrispettivi=corrispettivi,
        iva_10=iva_10,
        iva_22=iva_22,
        fatture=fatture,
        contanti_finali=contanti_finali,
        pos=pos,
        sella=sella,
        stripe_pay=stripe_pay,
        bonifici=bonifici,
        mance=mance,
        totale_incassi=totale_incassi,
        cash_diff=cash_diff,
        note=note,
    )


@router.post("/daily-closures", response_model=DailyClosureOut)
async def upsert_daily_closure(
    payload: DailyClosureBase,
    current_user=Depends(get_current_admin_user),
):
    """
    Crea o aggiorna la chiusura cassa per la data indicata.
    Usato dal form CorrispettiviGestione.jsx.
    """
    conn = sqlite3.connect(DB_PATH)
    ensure_table(conn)

    date_str = payload.date.isoformat()

    totale_incassi = (
        payload.contanti_finali
        + payload.pos
        + payload.sella
        + payload.stripe_pay
        + payload.bonifici
        + payload.mance
    )
    cash_diff = totale_incassi - payload.corrispettivi

    weekday = payload.date.strftime("%A")  # volendo puoi italianizzarlo

    try:
        cur = conn.cursor()

        # verifica se esiste già
        cur.execute("SELECT id FROM daily_closures WHERE date = ?", (date_str,))
        existing = cur.fetchone()

        if existing:
            cur.execute(
                """
                UPDATE daily_closures
                SET weekday = ?,
                    corrispettivi = ?, iva_10 = ?, iva_22 = ?, fatture = ?,
                    contanti_finali = ?, pos = ?, sella = ?, stripe_pay = ?,
                    bonifici = ?, mance = ?,
                    totale_incassi = ?, cash_diff = ?,
                    note = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE date = ?
                """,
                (
                    weekday,
                    payload.corrispettivi,
                    payload.iva_10,
                    payload.iva_22,
                    payload.fatture,
                    payload.contanti_finali,
                    payload.pos,
                    payload.sella,
                    payload.stripe_pay,
                    payload.bonifici,
                    payload.mance,
                    totale_incassi,
                    cash_diff,
                    payload.note,
                    date_str,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO daily_closures (
                    date, weekday,
                    corrispettivi, iva_10, iva_22, fatture,
                    contanti_finali, pos, sella, stripe_pay, bonifici, mance,
                    totale_incassi, cash_diff,
                    note, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str,
                    weekday,
                    payload.corrispettivi,
                    payload.iva_10,
                    payload.iva_22,
                    payload.fatture,
                    payload.contanti_finali,
                    payload.pos,
                    payload.sella,
                    payload.stripe_pay,
                    payload.bonifici,
                    payload.mance,
                    totale_incassi,
                    cash_diff,
                    payload.note,
                    current_user.username,
                ),
            )

        conn.commit()
    finally:
        conn.close()

    return DailyClosureOut(
        date=payload.date,
        weekday=weekday,
        corrispettivi=payload.corrispettivi,
        iva_10=payload.iva_10,
        iva_22=payload.iva_22,
        fatture=payload.fatture,
        contanti_finali=payload.contanti_finali,
        pos=payload.pos,
        sella=payload.sella,
        stripe_pay=payload.stripe_pay,
        bonifici=payload.bonifici,
        mance=payload.mance,
        totale_incassi=totale_incassi,
        cash_diff=cash_diff,
        note=payload.note,
    )
