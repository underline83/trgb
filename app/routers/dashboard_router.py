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

class ModuloSummary(BaseModel):
    key: str
    line1: str = ""
    line2: str = ""
    badge: int = 0    # 0 = nessun badge, >0 = notifica

class TaglioBreve(BaseModel):
    nome: str
    categoria: Optional[str] = None
    grammatura_g: Optional[int] = None
    prezzo_euro: Optional[float] = None

class CategoriaGruppo(BaseModel):
    nome: str
    emoji: Optional[str] = None
    disponibili: int = 0
    tagli: List[TaglioBreve] = []  # preview primi N tagli disponibili in questa categoria

class MacellaioWidget(BaseModel):
    disponibili: int = 0
    venduti_oggi: int = 0
    categorie: List[CategoriaGruppo] = []  # raggruppamento per categoria, limitato da config
    altre: int = 0  # count categorie extra non mostrate

class DashboardHome(BaseModel):
    prenotazioni: PrenotazioniOggi
    incasso_ieri: IncassoIeri
    coperti_mese: CopertiMese
    fatture_pending: FatturePending
    macellaio: MacellaioWidget = MacellaioWidget()
    alerts: List[AlertItem] = []
    moduli: List[ModuloSummary] = []


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


def _macellaio_widget(oggi: str, tagli_per_cat: int = 2) -> MacellaioWidget:
    """
    Widget macellaio raggruppato per categoria.
    Rispetta la config `widget_max_categorie` da macellaio_config (default 4).
    Per ogni categoria mostra fino a `tagli_per_cat` tagli come preview.
    """
    try:
        conn = get_foodcost_connection()

        # ── Config max categorie da mostrare ──
        try:
            r_cfg = conn.execute(
                "SELECT valore FROM macellaio_config WHERE chiave = 'widget_max_categorie'"
            ).fetchone()
            max_cat = int(r_cfg["valore"]) if r_cfg and r_cfg["valore"] else 4
        except Exception:
            max_cat = 4
        if max_cat < 1:
            max_cat = 1

        # ── Count totali ──
        r1 = conn.execute("""
            SELECT COUNT(*) as cnt FROM macellaio_tagli
            WHERE COALESCE(venduto, 0) = 0
        """).fetchone()
        disponibili = r1["cnt"] if r1 else 0

        r2 = conn.execute("""
            SELECT COUNT(*) as cnt FROM macellaio_tagli
            WHERE COALESCE(venduto, 0) = 1
              AND venduto_at LIKE ?
        """, (oggi + "%",)).fetchone()
        venduti_oggi = r2["cnt"] if r2 else 0

        # ── Mappa categoria → (emoji, ordine). Categorie attive ordinate. ──
        cat_rows = conn.execute("""
            SELECT nome, emoji, ordine FROM macellaio_categorie
            WHERE attivo = 1
            ORDER BY ordine ASC, nome ASC
        """).fetchall()
        cat_meta = {
            r["nome"]: {"emoji": r["emoji"], "ordine": r["ordine"]}
            for r in cat_rows
        }
        ordine_categorie = [r["nome"] for r in cat_rows]

        # ── Aggrega tagli disponibili per categoria (NULL → "Senza categoria") ──
        tagli_rows = conn.execute("""
            SELECT nome, categoria, grammatura_g, prezzo_euro, id
            FROM macellaio_tagli
            WHERE COALESCE(venduto, 0) = 0
            ORDER BY id DESC
        """).fetchall()

        gruppi: dict[str, list] = {}
        for r in tagli_rows:
            cat_nome = r["categoria"] or "Senza categoria"
            gruppi.setdefault(cat_nome, []).append(r)

        # ── Ordinamento: prima categorie ufficiali in ordine, poi ad-hoc alfabetiche ──
        ordered_keys: List[str] = []
        for nome in ordine_categorie:
            if nome in gruppi:
                ordered_keys.append(nome)
        extra = sorted(k for k in gruppi.keys() if k not in ordered_keys)
        ordered_keys.extend(extra)

        totale_gruppi = len(ordered_keys)
        visibili = ordered_keys[:max_cat]
        altre = max(0, totale_gruppi - len(visibili))

        categorie_out: List[CategoriaGruppo] = []
        for nome in visibili:
            rows_cat = gruppi[nome]
            meta = cat_meta.get(nome, {})
            preview = [
                TaglioBreve(
                    nome=rr["nome"] or "",
                    categoria=rr["categoria"],
                    grammatura_g=rr["grammatura_g"],
                    prezzo_euro=rr["prezzo_euro"],
                )
                for rr in rows_cat[:tagli_per_cat]
            ]
            categorie_out.append(CategoriaGruppo(
                nome=nome,
                emoji=meta.get("emoji"),
                disponibili=len(rows_cat),
                tagli=preview,
            ))

        conn.close()
        return MacellaioWidget(
            disponibili=disponibili,
            venduti_oggi=venduti_oggi,
            categorie=categorie_out,
            altre=altre,
        )
    except Exception as e:
        logger.warning(f"Dashboard: errore macellaio widget: {e}")
        return MacellaioWidget()


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


