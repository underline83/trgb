# app/routers/chiusure_turno.py
# Shift closures (fine turno pranzo/cena) at restaurant Osteria Tre Gobbi
# @version: v1.0

from datetime import date as date_type, datetime
from pathlib import Path
import sqlite3
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user

# ---------------------------------------------------------
# DATABASE
# ---------------------------------------------------------

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "admin_finance.sqlite3"


def ensure_shift_closures_tables(conn: sqlite3.Connection) -> None:
    """
    Ensures that all shift closures tables exist and are properly initialized.
    """
    cur = conn.cursor()

    # Table: shift_closures
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shift_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            turno TEXT NOT NULL CHECK (turno IN ('pranzo', 'cena')),
            fondo_cassa_inizio REAL DEFAULT 0,
            fondo_cassa_fine REAL DEFAULT 0,
            contanti REAL DEFAULT 0,
            pos_bpm REAL DEFAULT 0,
            pos_sella REAL DEFAULT 0,
            theforkpay REAL DEFAULT 0,
            other_e_payments REAL DEFAULT 0,
            bonifici REAL DEFAULT 0,
            mance REAL DEFAULT 0,
            preconto REAL DEFAULT 0,
            fatture REAL DEFAULT 0,
            coperti INTEGER DEFAULT 0,
            totale_incassi REAL DEFAULT 0,
            note TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT,
            UNIQUE(date, turno)
        )
        """
    )

    # Table: shift_checklist_config
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shift_checklist_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            turno TEXT NOT NULL CHECK (turno IN ('pranzo', 'cena', 'entrambi')),
            label TEXT NOT NULL,
            ordine INTEGER DEFAULT 0,
            attivo INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # Table: shift_checklist_responses
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shift_checklist_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shift_closure_id INTEGER NOT NULL,
            checklist_item_id INTEGER NOT NULL,
            checked INTEGER DEFAULT 0,
            note TEXT,
            FOREIGN KEY (shift_closure_id) REFERENCES shift_closures(id),
            FOREIGN KEY (checklist_item_id) REFERENCES shift_checklist_config(id),
            UNIQUE(shift_closure_id, checklist_item_id)
        )
        """
    )

    # Migration: add fondo_cassa columns if missing
    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(shift_closures)").fetchall()}
    if "fondo_cassa_inizio" not in existing_cols:
        cur.execute("ALTER TABLE shift_closures ADD COLUMN fondo_cassa_inizio REAL DEFAULT 0")
    if "fondo_cassa_fine" not in existing_cols:
        cur.execute("ALTER TABLE shift_closures ADD COLUMN fondo_cassa_fine REAL DEFAULT 0")

    # Table: shift_preconti (tavoli aperti non battuti)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shift_preconti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shift_closure_id INTEGER NOT NULL,
            tavolo TEXT NOT NULL,
            importo REAL DEFAULT 0,
            FOREIGN KEY (shift_closure_id) REFERENCES shift_closures(id)
        )
        """
    )

    # Table: shift_spese (spese del turno: scontrini, fatture, spese personale)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shift_spese (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shift_closure_id INTEGER NOT NULL,
            tipo TEXT NOT NULL CHECK (tipo IN ('scontrino', 'fattura', 'personale', 'altro')),
            descrizione TEXT NOT NULL,
            importo REAL DEFAULT 0,
            FOREIGN KEY (shift_closure_id) REFERENCES shift_closures(id)
        )
        """
    )

    conn.commit()


# ---------------------------------------------------------
# ROUTER SETUP
# ---------------------------------------------------------

router = APIRouter(
    prefix="/admin/finance/shift-closures",
    tags=["shift-closures"],
    dependencies=[Depends(get_current_user)],
)


# ---------------------------------------------------------
# PYDANTIC MODELS
# ---------------------------------------------------------


class ChecklistItemBase(BaseModel):
    turno: str = Field(..., pattern="^(pranzo|cena|entrambi)$")
    label: str
    ordine: int = 0
    attivo: int = 1


class ChecklistItemOut(ChecklistItemBase):
    id: int
    created_at: str


class PrecontoBase(BaseModel):
    tavolo: str
    importo: float = 0


class PrecontoOut(PrecontoBase):
    id: int
    shift_closure_id: int


class SpesaBase(BaseModel):
    tipo: str = Field(..., pattern="^(scontrino|fattura|personale|altro)$")
    descrizione: str
    importo: float = Field(default=0, ge=0)


class SpesaOut(BaseModel):
    """Output model — nessun vincolo ge=0 per non rompere dati storici."""
    id: int
    shift_closure_id: int
    tipo: str
    descrizione: str
    importo: float = 0


class ChecklistResponseBase(BaseModel):
    checklist_item_id: int
    checked: int = 0
    note: Optional[str] = None


