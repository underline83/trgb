#!/usr/bin/env python3
# Modulo: cucina
# @version: v1.0 — Ubicazioni, ripiani, temperature, manutenzioni (2026-09-07)
# -*- coding: utf-8 -*-
"""
Router Ubicazioni & Ripiani — modulo cucina.

Doc canonico: docs/modulo_scorte_cucina.md
module.json (pre-R8): id=cucina · prefix `/cucina/ubicazioni` ·
tabelle cucina_ubicazioni, cucina_ripiani, cucina_manutenzioni ·
platform: auth, permessi · frontend: /cucina/mobile (tab «Frigo»)

QUESTO ROUTER E' IL CUORE DELLA UI SCELTA DA MARCO
--------------------------------------------------
La sotto-app mobile parte DAL POSTO, non dall'articolo: apri «Frigo carne» e
spunti cosa manca, ripiano per ripiano, dall'alto in basso. Quindi
`GET /cucina/ubicazioni/{id}` non ritorna l'anagrafica del frigo: ritorna
IL GIRO — i ripiani con la loro destinazione d'uso e la loro dotazione
(compresa la roba finita, che e' esattamente quella che si sta cercando), la
temperatura di oggi e i guasti aperti.

Le temperature arrivano dal Task Manager via `app/services/haccp_letture.py`,
mai da una tabella di questo modulo: il registro HACCP resta uno solo.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.cucina_scorte_db import (
    DESTINAZIONI_RIPIANO,
    REPARTI,
    STATI_MANUTENZIONE,
    TIPI_MANUTENZIONE,
    TIPI_REFRIGERATI,
    TIPI_UBICAZIONE,
    assicura_ripiano_default,
    incompatibile,
    valida,
)
from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user
from app.services.haccp_letture import crea_task_guasto, letture_ubicazione, ultima_lettura
from app.services.permessi import richiede_ruoli, verifica_ruoli

# PERMESSI (M.G) — chi puo' toccare i frigoriferi.
# Router: la brigata al completo, perche' il giro di controllo lo fa chi sta in
# cucina. Anagrafica di posti e ripiani + manutenzioni: solo admin/chef
# (verifica_ruoli nel corpo), perche' aggiungere o togliere un ripiano cambia
# il giro e la conta a tutti.
router = APIRouter(
    prefix="/cucina/ubicazioni",
    tags=["cucina-ubicazioni"],
    dependencies=[
        Depends(richiede_ruoli("admin", "chef", "sous_chef", "commis",
                               cosa="ubicazioni di cucina")),
    ],
)

GESTIONE = ("admin", "chef")


# ─── Schemi ────────────────────────────────────────────────

class UbicazioneIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=120)
    tipo: str = "FRIGO"
    reparto: str = "cucina"
    temp_min: Optional[float] = None
    temp_max: Optional[float] = None
    marca: Optional[str] = Field(default=None, max_length=80)
    modello: Optional[str] = Field(default=None, max_length=80)
    matricola: Optional[str] = Field(default=None, max_length=80)
    anno: Optional[int] = None
    ordine: int = 0
    note: Optional[str] = Field(default=None, max_length=500)
    n_ripiani: int = Field(default=1, ge=1, le=40,
                           description="Quanti ripiani creare subito, numerati 1..N")


class UbicazioneUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=120)
    tipo: Optional[str] = None
    reparto: Optional[str] = None
    temp_min: Optional[float] = None
    temp_max: Optional[float] = None
    marca: Optional[str] = Field(default=None, max_length=80)
    modello: Optional[str] = Field(default=None, max_length=80)
    matricola: Optional[str] = Field(default=None, max_length=80)
    anno: Optional[int] = None
    ordine: Optional[int] = None
    attivo: Optional[bool] = None
    note: Optional[str] = Field(default=None, max_length=500)


class RipianoIn(BaseModel):
    codice: str = Field(..., min_length=1, max_length=20)
    nome: Optional[str] = Field(default=None, max_length=80)
    destinazione: Optional[str] = None
    ordine: int = 0
    note: Optional[str] = Field(default=None, max_length=300)


class RipianoUpdate(BaseModel):
    codice: Optional[str] = Field(default=None, min_length=1, max_length=20)
    nome: Optional[str] = Field(default=None, max_length=80)
    destinazione: Optional[str] = None
    ordine: Optional[int] = None
    attivo: Optional[bool] = None
    note: Optional[str] = Field(default=None, max_length=300)


class ManutenzioneIn(BaseModel):
    tipo: str = "ORDINARIA"
    data: Optional[str] = None
    descrizione: Optional[str] = Field(default=None, max_length=1000)
    ditta: Optional[str] = Field(default=None, max_length=120)
    costo: Optional[float] = None
    note: Optional[str] = Field(default=None, max_length=500)


class ManutenzioneUpdate(BaseModel):
    tipo: Optional[str] = None
    data: Optional[str] = None
    descrizione: Optional[str] = Field(default=None, max_length=1000)
    ditta: Optional[str] = Field(default=None, max_length=120)
    costo: Optional[float] = None
    stato: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)


# ─── Helper ────────────────────────────────────────────────

def _utente(current_user) -> str:
    return (current_user or {}).get("username") or "?"


def _v(fn):
    """Traduce le ValueError delle liste chiuse in 422 leggibili."""
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


def _get_ubicazione(cur, ubicazione_id: int) -> Dict[str, Any]:
    row = cur.execute("SELECT * FROM cucina_ubicazioni WHERE id = ?", (ubicazione_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Ubicazione non trovata")
    return dict(row)


def _get_ripiano(cur, ubicazione_id: int, ripiano_id: int) -> Dict[str, Any]:
    row = cur.execute(
        "SELECT * FROM cucina_ripiani WHERE id = ? AND ubicazione_id = ?",
        (ripiano_id, ubicazione_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Ripiano non trovato in questa ubicazione")
    return dict(row)


def _dotazione_ripiano(cur, ripiano_id: int, destinazione: Optional[str]) -> List[Dict[str, Any]]:
    """La dotazione di un ripiano — roba finita compresa.

    Ogni riga porta `fuori_posto`: il crudo su un ripiano del cotto si vede
    subito. E' un segnale, non un divieto.
    """
    righe = cur.execute(
        """
        SELECT  g.id AS giacenza_id, g.articolo_id, g.qta, g.stato_semaforo,
                g.in_dotazione, g.ordine, g.aggiornato_at, g.aggiornato_da, g.origine,
                a.nome, a.categoria, a.um, a.confezione, a.regime, a.natura,
                a.scorta_minima, a.giorni_dato_fresco, a.famiglia_freschezza
          FROM cucina_giacenze g
          JOIN cucina_articoli a ON a.id = g.articolo_id
         WHERE g.ripiano_id = ? AND a.attivo = 1
         ORDER BY g.in_dotazione DESC, g.ordine, a.nome
        """,
        (ripiano_id,),
    ).fetchall()
    out = []
    for r in righe:
        d = dict(r)
        d["fuori_posto"] = incompatibile(d.get("natura"), destinazione)
        out.append(d)
    return out


# ─── Il giro ───────────────────────────────────────────────

@router.get("/")
def list_ubicazioni(
    reparto: Optional[str] = Query(default="cucina"),
    tipo: Optional[str] = None,
    solo_attive: bool = True,
    con_stato: bool = Query(default=True, description="Include temperatura di oggi e conteggi"),
):
    """Il giro di controllo, nell'ordine in cui si fa.

    Con `con_stato` (default) ogni riga porta gia' cio' che serve a decidere se
    aprirla: quanti ripiani, quanti articoli mancano, l'ultima temperatura, se
    c'e' un guasto aperto. Il tab «Frigo» e' una chiamata sola.
    """
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        sql = "SELECT * FROM cucina_ubicazioni WHERE 1=1"
        args: List[Any] = []
        if solo_attive:
            sql += " AND attivo = 1"
        if reparto:
            sql += " AND reparto = ?"
            args.append(reparto.strip().lower())
        if tipo:
            sql += " AND tipo = ?"
            args.append(tipo.strip().upper())
        sql += " ORDER BY ordine ASC, nome ASC"
        rows = [dict(r) for r in cur.execute(sql, args).fetchall()]

        if not con_stato:
            return {"ubicazioni": rows}

        for u in rows:
            uid = u["id"]
            c = cur.execute(
                """
                SELECT COUNT(*) AS in_dotazione,
                       SUM(CASE WHEN g.stato_semaforo = 'FINITO'      THEN 1 ELSE 0 END) AS finiti,
                       SUM(CASE WHEN g.stato_semaforo = 'ESAURIMENTO' THEN 1 ELSE 0 END) AS in_esaurimento
                  FROM cucina_giacenze g
                  JOIN cucina_articoli a ON a.id = g.articolo_id AND a.attivo = 1
                 WHERE g.ubicazione_id = ? AND g.in_dotazione = 1
                """,
                (uid,),
            ).fetchone()
            u["dotazione"] = {
                "articoli": (c["in_dotazione"] or 0) if c else 0,
                "finiti": (c["finiti"] or 0) if c else 0,
                "in_esaurimento": (c["in_esaurimento"] or 0) if c else 0,
            }
            u["ripiani"] = cur.execute(
                "SELECT COUNT(*) FROM cucina_ripiani WHERE ubicazione_id = ? AND attivo = 1",
                (uid,),
            ).fetchone()[0]
            u["guasti_aperti"] = cur.execute(
                "SELECT COUNT(*) FROM cucina_manutenzioni WHERE ubicazione_id = ? AND stato = 'APERTO'",
                (uid,),
            ).fetchone()[0]
            u["refrigerato"] = u.get("tipo") in TIPI_REFRIGERATI
            u["ultima_temperatura"] = (
                ultima_lettura(uid, u.get("temp_min"), u.get("temp_max"))
                if u["refrigerato"] else None
            )
        return {"ubicazioni": rows}
    finally:
        conn.close()


@router.get("/{ubicazione_id}")
def get_ubicazione(ubicazione_id: int):
    """La scheda del posto: identita', soglie, I RIPIANI CON LA LORO DOTAZIONE,
    temperature, guasti.

    La dotazione include gli articoli a zero e con semaforo FINITO: e' la
    ragione per cui esiste `cucina_giacenze.in_dotazione`. Un frigo che
    elencasse solo cio' che ha dentro nasconderebbe proprio i buchi.
    """
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        u = _get_ubicazione(cur, ubicazione_id)
        u["refrigerato"] = u.get("tipo") in TIPI_REFRIGERATI

        ripiani = []
        for r in cur.execute(
            "SELECT * FROM cucina_ripiani WHERE ubicazione_id = ? AND attivo = 1 ORDER BY ordine, id",
            (ubicazione_id,),
        ).fetchall():
            rip = dict(r)
            rip["dotazione"] = _dotazione_ripiano(cur, rip["id"], rip.get("destinazione"))
            rip["finiti"] = sum(1 for d in rip["dotazione"] if d["stato_semaforo"] == "FINITO")
            ripiani.append(rip)
        u["ripiani"] = ripiani

        u["temperature"] = (
            letture_ubicazione(ubicazione_id, limit=7,
                               temp_min=u.get("temp_min"), temp_max=u.get("temp_max"))
            if u["refrigerato"] else []
        )
        u["manutenzioni_aperte"] = [dict(r) for r in cur.execute(
            "SELECT * FROM cucina_manutenzioni WHERE ubicazione_id = ? AND stato = 'APERTO' ORDER BY data DESC",
            (ubicazione_id,),
        ).fetchall()]
        return {"ubicazione": u}
    finally:
        conn.close()


@router.post("/", status_code=201)
def create_ubicazione(payload: UbicazioneIn, current_user=Depends(get_current_user)):
    """Crea un posto e i suoi ripiani.

    Anche chiedendone zero ne nasce uno: l'invariante «ogni ubicazione ha almeno
    un ripiano» e' cio' che tiene lo schema senza campi nullable e la UI con un
    modo solo di navigare.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="creare un'ubicazione")
    tipo = _v(lambda: valida(payload.tipo, TIPI_UBICAZIONE, "tipo"))
    reparto = _v(lambda: valida(payload.reparto, REPARTI, "reparto"))

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO cucina_ubicazioni
                (nome, tipo, reparto, temp_min, temp_max, marca, modello,
                 matricola, anno, ordine, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (payload.nome.strip(), tipo, reparto, payload.temp_min, payload.temp_max,
             (payload.marca or "").strip() or None,
             (payload.modello or "").strip() or None,
             (payload.matricola or "").strip() or None,
             payload.anno, payload.ordine,
             (payload.note or "").strip() or None,
             _utente(current_user)),
        )
        new_id = cur.lastrowid

        for i in range(1, max(1, payload.n_ripiani) + 1):
            cur.execute(
                "INSERT OR IGNORE INTO cucina_ripiani (ubicazione_id, codice, ordine) VALUES (?, ?, ?)",
                (new_id, str(i), i - 1),
            )
        assicura_ripiano_default(conn, new_id)
        conn.commit()

        u = _get_ubicazione(cur, new_id)
        u["ripiani"] = [dict(r) for r in cur.execute(
            "SELECT * FROM cucina_ripiani WHERE ubicazione_id = ? ORDER BY ordine, id", (new_id,)
        ).fetchall()]
        return {"ok": True, "ubicazione": u}
    finally:
        conn.close()


