# @version: v1.0-occasionali-router
# -*- coding: utf-8 -*-
"""
Router Prestazioni Occasionali — TRGB Gestionale

Gestisce i collaboratori con forma_rapporto='OCCASIONALE' (PrestO /
Libretto Famiglia INPS). Espone:
- Riepilogo YTD per singolo prestatore (ore + importo + % soglie)
- Totale committente YTD (vs €10.000 soglia committente)
- Registrazione ricevute PrestO / Libretto Famiglia
- Storico prestazioni per dipendente

SOGLIE 2026 (parametri, modificabili tramite settings.env):
- €2.500/anno stesso committente-prestatore (OLTRE → obbligo contratto)
- €10.000/anno totale committente (tutti i prestatori sommati)
- 280 ore/anno stesso prestatore-committente

Tutti gli endpoint richiedono JWT e sono protetti da feature flag
FEATURE_OCCASIONALI (se disattivato → 404 sul tag).

Prefisso: /occasionali
"""

from __future__ import annotations
import os
from typing import Any, Dict, List, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.dipendenti_db import get_dipendenti_conn
from app.services.auth_service import get_current_user


# ─── Feature flag ─────────────────────────────────────────────
FEATURE_OCCASIONALI = os.getenv("FEATURE_OCCASIONALI", "0").strip() in ("1", "true", "TRUE", "yes")

# ─── Soglie 2026 ──────────────────────────────────────────────
SOGLIA_EURO_PRESTATORE   = float(os.getenv("OCC_SOGLIA_EURO_PRESTATORE",   "2500"))
SOGLIA_EURO_COMMITTENTE  = float(os.getenv("OCC_SOGLIA_EURO_COMMITTENTE", "10000"))
SOGLIA_ORE_PRESTATORE    = float(os.getenv("OCC_SOGLIA_ORE_PRESTATORE",    "280"))


router = APIRouter(prefix="/occasionali", tags=["Prestazioni Occasionali"])


# ============================================================
# MODELLI
# ============================================================
class RicevutaPrestoIn(BaseModel):
    dipendente_id: int
    data_prestazione: str        # YYYY-MM-DD
    ore: float = Field(gt=0)
    importo_lordo: float = Field(gt=0)
    importo_netto: Optional[float] = None
    canale: str = "PRESTO"       # PRESTO | LIBRETTO_FAMIGLIA
    ricevuta_numero: Optional[str] = None
    ricevuta_data: Optional[str] = None
    uscita_contanti_id: Optional[int] = None
    note: Optional[str] = None


# ============================================================
# HELPERS
# ============================================================
def _require_feature():
    if not FEATURE_OCCASIONALI:
        raise HTTPException(
            status_code=404,
            detail="Modulo prestazioni occasionali non abilitato (feature flag FEATURE_OCCASIONALI=0)",
        )


def _anno_range(anno: int) -> tuple[str, str]:
    return f"{anno}-01-01", f"{anno}-12-31"


def _semaforo(pct: float) -> str:
    if pct < 0.7: return "verde"
    if pct < 0.9: return "giallo"
    return "rosso"


