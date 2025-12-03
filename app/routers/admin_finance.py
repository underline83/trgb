# app/routers/admin_finance.py
# @version: v1.1

from datetime import date as date_type, datetime
from pathlib import Path
import math
import shutil
import sqlite3
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
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
# MODELLI Pydantic - BASE
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
    totale_incassi: float
    cash_diff: float


# ---------------------------------------------------------
# MODELLI Pydantic - STATISTICHE / DASHBOARD
# ---------------------------------------------------------

class MonthlyDay(BaseModel):
    date: date_type
    weekday: str
    corrispettivi: float
    totale_incassi: float
    cash_diff: float


class PaymentBreakdown(BaseModel):
    contanti_finali: float
    pos: float
    sella: float
    stripe_pay: float
    bonifici: float
    mance: float
    totale_incassi: float


class Alert(BaseModel):
    date: date_type
    type: str
    message: str
    cash_diff: float


class MonthlyStats(BaseModel):
    year: int
    month: int
    totale_corrispettivi: float
    totale_incassi: float
    totale_fatture: float
    totale_iva_10: float
    totale_iva_22: float
    giorni_con_chiusura: int
    media_corrispettivi: float
    media_incassi: float
    giorni: List[MonthlyDay]
    pagamenti: PaymentBreakdown
    alerts: List[Alert]


class MonthlySummary(BaseModel):
    month: int
    totale_corrispettivi: float
    totale_incassi: float
    totale_fatture: float
    giorni_con_chiusura: int
    media_corrispettivi: float
    media_incassi: float


class AnnualStats(BaseModel):
    year: int
    totale_corrispettivi: float
    totale_incassi: float
    totale_fatture: float
    mesi: List[MonthlySummary]


class AnnualCompare(BaseModel):
    year: int
    prev_year: int
    current: AnnualStats
    previous: AnnualStats
    delta_corrispettivi: float
    delta_corrispettivi_pct: Optional[float]
    delta_incassi: float
    delta_incassi_pct: Optional[float]


class TopDay(BaseModel):
    date: date_type
    weekday: str
    totale_incassi: float
    corrispettivi: float
    cash_diff: float


class TopDaysStats(BaseModel):
    year: int
    top_best: List[TopDay]
    top_worst: List[TopDay]


# ---------------------------------------------------------
# IMPORT CORRISPETTIVI DA FILE EXCEL
# ---------------------------------------------------------

@router.post("/import-corrispettivi-file", response_model=ImportResult)
async def import_corrispettivi_file(
    file: UploadFile = File(...),
    year: int = 2025,
):
    """
    Importa i corrispettivi da un file Excel (xlsb/xlsx/xls) nel DB admin_finance.
    Usa il foglio con nome = anno (es. "2025").
    """
    filename = (file.filename or "").lower()

    if not filename.endswith((".xlsb", ".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato file non supportato. Usa .xlsb / .xlsx / .xls",
        )

    tmp_name = f"{uuid.uuid4().hex}_{file.filename}"
    tmp_path = UPLOAD_DIR / tmp_name

    # Salva fisicamente il file caricato
    with tmp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Prova a leggere l'Excel
    try:
        df = load_corrispettivi_from_excel(tmp_path, year=year)
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Errore nella lettura del file: {e}",
        )

    # Connessione al DB amministrativo
    conn = sqlite3.connect(DB_PATH)
    ensure_table(conn)

    try:
        inserted, updated = import_df_into_db(
            df,
            conn,
            created_by="admin-finance",
        )
    finally:
        conn.close()
        tmp_path.unlink(missing_ok=True)

    return ImportResult(
        status="ok",
        year=year,
        inserted=inserted,
        updated=updated,
    )


# ---------------------------------------------------------
# DAILY CLOSURES: LETTURA PER DATA
# ---------------------------------------------------------