@router.patch("/{ubicazione_id}")
def update_ubicazione(ubicazione_id: int, payload: UbicazioneUpdate,
                      current_user=Depends(get_current_user)):
    verifica_ruoli(current_user, *GESTIONE, cosa="modificare un'ubicazione")
    d = payload.dict(exclude_unset=True)
    if not d:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    if "tipo" in d:
        d["tipo"] = _v(lambda: valida(d["tipo"], TIPI_UBICAZIONE, "tipo"))
    if "reparto" in d:
        d["reparto"] = _v(lambda: valida(d["reparto"], REPARTI, "reparto"))
    if "attivo" in d:
        d["attivo"] = 1 if d["attivo"] else 0

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_ubicazione(cur, ubicazione_id)
        sets = ", ".join(f"{k} = ?" for k in d)
        cur.execute(f"UPDATE cucina_ubicazioni SET {sets} WHERE id = ?",
                    [*d.values(), ubicazione_id])
        conn.commit()
        return {"ok": True, "ubicazione": _get_ubicazione(cur, ubicazione_id)}
    finally:
        conn.close()


@router.delete("/{ubicazione_id}")
def disattiva_ubicazione(ubicazione_id: int, current_user=Depends(get_current_user)):
    """Disattiva, non cancella.

    Un frigo dismesso ha addosso anni di temperature e di guasti: si toglie dal
    giro, non dalla storia.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="disattivare un'ubicazione")
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_ubicazione(cur, ubicazione_id)
        cur.execute("UPDATE cucina_ubicazioni SET attivo = 0 WHERE id = ?", (ubicazione_id,))
        conn.commit()
        return {"ok": True, "disattivata": ubicazione_id}
    finally:
        conn.close()


# ─── Ripiani ───────────────────────────────────────────────

@router.get("/{ubicazione_id}/ripiani")
def list_ripiani(ubicazione_id: int, solo_attivi: bool = True):
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_ubicazione(cur, ubicazione_id)
        sql = "SELECT * FROM cucina_ripiani WHERE ubicazione_id = ?"
        args: List[Any] = [ubicazione_id]
        if solo_attivi:
            sql += " AND attivo = 1"
        sql += " ORDER BY ordine, id"
        return {"ripiani": [dict(r) for r in cur.execute(sql, args).fetchall()]}
    finally:
        conn.close()


@router.get("/{ubicazione_id}/ripiani/{ripiano_id}")
def get_ripiano(ubicazione_id: int, ripiano_id: int):
    """Un ripiano e la sua dotazione — l'unita' del giro e della conta."""
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        u = _get_ubicazione(cur, ubicazione_id)
        r = _get_ripiano(cur, ubicazione_id, ripiano_id)
        r["ubicazione"] = {"id": u["id"], "nome": u["nome"], "tipo": u["tipo"]}
        r["dotazione"] = _dotazione_ripiano(cur, ripiano_id, r.get("destinazione"))
        r["finiti"] = sum(1 for d in r["dotazione"] if d["stato_semaforo"] == "FINITO")
        return {"ripiano": r}
    finally:
        conn.close()


@router.post("/{ubicazione_id}/ripiani", status_code=201)
def create_ripiano(ubicazione_id: int, payload: RipianoIn,
                   current_user=Depends(get_current_user)):
    """Aggiunge un ripiano. Il codice e' LOCALE: unico dentro questo posto,
    libero di ripetersi altrove."""
    verifica_ruoli(current_user, *GESTIONE, cosa="creare un ripiano")
    dest = _v(lambda: valida(payload.destinazione, DESTINAZIONI_RIPIANO, "destinazione"))

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_ubicazione(cur, ubicazione_id)
        gia = cur.execute(
            "SELECT id FROM cucina_ripiani WHERE ubicazione_id = ? AND codice = ?",
            (ubicazione_id, payload.codice.strip()),
        ).fetchone()
        if gia:
            raise HTTPException(status_code=409,
                                detail=f"Ripiano '{payload.codice}' esiste gia' in questo posto")
        cur.execute(
            """
            INSERT INTO cucina_ripiani (ubicazione_id, codice, nome, destinazione, ordine, note)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (ubicazione_id, payload.codice.strip(),
             (payload.nome or "").strip() or None, dest, payload.ordine,
             (payload.note or "").strip() or None),
        )
        new_id = cur.lastrowid
        conn.commit()
        return {"ok": True, "ripiano": _get_ripiano(cur, ubicazione_id, new_id)}
    finally:
        conn.close()


