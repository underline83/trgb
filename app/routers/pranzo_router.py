#!/usr/bin/env python3
# @version: v2.1-pranzo-settimanale-oggi (Modulo B, 2026-04-26)
# -*- coding: utf-8 -*-
"""
Router Pranzo settimanale — sessione 58 cont. (2026-04-26)

Modulo "Pranzo" come sub-voce di Gestione Cucina.

Modello di dominio:
- Menu SETTIMANALE (UNIQUE su settimana_inizio = lunedi YYYY-MM-DD).
- Piatti pescati dalle `recipes` con service_type "Pranzo di lavoro" (mig 074).
- Pagina /pranzo e' solo un compositore: data settimana + scelta piatti.
  Prezzi, testata, footer vivono solo in `pranzo_settings` (UI: Impostazioni Cucina).

Endpoint:

  ── PIATTI DISPONIBILI ──
  GET    /pranzo/piatti-disponibili/        ricette filtrate per service_type "Pranzo di lavoro"

  ── MENU SETTIMANALE ──
  GET    /pranzo/menu/                       archivio (filtri ?data_da=&data_a=)
  GET    /pranzo/menu/corrente/              shortcut settimana corrente (solo menu)
  GET    /pranzo/menu/oggi/                  shortcut menu di oggi + settings (rich payload)
  GET    /pranzo/menu/{settimana}/           settimana per lunedi YYYY-MM-DD (con righe)
  POST   /pranzo/menu/                       upsert
  DELETE /pranzo/menu/{settimana}/           elimina menu della settimana
  GET    /pranzo/menu/{settimana}/pdf/       PDF brand cliente per la settimana

  ── PROGRAMMAZIONE (vista comparativa) ──
  GET    /pranzo/programmazione/?n=8&fino_a=YYYY-MM-DD   ultime N settimane con righe

  ── SETTINGS ──
  GET    /pranzo/settings/        default titolo/prezzi/footer
  PUT    /pranzo/settings/        aggiorna (admin)
"""
from __future__ import annotations

from datetime import date as date_cls, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.repositories import pranzo_repository as repo
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/pranzo", tags=["pranzo"], dependencies=[Depends(get_current_user)])

# Endpoint pubblico (no auth) per health-check / debug
public_router = APIRouter(prefix="/pranzo", tags=["pranzo-public"])


@public_router.get("/smoke/{settimana}/")
def pranzo_smoke(settimana: str):
    """
    Endpoint diagnostico iter 11: NON tocca il DB.
    Aiuta a isolare se il 502 sul GET menu e' un problema di:
    - routing/proxy (anche smoke fallisce con 502)
    - codice DB (smoke OK ma menu fallisce)
    - timeout backend (smoke immediato OK, menu timeout)
    """
    return {"ok": True, "settimana_ricevuta": settimana, "endpoint": "smoke"}


