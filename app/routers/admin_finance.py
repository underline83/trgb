# app/routers/admin_finance.py
# @version: v2.0

from datetime import date as date_type, datetime
from pathlib import Path
import shutil
import sqlite3
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

# 🔄 IMPORT MULTI-ANNO + SCHEMA TABELLA
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
# MIGRAZIONE / SCHEMA DAILY_CLOSURES
# ---------------------------------------------------------

def ensure_daily_closures_table(conn: sqlite3.Connection) -> None:
    """
    Garantisce che la tabella daily_closures esista con lo schema corretto.
    Usa ensure_table() dal servizio import.
    """
    ensure_table(conn)

    # Compatibilità vecchie versioni: verifica che esista la colonna is_closed.
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(daily_closures);")
    cols = [row[1] for row in cur.fetchall()]
    if "is_closed" not in cols:
        cur.execute(
            "ALTER TABLE daily_closures "
            "ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0;"
        )
        conn.commit()


# ---------------------------------------------------------
# HELPER NUMERICO
# ---------------------------------------------------------

def _nz(x) -> float:
    """Converte None in 0.0 e forza a float."""
    return float(x) if x is not None else 0.0


# ---------------------------------------------------------
# MODELLI Pydantic - BASE
# ---------------------------------------------------------

class ImportResult(BaseModel):
    status: str
    year: str   # può essere "archivio" oppure "2025", "2026", ...
    inserted: int
    updated: int


class DailyClosureBase(BaseModel):
    """
    Payload per creare/aggiornare una chiusura (UI o API).
    Lo schema è allineato al nuovo DB:

    - corrispettivi = base IVA 10 + IVA 22
    - fatture = fatture emesse
    - corrispettivi_tot = corrispettivi + fatture (calcolato lato backend)
    - contanti_finali + pos_bpm + pos_sella + theforkpay + other_e_payments + bonifici = totale_incassi
    - mance = mance digitali (NON incluse in totale_incassi)
    """
    date: date_type

    # Fiscale
    corrispettivi: float = 0.0
    iva_10: float = 0.0
    iva_22: float = 0.0
    fatture: float = 0.0

    # Incassi
    contanti_finali: float = 0.0
    pos_bpm: float = 0.0
    pos_sella: float = 0.0
    theforkpay: float = 0.0
    other_e_payments: float = 0.0
    bonifici: float = 0.0

    # Mance (fuori dagli incassi)
    mance: float = 0.0

    note: str | None = None
    is_closed: bool = False


class DailyClosureOut(DailyClosureBase):
    weekday: str | None = None
    corrispettivi_tot: float = 0.0
    totale_incassi: float = 0.0
    cash_diff: float = 0.0


# ---------------------------------------------------------
# STATISTIC MODELS
# ---------------------------------------------------------

class MonthlyDay(BaseModel):
    date: date_type
    weekday: str
    corrispettivi: float
    totale_incassi: float
    cash_diff: float
    is_closed: bool


class PaymentBreakdown(BaseModel):
    contanti_finali: float
    pos_bpm: float
    pos_sella: float
    theforkpay: float
    other_e_payments: float
    bonifici: float
    totale_incassi: float  # solo incassi "fiscali"
    mance: float           # mance tenute a parte


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


class SetClosedPayload(BaseModel):
    is_closed: bool


# ---------------------------------------------------------
# IMPORT CORRISPETTIVI — VERSIONE MULTI ANNO
# ---------------------------------------------------------

