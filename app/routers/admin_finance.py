# app/routers/admin_finance.py
# @version: v1.6

from datetime import date as date_type, datetime
from pathlib import Path
import shutil
import sqlite3
import uuid
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

# 🔄 IMPORT MULTI-ANNO CORRISPETTIVI
from app.services.corrispettivi_import import (
    DB_PATH,
    ensure_table,
    import_df_into_db,
    load_corrispettivi_from_excel,
)
from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/admin/finance",
    tags=["admin-finance"],
    dependencies=[Depends(get_current_user)],
)

UPLOAD_DIR = Path("app/data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------
# MIGRAZIONE / SCHEMA DAILY_CLOSURES
# ---------------------------------------------------------

def ensure_daily_closures_table(conn: sqlite3.Connection) -> None:
    """
    Garantisce che la tabella daily_closures esista e sia allineata allo schema
    definito in app.services.corrispettivi_import.ensure_table().
    """
    ensure_table(conn)
    # In futuro, se servono migrazioni aggiuntive, si gestiscono qui.


# ---------------------------------------------------------
# MODELLI Pydantic - BASE
# ---------------------------------------------------------

class ImportResult(BaseModel):
    status: str
    year: str   # "archivio" oppure "2025", "2026", ...
    inserted: int = 0
    updated: int = 0


class DailyClosureBase(BaseModel):
    date: date_type

    # Fiscale
    corrispettivi: float
    iva_10: float = 0
    iva_22: float = 0
    fatture: float = 0

    # Incassi (solo incassi reali, SENZA mance)
    contanti_finali: float = 0
    pos_bpm: float = 0
    pos_sella: float = 0
    theforkpay: float = 0
    other_e_payments: float = 0   # PayPal + Stripe
    bonifici: float = 0

    # Mance (separate)
    mance: float = 0

    note: Optional[str] = None
    is_closed: bool = False


class DailyClosureOut(DailyClosureBase):
    weekday: str
    corrispettivi_tot: float
    totale_incassi: float
    cash_diff: float


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
    mance: float
    totale_incassi: float  # solo incassi reali (senza mance)


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

    - year = "archivio"  -> usa il foglio 'archivio', importa tutte le date.
    - year = "2025"      -> usa il foglio '2025' (o equivalente) e filtra l'anno 2025.
    """
    filename = (file.filename or "").lower()

    if not filename.endswith((".xlsb", ".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato file non supportato. Usa .xlsb / .xlsx / .xls",
        )

    tmp_name = f"{uuid.uuid4().hex}_{file.filename}"
    tmp_path = UPLOAD_DIR / tmp_name

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
    ensure_daily_closures_table(conn)

    try:
        inserted, updated = import_df_into_db(
            df,
            conn,
            created_by="admin-finance",
        )
    except Exception as e:
        conn.close()
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Errore durante l'import nel database: {e}",
        )

    conn.close()
    tmp_path.unlink(missing_ok=True)

    return ImportResult(
        status="ok",
        year=year,
        inserted=inserted,
        updated=updated,
    )# ---------------------------------------------------------
# DAILY CLOSURES: LETTURA PER DATA
# ---------------------------------------------------------

@router.get("/daily-closures/{date_str}", response_model=DailyClosureOut)
async def get_daily_closure(
    date_str: str,
):
    """
    Restituisce la chiusura cassa per una data (YYYY-MM-DD).
    Usato dal modulo CorrispettiviGestione.jsx e dalla nuova pagina calendario.
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

    return DailyClosureOut(
        date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
        weekday=row["weekday"],
        corrispettivi=row["corrispettivi"],
        iva_10=row["iva_10"],
        iva_22=row["iva_22"],
        fatture=row["fatture"],
        corrispettivi_tot=row["corrispettivi_tot"],
        contanti_finali=row["contanti_finali"],
        pos_bpm=row["pos_bpm"],
        pos_sella=row["pos_sella"],
        theforkpay=row["theforkpay"],
        other_e_payments=row["other_e_payments"],
        bonifici=row["bonifici"],
        mance=row["mance"],
        note=row["note"],
        is_closed=bool(row["is_closed"]),
        totale_incassi=row["totale_incassi"],
        cash_diff=row["cash_diff"],
    )


# ---------------------------------------------------------
# DAILY CLOSURES: INSERIMENTO / UPDATE MANUALE
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

    # corrispettivi_tot = corrispettivi + fatture
    corrispettivi_tot = payload.corrispettivi + payload.fatture

    # totale_incassi: SOLO incassi reali (senza mance)
    totale_incassi = (
        payload.contanti_finali
        + payload.pos_bpm
        + payload.pos_sella
        + payload.theforkpay
        + payload.other_e_payments
        + payload.bonifici
    )

    cash_diff = totale_incassi - corrispettivi_tot
    weekday = payload.date.strftime("%A")  # TODO: italianizzare in futuro

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
                    payload.corrispettivi,
                    payload.iva_10,
                    payload.iva_22,
                    payload.fatture,
                    corrispettivi_tot,
                    payload.contanti_finali,
                    payload.pos_bpm,
                    payload.pos_sella,
                    payload.theforkpay,
                    payload.other_e_payments,
                    payload.bonifici,
                    payload.mance,
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str,
                    weekday,
                    payload.corrispettivi,
                    payload.iva_10,
                    payload.iva_22,
                    payload.fatture,
                    corrispettivi_tot,
                    payload.contanti_finali,
                    payload.pos_bpm,
                    payload.pos_sella,
                    payload.theforkpay,
                    payload.other_e_payments,
                    payload.bonifici,
                    payload.mance,
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

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Errore interno: chiusura non trovata dopo il salvataggio.",
        )

    return DailyClosureOut(
        date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
        weekday=row["weekday"],
        corrispettivi=row["corrispettivi"],
        iva_10=row["iva_10"],
        iva_22=row["iva_22"],
        fatture=row["fatture"],
        corrispettivi_tot=row["corrispettivi_tot"],
        contanti_finali=row["contanti_finali"],
        pos_bpm=row["pos_bpm"],
        pos_sella=row["pos_sella"],
        theforkpay=row["theforkpay"],
        other_e_payments=row["other_e_payments"],
        bonifici=row["bonifici"],
        mance=row["mance"],
        note=row["note"],
        is_closed=bool(row["is_closed"]),
        totale_incassi=row["totale_incassi"],
        cash_diff=row["cash_diff"],
    )


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

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Errore interno: chiusura non trovata dopo set-closed.",
        )

    return DailyClosureOut(
        date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
        weekday=row["weekday"],
        corrispettivi=row["corrispettivi"],
        iva_10=row["iva_10"],
        iva_22=row["iva_22"],
        fatture=row["fatture"],
        corrispettivi_tot=row["corrispettivi_tot"],
        contanti_finali=row["contanti_finali"],
        pos_bpm=row["pos_bpm"],
        pos_sella=row["pos_sella"],
        theforkpay=row["theforkpay"],
        other_e_payments=row["other_e_payments"],
        bonifici=row["bonifici"],
        mance=row["mance"],
        note=row["note"],
        is_closed=bool(row["is_closed"]),
        totale_incassi=row["totale_incassi"],
        cash_diff=row["cash_diff"],
    )