@router.patch("/{ubicazione_id}/ripiani/{ripiano_id}")
def update_ripiano(ubicazione_id: int, ripiano_id: int, payload: RipianoUpdate,
                   current_user=Depends(get_current_user)):
    verifica_ruoli(current_user, *GESTIONE, cosa="modificare un ripiano")
    d = payload.dict(exclude_unset=True)
    if not d:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    if "destinazione" in d:
        d["destinazione"] = _v(lambda: valida(d["destinazione"], DESTINAZIONI_RIPIANO, "destinazione"))
    if "attivo" in d:
        d["attivo"] = 1 if d["attivo"] else 0

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_ripiano(cur, ubicazione_id, ripiano_id)
        sets = ", ".join(f"{k} = ?" for k in d)
        try:
            cur.execute(f"UPDATE cucina_ripiani SET {sets} WHERE id = ?",
                        [*d.values(), ripiano_id])
        except Exception:
            raise HTTPException(status_code=409,
                                detail="Codice ripiano gia' usato in questo posto")
        conn.commit()
        return {"ok": True, "ripiano": _get_ripiano(cur, ubicazione_id, ripiano_id)}
    finally:
        conn.close()


@router.delete("/{ubicazione_id}/ripiani/{ripiano_id}")
def disattiva_ripiano(ubicazione_id: int, ripiano_id: int,
                      current_user=Depends(get_current_user)):
    """Disattiva un ripiano, mai l'ultimo rimasto.

    Togliere l'ultimo ripiano lascerebbe l'ubicazione senza un posto dove
    mettere le cose, e romperebbe l'invariante su cui poggia tutto il modulo.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="disattivare un ripiano")
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_ripiano(cur, ubicazione_id, ripiano_id)
        attivi = cur.execute(
            "SELECT COUNT(*) FROM cucina_ripiani WHERE ubicazione_id = ? AND attivo = 1",
            (ubicazione_id,),
        ).fetchone()[0]
        if attivi <= 1:
            raise HTTPException(
                status_code=409,
                detail="E' l'ultimo ripiano del posto: ogni ubicazione deve averne almeno uno",
            )
        con_roba = cur.execute(
            "SELECT COUNT(*) FROM cucina_giacenze WHERE ripiano_id = ? AND COALESCE(qta,0) > 0",
            (ripiano_id,),
        ).fetchone()[0]
        if con_roba:
            raise HTTPException(
                status_code=409,
                detail=f"Sul ripiano ci sono ancora {con_roba} articoli con giacenza: spostali prima",
            )
        cur.execute("UPDATE cucina_ripiani SET attivo = 0 WHERE id = ?", (ripiano_id,))
        conn.commit()
        return {"ok": True, "disattivato": ripiano_id}
    finally:
        conn.close()


# ─── Temperature (lettura dal Task Manager) ────────────────

@router.get("/{ubicazione_id}/temperature")
def temperature(ubicazione_id: int, limit: int = Query(default=30, ge=1, le=365)):
    """Serie storica delle letture, col fuori-soglia calcolato sulle soglie del frigo.

    Sola lettura verso `tasks.sqlite3` via servizio platform. Se nessun item di
    checklist e' ancora agganciato a questa ubicazione la lista e' vuota: e' il
    comportamento atteso, non un errore da mostrare.
    """
    conn = get_foodcost_connection()
    try:
        u = _get_ubicazione(conn.cursor(), ubicazione_id)
    finally:
        conn.close()
    letture = letture_ubicazione(ubicazione_id, limit=limit,
                                 temp_min=u.get("temp_min"), temp_max=u.get("temp_max"))
    return {
        "ubicazione_id": ubicazione_id,
        "nome": u.get("nome"),
        "temp_min": u.get("temp_min"),
        "temp_max": u.get("temp_max"),
        "soglie_dichiarate": u.get("temp_min") is not None or u.get("temp_max") is not None,
        "letture": letture,
        "fuori_soglia": sum(1 for l in letture if l.get("fuori_soglia")),
    }


# ─── Manutenzioni e guasti ─────────────────────────────────

@router.get("/{ubicazione_id}/manutenzioni")
def list_manutenzioni(ubicazione_id: int, solo_aperte: bool = False):
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_ubicazione(cur, ubicazione_id)
        sql = "SELECT * FROM cucina_manutenzioni WHERE ubicazione_id = ?"
        args: List[Any] = [ubicazione_id]
        if solo_aperte:
            sql += " AND stato = 'APERTO'"
        sql += " ORDER BY data DESC, id DESC"
        return {"manutenzioni": [dict(r) for r in cur.execute(sql, args).fetchall()]}
    finally:
        conn.close()


@router.post("/{ubicazione_id}/manutenzioni", status_code=201)
def create_manutenzione(ubicazione_id: int, payload: ManutenzioneIn,
                        current_user=Depends(get_current_user)):
    """Registra un intervento. Se e' un GUASTO apre anche un task singolo.

    Il task va nel Task Manager, dove la brigata guarda gia' cosa c'e' da fare:
    una to-do parallela dentro le scorte non la leggerebbe nessuno.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="registrare una manutenzione")
    tipo = _v(lambda: valida(payload.tipo, TIPI_MANUTENZIONE, "tipo"))
    utente = _utente(current_user)
    data = (payload.data or date.today().isoformat()).strip()

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        u = _get_ubicazione(cur, ubicazione_id)
        cur.execute(
            """
            INSERT INTO cucina_manutenzioni
                (ubicazione_id, tipo, data, descrizione, ditta, costo, stato, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'APERTO', ?, ?)
            """,
            (ubicazione_id, tipo, data,
             (payload.descrizione or "").strip() or None,
             (payload.ditta or "").strip() or None,
             payload.costo,
             (payload.note or "").strip() or None,
             utente),
        )
        new_id = cur.lastrowid

        task_id = None
        if tipo == "GUASTO":
            task_id = crea_task_guasto(
                titolo=f"Guasto {u['nome']}",
                descrizione=(payload.descrizione or "").strip() or None,
                created_by=utente,
                ref_id=new_id,
            )
            if task_id:
                cur.execute("UPDATE cucina_manutenzioni SET task_id = ? WHERE id = ?",
                            (task_id, new_id))

        conn.commit()
        row = cur.execute("SELECT * FROM cucina_manutenzioni WHERE id = ?", (new_id,)).fetchone()
        return {"ok": True, "manutenzione": dict(row), "task_id": task_id}
    finally:
        conn.close()


