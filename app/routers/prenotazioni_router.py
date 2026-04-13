# ============================================================
# FILE: app/routers/prenotazioni_router.py
# Router Prenotazioni — TRGB Gestionale (Fase 1: Agenda)
# ============================================================

# @version: v1.0-prenotazioni-router
# -*- coding: utf-8 -*-
"""
Router Prenotazioni — TRGB Gestionale

Fase 1 — Agenda:
- Planning giornaliero (pranzo + cena)
- CRUD prenotazioni manuali
- Cambio stato rapido
- Riepilogo settimanale
- Mini-calendario con conteggi
- Configurazione (slot, capienza, template)
- Autocomplete clienti per form

Autenticazione:
- Tutti gli endpoint richiedono utente loggato (JWT).
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.clienti_db import get_clienti_conn, init_clienti_db
from app.services.auth_service import get_current_user
from app.utils.whatsapp import build_wa_link, fill_template

logger = logging.getLogger("trgb.prenotazioni")

router = APIRouter(prefix="/prenotazioni", tags=["Prenotazioni"])

# Inizializza DB (crea tabelle se mancanti)
init_clienti_db()


# ============================================================
# HELPERS
# ============================================================

STATI_VALIDI = {
    "RECORDED", "ARRIVED", "SEATED", "LEFT",
    "CANCELED", "NO_SHOW", "REFUSED", "REQUESTED",
    "BILL", "PARTIALLY_ARRIVED",
}

# Transizioni di stato permesse
TRANSIZIONI = {
    "RECORDED":   ["ARRIVED", "SEATED", "CANCELED", "NO_SHOW", "REFUSED"],
    "REQUESTED":  ["RECORDED", "REFUSED", "CANCELED"],
    "ARRIVED":    ["SEATED", "CANCELED", "NO_SHOW"],
    "SEATED":     ["LEFT", "BILL"],
    "BILL":       ["LEFT"],
    "LEFT":       [],
    "CANCELED":   ["RECORDED"],  # ripristino
    "NO_SHOW":    ["RECORDED"],  # ripristino
    "REFUSED":    ["RECORDED"],  # ripristino
    "PARTIALLY_ARRIVED": ["SEATED", "LEFT"],
}


def _get_config(conn) -> Dict[str, str]:
    """Legge tutta la configurazione prenotazioni come dict."""
    rows = conn.execute("SELECT chiave, valore FROM prenotazioni_config").fetchall()
    return {r["chiave"]: r["valore"] for r in rows}


def _calcola_turno(ora: str, soglia: str = "15:00") -> str:
    """Determina se e' pranzo o cena dall'orario."""
    if not ora:
        return "cena"
    ora_clean = ora[:5]  # "20:00:00" → "20:00"
    return "pranzo" if ora_clean < soglia else "cena"


def _backfill_turno_fonte(conn, soglia: str = "15:00"):
    """Backfill turno e fonte per prenotazioni esistenti (una tantum)."""
    # Backfill turno
    cur = conn.execute(
        "SELECT id, ora_pasto FROM clienti_prenotazioni WHERE turno IS NULL LIMIT 5000"
    )
    rows = cur.fetchall()
    if rows:
        for r in rows:
            turno = _calcola_turno(r["ora_pasto"], soglia)
            conn.execute(
                "UPDATE clienti_prenotazioni SET turno = ? WHERE id = ?",
                (turno, r["id"]),
            )
        logger.info(f"Backfill turno: {len(rows)} prenotazioni aggiornate")

    # Backfill fonte
    cur = conn.execute(
        "SELECT id, canale, prenotato_da FROM clienti_prenotazioni WHERE fonte IS NULL LIMIT 5000"
    )
    rows = cur.fetchall()
    if rows:
        for r in rows:
            if r["prenotato_da"] and "TheFork" in (r["prenotato_da"] or ""):
                fonte = "thefork"
            elif r["canale"] and "Booking" in (r["canale"] or ""):
                fonte = "widget"
            else:
                fonte = "thefork"  # storico importato = thefork
            conn.execute(
                "UPDATE clienti_prenotazioni SET fonte = ? WHERE id = ?",
                (fonte, r["id"]),
            )
        logger.info(f"Backfill fonte: {len(rows)} prenotazioni aggiornate")

    conn.commit()


# ============================================================
# PYDANTIC MODELS
# ============================================================

class PrenotazioneCreate(BaseModel):
    cliente_id: Optional[int] = None
    data_pasto: str
    ora_pasto: str
    pax: int = Field(default=2, ge=1, le=50)
    tavolo: Optional[str] = None
    canale: str = "Telefono"
    nota_ristorante: Optional[str] = None
    nota_cliente: Optional[str] = None
    occasione: Optional[str] = None
    allergie_segnalate: Optional[str] = None
    tavolo_esterno: int = 0
    seggioloni: Optional[str] = None
    # Per creazione cliente al volo
    nuovo_nome: Optional[str] = None
    nuovo_cognome: Optional[str] = None
    nuovo_telefono: Optional[str] = None
    nuovo_email: Optional[str] = None


class PrenotazioneUpdate(BaseModel):
    data_pasto: Optional[str] = None
    ora_pasto: Optional[str] = None
    pax: Optional[int] = None
    tavolo: Optional[str] = None
    canale: Optional[str] = None
    nota_ristorante: Optional[str] = None
    nota_cliente: Optional[str] = None
    occasione: Optional[str] = None
    allergie_segnalate: Optional[str] = None
    tavolo_esterno: Optional[int] = None
    seggioloni: Optional[str] = None
    stato: Optional[str] = None


class StatoUpdate(BaseModel):
    stato: str


# ============================================================
# ENDPOINT: PLANNING GIORNALIERO
# ============================================================

@router.get("/planning/{data}")
def get_planning(
    data: str,
    user: dict = Depends(get_current_user),
):
    """
    Planning completo di una giornata.
    Ritorna prenotazioni divise per turno (pranzo/cena) con dati cliente.
    """
    conn = get_clienti_conn()
    try:
        config = _get_config(conn)
        soglia = config.get("soglia_pranzo_cena", "15:00")

        # Backfill turno/fonte se servono (lazy, max 5000 per chiamata)
        _backfill_turno_fonte(conn, soglia)

        # nome / cognome usano COALESCE: preferiamo il dato CRM (aggiornabile),
        # fallback allo snapshot TheFork salvato in p.nome_ospite / p.cognome_ospite
        # (utile quando cliente_id e' NULL — vedi migrazione 068)
        rows = conn.execute("""
            SELECT
                p.id, p.cliente_id, p.data_pasto, p.ora_pasto, p.stato, p.pax,
                p.tavolo, p.canale, p.occasione, p.nota_ristorante, p.nota_cliente,
                p.data_prenotazione, p.prenotato_da, p.turno, p.fonte,
                p.allergie_segnalate, p.tavolo_esterno, p.seggioloni,
                p.menu_preset, p.degustazione, p.offerta_speciale, p.yums,
                p.thefork_booking_id, p.creato_da,
                p.nome_ospite, p.cognome_ospite,
                COALESCE(c.nome, p.nome_ospite) AS nome,
                COALESCE(c.cognome, p.cognome_ospite) AS cognome,
                c.nome2, c.cognome2,
                c.telefono, c.email, c.vip, c.allergie,
                c.pref_cibo, c.restrizioni_dietetiche, c.protetto,
                (SELECT COUNT(*) FROM clienti_prenotazioni
                 WHERE cliente_id = c.id AND stato IN ('SEATED','LEFT','ARRIVED','BILL'))
                    as visite_totali
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.data_pasto = ?
            ORDER BY p.ora_pasto, p.id
        """, (data,)).fetchall()

        pranzo = []
        cena = []
        pax_pranzo = 0
        pax_cena = 0
        senza_tavolo = 0

        for r in rows:
            item = dict(r)
            turno = item.get("turno") or _calcola_turno(item.get("ora_pasto"), soglia)
            item["turno"] = turno

            # Tag CRM del cliente
            if item["cliente_id"]:
                tags = conn.execute("""
                    SELECT t.nome, t.colore FROM clienti_tag t
                    JOIN clienti_tag_assoc a ON t.id = a.tag_id
                    WHERE a.cliente_id = ?
                """, (item["cliente_id"],)).fetchall()
                item["tags"] = [{"nome": t["nome"], "colore": t["colore"]} for t in tags]
            else:
                item["tags"] = []

            # Contatori
            if item["stato"] not in ("CANCELED", "NO_SHOW", "REFUSED"):
                if not item.get("tavolo"):
                    senza_tavolo += 1

            if turno == "pranzo":
                pranzo.append(item)
                if item["stato"] not in ("CANCELED", "NO_SHOW", "REFUSED"):
                    pax_pranzo += item.get("pax") or 0
            else:
                cena.append(item)
                if item["stato"] not in ("CANCELED", "NO_SHOW", "REFUSED"):
                    pax_cena += item.get("pax") or 0

        return {
            "data": data,
            "pranzo": pranzo,
            "cena": cena,
            "contatori": {
                "pranzo_count": len([p for p in pranzo if p["stato"] not in ("CANCELED", "NO_SHOW", "REFUSED")]),
                "cena_count": len([c for c in cena if c["stato"] not in ("CANCELED", "NO_SHOW", "REFUSED")]),
                "pranzo_pax": pax_pranzo,
                "cena_pax": pax_cena,
                "senza_tavolo": senza_tavolo,
                "capienza_pranzo": int(config.get("capienza_pranzo", 35)),
                "capienza_cena": int(config.get("capienza_cena", 50)),
            },
        }
    finally:
        conn.close()


# ============================================================
# ENDPOINT: RIEPILOGO SETTIMANALE
# ============================================================

@router.get("/settimana/{data}")
def get_settimana(
    data: str,
    user: dict = Depends(get_current_user),
):
    """Conteggi per 7 giorni a partire dalla data (lunedi' della settimana)."""
    conn = get_clienti_conn()
    try:
        config = _get_config(conn)
        soglia = config.get("soglia_pranzo_cena", "15:00")
        giorno_chiusura = int(config.get("giorno_chiusura", 3))
        # Config: 0=dom, 1=lun, 2=mar, 3=mer, 4=gio, 5=ven, 6=sab
        # Python weekday(): 0=lun, 1=mar, 2=mer, 3=gio, 4=ven, 5=sab, 6=dom
        _chiusura_map = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}
        weekday_chiuso = _chiusura_map.get(giorno_chiusura, -1)

        # Calcola il lunedi' della settimana
        d = date.fromisoformat(data)
        lunedi = d - timedelta(days=d.weekday())

        giorni = []
        for i in range(7):
            giorno = lunedi + timedelta(days=i)
            giorno_str = giorno.isoformat()

            rows = conn.execute("""
                SELECT ora_pasto, pax, stato, turno
                FROM clienti_prenotazioni
                WHERE data_pasto = ?
                  AND stato NOT IN ('CANCELED', 'NO_SHOW', 'REFUSED')
            """, (giorno_str,)).fetchall()

            pax_pranzo = 0
            pax_cena = 0
            count_pranzo = 0
            count_cena = 0
            for r in rows:
                turno = r["turno"] or _calcola_turno(r["ora_pasto"], soglia)
                if turno == "pranzo":
                    count_pranzo += 1
                    pax_pranzo += r["pax"] or 0
                else:
                    count_cena += 1
                    pax_cena += r["pax"] or 0

            giorni.append({
                "data": giorno_str,
                "giorno_settimana": giorno.weekday(),  # 0=lun
                "chiuso": giorno.weekday() == weekday_chiuso,
                "pranzo_count": count_pranzo,
                "pranzo_pax": pax_pranzo,
                "cena_count": count_cena,
                "cena_pax": pax_cena,
            })

        return {"lunedi": lunedi.isoformat(), "giorni": giorni}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: MINI-CALENDARIO
