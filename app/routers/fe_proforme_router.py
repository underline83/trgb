# @version: v1.0-proforme
# -*- coding: utf-8 -*-
"""
Router per gestione Pro-forme nel modulo Acquisti.

Una proforma è un documento pre-fattura che vive SOLO nello scadenziario
(cg_uscite con tipo_uscita='PROFORMA'). NON appare in dashboard/KPI/stats.

Quando arriva la fattura vera (FIC/XML), Marco riconcilia manualmente.

Endpoint:
  GET    /contabilita/fe/proforme           — lista proforme
  POST   /contabilita/fe/proforme           — crea proforma + riga cg_uscite
  GET    /contabilita/fe/proforme/{id}      — dettaglio
  PUT    /contabilita/fe/proforme/{id}      — modifica (solo se ATTIVA)
  DELETE /contabilita/fe/proforme/{id}      — annulla proforma
  POST   /contabilita/fe/proforme/{id}/riconcilia  — collega a fattura
  POST   /contabilita/fe/proforme/{id}/dissocia    — scollega da fattura
  GET    /contabilita/fe/proforme/{id}/candidates  — fatture candidate per riconciliazione
  GET    /contabilita/fe/proforme/fornitori/search  — ricerca fornitori per autocomplete
"""

import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/contabilita/fe/proforme",
    tags=["contabilita-fe-proforme"],
    dependencies=[Depends(get_current_user)],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FOODCOST_DB_PATH = BASE_DIR / "data" / "foodcost.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(FOODCOST_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ═══════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════

class ProformaCreate(BaseModel):
    fornitore_piva: Optional[str] = None
    fornitore_nome: str
    fornitore_cf: Optional[str] = None
    importo: float
    data_scadenza: str  # YYYY-MM-DD
    data_emissione: Optional[str] = None
    numero_proforma: Optional[str] = None
    note: Optional[str] = None
    # Se fornitore nuovo (non esiste in fe_fornitore_categoria)
    crea_fornitore: bool = False


class ProformaUpdate(BaseModel):
    fornitore_piva: Optional[str] = None
    fornitore_nome: Optional[str] = None
    fornitore_cf: Optional[str] = None
    importo: Optional[float] = None
    data_scadenza: Optional[str] = None
    data_emissione: Optional[str] = None
    numero_proforma: Optional[str] = None
    note: Optional[str] = None


class RiconciliaPayload(BaseModel):
    fattura_id: int


# ═══════════════════════════════════════════════════════════════════
# RICERCA FORNITORI (per autocomplete)
# ═══════════════════════════════════════════════════════════════════

@router.get("/fornitori/search")
def search_fornitori(
    q: str = Query("", min_length=0),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
):
    """
    Cerca fornitori in fe_fornitore_categoria per autocomplete.
    Restituisce nome + piva + cf (se disponibile in fe_fatture).
    """
    conn = _get_conn()
    try:
        if not q.strip():
            rows = conn.execute("""
                SELECT DISTINCT
                    fc.fornitore_nome, fc.fornitore_piva,
                    f.fornitore_cf
                FROM fe_fornitore_categoria fc
                LEFT JOIN fe_fatture f ON fc.fornitore_piva = f.fornitore_piva
                    AND fc.fornitore_piva IS NOT NULL
                    AND fc.fornitore_piva != ''
                WHERE COALESCE(fc.escluso_acquisti, 0) = 0
                GROUP BY fc.fornitore_piva, fc.fornitore_nome
                ORDER BY fc.fornitore_nome ASC
                LIMIT ?
            """, (limit,)).fetchall()
        else:
            like = f"%{q.strip()}%"
            rows = conn.execute("""
                SELECT DISTINCT
                    fc.fornitore_nome, fc.fornitore_piva,
                    f.fornitore_cf
                FROM fe_fornitore_categoria fc
                LEFT JOIN fe_fatture f ON fc.fornitore_piva = f.fornitore_piva
                    AND fc.fornitore_piva IS NOT NULL
                    AND fc.fornitore_piva != ''
                WHERE COALESCE(fc.escluso_acquisti, 0) = 0
                  AND (fc.fornitore_nome LIKE ? OR fc.fornitore_piva LIKE ?)
                GROUP BY fc.fornitore_piva, fc.fornitore_nome
                ORDER BY fc.fornitore_nome ASC
                LIMIT ?
            """, (like, like, limit)).fetchall()

        return [dict(r) for r in rows]
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# LISTA PROFORME
# ═══════════════════════════════════════════════════════════════════

