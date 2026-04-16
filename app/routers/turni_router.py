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
from datetime import date, datetime
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
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
    stato: str = "CONFERMATO"       # CONFERMATO / OPZIONALE / ANNULLATO
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


# Fase 10: Template settimana tipo
class CreaTemplateIn(BaseModel):
    reparto_id: int
    settimana_sorgente: str  # YYYY-Www
    nome: str
    descrizione: Optional[str] = None


class RinominaTemplateIn(BaseModel):
    nome: Optional[str] = None
    descrizione: Optional[str] = None


class ApplicaTemplateIn(BaseModel):
    settimana_destinazione: str  # YYYY-Www
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
    if stato not in ("CONFERMATO", "OPZIONALE", "ANNULLATO"):
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
                      tt.nome AS turno_nome,
                      d.nome AS dipendente_nome, d.cognome AS dipendente_cognome,
                      d.nickname AS dipendente_nickname,
                      d.colore AS dipendente_colore
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
               WHERE tc.id = ?""",
            (new_id,),
        )
        row = cur.fetchone()
        out = dict(row) if row else {}

        # Fase 7 — warnings di conflitto orario per il dipendente+data
        conflitti = turni_service.carica_conflitti_dipendente_giorno(
            dipendente_id=payload.dipendente_id, data_iso=payload.data,
        )
        warns_for_this = next(
            (c["warnings"] for c in conflitti if c["turno_id"] == new_id),
            [],
        )
        out["warnings"] = warns_for_this
        out["conflitti_giorno"] = conflitti
        return JSONResponse(content=out)
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
            if st not in ("CONFERMATO", "OPZIONALE", "ANNULLATO"):
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
                      tt.nome AS turno_nome,
                      d.nome AS dipendente_nome, d.cognome AS dipendente_cognome,
                      d.nickname AS dipendente_nickname,
                      d.colore AS dipendente_colore
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
               WHERE tc.id = ?""",
            (turno_id,),
        )
        r = cur.fetchone()
        out = dict(r) if r else {}

        # Fase 7 — warnings conflitto per dipendente+data del turno modificato
        if out:
            conflitti = turni_service.carica_conflitti_dipendente_giorno(
                dipendente_id=int(out["dipendente_id"]), data_iso=out["data"],
            )
            warns_for_this = next(
                (c["warnings"] for c in conflitti if c["turno_id"] == turno_id),
                [],
            )
            out["warnings"] = warns_for_this
            out["conflitti_giorno"] = conflitti
        return JSONResponse(content=out)
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


