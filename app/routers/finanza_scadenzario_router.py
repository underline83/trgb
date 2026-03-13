"""
TRGB — Finanza Scadenzario Router
Gestione rateizzazioni, mutui, prestiti, affitti e spese fisse.
"""

import sqlite3
from datetime import datetime, date, timedelta
from typing import Optional, List
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from app.services.auth_service import get_current_user

router = APIRouter(prefix="/finanza/scadenzario", tags=["finanza-scadenzario"])

DB_PATH = "app/data/foodcost.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ── Modelli ──

TIPI_SCADENZA = [
    "RATEIZZAZIONE_FATTURA", "RATEIZZAZIONE_ENTE",
    "MUTUO", "PRESTITO", "AFFITTO", "SPESA_FISSA",
]

FREQUENZE = ["MENSILE", "BIMESTRALE", "TRIMESTRALE", "SEMESTRALE", "ANNUALE", "UNA_TANTUM"]

FREQ_MONTHS = {
    "MENSILE": 1, "BIMESTRALE": 2, "TRIMESTRALE": 3,
    "SEMESTRALE": 6, "ANNUALE": 12, "UNA_TANTUM": 0,
}


class ScadenzaCreate(BaseModel):
    tipo: str
    titolo: str
    descrizione: str = ""
    ente: str = ""
    importo_totale: float = 0
    importo_rata: float = 0
    num_rate: int = 0
    data_inizio: str = ""
    data_fine: str = ""
    giorno_scadenza: int = 0
    frequenza: str = "MENSILE"
    fattura_id: Optional[int] = None
    fattura_numero: str = ""
    fattura_fornitore: str = ""
    cat1: str = ""
    cat2: str = ""
    cat1_fin: str = ""
    cat2_fin: str = ""
    tipo_analitico: str = ""
    tipo_finanziario: str = ""
    descrizione_finanziaria: str = ""
    cat_debito: str = ""
    match_pattern: str = ""
    note: str = ""
    genera_rate: bool = True  # Se True, genera automaticamente le rate


class RataUpdate(BaseModel):
    importo: Optional[float] = None
    importo_capitale: Optional[float] = None
    importo_interessi: Optional[float] = None
    importo_pagato: Optional[float] = None
    data_pagamento: Optional[str] = None
    stato: Optional[str] = None
    note: Optional[str] = None


class RataManuale(BaseModel):
    data_scadenza: str
    importo: float
    importo_capitale: float = 0
    importo_interessi: float = 0
    note: str = ""


# ═══════════════════════════════════════════════════════════════════
# LISTA SCADENZE
# ═══════════════════════════════════════════════════════════════════

@router.get("/")
def list_scadenze(
    tipo: Optional[str] = None,
    stato: str = "ATTIVO",
    current_user=Depends(get_current_user),
):
    conn = get_db()
    wheres = []
    params = []

    if tipo:
        wheres.append("s.tipo = ?")
        params.append(tipo)
    if stato:
        wheres.append("s.stato = ?")
        params.append(stato)

    where_sql = (" WHERE " + " AND ".join(wheres)) if wheres else ""

    rows = conn.execute(f"""
        SELECT s.*,
            (SELECT COUNT(*) FROM finanza_rate r WHERE r.scadenza_id = s.id) AS totale_rate,
            (SELECT COUNT(*) FROM finanza_rate r WHERE r.scadenza_id = s.id AND r.stato = 'PAGATA') AS rate_pagate,
            (SELECT COALESCE(SUM(r.importo_pagato), 0) FROM finanza_rate r WHERE r.scadenza_id = s.id) AS totale_pagato,
            (SELECT MIN(r.data_scadenza) FROM finanza_rate r WHERE r.scadenza_id = s.id AND r.stato IN ('DA_PAGARE', 'SCADUTA')) AS prossima_scadenza
        FROM finanza_scadenze s
        {where_sql}
        ORDER BY s.tipo, s.titolo
    """, params).fetchall()

    conn.close()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════
# DETTAGLIO SCADENZA con rate
# ═══════════════════════════════════════════════════════════════════

@router.get("/{scadenza_id}")
def get_scadenza(scadenza_id: int, current_user=Depends(get_current_user)):
    conn = get_db()
    scad = conn.execute("SELECT * FROM finanza_scadenze WHERE id = ?", (scadenza_id,)).fetchone()
    if not scad:
        conn.close()
        raise HTTPException(404, "Scadenza non trovata")

    rate = conn.execute("""
        SELECT * FROM finanza_rate WHERE scadenza_id = ? ORDER BY numero_rata, data_scadenza
    """, (scadenza_id,)).fetchall()

    conn.close()
    return {
        "scadenza": dict(scad),
        "rate": [dict(r) for r in rate],
    }


# ═══════════════════════════════════════════════════════════════════
# CREA SCADENZA (+ genera rate automaticamente)
# ═══════════════════════════════════════════════════════════════════