@router.patch("/{ubicazione_id}/manutenzioni/{manutenzione_id}")
def update_manutenzione(ubicazione_id: int, manutenzione_id: int,
                        payload: ManutenzioneUpdate,
                        current_user=Depends(get_current_user)):
    verifica_ruoli(current_user, *GESTIONE, cosa="modificare una manutenzione")
    d = payload.dict(exclude_unset=True)
    if not d:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    if "tipo" in d:
        d["tipo"] = _v(lambda: valida(d["tipo"], TIPI_MANUTENZIONE, "tipo"))
    if "stato" in d:
        d["stato"] = _v(lambda: valida(d["stato"], STATI_MANUTENZIONE, "stato"))

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        row = cur.execute(
            "SELECT * FROM cucina_manutenzioni WHERE id = ? AND ubicazione_id = ?",
            (manutenzione_id, ubicazione_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Manutenzione non trovata")

        chiude = d.get("stato") == "CHIUSO" and row["stato"] != "CHIUSO"
        if chiude:
            d["chiusa_da"] = _utente(current_user)

        sets = [f"{k} = ?" for k in d]
        args = list(d.values())
        if chiude:
            sets.append("chiusa_at = datetime('now','localtime')")
        cur.execute(f"UPDATE cucina_manutenzioni SET {', '.join(sets)} WHERE id = ?",
                    [*args, manutenzione_id])
        conn.commit()
        out = cur.execute("SELECT * FROM cucina_manutenzioni WHERE id = ?",
                          (manutenzione_id,)).fetchone()
        return {"ok": True, "manutenzione": dict(out)}
    finally:
        conn.close()
