# @version: v1.1-alerts-router
# -*- coding: utf-8 -*-
"""
Router Alert Engine — TRGB Gestionale (mattone M.F)

Endpoint per eseguire i checker dell'alert engine, consultare lo stato,
e gestire la configurazione (soglie, destinatari, canali).
Protetti da auth JWT. POST /run e PUT /config richiedono admin/superadmin.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.auth_service import get_current_user
from app.services.alert_engine import (
    run_all_checks, run_check, list_checkers
)
from app.models.notifiche_db import get_notifiche_conn

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _require_admin(user):
    role = user.get("role", "") if isinstance(user, dict) else getattr(user, "role", "")
    if role not in ("admin", "superadmin"):
        raise HTTPException(403, "Solo admin può eseguire questa operazione")


# ─────────────────────────────────────────────
# CHECKER EXECUTION
# ─────────────────────────────────────────────

@router.get("/checkers/")
def get_checkers(user=Depends(get_current_user)):
    """Lista dei checker disponibili."""
    return {"checkers": list_checkers()}


@router.get("/check/")
def check_alerts(user=Depends(get_current_user)):
    """Dry-run: controlla tutti gli alert SENZA creare notifiche."""
    results = run_all_checks(dry_run=True)
    return {
        "results": [r.to_dict() for r in results],
        "total_found": sum(r.found for r in results),
    }


@router.get("/check/{checker_name}/")
def check_single_alert(checker_name: str, user=Depends(get_current_user)):
    """Dry-run di un singolo checker."""
    result = run_check(checker_name, dry_run=True)
    return result.to_dict()


@router.post("/run/")
def run_alerts(user=Depends(get_current_user)):
    """Esegue tutti i checker e CREA le notifiche dove necessario."""
    _require_admin(user)
    results = run_all_checks(dry_run=False)
    return {
        "results": [r.to_dict() for r in results],
        "total_found": sum(r.found for r in results),
        "total_notified": sum(r.notified for r in results),
    }


@router.post("/run/{checker_name}/")
def run_single_alert(checker_name: str, user=Depends(get_current_user)):
    """Esegue un singolo checker e crea notifiche se necessario."""
    _require_admin(user)
    result = run_check(checker_name, dry_run=False)
    return result.to_dict()


# ─────────────────────────────────────────────
# CONFIG CRUD
# ─────────────────────────────────────────────

CHECKER_LABELS = {
    "fatture_scadenza":    {"label": "Fatture in scadenza",    "icon": "💰", "desc": "Fatture non pagate scadute o in scadenza"},
    "dipendenti_scadenze": {"label": "Documenti dipendenti",   "icon": "📋", "desc": "Documenti personale in scadenza (permessi, certificati)"},
    "vini_sottoscorta":    {"label": "Vini sotto scorta",      "icon": "🍷", "desc": "Vini con giacenza inferiore alla scorta minima"},
}


@router.get("/config/")
def get_alert_config(user=Depends(get_current_user)):
    """Ritorna la configurazione di tutti i checker."""
    _require_admin(user)
    conn = get_notifiche_conn()
    rows = conn.execute("SELECT * FROM alert_config ORDER BY checker").fetchall()
    conn.close()

    configs = []
    for r in rows:
        meta = CHECKER_LABELS.get(r["checker"], {})
        configs.append({
            "id": r["id"],
            "checker": r["checker"],
            "label": meta.get("label", r["checker"]),
            "icon": meta.get("icon", "🔔"),
            "desc": meta.get("desc", ""),
            "attivo": bool(r["attivo"]),
            "soglia_giorni": r["soglia_giorni"],
            "antidup_ore": r["antidup_ore"],
            "dest_ruolo": r["dest_ruolo"],
            "dest_username": [u.strip() for u in (r["dest_username"] or "").split(",") if u.strip()],
            "canale_app": bool(r["canale_app"]),
            "canale_wa": bool(r["canale_wa"]),
            "canale_email": bool(r["canale_email"]),
            "updated_at": r["updated_at"],
        })

    return {"configs": configs}


class AlertConfigUpdate(BaseModel):
    attivo: Optional[bool] = None
    soglia_giorni: Optional[int] = None
    antidup_ore: Optional[int] = None
    dest_ruolo: Optional[str] = None
    dest_username: Optional[List[str]] = None  # lista utenti, salvata comma-separated
    canale_app: Optional[bool] = None
    canale_wa: Optional[bool] = None
    canale_email: Optional[bool] = None


@router.put("/config/{checker_name}/")
def update_alert_config(checker_name: str, body: AlertConfigUpdate, user=Depends(get_current_user)):
    """Aggiorna la configurazione di un singolo checker."""
    _require_admin(user)

    conn = get_notifiche_conn()
    existing = conn.execute(
        "SELECT id FROM alert_config WHERE checker = ?", (checker_name,)
    ).fetchone()

    if not existing:
        conn.close()
        raise HTTPException(404, f"Checker '{checker_name}' non trovato")

    # Costruisci SET dinamico solo per i campi passati
    updates = []
    values = []
    for field_name, value in body.dict(exclude_unset=True).items():
        if value is not None:
            # bool → int per SQLite
            if isinstance(value, bool):
                value = 1 if value else 0
            # list → comma-separated string (dest_username)
            elif isinstance(value, list):
                value = ",".join(v.strip() for v in value if v.strip()) or None
            updates.append(f"{field_name} = ?")
            values.append(value)

    if not updates:
        conn.close()
        return {"ok": True, "message": "Nessuna modifica"}

    updates.append("updated_at = datetime('now','localtime')")
    values.append(checker_name)

    conn.execute(
        f"UPDATE alert_config SET {', '.join(updates)} WHERE checker = ?",
        values
    )
    conn.commit()
    conn.close()

    return {"ok": True, "checker": checker_name}