class ChecklistResponseOut(ChecklistResponseBase):
    id: int
    shift_closure_id: int


class ShiftClosureBase(BaseModel):
    date: date_type
    turno: str = Field(..., pattern="^(pranzo|cena)$")
    fondo_cassa_inizio: float = 0
    fondo_cassa_fine: float = 0
    contanti: float = 0
    pos_bpm: float = 0
    pos_sella: float = 0
    theforkpay: float = 0
    other_e_payments: float = 0
    bonifici: float = 0
    mance: float = 0
    preconto: float = 0
    fatture: float = 0
    coperti: int = 0
    note: Optional[str] = None


class ShiftClosureIn(ShiftClosureBase):
    checklist: Optional[List[ChecklistResponseBase]] = None
    preconti: Optional[List[PrecontoBase]] = None
    spese: Optional[List[SpesaBase]] = None


class ShiftClosureOut(ShiftClosureBase):
    id: int
    totale_incassi: float
    created_by: str
    created_at: str
    updated_at: Optional[str] = None
    checklist: List[ChecklistResponseOut] = []
    preconti: List[PrecontoOut] = []
    spese: List[SpesaOut] = []
    # Quadratura pre-calcolata dal backend (evita ricalcolo client-side)
    saldo: Optional[float] = None
    diff_grezzo: Optional[float] = None
    spese_giorno: Optional[float] = None


# ---------------------------------------------------------
# HELPER: ROLE VALIDATION
# ---------------------------------------------------------


def check_allowed_role(current_user: dict) -> None:
    """
    Verifies that the current user has an allowed role for shift closure submission.
    Allowed roles: admin, sommelier, sala
    NOT allowed: viewer, chef
    """
    allowed_roles = {"superadmin", "admin", "sommelier", "sala"}
    user_role = current_user.get("role")

    if user_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user_role}' not allowed to submit shift closures. Allowed roles: {', '.join(allowed_roles)}",
        )


# ---------------------------------------------------------
# SHIFT CLOSURES ENDPOINTS
# ---------------------------------------------------------


# ---------------------------------------------------------
# PRE-CONTI ADMIN — storico per controllo
# (DEVE stare PRIMA di /{date}/{turno} per evitare conflitto route)
# ---------------------------------------------------------

