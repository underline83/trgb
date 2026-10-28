"""
Cucina › Piatti che vanno (IP.1, chiesto da Marco il 2026-10-28).

Quanti piatti escono, per tipo (antipasti, primi, secondi…), in un periodo, con
il confronto sul periodo prima: per oste e cuoco, solo porzioni, niente euro.
Legge i conti di cassa iPratico Cloud tramite il servizio platform
`vendite_conti_service` (sola lettura sul DB del modulo cassa).

Modulo: ricette (la voce di menu sta in «Cucina»). Ruoli: admin, chef, sous_chef.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.permessi import richiede_ruoli
from app.services import vendite_conti_service as vc

router = APIRouter(
    prefix="/cucina/vendite",
    tags=["Cucina"],
    dependencies=[Depends(richiede_ruoli("admin", "chef", "sous_chef", cosa="i piatti venduti"))],
)

MAX_GIORNI = 400


def _periodo(dal: Optional[str], al: Optional[str], giorni: int):
    try:
        a = date.fromisoformat(al) if al else date.today() - timedelta(days=1)
        d = date.fromisoformat(dal) if dal else a - timedelta(days=giorni - 1)
    except ValueError:
        raise HTTPException(400, "Date nel formato AAAA-MM-GG")
    if d > a:
        d, a = a, d
    if (a - d).days + 1 > MAX_GIORNI:
        raise HTTPException(400, f"Al massimo {MAX_GIORNI} giorni")
    return d, a


@router.get("/piatti/", summary="Piatti venduti per tipo, con confronto sul periodo prima")
def piatti(
    dal: Optional[str] = None,
    al: Optional[str] = None,
    giorni: int = Query(7, ge=1, le=MAX_GIORNI),
    turno: Optional[str] = Query(None, pattern="^(pranzo|cena|tutti)$"),
):
    d, a = _periodo(dal, al, giorni)
    return vc.piatti_venduti(d, a, None if turno in (None, "tutti") else turno)


@router.get("/piatto/", summary="Porzioni di un piatto giorno per giorno")
def piatto(
    nome: str = Query(..., min_length=1),
    dal: Optional[str] = None,
    al: Optional[str] = None,
    giorni: int = Query(30, ge=1, le=MAX_GIORNI),
    turno: Optional[str] = Query(None, pattern="^(pranzo|cena|tutti)$"),
):
    d, a = _periodo(dal, al, giorni)
    return {"nome": nome, "dal": d.isoformat(), "al": a.isoformat(),
            "giorni": vc.piatto_per_giorno(nome, d, a, None if turno in (None, "tutti") else turno)}