# ============================================================

@router.get("/calendario/{anno}/{mese}")
def get_calendario(
    anno: int,
    mese: int,
    user: dict = Depends(get_current_user),
):
    """Conteggi giornalieri per un mese intero (per mini-calendario)."""
    conn = get_clienti_conn()
    try:
        config = _get_config(conn)
        capienza_pranzo = int(config.get("capienza_pranzo", 35))
        capienza_cena = int(config.get("capienza_cena", 50))

        prefix = f"{anno:04d}-{mese:02d}"
        rows = conn.execute("""
            SELECT data_pasto, COUNT(*) as n, SUM(pax) as pax_tot
            FROM clienti_prenotazioni
            WHERE data_pasto LIKE ? || '%'
              AND stato NOT IN ('CANCELED', 'NO_SHOW', 'REFUSED')
            GROUP BY data_pasto
        """, (prefix,)).fetchall()

        giorni = {}
        for r in rows:
            pax = r["pax_tot"] or 0
            capienza = capienza_pranzo + capienza_cena
            saturazione = min(pax / capienza, 1.0) if capienza > 0 else 0
            giorni[r["data_pasto"]] = {
                "count": r["n"],
                "pax": pax,
                "saturazione": round(saturazione, 2),
            }

        return {"anno": anno, "mese": mese, "giorni": giorni}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: CREA PRENOTAZIONE
