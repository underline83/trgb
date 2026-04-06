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

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.clienti_db import get_clienti_conn, init_clienti_db
from app.services.auth_service import get_current_user

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

        rows = conn.execute("""
            SELECT
                p.id, p.cliente_id, p.data_pasto, p.ora_pasto, p.stato, p.pax,
                p.tavolo, p.canale, p.occasione, p.nota_ristorante, p.nota_cliente,
                p.data_prenotazione, p.prenotato_da, p.turno, p.fonte,
                p.allergie_segnalate, p.tavolo_esterno, p.seggioloni,
                p.menu_preset, p.degustazione, p.offerta_speciale, p.yums,
                p.thefork_booking_id, p.creato_da,
                c.nome, c.cognome, c.nome2, c.cognome2,
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
# ENDPOINT: MODIFICA PRENOTAZIONE
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
# ENDPOINT: CONFIGURAZIONE
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
def update_config(
    data: Dict[str, str],
    user: dict = Depends(get_current_user),
):
    """Aggiorna valori di configurazione."""
    conn = get_clienti_conn()
    try:
        for chiave, valore in data.items():
            conn.execute(
                "UPDATE prenotazioni_config SET valore = ? WHERE chiave = ?",
                (valore, chiave),
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

        # Pulisci telefono per wa.me
        tel_clean = telefono.replace(" ", "").replace("-", "").replace("+", "")
        if tel_clean.startswith("39"):
            tel_clean = tel_clean
        elif tel_clean.startswith("3") and len(tel_clean) == 10:
            tel_clean = "39" + tel_clean

        config = _get_config(conn)
        template_key = f"template_wa_{tipo}"
        template = config.get(template_key, "Ciao {nome}, confermiamo la prenotazione per {pax} persone il {data} alle {ora}.")

        messaggio = template.format(
            nome=row["nome"] or "",
            cognome=row["cognome"] or "",
            pax=row["pax"],
            data=row["data_pasto"],
            ora=(row["ora_pasto"] or "")[:5],
        )

        import urllib.parse
        link = f"https://wa.me/{tel_clean}?text={urllib.parse.quote(messaggio)}"

        return {"link": link, "messaggio": messaggio, "telefono": telefono}
    finally:
        conn.close()
