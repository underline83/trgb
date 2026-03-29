"""
TRGB — Controllo di Gestione Router
Dashboard unificata che incrocia dati da: Acquisti, Banca, Vendite.

Prefix: /controllo-gestione
DB: foodcost.db (lettura acquisti, banca), admin_finance.sqlite3 (lettura vendite)
"""

import sqlite3
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.services.auth_service import get_current_user, is_admin

router = APIRouter(prefix="/controllo-gestione", tags=["controllo-gestione"])

FOODCOST_DB = "app/data/foodcost.db"
VENDITE_DB = "app/data/admin_finance.sqlite3"


def get_fc_db():
    conn = sqlite3.connect(FOODCOST_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_vendite_db():
    conn = sqlite3.connect(VENDITE_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _fmt_month(m: int) -> str:
    """Ritorna nome mese abbreviato in italiano."""
    nomi = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
            "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    return nomi[m] if 1 <= m <= 12 else f"M{m}"


# ═══════════════════════════════════════════════════════════════════
# DASHBOARD UNIFICATA — Panorama completo
# ═══════════════════════════════════════════════════════════════════

@router.get("/dashboard")
def dashboard(
    anno: int = Query(default=None),
    mese: int = Query(default=None),
    current_user=Depends(get_current_user),
):
    """
    Dashboard Controllo di Gestione.
    Incrocia dati da Acquisti, Banca e Vendite.

    Parametri:
    - anno: anno di riferimento (default: anno corrente)
    - mese: mese di riferimento (default: mese corrente)
    """
    oggi = date.today()
    anno = anno or oggi.year
    mese = mese or oggi.month

    # Calcola range date del mese
    primo_giorno = f"{anno}-{mese:02d}-01"
    if mese == 12:
        ultimo_giorno = f"{anno}-12-31"
    else:
        ultimo_giorno = f"{anno}-{mese + 1:02d}-01"

    # Mese precedente per confronto
    if mese == 1:
        prev_anno, prev_mese = anno - 1, 12
    else:
        prev_anno, prev_mese = anno, mese - 1
    prev_primo = f"{prev_anno}-{prev_mese:02d}-01"
    prev_ultimo = primo_giorno  # esclusivo

    fc = get_fc_db()
    vdb = get_vendite_db()

    result = {
        "anno": anno,
        "mese": mese,
        "mese_label": _fmt_month(mese),
        "periodo": f"{_fmt_month(mese)} {anno}",
    }

    # ─── 1. VENDITE (da admin_finance.sqlite3 — corrispettivi) ───

    try:
        vendite_mese = vdb.execute("""
            SELECT
                COUNT(*) AS giorni_apertura,
                COALESCE(SUM(corrispettivi), 0) AS totale_corrispettivi,
                COALESCE(SUM(contanti_finali), 0) AS totale_contanti,
                COALESCE(SUM(pos_bpm + pos_sella), 0) AS totale_pos,
                COALESCE(SUM(fatture), 0) AS totale_fatture_emesse,
                COALESCE(AVG(corrispettivi), 0) AS media_giornaliera
            FROM daily_closures
            WHERE date >= ? AND date < ?
            AND corrispettivi > 0
        """, (primo_giorno, ultimo_giorno)).fetchone()

        vendite_prev = vdb.execute("""
            SELECT COALESCE(SUM(corrispettivi), 0) AS totale
            FROM daily_closures
            WHERE date >= ? AND date < ?
            AND corrispettivi > 0
        """, (prev_primo, prev_ultimo)).fetchone()

        v = dict(vendite_mese)
        v_prev = vendite_prev["totale"] or 0
        v["variazione_mese_prec"] = (
            round((v["totale_corrispettivi"] - v_prev) / v_prev * 100, 1)
            if v_prev > 0 else None
        )
        result["vendite"] = v
    except Exception:
        result["vendite"] = {"totale_corrispettivi": 0, "giorni_apertura": 0,
                             "media_giornaliera": 0, "variazione_mese_prec": None}

    vdb.close()

    # ─── 2. ACQUISTI (da foodcost.db — fe_fatture) ───

    acquisti_mese = fc.execute("""
        SELECT
            COUNT(*) AS num_fatture,
            COALESCE(SUM(totale_fattura), 0) AS totale_acquisti,
            COALESCE(SUM(imponibile_totale), 0) AS totale_imponibile,
            COALESCE(SUM(iva_totale), 0) AS totale_iva,
            COUNT(DISTINCT fornitore_piva) AS num_fornitori
        FROM fe_fatture
        WHERE data_fattura >= ? AND data_fattura < ?
        AND is_autofattura = 0
    """, (primo_giorno, ultimo_giorno)).fetchone()

    acquisti_prev = fc.execute("""
        SELECT COALESCE(SUM(totale_fattura), 0) AS totale
        FROM fe_fatture
        WHERE data_fattura >= ? AND data_fattura < ?
        AND is_autofattura = 0
    """, (prev_primo, prev_ultimo)).fetchone()

    a = dict(acquisti_mese)
    a_prev = acquisti_prev["totale"] or 0
    a["variazione_mese_prec"] = (
        round((a["totale_acquisti"] - a_prev) / a_prev * 100, 1)
        if a_prev > 0 else None
    )
    result["acquisti"] = a

    # ─── 3. BANCA (da foodcost.db — banca_movimenti) ───

    banca_mese = fc.execute("""
        SELECT
            COUNT(*) AS num_movimenti,
            COALESCE(SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END), 0) AS entrate,
            COALESCE(SUM(CASE WHEN importo < 0 THEN importo ELSE 0 END), 0) AS uscite,
            COALESCE(SUM(importo), 0) AS saldo_periodo
        FROM banca_movimenti
        WHERE data_contabile >= ? AND data_contabile < ?
    """, (primo_giorno, ultimo_giorno)).fetchone()

    # Saldo complessivo banca (ultimo movimento)
    saldo_banca = fc.execute("""
        SELECT data_contabile, importo,
            (SELECT SUM(importo) FROM banca_movimenti) AS saldo_totale
        FROM banca_movimenti
        ORDER BY data_contabile DESC, id DESC
        LIMIT 1
    """).fetchone()

    b = dict(banca_mese)
    b["saldo_conto"] = saldo_banca["saldo_totale"] if saldo_banca else 0
    result["banca"] = b

    # ─── 4. SCADENZE / RATEIZZAZIONI — TODO (punti 6-7) ───
    # Per ora non collegato. Sara' sviluppato in fase successiva.

    # ─── 5. MARGINE LORDO (vendite - acquisti) ───

    vendite_tot = result["vendite"].get("totale_corrispettivi", 0)
    acquisti_tot = result["acquisti"].get("totale_acquisti", 0)
    margine = vendite_tot - acquisti_tot
    margine_pct = round(margine / vendite_tot * 100, 1) if vendite_tot > 0 else None

    result["margine"] = {
        "margine_lordo": round(margine, 2),
        "margine_pct": margine_pct,
        "vendite": round(vendite_tot, 2),
        "acquisti": round(acquisti_tot, 2),
    }

    # ─── 6. ANDAMENTO ANNUALE (mesi dell'anno) ───

    andamento = []
    for m in range(1, 13):
        m_primo = f"{anno}-{m:02d}-01"
        if m == 12:
            m_ultimo = f"{anno + 1}-01-01"
        else:
            m_ultimo = f"{anno}-{m + 1:02d}-01"

        # Acquisti mese
        acq = fc.execute("""
            SELECT COALESCE(SUM(totale_fattura), 0) AS tot
            FROM fe_fatture
            WHERE data_fattura >= ? AND data_fattura < ? AND is_autofattura = 0
        """, (m_primo, m_ultimo)).fetchone()["tot"]

        # Banca uscite mese
        banca_u = fc.execute("""
            SELECT COALESCE(SUM(CASE WHEN importo < 0 THEN ABS(importo) ELSE 0 END), 0) AS tot
            FROM banca_movimenti
            WHERE data_contabile >= ? AND data_contabile < ?
        """, (m_primo, m_ultimo)).fetchone()["tot"]

        andamento.append({
            "mese": m,
            "mese_label": _fmt_month(m),
            "acquisti": round(acq, 2),
            "banca_uscite": round(banca_u, 2),
        })

    # Vendite annuali (da DB separato)
    try:
        vdb2 = get_vendite_db()
        for m in range(1, 13):
            m_primo = f"{anno}-{m:02d}-01"
            if m == 12:
                m_ultimo = f"{anno + 1}-01-01"
            else:
                m_ultimo = f"{anno}-{m + 1:02d}-01"

            ven = vdb2.execute("""
                SELECT COALESCE(SUM(corrispettivi), 0) AS tot
                FROM daily_closures
                WHERE date >= ? AND date < ? AND corrispettivi > 0
            """, (m_primo, m_ultimo)).fetchone()["tot"]
            andamento[m - 1]["vendite"] = round(ven, 2)
            andamento[m - 1]["margine"] = round(ven - andamento[m - 1]["acquisti"], 2)
        vdb2.close()
    except Exception:
        for item in andamento:
            item["vendite"] = 0
            item["margine"] = -item["acquisti"]

    result["andamento"] = andamento

    # ─── 7. TOP FORNITORI MESE (da acquisti) ───

    top_forn = fc.execute("""
        SELECT fornitore_nome,
               COUNT(*) AS num_fatture,
               COALESCE(SUM(totale_fattura), 0) AS totale
        FROM fe_fatture
        WHERE data_fattura >= ? AND data_fattura < ?
        AND is_autofattura = 0
        GROUP BY fornitore_piva
        ORDER BY totale DESC
        LIMIT 8
    """, (primo_giorno, ultimo_giorno)).fetchall()

    result["top_fornitori"] = [dict(r) for r in top_forn]

    # ─── 8. CATEGORIE ACQUISTI MESE ───

    cat_acquisti = fc.execute("""
        SELECT
            COALESCE(fc.nome, 'Non categorizzato') AS categoria,
            COUNT(DISTINCT f.id) AS num_fatture,
            COALESCE(SUM(f.totale_fattura), 0) AS totale
        FROM fe_fatture f
        LEFT JOIN fe_fornitore_categoria ffc ON f.fornitore_piva = ffc.fornitore_piva
        LEFT JOIN fe_categorie fc ON ffc.categoria_id = fc.id
        WHERE f.data_fattura >= ? AND f.data_fattura < ?
        AND f.is_autofattura = 0
        GROUP BY fc.nome
        ORDER BY totale DESC
    """, (primo_giorno, ultimo_giorno)).fetchall()

    result["categorie_acquisti"] = [dict(r) for r in cat_acquisti]

    fc.close()
    return result


# ═══════════════════════════════════════════════════════════════════
# CONFRONTO PERIODI — due mesi/trimestri/anni a confronto
# ═══════════════════════════════════════════════════════════════════

@router.get("/confronto")
def confronto(
    anno1: int = Query(...),
    mese1: int = Query(default=None),
    anno2: int = Query(...),
    mese2: int = Query(default=None),
    current_user=Depends(get_current_user),
):
    """
    Confronta due periodi. Se mese e' specificato confronta mesi, altrimenti anni interi.
    """
    fc = get_fc_db()
    vdb = get_vendite_db()

    def _get_periodo_data(a, m):
        if m:
            primo = f"{a}-{m:02d}-01"
            if m == 12:
                ultimo = f"{a + 1}-01-01"
            else:
                ultimo = f"{a}-{m + 1:02d}-01"
            label = f"{_fmt_month(m)} {a}"
        else:
            primo = f"{a}-01-01"
            ultimo = f"{a + 1}-01-01"
            label = str(a)

        acq = fc.execute("""
            SELECT COUNT(*) AS num, COALESCE(SUM(totale_fattura), 0) AS tot
            FROM fe_fatture WHERE data_fattura >= ? AND data_fattura < ? AND is_autofattura = 0
        """, (primo, ultimo)).fetchone()

        banca = fc.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END), 0) AS entrate,
                COALESCE(SUM(CASE WHEN importo < 0 THEN ABS(importo) ELSE 0 END), 0) AS uscite
            FROM banca_movimenti WHERE data_contabile >= ? AND data_contabile < ?
        """, (primo, ultimo)).fetchone()

        try:
            ven = vdb.execute("""
                SELECT COALESCE(SUM(corrispettivi), 0) AS tot
                FROM daily_closures WHERE date >= ? AND date < ? AND corrispettivi > 0
            """, (primo, ultimo)).fetchone()["tot"]
        except Exception:
            ven = 0

        return {
            "label": label,
            "vendite": round(ven, 2),
            "acquisti": round(acq["tot"], 2),
            "num_fatture": acq["num"],
            "banca_entrate": round(banca["entrate"], 2),
            "banca_uscite": round(banca["uscite"], 2),
            "margine": round(ven - acq["tot"], 2),
        }

    p1 = _get_periodo_data(anno1, mese1)
    p2 = _get_periodo_data(anno2, mese2)

    fc.close()
    vdb.close()

    # Calcola variazioni %
    variazioni = {}
    for key in ["vendite", "acquisti", "margine", "banca_entrate", "banca_uscite"]:
        v1 = p1[key]
        v2 = p2[key]
        variazioni[key] = round((v1 - v2) / abs(v2) * 100, 1) if v2 != 0 else None

    return {
        "periodo_1": p1,
        "periodo_2": p2,
        "variazioni": variazioni,
    }