# ============================================================

@router.post("/")
def crea_prenotazione(
    req: PrenotazioneCreate,
    user: dict = Depends(get_current_user),
):
    """Inserisce una nuova prenotazione manuale."""
    conn = get_clienti_conn()
    try:
        config = _get_config(conn)
        soglia = config.get("soglia_pranzo_cena", "15:00")

        cliente_id = req.cliente_id

        # Se non c'e' cliente_id ma ci sono dati per nuovo cliente → crea
        if not cliente_id and req.nuovo_cognome:
            cur = conn.execute("""
                INSERT INTO clienti (nome, cognome, telefono, email, origine, protetto)
                VALUES (?, ?, ?, ?, 'diretto', 1)
            """, (
                req.nuovo_nome or "",
                req.nuovo_cognome,
                req.nuovo_telefono,
                req.nuovo_email,
            ))
            cliente_id = cur.lastrowid
            logger.info(f"Nuovo cliente creato da prenotazione: id={cliente_id}")

        turno = _calcola_turno(req.ora_pasto, soglia)
        token = secrets.token_urlsafe(16)

        cur = conn.execute("""
            INSERT INTO clienti_prenotazioni (
                cliente_id, data_pasto, ora_pasto, stato, pax, tavolo,
                canale, occasione, nota_ristorante, nota_cliente,
                allergie_segnalate, tavolo_esterno, seggioloni,
                data_prenotazione, prenotato_da, turno, fonte, creato_da,
                token_cancellazione
            ) VALUES (?, ?, ?, 'RECORDED', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?, 'manuale', ?, ?)
        """, (
            cliente_id,
            req.data_pasto,
            req.ora_pasto,
            req.pax,
            req.tavolo,
            req.canale,
            req.occasione,
            req.nota_ristorante,
            req.nota_cliente,
            req.allergie_segnalate,
            req.tavolo_esterno,
            req.seggioloni,
            user.get("username", "staff"),
            turno,
            user.get("username", "staff"),
            token,
        ))
        conn.commit()

        return {
            "id": cur.lastrowid,
            "cliente_id": cliente_id,
            "message": "Prenotazione creata",
        }
    except Exception as e:
        logger.exception("Errore creazione prenotazione")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: CONFIGURAZIONE
