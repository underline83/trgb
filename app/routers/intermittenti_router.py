# @version: v1.0 — Comunicazione UNI-Intermittenti (sessione 2026-07-30)
# -*- coding: utf-8 -*-
"""
Router Intermittenti — TRGB Gestionale

Modulo: dipendenti
Classificazione: [core]
Endpoint prefix: /intermittenti
Tabelle DB: dipendenti_uni_comunicazioni, dipendenti_uni_comunicazioni_righe
Dipendenze platform: M.D email_service (via service), M.G auth
Frontend route: /dipendenti/intermittenti

Regola cross-modulo: nessun import da router di altri moduli. Tutta la logica
sta in `app/services/uni_intermittenti_service.py`; qui c'è solo il trasporto.

NOTA sui trailing slash: gli endpoint root del router ce l'hanno (`/da-comunicare/`,
`/comunicazioni/`) e il frontend li chiama con lo slash. Senza, FastAPI fa 307 e
il browser perde l'header Authorization → 401 → crash (regola nota di CLAUDE.md).
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response

from app.services import email_service
from app.services import uni_intermittenti_service as uni
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/intermittenti", tags=["Intermittenti"])


# ═════════════════════════════════════════════
# CONFIGURAZIONE
# ═════════════════════════════════════════════

@router.get("/settings/")
def get_settings_ep(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Parametri di invio + stato del canale email (M.D)."""
    return {"settings": uni.get_settings(), "smtp": email_service.stato()}


@router.put("/settings/")
def put_settings_ep(
    payload: Dict[str, str] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    return {"ok": True, "settings": uni.set_settings(payload)}


@router.get("/lavoratori/")
def lavoratori_ep(
    solo_intermittenti: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Elenco per la pagina Intermittenti (conteggio e diagnostica). La modifica
    di flag, CF e codice comunicazione si fa in **Anagrafica** (`/dipendenti/{id}`):
    un solo posto che scrive quei campi, così i due form non divergono.
    `intermittente` è il flag legale
    (contratto ex art. 15 D.Lgs 81/2015); `a_chiamata` è un'altra cosa —
    l'extra del turismo pagato a ore — e non fa scattare nessuna comunicazione.
    """
    return {"lavoratori": uni.lavoratori(solo_intermittenti=solo_intermittenti)}




# ═════════════════════════════════════════════
# PREVIEW E INVIO
# ═════════════════════════════════════════════

@router.get("/da-comunicare/")
def da_comunicare_ep(
    dal: str = Query(..., description="YYYY-MM-DD"),
    al: str = Query(..., description="YYYY-MM-DD"),
    reparto_id: Optional[int] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Cosa andrebbe comunicato nel periodo, come sarebbe spezzato in moduli, e cosa non torna."""
    try:
        out = uni.chiamate_da_comunicare(dal, al, reparto_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    out["settings"] = uni.get_settings()
    out["smtp"] = email_service.stato()
    return out


@router.post("/comunica/")
def comunica_ep(
    payload: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Body: {dal, al, reparto_id?, dry_run?, modulo?}

    Le righe le ricalcola SEMPRE il server dal periodo: il client dice quale
    periodo, non cosa dichiarare al Ministero. `modulo` (1-based) invia un solo
    modulo dei tanti; assente = tutti, uno per email in sequenza.

    Un modulo per email è un vincolo, non una scelta di stile: con più allegati
    l'invio sembra riuscito ma i moduli non entrano a sistema (INL 8716/2019).
    """
    dal, al = payload.get("dal"), payload.get("al")
    if not dal or not al:
        raise HTTPException(status_code=400, detail="Servono 'dal' e 'al' (YYYY-MM-DD)")
    dry_run = bool(payload.get("dry_run"))
    solo = payload.get("modulo")

    try:
        preview = uni.chiamate_da_comunicare(dal, al, payload.get("reparto_id"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    moduli: List[List[dict]] = preview["moduli"]
    if not moduli:
        return {"ok": False, "errori": ["Nessuna chiamata da comunicare nel periodo"],
                "anomalie": preview["anomalie"], "risultati": []}
    if solo:
        try:
            moduli = [moduli[int(solo) - 1]]
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail=f"Modulo {solo} inesistente")

    utente = (current_user or {}).get("username")
    risultati = [uni.comunica(m, dry_run=dry_run, utente=utente) for m in moduli]

    return {
        "ok": all(r["ok"] for r in risultati),
        "dry_run": dry_run,
        "n_moduli": len(risultati),
        "risultati": risultati,
        "anomalie": preview["anomalie"],
    }


@router.post("/test-email/")
def test_email_ep(
    payload: Dict[str, str] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Prova le credenziali SMTP mandando un messaggio innocuo a un indirizzo nostro."""
    to = (payload.get("to") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Serve 'to'")
    return email_service.invia_test(to).to_dict()


# ═════════════════════════════════════════════
# REGISTRO / PROVA
# ═════════════════════════════════════════════

@router.get("/comunicazioni/")
def registro_ep(
    limit: int = Query(100, ge=1, le=500),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    return {"comunicazioni": uni.registro(limit=limit)}


@router.get("/comunicazioni/{comunicazione_id}/allegato")
def allegato_ep(
    comunicazione_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Scarica l'XML archiviato. Il Ministero non manda ricevute: questo file, con
    la copia .eml accanto, È la prova di aver adempiuto.
    """
    try:
        nome, contenuto = uni.allegato(comunicazione_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=410, detail=str(e))
    return Response(
        content=contenuto,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.post("/comunicazioni/{comunicazione_id}/annulla")
def annulla_ep(
    comunicazione_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        out = uni.annulla(comunicazione_id, utente=(current_user or {}).get("username"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return JSONResponse(content=out)
