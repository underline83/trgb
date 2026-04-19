# @version: v1.0-home-actions
# -*- coding: utf-8 -*-
"""
Router Home per ruolo — TRGB Gestionale (sessione 49, 2026-04-19).

Configurabile da admin via Impostazioni Sistema → tab "Home per ruolo".
Sostituisce gli array hardcoded ADMIN_ACTIONS (Home.jsx) e SALA_ACTIONS
(DashboardSala.jsx), spostando la config nella tabella home_actions di
foodcost.db.

Endpoint:
  GET  /settings/home-actions/?ruolo=chef    lista azioni del ruolo
  GET  /settings/home-actions/all/           tutte le azioni per tutti i ruoli (admin)
  POST /settings/home-actions/               crea (admin)
  PUT  /settings/home-actions/{id}           aggiorna (admin)
  DELETE /settings/home-actions/{id}         elimina (admin)
  POST /settings/home-actions/reorder/       riordina batch (admin)
  POST /settings/home-actions/reset/         ripristina default ruolo (admin)

Spec: docs/home_per_ruolo.md
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict

from app.services.auth_service import get_current_user
from app.models.foodcost_db import get_foodcost_connection
from app.services.home_actions_defaults import (
    DEFAULTS_BY_ROLE,
    VALID_ROLES,
)

router = APIRouter(prefix="/settings/home-actions", tags=["home-actions"])


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _require_admin(user):
    role = user.get("role", "") if isinstance(user, dict) else getattr(user, "role", "")
    if role not in ("admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo admin può modificare la Home per ruolo",
        )


def _validate_ruolo(ruolo: str) -> str:
    if ruolo not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ruolo non valido: {ruolo}. Ammessi: {sorted(VALID_ROLES)}",
        )
    return ruolo


def _validate_route(route: str) -> str:
    """Accetta solo route relative interne (iniziano con /)."""
    if not isinstance(route, str) or not route.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Route non valida: '{route}'. Deve iniziare con '/'",
        )
    return route.strip()


def _row_to_dict(row) -> dict:
    return {
        "id":     row["id"],
        "ruolo":  row["ruolo"],
        "ordine": row["ordine"],
        "key":    row["key"],
        "label":  row["label"],
        "sub":    row["sub"],
        "emoji":  row["emoji"],
        "route":  row["route"],
        "color":  row["color"],
        "attivo": bool(row["attivo"]),
    }


# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────

class ActionCreate(BaseModel):
    ruolo: str
    key: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=120)
    sub: Optional[str] = None
    emoji: str = Field(default="⭐", max_length=8)
    route: str
    color: Optional[str] = None
    ordine: Optional[int] = None  # None = accoda in fondo
    attivo: bool = True


class ActionUpdate(BaseModel):
    key: Optional[str] = None
    label: Optional[str] = None
    sub: Optional[str] = None
    emoji: Optional[str] = None
    route: Optional[str] = None
    color: Optional[str] = None
    ordine: Optional[int] = None
    attivo: Optional[bool] = None


class ReorderPayload(BaseModel):
    ruolo: str
    ids: List[int]


class ResetPayload(BaseModel):
    ruolo: str


# ─────────────────────────────────────────────
# GET — letture
# ─────────────────────────────────────────────

@router.get("/")
def list_actions(
    ruolo: Optional[str] = Query(None, description="Ruolo target. Se omesso: ruolo dell'utente corrente."),
    user=Depends(get_current_user),
):
    """Lista azioni del ruolo (default: ruolo dell'utente corrente)."""
    target = ruolo or (user.get("role", "") if isinstance(user, dict) else getattr(user, "role", ""))
    _validate_ruolo(target)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM home_actions WHERE ruolo = ? ORDER BY ordine ASC, id ASC",
            (target,),
        )
        rows = [_row_to_dict(r) for r in cur.fetchall()]

        # Fallback superadmin→admin se per qualche motivo superadmin è vuoto
        if not rows and target == "superadmin":
            cur.execute(
                "SELECT * FROM home_actions WHERE ruolo = 'admin' ORDER BY ordine ASC, id ASC"
            )
            rows = [_row_to_dict(r) for r in cur.fetchall()]

        return rows
    finally:
        conn.close()


@router.get("/all/")
def list_all_actions(user=Depends(get_current_user)):
    """Mappa {ruolo: [azioni]} per tutti i ruoli. Usata dalla UI Impostazioni."""
    _require_admin(user)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM home_actions ORDER BY ruolo, ordine ASC, id ASC"
        )
        out: Dict[str, list] = {r: [] for r in sorted(VALID_ROLES)}
        for row in cur.fetchall():
            out.setdefault(row["ruolo"], []).append(_row_to_dict(row))
        return out
    finally:
        conn.close()