# (PRIMA delle route con {pren_id} per evitare conflitti!)
# ============================================================

@router.get("/config")
def get_config(user: dict = Depends(get_current_user)):
    """Legge tutta la configurazione prenotazioni."""
    conn = get_clienti_conn()
    try:
        rows = conn.execute(
            "SELECT chiave, valore, descrizione FROM prenotazioni_config ORDER BY chiave"
        ).fetchall()
        return {"config": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.put("/config")
async def update_config(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Aggiorna valori di configurazione. Legge il body raw per evitare problemi di validazione."""
    data = await request.json()
    conn = get_clienti_conn()
    try:
        for chiave, valore in data.items():
            conn.execute(
                "UPDATE prenotazioni_config SET valore = ? WHERE chiave = ?",
                (str(valore), chiave),
            )
        conn.commit()
        return {"message": f"{len(data)} configurazioni aggiornate"}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: AUTOCOMPLETE CLIENTI (per form prenotazione)
# ============================================================

@router.get("/clienti/search")
def search_clienti(
    q: str = Query(min_length=2),
    user: dict = Depends(get_current_user),
):
    """Cerca clienti per autocomplete (nome, cognome, telefono, email)."""
    conn = get_clienti_conn()
    try:
        like = f"%{q}%"
        rows = conn.execute("""
            SELECT
                c.id, c.nome, c.cognome, c.nome2, c.cognome2,
                c.telefono, c.email, c.vip, c.allergie,
                c.pref_cibo, c.restrizioni_dietetiche,
                (SELECT COUNT(*) FROM clienti_prenotazioni
                 WHERE cliente_id = c.id AND stato IN ('SEATED','LEFT','ARRIVED','BILL'))
                    as visite_totali
            FROM clienti c
            WHERE c.attivo = 1
              AND (
                c.nome LIKE ? OR c.cognome LIKE ?
                OR c.telefono LIKE ? OR c.email LIKE ?
                OR (c.cognome || ' ' || c.nome) LIKE ?
                OR (c.nome || ' ' || c.cognome) LIKE ?
              )
            ORDER BY visite_totali DESC, c.cognome, c.nome
            LIMIT 15
        """, (like, like, like, like, like, like)).fetchall()

        return {"clienti": [dict(r) for r in rows]}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: TAVOLI (lista per dropdown — Fase 1 base)
# ============================================================

@router.get("/tavoli")
def get_tavoli(user: dict = Depends(get_current_user)):
    """Lista tavoli attivi per dropdown assegnazione."""
    conn = get_clienti_conn()
    try:
        rows = conn.execute("""
            SELECT id, nome, zona, posti_min, posti_max, combinabile, attivo, note, ordine
            FROM tavoli
            WHERE attivo = 1
            ORDER BY ordine, zona, nome
        """).fetchall()

        combinazioni = conn.execute("""
            SELECT id, nome, tavoli_ids, posti, uso_frequente, note
            FROM tavoli_combinazioni
            ORDER BY uso_frequente DESC, nome
        """).fetchall()

        return {
            "tavoli": [dict(r) for r in rows],
            "combinazioni": [dict(r) for r in combinazioni],
        }
    finally:
        conn.close()


# ============================================================
# ENDPOINT: TAVOLI DISPONIBILI per data/turno
# ============================================================

@router.get("/tavoli/disponibili/{data}/{turno}")
def get_tavoli_disponibili(
    data: str,
    turno: str,
    user: dict = Depends(get_current_user),
):
    """
    Ritorna i tavoli con stato di occupazione per una data/turno.
    Utile per il dropdown tavoli nel form prenotazione.
    """
    conn = get_clienti_conn()
    try:
        # Tavoli attivi
        tavoli = conn.execute("""
            SELECT id, nome, zona, posti_min, posti_max
            FROM tavoli WHERE attivo = 1
            ORDER BY ordine, zona, nome
        """).fetchall()

        # Prenotazioni con tavolo assegnato per questa data/turno
        occupati = conn.execute("""
            SELECT tavolo FROM clienti_prenotazioni
            WHERE data_pasto = ? AND turno = ?
              AND stato NOT IN ('CANCELED', 'NO_SHOW', 'REFUSED')
              AND tavolo IS NOT NULL AND tavolo != ''
        """, (data, turno)).fetchall()

        tavoli_occupati = set()
        for r in occupati:
            # Gestisci combinazioni "4+5" o "4,5"
            for sep in ["+", ","]:
                if sep in r["tavolo"]:
                    for t in r["tavolo"].split(sep):
                        tavoli_occupati.add(t.strip())
                    break
            else:
                tavoli_occupati.add(r["tavolo"].strip())

        result = []
        for t in tavoli:
            result.append({
                **dict(t),
                "occupato": t["nome"] in tavoli_occupati,
            })

        return {"tavoli": result, "data": data, "turno": turno}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: CRUD TAVOLI (Fase 2)
# ============================================================

class TavoloCreate(BaseModel):
    nome: str
    zona: str = "sala"
    posti_min: int = 2
    posti_max: int = 4
    combinabile: int = 1
    posizione_x: float = 0
    posizione_y: float = 0
    larghezza: float = 60
    altezza: float = 60
    forma: str = "rect"
    note: Optional[str] = None
    ordine: int = 0


class TavoloUpdate(BaseModel):
    nome: Optional[str] = None
    zona: Optional[str] = None
    posti_min: Optional[int] = None
    posti_max: Optional[int] = None
    combinabile: Optional[int] = None
    posizione_x: Optional[float] = None
    posizione_y: Optional[float] = None
    larghezza: Optional[float] = None
    altezza: Optional[float] = None
    forma: Optional[str] = None
    attivo: Optional[int] = None
    note: Optional[str] = None
    ordine: Optional[int] = None


class CombinazioneCreate(BaseModel):
    nome: str
    tavoli_ids: str          # JSON array di id, es. "[4,5]"
    posti: int
    uso_frequente: int = 0
    note: Optional[str] = None


class LayoutSave(BaseModel):
    nome: str
    descrizione: Optional[str] = None
    tavoli_attivi: str       # JSON array di id tavoli attivi
    posizioni: Optional[str] = None  # JSON dict {id: {x,y,w,h}}


@router.post("/tavoli")
def crea_tavolo(
    req: TavoloCreate,
    user: dict = Depends(get_current_user),
):
    """Crea un nuovo tavolo."""
    conn = get_clienti_conn()
    try:
        cur = conn.execute("""
            INSERT INTO tavoli (nome, zona, posti_min, posti_max, combinabile,
                                posizione_x, posizione_y, larghezza, altezza,
                                forma, note, ordine)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.nome, req.zona, req.posti_min, req.posti_max, req.combinabile,
            req.posizione_x, req.posizione_y, req.larghezza, req.altezza,
            req.forma, req.note, req.ordine,
        ))
        conn.commit()
        return {"id": cur.lastrowid, "message": f"Tavolo '{req.nome}' creato"}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=400, detail=f"Tavolo '{req.nome}' esiste gia'")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/tavoli/{tavolo_id}")