# ============================================================
# GET /turni/mese  — Fase 5: vista mensile a griglia (sola lettura)
# ============================================================
@router.get("/mese")
def get_vista_mese(
    reparto_id: int = Query(...),
    anno: Optional[int] = Query(None, ge=2000, le=2100),
    mese: Optional[int] = Query(None, ge=1, le=12),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Vista mensile a griglia 6×7 per un reparto.

    Default = mese corrente. Ritorna 42 giorni (lunedì della settimana che
    contiene il 1° del mese + 41 giorni a seguire), tutti i turni di quei
    giorni per i dipendenti del reparto, chiusure e dipendenti attivi.
    """
    oggi = date.today()
    a = anno if anno is not None else oggi.year
    m = mese if mese is not None else oggi.month
    try:
        vista = turni_service.build_vista_mese(reparto_id, a, m)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return JSONResponse(content=vista)


# ============================================================
# GET /turni/dipendente  — Fase 6: timeline N settimane per 1 dipendente
# ============================================================
@router.get("/dipendente")
def get_vista_dipendente(
    dipendente_id: int = Query(..., ge=1),
    settimana_inizio: Optional[str] = Query(
        None, description="'YYYY-Www' prima settimana (default = settimana corrente)"
    ),
    num_settimane: int = Query(4, ge=1, le=12),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Timeline di un singolo dipendente su N settimane consecutive.

    Default `settimana_inizio` = settimana ISO corrente. Il servizio calcola
    per ogni giorno i turni, ore lorde/nette con deduzione pause staff, e
    produce totali di periodo (ore, giorni lavorati, riposi, chiusure,
    turni opzionali).
    """
    settimana = settimana_inizio or turni_service.settimana_corrente()
    try:
        vista = turni_service.build_vista_dipendente(
            dipendente_id=dipendente_id,
            settimana_inizio=settimana,
            num_settimane=num_settimane,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return JSONResponse(content=vista)


# ============================================================
# GET /turni/miei-turni  — timeline dell'utente loggato (self-service)
# ============================================================
@router.get("/miei-turni")
def get_miei_turni(
    settimana_inizio: Optional[str] = Query(
        None, description="'YYYY-Www' prima settimana (default = settimana corrente)"
    ),
    num_settimane: int = Query(4, ge=1, le=12),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Timeline dell'utente loggato — risolve username -> dipendente_id
    tramite il campo `dipendente_id` su users.json.

    Accessibile a qualsiasi ruolo autenticato. Se l'utente non e' collegato
    a un dipendente (campo `dipendente_id` assente in users.json), risponde
    404 con un messaggio chiaro per il frontend.
    """
    dip_id = current_user.get("dipendente_id")
    if not dip_id:
        raise HTTPException(
            status_code=404,
            detail="Il tuo utente non è collegato a un dipendente. Contatta l'amministratore.",
        )
    settimana = settimana_inizio or turni_service.settimana_corrente()
    try:
        vista = turni_service.build_vista_dipendente(
            dipendente_id=dip_id,
            settimana_inizio=settimana,
            num_settimane=num_settimane,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return JSONResponse(content=vista)


# ============================================================
# GET /turni/conflitti  — Fase 7: warning sovrapposizioni orarie
# ============================================================
@router.get("/conflitti")
def get_conflitti(
    dipendente_id: int = Query(..., ge=1),
    data: str = Query(..., description="YYYY-MM-DD"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Ritorna i warning di sovrapposizione orario per il dipendente in un giorno.

    Utile al FE per controllare preventivamente (anteprima dialog "assegna")
    se l'aggiunta di un turno genererà conflitti.

    Response:
      [ { turno_id, ora_inizio, ora_fine, servizio, stato,
          warnings: [{ other_id, overlap_min, other_ora_inizio,
                       other_ora_fine, other_servizio, other_stato,
                       other_turno_nome }] } ]
    """
    _valida_data(data)
    return JSONResponse(content=turni_service.carica_conflitti_dipendente_giorno(
        dipendente_id=dipendente_id, data_iso=data,
    ))


# ============================================================
# GET /turni/foglio/pdf  — Fase 8: PDF scaricabile (niente dialog stampante)
# ============================================================
def _text_on(hex_color: str) -> str:
    """Contrasto bianco/nero su bg HEX (stessa logica del FE)."""
    if not hex_color:
        return "#111"
    h = hex_color.lstrip("#")
    try:
        r = int(h[0:2], 16); g = int(h[2:4], 16); b = int(h[4:6], 16)
    except Exception:
        return "#111"
    yiq = (r * 299 + g * 587 + b * 114) / 1000
    return "#111" if yiq >= 160 else "#fff"


def _format_week_range(iso: str) -> str:
    """'2026-W16' → '13–19/04/2026' (o con mese diverso '28/04–04/05/2026')."""
    from datetime import timedelta
    try:
        year, week = iso.split("-W")
        year = int(year); week = int(week)
    except Exception:
        return iso
    jan4 = date(year, 1, 4)
    monday_w1 = jan4 - timedelta(days=jan4.isoweekday() - 1)
    monday = monday_w1 + timedelta(weeks=week - 1)
    sunday = monday + timedelta(days=6)
    if monday.month == sunday.month:
        return f"{monday.day:02d}–{sunday.day:02d}/{sunday.month:02d}/{sunday.year}"
    return f"{monday.day:02d}/{monday.month:02d}–{sunday.day:02d}/{sunday.month:02d}/{sunday.year}"


def _nome_giorno(iso_date: str) -> str:
    giorni = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
    try:
        d = date.fromisoformat(iso_date)
        return f"{giorni[d.weekday()]} {d.day:02d}/{d.month:02d}"
    except Exception:
        return iso_date


@router.get("/foglio/pdf")
def get_foglio_pdf(
    reparto_id: int = Query(...),
    settimana: Optional[str] = Query(None, description="YYYY-Www, default = settimana corrente"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Genera un PDF A4 landscape del foglio settimana (brand TRGB).

    Usa lo stesso build_foglio_settimana del FE + WeasyPrint per il rendering.
    In attesa del mattone M.B PDF brand; per ora template inline.
    """
    iso = settimana or turni_service.settimana_corrente()
    try:
        foglio = turni_service.build_foglio_settimana(reparto_id, iso)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    chiusure = set(turni_service.giorni_chiusi_nella_settimana(iso))
    reparto = foglio.get("reparto") or {}
    giorni = foglio.get("giorni") or []
    turni = foglio.get("turni") or []

    # Matrice [data][servizio][slot_index] → turno
    matrice: Dict[str, Dict[str, Dict[int, Dict[str, Any]]]] = {
        g: {"PRANZO": {}, "CENA": {}} for g in giorni
    }
    for t in turni:
        serv = (t.get("servizio") or "").upper()
        si = t.get("slot_index")
        d = t.get("data")
        if serv in ("PRANZO", "CENA") and si is not None and d in matrice:
            matrice[d][serv][int(si)] = t

    max_p = max(4, (foglio.get("max_slot_pranzo") or 3) + 1)
    max_c = max(4, (foglio.get("max_slot_cena") or 3) + 1)

    # Costruisci righe tabella (HTML puro — niente Jinja per evitare dipendenze loop)
    def cella_html(t: Optional[Dict[str, Any]]) -> str:
        if not t:
            return '<td class="empty">&nbsp;</td>'
        bg = t.get("dipendente_colore") or "#d1d5db"
        fg = _text_on(bg)
        nick = (t.get("dipendente_nickname") or "").strip()
        nome = (t.get("dipendente_nome") or "").strip()
        cog = (t.get("dipendente_cognome") or "").strip()
        primo = nome.split()[0] if nome else ""
        ini = cog[0] if cog else ""
        label = nick or f"{primo}{' ' + ini + '.' if ini else ''}"
        oi = (t.get("ora_inizio") or "")[:5]
        of = (t.get("ora_fine") or "")[:5]
        stato = (t.get("stato") or "").upper()
        opz = "★ " if stato == "OPZIONALE" else ""
        annul = ' style="opacity:.4"' if stato == "ANNULLATO" else ""
        return (
            f'<td class="turno" style="background:{bg};color:{fg};"{annul}>'
            f'<div class="nm">{opz}{label}</div>'
            f'<div class="or">{oi}-{of}</div>'
            f'</td>'
        )

    righe_html = []
    for g in giorni:
        chiuso = g in chiusure
        row_cls = "chiuso" if chiuso else ""
        celle = [f'<td class="day"><div class="dn">{_nome_giorno(g)}</div>'
                 + (f'<div class="cl">CHIUSO</div>' if chiuso else "") + '</td>']
        for si in range(max_p):
            celle.append('<td class="empty">—</td>' if chiuso else cella_html(matrice[g]["PRANZO"].get(si)))
        for si in range(max_c):
            celle.append('<td class="empty">—</td>' if chiuso else cella_html(matrice[g]["CENA"].get(si)))
        righe_html.append(f'<tr class="{row_cls}">{"".join(celle)}</tr>')

    # Header slot
    th_p = "".join(f'<th class="sp">P{i+1}</th>' for i in range(max_p))
    th_c = "".join(f'<th class="sc">C{i+1}</th>' for i in range(max_c))

    rep_colore = reparto.get("colore") or "#444"
    rep_nome = reparto.get("nome") or ""
    rep_icona = reparto.get("icona") or ""
    settimana_range = _format_week_range(iso)
    generato_il = datetime.now().strftime("%d/%m/%Y %H:%M")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Turni {iso}</title>
<style>
  @page {{ size: A4 landscape; margin: 10mm 8mm; }}
  body {{ font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; }}
  .header {{ text-align: center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }}
  .brand {{ font-size: 11px; color: #666; letter-spacing: 1px; text-transform: uppercase; }}
  .title {{ font-size: 20px; font-weight: 800; margin-top: 2px; }}
  .pill {{ display: inline-block; background: {rep_colore}; color: #fff; padding: 2px 10px; border-radius: 999px; font-size: 11px; margin-top: 4px; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }}
  th, td {{ border: 1px solid #888; padding: 2px 3px; vertical-align: middle; }}
  thead th {{ background: #f5f5f5; font-size: 10px; }}
  th.pr {{ background: #fef3c7; color: #92400e; font-weight: 700; }}
  th.cn {{ background: #e0e7ff; color: #3730a3; font-weight: 700; }}
  th.sp, th.sc {{ font-size: 9px; color: #666; font-weight: 600; }}
  td.day {{ background: #fafafa; font-weight: 600; font-size: 10px; width: 60px; }}
  td.day .dn {{ font-size: 10px; }}
  td.day .cl {{ font-size: 8px; color: #dc2626; }}
  td.empty {{ color: #ccc; text-align: center; }}
  td.turno {{ padding: 3px 4px; line-height: 1.2; }}
  td.turno .nm {{ font-weight: 700; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  td.turno .or {{ font-family: monospace; font-size: 8.5px; opacity: .85; }}
  tr.chiuso td.day {{ color: #aaa; }}
  tr.chiuso td {{ background: #fafafa; color: #bbb; }}
  .footer {{ margin-top: 8px; font-size: 8px; color: #888; display: flex; justify-content: space-between; }}
  .legenda {{ margin-top: 6px; font-size: 8.5px; color: #555; }}
  .legenda span {{ margin-right: 10px; }}
</style>
</head>
<body>
  <div class="header">
    <div class="brand">🍷 Osteria Tre Gobbi</div>
    <div class="title">Turni settimana {settimana_range}</div>
    <div class="pill">{rep_icona} {rep_nome}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Giorno</th>
        <th class="pr" colspan="{max_p}">☀ PRANZO</th>
        <th class="cn" colspan="{max_c}">🌙 CENA</th>
      </tr>
      <tr>
        <th></th>{th_p}{th_c}
      </tr>
    </thead>
    <tbody>
      {''.join(righe_html)}
    </tbody>
  </table>
  <div class="legenda">
    <span>★ turno opzionale (da confermare)</span>
    <span>— giorno di chiusura</span>
  </div>
  <div class="footer">
    <span>TRGB Gestionale — Turni v2</span>
    <span>Generato il {generato_il}</span>
    <span>Settimana ISO {iso}</span>
  </div>
</body></html>"""

    # Genera PDF con WeasyPrint
    try:
        from weasyprint import HTML as WeasyHTML
        pdf_bytes = WeasyHTML(string=html).write_pdf()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")

    filename = f"turni_{(reparto.get('codice') or 'reparto').lower()}_{iso}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ============================================================
# FASE 10 — TEMPLATE SETTIMANA TIPO
# ============================================================
@router.get("/template")
def list_templates(
    reparto_id: Optional[int] = Query(None, ge=1),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Lista template attivi (opzionalmente filtrati per reparto)."""
    return JSONResponse(content={
        "templates": turni_service.lista_templates(reparto_id=reparto_id),
    })


@router.get("/template/{template_id}")
def get_template(
    template_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    tpl = turni_service.get_template_dettaglio(template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return JSONResponse(content=tpl)


@router.post("/template")
def crea_template(
    payload: CreaTemplateIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Snapshot della settimana corrente → nuovo template."""
    try:
        out = turni_service.crea_template_da_settimana(
            reparto_id=payload.reparto_id,
            settimana_iso=payload.settimana_sorgente,
            nome=payload.nome,
            descrizione=payload.descrizione,
        )
        return JSONResponse(content={"ok": True, **out})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/template/{template_id}")
def aggiorna_template(
    template_id: int,
    payload: RinominaTemplateIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Aggiorna nome/descrizione del template."""
    try:
        out = turni_service.rinomina_template(
            template_id=template_id,
            nome=payload.nome,
            descrizione=payload.descrizione,
        )
        return JSONResponse(content={"ok": True, **out})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/template/{template_id}")
def rimuovi_template(
    template_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Soft-delete del template (attivo=0)."""
    try:
        out = turni_service.elimina_template(template_id)
        return JSONResponse(content={"ok": True, **out})
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/template/{template_id}/applica")
def applica_template_ep(
    template_id: int,
    payload: ApplicaTemplateIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Applica il template a una settimana destinazione."""
    try:
        out = turni_service.applica_template(
            template_id=template_id,
            settimana_iso=payload.settimana_destinazione,
            sovrascrivi=payload.sovrascrivi,
        )
        return JSONResponse(content={"ok": True, **out})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================
# FASE 11 — Pubblicazione & invio WhatsApp (M.A + M.C)
# ============================================================
class PubblicaSettimanaIn(BaseModel):
    reparto_id: int
    settimana: str  # YYYY-Www


@router.post("/pubblica")
def pubblica_settimana_ep(
    payload: PubblicaSettimanaIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Pubblica la settimana: crea una notifica (M.A) per avvisare lo staff admin
    che i turni di questo reparto sono pronti per la distribuzione.
    """
    try:
        out = turni_service.pubblica_settimana(
            reparto_id=payload.reparto_id,
            settimana_iso=payload.settimana,
        )
        return JSONResponse(content={"ok": True, **out})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/riepilogo-dipendenti")
def riepilogo_dipendenti_ep(
    reparto_id: int = Query(...),
    settimana: str = Query(..., description="YYYY-Www"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Riepilogo settimana per singolo dipendente: ritorna lista con testo_wa
    pronto per invio WhatsApp (mattone M.C).
    """
    try:
        out = turni_service.riepilogo_settimana_per_dipendenti(
            reparto_id=reparto_id,
            settimana_iso=settimana,
        )
        return JSONResponse(content={"ok": True, **out})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
