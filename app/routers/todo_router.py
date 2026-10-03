# -*- coding: utf-8 -*-
# @version: v1.0 — Lista personale «cose da fare» (2026-10-03)
"""
Marco: «una lista di cose da fare personale, dove uno puo' aggiungere, segnare,
cancellare; io come superadmin devo avere una board per vederle, loro vedono
solo la propria. Mettila come widget in Home per ciascun dipendente».

    GET    /todo/            le MIE righe (da fare prima, poi le fatte recenti)
    POST   /todo/            aggiungo una riga
    PATCH  /todo/{id}        testo / fatto — solo se la riga e' mia
    POST   /todo/riordina/   l'ordine che ognuno si sceglie (lista di id, solo i miei)
    DELETE /todo/{id}        cancello — solo se la riga e' mia
    GET    /todo/board/      tutte, raggruppate per persona — SOLO superadmin

Tabella `todo_personali` in tasks.sqlite3 (init in app/models/tasks_db.py).
La proprieta' e' lo username del token: nessun parametro del client decide di
chi e' una riga, cosi' nessuno puo' leggere o toccare quelle degli altri.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.tasks_db import get_tasks_conn, init_tasks_db
from app.services.auth_service import get_current_user, list_users
from app.services.permessi import solo_superadmin

router = APIRouter(prefix="/todo", tags=["todo"])

init_tasks_db()

# Le fatte restano visibili qualche giorno (si vede cosa si e' chiuso), poi
# escono dalla vista: restano nel DB finche' il proprietario non le cancella.
GIORNI_FATTE_VISIBILI = 7


class TodoIn(BaseModel):
    testo: str = Field(..., min_length=1, max_length=300)


class RiordinaIn(BaseModel):
    ids: List[int]


class TodoUpdate(BaseModel):
    testo: Optional[str] = Field(default=None, min_length=1, max_length=300)
    fatto: Optional[bool] = None


def _me(user: Dict[str, Any]) -> str:
    u = (user or {}).get("username")
    if not u:
        raise HTTPException(status_code=401, detail="Utente non riconosciuto")
    return u


def _righe(conn, username: Optional[str] = None) -> List[Dict[str, Any]]:
    sql = f"""
        SELECT * FROM todo_personali
         WHERE (fatto = 0 OR fatto_at >= datetime('now','localtime','-{GIORNI_FATTE_VISIBILI} days'))
    """
    args: List[Any] = []
    if username:
        sql += " AND username = ?"
        args.append(username)
    # «Possono metterle come vogliono» (Marco): l'ordine lo decide ognuno.
    sql += " ORDER BY fatto, CASE WHEN fatto = 0 THEN ordine END, fatto_at DESC, id DESC"
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def _mia(conn, todo_id: int, username: str) -> Dict[str, Any]:
    row = conn.execute("SELECT * FROM todo_personali WHERE id = ?", (todo_id,)).fetchone()
    # 404 anche se esiste ma e' di un altro: non si rivela che c'e'.
    if not row or row["username"] != username:
        raise HTTPException(status_code=404, detail="Voce non trovata")
    return dict(row)


@router.get("/")
def lista_mia(current_user=Depends(get_current_user)):
    me = _me(current_user)
    conn = get_tasks_conn()
    try:
        righe = _righe(conn, me)
        return {"items": righe, "da_fare": sum(1 for r in righe if not r["fatto"])}
    finally:
        conn.close()


@router.post("/", status_code=201)
def aggiungi(payload: TodoIn, current_user=Depends(get_current_user)):
    me = _me(current_user)
    conn = get_tasks_conn()
    try:
        # La nuova va in cima: ordine = minimo attuale - 1.
        minimo = conn.execute(
            "SELECT COALESCE(MIN(ordine), 0) FROM todo_personali WHERE username = ? AND fatto = 0", (me,)
        ).fetchone()[0]
        cur = conn.execute(
            "INSERT INTO todo_personali (username, testo, ordine) VALUES (?, ?, ?)",
            (me, payload.testo.strip(), minimo - 1),
        )
        conn.commit()
        return {"ok": True, "item": dict(conn.execute(
            "SELECT * FROM todo_personali WHERE id = ?", (cur.lastrowid,)).fetchone())}
    finally:
        conn.close()


@router.patch("/{todo_id}")
def modifica(todo_id: int, payload: TodoUpdate, current_user=Depends(get_current_user)):
    me = _me(current_user)
    conn = get_tasks_conn()
    try:
        _mia(conn, todo_id, me)
        d = payload.dict(exclude_unset=True)
        if not d:
            raise HTTPException(status_code=400, detail="Niente da modificare")
        if "testo" in d:
            conn.execute("UPDATE todo_personali SET testo = ?, updated_at = datetime('now','localtime') WHERE id = ?",
                         (d["testo"].strip(), todo_id))
        if "fatto" in d:
            conn.execute(
                """UPDATE todo_personali
                      SET fatto = ?, fatto_at = CASE WHEN ? = 1 THEN datetime('now','localtime') END,
                          updated_at = datetime('now','localtime')
                    WHERE id = ?""",
                (1 if d["fatto"] else 0, 1 if d["fatto"] else 0, todo_id),
            )
        conn.commit()
        return {"ok": True, "item": _mia(conn, todo_id, me)}
    finally:
        conn.close()


@router.post("/riordina/")
def riordina(payload: RiordinaIn, current_user=Depends(get_current_user)):
    """Riscrive l'ordine delle MIE righe nell'ordine dato. Id non miei: ignorati."""
    me = _me(current_user)
    conn = get_tasks_conn()
    try:
        miei = {r[0] for r in conn.execute("SELECT id FROM todo_personali WHERE username = ?", (me,))}
        for pos, tid in enumerate(i for i in payload.ids if i in miei):
            conn.execute("UPDATE todo_personali SET ordine = ? WHERE id = ?", (pos, tid))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/{todo_id}")
def cancella(todo_id: int, current_user=Depends(get_current_user)):
    me = _me(current_user)
    conn = get_tasks_conn()
    try:
        _mia(conn, todo_id, me)
        conn.execute("DELETE FROM todo_personali WHERE id = ?", (todo_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/board/", dependencies=[Depends(solo_superadmin(cosa="vedere le liste di tutti"))])
def board():
    """Le liste di tutti, una colonna per persona. Sola lettura."""
    nomi = {u["username"]: u for u in list_users()}
    conn = get_tasks_conn()
    try:
        righe = _righe(conn)
    finally:
        conn.close()
    per: Dict[str, Dict[str, Any]] = {}
    for r in righe:
        u = r["username"]
        if u not in per:
            info = nomi.get(u, {})
            per[u] = {"username": u, "display_name": info.get("display_name") or u,
                      "role": info.get("role"), "items": []}
        per[u]["items"].append(r)
    persone = sorted(per.values(), key=lambda p: (-sum(1 for i in p["items"] if not i["fatto"]),
                                                   (p["display_name"] or "").lower()))
    for p in persone:
        p["da_fare"] = sum(1 for i in p["items"] if not i["fatto"])
    return {"persone": persone}