@router.get("/")
def lista_proforme(
    stato: Optional[str] = Query(None, description="ATTIVA, RICONCILIATA, ANNULLATA"),
    fornitore: Optional[str] = Query(None),
    da: Optional[str] = Query(None, description="data_scadenza >= YYYY-MM-DD"),
    a: Optional[str] = Query(None, description="data_scadenza <= YYYY-MM-DD"),
    current_user=Depends(get_current_user),
):
    conn = _get_conn()
    try:
        where = []
        params = []

        if stato:
            where.append("p.stato = ?")
            params.append(stato.upper())
        if fornitore:
            like = f"%{fornitore}%"
            where.append("(p.fornitore_nome LIKE ? OR p.fornitore_piva LIKE ?)")
            params.extend([like, like])
        if da:
            where.append("p.data_scadenza >= ?")
            params.append(da)
        if a:
            where.append("p.data_scadenza <= ?")
            params.append(a)

        where_sql = " AND ".join(where) if where else "1=1"

        rows = conn.execute(f"""
            SELECT
                p.*,
                f.numero_fattura AS fattura_numero,
                f.data_fattura AS fattura_data,
                f.totale_fattura AS fattura_totale
            FROM fe_proforme p
            LEFT JOIN fe_fatture f ON p.fattura_id = f.id
            WHERE {where_sql}
            ORDER BY
                CASE p.stato
                    WHEN 'ATTIVA' THEN 0
                    WHEN 'RICONCILIATA' THEN 1
                    WHEN 'ANNULLATA' THEN 2
                END,
                p.data_scadenza ASC
        """, params).fetchall()

        # Contatori per badge
        totals = conn.execute("""
            SELECT
                COUNT(*) AS totale,
                SUM(CASE WHEN stato = 'ATTIVA' THEN 1 ELSE 0 END) AS attive,
                SUM(CASE WHEN stato = 'ATTIVA' THEN importo ELSE 0 END) AS importo_attive
            FROM fe_proforme
        """).fetchone()

        return {
            "proforme": [dict(r) for r in rows],
            "totale": totals["totale"],
            "attive": totals["attive"],
            "importo_attive": round(totals["importo_attive"] or 0, 2),
        }
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# DETTAGLIO
# ═══════════════════════════════════════════════════════════════════

@router.get("/{proforma_id}")
def dettaglio_proforma(
    proforma_id: int,
    current_user=Depends(get_current_user),
):
    conn = _get_conn()
    try:
        row = conn.execute("""
            SELECT
                p.*,
                f.numero_fattura AS fattura_numero,
                f.data_fattura AS fattura_data,
                f.totale_fattura AS fattura_totale,
                f.fornitore_nome AS fattura_fornitore
            FROM fe_proforme p
            LEFT JOIN fe_fatture f ON p.fattura_id = f.id
            WHERE p.id = ?
        """, (proforma_id,)).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Proforma non trovata")

        return dict(row)
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# CREAZIONE
# ═══════════════════════════════════════════════════════════════════