# ---------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------

WEEKDAY_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]


# ---------------------------------------------------------
# HELPER INTERNO: aggregazione shift_closures per data
# ---------------------------------------------------------

def _aggregate_shift_closures_by_date(conn: sqlite3.Connection, ym_prefix: str) -> Dict[str, dict]:
    """
    Legge i dati da shift_closures (per-turno) per il mese specificato,
    aggrega per data, e ritorna un dict keyed by date string con valori
    compatibili con il dashboard.

    Per ogni data:
    - Se esiste 'cena': usa i valori giornalieri di cena (contanti, pos_*, etc., preconto)
    - Se esiste solo 'pranzo': usa i valori di pranzo
    - Somma fatture (pranzo + cena) per avere il totale giornaliero
    - Calcola corrispettivi_tot = chiusura_giorno + fatture_totali
    - Calcola totale_incassi = contanti + pos_bpm + pos_sella + thefork + other_e + bonifici (giornaliero)
    - Calcola cash_diff = totale_incassi - corrispettivi_tot
    - Aggrega preconti e spese da entrambi i turni

    Ritorna:
        dict keyed by date (str YYYY-MM-DD) con ogni valore being a dict con i campi:
        {
            'date': str,
            'weekday': str,
            'corrispettivi': float,
            'corrispettivi_tot': float,
            'fatture': float,
            'contanti_finali': float,
            'pos_bpm': float,
            'pos_sella': float,
            'theforkpay': float,
            'other_e_payments': float,
            'bonifici': float,
            'mance': float,
            'totale_incassi': float,
            'cash_diff': float,
            'iva_10': float,
            'iva_22': float,
            'note': str,
            'is_closed': bool,
        }
    """
    result = {}

    try:
        cur = conn.cursor()

        # Leggi shift_closures per il mese
        cur.execute(
            """
            SELECT
                date,
                turno,
                preconto,
                fatture,
                contanti,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                note
            FROM shift_closures
            WHERE substr(date, 1, 7) = ?
            ORDER BY date ASC,
                     CASE WHEN turno = 'pranzo' THEN 0 ELSE 1 END
            """,
            (ym_prefix,),
        )
        shift_rows = cur.fetchall()

        if not shift_rows:
            return result

        # Raggruppa per data
        by_date: Dict[str, list] = {}
        for r in shift_rows:
            date_str = r["date"]
            by_date.setdefault(date_str, []).append(r)

        # Per ogni data, aggrega i due turni
        for date_str, turni_rows in by_date.items():
            # Estrai dati per pranzo e cena (se esistono)
            pranzo = None
            cena = None

            for row in turni_rows:
                if row["turno"] == "pranzo":
                    pranzo = row
                elif row["turno"] == "cena":
                    cena = row

            # Determina il giorno della settimana
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            weekday_idx = d.weekday()  # 0=lunedì, 6=domenica
            weekday_it = WEEKDAY_IT[weekday_idx]

            # Scegli la base per i campi giornalieri (contanti, pos_*, etc.)
            # Se esiste cena, usa cena (dati giornalieri); altrimenti usa pranzo
            if cena:
                giornaliero = cena
                chiusura_giorno = cena["preconto"]
                contanti = cena["contanti"]
                pos_bpm = cena["pos_bpm"]
                pos_sella = cena["pos_sella"]
                theforkpay = cena["theforkpay"]
                other_e = cena["other_e_payments"]
                bonifici = cena["bonifici"]
                mance = cena["mance"]
            else:
                giornaliero = pranzo
                chiusura_giorno = pranzo["preconto"]
                contanti = pranzo["contanti"]
                pos_bpm = pranzo["pos_bpm"]
                pos_sella = pranzo["pos_sella"]
                theforkpay = pranzo["theforkpay"]
                other_e = pranzo["other_e_payments"]
                bonifici = pranzo["bonifici"]
                mance = pranzo["mance"]

            # Somma fatture (pranzo + cena)
            fatture_totali = 0.0
            if pranzo:
                fatture_totali += pranzo["fatture"]
            if cena:
                fatture_totali += cena["fatture"]

            # Calcoli
            corrispettivi_tot = chiusura_giorno + fatture_totali
            totale_incassi = contanti + pos_bpm + pos_sella + theforkpay + other_e + bonifici
            cash_diff = totale_incassi - corrispettivi_tot

            # Nota: concatena note da entrambi i turni se presenti
            note_list = []
            if pranzo and pranzo["note"]:
                note_list.append(f"Pranzo: {pranzo['note']}")
            if cena and cena["note"]:
                note_list.append(f"Cena: {cena['note']}")
            note_combined = " | ".join(note_list) if note_list else ""

            result[date_str] = {
                'date': date_str,
                'weekday': weekday_it,
                'corrispettivi': chiusura_giorno,  # La chiusura RT
                'corrispettivi_tot': corrispettivi_tot,
                'fatture': fatture_totali,
                'contanti_finali': contanti,
                'pos_bpm': pos_bpm,
                'pos_sella': pos_sella,
                'theforkpay': theforkpay,
                'other_e_payments': other_e,
                'bonifici': bonifici,
                'mance': mance,
                'totale_incassi': totale_incassi,
                'cash_diff': cash_diff,
                'iva_10': 0.0,  # shift_closures non ha IVA separata
                'iva_22': 0.0,
                'note': note_combined,
                'is_closed': False,  # I dati shift_closures indicano giorni aperti
            }
    except Exception:
        # Se shift_closures non esiste o c'è errore, ritorna dict vuoto (fallback a daily_closures)
        pass

    return result