def _moduli_summary(oggi: str, prenotazioni: PrenotazioniOggi,
                     incasso: IncassoIeri, fatture: FatturePending,
                     coperti: CopertiMese) -> List[ModuloSummary]:
    """Genera 2 righe dinamiche + badge per ogni modulo."""
    summaries: List[ModuloSummary] = []

    # ── Prenotazioni ──
    line1 = f"{prenotazioni.totale_pax} pax oggi"
    parts = []
    if prenotazioni.pranzo_pax > 0:
        parts.append(f"pranzo {prenotazioni.pranzo_pax}")
    if prenotazioni.cena_pax > 0:
        parts.append(f"cena {prenotazioni.cena_pax}")
    line2 = " · ".join(parts) if parts else "Nessuna prenotazione"
    summaries.append(ModuloSummary(
        key="prenotazioni", line1=line1, line2=line2,
        badge=len(prenotazioni.lista),
    ))

    # ── Vendite ──
    tot_str = f"€ {incasso.totale:,.0f}".replace(",", ".")
    line1 = f"Incasso ieri: {tot_str}"
    if incasso.delta_pct is not None:
        segno = "+" if incasso.delta_pct >= 0 else ""
        line2 = f"{segno}{incasso.delta_pct}% vs media · {incasso.coperti} coperti"
    else:
        line2 = f"{incasso.coperti} coperti ieri"
    summaries.append(ModuloSummary(key="vendite", line1=line1, line2=line2))

    # ── Vini ──
    try:
        from app.models import vini_db
        if hasattr(vini_db, "get_vini_conn"):
            conn = vini_db.get_vini_conn()
        else:
            import sqlite3 as _sq
            from pathlib import Path
            conn = _sq.connect(Path(__file__).resolve().parents[1] / "data" / "vini.sqlite3")
            conn.row_factory = _sq.Row
        row = conn.execute("SELECT COUNT(*) as cnt FROM vini WHERE COALESCE(attivo,1)=1").fetchone()
        n_vini = row["cnt"] if row else 0
        sotto = 0
        try:
            r2 = conn.execute("""
                SELECT COUNT(*) as cnt FROM vini
                WHERE COALESCE(scorta_minima,0)>0
                  AND COALESCE(qta,0)<scorta_minima
                  AND COALESCE(attivo,1)=1
            """).fetchone()
            sotto = r2["cnt"] if r2 else 0
        except Exception:
            pass
        conn.close()
        line2 = f"{sotto} sotto scorta" if sotto > 0 else "Giacenze ok"
        summaries.append(ModuloSummary(
            key="vini", line1=f"{n_vini} etichette attive", line2=line2,
            badge=sotto,
        ))
    except Exception:
        summaries.append(ModuloSummary(key="vini", line1="Cantina & Vini", line2=""))

    # ── Ricette ──
    try:
        conn = get_foodcost_connection()
        row = conn.execute("SELECT COUNT(*) as cnt FROM ricette WHERE COALESCE(attiva,1)=1").fetchone()
        n_ric = row["cnt"] if row else 0
        # Food cost medio (se ci sono dati)
        fc_str = ""
        try:
            r2 = conn.execute("""
                SELECT AVG(food_cost_pct) as avg_fc FROM ricette
                WHERE COALESCE(attiva,1)=1 AND food_cost_pct IS NOT NULL AND food_cost_pct > 0
            """).fetchone()
            if r2 and r2["avg_fc"]:
                fc_str = f"Food cost medio {r2['avg_fc']:.0f}%"
        except Exception:
            pass
        conn.close()
        summaries.append(ModuloSummary(
            key="ricette", line1=f"{n_ric} schede attive",
            line2=fc_str or "Archivio ricette",
        ))
    except Exception:
        summaries.append(ModuloSummary(key="ricette", line1="Gestione Cucina", line2=""))

    # ── Acquisti ──
    line1 = f"{fatture.count} fattur{'a' if fatture.count == 1 else 'e'} da pagare"
    line2 = f"€ {fatture.importo:,.0f}".replace(",", ".") + " in sospeso" if fatture.importo > 0 else "Tutto pagato"
    summaries.append(ModuloSummary(
        key="acquisti", line1=line1, line2=line2,
        badge=fatture.count,
    ))

    # ── Flussi di Cassa ──
    try:
        conn = get_foodcost_connection()
        prefix = oggi[:7]  # YYYY-MM
        row = conn.execute("""
            SELECT COALESCE(SUM(CASE WHEN tipo='entrata' THEN importo ELSE -importo END), 0) as saldo
            FROM flussi_cassa WHERE data LIKE ?
        """, (prefix + "%",)).fetchone()
        saldo = row["saldo"] if row else 0
        conn.close()
        segno = "+" if saldo >= 0 else ""
        summaries.append(ModuloSummary(
            key="flussi-cassa",
            line1=f"Saldo mese: {segno}€ {saldo:,.0f}".replace(",", "."),
            line2="CC · Carta · Contanti · Mance",
        ))
    except Exception:
        summaries.append(ModuloSummary(key="flussi-cassa", line1="Flussi di Cassa", line2="CC · Carta · Contanti"))

    # ── Controllo Gestione ──
    summaries.append(ModuloSummary(
        key="controllo-gestione",
        line1="Dashboard P&L e confronto",
        line2=f"Coperti mese: {coperti.totale} (vs {coperti.anno_precedente} prec.)" if coperti.anno_precedente > 0 else f"Coperti mese: {coperti.totale}",
    ))

    # ── Dipendenti ──
    try:
        conn = get_dipendenti_conn()
        row = conn.execute("SELECT COUNT(*) as cnt FROM dipendenti WHERE COALESCE(attivo,1)=1").fetchone()
        n_dip = row["cnt"] if row else 0
        # Scadenze prossime 14gg
        r2 = conn.execute("""
            SELECT COUNT(*) as cnt FROM dipendenti_scadenze ds
            JOIN dipendenti d ON ds.dipendente_id = d.id
            WHERE ds.data_scadenza IS NOT NULL AND ds.data_scadenza != ''
              AND ds.data_scadenza <= date(?, '+14 days')
              AND ds.data_scadenza >= ?
              AND COALESCE(ds.stato, 'VALIDO') != 'SCADUTO'
        """, (oggi, oggi)).fetchone()
        n_scad = r2["cnt"] if r2 else 0
        conn.close()
        line2 = f"{n_scad} scadenz{'a' if n_scad == 1 else 'e'} entro 14gg" if n_scad > 0 else "Nessuna scadenza imminente"
        summaries.append(ModuloSummary(
            key="dipendenti", line1=f"{n_dip} dipendenti attivi", line2=line2,
            badge=n_scad,
        ))
    except Exception:
        summaries.append(ModuloSummary(key="dipendenti", line1="Dipendenti", line2=""))

    # ── Clienti ──
    try:
        conn = get_clienti_conn()
        row = conn.execute("SELECT COUNT(*) as cnt FROM clienti").fetchone()
        n_cl = row["cnt"] if row else 0
        conn.close()
        summaries.append(ModuloSummary(
            key="clienti", line1=f"{n_cl} clienti in rubrica",
            line2="Anagrafica · CRM · Dashboard",
        ))
    except Exception:
        summaries.append(ModuloSummary(key="clienti", line1="Gestione Clienti", line2=""))

    # ── Statistiche ──
    summaries.append(ModuloSummary(
        key="statistiche",
        line1="Cucina · Coperti · Trend",
        line2="Dashboard e grafici",
    ))

    # ── Impostazioni ──
    summaries.append(ModuloSummary(
        key="impostazioni",
        line1="Utenti · Moduli · Backup",
        line2="Configurazione sistema",
    ))

    return summaries


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

    prenotazioni = _prenotazioni_oggi(oggi_str)
    incasso = _incasso_ieri(ieri_str, giorno_settimana)
    fatture = _fatture_pending()
    coperti = _coperti_mese(oggi)
    macellaio = _macellaio_widget(oggi_str)

    response = DashboardHome(
        prenotazioni=prenotazioni,
        incasso_ieri=incasso,
        coperti_mese=coperti,
        fatture_pending=fatture,
        macellaio=macellaio,
        alerts=_alerts(oggi_str),
        moduli=_moduli_summary(oggi_str, prenotazioni, incasso, fatture, coperti),
    )

    # ── Trigger Alert Engine M.F (fire-and-forget) ──
    # Esegue i checker e crea notifiche se necessario.
    # L'anti-duplicato interno evita spam (max 1 notifica ogni 12-24h per tipo).
    try:
        from app.services.alert_engine import run_all_checks
        run_all_checks(dry_run=False)
    except Exception as e:
        logger.warning(f"Dashboard: alert engine trigger fallito: {e}")

    return response