@router.post("/import-corrispettivi-file", response_model=ImportResult)
async def import_corrispettivi_file(
    file: UploadFile = File(...),
    year: str = "archivio",
):
    """
    Importa i corrispettivi da un file Excel (xlsb/xlsx/xls) nel DB admin_finance.

    - year = "archivio"  -> usa il foglio 'archivio', importa tutte le date presenti.
    - year = "2025"      -> usa il foglio '2025' e filtra l'anno 2025.
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

    # Prova a leggere l'Excel con la nuova funzione
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
    ensure_daily_closures_table(conn)

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


# ----------------------------------------------------
# HELPER: conversione Row -> DailyClosureOut
# ----------------------------------------------------

def _row_to_daily_closure_out(row: sqlite3.Row) -> DailyClosureOut:
    """Converte una riga SQL in DailyClosureOut, proteggendo dai None."""
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nessuna chiusura trovata per questa data.",
        )

    return DailyClosureOut(
        date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
        weekday=row["weekday"],
        corrispettivi=_nz(row["corrispettivi"]),
        iva_10=_nz(row["iva_10"]),
        iva_22=_nz(row["iva_22"]),
        fatture=_nz(row["fatture"]),
        corrispettivi_tot=_nz(row["corrispettivi_tot"]),
        contanti_finali=_nz(row["contanti_finali"]),
        pos_bpm=_nz(row["pos_bpm"]),
        pos_sella=_nz(row["pos_sella"]),
        theforkpay=_nz(row["theforkpay"]),
        other_e_payments=_nz(row["other_e_payments"]),
        bonifici=_nz(row["bonifici"]),
        mance=_nz(row["mance"]),
        totale_incassi=_nz(row["totale_incassi"]),
        cash_diff=_nz(row["cash_diff"]),
        note=row["note"],
        is_closed=bool(row["is_closed"]),
    )


# ----------------------------------------------------
# DAILY CLOSURES: LETTURA PER DATA
# ----------------------------------------------------

@router.get("/daily-closures/{date_str}", response_model=DailyClosureOut)
async def get_daily_closure(
    date_str: str,
):
    """
    Restituisce la chiusura cassa per una data (YYYY-MM-DD).
    Usato dal modulo CorrispettiviGestione.jsx.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

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
                corrispettivi_tot,
                contanti_finali,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                totale_incassi,
                cash_diff,
                note,
                COALESCE(is_closed, 0) AS is_closed
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

    return _row_to_daily_closure_out(row)


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
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

    date_str = payload.date.isoformat()

    # Calcoli coerenti con lo schema:
    # - corrispettivi_tot = corrispettivi + fatture
    # - totale_incassi = contanti + pos_bpm + pos_sella + theforkpay + other_e_payments + bonifici
    # - cash_diff = totale_incassi - corrispettivi_tot
    corrispettivi = float(payload.corrispettivi)
    fatture = float(payload.fatture)
    corrispettivi_tot = corrispettivi + fatture

    contanti = float(payload.contanti_finali)
    pos_bpm = float(payload.pos_bpm)
    pos_sella = float(payload.pos_sella)
    theforkpay = float(payload.theforkpay)
    other_e = float(payload.other_e_payments)
    bonifici = float(payload.bonifici)
    mance = float(payload.mance)

    totale_incassi = contanti + pos_bpm + pos_sella + theforkpay + other_e + bonifici
    cash_diff = totale_incassi - corrispettivi_tot

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
                    corrispettivi_tot = ?,
                    contanti_finali = ?,
                    pos_bpm = ?,
                    pos_sella = ?,
                    theforkpay = ?,
                    other_e_payments = ?,
                    bonifici = ?,
                    mance = ?,
                    totale_incassi = ?,
                    cash_diff = ?,
                    note = ?,
                    is_closed = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE date = ?
                """,
                (
                    weekday,
                    corrispettivi,
                    payload.iva_10,
                    payload.iva_22,
                    fatture,
                    corrispettivi_tot,
                    contanti,
                    pos_bpm,
                    pos_sella,
                    theforkpay,
                    other_e,
                    bonifici,
                    mance,
                    totale_incassi,
                    cash_diff,
                    payload.note,
                    1 if payload.is_closed else 0,
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
                    corrispettivi_tot,
                    contanti_finali,
                    pos_bpm,
                    pos_sella,
                    theforkpay,
                    other_e_payments,
                    bonifici,
                    mance,
                    totale_incassi,
                    cash_diff,
                    note,
                    is_closed,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str,
                    weekday,
                    corrispettivi,
                    payload.iva_10,
                    payload.iva_22,
                    fatture,
                    corrispettivi_tot,
                    contanti,
                    pos_bpm,
                    pos_sella,
                    theforkpay,
                    other_e,
                    bonifici,
                    mance,
                    totale_incassi,
                    cash_diff,
                    payload.note,
                    1 if payload.is_closed else 0,
                    "admin-finance",
                ),
            )

        conn.commit()

        # reload row
        cur.execute(
            """
            SELECT
                date,
                weekday,
                corrispettivi,
                iva_10,
                iva_22,
                fatture,
                corrispettivi_tot,
                contanti_finali,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                totale_incassi,
                cash_diff,
                note,
                COALESCE(is_closed, 0) AS is_closed
            FROM daily_closures
            WHERE date = ?
            """,
            (date_str,),
        )
        row = cur.fetchone()
    finally:
        conn.close()

    return _row_to_daily_closure_out(row)


# ---------------------------------------------------------
# ENDPOINT: SET/CLEAR CLOSED FLAG
# ---------------------------------------------------------

@router.post("/daily-closures/{date_str}/set-closed", response_model=DailyClosureOut)
async def set_daily_closure_closed(
    date_str: str,
    payload: SetClosedPayload,
):
    """
    Permette di marcare un giorno come CHIUSO (o riaprirlo) senza toccare i valori.
    Utile se un mercoledì con corrispettivi=0 va ignorato dalle medie/statistiche.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE daily_closures
            SET is_closed = ?, updated_at = CURRENT_TIMESTAMP
            WHERE date = ?
            """,
            (1 if payload.is_closed else 0, date_str),
        )
        if cur.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nessuna chiusura trovata per questa data.",
            )

        conn.commit()

        cur.execute(
            """
            SELECT
                date,
                weekday,
                corrispettivi,
                iva_10,
                iva_22,
                fatture,
                corrispettivi_tot,
                contanti_finali,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                totale_incassi,
                cash_diff,
                note,
                COALESCE(is_closed, 0) AS is_closed
            FROM daily_closures
            WHERE date = ?
            """,
            (date_str,),
        )
        row = cur.fetchone()
    finally:
        conn.close()

    return _row_to_daily_closure_out(row)


# ---------------------------------------------------------
# HELPER INTERNO: chiusura "effettiva" (manuale + regola mercoledì)
# ---------------------------------------------------------

def _is_effectively_closed(row: sqlite3.Row) -> bool:
    """
    Ritorna True se il giorno va considerato chiuso ai fini delle medie/statistiche.

    Regola:
    - se is_closed == 1 -> chiuso
    - oppure se è mercoledì e corrispettivi==0 e totale_incassi==0 -> chiuso "automatico"
    """
    is_closed_flag = row["is_closed"] if "is_closed" in row.keys() else 0
    if is_closed_flag:
        return True

    weekday = row["weekday"]
    corr = _nz(row["corrispettivi"])
    tot_inc = _nz(row["totale_incassi"])

    if weekday in ("Wednesday", "Mercoledì") and corr == 0 and tot_inc == 0:
        return True

    return False


# ---------------------------------------------------------
# HELPER INTERNO: costruisce PaymentBreakdown da righe SQL
# ---------------------------------------------------------

def _build_payment_breakdown(rows: List[sqlite3.Row]) -> PaymentBreakdown:
    contanti = sum(_nz(r["contanti_finali"]) for r in rows)
    pos_bpm = sum(_nz(r["pos_bpm"]) for r in rows)
    pos_sella = sum(_nz(r["pos_sella"]) for r in rows)
    theforkpay = sum(_nz(r["theforkpay"]) for r in rows)
    other_e = sum(_nz(r["other_e_payments"]) for r in rows)
    bonifici = sum(_nz(r["bonifici"]) for r in rows)
    mance = sum(_nz(r["mance"]) for r in rows)

    totale = contanti + pos_bpm + pos_sella + theforkpay + other_e + bonifici

    return PaymentBreakdown(
        contanti_finali=contanti,
        pos_bpm=pos_bpm,
        pos_sella=pos_sella,
        theforkpay=theforkpay,
        other_e_payments=other_e,
        bonifici=bonifici,
        totale_incassi=totale,
        mance=mance,
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
    - i giorni marcati come CHIUSI (o mercoledì con 0) non rientrano in medie/totali.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

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
                corrispettivi_tot,
                contanti_finali,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                totale_incassi,
                cash_diff,
                note,
                COALESCE(is_closed, 0) AS is_closed
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
                pos_bpm=0.0,
                pos_sella=0.0,
                theforkpay=0.0,
                other_e_payments=0.0,
                bonifici=0.0,
                totale_incassi=0.0,
                mance=0.0,
            ),
            alerts=[],
        )

    # Filtra giorni "aperti" (non chiusi)
    open_rows = [r for r in rows if not _is_effectively_closed(r)]
    giorni_con_chiusura = len(open_rows)

    totale_corr = sum(_nz(r["corrispettivi"]) for r in open_rows)
    totale_iva_10 = sum(_nz(r["iva_10"]) for r in open_rows)
    totale_iva_22 = sum(_nz(r["iva_22"]) for r in open_rows)
    totale_fatture = sum(_nz(r["fatture"]) for r in open_rows)
    totale_incassi = sum(_nz(r["totale_incassi"]) for r in open_rows)

    media_corr = totale_corr / giorni_con_chiusura if giorni_con_chiusura else 0.0
    media_inc = totale_incassi / giorni_con_chiusura if giorni_con_chiusura else 0.0

    giorni_list: List[MonthlyDay] = []
    for r in rows:
        is_closed_eff = _is_effectively_closed(r)
        giorni_list.append(
            MonthlyDay(
                date=datetime.strptime(r["date"], "%Y-%m-%d").date(),
                weekday=r["weekday"],
                corrispettivi=_nz(r["corrispettivi"]),
                totale_incassi=_nz(r["totale_incassi"]),
                cash_diff=_nz(r["cash_diff"]),
                is_closed=is_closed_eff,
            )
        )

    pagamenti = _build_payment_breakdown(open_rows)

    alerts: List[Alert] = []
    for r in open_rows:
        diff = _nz(r["cash_diff"])
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
    ensure_daily_closures_table(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
                weekday,
                corrispettivi,
                fatture,
                totale_incassi,
                COALESCE(is_closed, 0) AS is_closed
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

    # Considera solo giorni "aperti" per totali e medie
    open_rows = [r for r in rows if not _is_effectively_closed(r)]

    if not open_rows:
        return AnnualStats(
            year=year,
            totale_corrispettivi=0.0,
            totale_incassi=0.0,
            totale_fatture=0.0,
            mesi=[],
        )

    # Totali anno
    totale_corr = sum(_nz(r["corrispettivi"]) for r in open_rows)
    totale_inc = sum(_nz(r["totale_incassi"]) for r in open_rows)
    totale_fatt = sum(_nz(r["fatture"]) for r in open_rows)

    # Raggruppa per mese (solo giorni aperti)
    monthly_map = {}  # key: month (1..12) -> list of rows
    for r in open_rows:
        d = datetime.strptime(r["date"], "%Y-%m-%d").date()
        m = d.month
        monthly_map.setdefault(m, []).append(r)

    mesi: List[MonthlySummary] = []
    for m in sorted(monthly_map.keys()):
        m_rows = monthly_map[m]
        giorni = len(m_rows)
        m_corr = sum(_nz(r["corrispettivi"]) for r in m_rows)
        m_inc = sum(_nz(r["totale_incassi"]) for r in m_rows)
        m_fatt = sum(_nz(r["fatture"]) for r in m_rows)
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
    I giorni chiusi non rientrano in totali/medie.
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
    I giorni di chiusura (manuali o mercoledì a 0) vengono esclusi.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
                weekday,
                totale_incassi,
                corrispettivi,
                cash_diff,
                COALESCE(is_closed, 0) AS is_closed
            FROM daily_closures
            WHERE substr(date, 1, 4) = ?
            """,
            (f"{year:04d}",),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    # Filtra i giorni aperti
    open_rows = [r for r in rows if not _is_effectively_closed(r)]

    # ordina per incassi discendente/ascendente
    best_sorted = sorted(open_rows, key=lambda r: _nz(r["totale_incassi"]), reverse=True)
    worst_sorted = sorted(open_rows, key=lambda r: _nz(r["totale_incassi"]))

    best_rows = best_sorted[:limit]
    worst_rows = worst_sorted[:limit]

    def _rows_to_topdays(rs: List[sqlite3.Row]) -> List[TopDay]:
        return [
            TopDay(
                date=datetime.strptime(r["date"], "%Y-%m-%d").date(),
                weekday=r["weekday"],
                totale_incassi=_nz(r["totale_incassi"]),
                corrispettivi=_nz(r["corrispettivi"]),
                cash_diff=_nz(r["cash_diff"]),
            )
            for r in rs
        ]

    return TopDaysStats(
        year=year,
        top_best=_rows_to_topdays(best_rows),
        top_worst=_rows_to_topdays(worst_rows),
    )