# ---------------------------------------------------------
# HELPER INTERNO: configurazione chiusure
# ---------------------------------------------------------

def _get_closures_config():
    """Carica configurazione chiusure da closures_config.json."""
    try:
        from app.routers.closures_config_router import get_closures_config
        return get_closures_config()
    except Exception:
        return {"giorno_chiusura_settimanale": 2, "giorni_chiusi": []}


# Mappa nomi giorno (italiano/inglese) → indice ISO (0=Lun..6=Dom)
_WEEKDAY_TO_IDX = {
    "Monday": 0, "Lunedì": 0,
    "Tuesday": 1, "Martedì": 1,
    "Wednesday": 2, "Mercoledì": 2,
    "Thursday": 3, "Giovedì": 3,
    "Friday": 4, "Venerdì": 4,
    "Saturday": 5, "Sabato": 5,
    "Sunday": 6, "Domenica": 6,
}


# ---------------------------------------------------------
# HELPER INTERNO: chiusura "effettiva" (configurabile)
# ---------------------------------------------------------

def _is_effectively_closed(row: sqlite3.Row) -> bool:
    """
    Ritorna True se il giorno va considerato chiuso ai fini delle medie/statistiche.

    Regola:
    - se is_closed == 1 (flag manuale nel DB) -> SEMPRE chiuso (priorità massima)
    - se ci sono dati reali (corrispettivi > 0 o incassi > 0) -> MAI chiuso
      (una chiusura turno inserita ha priorità sulle impostazioni)
    - se la data è nei giorni_chiusi configurati (ferie/festivi) -> chiuso
    - se è il giorno di chiusura settimanale configurato -> chiuso
    """
    keys = set(row.keys())

    # flag manuale nel DB → priorità assoluta
    is_closed_flag = row["is_closed"] if "is_closed" in keys else 0
    if is_closed_flag:
        return True

    # Se ci sono dati reali, la chiusura turno vince sulle impostazioni
    if "corrispettivi" in keys:
        corr = row["corrispettivi"] or 0
    elif "corrispettivi_tot" in keys:
        corr = row["corrispettivi_tot"] or 0
    else:
        corr = 0.0

    tot_inc = (row["totale_incassi"] if "totale_incassi" in keys else 0) or 0

    if corr > 0 or tot_inc > 0:
        return False  # Ha dati reali → aperto, a prescindere dalle impostazioni

    config = _get_closures_config()

    # Check data specifica (ferie, festivi) — solo se non ci sono dati
    date_str = row["date"] if "date" in keys else ""
    if date_str and date_str in config.get("giorni_chiusi", []):
        return True

    # Check giorno settimanale di chiusura — solo se non ci sono dati
    giorno_chiusura = config.get("giorno_chiusura_settimanale")
    if giorno_chiusura is not None:
        weekday = row["weekday"] if "weekday" in keys else ""
        weekday_idx = _WEEKDAY_TO_IDX.get(weekday)
        if weekday_idx == giorno_chiusura:
            return True  # Nessun dato + giorno di chiusura → chiuso

    return False
    # ---------------------------------------------------------