@router.post("/", status_code=201)
def crea_proforma(
    payload: ProformaCreate,
    current_user=Depends(get_current_user),
):
    """
    Crea una proforma + riga in cg_uscite (tipo_uscita='PROFORMA').
    Se crea_fornitore=True, crea anche una riga in fe_fornitore_categoria.
    """
    conn = _get_conn()
    try:
        oggi = date.today().isoformat()

        # ── Crea fornitore se richiesto ──
        if payload.crea_fornitore:
            # Controlla se esiste già (per piva o per nome)
            existing = None
            if payload.fornitore_piva:
                existing = conn.execute(
                    "SELECT id FROM fe_fornitore_categoria WHERE fornitore_piva = ?",
                    (payload.fornitore_piva,),
                ).fetchone()
            if not existing:
                existing = conn.execute(
                    """SELECT id FROM fe_fornitore_categoria
                       WHERE fornitore_nome = ? AND (fornitore_piva IS NULL OR fornitore_piva = '')""",
                    (payload.fornitore_nome,),
                ).fetchone()

            if not existing:
                conn.execute(
                    """INSERT INTO fe_fornitore_categoria
                       (fornitore_piva, fornitore_nome)
                       VALUES (?, ?)""",
                    (payload.fornitore_piva or "", payload.fornitore_nome),
                )
                conn.commit()

        # ── Inserisci proforma ──
        cur = conn.execute("""
            INSERT INTO fe_proforme
                (fornitore_piva, fornitore_nome, fornitore_cf,
                 importo, data_scadenza, data_emissione,
                 numero_proforma, note, stato, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATTIVA', ?, ?)
        """, (
            payload.fornitore_piva or "",
            payload.fornitore_nome,
            payload.fornitore_cf or "",
            payload.importo,
            payload.data_scadenza,
            payload.data_emissione,
            payload.numero_proforma,
            payload.note,
            oggi, oggi,
        ))
        proforma_id = cur.lastrowid

        # ── Crea riga in cg_uscite (scadenziario) ──
        # Stato: DA_PAGARE o SCADUTA in base alla data
        stato_uscita = "SCADUTA" if payload.data_scadenza < oggi else "DA_PAGARE"

        cur2 = conn.execute("""
            INSERT INTO cg_uscite
                (fornitore_nome, fornitore_piva, totale,
                 data_scadenza, stato, tipo_uscita, note,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'PROFORMA', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, (
            payload.fornitore_nome,
            payload.fornitore_piva or "",
            payload.importo,
            payload.data_scadenza,
            stato_uscita,
            f"Proforma #{payload.numero_proforma or proforma_id}" + (f" — {payload.note}" if payload.note else ""),
        ))
        cg_uscita_id = cur2.lastrowid

        # ── Aggiorna proforma con cg_uscita_id ──
        conn.execute(
            "UPDATE fe_proforme SET cg_uscita_id = ? WHERE id = ?",
            (cg_uscita_id, proforma_id),
        )

        conn.commit()

        return {
            "ok": True,
            "id": proforma_id,
            "cg_uscita_id": cg_uscita_id,
            "stato_uscita": stato_uscita,
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# MODIFICA
# ═══════════════════════════════════════════════════════════════════

@router.put("/{proforma_id}")
def modifica_proforma(
    proforma_id: int,
    payload: ProformaUpdate,
    current_user=Depends(get_current_user),
):
    conn = _get_conn()
    try:
        existing = conn.execute(
            "SELECT * FROM fe_proforme WHERE id = ?", (proforma_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Proforma non trovata")
        existing = dict(existing)

        if existing["stato"] != "ATTIVA":
            raise HTTPException(
                status_code=400,
                detail=f"Non puoi modificare una proforma {existing['stato']}"
            )

        # Aggiorna solo i campi forniti
        updates = {}
        for field in ["fornitore_piva", "fornitore_nome", "fornitore_cf",
                       "importo", "data_scadenza", "data_emissione",
                       "numero_proforma", "note"]:
            val = getattr(payload, field, None)
            if val is not None:
                updates[field] = val

        if not updates:
            return {"ok": True, "message": "Nessuna modifica"}

        updates["updated_at"] = date.today().isoformat()

        set_sql = ", ".join(f"{k} = ?" for k in updates)
        params = list(updates.values()) + [proforma_id]
        conn.execute(f"UPDATE fe_proforme SET {set_sql} WHERE id = ?", params)

        # ── Aggiorna anche cg_uscite se campi rilevanti ──
        cg_id = existing["cg_uscita_id"]
        if cg_id:
            cg_updates = {}
            if "fornitore_nome" in updates:
                cg_updates["fornitore_nome"] = updates["fornitore_nome"]
            if "fornitore_piva" in updates:
                cg_updates["fornitore_piva"] = updates["fornitore_piva"]
            if "importo" in updates:
                cg_updates["totale"] = updates["importo"]
            if "data_scadenza" in updates:
                cg_updates["data_scadenza"] = updates["data_scadenza"]
                oggi = date.today().isoformat()
                cg_updates["stato"] = "SCADUTA" if updates["data_scadenza"] < oggi else "DA_PAGARE"

            if cg_updates:
                cg_updates["updated_at"] = "CURRENT_TIMESTAMP"
                set_parts = []
                cg_params = []
                for k, v in cg_updates.items():
                    if v == "CURRENT_TIMESTAMP":
                        set_parts.append(f"{k} = CURRENT_TIMESTAMP")
                    else:
                        set_parts.append(f"{k} = ?")
                        cg_params.append(v)
                cg_params.append(cg_id)
                conn.execute(
                    f"UPDATE cg_uscite SET {', '.join(set_parts)} WHERE id = ?",
                    cg_params
                )

        conn.commit()
        return {"ok": True, "updated": list(updates.keys())}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# ANNULLAMENTO
# ═══════════════════════════════════════════════════════════════════

@router.delete("/{proforma_id}")
def annulla_proforma(
    proforma_id: int,
    current_user=Depends(get_current_user),
):
    """Annulla una proforma ATTIVA. Cancella la riga cg_uscite collegata."""
    conn = _get_conn()
    try:
        existing = conn.execute(
            "SELECT id, stato, cg_uscita_id FROM fe_proforme WHERE id = ?",
            (proforma_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Proforma non trovata")

        existing = dict(existing)
        if existing["stato"] != "ATTIVA":
            raise HTTPException(
                status_code=400,
                detail=f"Non puoi annullare una proforma {existing['stato']}"
            )

        # Annulla proforma
        conn.execute(
            "UPDATE fe_proforme SET stato = 'ANNULLATA', updated_at = ? WHERE id = ?",
            (date.today().isoformat(), proforma_id),
        )

        # Cancella riga cg_uscite
        if existing["cg_uscita_id"]:
            conn.execute(
                "DELETE FROM cg_uscite WHERE id = ? AND tipo_uscita = 'PROFORMA'",
                (existing["cg_uscita_id"],),
            )

        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# RICONCILIAZIONE
# ═══════════════════════════════════════════════════════════════════

@router.post("/{proforma_id}/riconcilia")
def riconcilia_proforma(
    proforma_id: int,
    payload: RiconciliaPayload,
    current_user=Depends(get_current_user),
):
    """
    Riconcilia una proforma con una fattura.
    - proforma.stato → RICONCILIATA
    - riga cg_uscite PROFORMA → cancellata
    - la fattura ha già la sua riga cg_uscite dall'import
    """
    conn = _get_conn()
    try:
        proforma = conn.execute(
            "SELECT * FROM fe_proforme WHERE id = ?", (proforma_id,)
        ).fetchone()
        if not proforma:
            raise HTTPException(status_code=404, detail="Proforma non trovata")
        proforma = dict(proforma)

        if proforma["stato"] != "ATTIVA":
            raise HTTPException(
                status_code=400,
                detail=f"Non puoi riconciliare una proforma {proforma['stato']}"
            )

        # Verifica fattura
        fattura = conn.execute(
            "SELECT id, fornitore_nome, totale_fattura FROM fe_fatture WHERE id = ?",
            (payload.fattura_id,),
        ).fetchone()
        if not fattura:
            raise HTTPException(status_code=404, detail="Fattura non trovata")

        oggi = date.today().isoformat()

        # Aggiorna proforma
        conn.execute("""
            UPDATE fe_proforme SET
                stato = 'RICONCILIATA',
                fattura_id = ?,
                data_riconciliazione = ?,
                updated_at = ?
            WHERE id = ?
        """, (payload.fattura_id, oggi, oggi, proforma_id))

        # Cancella riga cg_uscite PROFORMA
        if proforma["cg_uscita_id"]:
            conn.execute(
                "DELETE FROM cg_uscite WHERE id = ? AND tipo_uscita = 'PROFORMA'",
                (proforma["cg_uscita_id"],),
            )

        conn.commit()

        return {
            "ok": True,
            "fattura_id": payload.fattura_id,
            "fattura_fornitore": fattura["fornitore_nome"],
            "fattura_totale": fattura["totale_fattura"],
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{proforma_id}/dissocia")
def dissocia_proforma(
    proforma_id: int,
    current_user=Depends(get_current_user),
):
    """
    Annulla riconciliazione: torna ATTIVA, ricrea riga cg_uscite.
    """
    conn = _get_conn()
    try:
        proforma = conn.execute(
            "SELECT * FROM fe_proforme WHERE id = ?", (proforma_id,)
        ).fetchone()
        if not proforma:
            raise HTTPException(status_code=404, detail="Proforma non trovata")
        proforma = dict(proforma)

        if proforma["stato"] != "RICONCILIATA":
            raise HTTPException(
                status_code=400,
                detail="Solo proforme RICONCILIATE possono essere dissociate"
            )

        oggi = date.today().isoformat()
        stato_uscita = "SCADUTA" if proforma["data_scadenza"] < oggi else "DA_PAGARE"

        # Ricrea riga cg_uscite
        cur = conn.execute("""
            INSERT INTO cg_uscite
                (fornitore_nome, fornitore_piva, totale,
                 data_scadenza, stato, tipo_uscita, note,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'PROFORMA', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, (
            proforma["fornitore_nome"],
            proforma["fornitore_piva"] or "",
            proforma["importo"],
            proforma["data_scadenza"],
            stato_uscita,
            f"Proforma #{proforma['numero_proforma'] or proforma['id']}",
        ))
        new_cg_id = cur.lastrowid

        # Aggiorna proforma
        conn.execute("""
            UPDATE fe_proforme SET
                stato = 'ATTIVA',
                fattura_id = NULL,
                cg_uscita_id = ?,
                data_riconciliazione = NULL,
                updated_at = ?
            WHERE id = ?
        """, (new_cg_id, oggi, proforma_id))

        conn.commit()
        return {"ok": True, "cg_uscita_id": new_cg_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# CANDIDATI PER RICONCILIAZIONE
# ═══════════════════════════════════════════════════════════════════

@router.get("/{proforma_id}/candidates")
def candidates_riconciliazione(
    proforma_id: int,
    current_user=Depends(get_current_user),
):
    """
    Lista fatture candidate per riconciliazione con una proforma.
    Criteri: stesso fornitore (piva o nome), importo ±30%, non già collegate.
    """
    conn = _get_conn()
    try:
        proforma = conn.execute(
            "SELECT * FROM fe_proforme WHERE id = ?", (proforma_id,)
        ).fetchone()
        if not proforma:
            raise HTTPException(status_code=404, detail="Proforma non trovata")
        proforma = dict(proforma)

        importo = proforma["importo"]
        min_imp = importo * 0.7
        max_imp = importo * 1.3
        piva = proforma["fornitore_piva"] or ""
        nome = proforma["fornitore_nome"]

        # Fatture già riconciliate con altre proforme
        already_linked = conn.execute(
            "SELECT fattura_id FROM fe_proforme WHERE fattura_id IS NOT NULL"
        ).fetchall()
        linked_ids = {r["fattura_id"] for r in already_linked}

        # Cerca per P.IVA (match forte) o per nome (fallback)
        where_fornitore = ""
        params = []
        if piva:
            where_fornitore = "(f.fornitore_piva = ? OR f.fornitore_nome LIKE ?)"
            params = [piva, f"%{nome}%"]
        else:
            where_fornitore = "f.fornitore_nome LIKE ?"
            params = [f"%{nome}%"]

        rows = conn.execute(f"""
            SELECT
                f.id, f.fornitore_nome, f.fornitore_piva,
                f.numero_fattura, f.data_fattura,
                f.totale_fattura, f.fonte,
                f.pagato
            FROM fe_fatture f
            WHERE {where_fornitore}
              AND f.totale_fattura BETWEEN ? AND ?
              AND f.is_autofattura = 0
              AND COALESCE(f.tipo_documento, 'TD01') NOT IN ('TD04')
            ORDER BY
                ABS(f.totale_fattura - ?) ASC,
                f.data_fattura DESC
            LIMIT 20
        """, params + [min_imp, max_imp, importo]).fetchall()

        # Filtra quelle già collegate
        candidates = [
            dict(r) for r in rows
            if r["id"] not in linked_ids
        ]

        return {"candidates": candidates, "proforma_importo": importo}
    finally:
        conn.close()