@router.post("/")
def create_scadenza(req: ScadenzaCreate, current_user=Depends(get_current_user)):
    if req.tipo not in TIPI_SCADENZA:
        raise HTTPException(400, f"Tipo non valido. Usa: {', '.join(TIPI_SCADENZA)}")
    if req.frequenza not in FREQUENZE:
        raise HTTPException(400, f"Frequenza non valida. Usa: {', '.join(FREQUENZE)}")

    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO finanza_scadenze (
            tipo, titolo, descrizione, ente,
            importo_totale, importo_rata, num_rate,
            data_inizio, data_fine, giorno_scadenza, frequenza,
            fattura_id, fattura_numero, fattura_fornitore,
            cat1, cat2, cat1_fin, cat2_fin,
            tipo_analitico, tipo_finanziario, descrizione_finanziaria, cat_debito,
            match_pattern, note
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        req.tipo, req.titolo, req.descrizione, req.ente,
        req.importo_totale, req.importo_rata, req.num_rate,
        req.data_inizio, req.data_fine, req.giorno_scadenza, req.frequenza,
        req.fattura_id, req.fattura_numero, req.fattura_fornitore,
        req.cat1, req.cat2, req.cat1_fin, req.cat2_fin,
        req.tipo_analitico, req.tipo_finanziario, req.descrizione_finanziaria, req.cat_debito,
        req.match_pattern, req.note,
    ))
    scadenza_id = cur.lastrowid

    # Genera rate automaticamente
    rate_generate = 0
    if req.genera_rate and req.num_rate > 0 and req.data_inizio:
        try:
            data_inizio = datetime.strptime(req.data_inizio, "%Y-%m-%d").date()
        except ValueError:
            conn.commit()
            conn.close()
            return {"ok": True, "id": scadenza_id, "rate_generate": 0, "error": "Data inizio non valida"}

        months_step = FREQ_MONTHS.get(req.frequenza, 1)
        importo = req.importo_rata if req.importo_rata > 0 else (
            req.importo_totale / req.num_rate if req.num_rate > 0 else 0
        )

        for i in range(req.num_rate):
            if months_step > 0:
                data_rata = data_inizio + relativedelta(months=months_step * i)
            else:
                data_rata = data_inizio  # UNA_TANTUM

            if req.giorno_scadenza > 0:
                try:
                    data_rata = data_rata.replace(day=min(req.giorno_scadenza, 28))
                except ValueError:
                    pass

            cur.execute("""
                INSERT INTO finanza_rate (scadenza_id, numero_rata, data_scadenza, importo, stato)
                VALUES (?, ?, ?, ?, 'DA_PAGARE')
            """, (scadenza_id, i + 1, data_rata.strftime("%Y-%m-%d"), round(importo, 2)))
            rate_generate += 1

    conn.commit()
    conn.close()
    return {"ok": True, "id": scadenza_id, "rate_generate": rate_generate}


# ═══════════════════════════════════════════════════════════════════
# MODIFICA SCADENZA
# ═══════════════════════════════════════════════════════════════════