# HELPER INTERNO: costruisce PaymentBreakdown da righe SQL
# ---------------------------------------------------------

def _build_payment_breakdown(rows: List[sqlite3.Row]) -> PaymentBreakdown:
    contanti = sum(r["contanti_finali"] for r in rows)
    pos_bpm = sum(r["pos_bpm"] for r in rows)
    pos_sella = sum(r["pos_sella"] for r in rows)
    theforkpay = sum(r["theforkpay"] for r in rows)
    other_e = sum(r["other_e_payments"] for r in rows)
    bonifici = sum(r["bonifici"] for r in rows)
    mance = sum(r["mance"] for r in rows)

    # totale_incassi coerente con campo daily_closures.totale_incassi (senza mance)
    totale = contanti + pos_bpm + pos_sella + theforkpay + other_e + bonifici

    return PaymentBreakdown(
        contanti_finali=contanti,
        pos_bpm=pos_bpm,
        pos_sella=pos_sella,
        theforkpay=theforkpay,
        other_e_payments=other_e,
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
    - i giorni marcati come CHIUSI (o mercoledì con 0) non rientrano in medie/totali.

    Legge primarily da shift_closures (per-turno aggregata per data),
    con fallback a daily_closures per date che non hanno shift data.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

    ym_prefix = f"{year:04d}-{month:02d}"

    try:
        # Primo: leggi shift_closures aggregati per data
        shift_data = _aggregate_shift_closures_by_date(conn, ym_prefix)

        # Secondo: leggi daily_closures per il mese
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
        daily_rows = cur.fetchall()
    finally:
        conn.close()

    # Merge: crea una mappa unificata (shift_closures primary, daily_closures fallback)
    merged_data: Dict[str, dict] = {}

    # Aggiungi shift_closures (primary)
    for date_str, shift_dict in shift_data.items():
        merged_data[date_str] = shift_dict

    # Aggiungi daily_closures solo per date che non hanno shift_closures (fallback)
    for r in daily_rows:
        date_str = r["date"]
        if date_str not in merged_data:
            merged_data[date_str] = {
                'date': date_str,
                'weekday': r["weekday"],
                'corrispettivi': r["corrispettivi"],
                'corrispettivi_tot': r["corrispettivi_tot"],
                'fatture': r["fatture"],
                'contanti_finali': r["contanti_finali"],
                'pos_bpm': r["pos_bpm"],
                'pos_sella': r["pos_sella"],
                'theforkpay': r["theforkpay"],
                'other_e_payments': r["other_e_payments"],
                'bonifici': r["bonifici"],
                'mance': r["mance"],
                'totale_incassi': r["totale_incassi"],
                'cash_diff': r["cash_diff"],
                'iva_10': r["iva_10"],
                'iva_22': r["iva_22"],
                'note': r["note"] or "",
                'is_closed': bool(r["is_closed"]),
            }

    if not merged_data:
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
                mance=0.0,
                totale_incassi=0.0,
            ),
            alerts=[],
        )

    # Converte merged_data in formato compatibile con la logica esistente
    # Crea liste di Row-like objects per il filtro _is_effectively_closed
    class DictRow:
        def __init__(self, d):
            self._dict = d
        def __getitem__(self, key):
            return self._dict[key]
        def keys(self):
            return self._dict.keys()

    rows = [DictRow(d) for d in sorted(merged_data.values(), key=lambda x: x['date'])]

    # Filtra giorni "aperti" (non chiusi)
    open_rows = [r for r in rows if not _is_effectively_closed(r)]
    giorni_con_chiusura = len(open_rows)

    totale_corr = sum(r["corrispettivi_tot"] for r in open_rows)
    totale_iva_10 = sum(r["iva_10"] for r in open_rows)
    totale_iva_22 = sum(r["iva_22"] for r in open_rows)
    totale_fatture = sum(r["fatture"] for r in open_rows)
    totale_incassi = sum(r["totale_incassi"] for r in open_rows)

    media_corr = totale_corr / giorni_con_chiusura if giorni_con_chiusura else 0.0
    media_inc = totale_incassi / giorni_con_chiusura if giorni_con_chiusura else 0.0

    giorni_list: List[MonthlyDay] = []
    for r in rows:
        is_closed_eff = _is_effectively_closed(r)
        giorni_list.append(
            MonthlyDay(
                date=datetime.strptime(r["date"], "%Y-%m-%d").date(),
                weekday=r["weekday"],
                corrispettivi=r["corrispettivi_tot"],
                totale_incassi=r["totale_incassi"],
                cash_diff=r["cash_diff"],
                is_closed=is_closed_eff,
            )
        )

    pagamenti = _build_payment_breakdown(open_rows)

    alerts: List[Alert] = []
    for r in open_rows:
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
    """
    Legge shift_closures (primary) e daily_closures (fallback) per l'anno,
    aggrega per mese e ritorna AnnualStats.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

    year_prefix = f"{year:04d}"
    merged_data: Dict[str, dict] = {}

    try:
        # Leggi tutti gli 12 mesi dell'anno da shift_closures
        for month in range(1, 13):
            ym_prefix = f"{year:04d}-{month:02d}"
            shift_data = _aggregate_shift_closures_by_date(conn, ym_prefix)
            merged_data.update(shift_data)

        # Leggi daily_closures per l'anno (fallback)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
                weekday,
                corrispettivi_tot,
                fatture,
                totale_incassi,
                COALESCE(is_closed, 0) AS is_closed
            FROM daily_closures
            WHERE substr(date, 1, 4) = ?
            ORDER BY date ASC
            """,
            (year_prefix,),
        )
        daily_rows = cur.fetchall()

        # Aggiungi daily_closures (fallback per date senza shift_closures)
        for r in daily_rows:
            date_str = r["date"]
            if date_str not in merged_data:
                merged_data[date_str] = {
                    'date': date_str,
                    'weekday': r["weekday"],
                    'corrispettivi_tot': r["corrispettivi_tot"],
                    'fatture': r["fatture"],
                    'totale_incassi': r["totale_incassi"],
                    'is_closed': bool(r["is_closed"]),
                }
    finally:
        conn.close()

    if not merged_data:
        return AnnualStats(
            year=year,
            totale_corrispettivi=0.0,
            totale_incassi=0.0,
            totale_fatture=0.0,
            mesi=[],
        )

    # Converte merged_data in formato compatibile
    class DictRow:
        def __init__(self, d):
            self._dict = d
        def __getitem__(self, key):
            return self._dict[key]
        def keys(self):
            return self._dict.keys()

    rows = [DictRow(d) for d in sorted(merged_data.values(), key=lambda x: x['date'])]

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
    totale_corr = sum(r["corrispettivi_tot"] for r in open_rows)
    totale_inc = sum(r["totale_incassi"] for r in open_rows)
    totale_fatt = sum(r["fatture"] for r in open_rows)

    # Raggruppa per mese (solo giorni aperti)
    monthly_map: dict[int, list] = {}
    for r in open_rows:
        d = datetime.strptime(r["date"], "%Y-%m-%d").date()
        m = d.month
        monthly_map.setdefault(m, []).append(r)

    mesi: List[MonthlySummary] = []
    for m in sorted(monthly_map.keys()):
        m_rows = monthly_map[m]
        giorni = len(m_rows)
        m_corr = sum(r["corrispettivi_tot"] for r in m_rows)
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

    Legge da shift_closures (primary) con fallback a daily_closures.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_daily_closures_table(conn)

    year_prefix = f"{year:04d}"
    merged_data: Dict[str, dict] = {}

    try:
        # Leggi tutti gli 12 mesi dell'anno da shift_closures
        for month in range(1, 13):
            ym_prefix = f"{year:04d}-{month:02d}"
            shift_data = _aggregate_shift_closures_by_date(conn, ym_prefix)
            merged_data.update(shift_data)

        # Leggi daily_closures per l'anno (fallback)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                date,
                weekday,
                totale_incassi,
                corrispettivi_tot,
                cash_diff,
                COALESCE(is_closed, 0) AS is_closed
            FROM daily_closures
            WHERE substr(date, 1, 4) = ?
            """,
            (year_prefix,),
        )
        daily_rows = cur.fetchall()

        # Aggiungi daily_closures (fallback per date senza shift_closures)
        for r in daily_rows:
            date_str = r["date"]
            if date_str not in merged_data:
                merged_data[date_str] = {
                    'date': date_str,
                    'weekday': r["weekday"],
                    'totale_incassi': r["totale_incassi"],
                    'corrispettivi_tot': r["corrispettivi_tot"],
                    'cash_diff': r["cash_diff"],
                    'is_closed': bool(r["is_closed"]),
                }
    finally:
        conn.close()

    # Converte merged_data in formato compatibile
    class DictRow:
        def __init__(self, d):
            self._dict = d
        def __getitem__(self, key):
            return self._dict[key]
        def keys(self):
            return self._dict.keys()

    rows = [DictRow(d) for d in merged_data.values()]

    # Filtra i giorni aperti usando la logica unica
    open_rows = [r for r in rows if not _is_effectively_closed(r)]

    # ordina per incassi discendente/ascendente
    best_sorted = sorted(open_rows, key=lambda r: r["totale_incassi"], reverse=True)
    worst_sorted = sorted(open_rows, key=lambda r: r["totale_incassi"])

    best_rows = best_sorted[:limit]
    worst_rows = worst_sorted[:limit]

    def _rows_to_topdays(rs: List) -> List[TopDay]:
        return [
            TopDay(
                date=datetime.strptime(r["date"], "%Y-%m-%d").date(),
                weekday=r["weekday"],
                totale_incassi=r["totale_incassi"],
                corrispettivi=r["corrispettivi_tot"],
                cash_diff=r["cash_diff"],
            )
            for r in rs
        ]

    return TopDaysStats(
        year=year,
        top_best=_rows_to_topdays(best_rows),
        top_worst=_rows_to_topdays(worst_rows),
    )