def modifica_tavolo(
    tavolo_id: int,
    req: TavoloUpdate,
    user: dict = Depends(get_current_user),
):
    """Modifica un tavolo esistente."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM tavoli WHERE id = ?", (tavolo_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Tavolo non trovato")

        updates = []
        values = []
        for field, value in req.dict(exclude_none=True).items():
            updates.append(f"{field} = ?")
            values.append(value)

        if not updates:
            return {"message": "Nessuna modifica"}

        values.append(tavolo_id)
        conn.execute(f"UPDATE tavoli SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()
        return {"message": "Tavolo aggiornato", "id": tavolo_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/tavoli/batch/posizioni")
async def aggiorna_posizioni_batch(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Aggiorna posizioni di piu' tavoli in un colpo (drag & drop editor)."""
    data = await request.json()
    # data = { "tavoli": [ {"id": 1, "posizione_x": 100, "posizione_y": 200, ...}, ... ] }
    conn = get_clienti_conn()
    try:
        count = 0
        for t in data.get("tavoli", []):
            tid = t.get("id")
            if not tid:
                continue
            conn.execute("""
                UPDATE tavoli SET posizione_x = ?, posizione_y = ?,
                    larghezza = ?, altezza = ?
                WHERE id = ?
            """, (
                t.get("posizione_x", 0), t.get("posizione_y", 0),
                t.get("larghezza", 60), t.get("altezza", 60),
                tid,
            ))
            count += 1
        conn.commit()
        return {"message": f"{count} tavoli aggiornati"}
    finally:
        conn.close()


