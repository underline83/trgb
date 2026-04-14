# @version: v1.0-turni-router
# -*- coding: utf-8 -*-
"""
Router Turni v2 — TRGB Gestionale

Endpoint per il Foglio Settimana (matrice giorno×slot), calcolo ore nette
e copia settimana. Lavora su dipendenti.sqlite3 tramite turni_service.

Tutti gli endpoint richiedono JWT.

Prefisso: /turni

- GET  /turni/foglio?reparto_id=X&settimana=YYYY-Www
- POST /turni/foglio/assegna
- PUT  /turni/foglio/{turno_id}
- DELETE /turni/foglio/{turno_id}
- GET  /turni/ore-nette?reparto_id=X&settimana=YYYY-Www
- POST /turni/copia-settimana
- GET  /turni/chiusure?settimana=YYYY-Www
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.dipendenti_db import get_dipendenti_conn, init_dipendenti_db
from app.services.auth_service import get_current_user
from app.services import turni_service


router = APIRouter(prefix="/turni", tags=["Turni"])

# Inizializza DB alla prima importazione
init_dipendenti_db()


# ============================================================
# MODELLI Pydantic
# ============================================================
class AssegnaTurnoIn(BaseModel):
    reparto_id: int
    dipendente_id: int
    data: str                       # YYYY-MM-DD
    servizio: str                   # PRANZO / CENA
    slot_index: int = Field(ge=0)   # 0-based
    ora_inizio: Optional[str] = None
    ora_fine: Optional[str] = None
    stato: str = "CONFERMATO"       # CONFERMATO / CHIAMATA / ANNULLATO
    note: Optional[str] = None
    turno_tipo_id: Optional[int] = None  # se non specificato → tipo default per servizio


class ModificaTurnoIn(BaseModel):
    dipendente_id: Optional[int] = None
    servizio: Optional[str] = None
    slot_index: Optional[int] = None
    ora_inizio: Optional[str] = None
    ora_fine: Optional[str] = None
    stato: Optional[str] = None
    note: Optional[str] = None


class CopiaSettimanaIn(BaseModel):
    reparto_id: int
    from_settimana: str   # YYYY-Www
    to_settimana: str     # YYYY-Www
    sovrascrivi: bool = False


# ============================================================
# HELPER — tipo turno default per servizio/reparto
# ============================================================
def _trova_o_crea_tipo_default(
    conn,
    reparto_codice: str,
    servizio: str,
    ora_inizio: str,
    ora_fine: str,
) -> int:
    """Trova (o crea) un turno_tipo compatibile con reparto+servizio.

    Cerca per (ruolo=codice reparto, servizio, ore compatibili); se non
    esiste ne crea uno minimale (categoria=LAVORO).
    """
    cur = conn.cursor()
    codice = f"{reparto_codice}-{servizio}".upper()
    nome = f"{reparto_codice.title()} {servizio.title()}"

    cur.execute(
        "SELECT id FROM turni_tipi WHERE codice = ? LIMIT 1",
        (codice,),
    )
    row = cur.fetchone()
    if row:
        return int(row["id"])

    # Crea tipo default
    colore_bg = "#DBEAFE" if servizio.upper() == "PRANZO" else "#FEF3C7"
    colore_testo = "#1E3A8A" if servizio.upper() == "PRANZO" else "#92400E"
    cur.execute(
        """INSERT INTO turni_tipi
           (codice, nome, ruolo, colore_bg, colore_testo,
            ora_inizio, ora_fine, ordine, attivo,
            categoria, servizio, ore_lavoro, icona)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 'LAVORO', ?, NULL, NULL)""",
        (
            codice, nome, reparto_codice,
            colore_bg, colore_testo,
            ora_inizio, ora_fine,
            servizio.upper(),
        ),
    )
    return int(cur.lastrowid)


def _valida_data(d: str) -> str:
    try:
        date.fromisoformat(d)
        return d
    except Exception:
        raise HTTPException(status_code=400, detail=f"Data non valida: {d}")


# ============================================================
# GET /turni/foglio
# ============================================================
@router.get("/foglio")
def get_foglio_settimana(
    reparto_id: int = Query(...),
    settimana: Optional[str] = Query(None, description="YYYY-Www, default = settimana corrente"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    iso = settimana or turni_service.settimana_corrente()
    try:
        foglio = turni_service.build_foglio_settimana(reparto_id, iso)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # aggiungi chiusure
    foglio["chiusure"] = turni_service.giorni_chiusi_nella_settimana(iso)
    return JSONResponse(content=foglio)


# ============================================================
# POST /turni/foglio/assegna
# ============================================================
@router.post("/foglio/assegna")
def assegna_turno(
    payload: AssegnaTurnoIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    _valida_data(payload.data)
    servizio = payload.servizio.upper().strip()
    if servizio not in ("PRANZO", "CENA"):
        raise HTTPException(status_code=400, detail="servizio deve essere PRANZO o CENA")
    stato = payload.stato.upper().strip()
    if stato not in ("CONFERMATO", "CHIAMATA", "ANNULLATO"):
        raise HTTPException(status_code=400, detail="stato non valido")

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()

        # Reparto
        cur.execute(
            """SELECT codice, pranzo_inizio, pranzo_fine, cena_inizio, cena_fine
               FROM reparti WHERE id = ?""",
            (payload.reparto_id,),
        )
        rep = cur.fetchone()
        if not rep:
            raise HTTPException(status_code=404, detail="Reparto non trovato")
        rep = dict(rep)

        # Dipendente appartiene al reparto
        cur.execute(
            "SELECT reparto_id, attivo FROM dipendenti WHERE id = ?",
            (payload.dipendente_id,),
        )
        d = cur.fetchone()
        if not d:
            raise HTTPException(status_code=404, detail="Dipendente non trovato")
        if not bool(d["attivo"]):
            raise HTTPException(status_code=400, detail="Dipendente non attivo")
        if d["reparto_id"] != payload.reparto_id:
            raise HTTPException(
                status_code=400,
                detail="Dipendente non appartiene a questo reparto",
            )

        # Orari default dal reparto se non specificati
        if servizio == "PRANZO":
            ora_ini = payload.ora_inizio or rep["pranzo_inizio"] or "12:00"
            ora_fin = payload.ora_fine or rep["pranzo_fine"] or "15:00"
        else:
            ora_ini = payload.ora_inizio or rep["cena_inizio"] or "19:00"
            ora_fin = payload.ora_fine or rep["cena_fine"] or "23:00"

        # Turno tipo: se specificato usa quello, altrimenti default per servizio
        turno_tipo_id = payload.turno_tipo_id
        if not turno_tipo_id:
            turno_tipo_id = _trova_o_crea_tipo_default(
                conn, rep["codice"], servizio, ora_ini, ora_fin
            )

        # Verifica che lo slot non sia già occupato (stesso reparto/data/servizio/slot)
        cur.execute(
            """SELECT tc.id FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
               WHERE d.reparto_id = ? AND tc.data = ?
                 AND UPPER(COALESCE(tt.servizio,'')) = ?
                 AND tc.slot_index = ?
               LIMIT 1""",
            (payload.reparto_id, payload.data, servizio, payload.slot_index),
        )
        existing = cur.fetchone()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Slot già occupato (turno id={existing['id']})",
            )

        cur.execute(
            """INSERT INTO turni_calendario
               (dipendente_id, turno_tipo_id, data, ora_inizio, ora_fine,
                stato, note, slot_index, origine)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUALE')""",
            (
                payload.dipendente_id, turno_tipo_id, payload.data,
                ora_ini, ora_fin, stato,
                (payload.note or "").strip() or None,
                payload.slot_index,
            ),
        )
        new_id = cur.lastrowid
        conn.commit()

        # Ricarica record completo
        cur.execute(
            """SELECT tc.id, tc.data, tc.dipendente_id, tc.turno_tipo_id,
                      COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
                      COALESCE(tc.ora_fine, tt.ora_fine) AS ora_fine,
                      tc.stato, tc.note, tc.slot_index, tc.ore_effettive, tc.origine,
                      COALESCE(tt.servizio,'') AS servizio,
                      d.nome AS dipendente_nome, d.cognome AS dipendente_cognome,
                      d.colore AS dipendente_colore
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
               WHERE tc.id = ?""",
            (new_id,),
        )
        row = cur.fetchone()
        return JSONResponse(content=dict(row))
    finally:
        conn.close()


