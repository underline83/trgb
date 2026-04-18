# @version: v1.1-tasks-router (ex-cucina, Phase B sessione 46)
# -*- coding: utf-8 -*-
"""
Router Task Manager — TRGB Gestionale (ex-Cucina MVP sessione 41, rinominato Phase B sessione 46)

Endpoint:
  Template (admin/superadmin/chef):
    GET    /tasks/templates/            — lista template con filtri
    GET    /tasks/templates/{id}        — dettaglio template + items
    POST   /tasks/templates/            — crea template + items
    PUT    /tasks/templates/{id}        — modifica template (items opzionale replace-all)
    DELETE /tasks/templates/{id}        — elimina (cascade su items)
    POST   /tasks/templates/{id}/duplica — duplica con items

(Agenda, instance, execution, task, scheduler negli Step 3-4.)

Autenticazione: JWT su tutti gli endpoint.
"""

from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from datetime import date, datetime, timedelta

from app.models.tasks_db import get_tasks_conn, init_tasks_db
from app.services.auth_service import get_current_user
from app.services import tasks_scheduler
from app.schemas.tasks_schema import (
    FREQUENZE, REPARTI, TURNI, ITEM_TIPI, LIVELLI_CUCINA,
    INSTANCE_STATI, EXEC_STATI, TASK_STATI, TASK_PRIORITA,
    ChecklistItemIn, ChecklistItemOut,
    ChecklistTemplateIn, ChecklistTemplateUpdate, ChecklistTemplateOut,
    ChecklistInstanceOut, ChecklistExecutionOut,
    AssegnaInstanceIn, SaltaInstanceIn, CheckItemIn,
    AgendaGiornoOut, AgendaTurnoBucket, GeneraIstanzeIn,
    TaskSingoloIn, TaskSingoloUpdate, TaskSingoloOut, CompletaTaskIn,
)

# Inizializza DB al primo import
init_tasks_db()

router = APIRouter(prefix="/tasks", tags=["Task Manager"])


# ─── Helpers ───────────────────────────────────────────────────────────

def _require_admin_or_chef(user: dict):
    # Phase A.3 — brigata cucina: sous_chef/commis parità in lettura col chef.
    if user["role"] not in ("admin", "superadmin", "chef", "sous_chef", "commis"):
        raise HTTPException(status_code=403, detail="Permesso negato")


def _require_admin(user: dict):
    if user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo admin")


# Phase A.3 — Brigata cucina: filtro auto su letture + anti-escalation su scritture
def _livello_auto_for_role(role: str) -> Optional[str]:
    """
    Ritorna il livello forzato per sous_chef/commis; None = nessun filtro auto.
    Chef/admin/superadmin/etc vedono tutto e possono filtrare manualmente.
    """
    if role == "sous_chef":
        return "sous_chef"
    if role == "commis":
        return "commis"
    return None


def _allowed_livelli_for_role(role: str) -> Optional[set]:
    """
    Set dei livello_cucina che il ruolo può assegnare a un task/template cucina
    (None = livello libero: 'tutta la brigata'). Ritorna None per ruoli senza
    vincolo (chef/admin/superadmin/etc).
    """
    if role == "sous_chef":
        return {None, "sous_chef"}
    if role == "commis":
        return {None, "commis"}
    return None


def _enforce_livello_write(role: str, livello):
    """
    Anti-escalation: sous_chef/commis non possono scrivere task con livello
    superiore al proprio. Solleva 403 in caso di violazione.
    """
    allowed = _allowed_livelli_for_role(role)
    if allowed is None:
        return
    if livello not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Non puoi assegnare task a un livello superiore al tuo",
        )