@router.delete("/tavoli/{tavolo_id}")
def disattiva_tavolo(
    tavolo_id: int,
    user: dict = Depends(get_current_user),
):
    """Disattiva un tavolo (non lo cancella, lo rende inattivo)."""
    conn = get_clienti_conn()
    try:
        conn.execute("UPDATE tavoli SET attivo = 0 WHERE id = ?", (tavolo_id,))
        conn.commit()
        return {"message": "Tavolo disattivato", "id": tavolo_id}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: LAYOUT TAVOLI (Fase 2)
# ============================================================

@router.get("/tavoli/layout")
def get_layouts(user: dict = Depends(get_current_user)):
    """Lista layout salvati."""
    conn = get_clienti_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM tavoli_layout ORDER BY attivo DESC, nome"
        ).fetchall()
        return {"layout": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/tavoli/layout")
def crea_layout(
    req: LayoutSave,
    user: dict = Depends(get_current_user),
):
    """Salva un nuovo layout."""
    conn = get_clienti_conn()
    try:
        cur = conn.execute("""
            INSERT INTO tavoli_layout (nome, descrizione, tavoli_attivi, posizioni)
            VALUES (?, ?, ?, ?)
        """, (req.nome, req.descrizione, req.tavoli_attivi, req.posizioni))
        conn.commit()
        return {"id": cur.lastrowid, "message": f"Layout '{req.nome}' salvato"}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=400, detail=f"Layout '{req.nome}' esiste gia'")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/tavoli/layout/{layout_id}")
def aggiorna_layout(
    layout_id: int,
    req: LayoutSave,
    user: dict = Depends(get_current_user),
):
    """Aggiorna un layout esistente."""
    conn = get_clienti_conn()
    try:
        conn.execute("""
            UPDATE tavoli_layout SET nome = ?, descrizione = ?,
                tavoli_attivi = ?, posizioni = ?
            WHERE id = ?
        """, (req.nome, req.descrizione, req.tavoli_attivi, req.posizioni, layout_id))
        conn.commit()
        return {"message": f"Layout '{req.nome}' aggiornato"}
    finally:
        conn.close()


@router.put("/tavoli/layout/{layout_id}/attiva")
def attiva_layout(
    layout_id: int,
    user: dict = Depends(get_current_user),
):
    """Attiva un layout (disattiva tutti gli altri)."""
    conn = get_clienti_conn()
    try:
        conn.execute("UPDATE tavoli_layout SET attivo = 0")
        conn.execute("UPDATE tavoli_layout SET attivo = 1 WHERE id = ?", (layout_id,))

        # Carica le posizioni del layout e applicale ai tavoli
        layout = conn.execute(
            "SELECT tavoli_attivi, posizioni FROM tavoli_layout WHERE id = ?", (layout_id,)
        ).fetchone()
        if layout:
            tavoli_attivi = json.loads(layout["tavoli_attivi"] or "[]")
            # Disattiva tutti, riattiva solo quelli nel layout
            conn.execute("UPDATE tavoli SET attivo = 0")
            if tavoli_attivi:
                placeholders = ",".join("?" * len(tavoli_attivi))
                conn.execute(f"UPDATE tavoli SET attivo = 1 WHERE id IN ({placeholders})", tavoli_attivi)

            # Applica posizioni se salvate
            posizioni = json.loads(layout["posizioni"] or "{}")
            for tid_str, pos in posizioni.items():
                conn.execute("""
                    UPDATE tavoli SET posizione_x = ?, posizione_y = ?,
                        larghezza = ?, altezza = ?
                    WHERE id = ?
                """, (
                    pos.get("x", 0), pos.get("y", 0),
                    pos.get("w", 60), pos.get("h", 60),
                    int(tid_str),
                ))

        conn.commit()
        return {"message": "Layout attivato", "id": layout_id}
    except Exception as e:
        logger.exception("Errore attivazione layout")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/tavoli/layout/{layout_id}")
def elimina_layout(
    layout_id: int,
    user: dict = Depends(get_current_user),
):
    """Elimina un layout."""
    conn = get_clienti_conn()
    try:
        conn.execute("DELETE FROM tavoli_layout WHERE id = ?", (layout_id,))
        conn.commit()
        return {"message": "Layout eliminato"}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: COMBINAZIONI TAVOLI (Fase 2)
# ============================================================

