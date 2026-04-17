# @version: v1.0-cucina-router
# -*- coding: utf-8 -*-
"""
Router Cucina — TRGB Gestionale (MVP, sessione 41)

Endpoint:
  Template (admin/superadmin/chef):
    GET    /cucina/templates/            — lista template con filtri
    GET    /cucina/templates/{id}        — dettaglio template + items
    POST   /cucina/templates/            — crea template + items
    PUT    /cucina/templates/{id}        — modifica template (items opzionale replace-all)
    DELETE /cucina/templates/{id}        — elimina (cascade su items)
    POST   /cucina/templates/{id}/duplica — duplica con items

(Agenda, instance, execution, task, scheduler negli Step 3-4.)

Autenticazione: JWT su tutti gli endpoint.
"""

from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from datetime import date, datetime, timedelta

from app.models.cucina_db import get_cucina_conn, init_cucina_db
from app.services.auth_service import get_current_user
from app.services import cucina_scheduler
from app.schemas.cucina_schema import (
    FREQUENZE, REPARTI, TURNI, ITEM_TIPI,
    INSTANCE_STATI, EXEC_STATI, TASK_STATI, TASK_PRIORITA,
    ChecklistItemIn, ChecklistItemOut,
    ChecklistTemplateIn, ChecklistTemplateUpdate, ChecklistTemplateOut,
    ChecklistInstanceOut, ChecklistExecutionOut,
    AssegnaInstanceIn, SaltaInstanceIn, CheckItemIn,
    AgendaGiornoOut, AgendaTurnoBucket, GeneraIstanzeIn,
    TaskSingoloIn, TaskSingoloUpdate, TaskSingoloOut, CompletaTaskIn,
)

# Inizializza DB al primo import
init_cucina_db()

router = APIRouter(prefix="/cucina", tags=["Cucina"])


# ─── Helpers ───────────────────────────────────────────────────────────

def _require_admin_or_chef(user: dict):
    if user["role"] not in ("admin", "superadmin", "chef"):
        raise HTTPException(status_code=403, detail="Permesso negato")


def _require_admin(user: dict):
    if user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo admin")