# ─────────────────────────────────────────────
# POST / PUT / DELETE — scritture (admin)
# ─────────────────────────────────────────────

@router.post("/")
def create_action(payload: ActionCreate, user=Depends(get_current_user)):
    _require_admin(user)
    _validate_ruolo(payload.ruolo)
    _validate_route(payload.route)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()

        # Se ordine non fornito, accoda in fondo
        if payload.ordine is None:
            cur.execute(
                "SELECT COALESCE(MAX(ordine), -1) + 1 AS nuovo FROM home_actions WHERE ruolo = ?",
                (payload.ruolo,),
            )
            ordine = cur.fetchone()["nuovo"]
        else:
            ordine = payload.ordine

        try:
            cur.execute(
                """
                INSERT INTO home_actions
                  (ruolo, ordine, key, label, sub, emoji, route, color, attivo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.ruolo, ordine, payload.key, payload.label,
                    payload.sub, payload.emoji, payload.route, payload.color,
                    1 if payload.attivo else 0,
                ),
            )
        except Exception as e:
            # UNIQUE (ruolo, key) violata → chiave duplicata per ruolo
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Azione con key '{payload.key}' già esiste per il ruolo {payload.ruolo}",
            )

        new_id = cur.lastrowid
        conn.commit()
        cur.execute("SELECT * FROM home_actions WHERE id = ?", (new_id,))
        return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


@router.put("/{action_id}")
def update_action(action_id: int, payload: ActionUpdate, user=Depends(get_current_user)):
    _require_admin(user)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM home_actions WHERE id = ?", (action_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Azione non trovata")

        updates = []
        values = []

        for field in ("key", "label", "sub", "emoji", "route", "color", "ordine"):
            val = getattr(payload, field)
            if val is not None:
                if field == "route":
                    _validate_route(val)
                updates.append(f"{field} = ?")
                values.append(val)

        if payload.attivo is not None:
            updates.append("attivo = ?")
            values.append(1 if payload.attivo else 0)

        if not updates:
            return _row_to_dict(row)

        updates.append("updated_at = datetime('now')")
        values.append(action_id)

        cur.execute(
            f"UPDATE home_actions SET {', '.join(updates)} WHERE id = ?",
            values,
        )
        conn.commit()
        cur.execute("SELECT * FROM home_actions WHERE id = ?", (action_id,))
        return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


@router.delete("/{action_id}")
def delete_action(action_id: int, user=Depends(get_current_user)):
    _require_admin(user)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM home_actions WHERE id = ?", (action_id,))
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Azione non trovata")
        conn.commit()
        return {"ok": True, "deleted": action_id}
    finally:
        conn.close()


@router.post("/reorder/")
def reorder_actions(payload: ReorderPayload, user=Depends(get_current_user)):
    _require_admin(user)
    _validate_ruolo(payload.ruolo)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        # Verifica che tutti gli id appartengano al ruolo richiesto
        cur.execute(
            f"SELECT id FROM home_actions WHERE ruolo = ?",
            (payload.ruolo,),
        )
        valid_ids = {r["id"] for r in cur.fetchall()}
        for i in payload.ids:
            if i not in valid_ids:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Id {i} non appartiene al ruolo {payload.ruolo}",
                )

        for ordine, action_id in enumerate(payload.ids):
            cur.execute(
                "UPDATE home_actions SET ordine = ?, updated_at = datetime('now') WHERE id = ?",
                (ordine, action_id),
            )
        conn.commit()
        return {"ok": True, "ruolo": payload.ruolo, "count": len(payload.ids)}
    finally:
        conn.close()


@router.post("/reset/")
def reset_to_defaults(payload: ResetPayload, user=Depends(get_current_user)):
    """Ripristina il seed di default per il ruolo indicato.
    Cancella TUTTE le azioni del ruolo e le riscrive dal modulo defaults.
    """
    _require_admin(user)
    _validate_ruolo(payload.ruolo)

    defaults = DEFAULTS_BY_ROLE.get(payload.ruolo, [])

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM home_actions WHERE ruolo = ?", (payload.ruolo,))
        for idx, a in enumerate(defaults):
            cur.execute(
                """
                INSERT INTO home_actions
                  (ruolo, ordine, key, label, sub, emoji, route, color, attivo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    payload.ruolo, idx, a["key"], a["label"], a.get("sub"),
                    a["emoji"], a["route"], a.get("color"),
                ),
            )
        conn.commit()
        cur.execute(
            "SELECT * FROM home_actions WHERE ruolo = ? ORDER BY ordine ASC",
            (payload.ruolo,),
        )
        return {
            "ok": True,
            "ruolo": payload.ruolo,
            "count": len(defaults),
            "azioni": [_row_to_dict(r) for r in cur.fetchall()],
        }
    finally:
        conn.close()
