# ============================================================
# FILE: app/routers/dashboard_router.py
# Dashboard Home — endpoint aggregatore per widget Home v3
# ============================================================

# @version: v1.0-dashboard-home
# -*- coding: utf-8 -*-
"""
Endpoint GET /dashboard/home

Restituisce dati aggregati per i widget della Home v3:
- Prenotazioni oggi (count + pax per turno, lista)
- Incasso ieri (totale + coperti + delta % vs media)
- Fatture pending (count + importo)
- Alert (scadenze dipendenti, vini sotto scorta, fatture)

Queries su 3 DB separati: clienti.sqlite3, foodcost.db, dipendenti.sqlite3
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.models.clienti_db import get_clienti_conn
from app.models.foodcost_db import get_foodcost_connection
from app.models.dipendenti_db import get_dipendenti_conn
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.dashboard")

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)


# ─────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────

class PrenotazioneWidget(BaseModel):
    ora: str
    nome: str
    pax: int
    nota: str = ""
    stato: str = "RECORDED"
    turno: str = "pranzo"

class PrenotazioniOggi(BaseModel):
    pranzo_count: int = 0
    pranzo_pax: int = 0
    cena_count: int = 0
    cena_pax: int = 0
    totale_pax: int = 0
    lista: List[PrenotazioneWidget] = []

class IncassoIeri(BaseModel):
    totale: float = 0.0
    coperti: int = 0
    delta_pct: Optional[float] = None  # % vs media ultimi 30gg stesso giorno settimana

class CopertiMese(BaseModel):
    totale: int = 0
    anno_precedente: int = 0

class FatturePending(BaseModel):
    count: int = 0
    importo: float = 0.0

class AlertItem(BaseModel):
    tipo: str         # "fatture" | "scadenze" | "vini"
    modulo: str       # key modulo per icona SVG frontend
    testo: str
    accent: str = ""  # colore accent opzionale

class DashboardHome(BaseModel):
    prenotazioni: PrenotazioniOggi
    incasso_ieri: IncassoIeri
    coperti_mese: CopertiMese
    fatture_pending: FatturePending
    alerts: List[AlertItem] = []


# ─────────────────────────────────────────────────────────
# Helper queries
# ─────────────────────────────────────────────────────────

STATI_ATTIVI = ("RECORDED", "SEATED", "LEFT", "ARRIVED", "BILL")

def _prenotazioni_oggi(oggi: str) -> PrenotazioniOggi:
    """Prenotazioni attive per oggi da clienti.sqlite3"""
    try:
        conn = get_clienti_conn()
        rows = conn.execute("""
            SELECT p.ora_pasto, p.pax, p.stato, p.nota_ristorante, p.allergie_segnalate,
                   COALESCE(c.nome, '') as nome, COALESCE(c.cognome, '') as cognome
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.data_pasto = ?
              AND p.stato IN (?, ?, ?, ?, ?)
            ORDER BY p.ora_pasto, p.id
        """, (oggi, *STATI_ATTIVI)).fetchall()
        conn.close()

        # Leggo soglia pranzo/cena dalla config (default 15:00)
        soglia = "15:00"

        pranzo_c, pranzo_p, cena_c, cena_p = 0, 0, 0, 0
        lista = []
        for r in rows:
            ora = r["ora_pasto"] or "12:00"
            pax = r["pax"] or 0
            turno = "pranzo" if ora < soglia else "cena"
            if turno == "pranzo":
                pranzo_c += 1; pranzo_p += pax
            else:
                cena_c += 1; cena_p += pax

            # Componi nome
            nome = f'{r["nome"]} {r["cognome"]}'.strip() or "Anonimo"
            # Nota: preferisci allergie se presenti
            nota = r["allergie_segnalate"] or r["nota_ristorante"] or ""

            lista.append(PrenotazioneWidget(
                ora=ora[:5],  # HH:MM
                nome=nome,
                pax=pax,
                nota=nota,
                stato=r["stato"],
                turno=turno,
            ))

        return PrenotazioniOggi(
            pranzo_count=pranzo_c, pranzo_pax=pranzo_p,
            cena_count=cena_c, cena_pax=cena_p,
            totale_pax=pranzo_p + cena_p,
            lista=lista,
        )
    except Exception as e:
        logger.warning(f"Dashboard: errore prenotazioni: {e}")
        return PrenotazioniOggi()


def _incasso_ieri(ieri: str, giorno_settimana: int) -> IncassoIeri:
    """Incasso totale di ieri + delta % vs media stesso giorno settimana ultimi 30gg"""
    try:
        conn = get_foodcost_connection()

        # Incasso ieri
        row = conn.execute("""
            SELECT COALESCE(SUM(totale_incassi), 0) as totale,
                   COALESCE(SUM(coperti), 0) as coperti
            FROM shift_closures
            WHERE date = ?
        """, (ieri,)).fetchone()
        totale = row["totale"] if row else 0
        coperti = row["coperti"] if row else 0

        # Media stesso giorno settimana ultimi ~8 settimane (escluso ieri)
        delta_pct = None
        try:
            media_row = conn.execute("""
                SELECT AVG(day_total) as media FROM (
                    SELECT date, SUM(totale_incassi) as day_total
                    FROM shift_closures
                    WHERE date < ?
                      AND date >= date(?, '-60 days')
                      AND CAST(strftime('%w', date) AS INTEGER) = ?
                    GROUP BY date
                )
            """, (ieri, ieri, giorno_settimana)).fetchone()
            if media_row and media_row["media"] and media_row["media"] > 0:
                delta_pct = round((totale - media_row["media"]) / media_row["media"] * 100, 1)
        except Exception:
            pass

        conn.close()
        return IncassoIeri(totale=round(totale, 2), coperti=coperti, delta_pct=delta_pct)
    except Exception as e:
        logger.warning(f"Dashboard: errore incasso ieri: {e}")
        return IncassoIeri()


def _coperti_mese(oggi: date) -> CopertiMese:
    """Coperti mese corrente + stesso mese anno precedente"""
    try:
        conn = get_foodcost_connection()
        anno = oggi.year
        mese = oggi.month
        prefix = f"{anno}-{mese:02d}"
        prefix_prev = f"{anno - 1}-{mese:02d}"

        row = conn.execute("""
            SELECT COALESCE(SUM(coperti), 0) as tot
            FROM shift_closures WHERE date LIKE ?
        """, (prefix + "%",)).fetchone()
        tot = row["tot"] if row else 0

        row_prev = conn.execute("""
            SELECT COALESCE(SUM(coperti), 0) as tot
            FROM shift_closures WHERE date LIKE ?
        """, (prefix_prev + "%",)).fetchone()
        tot_prev = row_prev["tot"] if row_prev else 0

        conn.close()
        return CopertiMese(totale=tot, anno_precedente=tot_prev)
    except Exception as e:
        logger.warning(f"Dashboard: errore coperti mese: {e}")
        return CopertiMese()


def _fatture_pending() -> FatturePending:
    """Fatture non pagate (escluse autofatture)"""
    try:
        conn = get_foodcost_connection()
        row = conn.execute("""
            SELECT COUNT(*) as cnt,
                   COALESCE(SUM(totale_fattura), 0) as importo
            FROM fe_fatture
            WHERE COALESCE(pagato, 0) = 0
              AND COALESCE(is_autofattura, 0) = 0
        """).fetchone()
        conn.close()
        return FatturePending(
            count=row["cnt"] if row else 0,
            importo=round(row["importo"], 2) if row else 0,
        )
    except Exception as e:
        logger.warning(f"Dashboard: errore fatture pending: {e}")
        return FatturePending()


def _alerts(oggi: str) -> List[AlertItem]:
    """Raccogli alert da varie fonti"""
    alerts: List[AlertItem] = []

    # 1. Fatture pending
    fp = _fatture_pending()
    if fp.count > 0:
        alerts.append(AlertItem(
            tipo="fatture",
            modulo="acquisti",
            testo=f"{fp.count} fattur{'a' if fp.count == 1 else 'e'} da registrare",
            accent="#E8402B",
        ))

    # 2. Scadenze dipendenti prossime 14 giorni
    try:
        conn = get_dipendenti_conn()
        rows = conn.execute("""
            SELECT COUNT(*) as cnt
            FROM dipendenti_scadenze ds
            JOIN dipendenti d ON ds.dipendente_id = d.id
            WHERE ds.data_scadenza IS NOT NULL
              AND ds.data_scadenza != ''
              AND ds.data_scadenza <= date(?, '+14 days')
              AND ds.data_scadenza >= ?
              AND COALESCE(ds.stato, 'VALIDO') != 'SCADUTO'
        """, (oggi, oggi)).fetchone()
        conn.close()
        cnt = rows["cnt"] if rows else 0
        if cnt > 0:
            alerts.append(AlertItem(
                tipo="scadenze",
                modulo="dipendenti",
                testo=f"{cnt} scadenz{'a' if cnt == 1 else 'e'} dipendenti entro 14gg",
                accent="#B8860B",
            ))
    except Exception as e:
        logger.warning(f"Dashboard: errore scadenze dipendenti: {e}")

    # 3. Vini sotto scorta (se c'è il campo scorta_minima)
    try:
        from app.models import vini_db
        if hasattr(vini_db, 'get_vini_conn'):
            conn = vini_db.get_vini_conn()
        else:
            import sqlite3
            from pathlib import Path
            vini_path = Path(__file__).resolve().parents[1] / "data" / "vini.sqlite3"
            conn = sqlite3.connect(vini_path)
            conn.row_factory = sqlite3.Row

        # Prova: non tutti i setup hanno scorta_minima
        try:
            rows = conn.execute("""
                SELECT COUNT(*) as cnt
                FROM vini
                WHERE COALESCE(scorta_minima, 0) > 0
                  AND COALESCE(qta, 0) < scorta_minima
                  AND COALESCE(attivo, 1) = 1
            """).fetchone()
            cnt = rows["cnt"] if rows else 0
            if cnt > 0:
                alerts.append(AlertItem(
                    tipo="vini",
                    modulo="vini",
                    testo=f"{cnt} vin{'o' if cnt == 1 else 'i'} sotto scorta minima",
                    accent="#2E7BE8",
                ))
        except Exception:
            pass  # colonna scorta_minima potrebbe non esistere
        conn.close()
    except Exception as e:
        logger.warning(f"Dashboard: errore alert vini: {e}")

    return alerts


# ─────────────────────────────────────────────────────────
# ENDPOINT
# ─────────────────────────────────────────────────────────

@router.get("/home", response_model=DashboardHome)
def get_dashboard_home():
    """
    Endpoint aggregatore per la Home v3.
    Restituisce tutti i dati necessari ai widget in un'unica chiamata.
    """
    oggi = date.today()
    ieri = oggi - timedelta(days=1)
    oggi_str = oggi.isoformat()
    ieri_str = ieri.isoformat()
    # strftime('%w') in SQLite: 0=Sunday, 1=Monday, ..., 6=Saturday
    giorno_settimana = ieri.isoweekday() % 7  # Python isoweekday: 1=Mon..7=Sun → SQLite %w

    return DashboardHome(
        prenotazioni=_prenotazioni_oggi(oggi_str),
        incasso_ieri=_incasso_ieri(ieri_str, giorno_settimana),
        coperti_mese=_coperti_mese(oggi),
        fatture_pending=_fatture_pending(),
        alerts=_alerts(oggi_str),
    )