@router.get("/tavoli/combinazioni")
def get_combinazioni(user: dict = Depends(get_current_user)):
    """Lista combinazioni tavoli."""
    conn = get_clienti_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM tavoli_combinazioni ORDER BY uso_frequente DESC, nome"
        ).fetchall()
        return {"combinazioni": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/tavoli/combinazioni")
def crea_combinazione(
    req: CombinazioneCreate,
    user: dict = Depends(get_current_user),
):
    """Crea una nuova combinazione di tavoli."""
    conn = get_clienti_conn()
    try:
        cur = conn.execute("""
            INSERT INTO tavoli_combinazioni (nome, tavoli_ids, posti, uso_frequente, note)
            VALUES (?, ?, ?, ?, ?)
        """, (req.nome, req.tavoli_ids, req.posti, req.uso_frequente, req.note))
        conn.commit()
        return {"id": cur.lastrowid, "message": f"Combinazione '{req.nome}' creata"}
    finally:
        conn.close()


@router.delete("/tavoli/combinazioni/{combo_id}")
def elimina_combinazione(
    combo_id: int,
    user: dict = Depends(get_current_user),
):
    """Elimina una combinazione."""
    conn = get_clienti_conn()
    try:
        conn.execute("DELETE FROM tavoli_combinazioni WHERE id = ?", (combo_id,))
        conn.commit()
        return {"message": "Combinazione eliminata"}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: MAPPA TAVOLI per data/turno (Fase 2)
# ============================================================

@router.get("/tavoli/mappa/{data}/{turno}")
def get_mappa_tavoli(
    data: str,
    turno: str,
    user: dict = Depends(get_current_user),
):
    """
    Stato completo dei tavoli per la mappa serale.
    Ritorna tavoli con prenotazione assegnata e lista prenotazioni senza tavolo.
    """
    conn = get_clienti_conn()
    try:
        # Tutti i tavoli attivi con posizioni
        tavoli = conn.execute("""
            SELECT id, nome, zona, posti_min, posti_max, combinabile,
                   posizione_x, posizione_y, larghezza, altezza, forma, ordine
            FROM tavoli WHERE attivo = 1
            ORDER BY ordine, zona, nome
        """).fetchall()

        # Prenotazioni del turno (non cancellate)
        # COALESCE: preferisci nome CRM, fallback a snapshot TheFork (migraz. 068)
        prenotazioni = conn.execute("""
            SELECT
                p.id, p.cliente_id, p.ora_pasto, p.stato, p.pax,
                p.tavolo, p.nota_ristorante, p.allergie_segnalate,
                p.turno, p.occasione, p.seggioloni,
                COALESCE(c.nome, p.nome_ospite) AS nome,
                COALESCE(c.cognome, p.cognome_ospite) AS cognome,
                c.telefono, c.vip, c.allergie
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.data_pasto = ? AND p.turno = ?
              AND p.stato NOT IN ('CANCELED', 'NO_SHOW', 'REFUSED')
            ORDER BY p.ora_pasto
        """, (data, turno)).fetchall()

        # Mappa tavolo_nome → prenotazione
        tavolo_pren = {}
        senza_tavolo = []
        for p in prenotazioni:
            pdict = dict(p)
            if pdict.get("tavolo"):
                # Gestisci combinazioni "4+5" o "4,5"
                nomi_tavoli = []
                for sep in ["+", ","]:
                    if sep in pdict["tavolo"]:
                        nomi_tavoli = [t.strip() for t in pdict["tavolo"].split(sep)]
                        break
                if not nomi_tavoli:
                    nomi_tavoli = [pdict["tavolo"].strip()]

                for nome_t in nomi_tavoli:
                    tavolo_pren[nome_t] = pdict
            else:
                senza_tavolo.append(pdict)

        # Arricchisci tavoli con info prenotazione
        tavoli_result = []
        for t in tavoli:
            td = dict(t)
            pren = tavolo_pren.get(td["nome"])
            td["prenotazione"] = pren
            td["occupato"] = pren is not None
            td["stato_tavolo"] = pren["stato"] if pren else "LIBERO"
            tavoli_result.append(td)

        # Combinazioni attive
        combinazioni = conn.execute(
            "SELECT * FROM tavoli_combinazioni ORDER BY uso_frequente DESC, nome"
        ).fetchall()

        # Layout attivo
        layout_attivo = conn.execute(
            "SELECT id, nome FROM tavoli_layout WHERE attivo = 1"
        ).fetchone()

        return {
            "data": data,
            "turno": turno,
            "tavoli": tavoli_result,
            "senza_tavolo": senza_tavolo,
            "combinazioni": [dict(c) for c in combinazioni],
            "layout_attivo": dict(layout_attivo) if layout_attivo else None,
        }
    finally:
        conn.close()


@router.put("/tavoli/assegna/{pren_id}")
async def assegna_tavolo(
    pren_id: int,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Assegna (o rimuovi) un tavolo a una prenotazione."""
    data = await request.json()
    tavolo = data.get("tavolo", "")
    conn = get_clienti_conn()
    try:
        conn.execute(
            "UPDATE clienti_prenotazioni SET tavolo = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            (tavolo, pren_id),
        )
        conn.commit()
        return {"message": f"Tavolo assegnato: '{tavolo}'" if tavolo else "Tavolo rimosso", "id": pren_id}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: MODIFICA PRENOTAZIONE
# (Route con {pren_id} DOPO quelle con path fissi!)
# ============================================================

@router.put("/{pren_id}")
def modifica_prenotazione(
    pren_id: int,
    req: PrenotazioneUpdate,
    user: dict = Depends(get_current_user),
):
    """Modifica una prenotazione esistente."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute(
            "SELECT * FROM clienti_prenotazioni WHERE id = ?", (pren_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Prenotazione non trovata")

        config = _get_config(conn)
        soglia = config.get("soglia_pranzo_cena", "15:00")

        updates = []
        values = []

        fields = {
            "data_pasto": req.data_pasto,
            "ora_pasto": req.ora_pasto,
            "pax": req.pax,
            "tavolo": req.tavolo,
            "canale": req.canale,
            "nota_ristorante": req.nota_ristorante,
            "nota_cliente": req.nota_cliente,
            "occasione": req.occasione,
            "allergie_segnalate": req.allergie_segnalate,
            "tavolo_esterno": req.tavolo_esterno,
            "seggioloni": req.seggioloni,
            "stato": req.stato,
        }

        for field, value in fields.items():
            if value is not None:
                updates.append(f"{field} = ?")
                values.append(value)

        # Ricalcola turno se cambia l'ora
        if req.ora_pasto is not None:
            updates.append("turno = ?")
            values.append(_calcola_turno(req.ora_pasto, soglia))

        updates.append("updated_at = datetime('now','localtime')")
        values.append(pren_id)

        conn.execute(
            f"UPDATE clienti_prenotazioni SET {', '.join(updates)} WHERE id = ?",
            values,
        )
        conn.commit()

        return {"message": "Prenotazione aggiornata", "id": pren_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Errore modifica prenotazione")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: CAMBIO STATO RAPIDO
# ============================================================

@router.patch("/{pren_id}/stato")
def cambio_stato(
    pren_id: int,
    req: StatoUpdate,
    user: dict = Depends(get_current_user),
):
    """Cambio stato rapido con validazione transizioni."""
    if req.stato not in STATI_VALIDI:
        raise HTTPException(status_code=400, detail=f"Stato non valido: {req.stato}")

    conn = get_clienti_conn()
    try:
        existing = conn.execute(
            "SELECT stato FROM clienti_prenotazioni WHERE id = ?", (pren_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Prenotazione non trovata")

        stato_attuale = existing["stato"]
        transizioni_ok = TRANSIZIONI.get(stato_attuale, [])
        if req.stato not in transizioni_ok:
            raise HTTPException(
                status_code=400,
                detail=f"Transizione non permessa: {stato_attuale} → {req.stato}. "
                       f"Transizioni possibili: {transizioni_ok}",
            )

        conn.execute(
            "UPDATE clienti_prenotazioni SET stato = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            (req.stato, pren_id),
        )
        conn.commit()

        return {"message": f"Stato aggiornato: {stato_attuale} → {req.stato}", "id": pren_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Errore cambio stato")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: CANCELLA PRENOTAZIONE (soft delete → CANCELED)
# ============================================================

@router.delete("/{pren_id}")
def cancella_prenotazione(
    pren_id: int,
    user: dict = Depends(get_current_user),
):
    """Cancella una prenotazione (soft: stato → CANCELED)."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute(
            "SELECT stato FROM clienti_prenotazioni WHERE id = ?", (pren_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Prenotazione non trovata")

        conn.execute(
            "UPDATE clienti_prenotazioni SET stato = 'CANCELED', updated_at = datetime('now','localtime') WHERE id = ?",
            (pren_id,),
        )
        conn.commit()

        return {"message": "Prenotazione cancellata", "id": pren_id}
    finally:
        conn.close()


# ============================================================
# ENDPOINT: LINK WHATSAPP
# ============================================================

@router.get("/{pren_id}/wa-link")
def get_wa_link(
    pren_id: int,
    tipo: str = Query(default="conferma"),
    user: dict = Depends(get_current_user),
):
    """Genera link WhatsApp precompilato per conferma o reminder."""
    conn = get_clienti_conn()
    try:
        row = conn.execute("""
            SELECT p.*, c.nome, c.cognome, c.telefono
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.id = ?
        """, (pren_id,)).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Prenotazione non trovata")

        telefono = row["telefono"]
        if not telefono:
            raise HTTPException(status_code=400, detail="Cliente senza telefono")

        config = _get_config(conn)
        template_key = f"template_wa_{tipo}"
        template = config.get(template_key, "Ciao {nome}, confermiamo la prenotazione per {pax} persone il {data} alle {ora}.")

        messaggio = fill_template(template,
            nome=row["nome"] or "",
            cognome=row["cognome"] or "",
            pax=row["pax"],
            data=row["data_pasto"],
            ora=(row["ora_pasto"] or "")[:5],
        )

        link = build_wa_link(telefono, messaggio)
        if not link:
            raise HTTPException(status_code=400, detail="Numero di telefono non valido")

        return {"link": link, "messaggio": messaggio, "telefono": telefono}
    finally:
        conn.close()