@router.get("/preconti", summary="Lista storica pre-conti (superadmin)")
async def list_preconti(
    date_from: Optional[str] = Query(None, description="Data inizio YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="Data fine YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    """
    Restituisce tutti i pre-conti con data, turno, tavolo, importo e chi ha inserito la chiusura.
    Solo superadmin.
    """
    from app.services.auth_service import is_superadmin
    if not is_superadmin(current_user.get("role", "")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo il super-admin può accedere ai pre-conti.",
        )

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        query = """
            SELECT
                sc.date, sc.turno, sc.created_by,
                sp.tavolo, sp.importo
            FROM shift_preconti sp
            JOIN shift_closures sc ON sp.shift_closure_id = sc.id
            WHERE 1=1
        """
        params = []
        if date_from:
            query += " AND sc.date >= ?"
            params.append(date_from)
        if date_to:
            query += " AND sc.date <= ?"
            params.append(date_to)
        query += " ORDER BY sc.date DESC, sc.turno, sp.tavolo"

        rows = conn.execute(query, params).fetchall()

        result = []
        totale = 0.0
        for r in rows:
            importo = r["importo"] or 0
            totale += importo
            result.append({
                "date": r["date"],
                "turno": r["turno"],
                "tavolo": r["tavolo"],
                "importo": importo,
                "created_by": r["created_by"],
            })

        return {"preconti": result, "totale": round(totale, 2), "count": len(result)}

    finally:
        conn.close()


@router.get("/spese", summary="Lista storica spese dai fine turno (superadmin)")
async def list_spese(
    date_from: Optional[str] = Query(None, description="Data inizio YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="Data fine YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    """
    Restituisce tutte le spese registrate nei fine turno con data, turno, tipo, descrizione, importo.
    Solo superadmin.
    """
    from app.services.auth_service import is_superadmin
    if not is_superadmin(current_user.get("role", "")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo il super-admin può accedere alle spese.",
        )

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        query = """
            SELECT
                sc.date, sc.turno, sc.created_by,
                ss.tipo, ss.descrizione, ss.importo
            FROM shift_spese ss
            JOIN shift_closures sc ON ss.shift_closure_id = sc.id
            WHERE 1=1
        """
        params = []
        if date_from:
            query += " AND sc.date >= ?"
            params.append(date_from)
        if date_to:
            query += " AND sc.date <= ?"
            params.append(date_to)
        query += " ORDER BY sc.date DESC, sc.turno, ss.tipo, ss.id"

        rows = conn.execute(query, params).fetchall()

        result = []
        totale = 0.0
        totale_per_tipo = {}
        for r in rows:
            importo = r["importo"] or 0
            totale += importo
            tipo = r["tipo"] or "altro"
            totale_per_tipo[tipo] = totale_per_tipo.get(tipo, 0) + importo
            result.append({
                "date": r["date"],
                "turno": r["turno"],
                "tipo": tipo,
                "descrizione": r["descrizione"],
                "importo": importo,
                "created_by": r["created_by"],
            })

        return {
            "spese": result,
            "totale": round(totale, 2),
            "count": len(result),
            "totale_per_tipo": {k: round(v, 2) for k, v in totale_per_tipo.items()},
        }

    finally:
        conn.close()


# ---------------------------------------------------------
# STATISTICHE COPERTI & INCASSI — aggregato giornaliero
# ---------------------------------------------------------

@router.get("/stats/daily", summary="Statistiche giornaliere coperti e incassi")
async def stats_daily(
    year: Optional[int] = Query(None, description="Anno (es. 2026)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Mese 1-12"),
    current_user: dict = Depends(get_current_user),
):
    """
    Ritorna statistiche giornaliere aggregate da shift_closures.
    Per ogni giorno: incassato, coperti, media, fatturato pranzo/cena.
    Fatturato = chiusura RT + fatture + preconti (tutto il revenue del turno).
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        # Fetch all closures for the period
        query = """
            SELECT sc.id, sc.date, sc.turno, sc.preconto, sc.fatture, sc.coperti,
                   sc.contanti, sc.pos_bpm, sc.pos_sella, sc.theforkpay,
                   sc.other_e_payments, sc.bonifici, sc.mance,
                   sc.fondo_cassa_inizio, sc.fondo_cassa_fine
            FROM shift_closures sc
            WHERE 1=1
        """
        params = []
        if year:
            query += " AND CAST(substr(sc.date, 1, 4) AS INTEGER) = ?"
            params.append(year)
        if month:
            query += " AND CAST(substr(sc.date, 6, 2) AS INTEGER) = ?"
            params.append(month)
        query += " ORDER BY sc.date ASC, sc.turno ASC"

        rows = conn.execute(query, params).fetchall()

        # Fetch preconti totals per closure
        preconti_query = """
            SELECT shift_closure_id, SUM(importo) AS tot
            FROM shift_preconti
            GROUP BY shift_closure_id
        """
        preconti_map = {}
        for r in conn.execute(preconti_query).fetchall():
            preconti_map[r["shift_closure_id"]] = r["tot"] or 0

        # Group by date
        days = {}
        for r in rows:
            d = r["date"]
            if d not in days:
                days[d] = {"pranzo": None, "cena": None}
            turno = r["turno"]

            preconti_tot = preconti_map.get(r["id"], 0)
            # Fatturato turno = chiusura RT + fatture + preconti
            fatt = (r["preconto"] or 0) + (r["fatture"] or 0) + preconti_tot

            days[d][turno] = {
                "preconto": r["preconto"] or 0,
                "fatture": r["fatture"] or 0,
                "preconti_tot": preconti_tot,
                "fatturato": fatt,
                "coperti": r["coperti"] or 0,
            }

        # Build result
        result = []
        for d in sorted(days.keys()):
            p = days[d]["pranzo"]
            c = days[d]["cena"]

            # A cena, preconto è giornaliero → fatturato cena = cena.fatturato - pranzo.preconto
            if p and c:
                fatt_pranzo = p["fatturato"]
                # Cena fatturato: (C_CHIUSURA - P_CHIUSURA) + C_FATTURE + C_PRECONTI
                fatt_cena = (c["preconto"] - p["preconto"]) + c["fatture"] + c["preconti_tot"]
                incassato = fatt_pranzo + fatt_cena
                coperti_pranzo = p["coperti"]
                coperti_cena = c["coperti"]
            elif p:
                fatt_pranzo = p["fatturato"]
                fatt_cena = 0
                incassato = fatt_pranzo
                coperti_pranzo = p["coperti"]
                coperti_cena = 0
            elif c:
                fatt_pranzo = 0
                # Solo cena senza pranzo: il preconto è il totale
                fatt_cena = c["fatturato"]
                incassato = fatt_cena
                coperti_pranzo = 0
                coperti_cena = c["coperti"]
            else:
                continue

            coperti_totale = coperti_pranzo + coperti_cena
            media = round(incassato / coperti_totale, 2) if coperti_totale > 0 else None
            media_pranzo = round(fatt_pranzo / coperti_pranzo, 2) if coperti_pranzo > 0 else None
            media_cena = round(fatt_cena / coperti_cena, 2) if coperti_cena > 0 else None

            result.append({
                "date": d,
                "incassato": round(incassato, 2),
                "coperti": coperti_totale,
                "media": media,
                "coperti_pranzo": coperti_pranzo,
                "coperti_cena": coperti_cena,
                "fatt_pranzo": round(fatt_pranzo, 2),
                "fatt_cena": round(fatt_cena, 2),
                "media_pranzo": media_pranzo,
                "media_cena": media_cena,
            })

        return {"days": result, "count": len(result)}

    finally:
        conn.close()


# ---------------------------------------------------------
# CHECKLIST CONFIG ENDPOINTS (ADMIN ONLY)
# ---------------------------------------------------------


def check_admin_role(current_user: dict) -> None:
    """Verifies that the current user is an admin or superadmin."""
    from app.services.auth_service import is_admin
    if not is_admin(current_user.get("role", "")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can manage checklist configuration.",
        )


@router.get("/config/all", response_model=List[ChecklistItemOut])
async def get_checklist_config(
    current_user: dict = Depends(get_current_user),
):
    """
    List all checklist configuration items (active and inactive).
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                id,
                turno,
                label,
                ordine,
                attivo,
                created_at
            FROM shift_checklist_config
            ORDER BY turno ASC, ordine ASC
            """
        )
        rows = cur.fetchall()

    finally:
        conn.close()

    return [
        ChecklistItemOut(
            id=row["id"],
            turno=row["turno"],
            label=row["label"],
            ordine=row["ordine"],
            attivo=row["attivo"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.post("/config", response_model=ChecklistItemOut)
async def create_checklist_config(
    payload: ChecklistItemBase,
    current_user: dict = Depends(get_current_user),
):
    """
    Add a new checklist configuration item.
    Admin only.
    """
    check_admin_role(current_user)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO shift_checklist_config (
                turno,
                label,
                ordine,
                attivo
            )
            VALUES (?, ?, ?, ?)
            """,
            (payload.turno, payload.label, payload.ordine, payload.attivo),
        )
        conn.commit()

        item_id = cur.lastrowid

        cur.execute(
            """
            SELECT
                id,
                turno,
                label,
                ordine,
                attivo,
                created_at
            FROM shift_checklist_config
            WHERE id = ?
            """,
            (item_id,),
        )
        row = cur.fetchone()

    finally:
        conn.close()

    return ChecklistItemOut(
        id=row["id"],
        turno=row["turno"],
        label=row["label"],
        ordine=row["ordine"],
        attivo=row["attivo"],
        created_at=row["created_at"],
    )


@router.patch("/config/{id}", response_model=ChecklistItemOut)
async def update_checklist_config(
    id: int,
    payload: ChecklistItemBase,
    current_user: dict = Depends(get_current_user),
):
    """
    Update a checklist configuration item.
    Admin only.
    """
    check_admin_role(current_user)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE shift_checklist_config
            SET
                turno = ?,
                label = ?,
                ordine = ?,
                attivo = ?
            WHERE id = ?
            """,
            (payload.turno, payload.label, payload.ordine, payload.attivo, id),
        )

        if cur.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Checklist config item not found.",
            )

        conn.commit()

        cur.execute(
            """
            SELECT
                id,
                turno,
                label,
                ordine,
                attivo,
                created_at
            FROM shift_checklist_config
            WHERE id = ?
            """,
            (id,),
        )
        row = cur.fetchone()

    finally:
        conn.close()

    return ChecklistItemOut(
        id=row["id"],
        turno=row["turno"],
        label=row["label"],
        ordine=row["ordine"],
        attivo=row["attivo"],
        created_at=row["created_at"],
    )


@router.delete("/config/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist_config(
    id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Soft delete a checklist configuration item (set attivo=0).
    Admin only.
    """
    check_admin_role(current_user)

    conn = sqlite3.connect(DB_PATH)
    ensure_shift_closures_tables(conn)

    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE shift_checklist_config
            SET attivo = 0
            WHERE id = ?
            """,
            (id,),
        )

        if cur.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Checklist config item not found.",
            )

        conn.commit()

    finally:
        conn.close()


@router.get("/", response_model=List[ShiftClosureOut])
async def list_shift_closures(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    turno: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    List shift closures with optional filters.
    Query parameters:
    - from_date: YYYY-MM-DD (inclusive)
    - to_date: YYYY-MM-DD (inclusive)
    - turno: 'pranzo' or 'cena'
    """
    if turno and turno not in ("pranzo", "cena"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid turno. Must be 'pranzo' or 'cena'.",
        )

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        cur = conn.cursor()

        # Build query
        query = """
            SELECT
                id,
                date,
                turno,
                fondo_cassa_inizio,
                fondo_cassa_fine,
                contanti,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                preconto,
                fatture,
                coperti,
                totale_incassi,
                note,
                created_by,
                created_at,
                updated_at
            FROM shift_closures
            WHERE 1=1
        """
        params = []

        if from_date:
            query += " AND date >= ?"
            params.append(from_date)

        if to_date:
            query += " AND date <= ?"
            params.append(to_date)

        if turno:
            query += " AND turno = ?"
            params.append(turno)

        query += " ORDER BY date DESC, turno DESC"

        cur.execute(query, params)
        rows = cur.fetchall()

    finally:
        conn.close()

    # Pre-fetch pranzo data per calcolo saldo cena
    # Raggruppa per data per trovare le coppie pranzo/cena
    pranzo_by_date: dict = {}  # date_str -> {preconti_tot, spese_tot}

    conn3 = sqlite3.connect(DB_PATH)
    conn3.row_factory = sqlite3.Row
    c3 = conn3.cursor()

    # Trova tutte le date cena presenti nei risultati
    cena_dates = [row["date"] for row in rows if row["turno"] == "cena"]
    for d in cena_dates:
        # Cerca la chiusura pranzo per questa data
        c3.execute("SELECT id, fatture FROM shift_closures WHERE date = ? AND turno = 'pranzo'", (d,))
        pranzo_row = c3.fetchone()
        if pranzo_row:
            pranzo_id = pranzo_row["id"]
            preconti_tot = c3.execute(
                "SELECT COALESCE(SUM(importo), 0) FROM shift_preconti WHERE shift_closure_id = ?",
                (pranzo_id,)
            ).fetchone()[0]
            spese_tot = c3.execute(
                "SELECT COALESCE(SUM(importo), 0) FROM shift_spese WHERE shift_closure_id = ?",
                (pranzo_id,)
            ).fetchone()[0]
            pranzo_by_date[d] = {
                "preconti_tot": preconti_tot,
                "spese_tot": spese_tot,
                "fatture": pranzo_row["fatture"] or 0,
            }
    conn3.close()

    results = []
    for row in rows:
        conn2 = sqlite3.connect(DB_PATH)
        conn2.row_factory = sqlite3.Row
        c2 = conn2.cursor()

        c2.execute("SELECT id, shift_closure_id, checklist_item_id, checked, note FROM shift_checklist_responses WHERE shift_closure_id = ? ORDER BY checklist_item_id", (row["id"],))
        checklist_items = [ChecklistResponseOut(id=r["id"], shift_closure_id=r["shift_closure_id"], checklist_item_id=r["checklist_item_id"], checked=r["checked"], note=r["note"]) for r in c2.fetchall()]

        c2.execute("SELECT id, shift_closure_id, tavolo, importo FROM shift_preconti WHERE shift_closure_id = ? ORDER BY id", (row["id"],))
        preconti_items = [PrecontoOut(id=r["id"], shift_closure_id=r["shift_closure_id"], tavolo=r["tavolo"], importo=r["importo"]) for r in c2.fetchall()]

        c2.execute("SELECT id, shift_closure_id, tipo, descrizione, importo FROM shift_spese WHERE shift_closure_id = ? ORDER BY id", (row["id"],))
        spese_items = [SpesaOut(id=r["id"], shift_closure_id=r["shift_closure_id"], tipo=r["tipo"], descrizione=r["descrizione"], importo=r["importo"]) for r in c2.fetchall()]

        conn2.close()

        # ── Calcolo saldo/quadratura lato server ──
        # entrate = totale_incassi + fondo_in - fondo_fine
        # (totale_incassi NON include mance — solo metodi incasso reali)
        fondo_in = row["fondo_cassa_inizio"] or 0
        fondo_fine = row["fondo_cassa_fine"] or 0
        entrate = (row["totale_incassi"] or 0) + fondo_in - fondo_fine

        # giustificato = chiusura RT + preconti + fatture
        preconti_sum = sum(p.importo for p in preconti_items)
        spese_sum = sum(s.importo for s in spese_items)

        # Per cena: aggiungere preconti, spese e fatture del pranzo
        # (i campi principali come preconto/totale_incassi sono giornalieri,
        #  ma preconti/spese/fatture del pranzo devono essere sommati separatamente)
        pranzo_preconti = 0
        pranzo_spese = 0
        pranzo_fatture = 0
        if row["turno"] == "cena" and row["date"] in pranzo_by_date:
            pranzo_preconti = pranzo_by_date[row["date"]]["preconti_tot"]
            pranzo_spese = pranzo_by_date[row["date"]]["spese_tot"]
            pranzo_fatture = pranzo_by_date[row["date"]]["fatture"]

        giustificato = (row["preconto"] or 0) + (preconti_sum + pranzo_preconti) + ((row["fatture"] or 0) + pranzo_fatture)
        spese_giorno = spese_sum + pranzo_spese
        diff_grezzo = entrate - giustificato
        saldo = diff_grezzo + spese_giorno

        results.append(
            ShiftClosureOut(
                id=row["id"],
                date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
                turno=row["turno"],
                fondo_cassa_inizio=fondo_in,
                fondo_cassa_fine=fondo_fine,
                contanti=row["contanti"],
                pos_bpm=row["pos_bpm"],
                pos_sella=row["pos_sella"],
                theforkpay=row["theforkpay"],
                other_e_payments=row["other_e_payments"],
                bonifici=row["bonifici"],
                mance=row["mance"],
                preconto=row["preconto"],
                fatture=row["fatture"],
                coperti=row["coperti"],
                totale_incassi=row["totale_incassi"],
                note=row["note"],
                created_by=row["created_by"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                checklist=checklist_items,
                preconti=preconti_items,
                spese=spese_items,
                saldo=round(saldo, 2),
                diff_grezzo=round(diff_grezzo, 2),
                spese_giorno=round(spese_giorno, 2),
            )
        )

    return results


@router.get("/{date}/{turno}", response_model=ShiftClosureOut)
async def get_shift_closure(
    date: str,
    turno: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Fetch a shift closure for a specific date and turno (pranzo/cena).
    Returns 404 if not found.
    """
    if turno not in ("pranzo", "cena"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid turno. Must be 'pranzo' or 'cena'.",
        )

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        cur = conn.cursor()

        # Get the shift closure
        cur.execute(
            """
            SELECT
                id,
                date,
                turno,
                fondo_cassa_inizio,
                fondo_cassa_fine,
                contanti,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                preconto,
                fatture,
                coperti,
                totale_incassi,
                note,
                created_by,
                created_at,
                updated_at
            FROM shift_closures
            WHERE date = ? AND turno = ?
            """,
            (date, turno),
        )
        row = cur.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shift closure not found for this date and turno.",
            )

        # Get the checklist responses
        shift_closure_id = row["id"]
        cur.execute(
            """
            SELECT
                scr.id,
                scr.shift_closure_id,
                scr.checklist_item_id,
                scr.checked,
                scr.note
            FROM shift_checklist_responses scr
            WHERE scr.shift_closure_id = ?
            ORDER BY scr.checklist_item_id ASC
            """,
            (shift_closure_id,),
        )
        checklist_rows = cur.fetchall()

        # Get preconti
        cur.execute(
            """
            SELECT id, shift_closure_id, tavolo, importo
            FROM shift_preconti
            WHERE shift_closure_id = ?
            ORDER BY id ASC
            """,
            (shift_closure_id,),
        )
        preconti_rows = cur.fetchall()

        # Get spese
        cur.execute(
            """
            SELECT id, shift_closure_id, tipo, descrizione, importo
            FROM shift_spese
            WHERE shift_closure_id = ?
            ORDER BY id ASC
            """,
            (shift_closure_id,),
        )
        spese_rows = cur.fetchall()

    finally:
        conn.close()

    checklist_items = [
        ChecklistResponseOut(
            id=r["id"],
            shift_closure_id=r["shift_closure_id"],
            checklist_item_id=r["checklist_item_id"],
            checked=r["checked"],
            note=r["note"],
        )
        for r in checklist_rows
    ]

    preconti_items = [
        PrecontoOut(
            id=r["id"],
            shift_closure_id=r["shift_closure_id"],
            tavolo=r["tavolo"],
            importo=r["importo"],
        )
        for r in preconti_rows
    ]

    spese_items = [
        SpesaOut(
            id=r["id"],
            shift_closure_id=r["shift_closure_id"],
            tipo=r["tipo"],
            descrizione=r["descrizione"],
            importo=r["importo"],
        )
        for r in spese_rows
    ]

    return ShiftClosureOut(
        id=row["id"],
        date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
        turno=row["turno"],
        fondo_cassa_inizio=row["fondo_cassa_inizio"] or 0,
        fondo_cassa_fine=row["fondo_cassa_fine"] or 0,
        contanti=row["contanti"],
        pos_bpm=row["pos_bpm"],
        pos_sella=row["pos_sella"],
        theforkpay=row["theforkpay"],
        other_e_payments=row["other_e_payments"],
        bonifici=row["bonifici"],
        mance=row["mance"],
        preconto=row["preconto"],
        fatture=row["fatture"],
        coperti=row["coperti"],
        totale_incassi=row["totale_incassi"],
        note=row["note"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        checklist=checklist_items,
        preconti=preconti_items,
        spese=spese_items,
    )


@router.post("/", response_model=ShiftClosureOut)
async def upsert_shift_closure(
    payload: ShiftClosureIn,
    current_user: dict = Depends(get_current_user),
):
    """
    Create or update a shift closure.
    Calculates totale_incassi automatically.
    Saves checklist responses if provided.
    Role check: admin, sommelier, sala only.
    """
    check_allowed_role(current_user)

    if payload.turno not in ("pranzo", "cena"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid turno. Must be 'pranzo' or 'cena'.",
        )

    if payload.date > date_type.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non puoi inserire una chiusura in data futura.",
        )

    date_str = payload.date.isoformat()

    # Calculate totale_incassi (solo metodi di incasso reali)
    # Le mance NON entrano: sono battute/fiscalizzate nella chiusura RT
    # ma poi vengono date al personale. Dato solo statistico.
    totale_incassi = (
        payload.contanti
        + payload.pos_bpm
        + payload.pos_sella
        + payload.theforkpay
        + payload.other_e_payments
        + payload.bonifici
    )

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_shift_closures_tables(conn)

    try:
        cur = conn.cursor()

        # Check if shift closure already exists
        cur.execute(
            "SELECT id FROM shift_closures WHERE date = ? AND turno = ?",
            (date_str, payload.turno),
        )
        existing = cur.fetchone()

        if existing:
            # UPDATE
            shift_closure_id = existing["id"]
            cur.execute(
                """
                UPDATE shift_closures
                SET
                    fondo_cassa_inizio = ?,
                    fondo_cassa_fine = ?,
                    contanti = ?,
                    pos_bpm = ?,
                    pos_sella = ?,
                    theforkpay = ?,
                    other_e_payments = ?,
                    bonifici = ?,
                    mance = ?,
                    preconto = ?,
                    fatture = ?,
                    coperti = ?,
                    totale_incassi = ?,
                    note = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    payload.fondo_cassa_inizio,
                    payload.fondo_cassa_fine,
                    payload.contanti,
                    payload.pos_bpm,
                    payload.pos_sella,
                    payload.theforkpay,
                    payload.other_e_payments,
                    payload.bonifici,
                    payload.mance,
                    payload.preconto,
                    payload.fatture,
                    payload.coperti,
                    totale_incassi,
                    payload.note,
                    shift_closure_id,
                ),
            )
        else:
            # INSERT
            cur.execute(
                """
                INSERT INTO shift_closures (
                    date,
                    turno,
                    fondo_cassa_inizio,
                    fondo_cassa_fine,
                    contanti,
                    pos_bpm,
                    pos_sella,
                    theforkpay,
                    other_e_payments,
                    bonifici,
                    mance,
                    preconto,
                    fatture,
                    coperti,
                    totale_incassi,
                    note,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str,
                    payload.turno,
                    payload.fondo_cassa_inizio,
                    payload.fondo_cassa_fine,
                    payload.contanti,
                    payload.pos_bpm,
                    payload.pos_sella,
                    payload.theforkpay,
                    payload.other_e_payments,
                    payload.bonifici,
                    payload.mance,
                    payload.preconto,
                    payload.fatture,
                    payload.coperti,
                    totale_incassi,
                    payload.note,
                    current_user.get("username", "unknown"),
                ),
            )
            # Get the new ID
            cur.execute(
                "SELECT id FROM shift_closures WHERE date = ? AND turno = ?",
                (date_str, payload.turno),
            )
            row = cur.fetchone()
            shift_closure_id = row["id"]

        # Handle checklist responses
        if payload.checklist:
            # Delete existing checklist responses
            cur.execute(
                "DELETE FROM shift_checklist_responses WHERE shift_closure_id = ?",
                (shift_closure_id,),
            )

            # Insert new checklist responses
            for item in payload.checklist:
                cur.execute(
                    """
                    INSERT INTO shift_checklist_responses (
                        shift_closure_id,
                        checklist_item_id,
                        checked,
                        note
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        shift_closure_id,
                        item.checklist_item_id,
                        item.checked,
                        item.note,
                    ),
                )

        # Handle preconti
        # Delete existing preconti
        cur.execute(
            "DELETE FROM shift_preconti WHERE shift_closure_id = ?",
            (shift_closure_id,),
        )
        # Insert new preconti
        if payload.preconti:
            for p in payload.preconti:
                if p.tavolo.strip():
                    cur.execute(
                        """
                        INSERT INTO shift_preconti (shift_closure_id, tavolo, importo)
                        VALUES (?, ?, ?)
                        """,
                        (shift_closure_id, p.tavolo.strip(), p.importo),
                    )

        # Handle spese
        cur.execute(
            "DELETE FROM shift_spese WHERE shift_closure_id = ?",
            (shift_closure_id,),
        )
        if payload.spese:
            for s in payload.spese:
                if s.descrizione.strip():
                    cur.execute(
                        """
                        INSERT INTO shift_spese (shift_closure_id, tipo, descrizione, importo)
                        VALUES (?, ?, ?, ?)
                        """,
                        (shift_closure_id, s.tipo, s.descrizione.strip(), s.importo),
                    )

        conn.commit()

        # Reload the record
        cur.execute(
            """
            SELECT
                id,
                date,
                turno,
                fondo_cassa_inizio,
                fondo_cassa_fine,
                contanti,
                pos_bpm,
                pos_sella,
                theforkpay,
                other_e_payments,
                bonifici,
                mance,
                preconto,
                fatture,
                coperti,
                totale_incassi,
                note,
                created_by,
                created_at,
                updated_at
            FROM shift_closures
            WHERE id = ?
            """,
            (shift_closure_id,),
        )
        row = cur.fetchone()

        # Reload checklist responses
        cur.execute(
            """
            SELECT
                id,
                shift_closure_id,
                checklist_item_id,
                checked,
                note
            FROM shift_checklist_responses
            WHERE shift_closure_id = ?
            ORDER BY checklist_item_id ASC
            """,
            (shift_closure_id,),
        )
        checklist_rows = cur.fetchall()

        # Reload preconti
        cur.execute(
            """
            SELECT id, shift_closure_id, tavolo, importo
            FROM shift_preconti
            WHERE shift_closure_id = ?
            ORDER BY id ASC
            """,
            (shift_closure_id,),
        )
        preconti_rows = cur.fetchall()

        # Reload spese
        cur.execute(
            """
            SELECT id, shift_closure_id, tipo, descrizione, importo
            FROM shift_spese
            WHERE shift_closure_id = ?
            ORDER BY id ASC
            """,
            (shift_closure_id,),
        )
        spese_rows = cur.fetchall()

    finally:
        conn.close()

    checklist_items = [
        ChecklistResponseOut(
            id=r["id"],
            shift_closure_id=r["shift_closure_id"],
            checklist_item_id=r["checklist_item_id"],
            checked=r["checked"],
            note=r["note"],
        )
        for r in checklist_rows
    ]

    preconti_items = [
        PrecontoOut(
            id=r["id"],
            shift_closure_id=r["shift_closure_id"],
            tavolo=r["tavolo"],
            importo=r["importo"],
        )
        for r in preconti_rows
    ]

    spese_items = [
        SpesaOut(
            id=r["id"],
            shift_closure_id=r["shift_closure_id"],
            tipo=r["tipo"],
            descrizione=r["descrizione"],
            importo=r["importo"],
        )
        for r in spese_rows
    ]

    return ShiftClosureOut(
        id=row["id"],
        date=datetime.strptime(row["date"], "%Y-%m-%d").date(),
        turno=row["turno"],
        fondo_cassa_inizio=row["fondo_cassa_inizio"] or 0,
        fondo_cassa_fine=row["fondo_cassa_fine"] or 0,
        contanti=row["contanti"],
        pos_bpm=row["pos_bpm"],
        pos_sella=row["pos_sella"],
        theforkpay=row["theforkpay"],
        other_e_payments=row["other_e_payments"],
        bonifici=row["bonifici"],
        mance=row["mance"],
        preconto=row["preconto"],
        fatture=row["fatture"],
        coperti=row["coperti"],
        totale_incassi=row["totale_incassi"],
        note=row["note"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        checklist=checklist_items,
        preconti=preconti_items,
        spese=spese_items,
    )


# ---------------------------------------------------------
# DELETE shift closure (solo admin)
# ---------------------------------------------------------

@router.delete("/{closure_id}")
async def delete_shift_closure(
    closure_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a shift closure by ID. Only admin/superadmin.
    Also deletes related checklist_responses, preconti, spese.
    """
    user_role = current_user.get("role")
    if user_role not in ("superadmin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo gli admin possono eliminare una chiusura.",
        )

    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, date, turno FROM shift_closures WHERE id = ?", (closure_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chiusura non trovata.",
            )

        # Elimina dati collegati
        cur.execute("DELETE FROM checklist_responses WHERE shift_closure_id = ?", (closure_id,))
        cur.execute("DELETE FROM shift_closure_preconti WHERE shift_closure_id = ?", (closure_id,))
        cur.execute("DELETE FROM shift_closure_spese WHERE shift_closure_id = ?", (closure_id,))
        cur.execute("DELETE FROM shift_closures WHERE id = ?", (closure_id,))
        conn.commit()

        return {"ok": True, "detail": f"Chiusura {row['turno']} del {row['date']} eliminata."}
    finally:
        conn.close()