@router.get("/daily-closures/{date_str}", response_model=DailyClosureOut)
async def get_daily_closure(
    date_str: str,
):
    """
    Restituisce la chiusura cassa per una data (YYYY-MM-DD).
    Usato dal modulo CorrispettiviGestione.jsx.
    """
    conn = sqlite3.connect(DB_PATH)
    ensure_table(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
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
                note
            FROM daily_closures
            WHERE date = ?
            """,
            (date_str,),
        )
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nessuna chiusura trovata per questa data.",
        )

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


# ---------------------------------------------------------
# DAILY CLOSURES: INSERIMENTO / UPDATE
# ---------------------------------------------------------

@router.post("/daily-closures", response_model=DailyClosureOut)
async def upsert_daily_closure(
    payload: DailyClosureBase,
):
    """
    Crea o aggiorna la chiusura cassa per la data indicata.
    Se esiste già una riga per quella data, viene aggiornata.
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

    weekday = payload.date.strftime("%A")  # TODO: italianizzare

    try:
        cur = conn.cursor()

        # verifica se esiste già una chiusura per quella data
        cur.execute("SELECT id FROM daily_closures WHERE date = ?", (date_str,))
        existing = cur.fetchone()

        if existing:
            cur.execute(
                """
                UPDATE daily_closures
                SET
                    weekday = ?,
                    corrispettivi = ?,
                    iva_10 = ?,
                    iva_22 = ?,
                    fatture = ?,
                    contanti_finali = ?,
                    pos = ?,
                    sella = ?,
                    stripe_pay = ?,
                    bonifici = ?,
                    mance = ?,
                    totale_incassi = ?,
                    cash_diff = ?,
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
                    date,
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
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    "admin-finance",
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


# ---------------------------------------------------------
# HELPER INTERNO: costruisce PaymentBreakdown da righe SQL
# ---------------------------------------------------------

def _build_payment_breakdown(rows: List[sqlite3.Row]) -> PaymentBreakdown:
    contanti = sum(r["contanti_finali"] for r in rows)
    pos = sum(r["pos"] for r in rows)
    sella = sum(r["sella"] for r in rows)
    stripe_pay = sum(r["stripe_pay"] for r in rows)
    bonifici = sum(r["bonifici"] for r in rows)
    mance = sum(r["mance"] for r in rows)
    totale = contanti + pos + sella + stripe_pay + bonifici + mance

    return PaymentBreakdown(
        contanti_finali=contanti,
        pos=pos,
        sella=sella,
        stripe_pay=stripe_pay,
        bonifici=bonifici,
        mance=mance,
        totale_incassi=totale,
    )


# ---------------------------------------------------------
# STATS: DASHBOARD MENSILE
# ---------------------------------------------------------

@router.get("/stats/monthly", response_model=MonthlyStats)
async def get_monthly_stats(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    cash_diff_alert_threshold: float = Query(20.0),
):
    """
    Statistiche dettagliate per un mese:
    - totali e medie
    - elenco giorni
    - breakdown pagamenti
    - alert su differenze di cassa oltre soglia
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_table(conn)

    ym_prefix = f"{year:04d}-{month:02d}"

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
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
                cash_diff
            FROM daily_closures
            WHERE substr(date, 1, 7) = ?
            ORDER BY date ASC
            """,
            (ym_prefix,),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        # Nessuna chiusura per questo mese
        return MonthlyStats(
            year=year,
            month=month,
            totale_corrispettivi=0.0,
            totale_incassi=0.0,
            totale_fatture=0.0,
            totale_iva_10=0.0,
            totale_iva_22=0.0,
            giorni_con_chiusura=0,
            media_corrispettivi=0.0,
            media_incassi=0.0,
            giorni=[],
            pagamenti=PaymentBreakdown(
                contanti_finali=0.0,
                pos=0.0,
                sella=0.0,
                stripe_pay=0.0,
                bonifici=0.0,
                mance=0.0,
                totale_incassi=0.0,
            ),
            alerts=[],
        )

    giorni_con_chiusura = len(rows)

    totale_corr = sum(r["corrispettivi"] for r in rows)
    totale_iva_10 = sum(r["iva_10"] for r in rows)
    totale_iva_22 = sum(r["iva_22"] for r in rows)
    totale_fatture = sum(r["fatture"] for r in rows)
    totale_incassi = sum(r["totale_incassi"] for r in rows)

    media_corr = totale_corr / giorni_con_chiusura if giorni_con_chiusura else 0.0
    media_inc = totale_incassi / giorni_con_chiusura if giorni_con_chiusura else 0.0

    giorni_list = [
        MonthlyDay(
            date=datetime.strptime(r["date"], "%Y-%m-%d").date(),
            weekday=r["weekday"],
            corrispettivi=r["corrispettivi"],
            totale_incassi=r["totale_incassi"],
            cash_diff=r["cash_diff"],
        )
        for r in rows
    ]

    pagamenti = _build_payment_breakdown(rows)

    alerts: List[Alert] = []
    for r in rows:
        diff = r["cash_diff"]
        if abs(diff) >= cash_diff_alert_threshold:
            alerts.append(
                Alert(
                    date=datetime.strptime(r["date"], "%Y-%m-%d").date(),
                    type="CASH_DIFF",
                    message=f"Scostamento cassa di {diff:.2f} €",
                    cash_diff=diff,
                )
            )

    return MonthlyStats(
        year=year,
        month=month,
        totale_corrispettivi=totale_corr,
        totale_incassi=totale_incassi,
        totale_fatture=totale_fatture,
        totale_iva_10=totale_iva_10,
        totale_iva_22=totale_iva_22,
        giorni_con_chiusura=giorni_con_chiusura,
        media_corrispettivi=media_corr,
        media_incassi=media_inc,
        giorni=giorni_list,
        pagamenti=pagamenti,
        alerts=alerts,
    )


# ---------------------------------------------------------
# HELPER: AnnualStats
# ---------------------------------------------------------

def _compute_annual_stats(year: int) -> AnnualStats:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_table(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
                corrispettivi,
                fatture,
                totale_incassi
            FROM daily_closures
            WHERE substr(date, 1, 4) = ?
            ORDER BY date ASC
            """,
            (f"{year:04d}",),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return AnnualStats(
            year=year,
            totale_corrispettivi=0.0,
            totale_incassi=0.0,
            totale_fatture=0.0,
            mesi=[],
        )

    # Totali anno
    totale_corr = sum(r["corrispettivi"] for r in rows)
    totale_inc = sum(r["totale_incassi"] for r in rows)
    totale_fatt = sum(r["fatture"] for r in rows)

    # Raggruppa per mese
    monthly_map = {}  # key: month (1..12) -> list of rows
    for r in rows:
        d = datetime.strptime(r["date"], "%Y-%m-%d").date()
        m = d.month
        monthly_map.setdefault(m, []).append(r)

    mesi: List[MonthlySummary] = []
    for m in sorted(monthly_map.keys()):
        m_rows = monthly_map[m]
        giorni = len(m_rows)
        m_corr = sum(r["corrispettivi"] for r in m_rows)
        m_inc = sum(r["totale_incassi"] for r in m_rows)
        m_fatt = sum(r["fatture"] for r in m_rows)
        mesi.append(
            MonthlySummary(
                month=m,
                totale_corrispettivi=m_corr,
                totale_incassi=m_inc,
                totale_fatture=m_fatt,
                giorni_con_chiusura=giorni,
                media_corrispettivi=m_corr / giorni if giorni else 0.0,
                media_incassi=m_inc / giorni if giorni else 0.0,
            )
        )

    return AnnualStats(
        year=year,
        totale_corrispettivi=totale_corr,
        totale_incassi=totale_inc,
        totale_fatture=totale_fatt,
        mesi=mesi,
    )


# ---------------------------------------------------------
# STATS: RIEPILOGO ANNUALE
# ---------------------------------------------------------

@router.get("/stats/annual", response_model=AnnualStats)
async def get_annual_stats(
    year: int = Query(..., ge=2000, le=2100),
):
    """
    Riepilogo annuale: totali anno e breakdown per mese.
    """
    return _compute_annual_stats(year)


# ---------------------------------------------------------
# STATS: CONFRONTO ANNI (es. 2025 vs 2024)
# ---------------------------------------------------------

@router.get("/stats/annual-compare", response_model=AnnualCompare)
async def get_annual_compare(
    year: int = Query(..., ge=2000, le=2100),
    prev_year: Optional[int] = Query(None, ge=2000, le=2100),
):
    """
    Confronto fra due anni (default: year vs year-1).
    """
    if prev_year is None:
        prev_year = year - 1

    current = _compute_annual_stats(year)
    previous = _compute_annual_stats(prev_year)

    delta_corr = current.totale_corrispettivi - previous.totale_corrispettivi
    delta_inc = current.totale_incassi - previous.totale_incassi

    delta_corr_pct = None
    if previous.totale_corrispettivi:
        delta_corr_pct = (delta_corr / previous.totale_corrispettivi) * 100.0

    delta_inc_pct = None
    if previous.totale_incassi:
        delta_inc_pct = (delta_inc / previous.totale_incassi) * 100.0

    return AnnualCompare(
        year=year,
        prev_year=prev_year,
        current=current,
        previous=previous,
        delta_corrispettivi=delta_corr,
        delta_corrispettivi_pct=delta_corr_pct,
        delta_incassi=delta_inc,
        delta_incassi_pct=delta_inc_pct,
    )


# ---------------------------------------------------------
# STATS: TOP/BOTTOM DAYS
# ---------------------------------------------------------

@router.get("/stats/top-days", response_model=TopDaysStats)
async def get_top_days(
    year: int = Query(..., ge=2000, le=2100),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Restituisce i giorni migliori e peggiori per totale incassi nell'anno.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_table(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
                weekday,
                totale_incassi,
                corrispettivi,
                cash_diff
            FROM daily_closures
            WHERE substr(date, 1, 4) = ?
            ORDER BY totale_incassi DESC
            LIMIT ?
            """,
            (f"{year:04d}", limit),
        )
        best_rows = cur.fetchall()

        cur.execute(
            """
            SELECT
                date,
                weekday,
                totale_incassi,
                corrispettivi,
                cash_diff
            FROM daily_closures
            WHERE substr(date, 1, 4) = ?
            ORDER BY totale_incassi ASC
            LIMIT ?
            """,
            (f"{year:04d}", limit),
        )
        worst_rows = cur.fetchall()
    finally:
        conn.close()

    def _rows_to_topdays(rs: List[sqlite3.Row]) -> List[TopDay]:
        return [
            TopDay(
                date=datetime.strptime(r["date"], "%Y-%m-%d").date(),
                weekday=r["weekday"],
                totale_incassi=r["totale_incassi"],
                corrispettivi=r["corrispettivi"],
                cash_diff=r["cash_diff"],
            )
            for r in rs
        ]

    return TopDaysStats(
        year=year,
        top_best=_rows_to_topdays(best_rows),
        top_worst=_rows_to_topdays(worst_rows),
    )