# ============================================================
# PUT /turni/foglio/{turno_id}
# ============================================================
@router.put("/foglio/{turno_id}")
def modifica_turno(
    turno_id: int,
    payload: ModificaTurnoIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT tc.id, tc.dipendente_id, tc.data, tc.slot_index, tc.turno_tipo_id,
                      d.reparto_id
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               WHERE tc.id = ?""",
            (turno_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Turno non trovato")

        updates: List[str] = []
        params: List[Any] = []

        if payload.dipendente_id is not None:
            # Verifica stesso reparto
            cur.execute(
                "SELECT reparto_id, attivo FROM dipendenti WHERE id = ?",
                (payload.dipendente_id,),
            )
            nd = cur.fetchone()
            if not nd:
                raise HTTPException(status_code=404, detail="Dipendente non trovato")
            if nd["reparto_id"] != row["reparto_id"]:
                raise HTTPException(status_code=400, detail="Dipendente di reparto diverso")
            updates.append("dipendente_id = ?")
            params.append(payload.dipendente_id)

        if payload.ora_inizio is not None:
            updates.append("ora_inizio = ?")
            params.append(payload.ora_inizio.strip())
        if payload.ora_fine is not None:
            updates.append("ora_fine = ?")
            params.append(payload.ora_fine.strip())
        if payload.stato is not None:
            st = payload.stato.upper().strip()
            if st not in ("CONFERMATO", "CHIAMATA", "ANNULLATO"):
                raise HTTPException(status_code=400, detail="stato non valido")
            updates.append("stato = ?")
            params.append(st)
        if payload.note is not None:
            updates.append("note = ?")
            params.append(payload.note.strip() or None)
        if payload.slot_index is not None:
            updates.append("slot_index = ?")
            params.append(payload.slot_index)

        if not updates:
            conn.close()
            return JSONResponse(content={"ok": True, "changed": 0})

        params.append(turno_id)
        cur.execute(f"UPDATE turni_calendario SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

        cur.execute(
            """SELECT tc.id, tc.data, tc.dipendente_id, tc.turno_tipo_id,
                      COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
                      COALESCE(tc.ora_fine, tt.ora_fine) AS ora_fine,
                      tc.stato, tc.note, tc.slot_index, tc.ore_effettive, tc.origine,
                      COALESCE(tt.servizio,'') AS servizio,
                      d.nome AS dipendente_nome, d.cognome AS dipendente_cognome,
                      d.colore AS dipendente_colore
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
               WHERE tc.id = ?""",
            (turno_id,),
        )
        r = cur.fetchone()
        return JSONResponse(content=dict(r) if r else {})
    finally:
        conn.close()


# ============================================================
# DELETE /turni/foglio/{turno_id}
# ============================================================
@router.delete("/foglio/{turno_id}")
def cancella_turno(
    turno_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM turni_calendario WHERE id = ?", (turno_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Turno non trovato")
        conn.commit()
        return {"ok": True, "id": turno_id}
    finally:
        conn.close()


# ============================================================
# GET /turni/ore-nette
# ============================================================
@router.get("/ore-nette")
def get_ore_nette(
    reparto_id: int = Query(...),
    settimana: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    iso = settimana or turni_service.settimana_corrente()
    data = turni_service.ore_nette_settimana_per_reparto(reparto_id, iso)
    return JSONResponse(content={"settimana": iso, "reparto_id": reparto_id, "dipendenti": data})


# ============================================================
# POST /turni/copia-settimana
# ============================================================
@router.post("/copia-settimana")
def post_copia_settimana(
    payload: CopiaSettimanaIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        out = turni_service.copia_settimana(
            reparto_id=payload.reparto_id,
            from_iso=payload.from_settimana,
            to_iso=payload.to_settimana,
            sovrascrivi=payload.sovrascrivi,
        )
        return JSONResponse(content={"ok": True, **out})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================
# GET /turni/chiusure
# ============================================================
@router.get("/chiusure")
def get_chiusure_settimana(
    settimana: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    iso = settimana or turni_service.settimana_corrente()
    return JSONResponse(content={"settimana": iso, "chiusure": turni_service.giorni_chiusi_nella_settimana(iso)})