def _validate_template_payload(payload: dict) -> None:
    """Valida reparto/frequenza/turno/tipi item. Solleva 400 con messaggio chiaro."""
    reparto = payload.get("reparto")
    if reparto and reparto not in REPARTI:
        raise HTTPException(400, f"reparto non valido: {reparto}. Valori: {sorted(REPARTI)}")

    frequenza = payload.get("frequenza")
    if frequenza and frequenza not in FREQUENZE:
        raise HTTPException(400, f"frequenza non valida in MVP: {frequenza}. Solo GIORNALIERA.")

    turno = payload.get("turno")
    if turno and turno not in TURNI:
        raise HTTPException(400, f"turno non valido: {turno}. Valori: {sorted(TURNI)}")

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
    return ChecklistTemplateOut(
        id=row["id"],
        nome=row["nome"],
        reparto=row["reparto"],
        frequenza=row["frequenza"],
        turno=row["turno"],
        ora_scadenza_entro=row["ora_scadenza_entro"],
        attivo=bool(row["attivo"]),
        note=row["note"],
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


# ─── GET /cucina/templates/ ────────────────────────────────────────────

@router.get("/templates/")
def list_templates(
    reparto: Optional[str] = Query(None),
    turno: Optional[str] = Query(None),
    attivo: Optional[bool] = Query(None),
    user: dict = Depends(get_current_user),
):
    _require_admin_or_chef(user)

    where = []
    params = []
    if reparto:
        where.append("reparto = ?")
        params.append(reparto)
    if turno:
        where.append("turno = ?")
        params.append(turno)
    if attivo is not None:
        where.append("attivo = ?")
        params.append(1 if attivo else 0)

    sql = "SELECT * FROM checklist_template"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY reparto, turno, nome"

    conn = get_cucina_conn()
    try:
        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            items = _fetch_items(conn, r["id"])
            out.append(_row_to_template(r, items).model_dump())
        return out
    finally:
        conn.close()


# ─── GET /cucina/templates/{id} ────────────────────────────────────────

@router.get("/templates/{tid}")
def get_template(tid: int, user: dict = Depends(get_current_user)):
    _require_admin_or_chef(user)
    conn = get_cucina_conn()
    try:
        row = conn.execute(
            "SELECT * FROM checklist_template WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Template non trovato")
        items = _fetch_items(conn, tid)
        return _row_to_template(row, items).model_dump()
    finally:
        conn.close()


# ─── POST /cucina/templates/ ───────────────────────────────────────────

@router.post("/templates/", status_code=201)
def create_template(
    payload: ChecklistTemplateIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    _validate_template_payload(payload.model_dump())

    conn = get_cucina_conn()
    try:
        cur = conn.execute("""
            INSERT INTO checklist_template
                (nome, reparto, frequenza, turno, ora_scadenza_entro, attivo, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.nome,
            payload.reparto,
            payload.frequenza,
            payload.turno,
            payload.ora_scadenza_entro,
            1 if payload.attivo else 0,
            payload.note,
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


# ─── PUT /cucina/templates/{id} ────────────────────────────────────────

@router.put("/templates/{tid}")
def update_template(
    tid: int,
    payload: ChecklistTemplateUpdate,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)

    conn = get_cucina_conn()
    try:
        row = conn.execute(
            "SELECT * FROM checklist_template WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Template non trovato")

        data = payload.model_dump(exclude_unset=True, exclude={"items"})
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


# ─── DELETE /cucina/templates/{id} ─────────────────────────────────────

@router.delete("/templates/{tid}")
def delete_template(tid: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    conn = get_cucina_conn()
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


# ─── POST /cucina/templates/{id}/duplica ───────────────────────────────

@router.post("/templates/{tid}/duplica", status_code=201)
def duplica_template(tid: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    conn = get_cucina_conn()
    try:
        row = conn.execute(
            "SELECT * FROM checklist_template WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Template non trovato")

        nuovo_nome = f"{row['nome']} (copia)"
        cur = conn.execute("""
            INSERT INTO checklist_template
                (nome, reparto, frequenza, turno, ora_scadenza_entro, attivo, note, created_by)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        """, (
            nuovo_nome,
            row["reparto"],
            row["frequenza"],
            row["turno"],
            row["ora_scadenza_entro"],
            row["note"],
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
        SELECT i.*, t.nome AS template_nome, t.reparto AS template_reparto
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

    return ChecklistInstanceOut(
        id=inst["id"],
        template_id=inst["template_id"],
        template_nome=inst["template_nome"],
        reparto=inst["template_reparto"],
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


# ─── GET /cucina/agenda/ ───────────────────────────────────────────────

@router.get("/agenda/")
def get_agenda_giornaliera(
    data: Optional[str] = Query(None, description="YYYY-MM-DD (default: oggi)"),
    turno: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    # Tutti gli operativi (no viewer, no bloccati)
    data_str = data or date.today().isoformat()

    # Lazy: genera istanze del giorno + scadute (idempotente)
    try:
        cucina_scheduler.genera_istanze_per_data(
            get_cucina_conn().__enter__() if False else get_cucina_conn(),
            date.fromisoformat(data_str),
        )
    except Exception:
        pass  # best-effort

    conn = get_cucina_conn()
    try:
        # Aggiorna scadute
        cucina_scheduler.check_scadenze(conn)

        # Fetch istanze per la data
        where = ["i.data_riferimento = ?"]
        params = [data_str]
        if turno:
            where.append("i.turno = ?")
            params.append(turno)

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
        tasks_rows = conn.execute("""
            SELECT * FROM task_singolo
             WHERE data_scadenza = ?
               AND stato NOT IN ('ANNULLATO')
             ORDER BY
                CASE priorita WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
                ora_scadenza
        """, (data_str,)).fetchall()
        tasks = [dict(r) for r in tasks_rows]

        return {"data": data_str, "turni": turni_out, "tasks": tasks}
    finally:
        conn.close()


# ─── GET /cucina/agenda/settimana ──────────────────────────────────────

@router.get("/agenda/settimana")
def get_agenda_settimana(
    data_inizio: str = Query(..., description="YYYY-MM-DD (lunedi)"),
    user: dict = Depends(get_current_user),
):
    try:
        d0 = date.fromisoformat(data_inizio)
    except Exception:
        raise HTTPException(400, "data_inizio non valida (YYYY-MM-DD)")

    conn = get_cucina_conn()
    try:
        giorni = []
        for i in range(7):
            d = d0 + timedelta(days=i)
            # Aggiorna scadute al volo
            cucina_scheduler.check_scadenze(conn)

            rows = conn.execute("""
                SELECT i.id, i.turno, i.stato, t.nome AS template_nome
                  FROM checklist_instance i
                  JOIN checklist_template t ON t.id = i.template_id
                 WHERE i.data_riferimento = ?
                 ORDER BY i.turno
            """, (d.isoformat(),)).fetchall()

            task_rows = conn.execute("""
                SELECT id, titolo, stato, priorita, assegnato_user
                  FROM task_singolo
                 WHERE data_scadenza = ?
                   AND stato NOT IN ('ANNULLATO')
                 ORDER BY CASE priorita WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END
            """, (d.isoformat(),)).fetchall()

            giorni.append({
                "data": d.isoformat(),
                "instances": [dict(r) for r in rows],
                "tasks": [dict(r) for r in task_rows],
            })
        return {"data_inizio": d0.isoformat(), "giorni": giorni}
    finally:
        conn.close()


# ─── POST /cucina/agenda/genera ────────────────────────────────────────

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

    conn = get_cucina_conn()
    try:
        created = cucina_scheduler.genera_istanze_range(conn, d1, d2)
        return {"ok": True, "created": created, "range": [d1.isoformat(), d2.isoformat()]}
    finally:
        conn.close()


# ─── GET /cucina/instances/{id} ────────────────────────────────────────

@router.get("/instances/{iid}")
def get_instance(iid: int, user: dict = Depends(get_current_user)):
    conn = get_cucina_conn()
    try:
        cucina_scheduler.check_scadenze(conn)
        inst = _fetch_instance(conn, iid)
        if not inst:
            raise HTTPException(404, "Istanza non trovata")
        return inst
    finally:
        conn.close()


# ─── POST /cucina/instances/{id}/assegna ───────────────────────────────

@router.post("/instances/{iid}/assegna")
def assegna_instance(
    iid: int,
    payload: AssegnaInstanceIn,
    user: dict = Depends(get_current_user),
):
    conn = get_cucina_conn()
    try:
        row = conn.execute(
            "SELECT id, stato FROM checklist_instance WHERE id = ?", (iid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Istanza non trovata")
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


# ─── POST /cucina/instances/{id}/completa ──────────────────────────────

@router.post("/instances/{iid}/completa")
def completa_instance(iid: int, user: dict = Depends(get_current_user)):
    conn = get_cucina_conn()
    try:
        row = conn.execute(
            "SELECT id, stato FROM checklist_instance WHERE id = ?", (iid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Istanza non trovata")
        if row["stato"] in ("COMPLETATA", "SALTATA"):
            raise HTTPException(400, f"Istanza gia' {row['stato']}")

        score = cucina_scheduler.calcola_score_compliance(conn, iid)
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


# ─── POST /cucina/instances/{id}/salta ─────────────────────────────────

@router.post("/instances/{iid}/salta")
def salta_instance(
    iid: int,
    payload: SaltaInstanceIn,
    user: dict = Depends(get_current_user),
):
    _require_admin_or_chef(user)
    conn = get_cucina_conn()
    try:
        row = conn.execute(
            "SELECT id, stato FROM checklist_instance WHERE id = ?", (iid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Istanza non trovata")
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


# ─── POST /cucina/execution/item/{item_id}/check ───────────────────────

@router.post("/execution/item/{item_id}/check")
def check_item(
    item_id: int,
    payload: CheckItemIn,
    user: dict = Depends(get_current_user),
):
    if payload.stato not in ("OK", "FAIL", "SKIPPED"):
        raise HTTPException(400, f"stato non valido: {payload.stato}. Usa OK/FAIL/SKIPPED")

    conn = get_cucina_conn()
    try:
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
    conn = get_cucina_conn()
    try:
        today = date.today()
        created = cucina_scheduler.genera_istanze_range(
            conn, today, today + timedelta(days=1)
        )
        scaduted = cucina_scheduler.check_scadenze(conn)
        return {"ok": True, "created": created, "marked_scaduta": scaduted}
    finally:
        conn.close()


@router.post("/scheduler/check-scadute")
def scheduler_check_scadute(user: dict = Depends(get_current_user)):
    """Marca SCADUTE le istanze con scadenza_at oltrepassata."""
    _require_admin_or_chef(user)
    conn = get_cucina_conn()
    try:
        n = cucina_scheduler.check_scadenze(conn)
        return {"ok": True, "marked_scaduta": n}
    finally:
        conn.close()


# ======================================================================
# TASK SINGOLI (non ricorrenti)
# ======================================================================

def _row_to_task(row) -> dict:
    return TaskSingoloOut(
        id=row["id"],
        titolo=row["titolo"],
        descrizione=row["descrizione"],
        data_scadenza=row["data_scadenza"],
        ora_scadenza=row["ora_scadenza"],
        assegnato_user=row["assegnato_user"],
        priorita=row["priorita"],
        stato=row["stato"],
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


# ─── GET /cucina/tasks/ ────────────────────────────────────────────────

@router.get("/tasks/")
def list_tasks(
    user_filter: Optional[str] = Query(None, alias="user", description="Filtra per assegnato_user"),
    data: Optional[str] = Query(None, description="YYYY-MM-DD"),
    stato: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    conn = get_cucina_conn()
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


# ─── POST /cucina/tasks/ ───────────────────────────────────────────────

@router.post("/tasks/", status_code=201)
def create_task(
    payload: TaskSingoloIn,
    user: dict = Depends(get_current_user),
):
    if payload.priorita not in TASK_PRIORITA:
        raise HTTPException(400, f"priorita non valida: {payload.priorita}. Valori: {sorted(TASK_PRIORITA)}")

    conn = get_cucina_conn()
    try:
        cur = conn.execute("""
            INSERT INTO task_singolo
                (titolo, descrizione, data_scadenza, ora_scadenza,
                 assegnato_user, priorita, origine, ref_modulo, ref_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'MANUALE', ?, ?, ?)
        """, (
            payload.titolo,
            payload.descrizione,
            payload.data_scadenza,
            payload.ora_scadenza,
            payload.assegnato_user,
            payload.priorita,
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


# ─── PUT /cucina/tasks/{id} ────────────────────────────────────────────

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

    conn = get_cucina_conn()
    try:
        row = conn.execute("SELECT id, stato FROM task_singolo WHERE id = ?", (tid,)).fetchone()
        if not row:
            raise HTTPException(404, "Task non trovato")
        if row["stato"] == "COMPLETATO" and "stato" not in data:
            raise HTTPException(400, "Task COMPLETATO: usa endpoint dedicato per riaprire")

        sets = [f"{k} = ?" for k in data.keys()]
        params = list(data.values()) + [tid]
        conn.execute(f"UPDATE task_singolo SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()

        row = conn.execute("SELECT * FROM task_singolo WHERE id = ?", (tid,)).fetchone()
        return _row_to_task(row)
    finally:
        conn.close()


# ─── POST /cucina/tasks/{id}/completa ──────────────────────────────────

@router.post("/tasks/{tid}/completa")
def completa_task(
    tid: int,
    payload: CompletaTaskIn,
    user: dict = Depends(get_current_user),
):
    conn = get_cucina_conn()
    try:
        row = conn.execute(
            "SELECT id, stato FROM task_singolo WHERE id = ?", (tid,)
        ).fetchone()
        if not row:
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


# ─── DELETE /cucina/tasks/{id} ─────────────────────────────────────────

@router.delete("/tasks/{tid}")
def delete_task(tid: int, user: dict = Depends(get_current_user)):
    _require_admin_or_chef(user)
    conn = get_cucina_conn()
    try:
        row = conn.execute("SELECT id FROM task_singolo WHERE id = ?", (tid,)).fetchone()
        if not row:
            raise HTTPException(404, "Task non trovato")
        conn.execute("DELETE FROM task_singolo WHERE id = ?", (tid,))
        conn.commit()
        return {"ok": True, "deleted_id": tid}
    finally:
        conn.close()