def _check_instance_visibility(conn, role: str, instance_id: int):
    """
    Verifica che l'istanza sia visibile al ruolo corrente. Se non lo e',
    solleva 404 (stessa risposta di una id inesistente — non trapela info).
    Ritorna la row dell'istanza (join con template) per ulteriore uso.
    """
    row = conn.execute("""
        SELECT i.id, i.stato,
               COALESCE(i.livello_cucina, t.livello_cucina) AS eff_livello,
               COALESCE(i.reparto, t.reparto) AS eff_reparto
          FROM checklist_instance i
          JOIN checklist_template t ON t.id = i.template_id
         WHERE i.id = ?
    """, (instance_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Istanza non trovata")
    allowed = _allowed_livelli_for_role(role)
    if allowed is not None and row["eff_reparto"] == "cucina":
        if row["eff_livello"] not in allowed:
            raise HTTPException(404, "Istanza non trovata")
    return row


def _normalize_reparto(val):
    """Normalizza reparto in lowercase. Phase A (sessione 45): canonical form = lower."""
    if val is None:
        return None
    return str(val).strip().lower() or None


def _validate_template_payload(payload: dict) -> None:
    """Valida reparto/frequenza/turno/tipi item. Solleva 400 con messaggio chiaro."""
    reparto = _normalize_reparto(payload.get("reparto"))
    if reparto and reparto not in REPARTI:
        raise HTTPException(400, f"reparto non valido: {reparto}. Valori: {sorted(REPARTI)}")

    frequenza = payload.get("frequenza")
    if frequenza and frequenza not in FREQUENZE:
        raise HTTPException(400, f"frequenza non valida in MVP: {frequenza}. Solo GIORNALIERA.")

    turno = payload.get("turno")
    if turno and turno not in TURNI:
        raise HTTPException(400, f"turno non valido: {turno}. Valori: {sorted(TURNI)}")

    livello = payload.get("livello_cucina")
    if livello is not None:
        if reparto != "cucina":
            raise HTTPException(400, "livello_cucina ammesso solo se reparto='cucina'")
        if livello not in LIVELLI_CUCINA:
            raise HTTPException(400, f"livello_cucina non valido: {livello}. Valori: {sorted(LIVELLI_CUCINA)}")

    for idx, it in enumerate(payload.get("items") or []):
        if it["tipo"] not in ITEM_TIPI:
            raise HTTPException(400, f"item[{idx}] tipo non valido: {it['tipo']}. Valori: {sorted(ITEM_TIPI)}")
        if it["tipo"] == "TEMPERATURA" and (it.get("min_valore") is None or it.get("max_valore") is None):
            raise HTTPException(400, f"item[{idx}] TEMPERATURA richiede min_valore e max_valore")


def _row_to_item(row) -> ChecklistItemOut:
    return ChecklistItemOut(
        id=row["id"],
        template_id=row["template_id"],
        ordine=row["ordine"],
        titolo=row["titolo"],
        tipo=row["tipo"],
        obbligatorio=bool(row["obbligatorio"]),
        min_valore=row["min_valore"],
        max_valore=row["max_valore"],
        unita_misura=row["unita_misura"],
        note=row["note"],
    )


def _row_to_template(row, items: List[ChecklistItemOut]) -> ChecklistTemplateOut:
    try:
        livello_cucina = row["livello_cucina"]
    except (IndexError, KeyError):
        livello_cucina = None
    return ChecklistTemplateOut(
        id=row["id"],
        nome=row["nome"],
        reparto=row["reparto"],
        frequenza=row["frequenza"],
        turno=row["turno"],
        ora_scadenza_entro=row["ora_scadenza_entro"],
        attivo=bool(row["attivo"]),
        note=row["note"],
        livello_cucina=livello_cucina,
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        items=items,
    )


def _fetch_items(conn, template_id: int) -> List[ChecklistItemOut]:
    rows = conn.execute(
        "SELECT * FROM checklist_item WHERE template_id = ? ORDER BY ordine, id",
        (template_id,),
    ).fetchall()
    return [_row_to_item(r) for r in rows]


def _insert_items(conn, template_id: int, items: List[ChecklistItemIn]) -> None:
    for idx, it in enumerate(items):
        conn.execute("""
            INSERT INTO checklist_item
                (template_id, ordine, titolo, tipo, obbligatorio,
                 min_valore, max_valore, unita_misura, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            template_id,
            it.ordine if it.ordine else idx,
            it.titolo,
            it.tipo,
            1 if it.obbligatorio else 0,
            it.min_valore,
            it.max_valore,
            it.unita_misura,
            it.note,
        ))


# ─── GET /tasks/templates/ ────────────────────────────────────────────

@router.get("/templates/")
def list_templates(
    reparto: Optional[str] = Query(None),
    turno: Optional[str] = Query(None),
    attivo: Optional[bool] = Query(None),
    livello_cucina: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    _require_admin_or_chef(user)

    where = []
    params = []
    rep = _normalize_reparto(reparto)
    if rep:
        where.append("reparto = ?")
        params.append(rep)
    if turno:
        where.append("turno = ?")
        params.append(turno)
    if attivo is not None:
        where.append("attivo = ?")
        params.append(1 if attivo else 0)
    # Phase A.3 — filtro auto brigata su template per sous_chef/commis.
    auto_livello = _livello_auto_for_role(user["role"])
    if auto_livello is not None:
        where.append("(livello_cucina IS NULL OR livello_cucina = ?)")
        params.append(auto_livello)
    elif livello_cucina:
        if livello_cucina not in LIVELLI_CUCINA:
            raise HTTPException(400, f"livello_cucina non valido: {livello_cucina}")
        where.append("livello_cucina = ?")
        params.append(livello_cucina)

    sql = "SELECT * FROM checklist_template"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY reparto, turno, nome"

    conn = get_tasks_conn()
    try:
        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            items = _fetch_items(conn, r["id"])
            out.append(_row_to_template(r, items).model_dump())
        return out
    finally:
        conn.close()


# ─── GET /tasks/templates/{id} ────────────────────────────────────────

@router.get("/templates/{tid}")
def get_template(tid: int, user: dict = Depends(get_current_user)):
    _require_admin_or_chef(user)
    conn = get_tasks_conn()
    try:
        row = conn.execute(
            "SELECT * FROM checklist_template WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Template non trovato")
        # Phase A.3 — sous_chef/commis non possono leggere template cucina di
        # livello superiore al proprio.
        allowed = _allowed_livelli_for_role(user["role"])
        if allowed is not None and row["reparto"] == "cucina":
            try:
                tpl_livello = row["livello_cucina"]
            except (IndexError, KeyError):
                tpl_livello = None
            if tpl_livello not in allowed:
                raise HTTPException(404, "Template non trovato")
        items = _fetch_items(conn, tid)
        return _row_to_template(row, items).model_dump()
    finally:
        conn.close()


# ─── POST /tasks/templates/ ───────────────────────────────────────────

@router.post("/templates/", status_code=201)
def create_template(
    payload: ChecklistTemplateIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    _validate_template_payload(payload.model_dump())

    rep = _normalize_reparto(payload.reparto) or "cucina"
    livello = payload.livello_cucina if rep == "cucina" else None

    conn = get_tasks_conn()
    try:
        cur = conn.execute("""
            INSERT INTO checklist_template
                (nome, reparto, frequenza, turno, ora_scadenza_entro, attivo, note,
                 livello_cucina, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.nome,
            rep,
            payload.frequenza,
            payload.turno,
            payload.ora_scadenza_entro,
            1 if payload.attivo else 0,
            payload.note,
            livello,
            user["username"],
        ))
        tid = cur.lastrowid
        _insert_items(conn, tid, payload.items)
        conn.commit()

        row = conn.execute("SELECT * FROM checklist_template WHERE id = ?", (tid,)).fetchone()
        items = _fetch_items(conn, tid)
        return _row_to_template(row, items).model_dump()
    finally:
        conn.close()


# ─── PUT /tasks/templates/{id} ────────────────────────────────────────

@router.put("/templates/{tid}")
def update_template(
    tid: int,
    payload: ChecklistTemplateUpdate,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)

    conn = get_tasks_conn()
    try:
        row = conn.execute(
            "SELECT * FROM checklist_template WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Template non trovato")

        data = payload.model_dump(exclude_unset=True, exclude={"items"})
        # Normalizza reparto a lowercase prima di validare/salvare
        if "reparto" in data:
            data["reparto"] = _normalize_reparto(data["reparto"]) or "cucina"
        # Phase A.2: forza livello_cucina=NULL se reparto cambia a non-cucina
        effective_reparto = data.get("reparto", row["reparto"])
        if effective_reparto != "cucina" and "livello_cucina" not in data:
            data["livello_cucina"] = None
        elif effective_reparto != "cucina":
            data["livello_cucina"] = None
        # Valida solo i campi presenti
        _validate_template_payload({**dict(row), **data, "items": [
            i.model_dump() for i in (payload.items or [])
        ]})

        if data:
            sets = []
            params = []
            for k, v in data.items():
                if k == "attivo":
                    v = 1 if v else 0
                sets.append(f"{k} = ?")
                params.append(v)
            params.append(tid)
            conn.execute(
                f"UPDATE checklist_template SET {', '.join(sets)} WHERE id = ?",
                params,
            )

        # Replace-all items se payload.items valorizzato
        if payload.items is not None:
            conn.execute("DELETE FROM checklist_item WHERE template_id = ?", (tid,))
            _insert_items(conn, tid, payload.items)

        conn.commit()

        row = conn.execute("SELECT * FROM checklist_template WHERE id = ?", (tid,)).fetchone()
        items = _fetch_items(conn, tid)
        return _row_to_template(row, items).model_dump()
    finally:
        conn.close()


# ─── DELETE /tasks/templates/{id} ─────────────────────────────────────

@router.delete("/templates/{tid}")
def delete_template(tid: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    conn = get_tasks_conn()
    try:
        row = conn.execute(
            "SELECT id FROM checklist_template WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Template non trovato")
        # Cascade FK: checklist_item, checklist_instance (e a cascata execution)
        conn.execute("DELETE FROM checklist_template WHERE id = ?", (tid,))
        conn.commit()
        return {"ok": True, "deleted_id": tid}
    finally:
        conn.close()


# ─── POST /tasks/templates/{id}/duplica ───────────────────────────────

@router.post("/templates/{tid}/duplica", status_code=201)
def duplica_template(tid: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    conn = get_tasks_conn()
    try:
        row = conn.execute(
            "SELECT * FROM checklist_template WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Template non trovato")

        nuovo_nome = f"{row['nome']} (copia)"
        try:
            src_livello = row["livello_cucina"]
        except (IndexError, KeyError):
            src_livello = None
        cur = conn.execute("""
            INSERT INTO checklist_template
                (nome, reparto, frequenza, turno, ora_scadenza_entro, attivo, note,
                 livello_cucina, created_by)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
        """, (
            nuovo_nome,
            row["reparto"],
            row["frequenza"],
            row["turno"],
            row["ora_scadenza_entro"],
            row["note"],
            src_livello,
            user["username"],
        ))
        new_tid = cur.lastrowid

        # Copia items
        items = conn.execute(
            "SELECT * FROM checklist_item WHERE template_id = ? ORDER BY ordine, id",
            (tid,),
        ).fetchall()
        for it in items:
            conn.execute("""
                INSERT INTO checklist_item
                    (template_id, ordine, titolo, tipo, obbligatorio,
                     min_valore, max_valore, unita_misura, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                new_tid,
                it["ordine"],
                it["titolo"],
                it["tipo"],
                it["obbligatorio"],
                it["min_valore"],
                it["max_valore"],
                it["unita_misura"],
                it["note"],
            ))

        conn.commit()

        new_row = conn.execute(
            "SELECT * FROM checklist_template WHERE id = ?", (new_tid,)
        ).fetchone()
        return _row_to_template(new_row, _fetch_items(conn, new_tid)).model_dump()
    finally:
        conn.close()


# ======================================================================
# AGENDA / INSTANCES / EXECUTION
# ======================================================================

def _row_to_execution(row, item_row=None) -> dict:
    """Costruisce la struttura per il frontend, unendo item + execution."""
    out = ChecklistExecutionOut(
        id=row["exec_id"] if row["exec_id"] else None,
        instance_id=row["instance_id"],
        item_id=row["item_id"],
        stato=row["exec_stato"] or "PENDING",
        valore_numerico=row["valore_numerico"],
        valore_testo=row["valore_testo"],
        completato_at=row["completato_at"],
        completato_da=row["completato_da"],
        note=row["exec_note"],
        item_titolo=row["item_titolo"],
        item_tipo=row["item_tipo"],
        item_ordine=row["item_ordine"],
        item_obbligatorio=bool(row["item_obbligatorio"]) if row["item_obbligatorio"] is not None else None,
        item_min=row["item_min"],
        item_max=row["item_max"],
        item_unita=row["item_unita"],
    )
    return out.model_dump()


def _fetch_instance(conn, instance_id: int) -> Optional[dict]:
    """Carica istanza + template_nome + tutti gli item (+ execution se presente)."""
    inst = conn.execute("""
        SELECT i.*, t.nome AS template_nome, t.reparto AS template_reparto,
               t.livello_cucina AS template_livello
          FROM checklist_instance i
          JOIN checklist_template t ON t.id = i.template_id
         WHERE i.id = ?
    """, (instance_id,)).fetchone()
    if not inst:
        return None

    # Tutti gli item del template, join con eventuale execution
    rows = conn.execute("""
        SELECT
            ? AS instance_id,
            it.id           AS item_id,
            it.ordine       AS item_ordine,
            it.titolo       AS item_titolo,
            it.tipo         AS item_tipo,
            it.obbligatorio AS item_obbligatorio,
            it.min_valore   AS item_min,
            it.max_valore   AS item_max,
            it.unita_misura AS item_unita,
            ex.id           AS exec_id,
            ex.stato        AS exec_stato,
            ex.valore_numerico,
            ex.valore_testo,
            ex.completato_at,
            ex.completato_da,
            ex.note         AS exec_note
          FROM checklist_item it
          LEFT JOIN checklist_execution ex
                 ON ex.item_id = it.id AND ex.instance_id = ?
         WHERE it.template_id = ?
         ORDER BY it.ordine, it.id
    """, (instance_id, instance_id, inst["template_id"])).fetchall()

    items = [_row_to_execution(r) for r in rows]

    # Reparto: prefer instance (post-085), fallback al template (record legacy).
    inst_reparto = None
    try:
        inst_reparto = inst["reparto"]
    except (IndexError, KeyError):
        inst_reparto = None

    # Phase A.2: livello_cucina — prefer instance, fallback template
    inst_livello = None
    try:
        inst_livello = inst["livello_cucina"]
    except (IndexError, KeyError):
        pass
    if inst_livello is None:
        try:
            inst_livello = inst["template_livello"]
        except (IndexError, KeyError):
            pass

    return ChecklistInstanceOut(
        id=inst["id"],
        template_id=inst["template_id"],
        template_nome=inst["template_nome"],
        reparto=(inst_reparto or inst["template_reparto"] or "cucina"),
        livello_cucina=inst_livello,
        data_riferimento=inst["data_riferimento"],
        turno=inst["turno"],
        scadenza_at=inst["scadenza_at"],
        stato=inst["stato"],
        assegnato_user=inst["assegnato_user"],
        completato_at=inst["completato_at"],
        completato_da=inst["completato_da"],
        score_compliance=inst["score_compliance"],
        note=inst["note"],
        items=items,
    ).model_dump()


# ─── GET /tasks/agenda/ ───────────────────────────────────────────────

@router.get("/agenda/")
def get_agenda_giornaliera(
    data: Optional[str] = Query(None, description="YYYY-MM-DD (default: oggi)"),
    turno: Optional[str] = Query(None),
    reparto: Optional[str] = Query(None, description="filtra istanze+task per reparto (lowercase)"),
    user: dict = Depends(get_current_user),
):
    # Tutti gli operativi (no viewer, no bloccati)
    data_str = data or date.today().isoformat()
    rep = _normalize_reparto(reparto)

    # Lazy: genera istanze del giorno + scadute (idempotente)
    try:
        tasks_scheduler.genera_istanze_per_data(
            get_tasks_conn().__enter__() if False else get_tasks_conn(),
            date.fromisoformat(data_str),
        )
    except Exception:
        pass  # best-effort

    conn = get_tasks_conn()
    try:
        # Aggiorna scadute
        tasks_scheduler.check_scadenze(conn)

        # Fetch istanze per la data
        where = ["i.data_riferimento = ?"]
        params = [data_str]
        if turno:
            where.append("i.turno = ?")
            params.append(turno)
        if rep:
            # Preferisco i.reparto (gia' copiato dal template dallo scheduler).
            # Fallback: se record legacy senza reparto, usa il template.
            where.append("COALESCE(i.reparto, t.reparto) = ?")
            params.append(rep)

        # Phase A.3 — filtro auto brigata per sous_chef/commis sulle istanze.
        auto_livello = _livello_auto_for_role(user["role"])
        if auto_livello is not None:
            where.append(
                "(COALESCE(i.livello_cucina, t.livello_cucina) IS NULL "
                "OR COALESCE(i.livello_cucina, t.livello_cucina) = ?)"
            )
            params.append(auto_livello)

        sql = f"""
            SELECT i.id
              FROM checklist_instance i
              JOIN checklist_template t ON t.id = i.template_id
             WHERE {' AND '.join(where)}
             ORDER BY
                CASE i.turno
                    WHEN 'APERTURA' THEN 1
                    WHEN 'PRANZO' THEN 2
                    WHEN 'POMERIGGIO' THEN 3
                    WHEN 'CENA' THEN 4
                    WHEN 'CHIUSURA' THEN 5
                    ELSE 9
                END,
                t.nome
        """
        rows = conn.execute(sql, params).fetchall()

        # Raggruppa per turno
        buckets: dict = {}
        for r in rows:
            inst = _fetch_instance(conn, r["id"])
            t = inst["turno"] or "ALTRO"
            buckets.setdefault(t, []).append(inst)

        turni_out = [
            {"turno": k, "instances": v}
            for k, v in buckets.items()
        ]

        # Task del giorno (nuovo MVP: tutti gli utenti vedono tutti i task)
        task_where = ["data_scadenza = ?", "stato NOT IN ('ANNULLATO')"]
        task_params = [data_str]
        if rep:
            task_where.append("reparto = ?")
            task_params.append(rep)
        # Phase A.3 — filtro auto brigata sui task cucina.
        if auto_livello is not None:
            task_where.append("(livello_cucina IS NULL OR livello_cucina = ?)")
            task_params.append(auto_livello)
        tasks_rows = conn.execute(f"""
            SELECT * FROM task_singolo
             WHERE {' AND '.join(task_where)}
             ORDER BY
                CASE priorita WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
                ora_scadenza
        """, task_params).fetchall()
        tasks = [dict(r) for r in tasks_rows]

        return {"data": data_str, "turni": turni_out, "tasks": tasks}
    finally:
        conn.close()


# ─── GET /tasks/agenda/settimana ──────────────────────────────────────

@router.get("/agenda/settimana")
def get_agenda_settimana(
    data_inizio: str = Query(..., description="YYYY-MM-DD (lunedi)"),
    reparto: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    try:
        d0 = date.fromisoformat(data_inizio)
    except Exception:
        raise HTTPException(400, "data_inizio non valida (YYYY-MM-DD)")

    rep = _normalize_reparto(reparto)
    # Phase A.3 — filtro auto brigata per sous_chef/commis
    auto_livello = _livello_auto_for_role(user["role"])
    conn = get_tasks_conn()
    try:
        giorni = []
        for i in range(7):
            d = d0 + timedelta(days=i)
            # Aggiorna scadute al volo
            tasks_scheduler.check_scadenze(conn)

            inst_where = ["i.data_riferimento = ?"]
            inst_params = [d.isoformat()]
            if rep:
                inst_where.append("COALESCE(i.reparto, t.reparto) = ?")
                inst_params.append(rep)
            if auto_livello is not None:
                inst_where.append(
                    "(COALESCE(i.livello_cucina, t.livello_cucina) IS NULL "
                    "OR COALESCE(i.livello_cucina, t.livello_cucina) = ?)"
                )
                inst_params.append(auto_livello)
            rows = conn.execute(f"""
                SELECT i.id, i.turno, i.stato, t.nome AS template_nome,
                       COALESCE(i.reparto, t.reparto) AS reparto
                  FROM checklist_instance i
                  JOIN checklist_template t ON t.id = i.template_id
                 WHERE {' AND '.join(inst_where)}
                 ORDER BY i.turno
            """, inst_params).fetchall()

            tk_where = ["data_scadenza = ?", "stato NOT IN ('ANNULLATO')"]
            tk_params = [d.isoformat()]
            if rep:
                tk_where.append("reparto = ?")
                tk_params.append(rep)
            if auto_livello is not None:
                tk_where.append("(livello_cucina IS NULL OR livello_cucina = ?)")
                tk_params.append(auto_livello)
            task_rows = conn.execute(f"""
                SELECT id, titolo, stato, priorita, assegnato_user, reparto
                  FROM task_singolo
                 WHERE {' AND '.join(tk_where)}
                 ORDER BY CASE priorita WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END
            """, tk_params).fetchall()

            giorni.append({
                "data": d.isoformat(),
                "instances": [dict(r) for r in rows],
                "tasks": [dict(r) for r in task_rows],
            })
        return {"data_inizio": d0.isoformat(), "giorni": giorni}
    finally:
        conn.close()


# ─── POST /tasks/agenda/genera ────────────────────────────────────────

@router.post("/agenda/genera")
def genera_istanze_range_endpoint(
    payload: GeneraIstanzeIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    try:
        d1 = date.fromisoformat(payload.data_da)
        d2 = date.fromisoformat(payload.data_a)
    except Exception:
        raise HTTPException(400, "Date non valide (YYYY-MM-DD)")
    if d2 < d1:
        raise HTTPException(400, "data_a precedente a data_da")
    if (d2 - d1).days > 62:
        raise HTTPException(400, "Intervallo massimo 62 giorni")

    conn = get_tasks_conn()
    try:
        created = tasks_scheduler.genera_istanze_range(conn, d1, d2)
        return {"ok": True, "created": created, "range": [d1.isoformat(), d2.isoformat()]}
    finally:
        conn.close()


# ─── GET /tasks/instances/{id} ────────────────────────────────────────

@router.get("/instances/{iid}")
def get_instance(iid: int, user: dict = Depends(get_current_user)):
    conn = get_tasks_conn()
    try:
        tasks_scheduler.check_scadenze(conn)
        inst = _fetch_instance(conn, iid)
        if not inst:
            raise HTTPException(404, "Istanza non trovata")
        # Phase A.3 — anti-escalation: sous_chef/commis non possono accedere
        # a istanze cucina di livello superiore (nemmeno via URL diretta).
        auto_livello = _livello_auto_for_role(user["role"])
        if auto_livello is not None:
            inst_livello = inst.get("livello_cucina")
            if inst_livello not in (None, auto_livello):
                raise HTTPException(404, "Istanza non trovata")
        return inst
    finally:
        conn.close()


# ─── POST /tasks/instances/{id}/assegna ───────────────────────────────

@router.post("/instances/{iid}/assegna")
def assegna_instance(
    iid: int,
    payload: AssegnaInstanceIn,
    user: dict = Depends(get_current_user),
):
    conn = get_tasks_conn()
    try:
        # Phase A.3 — anti-escalation: sous_chef/commis non possono agire su
        # istanze cucina di livello superiore.
        row = _check_instance_visibility(conn, user["role"], iid)
        if row["stato"] in ("COMPLETATA", "SALTATA"):
            raise HTTPException(400, f"Istanza {row['stato']}: non assegnabile")

        conn.execute(
            "UPDATE checklist_instance SET assegnato_user = ? WHERE id = ?",
            (payload.user, iid),
        )
        conn.commit()
        return _fetch_instance(conn, iid)
    finally:
        conn.close()


# ─── POST /tasks/instances/{id}/completa ──────────────────────────────

@router.post("/instances/{iid}/completa")
def completa_instance(iid: int, user: dict = Depends(get_current_user)):
    conn = get_tasks_conn()
    try:
        # Phase A.3 — anti-escalation
        row = _check_instance_visibility(conn, user["role"], iid)
        if row["stato"] in ("COMPLETATA", "SALTATA"):
            raise HTTPException(400, f"Istanza gia' {row['stato']}")

        score = tasks_scheduler.calcola_score_compliance(conn, iid)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("""
            UPDATE checklist_instance
               SET stato = 'COMPLETATA',
                   completato_at = ?,
                   completato_da = ?,
                   score_compliance = ?
             WHERE id = ?
        """, (now, user["username"], score, iid))
        conn.commit()
        return _fetch_instance(conn, iid)
    finally:
        conn.close()


# ─── POST /tasks/instances/{id}/salta ─────────────────────────────────

@router.post("/instances/{iid}/salta")
def salta_instance(
    iid: int,
    payload: SaltaInstanceIn,
    user: dict = Depends(get_current_user),
):
    _require_admin_or_chef(user)
    conn = get_tasks_conn()
    try:
        # Phase A.3 — anti-escalation
        row = _check_instance_visibility(conn, user["role"], iid)
        if row["stato"] == "COMPLETATA":
            raise HTTPException(400, "Istanza gia' COMPLETATA")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("""
            UPDATE checklist_instance
               SET stato = 'SALTATA',
                   completato_at = ?,
                   completato_da = ?,
                   note = COALESCE(?, note)
             WHERE id = ?
        """, (now, user["username"], payload.motivo, iid))
        conn.commit()
        return _fetch_instance(conn, iid)
    finally:
        conn.close()


# ─── POST /tasks/execution/item/{item_id}/check ───────────────────────

@router.post("/execution/item/{item_id}/check")
def check_item(
    item_id: int,
    payload: CheckItemIn,
    user: dict = Depends(get_current_user),
):
    if payload.stato not in ("OK", "FAIL", "SKIPPED"):
        raise HTTPException(400, f"stato non valido: {payload.stato}. Usa OK/FAIL/SKIPPED")

    conn = get_tasks_conn()
    try:
        # Phase A.3 — anti-escalation: sous_chef/commis non possono registrare
        # esecuzioni su istanze cucina di livello superiore.
        _check_instance_visibility(conn, user["role"], payload.instance_id)
        inst = conn.execute(
            "SELECT id, stato, template_id FROM checklist_instance WHERE id = ?",
            (payload.instance_id,),
        ).fetchone()
        if not inst:
            raise HTTPException(404, "Istanza non trovata")
        if inst["stato"] in ("COMPLETATA", "SALTATA", "SCADUTA"):
            raise HTTPException(400, f"Istanza {inst['stato']}: non modificabile")

        item = conn.execute(
            "SELECT id, template_id, tipo, min_valore, max_valore FROM checklist_item WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not item:
            raise HTTPException(404, "Item non trovato")
        if item["template_id"] != inst["template_id"]:
            raise HTTPException(400, "Item non appartiene al template dell'istanza")

        # Validazione valore per tipo
        if item["tipo"] in ("NUMERICO", "TEMPERATURA") and payload.stato == "OK":
            if payload.valore_numerico is None:
                raise HTTPException(400, f"Item {item['tipo']}: valore_numerico obbligatorio")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Upsert execution (UNIQUE su instance_id+item_id)
        conn.execute("""
            INSERT INTO checklist_execution
                (instance_id, item_id, stato, valore_numerico, valore_testo, note,
                 completato_at, completato_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(instance_id, item_id) DO UPDATE SET
                stato = excluded.stato,
                valore_numerico = excluded.valore_numerico,
                valore_testo = excluded.valore_testo,
                note = excluded.note,
                completato_at = excluded.completato_at,
                completato_da = excluded.completato_da
        """, (
            payload.instance_id, item_id, payload.stato,
            payload.valore_numerico, payload.valore_testo, payload.note,
            now, user["username"],
        ))

        # Se l'istanza era APERTA, passala a IN_CORSO
        if inst["stato"] == "APERTA":
            conn.execute(
                "UPDATE checklist_instance SET stato = 'IN_CORSO' WHERE id = ?",
                (payload.instance_id,),
            )

        conn.commit()
        return _fetch_instance(conn, payload.instance_id)
    finally:
        conn.close()


# ======================================================================
# SCHEDULER — endpoint dedicati (admin)
# ======================================================================

@router.post("/scheduler/genera-giornaliere")
def scheduler_genera_giornaliere(user: dict = Depends(get_current_user)):
    """Genera le istanze di oggi e di domani (idempotente)."""
    _require_admin(user)
    conn = get_tasks_conn()
    try:
        today = date.today()
        created = tasks_scheduler.genera_istanze_range(
            conn, today, today + timedelta(days=1)
        )
        scaduted = tasks_scheduler.check_scadenze(conn)
        return {"ok": True, "created": created, "marked_scaduta": scaduted}
    finally:
        conn.close()


@router.post("/scheduler/check-scadute")
def scheduler_check_scadute(user: dict = Depends(get_current_user)):
    """Marca SCADUTE le istanze con scadenza_at oltrepassata."""
    _require_admin_or_chef(user)
    conn = get_tasks_conn()
    try:
        n = tasks_scheduler.check_scadenze(conn)
        return {"ok": True, "marked_scaduta": n}
    finally:
        conn.close()


# ======================================================================
# TASK SINGOLI (non ricorrenti)
# ======================================================================

def _row_to_task(row) -> dict:
    # reparto potrebbe mancare se la colonna non e' ancora stata creata
    # (caso edge: boot prima della migration 085). Default "cucina".
    try:
        reparto = row["reparto"] or "cucina"
    except (IndexError, KeyError):
        reparto = "cucina"
    try:
        livello_cucina = row["livello_cucina"]
    except (IndexError, KeyError):
        livello_cucina = None
    return TaskSingoloOut(
        id=row["id"],
        titolo=row["titolo"],
        descrizione=row["descrizione"],
        data_scadenza=row["data_scadenza"],
        ora_scadenza=row["ora_scadenza"],
        assegnato_user=row["assegnato_user"],
        priorita=row["priorita"],
        stato=row["stato"],
        reparto=reparto,
        livello_cucina=livello_cucina,
        completato_at=row["completato_at"],
        completato_da=row["completato_da"],
        note_completamento=row["note_completamento"],
        origine=row["origine"],
        ref_modulo=row["ref_modulo"],
        ref_id=row["ref_id"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    ).model_dump()


def _task_auto_scadenza(conn) -> None:
    """Marca come SCADUTI i task con data_scadenza < oggi e stato APERTO/IN_CORSO."""
    oggi = date.today().isoformat()
    conn.execute("""
        UPDATE task_singolo
           SET stato = 'SCADUTO'
         WHERE stato IN ('APERTO', 'IN_CORSO')
           AND data_scadenza IS NOT NULL
           AND data_scadenza < ?
    """, (oggi,))
    conn.commit()


# ─── GET /tasks/tasks/ ────────────────────────────────────────────────

@router.get("/tasks/")
def list_tasks(
    user_filter: Optional[str] = Query(None, alias="user", description="Filtra per assegnato_user"),
    data: Optional[str] = Query(None, description="YYYY-MM-DD"),
    stato: Optional[str] = Query(None),
    reparto: Optional[str] = Query(None, description="filtra per reparto (lowercase)"),
    livello_cucina: Optional[str] = Query(None, description="chef|sous_chef|commis"),
    user: dict = Depends(get_current_user),
):
    conn = get_tasks_conn()
    try:
        _task_auto_scadenza(conn)

        where = []
        params = []
        if user_filter:
            where.append("assegnato_user = ?")
            params.append(user_filter)
        if data:
            where.append("data_scadenza = ?")
            params.append(data)
        if stato:
            if stato not in TASK_STATI:
                raise HTTPException(400, f"stato non valido: {stato}. Valori: {sorted(TASK_STATI)}")
            where.append("stato = ?")
            params.append(stato)
        rep = _normalize_reparto(reparto)
        if rep:
            where.append("reparto = ?")
            params.append(rep)

        # Phase A.3 — filtro auto server-side per sous_chef/commis.
        # Il livello forzato dal ruolo sovrascrive l'eventuale query param.
        auto_livello = _livello_auto_for_role(user["role"])
        if auto_livello is not None:
            # Non-cucina hanno sempre livello_cucina=NULL → visibili.
            # Cucina: visibili solo livello=<auto> o NULL.
            where.append("(livello_cucina IS NULL OR livello_cucina = ?)")
            params.append(auto_livello)
        elif livello_cucina:
            if livello_cucina not in LIVELLI_CUCINA:
                raise HTTPException(400, f"livello_cucina non valido: {livello_cucina}")
            where.append("livello_cucina = ?")
            params.append(livello_cucina)

        sql = "SELECT * FROM task_singolo"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += """
            ORDER BY
                CASE stato
                    WHEN 'APERTO' THEN 1
                    WHEN 'IN_CORSO' THEN 2
                    WHEN 'SCADUTO' THEN 3
                    WHEN 'COMPLETATO' THEN 4
                    ELSE 5
                END,
                CASE priorita
                    WHEN 'ALTA' THEN 1
                    WHEN 'MEDIA' THEN 2
                    WHEN 'BASSA' THEN 3
                    ELSE 4
                END,
                data_scadenza, ora_scadenza
        """
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_task(r) for r in rows]
    finally:
        conn.close()


# ─── POST /tasks/tasks/ ───────────────────────────────────────────────

@router.post("/tasks/", status_code=201)
def create_task(
    payload: TaskSingoloIn,
    user: dict = Depends(get_current_user),
):
    if payload.priorita not in TASK_PRIORITA:
        raise HTTPException(400, f"priorita non valida: {payload.priorita}. Valori: {sorted(TASK_PRIORITA)}")
    rep = _normalize_reparto(payload.reparto) or "cucina"
    if rep not in REPARTI:
        raise HTTPException(400, f"reparto non valido: {rep}. Valori: {sorted(REPARTI)}")
    livello = payload.livello_cucina if rep == "cucina" else None
    # Phase A.3 — anti-escalation: sous_chef/commis non possono creare task
    # con livello superiore al proprio (vale solo per reparto=cucina; per
    # altri reparti livello e' gia' forzato a None).
    if rep == "cucina":
        _enforce_livello_write(user["role"], livello)

    conn = get_tasks_conn()
    try:
        cur = conn.execute("""
            INSERT INTO task_singolo
                (titolo, descrizione, data_scadenza, ora_scadenza,
                 assegnato_user, priorita, reparto, livello_cucina,
                 origine, ref_modulo, ref_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUALE', ?, ?, ?)
        """, (
            payload.titolo,
            payload.descrizione,
            payload.data_scadenza,
            payload.ora_scadenza,
            payload.assegnato_user,
            payload.priorita,
            rep,
            livello,
            payload.ref_modulo,
            payload.ref_id,
            user["username"],
        ))
        tid = cur.lastrowid
        conn.commit()

        row = conn.execute("SELECT * FROM task_singolo WHERE id = ?", (tid,)).fetchone()
        return _row_to_task(row)
    finally:
        conn.close()


# ─── PUT /tasks/tasks/{id} ────────────────────────────────────────────

@router.put("/tasks/{tid}")
def update_task(
    tid: int,
    payload: TaskSingoloUpdate,
    user: dict = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, "Nessun campo da aggiornare")

    if "priorita" in data and data["priorita"] not in TASK_PRIORITA:
        raise HTTPException(400, f"priorita non valida: {data['priorita']}")
    if "stato" in data and data["stato"] not in TASK_STATI:
        raise HTTPException(400, f"stato non valido: {data['stato']}")
    if "reparto" in data:
        rep = _normalize_reparto(data["reparto"])
        if rep and rep not in REPARTI:
            raise HTTPException(400, f"reparto non valido: {rep}. Valori: {sorted(REPARTI)}")
        data["reparto"] = rep or "cucina"
    # Phase A.2: validazione livello_cucina + forza NULL se reparto non-cucina
    if "livello_cucina" in data:
        lc = data["livello_cucina"]
        if lc is not None and lc not in LIVELLI_CUCINA:
            raise HTTPException(400, f"livello_cucina non valido: {lc}")

    conn = get_tasks_conn()
    try:
        row = conn.execute("SELECT id, stato, reparto, livello_cucina FROM task_singolo WHERE id = ?", (tid,)).fetchone()
        if not row:
            raise HTTPException(404, "Task non trovato")
        if row["stato"] == "COMPLETATO" and "stato" not in data:
            raise HTTPException(400, "Task COMPLETATO: usa endpoint dedicato per riaprire")

        # Phase A.2: forza livello_cucina=NULL se reparto effettivo non e' cucina
        effective_reparto = data.get("reparto", row["reparto"])
        if effective_reparto != "cucina":
            data["livello_cucina"] = None

        # Phase A.3 — anti-escalation: sous_chef/commis non possono modificare
        # un task cucina di livello superiore, ne' promuoverlo verso l'alto.
        if effective_reparto == "cucina":
            allowed = _allowed_livelli_for_role(user["role"])
            if allowed is not None:
                # Il livello attuale deve essere visibile al ruolo.
                current_livello = row["livello_cucina"] if row["reparto"] == "cucina" else None
                if current_livello not in allowed:
                    raise HTTPException(404, "Task non trovato")
                # Il livello target (dopo l'update) deve essere consentito.
                effective_livello = data.get("livello_cucina", current_livello)
                if effective_livello not in allowed:
                    raise HTTPException(
                        status_code=403,
                        detail="Non puoi assegnare task a un livello superiore al tuo",
                    )

        sets = [f"{k} = ?" for k in data.keys()]
        params = list(data.values()) + [tid]
        conn.execute(f"UPDATE task_singolo SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()

        row = conn.execute("SELECT * FROM task_singolo WHERE id = ?", (tid,)).fetchone()
        return _row_to_task(row)
    finally:
        conn.close()


# ─── POST /tasks/tasks/{id}/completa ──────────────────────────────────

@router.post("/tasks/{tid}/completa")
def completa_task(
    tid: int,
    payload: CompletaTaskIn,
    user: dict = Depends(get_current_user),
):
    conn = get_tasks_conn()
    try:
        row = conn.execute(
            "SELECT id, stato, reparto, livello_cucina FROM task_singolo WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Task non trovato")
        # Phase A.3 — anti-escalation: sous_chef/commis non possono completare
        # task cucina di livello superiore.
        allowed = _allowed_livelli_for_role(user["role"])
        if allowed is not None and row["reparto"] == "cucina":
            if row["livello_cucina"] not in allowed:
                raise HTTPException(404, "Task non trovato")
        if row["stato"] == "COMPLETATO":
            raise HTTPException(400, "Task gia' COMPLETATO")
        if row["stato"] == "ANNULLATO":
            raise HTTPException(400, "Task ANNULLATO: non completabile")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("""
            UPDATE task_singolo
               SET stato = 'COMPLETATO',
                   completato_at = ?,
                   completato_da = ?,
                   note_completamento = ?
             WHERE id = ?
        """, (now, user["username"], payload.note_completamento, tid))
        conn.commit()

        row = conn.execute("SELECT * FROM task_singolo WHERE id = ?", (tid,)).fetchone()
        return _row_to_task(row)
    finally:
        conn.close()


# ─── DELETE /tasks/tasks/{id} ─────────────────────────────────────────

@router.delete("/tasks/{tid}")
def delete_task(tid: int, user: dict = Depends(get_current_user)):
    _require_admin_or_chef(user)
    conn = get_tasks_conn()
    try:
        row = conn.execute(
            "SELECT id, reparto, livello_cucina FROM task_singolo WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Task non trovato")
        # Phase A.3 — anti-escalation: sous_chef/commis non possono cancellare
        # task cucina di livello superiore.
        allowed = _allowed_livelli_for_role(user["role"])
        if allowed is not None and row["reparto"] == "cucina":
            if row["livello_cucina"] not in allowed:
                raise HTTPException(404, "Task non trovato")
        conn.execute("DELETE FROM task_singolo WHERE id = ?", (tid,))
        conn.commit()
        return {"ok": True, "deleted_id": tid}
    finally:
        conn.close()