@router.put("/{scadenza_id}")
def update_scadenza(scadenza_id: int, req: ScadenzaCreate, current_user=Depends(get_current_user)):
    conn = get_db()
    conn.execute("""
        UPDATE finanza_scadenze SET
            tipo=?, titolo=?, descrizione=?, ente=?,
            importo_totale=?, importo_rata=?, num_rate=?,
            data_inizio=?, data_fine=?, giorno_scadenza=?, frequenza=?,
            fattura_id=?, fattura_numero=?, fattura_fornitore=?,
            cat1=?, cat2=?, cat1_fin=?, cat2_fin=?,
            tipo_analitico=?, tipo_finanziario=?, descrizione_finanziaria=?, cat_debito=?,
            match_pattern=?, note=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (
        req.tipo, req.titolo, req.descrizione, req.ente,
        req.importo_totale, req.importo_rata, req.num_rate,
        req.data_inizio, req.data_fine, req.giorno_scadenza, req.frequenza,
        req.fattura_id, req.fattura_numero, req.fattura_fornitore,
        req.cat1, req.cat2, req.cat1_fin, req.cat2_fin,
        req.tipo_analitico, req.tipo_finanziario, req.descrizione_finanziaria, req.cat_debito,
        req.match_pattern, req.note,
        scadenza_id,
    ))
    conn.commit()
    conn.close()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# ELIMINA SCADENZA (cascade elimina rate)
# ═══════════════════════════════════════════════════════════════════

@router.delete("/{scadenza_id}")
def delete_scadenza(scadenza_id: int, current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(403, "Solo admin")
    conn = get_db()
    conn.execute("DELETE FROM finanza_scadenze WHERE id = ?", (scadenza_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# GESTIONE RATE
# ═══════════════════════════════════════════════════════════════════

@router.patch("/rate/{rata_id}")
def update_rata(rata_id: int, req: RataUpdate, current_user=Depends(get_current_user)):
    conn = get_db()
    fields = []
    params = []
    for field_name, value in req.dict(exclude_none=True).items():
        fields.append(f"{field_name} = ?")
        params.append(value)

    if not fields:
        conn.close()
        raise HTTPException(400, "Nessun campo da aggiornare")

    params.append(rata_id)
    conn.execute(f"UPDATE finanza_rate SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/{scadenza_id}/rate")
def add_rata_manuale(scadenza_id: int, req: RataManuale, current_user=Depends(get_current_user)):
    """Aggiunge una rata manuale a una scadenza."""
    conn = get_db()
    # Trova il prossimo numero rata
    max_n = conn.execute(
        "SELECT COALESCE(MAX(numero_rata), 0) FROM finanza_rate WHERE scadenza_id = ?", (scadenza_id,)
    ).fetchone()[0]

    conn.execute("""
        INSERT INTO finanza_rate (scadenza_id, numero_rata, data_scadenza, importo, importo_capitale, importo_interessi, note, stato)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'DA_PAGARE')
    """, (scadenza_id, max_n + 1, req.data_scadenza, req.importo, req.importo_capitale, req.importo_interessi, req.note))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/rate/{rata_id}/paga")
def paga_rata(rata_id: int, current_user=Depends(get_current_user)):
    """Segna una rata come pagata con data odierna."""
    conn = get_db()
    rata = conn.execute("SELECT * FROM finanza_rate WHERE id = ?", (rata_id,)).fetchone()
    if not rata:
        conn.close()
        raise HTTPException(404, "Rata non trovata")

    oggi = date.today().strftime("%Y-%m-%d")
    conn.execute("""
        UPDATE finanza_rate SET stato = 'PAGATA', importo_pagato = importo, data_pagamento = ?
        WHERE id = ?
    """, (oggi, rata_id))

    # Verifica se tutte le rate sono pagate → completa la scadenza
    scadenza_id = rata["scadenza_id"]
    remaining = conn.execute("""
        SELECT COUNT(*) FROM finanza_rate
        WHERE scadenza_id = ? AND stato IN ('DA_PAGARE', 'SCADUTA')
    """, (scadenza_id,)).fetchone()[0]

    if remaining == 0:
        conn.execute(
            "UPDATE finanza_scadenze SET stato = 'COMPLETATO', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scadenza_id,)
        )

    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/rate/{rata_id}")
def delete_rata(rata_id: int, current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(403, "Solo admin")
    conn = get_db()
    conn.execute("DELETE FROM finanza_rate WHERE id = ?", (rata_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# DASHBOARD SCADENZARIO
# ═══════════════════════════════════════════════════════════════════

@router.get("/dashboard/overview")
def dashboard_overview(current_user=Depends(get_current_user)):
    """KPI e prossime scadenze."""
    conn = get_db()
    oggi = date.today().strftime("%Y-%m-%d")

    # Aggiorna rate scadute
    conn.execute("""
        UPDATE finanza_rate SET stato = 'SCADUTA'
        WHERE stato = 'DA_PAGARE' AND data_scadenza < ?
    """, (oggi,))
    conn.commit()

    # KPI
    totale_impegni = conn.execute(
        "SELECT COUNT(*) FROM finanza_scadenze WHERE stato = 'ATTIVO'"
    ).fetchone()[0]

    rate_scadute = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(importo), 0) FROM finanza_rate WHERE stato = 'SCADUTA'"
    ).fetchone()

    rate_prossime_30gg = conn.execute("""
        SELECT COUNT(*), COALESCE(SUM(importo), 0) FROM finanza_rate
        WHERE stato = 'DA_PAGARE' AND data_scadenza BETWEEN ? AND date(?, '+30 days')
    """, (oggi, oggi)).fetchone()

    totale_residuo = conn.execute("""
        SELECT COALESCE(SUM(importo - importo_pagato), 0) FROM finanza_rate
        WHERE stato IN ('DA_PAGARE', 'SCADUTA')
    """).fetchone()[0]

    # Prossime 10 scadenze
    prossime = conn.execute("""
        SELECT r.*, s.titolo, s.tipo AS tipo_scadenza, s.ente
        FROM finanza_rate r
        JOIN finanza_scadenze s ON r.scadenza_id = s.id
        WHERE r.stato IN ('DA_PAGARE', 'SCADUTA')
        ORDER BY r.data_scadenza ASC
        LIMIT 10
    """).fetchall()

    # Riepilogo per tipo
    per_tipo = conn.execute("""
        SELECT s.tipo,
               COUNT(DISTINCT s.id) AS num_scadenze,
               COALESCE(SUM(CASE WHEN r.stato IN ('DA_PAGARE', 'SCADUTA') THEN r.importo ELSE 0 END), 0) AS residuo,
               COUNT(CASE WHEN r.stato = 'SCADUTA' THEN 1 END) AS scadute
        FROM finanza_scadenze s
        LEFT JOIN finanza_rate r ON r.scadenza_id = s.id
        WHERE s.stato = 'ATTIVO'
        GROUP BY s.tipo
    """).fetchall()

    conn.close()
    return {
        "totale_impegni": totale_impegni,
        "rate_scadute": {"num": rate_scadute[0], "importo": rate_scadute[1]},
        "rate_prossime_30gg": {"num": rate_prossime_30gg[0], "importo": rate_prossime_30gg[1]},
        "totale_residuo": totale_residuo,
        "prossime_scadenze": [dict(r) for r in prossime],
        "per_tipo": [dict(r) for r in per_tipo],
    }
