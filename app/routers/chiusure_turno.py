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
    importo: float = 0


class SpesaOut(SpesaBase):
    id: int
    shift_closure_id: int


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


# ---------------------------------------------------------
# HELPER: ROLE VALIDATION
# ---------------------------------------------------------


def check_allowed_role(current_user: dict) -> None:
    """
    Verifies that the current user has an allowed role for shift closure submission.
    Allowed roles: admin, sommelier, sala
    NOT allowed: viewer, chef
    """
    allowed_roles = {"admin", "sommelier", "sala"}
    user_role = current_user.get("role")

    if user_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user_role}' not allowed to submit shift closures. Allowed roles: {', '.join(allowed_roles)}",
        )


# ---------------------------------------------------------
# SHIFT CLOSURES ENDPOINTS
# ---------------------------------------------------------


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

    date_str = payload.date.isoformat()

    # Calculate totale_incassi
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

        results.append(
            ShiftClosureOut(
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
        )

    return results


# ---------------------------------------------------------
# CHECKLIST CONFIG ENDPOINTS (ADMIN ONLY)
# ---------------------------------------------------------


def check_admin_role(current_user: dict) -> None:
    """Verifies that the current user is an admin."""
    user_role = current_user.get("role")

    if user_role != "admin":
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