@public_router.get("/health")
def pranzo_health():
    """
    Endpoint diagnostico: ritorna 200 OK con info su tabelle pranzo_*.
    Marco puo' aprirlo in browser per verificare se il backend pranzo risponde
    senza autenticazione. Esempio: https://app.tregobbi.it/pranzo/health
    """
    try:
        from app.models.foodcost_db import get_foodcost_connection
        conn = get_foodcost_connection()
        try:
            tables = [
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pranzo_%'"
                ).fetchall()
            ]
            n_settings = conn.execute("SELECT COUNT(*) FROM pranzo_settings").fetchone()[0] if "pranzo_settings" in tables else 0
            n_menu = conn.execute("SELECT COUNT(*) FROM pranzo_menu").fetchone()[0] if "pranzo_menu" in tables else 0
        finally:
            conn.close()
        return {
            "ok": True,
            "tables": tables,
            "n_settings": n_settings,
            "n_menu": n_menu,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


CATEGORIE_VALIDE = {"antipasto", "primo", "secondo", "contorno", "dolce", "altro"}


def _check_admin(user: Dict[str, Any]) -> None:
    role = (user or {}).get("role", "")
    if role not in ("superadmin", "admin", "chef"):
        raise HTTPException(status_code=403, detail="Operazione riservata ad admin/chef")


def _validate_data(s: str) -> None:
    try:
        date_cls.fromisoformat(s)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Data non valida (atteso YYYY-MM-DD): {s}")


# ─────────────────────────────────────────────────────────────
# Schemi Pydantic
# ─────────────────────────────────────────────────────────────
class RigaMenuIn(BaseModel):
    recipe_id: Optional[int] = None
    nome: Optional[str] = None
    categoria: str = Field("altro")
    ordine: int = 0
    note: Optional[str] = None


class MenuIn(BaseModel):
    settimana: str = Field(..., description="YYYY-MM-DD (qualsiasi giorno della settimana — viene normalizzato a lunedi)")
    righe: List[RigaMenuIn] = []


class SettingsUpdate(BaseModel):
    titolo_default: Optional[str] = None
    sottotitolo_default: Optional[str] = None
    titolo_business: Optional[str] = None
    prezzo_1_default: Optional[float] = None
    prezzo_2_default: Optional[float] = None
    prezzo_3_default: Optional[float] = None
    footer_default: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# PIATTI DISPONIBILI
# ─────────────────────────────────────────────────────────────
@router.get("/piatti-disponibili/")
def list_piatti_disponibili_endpoint():
    """
    Pesca ricette attive con service_type "Pranzo di lavoro".
    Marco le gestisce dal modulo Ricette (foodcost) — qui le mostriamo
    come pool da cui comporre il menu settimanale.
    """
    return {"piatti": repo.list_piatti_disponibili()}


# ─────────────────────────────────────────────────────────────
# MENU SETTIMANALE
# ─────────────────────────────────────────────────────────────
@router.get("/menu/")
def list_menu_endpoint(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    limit: int = 200,
):
    if data_da:
        _validate_data(data_da)
    if data_a:
        _validate_data(data_a)
    return {"menus": repo.list_menu(data_da=data_da, data_a=data_a, limit=limit)}


@router.get("/menu/corrente/")
def get_menu_settimana_corrente():
    oggi = date_cls.today()
    monday = (oggi - timedelta(days=oggi.weekday())).isoformat()
    menu = repo.get_menu_by_settimana(monday)
    return {"settimana_inizio": monday, "menu": menu}


@router.get("/menu/oggi/")
def get_menu_oggi():
    """
    Shortcut "rich" per consumer che vogliono mostrare il menu del giorno
    senza dover fare 2 chiamate (menu + settings).

    Il modulo Pranzo e' settimanale: "menu di oggi" = menu della settimana
    corrente. Il payload include:
      - oggi:             data odierna ISO YYYY-MM-DD
      - settimana_inizio: lunedi della settimana corrente
      - giorno_settimana: 0=lunedi ... 6=domenica (per UI)
      - menu:             menu salvato per la settimana (null se non c'e')
      - settings:         titolo/sottotitolo/prezzi/footer di default

    Use case: widget Home "Pranzo di oggi" per chef/sala, app sala iPad,
    futura carta cliente pubblica /carta/menu (Modulo G).
    Iter 11: try/except per evitare 502 anche su errori DB inaspettati.
    """
    import logging
    logger = logging.getLogger("pranzo")
    try:
        oggi = date_cls.today()
        monday = (oggi - timedelta(days=oggi.weekday())).isoformat()
        menu = repo.get_menu_by_settimana(monday)
        settings = repo.get_settings()
        return {
            "oggi": oggi.isoformat(),
            "settimana_inizio": monday,
            "giorno_settimana": oggi.weekday(),
            "menu": menu,
            "settings": settings,
        }
    except Exception as e:
        logger.error(f"[pranzo] menu/oggi FAIL: {type(e).__name__}: {e}")
        return {
            "oggi": date_cls.today().isoformat(),
            "settimana_inizio": None,
            "giorno_settimana": date_cls.today().weekday(),
            "menu": None,
            "settings": None,
            "error": str(e),
        }


@router.get("/menu/by-week/")
def get_menu_by_week(settimana: str = Query(..., description="YYYY-MM-DD")):
    """
    Variante con query string del lookup menu per settimana. Aggiunto in
    iter 10 perche' la versione path-param `/menu/{settimana}/` falliva
    con 502 Bad Gateway (worker che non rispondeva). Stesso shape di
    risposta: `{settimana_inizio, menu}`.
    """
    import logging
    logger = logging.getLogger("pranzo")
    try:
        _validate_data(settimana)
        monday = repo.lunedi_di(settimana)
        logger.info(f"[pranzo] by-week settimana={settimana} → monday={monday}")
        menu = repo.get_menu_by_settimana(monday)
        logger.info(f"[pranzo] by-week ok, menu={'present' if menu else 'null'}")
        return {"settimana_inizio": monday, "menu": menu}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[pranzo] by-week FAIL settimana={settimana}: {type(e).__name__}: {e}")
        # Risposta 200 anche su errore: il frontend deve poter continuare
        return {"settimana_inizio": None, "menu": None, "error": str(e)}


@router.get("/menu/{settimana}/")
def get_menu_endpoint(settimana: str):
    """
    Ritorna il menu della settimana per il lunedi indicato (o normalizzato
    al lunedi della stessa settimana ISO). Ritorna SEMPRE 200 con shape
    `{settimana_inizio, menu}`, dove `menu` puo' essere null se la settimana
    non ha ancora un menu. Niente 404 → meno superfici di errore lato frontend.
    Iter 11: try/except per evitare 502 anche su errori DB inaspettati.
    """
    import logging
    logger = logging.getLogger("pranzo")
    try:
        _validate_data(settimana)
        monday = repo.lunedi_di(settimana)
        logger.info(f"[pranzo] menu/{{settimana}} = {settimana} → monday={monday}")
        menu = repo.get_menu_by_settimana(monday)
        return {"settimana_inizio": monday, "menu": menu}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[pranzo] menu/{{settimana}} FAIL settimana={settimana}: {type(e).__name__}: {e}")
        return {"settimana_inizio": None, "menu": None, "error": str(e)}


@router.post("/menu/")
def upsert_menu_endpoint(payload: MenuIn, user=Depends(get_current_user)):
    _check_admin(user)
    _validate_data(payload.settimana)
    for r in payload.righe:
        if r.categoria not in CATEGORIE_VALIDE:
            raise HTTPException(status_code=400, detail=f"categoria riga non valida: {r.categoria}")

    menu = repo.upsert_menu(
        settimana_inizio=payload.settimana,
        righe=[r.dict() for r in payload.righe],
        created_by=(user or {}).get("username") or (user or {}).get("email"),
    )
    return menu


@router.delete("/menu/{settimana}/")
def delete_menu_endpoint(settimana: str, user=Depends(get_current_user)):
    _check_admin(user)
    _validate_data(settimana)
    monday = repo.lunedi_di(settimana)
    ok = repo.delete_menu(monday)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Nessun menu per la settimana del {monday}")
    return {"ok": True, "settimana_inizio": monday}


@router.get("/menu/{settimana}/pdf/")
def get_menu_pdf(settimana: str):
    _validate_data(settimana)
    monday = repo.lunedi_di(settimana)
    menu = repo.get_menu_by_settimana(monday)
    if not menu:
        raise HTTPException(status_code=404, detail=f"Nessun menu per la settimana del {monday}")

    settings = repo.get_settings()
    try:
        from app.services.pranzo_pdf_service import genera_pdf_menu_pranzo
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Servizio PDF non disponibile: {e}")

    try:
        pdf_bytes = genera_pdf_menu_pranzo(menu, settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")

    filename = f"menu_pranzo_settimana_{monday}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────
# PROGRAMMAZIONE — vista comparativa N settimane precedenti
# ─────────────────────────────────────────────────────────────
@router.get("/programmazione/")
def get_programmazione(
    n: int = Query(8, ge=1, le=52, description="Numero di settimane da includere"),
    fino_a: Optional[str] = Query(None, description="YYYY-MM-DD ancora finale (default: settimana corrente)"),
):
    if fino_a:
        _validate_data(fino_a)
    settimane = repo.list_programmazione(n_settimane=n, fino_a=fino_a)
    return {"n": n, "fino_a": fino_a, "settimane": settimane}


# ─────────────────────────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────────────────────────
@router.get("/settings/")
def get_settings_endpoint():
    return repo.get_settings()


@router.put("/settings/")
def update_settings_endpoint(payload: SettingsUpdate, user=Depends(get_current_user)):
    _check_admin(user)
    return repo.update_settings(**payload.dict(exclude_unset=True))
