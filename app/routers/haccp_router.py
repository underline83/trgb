# @version: v1.0 — Modulo I Loop HACCP completo (sessione 59 cont., 2026-04-27)
# -*- coding: utf-8 -*-
"""
Router HACCP — endpoint reportistica per chef/admin.

Espone:
- GET /haccp/report/{anno}/{mese}     → JSON aggregato mensile (KPI, compliance, eventi critici, top FAIL)
- GET /haccp/report/recent-events     → lista eventi critici ultimi N giorni (per widget)

Iterazione successiva (I.4) aggiungerà:
- GET /haccp/report/{anno}/{mese}/pdf → registro mensile firmabile (WeasyPrint)
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.auth_service import get_current_user
from app.services.haccp_report_service import (
    compute_monthly_report,
    list_critical_events_recent,
)

router = APIRouter(
    prefix="/haccp",
    tags=["HACCP"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/report/recent-events")
def get_recent_critical_events(giorni: int = Query(7, ge=1, le=90)):
    """
    Eventi critici (temperatura/valore fuori soglia) ultimi N giorni.
    Utile per widget Dashboard Cucina o controllo rapido.
    """
    return {
        "ok": True,
        "giorni": giorni,
        "eventi": list_critical_events_recent(giorni),
    }


@router.get("/report/{anno}/{mese}")
def get_monthly_report(anno: int, mese: int):
    """
    Report HACCP mensile aggregato (read-only).

    Struttura risposta — vedi `haccp_report_service.compute_monthly_report`:
      - kpi: counters (compliance %, item OK/FAIL, eventi critici, ecc.)
      - per_reparto: breakdown per reparto
      - compliance_giornaliera: serie temporale
      - top_item_fail: top 5 item piu' fallati
      - eventi_critici: lista valori fuori soglia (max 50)
      - giornate_senza_dati: gap nel registro (utile per audit)
    """
    if not (1 <= mese <= 12):
        raise HTTPException(status_code=400, detail="Mese deve essere tra 1 e 12")
    if anno < 2020 or anno > 2100:
        raise HTTPException(status_code=400, detail="Anno fuori range")
    # Niente report per il futuro (oltre il mese corrente)
    oggi = date.today()
    if (anno, mese) > (oggi.year, oggi.month):
        raise HTTPException(status_code=400, detail="Mese futuro non consentito")

    try:
        report = compute_monthly_report(anno, mese)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    return {"ok": True, "report": report}