# ============================================================
# GET /occasionali/flag — stato feature flag (sempre disponibile)
# ============================================================
@router.get("/flag")
def get_feature_flag(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Ritorna lo stato del feature flag (per permettere al FE di nascondere UI)."""
    return {
        "enabled": FEATURE_OCCASIONALI,
        "soglie": {
            "euro_prestatore":  SOGLIA_EURO_PRESTATORE,
            "euro_committente": SOGLIA_EURO_COMMITTENTE,
            "ore_prestatore":   SOGLIA_ORE_PRESTATORE,
        },
    }


# ============================================================
# GET /occasionali/riepilogo?anno=YYYY
# ============================================================
@router.get("/riepilogo")
def get_riepilogo_anno(
    anno: int = Query(default=date.today().year),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Riepilogo YTD per ogni dipendente con forma_rapporto='OCCASIONALE'.

    Per ogni prestatore:
      - ore totali, importo lordo totale
      - % soglia euro (vs €2.500)
      - % soglia ore (vs 280)
      - semaforo (verde/giallo/rosso)
    Più un blocco `totale_committente` con la somma vs €10.000.
    """
    _require_feature()
    d_inizio, d_fine = _anno_range(anno)

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()

        # Elenco prestatori OCCASIONALI (attivi e non)
        cur.execute(
            """
            SELECT id, codice, nome, cognome, ruolo, colore,
                   COALESCE(costo_orario, 0) AS costo_orario,
                   attivo
            FROM dipendenti
            WHERE UPPER(COALESCE(forma_rapporto,'DIPENDENTE')) = 'OCCASIONALE'
            ORDER BY cognome, nome
            """
        )
        prestatori = [dict(r) for r in cur.fetchall()]

        # Aggregazione ricevute registrate (fonte "ufficiale" — preferita se presente)
        cur.execute(
            """
            SELECT dipendente_id,
                   COALESCE(SUM(ore), 0) AS ore_tot,
                   COALESCE(SUM(importo_lordo), 0) AS importo_tot,
                   COUNT(*) AS n_ricevute,
                   MAX(data_prestazione) AS ultima_data
            FROM prestazioni_occasionali_log
            WHERE UPPER(COALESCE(stato,'')) != 'ANNULLATO'
              AND data_prestazione BETWEEN ? AND ?
            GROUP BY dipendente_id
            """,
            (d_inizio, d_fine),
        )
        da_ricevute = {r["dipendente_id"]: dict(r) for r in cur.fetchall()}

        # Fallback: aggregazione da turni_calendario (ore pianificate × costo_orario)
        # — utile prima che le ricevute siano registrate
        cur.execute(
            """
            SELECT tc.dipendente_id,
                   COALESCE(SUM(
                       CASE
                         WHEN tc.ora_inizio IS NOT NULL AND tc.ora_fine IS NOT NULL THEN
                           ((CAST(substr(tc.ora_fine,1,2) AS REAL)*60 + CAST(substr(tc.ora_fine,4,2) AS REAL)) -
                            (CAST(substr(tc.ora_inizio,1,2) AS REAL)*60 + CAST(substr(tc.ora_inizio,4,2) AS REAL))) / 60.0
                         ELSE 0
                       END
                   ), 0) AS ore_turni
            FROM turni_calendario tc
            WHERE tc.data BETWEEN ? AND ?
              AND UPPER(COALESCE(tc.stato,'CONFERMATO')) = 'CONFERMATO'
            GROUP BY tc.dipendente_id
            """,
            (d_inizio, d_fine),
        )
        da_turni = {r["dipendente_id"]: dict(r) for r in cur.fetchall()}

        out_dipendenti = []
        tot_euro_committente = 0.0

        for p in prestatori:
            dip_id = p["id"]
            rec = da_ricevute.get(dip_id)
            tur = da_turni.get(dip_id)

            if rec:
                ore_ytd = float(rec["ore_tot"] or 0)
                importo_ytd = float(rec["importo_tot"] or 0)
                fonte = "ricevute"
                ultima_data = rec["ultima_data"]
                n_ricevute = int(rec["n_ricevute"] or 0)
            elif tur:
                ore_ytd = float(tur["ore_turni"] or 0)
                importo_ytd = round(ore_ytd * float(p["costo_orario"] or 0), 2)
                fonte = "turni_pianificati"
                ultima_data = None
                n_ricevute = 0
            else:
                ore_ytd = 0.0
                importo_ytd = 0.0
                fonte = "nessun_dato"
                ultima_data = None
                n_ricevute = 0

            pct_euro = (importo_ytd / SOGLIA_EURO_PRESTATORE) if SOGLIA_EURO_PRESTATORE else 0
            pct_ore  = (ore_ytd / SOGLIA_ORE_PRESTATORE) if SOGLIA_ORE_PRESTATORE else 0

            out_dipendenti.append({
                "dipendente_id":   dip_id,
                "codice":          p["codice"],
                "nome":            p["nome"],
                "cognome":         p["cognome"],
                "ruolo":           p["ruolo"],
                "colore":          p["colore"],
                "attivo":          bool(p["attivo"]),
                "costo_orario":    float(p["costo_orario"] or 0),
                "ore_ytd":         round(ore_ytd, 2),
                "importo_ytd":     round(importo_ytd, 2),
                "pct_soglia_euro": round(pct_euro, 4),
                "pct_soglia_ore":  round(pct_ore,  4),
                "semaforo":        _semaforo(max(pct_euro, pct_ore)),
                "fonte":           fonte,       # "ricevute" | "turni_pianificati" | "nessun_dato"
                "n_ricevute":      n_ricevute,
                "ultima_data":     ultima_data,
            })
            tot_euro_committente += importo_ytd

        pct_committente = (tot_euro_committente / SOGLIA_EURO_COMMITTENTE) if SOGLIA_EURO_COMMITTENTE else 0

        return JSONResponse(content={
            "anno": anno,
            "prestatori": out_dipendenti,
            "totale_committente": {
                "importo_ytd":       round(tot_euro_committente, 2),
                "soglia_euro":       SOGLIA_EURO_COMMITTENTE,
                "pct_soglia":        round(pct_committente, 4),
                "semaforo":          _semaforo(pct_committente),
            },
            "soglie": {
                "euro_prestatore":   SOGLIA_EURO_PRESTATORE,
                "euro_committente":  SOGLIA_EURO_COMMITTENTE,
                "ore_prestatore":    SOGLIA_ORE_PRESTATORE,
            },
        })
    finally:
        conn.close()


# ============================================================
# GET /occasionali/{dipendente_id}/ricevute?anno=YYYY
# ============================================================
@router.get("/{dipendente_id}/ricevute")
def get_ricevute_dipendente(
    dipendente_id: int,
    anno: Optional[int] = Query(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Storico ricevute PrestO/LF per un prestatore. Se anno=None → tutte."""
    _require_feature()
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        where = ["dipendente_id = ?"]
        params: List[Any] = [dipendente_id]
        if anno:
            di, df = _anno_range(anno)
            where.append("data_prestazione BETWEEN ? AND ?")
            params.extend([di, df])
        cur.execute(
            f"""SELECT id, dipendente_id, data_prestazione, ore,
                       importo_lordo, importo_netto, canale,
                       ricevuta_numero, ricevuta_data,
                       uscita_contanti_id, note, stato,
                       created_at
                FROM prestazioni_occasionali_log
                WHERE {' AND '.join(where)}
                ORDER BY data_prestazione DESC, id DESC""",
            params,
        )
        return JSONResponse(content=[dict(r) for r in cur.fetchall()])
    finally:
        conn.close()


# ============================================================
# POST /occasionali/ricevute — registra ricevuta PrestO
# ============================================================
@router.post("/ricevute")
def post_registra_ricevuta(
    payload: RicevutaPrestoIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Registra una ricevuta PrestO / Libretto Famiglia associata al prestatore."""
    _require_feature()
    canale = (payload.canale or "PRESTO").upper().strip()
    if canale not in ("PRESTO", "LIBRETTO_FAMIGLIA"):
        raise HTTPException(status_code=400, detail="canale deve essere PRESTO o LIBRETTO_FAMIGLIA")

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        # Verifica che il dipendente sia OCCASIONALE
        cur.execute(
            "SELECT id, UPPER(COALESCE(forma_rapporto,'DIPENDENTE')) AS fr FROM dipendenti WHERE id = ?",
            (payload.dipendente_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Dipendente non trovato")
        if row["fr"] != "OCCASIONALE":
            raise HTTPException(
                status_code=400,
                detail="Il dipendente non ha forma_rapporto='OCCASIONALE' — imposta prima la forma corretta in anagrafica",
            )

        cur.execute(
            """INSERT INTO prestazioni_occasionali_log
               (dipendente_id, data_prestazione, ore, importo_lordo,
                importo_netto, canale, ricevuta_numero, ricevuta_data,
                uscita_contanti_id, note, stato)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRATO')""",
            (
                payload.dipendente_id,
                payload.data_prestazione,
                payload.ore,
                payload.importo_lordo,
                payload.importo_netto,
                canale,
                (payload.ricevuta_numero or "").strip() or None,
                (payload.ricevuta_data or "").strip() or None,
                payload.uscita_contanti_id,
                (payload.note or "").strip() or None,
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
        cur.execute(
            """SELECT id, dipendente_id, data_prestazione, ore,
                      importo_lordo, importo_netto, canale,
                      ricevuta_numero, ricevuta_data,
                      uscita_contanti_id, note, stato, created_at
               FROM prestazioni_occasionali_log WHERE id = ?""",
            (new_id,),
        )
        return JSONResponse(content=dict(cur.fetchone()))
    finally:
        conn.close()


# ============================================================
# DELETE /occasionali/ricevute/{id} — annulla ricevuta
# ============================================================
@router.delete("/ricevute/{ricevuta_id}")
def delete_ricevuta(
    ricevuta_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Soft-delete: marca stato='ANNULLATO' per mantenere audit trail."""
    _require_feature()
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE prestazioni_occasionali_log SET stato='ANNULLATO', "
            "updated_at=datetime('now','localtime') WHERE id = ?",
            (ricevuta_id,),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Ricevuta non trovata")
        conn.commit()
        return {"ok": True, "id": ricevuta_id}
    finally:
        conn.close()
