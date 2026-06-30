"""
TRGB — Controllo di Gestione Router
Dashboard unificata che incrocia dati da: Acquisti, Banca, Vendite.
Tabellone Uscite: importa fatture da Acquisti, calcola scadenze, gestisce stati.

Prefix: /controllo-gestione
DB: foodcost.db (lettura acquisti, banca, cg_uscite, cg_spese_fisse),
    admin_finance.sqlite3 (lettura vendite)
"""

import calendar
import csv
import io
import sqlite3
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, Body, UploadFile, File, Form, HTTPException, Response
from app.services.auth_service import get_current_user, is_admin
from app.services.vendite_aggregator import (
    totali_periodo as vendite_totali_periodo,
    totali_mensili_anno as vendite_totali_mensili_anno,
)
from app.services.liquidita_service import dashboard_liquidita

router = APIRouter(prefix="/controllo-gestione", tags=["controllo-gestione"])

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware. Modulo: controllo_gestione.
FOODCOST_DB = locale_data_path("foodcost.db")
VENDITE_DB = locale_data_path("admin_finance.sqlite3")
# G.3 Fase E (2026-05-16): il CE legge anche da dipendenti.sqlite3 per il
# costo aziendale completo del personale (tabella dipendenti_costo_consuntivo
# popolata dall'import ELAB.pdf). Fallback ai netti se il file non esiste.
DIPENDENTI_DB = locale_data_path("dipendenti.sqlite3")


def get_fc_db():
    conn = sqlite3.connect(FOODCOST_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_vendite_db():
    conn = sqlite3.connect(VENDITE_DB)
    conn.row_factory = sqlite3.Row
    return conn


def get_dipendenti_db():
    """Connessione read-only a dipendenti.sqlite3 (per costo aziendale completo
    nel CE — G.3 Fase E). Ritorna None se il file non esiste (ambiente legacy
    o errore di path)."""
    from pathlib import Path
    if not Path(DIPENDENTI_DB).exists():
        return None
    conn = sqlite3.connect(DIPENDENTI_DB)
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
    dip = get_dipendenti_db()  # opzionale (G.3 Fase E)

    result = {
        "anno": anno,
        "mese": mese,
        "mese_label": _fmt_month(mese),
        "periodo": f"{_fmt_month(mese)} {anno}",
    }

    # ─── 0. CONTO ECONOMICO CANONICO (G.3 Fase D — audit 2026-05-16) ───
    # Dashboard prima leggeva ricavi/acquisti/margine direttamente da
    # fe_fatture (con IVA, niente filtri categorie/escluso_acquisti).
    # Discrepanza vs Conto Economico (che usa imponibile no-IVA + filtri).
    # Audit Marco 2026-05-16: Dashboard riusa compute_pl per coerenza
    # con il CE. Le viste specifiche (banca, andamento annuale) restano sui
    # propri SQL diretti per non gonfiare il payload.
    try:
        from app.services.conto_economico import compute_pl
        pl = compute_pl(fc, vdb, anno, mese, modalita="competenza", dip_conn=dip)
    except Exception as e:
        pl = None
        result["pl_error"] = str(e)

    # ─── 1. VENDITE (da admin_finance.sqlite3 via vendite_aggregator) ───
    # Usa shift_closures come sorgente primaria (chiusure turno in app),
    # daily_closures come fallback per lo storico. MAI leggere direttamente
    # una sola delle due: i dati sarebbero parziali.

    try:
        v = vendite_totali_periodo(vdb, primo_giorno, ultimo_giorno)
        v_prev_tot = vendite_totali_periodo(vdb, prev_primo, prev_ultimo)
        v_prev = v_prev_tot["totale_corrispettivi"] or 0
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

    # ─── 5. MARGINE LORDO + UTILE NETTO (canonici da CE — audit 2026-05-16) ───
    # OLD: margine = vendite − tutti gli acquisti (con IVA, no filtri).
    # NEW: usa il Conto Economico canonico (vendite − costo merce per
    #      margine lordo; − costi operativi per utile netto). Coerente al
    #      centesimo con la pagina Conto Economico.
    # Fallback: se compute_pl ha errori, ricade sul calcolo legacy.
    if pl is not None:
        result["margine"] = {
            "vendite": pl["ricavi"]["totale"],
            "costo_merce": pl["costo_merce"]["totale"],
            "costo_merce_pct": pl["costo_merce"].get("pct_su_ricavi"),
            "margine_lordo": pl["margine_lordo"],
            "margine_pct": pl["margine_lordo_pct"],
            "costi_operativi": pl["costi_operativi"]["totale"],
            "costi_operativi_pct": pl["costi_operativi"].get("pct_su_ricavi"),
            "utile_netto": pl["utile_netto"],
            "utile_netto_pct": pl["utile_netto_pct"],
            "modalita_costo_personale": pl["_meta"].get("costo_personale", {}).get("modalita"),
        }
    else:
        # Fallback legacy se compute_pl fallisce
        vendite_tot = result["vendite"].get("totale_corrispettivi", 0)
        acquisti_tot = result["acquisti"].get("totale_acquisti", 0)
        margine = vendite_tot - acquisti_tot
        margine_pct = round(margine / vendite_tot * 100, 1) if vendite_tot > 0 else None
        result["margine"] = {
            "margine_lordo": round(margine, 2),
            "margine_pct": margine_pct,
            "vendite": round(vendite_tot, 2),
            "acquisti": round(acquisti_tot, 2),
            "_legacy_fallback": True,
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

    # Vendite annuali (da DB separato, via vendite_aggregator)
    try:
        vdb2 = get_vendite_db()
        mensili = vendite_totali_mensili_anno(vdb2, anno)
        for m_data in mensili:
            idx = m_data["mese"] - 1
            ven = m_data["totale_corrispettivi"]
            andamento[idx]["vendite"] = ven
            andamento[idx]["margine"] = round(ven - andamento[idx]["acquisti"], 2)
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
    if dip is not None:
        dip.close()
    return result


# ═══════════════════════════════════════════════════════════════════
# CONTO ECONOMICO COMPLETO (G.3 Fase B, 2026-05-14)
# ═══════════════════════════════════════════════════════════════════

@router.get("/conto-economico")
def conto_economico(
    anno: int = Query(default=None, ge=2020, le=2100),
    mese: int = Query(default=None, ge=1, le=12),
    modalita: str = Query(default="competenza", pattern="^(competenza|cassa)$"),
    # G.3.7a (2026-05-16): vista trimestrale / annuale
    periodo: str = Query(default="mese", pattern="^(mese|trimestre|anno)$"),
    trimestre: int = Query(default=None, ge=1, le=4),
    current_user=Depends(get_current_user),
):
    """
    Conto Economico Completo per (anno, mese).

    Ritorna: ricavi → costo merce → margine lordo → costi operativi → utile netto,
    con breakdown per categoria/sottocategoria delle fatture acquisti
    (fe_categorie/fe_sottocategorie) + spese fisse + stipendi.

    Aggrega:
      - Ricavi: corrispettivi POS (da admin_finance via vendite_aggregator)
      - Costo merce: fatture imponibile con categoria in {MATERIE PRIME, BEVANDE}
      - Costi operativi: tutte le altre categorie fatture + spese fisse
        (cg_uscite tipo='SPESA_FISSA') + stipendi (cg_uscite tipo='STIPENDIO',
        v1 = netto)

    Modalità:
      - 'competenza' (default): data_fattura per fatture, periodo_riferimento
        per spese fisse/stipendi. È quella che usa il commercialista.
      - 'cassa' (TODO v1.1): fallback a competenza con warning.

    Decisioni di prodotto: imponibile (no IVA), TD04 escluse, autofatture
    escluse, escluso_acquisti=1 escluse, anti-doppio-conteggio stipendi
    (solo da cg_uscite, NON da cg_spese_fisse tipo='STIPENDIO').

    Vedi: docs/roadmap.md §G.3, app/services/conto_economico.py
    """
    oggi = date.today()
    anno = anno or oggi.year
    mese = mese or oggi.month

    # G.3.7a — Determina range mese_da..mese_a in base al `periodo`.
    if periodo == "anno":
        mese_da, mese_a = 1, 12
    elif periodo == "trimestre":
        t = trimestre or ((mese - 1) // 3 + 1)
        mese_da = (t - 1) * 3 + 1
        mese_a = mese_da + 2
    else:  # mese (default, retrocompat)
        mese_da = mese_a = mese

    fc = get_fc_db()
    vdb = get_vendite_db()
    dip = get_dipendenti_db()  # può ritornare None (graceful fallback)
    try:
        from app.services.conto_economico import compute_pl
        return compute_pl(
            fc, vdb, anno, mese, modalita,
            dip_conn=dip, mese_da=mese_da, mese_a=mese_a,
        )
    finally:
        fc.close()
        vdb.close()
        if dip is not None:
            dip.close()


# ═══════════════════════════════════════════════════════════════════
# CONFRONTO PERIODI — RIMOSSO 2026-05-16 (audit Marco)
# Endpoint /confronto era stub mai usato (pagina frontend placeholder
# rimossa dalla nav). Per confronti periodo-periodo usare /conto-economico
# con i parametri periodo=mese|trimestre|anno.
# Recupero codice: `git log -p -- app/routers/controllo_gestione_router.py`
# ═══════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════
# MAPPING MODALITÀ PAGAMENTO FatturaPA
# ═══════════════════════════════════════════════════════════════════

MP_LABELS = {
    "MP01": "Contanti",
    "MP02": "Assegno",
    "MP03": "Assegno circolare",
    "MP04": "Contanti c/o Tesoreria",
    "MP05": "Bonifico",
    "MP06": "Vaglia cambiario",
    "MP07": "Bollettino bancario",
    "MP08": "Carta di pagamento",
    "MP09": "RID",
    "MP10": "RID utenze",
    "MP11": "RID veloce",
    "MP12": "RIBA",
    "MP13": "MAV",
    "MP14": "Quietanza erario",
    "MP15": "Giroconto su conti di contabilità speciale",
    "MP16": "Domiciliazione bancaria",
    "MP17": "Domiciliazione postale",
    "MP18": "Bollettino di c/c postale",
    "MP19": "SEPA Direct Debit",
    "MP20": "SEPA Direct Debit CORE",
    "MP21": "SEPA Direct Debit B2B",
    "MP22": "Trattenuta su somme già riscosse",
    "MP23": "PagoPA",
}


# ═══════════════════════════════════════════════════════════════════
# LIQUIDITA' — RIMOSSO 2026-05-16 (audit Marco)
# Endpoint /liquidita era usato dalla pagina ControlloGestioneLiquidita
# (frontend rimosso, route ora redirect a /flussi-cassa/dashboard).
# La visione "principio di cassa" è coperta da:
#   - modulo Flussi di Cassa (banca_movimenti, contanti)
#   - Conto Economico modalità "cassa" (TODO v1.2)
# Recupero codice: `git log -p -- app/routers/controllo_gestione_router.py`
# ═══════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════
# IMPORT USCITE DA FATTURE ACQUISTI
# ═══════════════════════════════════════════════════════════════════

@router.post("/uscite/import")
def import_uscite(
    current_user=Depends(get_current_user),
):
    """
    Importa le fatture non pagate da fe_fatture nella tabella cg_uscite.

    Logica scadenza (in ordine di priorità):
    1. data_scadenza presente nell'XML della fattura (DatiPagamento)
    2. giorni_pagamento del fornitore (suppliers.giorni_pagamento) → data_fattura + giorni
    3. NULL → la fattura finisce in "senza scadenza" (avviso)

    Logica stato:
    - Se data_scadenza < oggi → SCADUTO (arretrato)
    - Se data_scadenza >= oggi → PROGRAMMATO (uscita corrente)
    - Se data_scadenza è NULL → PROGRAMMATO (senza scadenza, richiede attenzione)

    Fatture già importate: aggiorna stato se cambiato.
    Autofatture (is_autofattura=1) e note credito (TD04) escluse.
    """
    fc = get_fc_db()
    oggi_str = date.today().isoformat()

    # ── Fix-up stipendi: corregge tipo_uscita e fornitore_nome per righe create prima del fix ──
    fc.execute("""
        UPDATE cg_uscite SET tipo_uscita = 'STIPENDIO'
        WHERE (tipo_uscita IS NULL OR tipo_uscita = '' OR tipo_uscita = 'FATTURA')
          AND fornitore_nome LIKE 'Stipendio -%'
    """)
    # Fix righe con fornitore_nome vuoto ma collegate a stipendi (numero_fattura contiene 'Stipendio')
    fc.execute("""
        UPDATE cg_uscite SET tipo_uscita = 'STIPENDIO'
        WHERE (tipo_uscita IS NULL OR tipo_uscita = '' OR tipo_uscita = 'FATTURA')
          AND numero_fattura LIKE 'Stipendio%'
    """)
    fc.commit()

    # ── Fetch tutte le fatture non-auto, non-nota-credito ──
    # LEFT JOIN con banca_fatture_link per riconciliare cross-ref esistenti
    # LEFT JOIN fe_fornitore_categoria per filtrare i fornitori esclusi (mig 061+063)
    fatture = fc.execute("""
        SELECT
            f.id, f.fornitore_nome, f.fornitore_piva,
            f.numero_fattura, f.data_fattura,
            f.totale_fattura, f.data_scadenza,
            f.condizioni_pagamento, f.modalita_pagamento,
            s.giorni_pagamento AS fornitore_giorni,
            s.modalita_pagamento_default AS fornitore_mp,
            bfl.movimento_id AS linked_movimento_id,
            bm.data_contabile  AS linked_data_mov
        FROM fe_fatture f
        LEFT JOIN suppliers s ON f.fornitore_piva = s.partita_iva
        LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
        LEFT JOIN banca_movimenti bm ON bfl.movimento_id = bm.id
        LEFT JOIN fe_fornitore_categoria fc_cat
               ON (fc_cat.fornitore_piva = f.fornitore_piva
                   AND fc_cat.fornitore_piva IS NOT NULL
                   AND fc_cat.fornitore_piva != '')
               OR (COALESCE(fc_cat.fornitore_piva, '') = ''
                   AND COALESCE(f.fornitore_piva, '') = ''
                   AND fc_cat.fornitore_nome = f.fornitore_nome)
        WHERE f.is_autofattura = 0
          AND COALESCE(f.tipo_documento, 'TD01') NOT IN ('TD04')
          AND f.totale_fattura > 0
          AND COALESCE(fc_cat.escluso_acquisti, 0) = 0
    """).fetchall()

    importate = 0
    aggiornate = 0
    saltate = 0
    senza_scadenza = 0

    for fat in fatture:
        fat = dict(fat)
        fattura_id = fat["id"]

        # ── Calcola data_scadenza ──
        data_scad = fat["data_scadenza"]  # da XML
        if not data_scad and fat["fornitore_giorni"] and fat["data_fattura"]:
            # Calcola da default fornitore
            try:
                df = datetime.strptime(fat["data_fattura"], "%Y-%m-%d")
                data_scad = (df + timedelta(days=fat["fornitore_giorni"])).strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                data_scad = None

        if not data_scad:
            senza_scadenza += 1

        # ── Cross-ref: se c'è un link bancario, la fattura è PAGATO ──
        linked_mov = fat.get("linked_movimento_id")
        linked_data = fat.get("linked_data_mov")

        # ── Calcola stato ──
        if linked_mov:
            stato = "PAGATO"
        elif data_scad and data_scad < oggi_str:
            stato = "SCADUTO"
        else:
            stato = "PROGRAMMATO"

        # ── Controlla se già importata ──
        existing = fc.execute(
            "SELECT id, stato, data_scadenza, totale, numero_fattura, banca_movimento_id FROM cg_uscite WHERE fattura_id = ?",
            (fattura_id,)
        ).fetchone()

        if existing:
            ex = dict(existing)
            # G.8: il re-import non tocca MAI uno stato "deciso dall'utente".
            # Solo PROGRAMMATO e SCADUTO sono "derivati dalla data" e quindi
            # ricalcolabili. Tutti gli altri (CHIUSI + APERTI espliciti tipo
            # VERIFICARE/SPOSTATO/RATEIZZATO/PARZIALE) sono intoccabili dal sync.
            # ECCEZIONE: cross-ref banca nuovo → propaga PAGATO.
            STATI_DERIVATI_DA_DATA = {"PROGRAMMATO", "SCADUTO"}
            if ex["stato"] not in STATI_DERIVATI_DA_DATA:
                if linked_mov and not ex.get("banca_movimento_id"):
                    # Cross-ref esiste ma non era propagato — aggiorna
                    # Bug D5: reset in_pagamento_at quando si conferma PAGATO
                    fc.execute("""
                        UPDATE cg_uscite
                        SET banca_movimento_id = ?, stato = 'PAGATO',
                            importo_pagato = totale,
                            data_pagamento = COALESCE(data_pagamento, ?),
                            in_pagamento_at = NULL,
                            pagamento_batch_id = NULL,
                            updated_at = ?
                        WHERE id = ?
                    """, (linked_mov, linked_data, oggi_str, ex["id"]))
                    aggiornate += 1
                else:
                    saltate += 1
                continue
            # Se PROGRAMMATO/SCADUTO ma ha cross-ref → marca PAGATO
            if linked_mov:
                # Bug D5: reset in_pagamento_at quando si conferma PAGATO da cross-ref
                fc.execute("""
                    UPDATE cg_uscite
                    SET stato = 'PAGATO', banca_movimento_id = ?,
                        importo_pagato = totale,
                        data_pagamento = COALESCE(data_pagamento, ?),
                        data_scadenza = ?, totale = ?,
                        numero_fattura = ?, data_fattura = ?,
                        fornitore_nome = ?, fornitore_piva = ?,
                        in_pagamento_at = NULL,
                        pagamento_batch_id = NULL,
                        updated_at = ?
                    WHERE id = ?
                """, (linked_mov, linked_data,
                      data_scad, fat["totale_fattura"],
                      fat["numero_fattura"], fat["data_fattura"],
                      fat["fornitore_nome"], fat["fornitore_piva"],
                      oggi_str, ex["id"]))
                aggiornate += 1
                continue
            # Aggiorna stato, scadenza, totale, numero_fattura e dati fornitore se cambiati
            needs_update = (
                ex["stato"] != stato
                or ex["data_scadenza"] != data_scad
                or abs((ex["totale"] or 0) - fat["totale_fattura"]) > 0.01
                or (ex["numero_fattura"] or "") != (fat["numero_fattura"] or "")
            )
            if needs_update:
                fc.execute("""
                    UPDATE cg_uscite
                    SET stato = ?, data_scadenza = ?, totale = ?,
                        numero_fattura = ?, data_fattura = ?,
                        fornitore_nome = ?, fornitore_piva = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (stato, data_scad, fat["totale_fattura"],
                      fat["numero_fattura"], fat["data_fattura"],
                      fat["fornitore_nome"], fat["fornitore_piva"],
                      oggi_str, ex["id"]))
                aggiornate += 1
            else:
                saltate += 1
        else:
            # Nuova uscita — se ha cross-ref, inserisci già come PAGATO
            fc.execute("""
                INSERT INTO cg_uscite (
                    fattura_id, fornitore_nome, fornitore_piva,
                    numero_fattura, data_fattura, totale,
                    data_scadenza, stato, banca_movimento_id,
                    importo_pagato, data_pagamento,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                fattura_id, fat["fornitore_nome"], fat["fornitore_piva"],
                fat["numero_fattura"], fat["data_fattura"],
                fat["totale_fattura"],
                data_scad, stato,
                linked_mov,
                fat["totale_fattura"] if linked_mov else 0,
                linked_data if linked_mov else None,
                oggi_str, oggi_str,
            ))
            importate += 1

    # ── Fix fatture azzerate: se totale_fattura ora è 0 ma cg_uscite ha ancora il vecchio importo ──
    fatture_azzerate = fc.execute("""
        SELECT cu.id, f.totale_fattura
        FROM cg_uscite cu
        JOIN fe_fatture f ON cu.fattura_id = f.id
        WHERE (cu.tipo_uscita IS NULL OR cu.tipo_uscita = 'FATTURA')
          AND cu.stato IN ('PROGRAMMATO', 'SCADUTO')
          AND (f.totale_fattura <= 0 OR f.totale_fattura IS NULL)
          AND cu.totale > 0
    """).fetchall()
    for az in fatture_azzerate:
        fc.execute("""
            UPDATE cg_uscite SET totale = 0, stato = 'PAGATO', note = 'Fattura azzerata/stornata', updated_at = ?
            WHERE id = ?
        """, (oggi_str, az["id"]))
        aggiornate += 1

    # ═══════════════════════════════════════════════════════════════
    # PARTE 2: Genera righe dalle SPESE FISSE attive
    # ═══════════════════════════════════════════════════════════════
    spese_fisse = fc.execute("""
        SELECT * FROM cg_spese_fisse WHERE attiva = 1
    """).fetchall()

    sf_importate = 0
    sf_saltate = 0

    # Genera scadenze per i prossimi 3 mesi + mese corrente + mesi passati dall'inizio
    oggi = date.today()
    mesi_avanti = 3

    freq_mesi = {
        "MENSILE": 1, "BIMESTRALE": 2, "TRIMESTRALE": 3,
        "SEMESTRALE": 6, "ANNUALE": 12, "UNA_TANTUM": 0,
    }

    for sf in spese_fisse:
        sf = dict(sf)
        intervallo = freq_mesi.get(sf["frequenza"], 1)
        if intervallo == 0:
            # UNA_TANTUM: una sola riga con data_inizio come scadenza
            periodo = sf["data_inizio"][:7] if sf["data_inizio"] else oggi.strftime("%Y-%m")
            giorno = sf["giorno_scadenza"] or 1
            if sf["data_inizio"]:
                data_scad = sf["data_inizio"]
            else:
                data_scad = f"{periodo}-{giorno:02d}"

            existing = fc.execute(
                "SELECT id FROM cg_uscite WHERE spesa_fissa_id = ? AND periodo_riferimento = ?",
                (sf["id"], periodo)
            ).fetchone()
            if not existing:
                stato_sf = "SCADUTO" if data_scad < oggi_str else "PROGRAMMATO"
                fc.execute("""
                    INSERT INTO cg_uscite (
                        spesa_fissa_id, tipo_uscita, fornitore_nome,
                        numero_fattura, totale, data_scadenza,
                        stato, periodo_riferimento, created_at, updated_at
                    ) VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sf["id"], sf["titolo"],
                    sf["tipo"], sf["importo"], data_scad,
                    stato_sf, periodo, oggi_str, oggi_str,
                ))
                sf_importate += 1
            else:
                # Sync titolo/importo se cambiati nella spesa fissa
                fc.execute("""
                    UPDATE cg_uscite SET fornitore_nome = ?, totale = ?, updated_at = ?
                    WHERE spesa_fissa_id = ? AND periodo_riferimento = ?
                      AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
                """, (sf["titolo"], sf["importo"], oggi_str, sf["id"], periodo))
                sf_saltate += 1
            continue

        # Calcola range mesi: da data_inizio (o 12 mesi fa) fino a oggi + mesi_avanti
        inizio = date.fromisoformat(sf["data_inizio"]) if sf["data_inizio"] else date(oggi.year - 1, oggi.month, 1)
        fine_limite = date(oggi.year, oggi.month, 1) + timedelta(days=32 * mesi_avanti)
        if sf["data_fine"]:
            fine_spesa = date.fromisoformat(sf["data_fine"])
            if fine_limite > fine_spesa:
                fine_limite = fine_spesa

        # Genera mesi
        current = date(inizio.year, inizio.month, 1)
        step = 0
        while current < fine_limite:
            if step % intervallo == 0:
                periodo = current.strftime("%Y-%m")
                giorno = sf["giorno_scadenza"] or 1
                # Clamp giorno al max del mese
                max_day = calendar.monthrange(current.year, current.month)[1]
                g = min(giorno, max_day)
                data_scad = f"{current.year}-{current.month:02d}-{g:02d}"

                # Importo + (mig 108) data_scadenza_specifica + nota: dal piano rate se esiste,
                # altrimenti fisso dalla spesa con calcolo standard.
                importo_rata = sf["importo"]
                nota_rata = None
                try:
                    pr = fc.execute(
                        "SELECT importo, note, data_scadenza_specifica FROM cg_piano_rate WHERE spesa_fissa_id = ? AND periodo = ?",
                        (sf["id"], periodo)
                    ).fetchone()
                    if pr:
                        importo_rata = pr["importo"]
                        nota_rata = pr["note"]
                        # mig 108: override data_scadenza con la specifica della rata
                        # (necessario per piani AdE/PagoPA con date irregolari)
                        if pr["data_scadenza_specifica"]:
                            data_scad = pr["data_scadenza_specifica"]
                except Exception:
                    pass  # Tabella non ancora creata o colonne mig 108 non presenti

                existing = fc.execute(
                    "SELECT id, stato FROM cg_uscite WHERE spesa_fissa_id = ? AND periodo_riferimento = ?",
                    (sf["id"], periodo)
                ).fetchone()
                if not existing:
                    stato_sf = "SCADUTO" if data_scad < oggi_str else "PROGRAMMATO"
                    fc.execute("""
                        INSERT INTO cg_uscite (
                            spesa_fissa_id, tipo_uscita, fornitore_nome,
                            numero_fattura, totale, data_scadenza,
                            stato, periodo_riferimento, note, created_at, updated_at
                        ) VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        sf["id"], sf["titolo"],
                        sf["tipo"], importo_rata, data_scad,
                        stato_sf, periodo, nota_rata, oggi_str, oggi_str,
                    ))
                    sf_importate += 1
                else:
                    ex = dict(existing)
                    # G.8 difensivo: sync stato/data solo se lo stato è derivato dalla
                    # data (PROGRAMMATO/SCADUTO). VERIFICARE, SPOSTATO, RATEIZZATO,
                    # PARZIALE e i CHIUSI sono decisioni utente: non toccare.
                    # Stessa logica della whitelist invariante introdotta da G.8
                    # per le fatture.
                    if ex["stato"] in ("PROGRAMMATO", "SCADUTO"):
                        new_stato = "SCADUTO" if data_scad < oggi_str else "PROGRAMMATO"
                        # Sync titolo, importo, data_scadenza e stato
                        # (mig 108: data_scad può essere quella specifica della rata)
                        fc.execute("""
                            UPDATE cg_uscite SET fornitore_nome = ?, totale = ?, data_scadenza = ?, stato = ?, updated_at = ?
                            WHERE id = ?
                        """, (sf["titolo"], importo_rata, data_scad, new_stato, oggi_str, ex["id"]))
                    sf_saltate += 1

            # Avanza di un mese
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)
            step += 1

    # ── Log import ──
    note_log = f"Senza scadenza: {senza_scadenza}"
    if sf_importate > 0:
        note_log += f", Spese fisse generate: {sf_importate}"
    fc.execute("""
        INSERT INTO cg_uscite_log (tipo, fatture_importate, fatture_aggiornate, fatture_saltate, note)
        VALUES (?, ?, ?, ?, ?)
    """, (
        "IMPORT_FATTURE", importate + sf_importate, aggiornate, saltate + sf_saltate,
        note_log,
    ))

    fc.commit()
    fc.close()

    return {
        "importate": importate,
        "aggiornate": aggiornate,
        "saltate": saltate,
        "senza_scadenza": senza_scadenza,
        "totale_fatture": len(fatture),
        "spese_fisse_generate": sf_importate,
        "spese_fisse_saltate": sf_saltate,
    }


# ═══════════════════════════════════════════════════════════════════
# TABELLONE USCITE — Lista completa con filtri
# ═══════════════════════════════════════════════════════════════════

@router.get("/uscite")
def get_uscite(
    stato: Optional[str] = Query(default=None),
    fornitore: Optional[str] = Query(default=None),
    da: Optional[str] = Query(default=None, description="Data scadenza da (YYYY-MM-DD)"),
    a: Optional[str] = Query(default=None, description="Data scadenza a (YYYY-MM-DD)"),
    ordine: str = Query(default="scadenza_asc"),
    includi_rateizzate: bool = Query(default=False, description="Se True mostra anche le fatture rateizzate"),
    includi_escluse: bool = Query(default=False, description="Se True mostra anche le fatture di fornitori esclusi dagli acquisti"),
    current_user=Depends(get_current_user),
):
    """
    Tabellone uscite (v2.0 — CG aggregatore).
    cg_uscite resta indice di workflow; per le righe FATTURA la "verità" dei
    campi di pianificazione finanziaria (data scadenza effettiva, IBAN,
    modalità pagamento) viene letta da fe_fatture via JOIN.
    Filtri: stato (PROGRAMMATO, SCADUTO, PAGATO, PARZIALE), fornitore, range scadenza.
    """
    fc = get_fc_db()
    oggi_str = date.today().isoformat()

    # Filtro fisso: nascondi rateizzate di default (riattivabili con includi_rateizzate).
    # Doppio check (riportato in sessione 2026-05-11 dopo mig 120):
    #  - f.rateizzata_in_spesa_fissa_id IS NULL  → esclude fatture origine via FE
    #  - u.stato <> 'RATEIZZATO'                 → esclude cg_uscite marcate RATEIZZATO
    #    (mig 120 backfill, e in futuro l'endpoint di rateizzazione deve farlo
    #    al momento della creazione)
    # Le rate generate dalla spesa fissa hanno fattura_id=NULL e stato
    # PROGRAMMATO/SCADUTO/PAGATO/etc., quindi passano il filtro.
    where = [
        "(:includi_rateizzate = 1 "
        " OR (f.rateizzata_in_spesa_fissa_id IS NULL AND u.stato <> 'RATEIZZATO'))"
    ]
    # Filtro fisso: nascondi righe di fornitori con escluso_acquisti=1 (riattivabili con includi_escluse).
    # Le cg_uscite di tipo SPESA_FISSA non hanno fattura_id né fornitore escluso, quindi passano sempre.
    where.append("(:includi_escluse = 1 OR u.fattura_id IS NULL OR COALESCE(fc_cat.escluso_acquisti, 0) = 0)")
    params: dict = {
        "includi_rateizzate": 1 if includi_rateizzate else 0,
        "includi_escluse": 1 if includi_escluse else 0,
    }

    if stato:
        # Filtri stato: in Fase B la transizione non è completa, restano su u.stato
        where.append("u.stato = :stato")
        params["stato"] = stato
    if fornitore:
        where.append("u.fornitore_nome LIKE :fornitore")
        params["fornitore"] = f"%{fornitore}%"
    if da:
        # Range data: punta a data_scadenza_effettiva (COALESCE duplicato perché
        # SQLite non permette di referenziare alias del SELECT nella WHERE).
        where.append("COALESCE(f.data_effettiva_pagamento, f.data_prevista_pagamento, u.data_scadenza, f.data_scadenza) >= :da")
        params["da"] = da
    if a:
        where.append("COALESCE(f.data_effettiva_pagamento, f.data_prevista_pagamento, u.data_scadenza, f.data_scadenza) <= :a")
        params["a"] = a

    where_sql = f"WHERE {' AND '.join(where)}"

    ordine_map = {
        "scadenza_asc":  "data_scadenza_effettiva ASC NULLS LAST",
        "scadenza_desc": "data_scadenza_effettiva DESC NULLS LAST",
        "importo_asc":   "u.totale ASC",
        "importo_desc":  "u.totale DESC",
        "fornitore":     "u.fornitore_nome ASC",
        "data_fattura":  "u.data_fattura DESC",
    }
    order_sql = ordine_map.get(ordine, "data_scadenza_effettiva ASC NULLS LAST")

    uscite = fc.execute(f"""
        SELECT
            -- tutti i campi nativi di cg_uscite (retrocompatibilità)
            u.id,
            u.fattura_id,
            u.fornitore_nome,
            u.fornitore_piva,
            u.numero_fattura,
            u.data_fattura,
            u.totale,
            u.data_scadenza                 AS data_scadenza_cg,
            u.importo_pagato,
            u.data_pagamento,
            u.stato                         AS stato_cg,
            u.stato_macro,
            u.banca_movimento_id,
            u.note,
            u.created_at,
            u.updated_at,
            u.metodo_pagamento,
            u.tipo_uscita,
            u.spesa_fissa_id,
            u.periodo_riferimento,
            u.data_scadenza_originale,
            u.pagamento_batch_id,
            u.in_pagamento_at,

            -- campi JOIN tradizionali
            f.modalita_pagamento            AS mp_xml,
            f.condizioni_pagamento          AS cp_xml,
            s.modalita_pagamento_default    AS mp_fornitore,
            s.giorni_pagamento              AS giorni_fornitore,
            sf.tipo                         AS sf_tipo,
            sf.frequenza                    AS sf_frequenza,
            sf.titolo                       AS sf_titolo,
            pb.titolo                       AS batch_titolo,
            pb.stato                        AS batch_stato,
            pb.created_at                   AS batch_created_at,

            -- NUOVI campi v2.0 (fe_fatture come fonte di verità)
            f.rateizzata_in_spesa_fissa_id,
            f.data_scadenza                 AS data_scadenza_xml,
            f.data_prevista_pagamento,
            f.data_effettiva_pagamento,
            f.iban_beneficiario             AS iban_fattura,
            f.modalita_pagamento_override,
            s.iban                          AS iban_fornitore,
            sf.iban                         AS iban_spesa_fissa,

            -- "data_scadenza_effettiva": fallback chain per il display
            --  1) data_effettiva_pagamento (se pagata, vince sempre)
            --  2) data_prevista_pagamento  (override utente)
            --  3) u.data_scadenza          (cg_uscite, può avere modifiche pre-v2.0)
            --  4) f.data_scadenza          (XML analitico)
            COALESCE(
                f.data_effettiva_pagamento,
                f.data_prevista_pagamento,
                u.data_scadenza,
                f.data_scadenza
            )                                AS data_scadenza_effettiva,

            -- "modalita_pagamento_effettiva": override > XML > fornitore
            COALESCE(
                f.modalita_pagamento_override,
                f.modalita_pagamento,
                s.modalita_pagamento_default
            )                                AS modalita_pagamento_effettiva,

            -- "iban_beneficiario_effettivo": fattura > spesa fissa > fornitore
            COALESCE(
                f.iban_beneficiario,
                sf.iban,
                s.iban
            )                                AS iban_beneficiario_effettivo,

            -- Flag derivato
            CASE
                WHEN f.rateizzata_in_spesa_fissa_id IS NOT NULL THEN 1
                WHEN u.stato = 'RATEIZZATO' THEN 1
                ELSE 0
            END                              AS is_rateizzata,

            -- Stato normalizzato (display): fa vedere come RATEIZZATO/PAGATO
            -- anche quando cg_uscite non è ancora allineata
            CASE
                WHEN f.rateizzata_in_spesa_fissa_id IS NOT NULL THEN 'RATEIZZATO'
                WHEN u.stato = 'RATEIZZATO' THEN 'RATEIZZATO'
                WHEN f.data_effettiva_pagamento IS NOT NULL AND u.stato NOT IN ('PAGATO','PAGATO_MANUALE','PARZIALE')
                     THEN 'PAGATO'
                ELSE u.stato
            END                              AS stato

        FROM cg_uscite u
        LEFT JOIN fe_fatture         f  ON u.fattura_id         = f.id
        LEFT JOIN suppliers          s  ON u.fornitore_piva     = s.partita_iva
        LEFT JOIN cg_spese_fisse     sf ON u.spesa_fissa_id     = sf.id
        LEFT JOIN cg_pagamenti_batch pb ON u.pagamento_batch_id = pb.id
        LEFT JOIN fe_fornitore_categoria fc_cat
               ON (fc_cat.fornitore_piva = f.fornitore_piva
                   AND fc_cat.fornitore_piva IS NOT NULL
                   AND fc_cat.fornitore_piva != '')
               OR (COALESCE(fc_cat.fornitore_piva, '') = ''
                   AND COALESCE(f.fornitore_piva, '') = ''
                   AND fc_cat.fornitore_nome = f.fornitore_nome)
        {where_sql}
        ORDER BY {order_sql}
    """, params).fetchall()

    rows = []
    for r in uscite:
        row = dict(r)
        # v2.0: rimappa il campo computato al nome pubblico del payload.
        # row["stato"] arriva già col nome giusto (alias della CASE).
        # row["stato_cg"] e row["data_scadenza_cg"] restano accessibili come raw.
        row["data_scadenza"] = row.pop("data_scadenza_effettiva")

        # Arricchisci con label modalità pagamento (preferisce la chain effettiva v2.0)
        mp = row.get("modalita_pagamento_effettiva") or row.get("mp_xml") or row.get("mp_fornitore")
        row["modalita_pagamento_label"] = MP_LABELS.get(mp, mp) if mp else None
        row["modalita_pagamento_codice"] = mp
        # Label metodo pagamento manuale
        _metodo_labels = {"CONTO_CORRENTE": "Conto Corrente", "CARTA": "Carta", "CONTANTI": "Contanti"}
        row["metodo_pagamento_label"] = _metodo_labels.get(row.get("metodo_pagamento")) if row.get("metodo_pagamento") else None
        # Tipo uscita label
        tipo_u = row.get("tipo_uscita") or "FATTURA"
        row["tipo_uscita"] = tipo_u
        if tipo_u == "SPESA_FISSA":
            _sf_tipo_labels = {"AFFITTO": "Affitto", "TASSA": "Tassa",
                               "F24_STIPENDI": "F24 stipendi",
                               "RATEIZZAZIONE_TASSE": "Rateizzazione tasse",
                               "STIPENDIO": "Stipendio",
                               "PRESTITO": "Prestito", "RATEIZZAZIONE": "Rateizzazione",
                               "ASSICURAZIONE": "Assicurazione", "ALTRO": "Altro"}
            row["sf_tipo_label"] = _sf_tipo_labels.get(row.get("sf_tipo"), row.get("sf_tipo"))
        # Sorgente scadenza
        if row.get("mp_xml") or (row.get("data_scadenza") and not row.get("giorni_fornitore")):
            row["scadenza_fonte"] = "xml"
        elif row.get("giorni_fornitore"):
            row["scadenza_fonte"] = "fornitore"
        else:
            row["scadenza_fonte"] = None
        rows.append(row)

    # ── Riepilogo ──
    totale_da_pagare = sum(r["totale"] - r["importo_pagato"] for r in rows if r["stato"] == "PROGRAMMATO")
    totale_scadute = sum(r["totale"] - r["importo_pagato"] for r in rows if r["stato"] == "SCADUTO")
    stati_pagata = ("PAGATO", "PAGATO_MANUALE", "PARZIALE")
    totale_pagate = sum(r["importo_pagato"] for r in rows if r["stato"] in stati_pagata)
    n_senza_scadenza = sum(1 for r in rows if r["data_scadenza"] is None and r["stato"] not in stati_pagata)
    n_pagata_manuale = sum(1 for r in rows if r["stato"] == "PAGATO_MANUALE")
    n_riconciliate = sum(1 for r in rows if r.get("banca_movimento_id"))
    n_da_riconciliare = sum(1 for r in rows if r["stato"] == "PAGATO_MANUALE" and not r.get("banca_movimento_id"))

    fc.close()

    return {
        "uscite": rows,
        "riepilogo": {
            "totale_da_pagare": round(totale_da_pagare, 2),
            "totale_scadute": round(totale_scadute, 2),
            "totale_pagate": round(totale_pagate, 2),
            "num_da_pagare": sum(1 for r in rows if r["stato"] == "PROGRAMMATO"),
            "num_scadute": sum(1 for r in rows if r["stato"] == "SCADUTO"),
            "num_pagate": sum(1 for r in rows if r["stato"] in stati_pagata),
            "num_pagata_manuale": n_pagata_manuale,
            "num_senza_scadenza": n_senza_scadenza,
            "num_riconciliate": n_riconciliate,
            "num_da_riconciliare": n_da_riconciliare,
        },
    }


# ═══════════════════════════════════════════════════════════════════
# FATTURE SENZA SCADENZA — per avvisi in Acquisti
# ═══════════════════════════════════════════════════════════════════

# ──────────────────────────────────────────────────────────────────────────
# G.2.B — Scadenziario per calendario (vista mensile + widget timeline)
# Ritorna le rate da pagare/scadute non riconciliate nel range richiesto,
# con campi minimali e già "pronti" per il <CalendarView> di M.E.
# ──────────────────────────────────────────────────────────────────────────

def _accorcia_titolo_scadenza(titolo: str) -> str:
    """
    Accorcia il titolo per uso compatto nelle celle calendario.
    Rimuove prefissi/suffissi che mangiano spazio senza aggiungere valore.
    Esempi:
      "Rateizzazione MARCHESI ANTINORI SPA — 2 fatture" → "MARCHESI ANTINORI SPA"
      "Rateizzazione Cantina Nalles-Magrè/Niclara Soc. Agr. Coop." → "Cantina Nalles-Magrè/Niclara Soc.…"
      "TIM S.p.A." → "TIM S.p.A."
    Max ~26 caratteri, '…' al posto di "..." (font-friendly).
    """
    if not titolo:
        return "—"
    s = titolo.strip()
    # Rimuovi prefisso "Rateizzazione " (case-insensitive)
    low = s.lower()
    for prefix in ("rateizzazione ", "rate. ", "ratea ", "rateazione "):
        if low.startswith(prefix):
            s = s[len(prefix):].strip()
            break
    # Rimuovi suffisso " — N fattura/e" o " - N fattura/e"
    import re
    s = re.sub(r"\s*[—-]\s*\d+\s*fattur[ae]\s*$", "", s, flags=re.IGNORECASE).strip()
    # Trim a 26 char con ellipsis
    MAX = 26
    if len(s) > MAX:
        s = s[: MAX - 1].rstrip() + "…"
    return s or "—"


@router.get("/scadenze")
def get_scadenze_calendario(
    da: str = Query(..., description="Data inizio range (YYYY-MM-DD)"),
    a: str = Query(..., description="Data fine range (YYYY-MM-DD), inclusivo"),
    tipo_uscita: Optional[str] = Query(default=None, description="Filtra per tipo (FATTURA/SPESA_FISSA/STIPENDIO/...)"),
    importo_min: Optional[float] = Query(default=None, description="Filtra solo importi ≥ N euro"),
    includi_pagate: bool = Query(default=False, description="Se True include anche PAGATO/PAGATO_MANUALE/PARZIALE"),
    current_user=Depends(get_current_user),
):
    """
    Lista cg_uscite nel range richiesto, ordinate per data_scadenza.
    Output ottimizzato per CalendarView (M.E):
      [{id, data_scadenza, titolo, fornitore_nome, totale, stato, tipo_uscita,
        spesa_fissa_id, spesa_titolo, livello}, ...]
    Il campo `livello` è derivato (urgente/avvicinamento/pianificazione/futuro)
    in base alla soglia rispetto a oggi — usato dal frontend per scegliere il colore.
    """
    fc = get_fc_db()

    # Validazione range
    try:
        d_da = date.fromisoformat(da)
        d_a = date.fromisoformat(a)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date non valide (YYYY-MM-DD)")
    if d_a < d_da:
        raise HTTPException(status_code=400, detail="Range non valido: a < da")

    where = ["u.data_scadenza IS NOT NULL", "u.data_scadenza != ''",
             "u.data_scadenza >= :da", "u.data_scadenza <= :a"]
    params: dict = {"da": da, "a": a}

    if includi_pagate:
        where.append("u.stato IN ('PROGRAMMATO','SCADUTO','PAGATO','PAGATO_MANUALE','PARZIALE')")
    else:
        where.append("u.stato IN ('PROGRAMMATO','SCADUTO')")
        where.append("u.banca_movimento_id IS NULL")

    if tipo_uscita:
        where.append("u.tipo_uscita = :tipo_uscita")
        params["tipo_uscita"] = tipo_uscita
    if importo_min is not None:
        where.append("COALESCE(u.totale, 0) >= :importo_min")
        params["importo_min"] = importo_min

    sql = f"""
        SELECT
            u.id,
            u.data_scadenza,
            u.fornitore_nome,
            u.totale,
            u.stato,
            u.tipo_uscita,
            u.spesa_fissa_id,
            u.fattura_id,
            sf.titolo AS spesa_titolo
        FROM cg_uscite u
        LEFT JOIN cg_spese_fisse sf ON sf.id = u.spesa_fissa_id
        WHERE {' AND '.join(where)}
        ORDER BY u.data_scadenza ASC, u.totale DESC
    """
    rows = fc.execute(sql, params).fetchall()
    fc.close()

    # Classificazione livello per il colore evento
    today = date.today()
    out = []
    for r in rows:
        try:
            scad = date.fromisoformat(r["data_scadenza"])
            delta = (scad - today).days
        except Exception:
            delta = 9999

        # 4 livelli, allineati con G.2.A:
        #   - "scaduta": data passata e non riconciliata
        #   - "urgente": ≤ 7 gg
        #   - "avvicinamento": 8..15 gg
        #   - "pianificazione": 16..30 gg
        #   - "futuro": > 30 gg
        # NB: la soglia esatta dei livelli urgente/avv/pian può divergere
        # dalla config alert_engine, ma 7/15/30 è il default condiviso
        # e il frontend può comunque sovrascrivere il colore.
        if r["stato"] in ("PAGATO", "PAGATO_MANUALE"):
            livello = "pagata"
        elif r["stato"] == "PARZIALE":
            livello = "parziale"
        elif delta < 0:
            livello = "scaduta"
        elif delta <= 7:
            livello = "urgente"
        elif delta <= 15:
            livello = "avvicinamento"
        elif delta <= 30:
            livello = "pianificazione"
        else:
            livello = "futuro"

        # Titolo human-readable: usa spesa_titolo per spese fisse, fornitore per fatture
        titolo = (r["spesa_titolo"] or r["fornitore_nome"] or "—").strip()
        titolo_breve = _accorcia_titolo_scadenza(titolo)

        out.append({
            "id": r["id"],
            "data_scadenza": r["data_scadenza"],
            "titolo": titolo,
            "titolo_breve": titolo_breve,
            "fornitore_nome": r["fornitore_nome"],
            "totale": float(r["totale"] or 0),
            "stato": r["stato"],
            "tipo_uscita": r["tipo_uscita"],
            "spesa_fissa_id": r["spesa_fissa_id"],
            "fattura_id": r["fattura_id"],
            "livello": livello,
        })

    return {
        "scadenze": out,
        "count": len(out),
        "totale": round(sum(s["totale"] for s in out), 2),
        "range": {"da": da, "a": a},
    }


# ═══════════════════════════════════════════════════════════════════
# /uscite/senza-scadenza — RIMOSSO 2026-05-16 (audit Marco)
# Zero chiamate da frontend. La funzionalità è coperta dallo Scadenziario
# con filtro "stato=SENZA_SCADENZA" (se mai servirà reimplementare).
# Recupero codice: `git log -p -- app/routers/controllo_gestione_router.py`
# ═══════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════
# FORNITORE — Modalità pagamento default
# ═══════════════════════════════════════════════════════════════════

@router.get("/fornitore/{piva}/pagamento")
def get_fornitore_pagamento(piva: str, current_user=Depends(get_current_user)):
    """
    Ritorna i dati di pagamento di un fornitore.
    Se ha default manuali in suppliers li ritorna.
    Altrimenti auto-rileva dalle fatture con dati pagamento.
    """
    fc = get_fc_db()
    row = fc.execute("""
        SELECT modalita_pagamento_default, giorni_pagamento, note_pagamento
        FROM suppliers WHERE partita_iva = ?
    """, (piva,)).fetchone()

    manual = dict(row) if row else {"modalita_pagamento_default": None, "giorni_pagamento": None, "note_pagamento": None}
    has_manual = bool(manual.get("giorni_pagamento") or manual.get("modalita_pagamento_default"))

    # Carica preset associato
    preset_row = fc.execute(
        "SELECT condizioni_pagamento_preset FROM suppliers WHERE partita_iva = ?", (piva,)
    ).fetchone()
    preset_codice = preset_row["condizioni_pagamento_preset"] if preset_row and preset_row["condizioni_pagamento_preset"] else None

    # ── Auto-detect dalle fatture ──
    fatture_pag = fc.execute("""
        SELECT modalita_pagamento, data_fattura, data_scadenza
        FROM fe_fatture
        WHERE (fornitore_piva = ? OR (fornitore_piva IS NULL AND fornitore_nome = ?))
          AND data_scadenza IS NOT NULL
    """, (piva, piva)).fetchall()

    auto_detected = None
    if fatture_pag:
        from collections import Counter
        mp_counts = Counter()
        giorni_list = []
        for f in fatture_pag:
            if f["modalita_pagamento"]:
                mp_counts[f["modalita_pagamento"]] += 1
            try:
                df = datetime.strptime(f["data_fattura"], "%Y-%m-%d")
                ds = datetime.strptime(f["data_scadenza"], "%Y-%m-%d")
                giorni_list.append((ds - df).days)
            except (ValueError, TypeError):
                pass

        mp_top = mp_counts.most_common(1)[0][0] if mp_counts else None
        mp_top_pct = round(mp_counts.most_common(1)[0][1] / sum(mp_counts.values()) * 100) if mp_counts else 0
        giorni_median = sorted(giorni_list)[len(giorni_list) // 2] if giorni_list else None
        giorni_varianza = len(set(giorni_list)) <= 3 if giorni_list else False

        # ── Rileva se è FM (fine mese) o DF (data fattura) ──
        # Se la maggior parte delle scadenze cadono a fine mese (28-31), è FM
        fine_mese_count = 0
        for f in fatture_pag:
            try:
                ds = datetime.strptime(f["data_scadenza"], "%Y-%m-%d")
                import calendar
                ultimo_giorno = calendar.monthrange(ds.year, ds.month)[1]
                if ds.day >= ultimo_giorno - 1:  # 28-31 del mese
                    fine_mese_count += 1
            except (ValueError, TypeError):
                pass
        calcolo = "FM" if fine_mese_count > len(fatture_pag) * 0.6 else "DF"

        # ── Arrotonda giorni a multipli standard ──
        giorni_arrotondati = giorni_median
        if giorni_median is not None:
            standard = [0, 15, 20, 30, 45, 60, 90, 120, 150, 180]
            giorni_arrotondati = min(standard, key=lambda x: abs(x - giorni_median))

        # ── Suggerisci preset matching ──
        preset_suggerito = None
        if mp_top and giorni_arrotondati is not None:
            preset_match = fc.execute("""
                SELECT codice, descrizione FROM condizioni_pagamento_preset
                WHERE modalita = ? AND giorni = ? AND calcolo = ? AND rate = 1 AND attivo = 1
                LIMIT 1
            """, (mp_top, giorni_arrotondati, calcolo)).fetchone()
            if preset_match:
                preset_suggerito = dict(preset_match)

        auto_detected = {
            "modalita_pagamento": mp_top,
            "giorni_pagamento": giorni_arrotondati,
            "giorni_raw": giorni_median,
            "calcolo": calcolo,
            "fatture_analizzate": len(fatture_pag),
            "mp_percentuale": mp_top_pct,
            "giorni_uniforme": giorni_varianza,
            "fine_mese_pct": round(fine_mese_count / len(fatture_pag) * 100) if fatture_pag else 0,
            "preset_suggerito": preset_suggerito,
        }

    fc.close()

    result = {**manual, "has_manual": has_manual, "preset_codice": preset_codice, "auto_detected": auto_detected}
    return result


@router.put("/fornitore/{piva}/pagamento")
def update_fornitore_pagamento(
    piva: str,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Aggiorna modalità pagamento di default per un fornitore.
    Body: { modalita_pagamento_default, giorni_pagamento, note_pagamento }
    """
    fc = get_fc_db()

    existing = fc.execute("SELECT id FROM suppliers WHERE partita_iva = ?", (piva,)).fetchone()
    if existing:
        fc.execute("""
            UPDATE suppliers
            SET modalita_pagamento_default = ?,
                giorni_pagamento = ?,
                note_pagamento = ?,
                condizioni_pagamento_preset = ?
            WHERE partita_iva = ?
        """, (
            payload.get("modalita_pagamento_default"),
            payload.get("giorni_pagamento"),
            payload.get("note_pagamento"),
            payload.get("preset_codice"),
            piva,
        ))
    else:
        nome_row = fc.execute(
            "SELECT fornitore_nome FROM fe_fatture WHERE fornitore_piva = ? LIMIT 1", (piva,)
        ).fetchone()
        nome = nome_row["fornitore_nome"] if nome_row else piva
        fc.execute("""
            INSERT INTO suppliers (name, partita_iva, modalita_pagamento_default, giorni_pagamento, note_pagamento, condizioni_pagamento_preset, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            nome, piva,
            payload.get("modalita_pagamento_default"),
            payload.get("giorni_pagamento"),
            payload.get("note_pagamento"),
            payload.get("preset_codice"),
        ))
    fc.commit()
    fc.close()

    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# /mp-labels — RIMOSSO 2026-05-16 (audit Marco)
# Zero chiamate da frontend. Il MP_LABELS dict resta in memoria per uso
# interno (es. enrichment uscite). Se servirà esporlo via API,
# ripristinare l'endpoint da git log.
# ═══════════════════════════════════════════════════════════════════


# ── Preset condizioni pagamento ──────────────────────────

@router.get("/condizioni-pagamento/preset")
def list_preset_pagamento(
    solo_attivi: bool = Query(True),
    current_user=Depends(get_current_user),
):
    """Lista preset condizioni pagamento."""
    fc = get_fc_db()
    where = "WHERE attivo = 1" if solo_attivi else ""
    rows = fc.execute(f"""
        SELECT id, codice, descrizione, modalita, giorni, calcolo, rate, attivo, ordine
        FROM condizioni_pagamento_preset {where}
        ORDER BY ordine, codice
    """).fetchall()
    fc.close()
    return [dict(r) for r in rows]


@router.post("/condizioni-pagamento/preset")
def create_preset_pagamento(
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """Crea un nuovo preset personalizzato."""
    fc = get_fc_db()
    fc.execute("""
        INSERT INTO condizioni_pagamento_preset (codice, descrizione, modalita, giorni, calcolo, rate, attivo, ordine)
        VALUES (?, ?, ?, ?, ?, ?, 1, (SELECT COALESCE(MAX(ordine), 0) + 1 FROM condizioni_pagamento_preset))
    """, (
        payload["codice"], payload["descrizione"], payload.get("modalita", "MP12"),
        payload.get("giorni", 30), payload.get("calcolo", "DF"), payload.get("rate", 1),
    ))
    fc.commit()
    new_id = fc.execute("SELECT last_insert_rowid()").fetchone()[0]
    fc.close()
    return {"ok": True, "id": new_id}


@router.put("/condizioni-pagamento/preset/{preset_id}")
def update_preset_pagamento(
    preset_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """Aggiorna un preset (descrizione, attivo, ordine, ecc.)."""
    fc = get_fc_db()
    sets = []
    params = []
    for field in ("descrizione", "modalita", "giorni", "calcolo", "rate", "attivo", "ordine"):
        if field in payload:
            sets.append(f"{field} = ?")
            params.append(payload[field])
    if not sets:
        fc.close()
        return {"ok": False, "error": "Nessun campo da aggiornare"}
    params.append(preset_id)
    fc.execute(f"UPDATE condizioni_pagamento_preset SET {', '.join(sets)} WHERE id = ?", params)
    fc.commit()
    fc.close()
    return {"ok": True}


@router.delete("/condizioni-pagamento/preset/{preset_id}")
def delete_preset_pagamento(
    preset_id: int,
    current_user=Depends(get_current_user),
):
    """Elimina un preset."""
    fc = get_fc_db()
    fc.execute("DELETE FROM condizioni_pagamento_preset WHERE id = ?", (preset_id,))
    fc.commit()
    fc.close()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# SPESE FISSE — Spese ricorrenti senza fattura
# ═══════════════════════════════════════════════════════════════════

TIPO_SPESA = ("AFFITTO", "TASSA", "F24_STIPENDI", "RATEIZZAZIONE_TASSE", "STIPENDIO", "PRESTITO", "RATEIZZAZIONE", "ASSICURAZIONE", "ALTRO")
FREQ_SPESA = ("MENSILE", "BIMESTRALE", "TRIMESTRALE", "SEMESTRALE", "ANNUALE", "UNA_TANTUM")


@router.get("/spese-fisse")
def list_spese_fisse(
    solo_attive: bool = Query(True),
    tipo: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    """Lista tutte le spese fisse. Di default solo le attive."""
    fc = get_fc_db()
    where = []
    params = []
    if solo_attive:
        where.append("attiva = 1")
    if tipo:
        where.append("tipo = ?")
        params.append(tipo)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    rows = fc.execute(f"""
        SELECT * FROM cg_spese_fisse {where_sql}
        ORDER BY tipo, titolo
    """, params).fetchall()

    # ── Aggregato pagato / residuo da cg_uscite (tutte le spese fisse) ──
    # Usato per i prestiti / rateizzazioni (avanzamento piano ammortamento),
    # ma esposto per tutti i tipi: per frontendhe vuole mostrare progresso.
    agg_rows = fc.execute("""
        SELECT
            spesa_fissa_id,
            COUNT(*) AS n_rate,
            SUM(CASE WHEN stato IN ('PAGATO','PAGATO_MANUALE','PARZIALE')
                     THEN COALESCE(importo_pagato, 0) ELSE 0 END) AS totale_pagato,
            SUM(CASE WHEN stato IN ('PROGRAMMATO','SCADUTO','PARZIALE')
                     THEN COALESCE(totale, 0) - COALESCE(importo_pagato, 0) ELSE 0 END) AS totale_residuo,
            SUM(CASE WHEN stato IN ('PAGATO','PAGATO_MANUALE') THEN 1 ELSE 0 END) AS n_pagate,
            SUM(CASE WHEN stato = 'PROGRAMMATO' THEN 1 ELSE 0 END) AS n_da_pagare,
            SUM(CASE WHEN stato = 'SCADUTO' THEN 1 ELSE 0 END) AS n_scadute,
            SUM(CASE WHEN stato = 'PARZIALE' THEN 1 ELSE 0 END) AS n_parziali
        FROM cg_uscite
        WHERE spesa_fissa_id IS NOT NULL
        GROUP BY spesa_fissa_id
    """).fetchall()
    agg_map = {r["spesa_fissa_id"]: dict(r) for r in agg_rows}

    spese_out = []
    for r in rows:
        d = dict(r)
        ag = agg_map.get(d["id"])
        if ag:
            d["totale_pagato"] = round(float(ag.get("totale_pagato") or 0), 2)
            d["totale_residuo"] = round(max(float(ag.get("totale_residuo") or 0), 0), 2)
            d["n_rate_totali"] = int(ag.get("n_rate") or 0)
            d["n_rate_pagate"] = int(ag.get("n_pagate") or 0) + int(ag.get("n_parziali") or 0)
            d["n_rate_da_pagare"] = int(ag.get("n_da_pagare") or 0)
            d["n_rate_scadute"] = int(ag.get("n_scadute") or 0)
        else:
            d["totale_pagato"] = 0.0
            d["totale_residuo"] = 0.0
            d["n_rate_totali"] = 0
            d["n_rate_pagate"] = 0
            d["n_rate_da_pagare"] = 0
            d["n_rate_scadute"] = 0
        spese_out.append(d)

    # Calcola riepilogo per tipo
    all_active = fc.execute("""
        SELECT tipo, COUNT(*) as n, SUM(importo) as totale
        FROM cg_spese_fisse WHERE attiva = 1
        GROUP BY tipo ORDER BY tipo
    """).fetchall()

    totale_mensile = 0.0
    for r in fc.execute("SELECT importo, frequenza FROM cg_spese_fisse WHERE attiva = 1").fetchall():
        freq_mult = {"MENSILE": 1, "BIMESTRALE": 0.5, "TRIMESTRALE": 1/3,
                     "SEMESTRALE": 1/6, "ANNUALE": 1/12, "UNA_TANTUM": 0}
        totale_mensile += r["importo"] * freq_mult.get(r["frequenza"], 1)

    fc.close()

    return {
        "spese": spese_out,
        "count": len(spese_out),
        "riepilogo_tipo": [dict(r) for r in all_active],
        "totale_mensile_stimato": round(totale_mensile, 2),
    }


# ──────────────────────────────────────────────────────────────────────────
# G.1.5 — Template CSV piano rate (scaricabile, da compilare e ricaricare)
# Registrato PRIMA di /spese-fisse/{spesa_id} per evitare match parametrico
# (FastAPI valuta le rotte in ordine di definizione; con spesa_id:int una
# richiesta a /spese-fisse/template-csv altrimenti restituirebbe 422).
# ──────────────────────────────────────────────────────────────────────────
@router.get("/spese-fisse/template-csv")
def download_template_csv(current_user=Depends(get_current_user)):
    """
    Restituisce un CSV preformattato col nostro standard, con righe di esempio
    e commenti header che spiegano formato data/importo.

    Header: Numero,Identificativo,Scadenza,Importo,Stato

    L'utente lo scarica, lo apre in Excel/Numbers, lo compila, lo salva come CSV
    e lo ricarica via wizard "Importa CSV piano rate".
    """
    today = date.today()
    # Esempio: 3 rate mensili partendo dal mese prossimo
    sample_dates = []
    for i in range(1, 4):
        m = today.month + i
        y = today.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        # giorno 30 per sicurezza
        sample_dates.append(f"30/{m:02d}/{y}")

    lines = [
        "# Template TRGB - piano rate",
        "# Compila le righe sotto e poi importa via 'Importa CSV piano rate'",
        "# Formato data: GG/MM/AAAA  -  Formato importo: 211,77 oppure 211.77",
        "# Stato: lascia 'Da pagare' per rate non ancora pagate",
        "# (le righe con # vengono ignorate dall'importatore)",
        "Numero,Identificativo,Scadenza,Importo,Stato",
        f"1,RATA001,{sample_dates[0]},\"211,77\",Da pagare",
        f"2,RATA002,{sample_dates[1]},\"211,77\",Da pagare",
        f"3,RATA003,{sample_dates[2]},\"211,77\",Da pagare",
    ]
    csv_text = "\n".join(lines) + "\n"
    # BOM UTF-8 così Excel italiano riconosce subito l'encoding
    body = ("﻿" + csv_text).encode("utf-8")
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="template_piano_rate.csv"',
        },
    )


@router.get("/spese-fisse/{spesa_id}")
def get_spesa_fissa(spesa_id: int, current_user=Depends(get_current_user)):
    fc = get_fc_db()
    row = fc.execute("SELECT * FROM cg_spese_fisse WHERE id = ?", (spesa_id,)).fetchone()
    fc.close()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(404, "Spesa non trovata")
    return dict(row)


@router.post("/spese-fisse")
def create_spesa_fissa(
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Crea una nuova spesa fissa.
    Body: { tipo, titolo, descrizione?, importo, frequenza, giorno_scadenza?,
            data_inizio?, data_fine?, note?, importo_originale?, spese_legali?,
            piano_rate?: [{ numero_rata, periodo, importo }] }
    Se piano_rate è presente, inserisce anche le rate in cg_piano_rate.
    """
    tipo = payload.get("tipo", "ALTRO")
    if tipo not in TIPO_SPESA:
        tipo = "ALTRO"
    freq = payload.get("frequenza", "MENSILE")
    if freq not in FREQ_SPESA:
        freq = "MENSILE"

    fc = get_fc_db()
    try:
        # Audit 2026-05-16: categoria_id + sottocategoria_id (mig 129) ora
        # editabili da UI (cgspesefisse non aveva mai esposto il selettore).
        # NULL ok → fallback automatico via mapping TIPO→categoria di mig 129
        # (es. TASSA→TASSE E IMPOSTE) oppure "Non categorizzato" nel CE.
        cat_id = payload.get("categoria_id")
        sub_id = payload.get("sottocategoria_id")
        try:
            cat_id = int(cat_id) if cat_id not in (None, "", 0) else None
        except (ValueError, TypeError):
            cat_id = None
        try:
            sub_id = int(sub_id) if sub_id not in (None, "", 0) else None
        except (ValueError, TypeError):
            sub_id = None
        # C1 / G.3.2: spalmatura_mesi + spalmatura_data_inizio (mig 135)
        spal_mesi = payload.get("spalmatura_mesi")
        try:
            spal_mesi = int(spal_mesi) if spal_mesi not in (None, "", 0) else None
        except (ValueError, TypeError):
            spal_mesi = None
        spal_data = payload.get("spalmatura_data_inizio") or None

        fc.execute("""
            INSERT INTO cg_spese_fisse
                (tipo, titolo, descrizione, importo, frequenza, giorno_scadenza,
                 data_inizio, data_fine, note, iban, attiva,
                 importo_originale, spese_legali,
                 categoria_id, sottocategoria_id,
                 spalmatura_mesi, spalmatura_data_inizio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
        """, (
            tipo,
            payload.get("titolo", "").strip(),
            payload.get("descrizione", ""),
            float(payload.get("importo", 0)),
            freq,
            payload.get("giorno_scadenza"),
            payload.get("data_inizio"),
            payload.get("data_fine"),
            payload.get("note", ""),
            payload.get("iban", ""),
            payload.get("importo_originale"),
            float(payload.get("spese_legali", 0) or 0),
            cat_id,
            sub_id,
            spal_mesi,
            spal_data,
        ))
        new_id = fc.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Se c'è un piano rate, inseriscilo + genera le uscite corrispondenti
        piano_rate = payload.get("piano_rate", [])
        titolo_sf = payload.get("titolo", "").strip()
        giorno_scad = payload.get("giorno_scadenza") or 1
        try:
            giorno_scad = int(giorno_scad)
        except Exception:
            giorno_scad = 1
        oggi = date.today()

        if piano_rate and isinstance(piano_rate, list):
            for r in piano_rate:
                periodo = r.get("periodo")
                importo_rata = r.get("importo")
                if not periodo or importo_rata is None:
                    continue
                try:
                    importo_rata = float(importo_rata)
                except Exception:
                    continue
                numero_rata = r.get("numero_rata", 0)
                note_rata = r.get("note")

                try:
                    fc.execute("""
                        INSERT INTO cg_piano_rate (spesa_fissa_id, numero_rata, periodo, importo, note)
                        VALUES (?, ?, ?, ?, ?)
                    """, (new_id, numero_rata, periodo, importo_rata, note_rata))
                except Exception:
                    pass

                # Calcola data_scadenza clampando il giorno al max del mese
                try:
                    anno_p, mese_p = periodo.split("-")
                    anno_p = int(anno_p)
                    mese_p = int(mese_p)
                    max_giorno = calendar.monthrange(anno_p, mese_p)[1]
                    g = min(giorno_scad, max_giorno)
                    data_scad = date(anno_p, mese_p, g).isoformat()
                except Exception:
                    continue

                # Stato: se scaduta → SCADUTO, altrimenti PROGRAMMATO
                try:
                    ds = date.fromisoformat(data_scad)
                    stato_u = "SCADUTO" if ds < oggi else "PROGRAMMATO"
                except Exception:
                    stato_u = "PROGRAMMATO"

                # Evita duplicati se già esistente
                existing = fc.execute(
                    "SELECT id FROM cg_uscite WHERE spesa_fissa_id = ? AND periodo_riferimento = ?",
                    (new_id, periodo)
                ).fetchone()
                if existing:
                    continue

                try:
                    fc.execute("""
                        INSERT INTO cg_uscite
                            (spesa_fissa_id, tipo_uscita, fornitore_nome, numero_fattura,
                             totale, data_scadenza, data_fattura,
                             importo_pagato, stato, periodo_riferimento, note)
                        VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, 0, ?, ?, ?)
                    """, (
                        new_id, titolo_sf, tipo,
                        importo_rata, data_scad, data_scad,
                        stato_u, periodo, note_rata
                    ))
                except Exception:
                    pass

        fc.commit()
        return {"ok": True, "id": new_id}
    finally:
        fc.close()


@router.put("/spese-fisse/{spesa_id}")
def update_spesa_fissa(
    spesa_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """Aggiorna una spesa fissa. Accetta update parziale."""
    fc = get_fc_db()
    existing = fc.execute("SELECT id FROM cg_spese_fisse WHERE id = ?", (spesa_id,)).fetchone()
    if not existing:
        fc.close()
        from fastapi import HTTPException
        raise HTTPException(404, "Spesa non trovata")

    # Audit 2026-05-16: aggiunti categoria_id + sottocategoria_id (mig 129).
    # Editabili dalla UI Spese Fisse, ammessi NULL per "fallback automatico al
    # mapping TIPO→categoria (mig 129) o 'Non categorizzato' nel CE".
    # C1 / G.3.2 (Marco 2026-05-16): spalmatura_mesi + spalmatura_data_inizio (mig 135).
    allowed = ("tipo", "titolo", "descrizione", "importo", "frequenza",
               "giorno_scadenza", "data_inizio", "data_fine", "note", "iban", "attiva",
               "categoria_id", "sottocategoria_id",
               "spalmatura_mesi", "spalmatura_data_inizio")
    sets = []
    params = []
    for field in allowed:
        if field in payload:
            sets.append(f"{field} = ?")
            val = payload[field]
            # Normalizza int/null per i campi FK soft
            if field in ("categoria_id", "sottocategoria_id"):
                try:
                    val = int(val) if val not in (None, "", 0) else None
                except (ValueError, TypeError):
                    val = None
            params.append(val)
    sets.append("updated_at = CURRENT_TIMESTAMP")

    if not params:
        fc.close()
        return {"ok": False, "error": "Nessun campo da aggiornare"}

    params.append(spesa_id)
    fc.execute(f"UPDATE cg_spese_fisse SET {', '.join(sets)} WHERE id = ?", params)

    # Propaga titolo e importo alle uscite già generate (solo quelle non pagate)
    if "titolo" in payload or "importo" in payload:
        # Rileggi i dati aggiornati
        sf = dict(fc.execute("SELECT titolo, importo FROM cg_spese_fisse WHERE id = ?", (spesa_id,)).fetchone())
        upd_sets = []
        upd_params = []
        if "titolo" in payload:
            upd_sets.append("fornitore_nome = ?")
            upd_params.append(sf["titolo"])
        if "importo" in payload:
            upd_sets.append("totale = ?")
            upd_params.append(sf["importo"])
        upd_sets.append("updated_at = CURRENT_TIMESTAMP")
        upd_params.append(spesa_id)
        fc.execute(f"""
            UPDATE cg_uscite SET {', '.join(upd_sets)}
            WHERE spesa_fissa_id = ?
              AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
        """, upd_params)

    # Per UNA_TANTUM: se cambia data_inizio, propaga la nuova data_scadenza
    # e periodo_riferimento all'uscita (non pagata) generata da questa spesa.
    # Per le frequenze ricorrenti NON si propaga: ci sono piu' uscite e la
    # data_inizio e' solo l'inizio del piano, non la scadenza di ogni rata.
    if "data_inizio" in payload:
        sf_row = fc.execute(
            "SELECT frequenza, data_inizio FROM cg_spese_fisse WHERE id = ?",
            (spesa_id,),
        ).fetchone()
        if sf_row and sf_row["frequenza"] == "UNA_TANTUM" and sf_row["data_inizio"]:
            nuova_data = sf_row["data_inizio"]
            nuovo_periodo = nuova_data[:7]  # YYYY-MM
            fc.execute("""
                UPDATE cg_uscite
                SET data_scadenza = ?,
                    data_fattura = ?,
                    periodo_riferimento = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE spesa_fissa_id = ?
                  AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
            """, (nuova_data, nuova_data, nuovo_periodo, spesa_id))

    fc.commit()
    fc.close()
    return {"ok": True}


@router.delete("/spese-fisse/{spesa_id}")
def delete_spesa_fissa(
    spesa_id: int,
    confirm_riconciliate: bool = Query(default=False, description="Set True per confermare delete con rate riconciliate"),
    current_user=Depends(get_current_user),
):
    """
    Elimina una spesa fissa + cascade su cg_piano_rate + cg_uscite collegate.

    G.1.5 (sessione 2026-05-08): se la spesa ha rate già riconciliate con
    movimenti banca (`banca_movimento_id IS NOT NULL` o stato PAGATO), ritorna
    409 con il conteggio per mostrare warning all'utente. Solo con
    `confirm_riconciliate=True` procede comunque (la riconciliazione si rompe
    e i movimenti banca tornano "non abbinati").
    """
    fc = get_fc_db()
    try:
        # Conta rate riconciliate (PAGATO con banca_movimento_id, o PAGATO_MANUALE/PARZIALE)
        riconciliate = fc.execute(
            """
            SELECT COUNT(*) AS n
            FROM cg_uscite
            WHERE spesa_fissa_id = ?
              AND (
                banca_movimento_id IS NOT NULL
                OR stato IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
              )
            """,
            (spesa_id,),
        ).fetchone()
        n_riconciliate = (riconciliate["n"] if riconciliate else 0) or 0

        if n_riconciliate > 0 and not confirm_riconciliate:
            sf_row = fc.execute("SELECT titolo FROM cg_spese_fisse WHERE id = ?", (spesa_id,)).fetchone()
            titolo = sf_row["titolo"] if sf_row else "?"
            n_uscite = fc.execute(
                "SELECT COUNT(*) AS n FROM cg_uscite WHERE spesa_fissa_id = ?", (spesa_id,)
            ).fetchone()["n"]
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "rate_riconciliate",
                    "titolo": titolo,
                    "n_uscite": n_uscite,
                    "n_riconciliate": n_riconciliate,
                    "msg": (
                        f'"{titolo}" ha {n_uscite} rate, di cui {n_riconciliate} già riconciliate '
                        "con movimenti banca. Eliminandola, la riconciliazione si rompe "
                        "(i movimenti banca torneranno 'non abbinati'). Conferma con "
                        "?confirm_riconciliate=true per procedere."
                    ),
                },
            )

        # Cascade: rimuovi cg_uscite + cg_piano_rate prima di cg_spese_fisse
        fc.execute("DELETE FROM cg_uscite WHERE spesa_fissa_id = ?", (spesa_id,))
        fc.execute("DELETE FROM cg_piano_rate WHERE spesa_fissa_id = ?", (spesa_id,))
        fc.execute("DELETE FROM cg_spese_fisse WHERE id = ?", (spesa_id,))
        fc.commit()
        return {"ok": True, "deleted": spesa_id, "n_uscite_riconciliate_rotte": n_riconciliate}
    except HTTPException:
        fc.rollback()
        raise
    finally:
        fc.close()


# ═══════════════════════════════════════════════════════════════════
# PIANO RATE — rate variabili per spese fisse (prestiti alla francese)
# ═══════════════════════════════════════════════════════════════════

@router.get("/spese-fisse/{spesa_id}/piano-rate")
def get_piano_rate(
    spesa_id: int,
    current_user=Depends(get_current_user),
):
    """
    Restituisce il piano rate di una spesa fissa, arricchito con lo stato
    della corrispondente uscita (pagata / da pagare / scaduta) quando esiste.

    Modulo M.6 (2026-04-27): auto-popolamento. Se la spesa fissa non ha
    ancora cg_piano_rate ma ha gia' cg_uscite generate dal job periodico
    (es. AFFITTO, RATEIZZAZIONE Fondo Est, UTENZA), popola cg_piano_rate
    al volo derivandole dalle uscite. Cosi' il modale Piano funziona per
    OGNI spesa fissa, non solo per i prestiti alla francese.
    """
    fc = get_fc_db()
    try:
        # Meta spesa fissa (titolo, tipo, importo riferimento)
        sf_row = fc.execute(
            "SELECT id, tipo, titolo, importo, data_inizio, data_fine FROM cg_spese_fisse WHERE id = ?",
            (spesa_id,)
        ).fetchone()
        spesa = dict(sf_row) if sf_row else None

        # ── M.6: auto-popolamento da cg_uscite se piano vuoto ──
        n_piano = fc.execute(
            "SELECT COUNT(*) FROM cg_piano_rate WHERE spesa_fissa_id = ?",
            (spesa_id,)
        ).fetchone()[0]
        if n_piano == 0 and spesa is not None:
            uscite_esistenti = fc.execute("""
                SELECT periodo_riferimento, totale, note
                  FROM cg_uscite
                 WHERE spesa_fissa_id = ?
                   AND periodo_riferimento IS NOT NULL
                 ORDER BY periodo_riferimento
            """, (spesa_id,)).fetchall()
            if uscite_esistenti:
                inserite = 0
                for idx, u in enumerate(uscite_esistenti, start=1):
                    periodo = u[0]
                    importo = float(u[1] or 0)
                    note = u[2]
                    # Estrai numero rata da nota se nel formato "Rata N/M"
                    num_rata = idx
                    if note and isinstance(note, str) and note.startswith("Rata "):
                        try:
                            num_rata = int(note.split("/")[0].replace("Rata ", "").strip())
                        except (ValueError, IndexError):
                            num_rata = idx
                    try:
                        fc.execute("""
                            INSERT INTO cg_piano_rate (spesa_fissa_id, numero_rata, periodo, importo, note)
                            VALUES (?, ?, ?, ?, ?)
                        """, (spesa_id, num_rata, periodo, importo, note))
                        inserite += 1
                    except Exception:
                        # Eventuale conflitto unique (spesa_fissa_id+periodo) → skip
                        pass
                if inserite:
                    fc.commit()
                    print(f"  [M.6] auto-popolato cg_piano_rate per spesa_fissa {spesa_id}: {inserite} rate da cg_uscite")

        # Piano rate + LEFT JOIN con cg_uscite (per stato + importo effettivamente pagato)
        # + LEFT JOIN con banca_movimenti (per mostrare stato riconciliazione bidirezionale)
        rows = fc.execute("""
            SELECT
                pr.id, pr.numero_rata, pr.periodo, pr.importo, pr.note,
                u.id                 AS uscita_id,
                u.stato              AS uscita_stato,
                u.data_scadenza      AS uscita_scadenza,
                u.importo_pagato     AS uscita_pagato,
                u.data_pagamento     AS uscita_data_pagamento,
                u.totale             AS uscita_totale,
                u.banca_movimento_id AS banca_movimento_id,
                bm.data_contabile    AS banca_data_contabile,
                bm.importo           AS banca_importo,
                bm.descrizione       AS banca_descrizione,
                bm.ragione_sociale   AS banca_ragione_sociale
            FROM cg_piano_rate pr
            LEFT JOIN cg_uscite u
              ON u.spesa_fissa_id = pr.spesa_fissa_id
             AND u.periodo_riferimento = pr.periodo
            LEFT JOIN banca_movimenti bm
              ON bm.id = u.banca_movimento_id
            WHERE pr.spesa_fissa_id = ?
            ORDER BY pr.periodo
        """, (spesa_id,)).fetchall()

        rate = []
        tot_pianificato = 0.0
        tot_pagato = 0.0
        tot_residuo = 0.0
        n_pagate = 0
        n_da_pagare = 0
        n_scadute = 0
        # Contatori stato riconciliazione
        n_riconciliate = 0
        n_da_collegare = 0
        n_aperte = 0
        for r in rows:
            d = dict(r)
            imp = float(d.get("importo") or 0)
            tot_pianificato += imp
            stato = d.get("uscita_stato")
            if stato in ("PAGATO", "PAGATO_MANUALE"):
                n_pagate += 1
                tot_pagato += float(d.get("uscita_pagato") or 0)
            elif stato == "PARZIALE":
                n_pagate += 1
                tot_pagato += float(d.get("uscita_pagato") or 0)
                tot_residuo += max(float(d.get("uscita_totale") or imp) - float(d.get("uscita_pagato") or 0), 0)
            elif stato == "SCADUTO":
                n_scadute += 1
                tot_residuo += imp
            elif stato == "PROGRAMMATO":
                n_da_pagare += 1
                tot_residuo += imp
            else:
                # Nessuna uscita associata (rata nel piano senza scadenza generata)
                tot_residuo += imp

            # ── Deriva riconciliazione_stato (coerente con frontend StatoRiconciliazioneBadge) ──
            has_mov = d.get("banca_movimento_id") is not None
            if stato is None:
                ric = "aperta"
            elif has_mov:
                ric = "riconciliata"  # "automatica" riservato per futuro matcher
            elif stato == "PAGATO_MANUALE":
                ric = "da_collegare"
            elif stato in ("PAGATO", "PARZIALE"):
                ric = "riconciliata"
            else:
                ric = "aperta"
            d["riconciliazione_stato"] = ric
            if ric == "riconciliata":
                n_riconciliate += 1
            elif ric == "da_collegare":
                n_da_collegare += 1
            else:
                n_aperte += 1

            rate.append(d)

        return {
            "ok": True,
            "spesa": spesa,
            "rate": rate,
            "riepilogo": {
                "n_rate": len(rate),
                "n_pagate": n_pagate,
                "n_da_pagare": n_da_pagare,
                "n_scadute": n_scadute,
                "n_riconciliate": n_riconciliate,
                "n_da_collegare": n_da_collegare,
                "n_aperte": n_aperte,
                "totale_pianificato": round(tot_pianificato, 2),
                "totale_pagato": round(tot_pagato, 2),
                "totale_residuo": round(tot_residuo, 2),
            },
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "rate": []}
    finally:
        fc.close()


@router.post("/spese-fisse/{spesa_id}/piano-rate")
def add_piano_rate(
    spesa_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Aggiunge/aggiorna rate al piano. Accetta singola rata o lista.
    Body: { rate: [{ numero_rata, periodo, importo, scadenza?, note? }] }
    oppure: { numero_rata, periodo, importo, scadenza?, note? }

    Se sync_uscite = true (default), aggiorna anche l'importo (totale) e
    la data_scadenza delle cg_uscite collegate per quel periodo, purché
    non siano già PAGATO / PAGATO_MANUALE / PARZIALE.

    Modulo M.4 (2026-04-27): supporto cambio scadenza. Permette di
    riprogrammare rate scadute spostandone la data. Se una rata era
    SCADUTO e la nuova data è futura → torna a PROGRAMMATO.
    """
    fc = get_fc_db()
    try:
        rate_input = payload.get("rate", [payload] if "periodo" in payload else [])
        sync_uscite = bool(payload.get("sync_uscite", True))
        inserite = 0
        uscite_aggiornate = 0
        scadenze_aggiornate = 0
        oggi_str = date.today().isoformat()
        for r in rate_input:
            periodo = r.get("periodo")
            importo = r.get("importo")
            scadenza = r.get("scadenza")  # YYYY-MM-DD opzionale
            if not periodo or importo is None:
                continue
            # 2026-05-11 bug fix: salvare data_scadenza_specifica in cg_piano_rate
            # quando viene passata scadenza nel payload. Senza questo, un re-import
            # successivo rigenera la data_scadenza di cg_uscite usando il giorno
            # default della spesa fissa (es. 1) e cancella la modifica utente.
            try:
                fc.execute("""
                    INSERT INTO cg_piano_rate (spesa_fissa_id, numero_rata, periodo, importo, note, data_scadenza_specifica)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (spesa_id, r.get("numero_rata", 0), periodo, importo, r.get("note"), scadenza))
                inserite += 1
            except Exception:
                # Duplicato (spesa_fissa_id + periodo) — aggiorna
                # Se scadenza è passata, aggiorna anche data_scadenza_specifica.
                # Se scadenza è None nel payload, NON tocca data_scadenza_specifica
                # esistente (per non perdere eventuale valore già impostato).
                if scadenza:
                    fc.execute("""
                        UPDATE cg_piano_rate
                        SET importo = ?, numero_rata = ?, note = ?, data_scadenza_specifica = ?
                        WHERE spesa_fissa_id = ? AND periodo = ?
                    """, (importo, r.get("numero_rata", 0), r.get("note"), scadenza, spesa_id, periodo))
                else:
                    fc.execute("""
                        UPDATE cg_piano_rate SET importo = ?, numero_rata = ?, note = ?
                        WHERE spesa_fissa_id = ? AND periodo = ?
                    """, (importo, r.get("numero_rata", 0), r.get("note"), spesa_id, periodo))
                inserite += 1

            # Propaga sul tabellone uscite (solo righe non ancora pagate)
            if sync_uscite:
                # Aggiorna importo
                cur = fc.execute("""
                    UPDATE cg_uscite
                       SET totale = ?, updated_at = ?
                     WHERE spesa_fissa_id = ?
                       AND periodo_riferimento = ?
                       AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
                """, (float(importo), oggi_str, spesa_id, periodo))
                uscite_aggiornate += cur.rowcount or 0

                # Modulo M.4: se passata una nuova scadenza, aggiorna data_scadenza
                # e ricalcola lo stato (SCADUTO/PROGRAMMATO in base alla nuova data)
                if scadenza:
                    nuovo_stato = "SCADUTO" if scadenza < oggi_str else "PROGRAMMATO"
                    cur2 = fc.execute("""
                        UPDATE cg_uscite
                           SET data_scadenza = ?,
                               stato = ?,
                               updated_at = ?
                         WHERE spesa_fissa_id = ?
                           AND periodo_riferimento = ?
                           AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
                    """, (scadenza, nuovo_stato, oggi_str, spesa_id, periodo))
                    scadenze_aggiornate += cur2.rowcount or 0
        fc.commit()
        return {
            "ok": True,
            "inserite": inserite,
            "uscite_aggiornate": uscite_aggiornate,
            "scadenze_aggiornate": scadenze_aggiornate,
        }
    finally:
        fc.close()


@router.delete("/spese-fisse/{spesa_id}/piano-rate/{rata_id}")
def delete_piano_rata(
    spesa_id: int,
    rata_id: int,
    current_user=Depends(get_current_user),
):
    """Elimina una singola rata dal piano."""
    fc = get_fc_db()
    fc.execute("DELETE FROM cg_piano_rate WHERE id = ? AND spesa_fissa_id = ?", (rata_id, spesa_id))
    fc.commit()
    fc.close()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# IMPORT CSV PIANO RATE — G.1.5 (sessione 2026-05-08)
# ═══════════════════════════════════════════════════════════════════
# Importa un piano di rateizzazione (Abaco/AdE/PagoPA/F24 rateizzato) da CSV.
# Formato CSV atteso: header Numero,Identificativo,Scadenza,Importo,Stato
#   Numero        → cg_piano_rate.numero_rata (1..N)
#   Identificativo → cg_piano_rate.codice_pagamento (RAV/IUV/numero atto)
#   Scadenza      → DD/MM/YYYY → cg_piano_rate.data_scadenza_specifica (ISO)
#                                + cg_piano_rate.periodo (YYYY-MM)
#   Importo       → cg_piano_rate.importo
#   Stato         → tracciato in note ("Pagata"/"Da pagare" come info iniziale)
#                   ma cg_uscite generate sempre come PROGRAMMATO/SCADUTO
#                   (la riconciliazione vera avverrà dal modulo Banca)
# Crea cg_spese_fisse + N cg_piano_rate. Le cg_uscite sono generate dal
# proiettore standard (chiamare /uscite/import dopo).

def _parse_data_it(s: str) -> Optional[str]:
    """DD/MM/YYYY → YYYY-MM-DD. Ritorna None se invalido."""
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _parse_importo_csv(s: str) -> Optional[float]:
    """Parse importo accettando '211.00' o '211,00' o '1.234,56'. Ritorna None se invalido."""
    s = (s or "").strip().replace("€", "").replace(" ", "")
    if not s:
        return None
    # Heuristica: se contiene sia virgola che punto, il punto è separatore migliaia.
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


@router.post("/spese-fisse/import-csv")
def import_piano_rate_csv(
    file: UploadFile = File(...),
    titolo: str = Form(...),
    tipo: str = Form("RATEIZZAZIONE_TASSE"),
    note: Optional[str] = Form(None),
    iban: Optional[str] = Form(None),
    force: bool = Form(False),
    current_user=Depends(get_current_user),
):
    """
    Importa un piano di rateizzazione da CSV.

    Decisioni di design (sessione 2026-05-08):
    - Tipo default `TASSA` (categoria fiscale generica: cartelle AdE, contribuzioni,
      F24 rateizzato). Distinzione fine via `titolo` + `codice_pagamento`.
    - Stato cg_uscite generate sempre PROGRAMMATO/SCADUTO — riconciliazione successiva
      coi movimenti banca evita doppia contabilizzazione.
    - Duplicate detection light: se almeno 1 dei primi 3 codici_pagamento è già
      presente in DB → 409 (a meno di force=True). No merge intelligente: l'utente
      cancella + reimporta in caso di sostituzione piano.

    Body multipart:
      file       — CSV (header: Numero,Identificativo,Scadenza,Importo,Stato)
      titolo     — string libera (es. "Rateizzazione Abaco — atto X")
      tipo       — uno di {AFFITTO, ASSICURAZIONE, PRESTITO, RATEIZZAZIONE, TASSA, ALTRO}
      note       — opzionale, va in cg_spese_fisse.note
      iban       — opzionale, va in cg_spese_fisse.iban
      force      — bool default False; True = bypass check duplicate

    Risposta:
      201 → {ok, spesa_fissa_id, n_rate, totale, prima_scadenza, ultima_scadenza,
             gia_scadute, future, in_csv_pagate}
      400 → CSV malformato / dati invalidi
      409 → {detail: "duplicate", existing_spesa_id, codici_match} (se force=False)
    """
    if not is_admin(current_user.get("role", "")):
        raise HTTPException(status_code=403, detail="Solo admin può importare piani")

    # ── 1. Validazione tipo ──
    VALID_TIPI = {"AFFITTO", "ASSICURAZIONE", "PRESTITO", "RATEIZZAZIONE", "RATEIZZAZIONE_TASSE", "TASSA", "F24_STIPENDI", "ALTRO"}
    if tipo not in VALID_TIPI:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo non valido: {tipo!r}. Valori ammessi: {sorted(VALID_TIPI)}",
        )

    titolo_clean = (titolo or "").strip()
    if not titolo_clean:
        raise HTTPException(status_code=400, detail="Titolo obbligatorio")

    # ── 2. Parsing CSV ──
    try:
        raw = file.file.read()
    finally:
        file.file.close()

    # Tenta UTF-8, fallback su cp1252/latin1 per CSV tipici da Windows/Excel italiano
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise HTTPException(status_code=400, detail="Encoding CSV non riconosciuto")

    # G.1.5 — Filtra righe di commento (template CSV TRGB usa # come prefisso)
    text_filtered = "\n".join(
        ln for ln in text.splitlines() if not ln.lstrip().startswith("#")
    )

    # Detect delimiter (comma o semicolon)
    sample = text_filtered[:2048]
    delimiter = ","
    if sample.count(";") > sample.count(","):
        delimiter = ";"

    reader = csv.DictReader(io.StringIO(text_filtered), delimiter=delimiter)
    headers_csv = [h.strip() for h in (reader.fieldnames or [])]
    REQUIRED = ["Numero", "Identificativo", "Scadenza", "Importo", "Stato"]
    missing = [h for h in REQUIRED if h not in headers_csv]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV header mancanti: {missing}. Header trovati: {headers_csv}",
        )

    # ── 3. Parse righe ──
    rate_parsed = []
    errors = []
    for i, row in enumerate(reader, start=2):  # start=2 perché riga 1 è header
        numero_raw = (row.get("Numero") or "").strip()
        codice = (row.get("Identificativo") or "").strip()
        scad_raw = (row.get("Scadenza") or "").strip()
        importo_raw = (row.get("Importo") or "").strip()
        stato_csv = (row.get("Stato") or "").strip()

        try:
            numero_rata = int(numero_raw)
        except ValueError:
            errors.append(f"riga {i}: Numero non intero ({numero_raw!r})")
            continue

        data_scad = _parse_data_it(scad_raw)
        if not data_scad:
            errors.append(f"riga {i}: Scadenza non parsabile ({scad_raw!r})")
            continue

        importo = _parse_importo_csv(importo_raw)
        if importo is None or importo <= 0:
            errors.append(f"riga {i}: Importo non valido ({importo_raw!r})")
            continue

        periodo = data_scad[:7]  # YYYY-MM
        rate_parsed.append({
            "numero_rata": numero_rata,
            "codice_pagamento": codice or None,
            "data_scadenza_specifica": data_scad,
            "periodo": periodo,
            "importo": importo,
            "stato_csv": stato_csv,
        })

    if errors:
        raise HTTPException(
            status_code=400,
            detail={"errors": errors[:20], "tot_errors": len(errors)},
        )
    if not rate_parsed:
        raise HTTPException(status_code=400, detail="CSV vuoto o senza righe valide")

    # Ordina per numero_rata e verifica unicità
    rate_parsed.sort(key=lambda r: r["numero_rata"])
    nums = [r["numero_rata"] for r in rate_parsed]
    if len(set(nums)) != len(nums):
        raise HTTPException(status_code=400, detail="Numero rata duplicato nel CSV")

    fc = get_fc_db()
    try:
        # ── 4. Duplicate detection (sui primi 3 codici se valorizzati) ──
        codici_check = [r["codice_pagamento"] for r in rate_parsed[:3] if r["codice_pagamento"]]
        if codici_check and not force:
            placeholders = ",".join("?" * len(codici_check))
            existing = fc.execute(
                f"""
                SELECT DISTINCT pr.spesa_fissa_id, sf.titolo
                FROM cg_piano_rate pr
                JOIN cg_spese_fisse sf ON pr.spesa_fissa_id = sf.id
                WHERE pr.codice_pagamento IN ({placeholders})
                """,
                codici_check,
            ).fetchall()
            if existing:
                ex_list = [{"spesa_fissa_id": r["spesa_fissa_id"], "titolo": r["titolo"]} for r in existing]
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "duplicate",
                        "msg": "Esiste già un piano con codici di pagamento in comune. Usa force=true per importare comunque (creerà un duplicato).",
                        "existing": ex_list,
                        "codici_match": codici_check,
                    },
                )

        # ── 5. Crea cg_spese_fisse ──
        prima_scad = rate_parsed[0]["data_scadenza_specifica"]
        ultima_scad = rate_parsed[-1]["data_scadenza_specifica"]
        importo_medio = round(sum(r["importo"] for r in rate_parsed) / len(rate_parsed), 2)
        importo_totale = round(sum(r["importo"] for r in rate_parsed), 2)
        oggi_str = date.today().isoformat()

        # giorno_scadenza approssimativo (per uniformità con UI esistente, ma il
        # proiettore userà data_scadenza_specifica della singola rata)
        try:
            giorno_riferimento = int(prima_scad.split("-")[2])
        except (ValueError, IndexError):
            giorno_riferimento = 1

        cur = fc.execute(
            """
            INSERT INTO cg_spese_fisse (
                tipo, titolo, descrizione, importo, frequenza,
                giorno_scadenza, data_inizio, data_fine, attiva,
                note, iban, importo_originale, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'MENSILE', ?, ?, ?, 1, ?, ?, ?, ?, ?)
            """,
            (
                tipo,
                titolo_clean,
                f"Piano da CSV — {len(rate_parsed)} rate (totale {importo_totale:.2f}€)",
                importo_medio,
                giorno_riferimento,
                prima_scad,
                ultima_scad,
                note,
                (iban or "").strip() or None,
                importo_totale,
                oggi_str,
                oggi_str,
            ),
        )
        spesa_id = cur.lastrowid

        # ── 6. Crea cg_piano_rate ──
        n_csv_pagate = 0
        for r in rate_parsed:
            stato_csv = r["stato_csv"]
            if stato_csv.lower().startswith("pag"):
                n_csv_pagate += 1
            note_rata = f"Rata {r['numero_rata']}/{len(rate_parsed)}"
            if stato_csv:
                note_rata += f" — CSV: {stato_csv}"

            try:
                fc.execute(
                    """
                    INSERT INTO cg_piano_rate (
                        spesa_fissa_id, numero_rata, periodo, importo, note,
                        data_scadenza_specifica, codice_pagamento
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        spesa_id,
                        r["numero_rata"],
                        r["periodo"],
                        r["importo"],
                        note_rata,
                        r["data_scadenza_specifica"],
                        r["codice_pagamento"],
                    ),
                )
            except sqlite3.IntegrityError as e:
                # UNIQUE(spesa_fissa_id, periodo) — può capitare se più rate cadono
                # nello stesso mese (raro ma possibile). Aggiungiamo suffisso al periodo.
                periodo_unique = f"{r['periodo']}-r{r['numero_rata']}"
                fc.execute(
                    """
                    INSERT INTO cg_piano_rate (
                        spesa_fissa_id, numero_rata, periodo, importo, note,
                        data_scadenza_specifica, codice_pagamento
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        spesa_id,
                        r["numero_rata"],
                        periodo_unique,
                        r["importo"],
                        note_rata + f" [periodo dup mese {r['periodo']}]",
                        r["data_scadenza_specifica"],
                        r["codice_pagamento"],
                    ),
                )

        fc.commit()

        # ── 7. Conteggi finali ──
        gia_scadute = sum(1 for r in rate_parsed if r["data_scadenza_specifica"] < oggi_str)
        future = len(rate_parsed) - gia_scadute

        return {
            "ok": True,
            "spesa_fissa_id": spesa_id,
            "n_rate": len(rate_parsed),
            "totale": importo_totale,
            "importo_medio": importo_medio,
            "prima_scadenza": prima_scad,
            "ultima_scadenza": ultima_scad,
            "gia_scadute": gia_scadute,
            "future": future,
            "in_csv_pagate": n_csv_pagate,
            "tipo": tipo,
            "titolo": titolo_clean,
            "msg": (
                f"Piano '{titolo_clean}' creato con {len(rate_parsed)} rate "
                f"(totale {importo_totale:.2f}€). "
                f"Lancia /uscite/import per generare lo scadenziario."
            ),
        }
    except HTTPException:
        fc.rollback()
        raise
    except Exception as e:
        fc.rollback()
        raise HTTPException(status_code=500, detail=f"Errore import CSV: {e}")
    finally:
        fc.close()


# ═══════════════════════════════════════════════════════════════════
# STORICO SPESA FISSA — per spese fisse senza piano rate (affitti, utenze, ...)
# Fornisce la lista degli addebiti passati (cg_uscite) con stato riconciliazione
# ═══════════════════════════════════════════════════════════════════

@router.get("/spese-fisse/{spesa_id}/storico")
def get_storico_spesa_fissa(
    spesa_id: int,
    current_user=Depends(get_current_user),
):
    """
    Restituisce lo storico delle cg_uscite collegate a una spesa fissa
    (usabile per affitti / spese ricorrenti senza piano rate).
    Ogni riga include lo stato di riconciliazione bancaria derivato.
    """
    fc = get_fc_db()
    try:
        sf_row = fc.execute(
            "SELECT id, tipo, titolo, importo, data_inizio, data_fine FROM cg_spese_fisse WHERE id = ?",
            (spesa_id,)
        ).fetchone()
        spesa = dict(sf_row) if sf_row else None

        rows = fc.execute("""
            SELECT
                u.id                 AS uscita_id,
                u.periodo_riferimento,
                u.data_scadenza      AS uscita_scadenza,
                u.data_pagamento     AS uscita_data_pagamento,
                u.stato              AS uscita_stato,
                u.totale             AS uscita_totale,
                u.importo_pagato     AS uscita_pagato,
                u.banca_movimento_id AS banca_movimento_id,
                bm.data_contabile    AS banca_data_contabile,
                bm.importo           AS banca_importo,
                bm.descrizione       AS banca_descrizione,
                bm.ragione_sociale   AS banca_ragione_sociale
            FROM cg_uscite u
            LEFT JOIN banca_movimenti bm ON bm.id = u.banca_movimento_id
            WHERE u.spesa_fissa_id = ?
            ORDER BY COALESCE(u.data_scadenza, u.periodo_riferimento) DESC
        """, (spesa_id,)).fetchall()

        storico = []
        n_riconciliate = 0
        n_da_collegare = 0
        n_aperte = 0
        tot_pagato = 0.0
        tot_pianificato = 0.0
        for r in rows:
            d = dict(r)
            imp = float(d.get("uscita_totale") or 0)
            tot_pianificato += imp
            stato = d.get("uscita_stato")
            if stato in ("PAGATO", "PAGATO_MANUALE", "PARZIALE"):
                tot_pagato += float(d.get("uscita_pagato") or 0)

            has_mov = d.get("banca_movimento_id") is not None
            if stato is None:
                ric = "aperta"
            elif has_mov:
                ric = "riconciliata"
            elif stato == "PAGATO_MANUALE":
                ric = "da_collegare"
            elif stato in ("PAGATO", "PARZIALE"):
                ric = "riconciliata"
            else:
                ric = "aperta"
            d["riconciliazione_stato"] = ric
            if ric == "riconciliata":
                n_riconciliate += 1
            elif ric == "da_collegare":
                n_da_collegare += 1
            else:
                n_aperte += 1

            storico.append(d)

        return {
            "ok": True,
            "spesa": spesa,
            "storico": storico,
            "riepilogo": {
                "n_uscite": len(storico),
                "n_riconciliate": n_riconciliate,
                "n_da_collegare": n_da_collegare,
                "n_aperte": n_aperte,
                "totale_pianificato": round(tot_pianificato, 2),
                "totale_pagato": round(tot_pagato, 2),
            },
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "storico": []}
    finally:
        fc.close()


# ═══════════════════════════════════════════════════════════════════
# RICONCILIAZIONE BANCA — match uscite ↔ movimenti bancari
# ═══════════════════════════════════════════════════════════════════

@router.get("/uscite/{uscita_id}/candidati-banca")
def get_candidati_banca(
    uscita_id: int,
    current_user=Depends(get_current_user),
):
    """
    Dato un'uscita, trova movimenti bancari candidati al match.
    Criteri: importo ±5%, data ±15gg dalla scadenza (o data fattura).
    Restituisce max 10 candidati ordinati per vicinanza importo.
    """
    fc = get_fc_db()

    uscita = fc.execute("SELECT * FROM cg_uscite WHERE id = ?", (uscita_id,)).fetchone()
    if not uscita:
        fc.close()
        return {"ok": False, "error": "Uscita non trovata"}

    u = dict(uscita)
    importo = abs(u["totale"] or 0)
    # Usa data_pagamento se presente, altrimenti data_scadenza, altrimenti data_fattura
    data_rif = u.get("data_pagamento") or u.get("data_scadenza") or u.get("data_fattura")

    if importo == 0:
        fc.close()
        return {"ok": True, "candidati": [], "msg": "Importo zero, nessun match possibile"}

    # Movimenti bancari in USCITA (importo negativo) — match con ABS
    query = """
        SELECT m.*,
               ABS(ABS(m.importo) - ?) AS diff_importo,
               CASE WHEN ? IS NOT NULL
                    THEN ABS(JULIANDAY(m.data_contabile) - JULIANDAY(?))
                    ELSE 999 END AS diff_giorni
        FROM banca_movimenti m
        LEFT JOIN cg_uscite u2 ON u2.banca_movimento_id = m.id
        WHERE m.importo < 0
          AND ABS(ABS(m.importo) - ?) / MAX(?, 0.01) < 0.10
          AND u2.id IS NULL
    """
    params = [importo, data_rif, data_rif, importo, importo]

    if data_rif:
        query += " AND m.data_contabile BETWEEN date(?, '-15 days') AND date(?, '+15 days')"
        params.extend([data_rif, data_rif])

    query += " ORDER BY diff_importo ASC, diff_giorni ASC LIMIT 10"

    candidati = fc.execute(query, params).fetchall()

    rows = []
    for c in candidati:
        cd = dict(c)
        cd["importo_abs"] = abs(cd["importo"])
        cd["match_pct"] = round(100 - (cd["diff_importo"] / max(importo, 0.01) * 100), 1)
        rows.append(cd)

    fc.close()
    return {
        "ok": True,
        "uscita": {
            "id": u["id"],
            "fornitore_nome": u["fornitore_nome"],
            "totale": u["totale"],
            "data_scadenza": u.get("data_scadenza"),
            "data_pagamento": u.get("data_pagamento"),
            "stato": u["stato"],
        },
        "candidati": rows,
    }


# ── Worklist "Da riconciliare": uscite PAGATO_MANUALE senza movimento collegato ──
@router.get("/uscite/da-riconciliare")
def get_uscite_da_riconciliare(
    limit: int = 200,
    canale: str = "banca",
    current_user=Depends(get_current_user),
):
    """
    Worklist per il Workbench di riconciliazione, filtrabile per canale.

    Parametri:
      canale = "banca" (default) | "carta" | "contanti"
        - banca:    uscite PAGATO_MANUALE senza banca_movimento_id
                    E metodo_pagamento NON in ('CARTA','CONTANTI')
                    (cioe' pagamenti tipo bonifico/conto corrente/assegno/NULL)
        - carta:    uscite PAGATO_MANUALE con metodo_pagamento='CARTA'
                    (predisposizione per il futuro modulo Carta di Credito
                    che collegherà gli estratti carta ai cg_uscite)
        - contanti: uscite pagate in contanti (metodo_pagamento='CONTANTI').
                    Di norma sono già PAGATO automatiche, ma possono esserci
                    edge case in PAGATO_MANUALE.

    Restituisce righe ordinate per data pagamento desc.
    """
    fc = get_fc_db()
    try:
        canale = (canale or "banca").lower()
        if canale == "carta":
            where = (
                "u.stato = 'PAGATO_MANUALE' "
                "AND u.banca_movimento_id IS NULL "
                "AND u.metodo_pagamento = 'CARTA'"
            )
        elif canale == "contanti":
            where = (
                "u.stato = 'PAGATO_MANUALE' "
                "AND u.banca_movimento_id IS NULL "
                "AND u.metodo_pagamento = 'CONTANTI'"
            )
        else:
            # default "banca": esclude CARTA e CONTANTI (questi hanno il loro canale)
            canale = "banca"
            where = (
                "u.stato = 'PAGATO_MANUALE' "
                "AND u.banca_movimento_id IS NULL "
                "AND (u.metodo_pagamento IS NULL "
                "     OR u.metodo_pagamento NOT IN ('CARTA','CONTANTI'))"
            )

        rows = fc.execute(f"""
            SELECT
                u.id, u.stato, u.totale, u.importo_pagato,
                u.data_fattura, u.data_scadenza, u.data_pagamento,
                u.fornitore_nome, u.periodo_riferimento, u.metodo_pagamento,
                u.fattura_id, u.spesa_fissa_id, u.banca_movimento_id,
                sf.titolo AS spesa_fissa_titolo,
                sf.tipo   AS spesa_fissa_tipo
            FROM cg_uscite u
            LEFT JOIN cg_spese_fisse sf ON sf.id = u.spesa_fissa_id
            WHERE {where}
            ORDER BY COALESCE(u.data_pagamento, u.data_scadenza) DESC, u.id DESC
            LIMIT ?
        """, (limit,)).fetchall()

        uscite = []
        for r in rows:
            d = dict(r)
            d["riconciliazione_stato"] = "da_collegare"
            uscite.append(d)

        # Conta totale (per mostrare badge/KPI anche quando limit tronca)
        total = fc.execute(f"""
            SELECT COUNT(*) AS c
            FROM cg_uscite u
            WHERE {where}
        """).fetchone()
        totale = int(total["c"] if total else 0)

        return {
            "ok": True,
            "uscite": uscite,
            "totale": totale,
            "limit": limit,
            "canale": canale,
        }
    finally:
        fc.close()


# ── Ricerca libera movimenti bancari per una uscita (filtri q/data/importo) ──
@router.get("/uscite/{uscita_id}/ricerca-banca")
def ricerca_banca_libera(
    uscita_id: int,
    q: str = "",
    data_da: str = "",
    data_a: str = "",
    importo_min: float = 0,
    importo_max: float = 0,
    limit: int = 50,
    current_user=Depends(get_current_user),
):
    """
    Ricerca libera di movimenti bancari candidati per una specifica uscita.
    Esclude movimenti già riconciliati (collegati ad altre cg_uscite).
    Filtri: testo libero su descrizione/ragione_sociale, range date, range importo.
    """
    fc = get_fc_db()
    try:
        u_row = fc.execute("SELECT * FROM cg_uscite WHERE id = ?", (uscita_id,)).fetchone()
        if not u_row:
            return {"ok": False, "error": "Uscita non trovata", "movimenti": []}
        u = dict(u_row)

        query = """
            SELECT m.*
            FROM banca_movimenti m
            LEFT JOIN cg_uscite u2 ON u2.banca_movimento_id = m.id
            WHERE m.importo < 0
              AND u2.id IS NULL
        """
        params = []

        if q and q.strip():
            like = f"%{q.strip()}%"
            query += " AND (m.descrizione LIKE ? OR m.ragione_sociale LIKE ?)"
            params.extend([like, like])

        if data_da:
            query += " AND m.data_contabile >= ?"
            params.append(data_da)
        if data_a:
            query += " AND m.data_contabile <= ?"
            params.append(data_a)

        if importo_min and importo_min > 0:
            query += " AND ABS(m.importo) >= ?"
            params.append(importo_min)
        if importo_max and importo_max > 0:
            query += " AND ABS(m.importo) <= ?"
            params.append(importo_max)

        query += " ORDER BY m.data_contabile DESC LIMIT ?"
        params.append(int(limit))

        rows = fc.execute(query, params).fetchall()
        movimenti = []
        for r in rows:
            d = dict(r)
            d["importo_abs"] = abs(d["importo"] or 0)
            movimenti.append(d)

        return {
            "ok": True,
            "uscita": {
                "id": u["id"],
                "fornitore_nome": u.get("fornitore_nome"),
                "totale": u.get("totale"),
                "data_scadenza": u.get("data_scadenza"),
                "data_pagamento": u.get("data_pagamento"),
                "stato": u.get("stato"),
            },
            "movimenti": movimenti,
            "count": len(movimenti),
        }
    finally:
        fc.close()


# ── Modifica scadenza singola uscita (B.2: smart dispatcher v2.0) ──
@router.put("/uscite/{uscita_id}/scadenza")
def modifica_scadenza(
    uscita_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Cambia la data_scadenza di un'uscita — smart dispatcher v2.0.

    Body: { data_scadenza: "YYYY-MM-DD" }

    Logica dispatcher (v2.0 "CG come aggregatore"):
    - Se l'uscita è di tipo FATTURA ed è linkata a fe_fatture.id,
      la nuova scadenza viene scritta su `fe_fatture.data_prevista_pagamento`
      (nuovo campo v2.0, source of truth per le fatture).
      `cg_uscite.data_scadenza` NON viene toccata: la query di lettura
      (GET /uscite) la ricava via COALESCE chain preferendo
      `data_prevista_pagamento` su `u.data_scadenza`.
    - Per tutti gli altri tipi (SPESA_FISSA, SPESA_BANCARIA, STIPENDIO,
      ALTRO) la scadenza viene scritta direttamente su
      `cg_uscite.data_scadenza` (comportamento legacy).

    Nota: cg_piano_rate NON ha una colonna data_scadenza, quindi per le
    rate delle spese fisse la scadenza effettiva vive in cg_uscite.

    In entrambi i rami, lo stato di workflow (`cg_uscite.stato`) viene
    ricalcolato rispetto a oggi: SCADUTO se nuova < oggi, altrimenti
    PROGRAMMATO (solo quando lo stato attuale è PROGRAMMATO o SCADUTO).

    Se lo spostamento rispetto alla data originale è > 10 giorni,
    il frontend lo mostrerà come 'arretrato'. Il delta è calcolato
    rispetto a `cg_uscite.data_scadenza_originale` (il primo valore
    scritto pre-override, XML o fallback fornitore).
    """
    nuova = payload.get("data_scadenza")
    if not nuova:
        return {"ok": False, "error": "data_scadenza obbligatoria"}

    conn = get_fc_db()
    try:
        row = conn.execute("""
            SELECT
                u.id, u.data_scadenza, u.data_scadenza_originale, u.stato,
                u.tipo_uscita, u.fattura_id,
                f.data_prevista_pagamento, f.data_scadenza AS fe_data_scadenza
            FROM cg_uscite u
            LEFT JOIN fe_fatture f ON u.fattura_id = f.id
            WHERE u.id = ?
        """, [uscita_id]).fetchone()
        if not row:
            return {"ok": False, "error": "Uscita non trovata"}

        # Non permettere modifica se già pagata via banca
        if row["stato"] == "PAGATO":
            return {"ok": False, "error": "Impossibile modificare: uscita già riconciliata con banca"}

        tipo_uscita = (row["tipo_uscita"] or "FATTURA")
        fattura_id = row["fattura_id"]
        is_fattura_v2 = (tipo_uscita == "FATTURA" and fattura_id is not None)

        # Data "originale" per calcolo delta:
        #  - per FATTURE in v2.0 preferisci: data XML fattura → data originale cg_uscite → data attuale
        #  - per non-FATTURE: data_scadenza_originale cg_uscite → data attuale
        if is_fattura_v2:
            originale = row["fe_data_scadenza"] or row["data_scadenza_originale"] or row["data_scadenza"]
        else:
            originale = row["data_scadenza_originale"] or row["data_scadenza"]

        # ── DISPATCH ──
        if is_fattura_v2:
            # v2.0: scrivi su fe_fatture.data_prevista_pagamento, NON su cg_uscite.data_scadenza
            conn.execute("""
                UPDATE fe_fatture
                SET data_prevista_pagamento = ?
                WHERE id = ?
            """, [nuova, fattura_id])
            fonte_modifica = "fe_fatture.data_prevista_pagamento"
        else:
            # Legacy: scrivi su cg_uscite.data_scadenza + traccia originale
            conn.execute("""
                UPDATE cg_uscite
                SET data_scadenza = ?,
                    data_scadenza_originale = COALESCE(data_scadenza_originale, data_scadenza),
                    updated_at = datetime('now')
                WHERE id = ?
            """, [nuova, uscita_id])
            fonte_modifica = "cg_uscite.data_scadenza"

        # Ricalcola stato workflow (G.7, 2026-05-10):
        # - Se nuova data ≠ originale → stato = SPOSTATO (riprogrammazione esplicita)
        # - Se nuova data = originale → torna allo stato derivato da data (PROGRAMMATO/SCADUTO)
        # Non tocca VERIFICARE/PARZIALE/RATEIZZATO/PAGATO (stati espliciti utente o riconciliazione).
        oggi = date.today().isoformat()
        if originale and nuova != originale and row["stato"] in ("PROGRAMMATO", "SCADUTO", "SPOSTATO"):
            # La scadenza è stata spostata rispetto all'originale → SPOSTATO
            conn.execute("UPDATE cg_uscite SET stato = 'SPOSTATO', updated_at = datetime('now') WHERE id = ?", [uscita_id])
        elif originale and nuova == originale and row["stato"] == "SPOSTATO":
            # La scadenza è tornata uguale all'originale → ricalcolo
            nuovo_st = "SCADUTO" if nuova < oggi else "PROGRAMMATO"
            conn.execute("UPDATE cg_uscite SET stato = ?, updated_at = datetime('now') WHERE id = ?", [nuovo_st, uscita_id])
        elif nuova < oggi and row["stato"] == "PROGRAMMATO":
            conn.execute("UPDATE cg_uscite SET stato = 'SCADUTO', updated_at = datetime('now') WHERE id = ?", [uscita_id])
        elif nuova >= oggi and row["stato"] == "SCADUTO":
            conn.execute("UPDATE cg_uscite SET stato = 'PROGRAMMATO', updated_at = datetime('now') WHERE id = ?", [uscita_id])

        conn.commit()

        # Calcola delta giorni dall'originale (XML/originale, non da u.data_scadenza attuale)
        delta_giorni = 0
        if originale:
            try:
                d_orig = date.fromisoformat(originale)
                d_nuova = date.fromisoformat(nuova)
                delta_giorni = (d_nuova - d_orig).days
            except ValueError:
                pass

        return {
            "ok": True,
            "data_scadenza": nuova,
            "data_scadenza_originale": originale,
            "delta_giorni": delta_giorni,
            "is_arretrato": abs(delta_giorni) > 10,
            "fonte_modifica": fonte_modifica,  # debug/tracciamento v2.0
        }
    finally:
        conn.close()


# ── G.7 — Ripristina data originale (per stato SPOSTATO) ──
@router.put("/uscite/{uscita_id}/ripristina-data")
def ripristina_data_originale(
    uscita_id: int,
    current_user=Depends(get_current_user),
):
    """
    Ripristina la data_scadenza all'originale (data_scadenza_originale).
    Usato per annullare uno SPOSTATO precedente.

    Effetti:
    - cg_uscite.data_scadenza ← data_scadenza_originale
    - cg_uscite.stato ← PROGRAMMATO o SCADUTO (in base alla data)
    - cg_uscite.data_scadenza_originale ← NULL (torna a "mai spostata")

    Se l'uscita è una FATTURA (v2.0), pulisce anche fe_fatture.data_prevista_pagamento
    per coerenza (la VIEW lettura ritornerà al COALESCE su fe_fatture.data_scadenza).

    Non permette il ripristino se:
    - Non c'è data_scadenza_originale (mai spostata) → 400
    - Stato è PAGATO (riconciliata banca) → 400
    """
    conn = get_fc_db()
    try:
        row = conn.execute("""
            SELECT u.id, u.data_scadenza, u.data_scadenza_originale, u.stato,
                   u.tipo_uscita, u.fattura_id
            FROM cg_uscite u WHERE u.id = ?
        """, [uscita_id]).fetchone()
        if not row:
            return {"ok": False, "error": "Uscita non trovata"}
        if not row["data_scadenza_originale"]:
            return {"ok": False, "error": "Nessuna scadenza originale registrata (mai spostata)"}
        if row["stato"] == "PAGATO":
            return {"ok": False, "error": "Impossibile ripristinare: uscita già riconciliata"}

        originale = row["data_scadenza_originale"]
        oggi = date.today().isoformat()
        nuovo_stato = "SCADUTO" if originale < oggi else "PROGRAMMATO"

        # Reset cg_uscite
        conn.execute("""
            UPDATE cg_uscite
            SET data_scadenza = ?,
                data_scadenza_originale = NULL,
                stato = ?,
                updated_at = datetime('now')
            WHERE id = ?
        """, [originale, nuovo_stato, uscita_id])

        # Se fattura v2.0, pulisce anche data_prevista_pagamento
        if row["tipo_uscita"] == "FATTURA" and row["fattura_id"]:
            conn.execute("""
                UPDATE fe_fatture SET data_prevista_pagamento = NULL WHERE id = ?
            """, [row["fattura_id"]])

        conn.commit()
        return {
            "ok": True,
            "data_scadenza": originale,
            "nuovo_stato": nuovo_stato,
            "msg": f"Scadenza ripristinata a {originale}",
        }
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════
# B.3 — SMART DISPATCHER IBAN + MODALITÀ PAGAMENTO (v2.0)
# ═══════════════════════════════════════════════════════════════════
#
# Simmetrico a B.2: override di IBAN e modalità pagamento per una
# singola uscita. La scrittura va sulla fonte di verità corretta in
# base al tipo di uscita:
#
#   FATTURA  → fe_fatture.iban_beneficiario / .modalita_pagamento_override
#   SPESA_FISSA → cg_spese_fisse.iban  (solo IBAN; niente mp override)
#   STIPENDIO/ALTRO/SPESA_BANCARIA → non supportato (422)
#
# Il payload ritornato include `fonte_modifica` per tracciamento.
# Passare `null` (o stringa vuota) come valore pulisce l'override.

def _normalize_iban(raw):
    """Normalizza un IBAN: upper, strip, rimuovi spazi. None/"" → None."""
    if raw is None:
        return None
    s = str(raw).strip().upper().replace(" ", "")
    return s or None


def _normalize_mp_code(raw):
    """Normalizza un codice modalità pagamento (MP01..MP23). None/"" → None."""
    if raw is None:
        return None
    s = str(raw).strip().upper()
    return s or None


@router.put("/uscite/{uscita_id}/iban")
def modifica_iban(
    uscita_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Cambia l'IBAN beneficiario di un'uscita — smart dispatcher v2.0.

    Body: { iban: "IT60X..." | null }

    Logica dispatcher:
    - FATTURA con `fattura_id` → `fe_fatture.iban_beneficiario`
    - SPESA_FISSA con `spesa_fissa_id` → `cg_spese_fisse.iban`
    - Altri tipi (STIPENDIO/ALTRO/SPESA_BANCARIA) → 422 non supportato
      (non c'è una fonte stabile dove persistere l'IBAN per queste;
      vanno editati direttamente dove sono stati creati)

    Passare `null` o stringa vuota pulisce l'override.
    """
    iban = _normalize_iban(payload.get("iban"))
    conn = get_fc_db()
    try:
        row = conn.execute("""
            SELECT u.id, u.tipo_uscita, u.fattura_id, u.spesa_fissa_id, u.stato
            FROM cg_uscite u
            WHERE u.id = ?
        """, [uscita_id]).fetchone()
        if not row:
            return {"ok": False, "error": "Uscita non trovata"}
        if row["stato"] == "PAGATO":
            return {"ok": False, "error": "Impossibile modificare: uscita già riconciliata con banca"}

        tipo_uscita = (row["tipo_uscita"] or "FATTURA")
        fattura_id = row["fattura_id"]
        spesa_fissa_id = row["spesa_fissa_id"]

        if tipo_uscita == "FATTURA" and fattura_id is not None:
            conn.execute(
                "UPDATE fe_fatture SET iban_beneficiario = ? WHERE id = ?",
                [iban, fattura_id],
            )
            fonte_modifica = "fe_fatture.iban_beneficiario"
        elif tipo_uscita == "SPESA_FISSA" and spesa_fissa_id is not None:
            conn.execute(
                "UPDATE cg_spese_fisse SET iban = ?, updated_at = datetime('now') WHERE id = ?",
                [iban, spesa_fissa_id],
            )
            fonte_modifica = "cg_spese_fisse.iban"
        else:
            return {
                "ok": False,
                "error": f"IBAN override non supportato per tipo_uscita={tipo_uscita} "
                         f"(fattura_id={fattura_id}, spesa_fissa_id={spesa_fissa_id})",
            }

        conn.commit()
        return {
            "ok": True,
            "iban": iban,
            "fonte_modifica": fonte_modifica,
        }
    finally:
        conn.close()


@router.put("/uscite/{uscita_id}/modalita-pagamento")
def modifica_modalita_pagamento(
    uscita_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Cambia la modalità di pagamento (codice SEPA MP01..MP23) di un'uscita.

    Body: { modalita_pagamento: "MP05" | null }

    Logica dispatcher:
    - FATTURA con `fattura_id` → `fe_fatture.modalita_pagamento_override`
      (il campo XML originale `fe_fatture.modalita_pagamento` resta
      intoccato; l'override ha precedenza nella COALESCE chain lato GET)
    - Altri tipi → 422 non supportato: per le spese fisse la modalità
      è implicita/non modellata a livello SEPA; per stipendi/altri non
      c'è proprio il concetto di codice MP

    Passare `null` o stringa vuota rimuove l'override (la query tornerà
    a mostrare il valore XML o il default fornitore).
    """
    mp = _normalize_mp_code(payload.get("modalita_pagamento"))
    conn = get_fc_db()
    try:
        row = conn.execute("""
            SELECT u.id, u.tipo_uscita, u.fattura_id, u.stato
            FROM cg_uscite u
            WHERE u.id = ?
        """, [uscita_id]).fetchone()
        if not row:
            return {"ok": False, "error": "Uscita non trovata"}
        if row["stato"] == "PAGATO":
            return {"ok": False, "error": "Impossibile modificare: uscita già riconciliata con banca"}

        tipo_uscita = (row["tipo_uscita"] or "FATTURA")
        fattura_id = row["fattura_id"]

        if tipo_uscita == "FATTURA" and fattura_id is not None:
            conn.execute(
                "UPDATE fe_fatture SET modalita_pagamento_override = ? WHERE id = ?",
                [mp, fattura_id],
            )
            fonte_modifica = "fe_fatture.modalita_pagamento_override"
        else:
            return {
                "ok": False,
                "error": f"Modalità pagamento override non supportato per tipo_uscita={tipo_uscita} "
                         f"(solo FATTURA con fattura_id valorizzato)",
            }

        conn.commit()
        return {
            "ok": True,
            "modalita_pagamento": mp,
            "modalita_pagamento_label": MP_LABELS.get(mp, mp) if mp else None,
            "fonte_modifica": fonte_modifica,
        }
    finally:
        conn.close()


# ── Segna pagate bulk ──────────────────────────────────────────
@router.post("/uscite/segna-pagate-bulk")
def segna_pagate_bulk(
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Segna più uscite come pagate in un colpo solo.
    Body: { ids: [int], metodo_pagamento: str, data_pagamento?: str }

    - CONTANTI → stato = PAGATO (il modulo contanti è la riconciliazione)
    - Altri metodi → stato = PAGATO_MANUALE (richiede riconciliazione banca)
    Non tocca righe già PAGATO (riconciliate via banca).
    """
    ids = payload.get("ids", [])
    metodo = payload.get("metodo_pagamento", "CONTO_CORRENTE")
    data_pag = payload.get("data_pagamento") or date.today().isoformat()

    if not ids:
        return {"ok": False, "error": "Nessuna uscita selezionata"}

    METODI_VALIDI = ["CONTO_CORRENTE", "CARTA", "CONTANTI", "ASSEGNO", "BONIFICO"]
    if metodo not in METODI_VALIDI:
        return {"ok": False, "error": f"Metodo pagamento non valido: {metodo}"}

    # CONTANTI = riconciliato (il modulo contanti È la prova di pagamento)
    # Altri metodi = manuale (serve riconciliazione con banca)
    nuovo_stato = "PAGATO" if metodo == "CONTANTI" else "PAGATO_MANUALE"

    conn = get_fc_db()
    try:
        placeholders = ",".join("?" * len(ids))
        # Aggiorna solo righe PROGRAMMATO, SCADUTO o PARZIALE (non toccare PAGATO già riconciliate)
        conn.execute(f"""
            UPDATE cg_uscite
            SET stato = ?,
                metodo_pagamento = ?,
                data_pagamento = ?,
                importo_pagato = totale
            WHERE id IN ({placeholders})
              AND stato IN ('PROGRAMMATO', 'SCADUTO', 'PARZIALE', 'PAGATO_MANUALE')
        """, [nuovo_stato, metodo, data_pag] + ids)
        aggiornate = conn.total_changes
        conn.commit()
        return {"ok": True, "aggiornate": aggiornate}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════
#  BATCH DI PAGAMENTO — stampa elenco uscite + workflow contabile
# ══════════════════════════════════════════════════════════════════

@router.post("/uscite/batch-pagamento")
def crea_batch_pagamento(
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Crea un batch di pagamento a partire da una lista di uscite selezionate.
    Le uscite vengono marcate con in_pagamento_at=NOW e collegate al batch.

    Body: { ids: [int], titolo?: str, note?: str }

    Ritorna il batch con i dettagli delle uscite, pronto per la stampa.
    In futuro il batch può essere inviato al contabile (stato INVIATO_CONTABILE)
    e poi chiuso quando tutte le uscite sono pagate.
    """
    ids = payload.get("ids", [])
    titolo = (payload.get("titolo") or "").strip()
    note = payload.get("note") or ""

    if not ids or not isinstance(ids, list):
        return {"ok": False, "error": "Nessuna uscita selezionata"}

    if not titolo:
        titolo = f"Pagamenti {date.today().strftime('%d/%m/%Y')}"

    conn = get_fc_db()
    try:
        placeholders = ",".join("?" * len(ids))
        # Calcola totale e conteggio dalle uscite effettive (non pagate).
        # Sessione 2026-05-11: aggiunti SPOSTATO + VERIFICARE (mancavano post-G.6/G.7).
        # Tutti i sotto-stati APERTI tranne RATEIZZATO (origine consumata).
        agg = conn.execute(f"""
            SELECT COUNT(*) AS n, COALESCE(SUM(totale - importo_pagato), 0) AS tot
            FROM cg_uscite
            WHERE id IN ({placeholders})
              AND stato IN ('PROGRAMMATO', 'SCADUTO', 'PARZIALE', 'SPOSTATO', 'VERIFICARE')
        """, ids).fetchone()

        n_uscite = agg["n"] if agg else 0
        totale = float(agg["tot"]) if agg else 0.0

        if n_uscite == 0:
            return {"ok": False, "error": "Nessuna uscita selezionata risulta da pagare"}

        user_id = None
        try:
            user_id = current_user.get("id") if isinstance(current_user, dict) else getattr(current_user, "id", None)
        except Exception:
            user_id = None

        conn.execute("""
            INSERT INTO cg_pagamenti_batch
                (titolo, note, n_uscite, totale, stato, created_by)
            VALUES (?, ?, ?, ?, 'IN_PAGAMENTO', ?)
        """, (titolo, note, n_uscite, totale, user_id))
        batch_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Marca le uscite: collegale al batch e setta in_pagamento_at
        # Solo le righe effettivamente da pagare
        conn.execute(f"""
            UPDATE cg_uscite
            SET pagamento_batch_id = ?,
                in_pagamento_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN ({placeholders})
              AND stato IN ('PROGRAMMATO', 'SCADUTO', 'PARZIALE', 'SPOSTATO', 'VERIFICARE')
        """, [batch_id] + ids)

        conn.commit()

        # Rileggi il batch con le uscite per la risposta (pronto stampa)
        batch = dict(conn.execute(
            "SELECT * FROM cg_pagamenti_batch WHERE id = ?", (batch_id,)
        ).fetchone())

        uscite = conn.execute(f"""
            SELECT
                u.id, u.fornitore_nome, u.fornitore_piva, u.numero_fattura,
                u.data_fattura, u.data_scadenza, u.totale, u.importo_pagato,
                u.stato, u.periodo_riferimento, u.note, u.tipo_uscita,
                s.iban AS fornitore_iban,
                s.modalita_pagamento_default AS mp_fornitore,
                sf.titolo AS sf_titolo,
                sf.iban AS sf_iban,
                pf.iban AS proforma_iban
            FROM cg_uscite u
            LEFT JOIN suppliers s ON u.fornitore_piva = s.partita_iva
            LEFT JOIN cg_spese_fisse sf ON u.spesa_fissa_id = sf.id
            LEFT JOIN fe_proforme pf ON pf.cg_uscita_id = u.id
            WHERE u.pagamento_batch_id = ?
            ORDER BY u.data_scadenza ASC, u.fornitore_nome ASC
        """, (batch_id,)).fetchall()

        batch["uscite"] = [dict(r) for r in uscite]
        return {"ok": True, "batch": batch}
    finally:
        conn.close()


@router.get("/pagamenti-batch")
def list_pagamenti_batch(
    stato: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    """
    Lista dei batch di pagamento. Filtrabile per stato.
    Usato in Scadenzario e — in futuro — dalla dashboard contabile.
    """
    conn = get_fc_db()
    try:
        if stato:
            rows = conn.execute("""
                SELECT * FROM cg_pagamenti_batch
                WHERE stato = ?
                ORDER BY created_at DESC
            """, (stato,)).fetchall()
        else:
            rows = conn.execute("""
                SELECT * FROM cg_pagamenti_batch
                ORDER BY created_at DESC
            """).fetchall()
        return {"batch": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/pagamenti-batch/{batch_id}")
def get_pagamento_batch(
    batch_id: int,
    current_user=Depends(get_current_user),
):
    """Dettaglio batch con tutte le uscite collegate."""
    conn = get_fc_db()
    try:
        batch_row = conn.execute(
            "SELECT * FROM cg_pagamenti_batch WHERE id = ?", (batch_id,)
        ).fetchone()
        if not batch_row:
            from fastapi import HTTPException
            raise HTTPException(404, "Batch non trovato")
        batch = dict(batch_row)

        uscite = conn.execute("""
            SELECT
                u.id, u.fornitore_nome, u.fornitore_piva, u.numero_fattura,
                u.data_fattura, u.data_scadenza, u.totale, u.importo_pagato,
                u.stato, u.periodo_riferimento, u.note, u.tipo_uscita,
                s.iban AS fornitore_iban,
                s.modalita_pagamento_default AS mp_fornitore,
                sf.titolo AS sf_titolo,
                sf.iban AS sf_iban,
                pf.iban AS proforma_iban
            FROM cg_uscite u
            LEFT JOIN suppliers s ON u.fornitore_piva = s.partita_iva
            LEFT JOIN cg_spese_fisse sf ON u.spesa_fissa_id = sf.id
            LEFT JOIN fe_proforme pf ON pf.cg_uscita_id = u.id
            WHERE u.pagamento_batch_id = ?
            ORDER BY u.data_scadenza ASC, u.fornitore_nome ASC
        """, (batch_id,)).fetchall()
        batch["uscite"] = [dict(r) for r in uscite]
        return batch
    finally:
        conn.close()


@router.put("/pagamenti-batch/{batch_id}")
def update_pagamento_batch(
    batch_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Aggiorna stato/titolo/note del batch.
    Stati validi: IN_PAGAMENTO, INVIATO_CONTABILE, CHIUSO.
    Quando si passa a INVIATO_CONTABILE setta inviato_contabile_at.
    Quando si passa a CHIUSO setta chiuso_at.
    """
    stato_nuovo = payload.get("stato")
    STATI = ("IN_PAGAMENTO", "INVIATO_CONTABILE", "CHIUSO")

    conn = get_fc_db()
    try:
        row = conn.execute(
            "SELECT id FROM cg_pagamenti_batch WHERE id = ?", (batch_id,)
        ).fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404, "Batch non trovato")

        sets = []
        params = []
        if "titolo" in payload:
            sets.append("titolo = ?")
            params.append(payload["titolo"])
        if "note" in payload:
            sets.append("note = ?")
            params.append(payload["note"])
        if stato_nuovo:
            if stato_nuovo not in STATI:
                return {"ok": False, "error": f"Stato non valido: {stato_nuovo}"}
            sets.append("stato = ?")
            params.append(stato_nuovo)
            if stato_nuovo == "INVIATO_CONTABILE":
                sets.append("inviato_contabile_at = CURRENT_TIMESTAMP")
            elif stato_nuovo == "CHIUSO":
                sets.append("chiuso_at = CURRENT_TIMESTAMP")

        if not sets:
            return {"ok": False, "error": "Nessun campo da aggiornare"}

        params.append(batch_id)
        conn.execute(f"UPDATE cg_pagamenti_batch SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/pagamenti-batch/{batch_id}")
def delete_pagamento_batch(
    batch_id: int,
    current_user=Depends(get_current_user),
):
    """
    Elimina un batch e rimuove il flag dalle uscite collegate.
    Le uscite NON vengono cancellate, tornano solo in stato normale.
    """
    conn = get_fc_db()
    try:
        row = conn.execute(
            "SELECT id FROM cg_pagamenti_batch WHERE id = ?", (batch_id,)
        ).fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404, "Batch non trovato")

        # Scollega le uscite
        conn.execute("""
            UPDATE cg_uscite
            SET pagamento_batch_id = NULL,
                in_pagamento_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE pagamento_batch_id = ?
        """, (batch_id,))

        conn.execute("DELETE FROM cg_pagamenti_batch WHERE id = ?", (batch_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# BP.1 — Rimuovi singola uscita + Auto-close batch
# ──────────────────────────────────────────────────────────────


@router.delete(
    "/pagamenti-batch/{batch_id}/uscite/{uscita_id}",
    summary="Rimuove una singola uscita da un batch (senza eliminare il batch)",
)
def remove_uscita_from_batch(
    batch_id: int,
    uscita_id: int,
    current_user=Depends(get_current_user),
):
    """Scollega un'uscita dal batch:
      - cg_uscite: pagamento_batch_id=NULL, in_pagamento_at=NULL
      - cg_pagamenti_batch: ricalcolo n_uscite + totale dalle uscite ancora collegate.

    Errori:
      404 — batch o uscita non trovata, o uscita non collegata a QUESTO batch
      409 — l'uscita è già pagata (PAGATO/PAGATO_MANUALE): è ambiguo cosa
            scollegare, l'utente prima deve sgancia banca_movimento_id.
    """
    conn = get_fc_db()
    try:
        # Verifica batch esiste
        b = conn.execute(
            "SELECT id FROM cg_pagamenti_batch WHERE id = ?", (batch_id,)
        ).fetchone()
        if not b:
            from fastapi import HTTPException
            raise HTTPException(404, "Batch non trovato")

        # Verifica uscita esiste E è collegata a QUESTO batch
        u = conn.execute(
            "SELECT id, stato, pagamento_batch_id FROM cg_uscite WHERE id = ?",
            (uscita_id,),
        ).fetchone()
        if not u:
            from fastapi import HTTPException
            raise HTTPException(404, "Uscita non trovata")
        ud = dict(u)
        if ud["pagamento_batch_id"] != batch_id:
            from fastapi import HTTPException
            raise HTTPException(
                404,
                f"Uscita #{uscita_id} non collegata al batch #{batch_id} "
                f"(pagamento_batch_id={ud['pagamento_batch_id']})"
            )
        if ud["stato"] in ("PAGATO", "PAGATO_MANUALE"):
            from fastapi import HTTPException
            raise HTTPException(
                409,
                f"Uscita #{uscita_id} è in stato {ud['stato']}: "
                "rimuovi prima la riconciliazione (banca_movimento_id) e riprova."
            )

        # Scollega l'uscita
        conn.execute(
            """UPDATE cg_uscite
               SET pagamento_batch_id = NULL,
                   in_pagamento_at = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (uscita_id,),
        )

        # Ricalcola n_uscite + totale del batch dalle uscite ancora collegate
        agg = conn.execute(
            """SELECT COUNT(*) AS n, COALESCE(SUM(totale - importo_pagato), 0) AS tot
               FROM cg_uscite
               WHERE pagamento_batch_id = ?""",
            (batch_id,),
        ).fetchone()
        n_left = agg["n"]
        tot_left = float(agg["tot"])
        conn.execute(
            "UPDATE cg_pagamenti_batch SET n_uscite = ?, totale = ? WHERE id = ?",
            (n_left, tot_left, batch_id),
        )

        conn.commit()
        return {
            "ok": True,
            "uscita_rimossa": uscita_id,
            "batch_id": batch_id,
            "n_uscite_rimanenti": n_left,
            "totale_rimanente": round(tot_left, 2),
            "batch_vuoto": n_left == 0,
        }
    finally:
        conn.close()


def _try_auto_close_batch(conn, batch_id: int) -> dict:
    """Helper: chiude il batch se tutte le sue uscite sono PAGATO/PAGATO_MANUALE
    e n_uscite > 0. Restituisce {chiuso: bool, n_uscite, n_pagate, motivo}.

    NON solleva eccezioni, NON committa (il chiamante orchestra)."""
    row = conn.execute(
        "SELECT id, stato, n_uscite FROM cg_pagamenti_batch WHERE id = ?",
        (batch_id,),
    ).fetchone()
    if not row:
        return {"chiuso": False, "motivo": "batch non trovato"}
    b = dict(row)
    if b["stato"] == "CHIUSO":
        return {"chiuso": False, "motivo": "già chiuso"}

    # Conta uscite del batch totali vs pagate
    agg = conn.execute(
        """SELECT
              COUNT(*) AS n_tot,
              SUM(CASE WHEN stato IN ('PAGATO','PAGATO_MANUALE') THEN 1 ELSE 0 END) AS n_pagate
           FROM cg_uscite
           WHERE pagamento_batch_id = ?""",
        (batch_id,),
    ).fetchone()
    n_tot = agg["n_tot"] or 0
    n_pagate = agg["n_pagate"] or 0

    # NOTA: il flag in_pagamento_at viene RESETTATO a NULL dagli endpoint che
    # marcano PAGATO/PAGATO_MANUALE (mig 104). Questo significa che un'uscita
    # PAGATO non è più associata al batch via in_pagamento_at — MA `pagamento_batch_id`
    # resta valorizzato (non viene resettato), quindi possiamo ancora contarla
    # come "appartenente al batch" qui. Verifico questa assunzione...
    # Se pagamento_batch_id venisse anch'esso resettato a NULL su pagamento,
    # questa logica andrebbe rivista (es. archiviare la membership prima).
    # Verifica nel codice: gli UPDATE che fanno in_pagamento_at=NULL sembrano
    # azzerare ANCHE pagamento_batch_id. Quindi una uscita pagata RIENTRA come
    # "non più nel batch" — il batch può apparire come vuoto pur essendo "completato".

    if n_tot == 0:
        # Batch "svuotato": tutte le uscite sono uscite via PAGATO (pagamento_batch_id=NULL).
        # Recupero il valore originale di n_uscite dal batch header come riferimento.
        if b["n_uscite"] and b["n_uscite"] > 0:
            return {"chiuso_possibile": True, "n_tot": 0, "n_pagate": 0, "motivo": "tutte le uscite pagate (svuotato)"}
        return {"chiuso": False, "motivo": "batch vuoto / mai usato"}

    if n_pagate == n_tot:
        return {"chiuso_possibile": True, "n_tot": n_tot, "n_pagate": n_pagate}
    return {"chiuso": False, "motivo": f"{n_pagate}/{n_tot} uscite pagate"}


@router.post(
    "/pagamenti-batch/{batch_id}/auto-close",
    summary="Chiude il batch se tutte le sue uscite sono pagate",
)
def auto_close_batch(
    batch_id: int,
    current_user=Depends(get_current_user),
):
    """Chiude il batch se tutte le uscite sono PAGATO/PAGATO_MANUALE."""
    conn = get_fc_db()
    try:
        check = _try_auto_close_batch(conn, batch_id)
        if not check.get("chiuso_possibile"):
            return {"ok": False, "chiuso": False, "motivo": check.get("motivo", "—")}

        conn.execute(
            """UPDATE cg_pagamenti_batch
               SET stato = 'CHIUSO',
                   chiuso_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (batch_id,),
        )
        conn.commit()
        return {"ok": True, "chiuso": True, "batch_id": batch_id, **{k: v for k, v in check.items() if k != "chiuso_possibile"}}
    finally:
        conn.close()


@router.post(
    "/pagamenti-batch/auto-close-all",
    summary="Bulk: chiude tutti i batch dove tutte le uscite sono pagate",
)
def auto_close_all_batches(current_user=Depends(get_current_user)):
    """Itera tutti i batch IN_PAGAMENTO/INVIATO_CONTABILE e chiude quelli completati.

    Pensato per:
      - Pulizia retroattiva degli 8 batch storici Tre Gobbi
      - Uso periodico (bottone in UI o cron futuro)
    """
    conn = get_fc_db()
    try:
        rows = conn.execute(
            """SELECT id FROM cg_pagamenti_batch
               WHERE stato IN ('IN_PAGAMENTO', 'INVIATO_CONTABILE')
               ORDER BY id"""
        ).fetchall()
        chiusi = []
        skipped = []
        for r in rows:
            bid = r["id"]
            check = _try_auto_close_batch(conn, bid)
            if check.get("chiuso_possibile"):
                conn.execute(
                    """UPDATE cg_pagamenti_batch
                       SET stato = 'CHIUSO',
                           chiuso_at = CURRENT_TIMESTAMP
                       WHERE id = ?""",
                    (bid,),
                )
                chiusi.append({"batch_id": bid, **{k: v for k, v in check.items() if k != "chiuso_possibile"}})
            else:
                skipped.append({"batch_id": bid, "motivo": check.get("motivo", "—")})
        conn.commit()
        return {
            "ok": True,
            "n_chiusi": len(chiusi),
            "n_skipped": len(skipped),
            "chiusi": chiusi,
            "skipped": skipped,
        }
    finally:
        conn.close()


# ── Segna pagata singola fattura (da Acquisti) ───────────────────
@router.put("/uscita/{uscita_id}/stato-pagamento")
def update_uscita_stato_pagamento(
    uscita_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Modulo M.3 (2026-04-27): cambio manuale stato pagamento di una cg_uscite.

    Body: { "stato": "PROGRAMMATO" | "VERIFICARE" | "PAGATO_MANUALE" }

    Stati settabili manualmente:
      - PROGRAMMATO      → riporta a "da pagare" (SCADUTO viene ricalcolata da data)
      - VERIFICARE  → "forse pagata, controllare"
      - PAGATO_MANUALE → "pagato in attesa di riconciliazione"

    Stati NON settabili manualmente:
      - PAGATO   → solo via riconciliazione bancaria (banca_fatture_link).
                   Per uscire serve cancellare il link.
      - SCADUTO  → derivata da data_scadenza < oggi su PROGRAMMATO.
      - PARZIALE → impostata da gestione pagamenti parziali (caso edge).

    Per uscite collegate a fatture (fattura_id != NULL), sincronizza anche
    fe_fatture.pagato e fe_fatture.stato_pagamento per coerenza cross-tabella.
    """
    import logging
    logger = logging.getLogger("controllo_gestione")
    nuovo_stato = (payload or {}).get("stato")
    user_label = (current_user or {}).get("username") or (current_user or {}).get("email") or "?"

    STATI_MANUALI = {"PROGRAMMATO", "VERIFICARE", "PAGATO_MANUALE"}
    if nuovo_stato not in STATI_MANUALI:
        raise HTTPException(
            status_code=400,
            detail=f"Stato non settabile manualmente: {nuovo_stato}. Validi: {sorted(STATI_MANUALI)}",
        )

    fc = get_fc_db()
    try:
        usc = fc.execute(
            "SELECT id, stato, fattura_id, data_scadenza FROM cg_uscite WHERE id = ?",
            (uscita_id,),
        ).fetchone()
        if not usc:
            raise HTTPException(404, "Uscita non trovata")

        vecchio = usc["stato"]
        if vecchio == "PAGATO":
            raise HTTPException(
                status_code=409,
                detail="Uscita riconciliata bancariamente: stato immutabile. Cancellare prima il link banca_fatture_link.",
            )
        if vecchio == "PARZIALE":
            raise HTTPException(
                status_code=409,
                detail="Uscita con pagamento parziale: gestire prima il completamento o annullare il pagamento parziale.",
            )

        oggi_str = date.today().isoformat()

        # Per PROGRAMMATO: ricalcola SCADUTO se data passata
        stato_effettivo = nuovo_stato
        if nuovo_stato == "PROGRAMMATO" and usc["data_scadenza"] and usc["data_scadenza"] < oggi_str:
            stato_effettivo = "SCADUTO"

        if nuovo_stato == "PAGATO_MANUALE":
            # Bug D5: reset in_pagamento_at quando si dichiara pagato manuale
            fc.execute("""
                UPDATE cg_uscite
                   SET stato = ?,
                       data_pagamento = COALESCE(data_pagamento, ?),
                       importo_pagato = totale,
                       metodo_pagamento = COALESCE(metodo_pagamento, 'CONTO_CORRENTE'),
                       in_pagamento_at = NULL,
                       pagamento_batch_id = NULL,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?
            """, (stato_effettivo, oggi_str, uscita_id))
        else:
            # Riporta a PROGRAMMATO/VERIFICARE → toglie anche in_pagamento_at
            fc.execute("""
                UPDATE cg_uscite
                   SET stato = ?,
                       data_pagamento = NULL,
                       importo_pagato = 0,
                       metodo_pagamento = NULL,
                       in_pagamento_at = NULL,
                       pagamento_batch_id = NULL,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?
            """, (stato_effettivo, uscita_id))

        # Sincronizza fe_fatture se uscita collegata a fattura
        if usc["fattura_id"]:
            try:
                from app.services.fatture_stato_service import set_stato as set_fattura_stato
                stato_fattura = {
                    "PROGRAMMATO": "da_pagare",
                    "VERIFICARE": "da_verificare",
                    "PAGATO_MANUALE": "pagato_manuale",
                }[nuovo_stato]
                set_fattura_stato(fc, usc["fattura_id"], stato_fattura, force=True)
            except Exception as _e:
                logger.warning(f"[uscita-stato] sync fattura fallito uscita={uscita_id}: {_e}")

        fc.commit()
        logger.info(f"[uscita-stato] user={user_label} uscita={uscita_id} {vecchio} → {stato_effettivo}")
        return {"ok": True, "uscita_id": uscita_id, "vecchio_stato": vecchio, "nuovo_stato": stato_effettivo}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[uscita-stato] FAIL uscita={uscita_id}: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Errore: {type(e).__name__}: {e}")
    finally:
        fc.close()


@router.post("/fattura/{fattura_id}/segna-pagata-manuale")
def segna_pagata_manuale(
    fattura_id: int,
    payload: dict = Body(default={}),
    current_user=Depends(get_current_user),
):
    """
    Segna una fattura come PAGATO_MANUALE (in attesa di riconciliazione banca).
    Usato dal modulo Acquisti per segnare pagamenti non ancora riconciliati.
    Se esiste già una cg_uscite per questa fattura, aggiorna lo stato.
    Se non esiste, la crea.
    Aggiorna anche fe_fatture.pagato = 1.
    """
    metodo = payload.get("metodo_pagamento", "CONTO_CORRENTE")
    data_pag = payload.get("data_pagamento") or date.today().isoformat()

    METODI_VALIDI = ["CONTO_CORRENTE", "CARTA", "CONTANTI", "ASSEGNO", "BONIFICO"]
    if metodo not in METODI_VALIDI:
        return {"ok": False, "error": f"Metodo pagamento non valido: {metodo}"}

    nuovo_stato = "PAGATO" if metodo == "CONTANTI" else "PAGATO_MANUALE"

    fc = get_fc_db()
    try:
        # Verifica che la fattura esista
        fat = fc.execute(
            "SELECT id, fornitore_nome, fornitore_piva, numero_fattura, data_fattura, totale_fattura FROM fe_fatture WHERE id = ?",
            (fattura_id,)
        ).fetchone()
        if not fat:
            return {"ok": False, "error": "Fattura non trovata"}

        # Controlla se esiste già un record cg_uscite per questa fattura
        uscita = fc.execute(
            "SELECT id, stato FROM cg_uscite WHERE fattura_id = ?", (fattura_id,)
        ).fetchone()

        if uscita:
            # Già riconciliata via banca? Non toccare
            if uscita["stato"] == "PAGATO":
                return {"ok": False, "error": "Fattura già riconciliata via banca"}
            # Aggiorna stato
            fc.execute("""
                UPDATE cg_uscite
                SET stato = ?, metodo_pagamento = ?, data_pagamento = ?,
                    importo_pagato = totale, updated_at = CURRENT_TIMESTAMP
                WHERE fattura_id = ? AND stato IN ('PROGRAMMATO', 'SCADUTO', 'PARZIALE', 'PAGATO_MANUALE')
            """, (nuovo_stato, metodo, data_pag, fattura_id))
        else:
            # Crea nuovo record cg_uscite
            fc.execute("""
                INSERT INTO cg_uscite
                    (fattura_id, fornitore_nome, fornitore_piva, numero_fattura,
                     data_fattura, totale, data_scadenza, importo_pagato,
                     data_pagamento, stato, metodo_pagamento, tipo_uscita)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FATTURA')
            """, (
                fattura_id, fat["fornitore_nome"], fat["fornitore_piva"],
                fat["numero_fattura"], fat["data_fattura"],
                fat["totale_fattura"] or 0,
                fat["data_fattura"],  # scadenza = data fattura se non nota
                fat["totale_fattura"] or 0,
                data_pag, nuovo_stato, metodo
            ))

        # Post G.5: pagato è una VIEW derivata da cg_uscite.stato, sopra abbiamo
        # già aggiornato cg_uscite quindi la VIEW si allinea automaticamente.
        # Niente UPDATE diretto su fe_fatture.pagato (la colonna fisica non esiste più).
        fc.commit()

        return {"ok": True, "stato": nuovo_stato, "fattura_id": fattura_id}
    finally:
        fc.close()


@router.post("/uscite/{uscita_id}/riconcilia")
def riconcilia_uscita(
    uscita_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Collega un'uscita a un movimento bancario.
    Body: { "banca_movimento_id": int }
    Effetto: banca_movimento_id viene salvato, stato → PAGATO.
    """
    fc = get_fc_db()
    banca_id = payload.get("banca_movimento_id")
    if not banca_id:
        fc.close()
        return {"ok": False, "error": "banca_movimento_id richiesto"}

    # Verifica che l'uscita esista
    uscita = fc.execute("SELECT id, stato FROM cg_uscite WHERE id = ?", (uscita_id,)).fetchone()
    if not uscita:
        fc.close()
        return {"ok": False, "error": "Uscita non trovata"}

    # Verifica che il movimento non sia già usato da un'altra uscita
    existing = fc.execute(
        "SELECT id, fornitore_nome FROM cg_uscite WHERE banca_movimento_id = ? AND id != ?",
        (banca_id, uscita_id)
    ).fetchone()
    if existing:
        fc.close()
        return {"ok": False, "error": f"Movimento già collegato a uscita #{existing['id']} ({existing['fornitore_nome']})"}

    # Verifica che il movimento esista
    mov = fc.execute("SELECT id, importo, data_contabile FROM banca_movimenti WHERE id = ?", (banca_id,)).fetchone()
    if not mov:
        fc.close()
        return {"ok": False, "error": "Movimento bancario non trovato"}

    oggi_str = date.today().isoformat()

    # Recupera fattura_id per propagare a banca_fatture_link
    uscita_full = fc.execute("SELECT fattura_id FROM cg_uscite WHERE id = ?", (uscita_id,)).fetchone()
    fattura_id = dict(uscita_full).get("fattura_id") if uscita_full else None

    # Bug D5: reset in_pagamento_at + pagamento_batch_id alla riconciliazione
    fc.execute("""
        UPDATE cg_uscite
        SET banca_movimento_id = ?,
            stato = 'PAGATO',
            data_pagamento = COALESCE(data_pagamento, ?),
            importo_pagato = totale,
            in_pagamento_at = NULL,
            pagamento_batch_id = NULL,
            updated_at = ?
        WHERE id = ?
    """, (banca_id, dict(mov)["data_contabile"], oggi_str, uscita_id))

    # Propaga a banca_fatture_link (sync bidirezionale con modulo Banca)
    if fattura_id:
        try:
            fc.execute("""
                INSERT OR IGNORE INTO banca_fatture_link (movimento_id, fattura_id, note)
                VALUES (?, ?, 'Collegato da scadenzario')
            """, (banca_id, fattura_id))
        except Exception:
            pass  # Non bloccante: il link in banca_fatture_link e' opzionale

    fc.commit()
    fc.close()

    return {"ok": True, "nuovo_stato": "PAGATO"}


@router.delete("/uscite/{uscita_id}/riconcilia")
def scollega_uscita(
    uscita_id: int,
    current_user=Depends(get_current_user),
):
    """
    Scollega un'uscita dal movimento bancario.
    Riporta lo stato a PAGATO_MANUALE.
    Propaga lo scollega anche a banca_fatture_link.
    """
    fc = get_fc_db()

    uscita = fc.execute("SELECT id, stato, banca_movimento_id, fattura_id FROM cg_uscite WHERE id = ?", (uscita_id,)).fetchone()
    if not uscita:
        fc.close()
        return {"ok": False, "error": "Uscita non trovata"}

    u = dict(uscita)
    if not u["banca_movimento_id"]:
        fc.close()
        return {"ok": False, "error": "Uscita non riconciliata"}

    oggi_str = date.today().isoformat()
    fc.execute("""
        UPDATE cg_uscite
        SET banca_movimento_id = NULL,
            stato = 'PAGATO_MANUALE',
            updated_at = ?
        WHERE id = ?
    """, (oggi_str, uscita_id))

    # Propaga: rimuovi anche il link in banca_fatture_link
    if u.get("fattura_id") and u["banca_movimento_id"]:
        fc.execute("""
            DELETE FROM banca_fatture_link
            WHERE movimento_id = ? AND fattura_id = ?
        """, (u["banca_movimento_id"], u["fattura_id"]))

    fc.commit()
    fc.close()

    return {"ok": True, "nuovo_stato": "PAGATO_MANUALE"}


# ── Riconciliazione alternativa: CONTANTI ─────────────────────────
@router.post("/uscite/{uscita_id}/paga-contanti")
def paga_uscita_contanti(
    uscita_id: int,
    payload: dict = Body(default={}),
    current_user=Depends(get_current_user),
):
    """
    Chiude la riconciliazione di una uscita marcandola come pagata in contanti.
    Body (tutti opzionali): { data_pagamento?: "YYYY-MM-DD", note?: str }

    Effetto:
      - metodo_pagamento = 'CONTANTI'
      - stato = 'PAGATO'  (il modulo Contanti E' la prova di pagamento)
      - data_pagamento = oggi o valore passato
      - importo_pagato = totale
      - banca_movimento_id = NULL (non coinvolge la banca)

    Errore se l'uscita è gia' collegata a un movimento bancario:
    scollegarla prima con DELETE /uscite/{id}/riconcilia.
    """
    data_pag = payload.get("data_pagamento") or date.today().isoformat()
    nota_extra = (payload.get("note") or "").strip()

    fc = get_fc_db()
    try:
        u_row = fc.execute(
            "SELECT id, stato, banca_movimento_id, note FROM cg_uscite WHERE id = ?",
            (uscita_id,),
        ).fetchone()
        if not u_row:
            return {"ok": False, "error": "Uscita non trovata"}
        u = dict(u_row)

        if u["banca_movimento_id"]:
            return {
                "ok": False,
                "error": "Uscita gia' collegata a un movimento bancario. Scollegala prima.",
            }

        note_final = (u.get("note") or "").strip()
        if nota_extra:
            note_final = f"{note_final} | {nota_extra}".strip(" |")

        # Bug D5: reset in_pagamento_at quando pagata in contanti
        fc.execute("""
            UPDATE cg_uscite
            SET metodo_pagamento = 'CONTANTI',
                stato = 'PAGATO',
                data_pagamento = ?,
                importo_pagato = totale,
                note = ?,
                banca_movimento_id = NULL,
                in_pagamento_at = NULL,
                pagamento_batch_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (data_pag, note_final or None, uscita_id))
        fc.commit()

        return {
            "ok": True,
            "nuovo_stato": "PAGATO",
            "metodo_pagamento": "CONTANTI",
            "data_pagamento": data_pag,
        }
    finally:
        fc.close()


# ── Cambio canale rapido (worklist → sposta in altro canale) ──────
@router.post("/uscite/{uscita_id}/cambia-canale")
def cambia_canale_uscita(
    uscita_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Sposta un'uscita da un canale di riconciliazione all'altro.
    Body: { "canale": "banca" | "carta" | "contanti" }

    Effetto sul DB (cg_uscite):
      - canale='banca'    → metodo_pagamento=NULL, stato=PAGATO_MANUALE
                            (torna in attesa di match a movimento bancario)
      - canale='carta'    → metodo_pagamento='CARTA', stato=PAGATO_MANUALE
                            (riconciliazione delegata al futuro modulo Carta)
      - canale='contanti' → metodo_pagamento='CONTANTI', stato=PAGATO
                            (il modulo Contanti È la prova di pagamento)

    Rifiuta se l'uscita e' gia' collegata a un movimento bancario
    (va scollegata prima con DELETE /uscite/{id}/riconcilia).
    """
    target = (payload.get("canale") or "").lower().strip()
    if target not in ("banca", "carta", "contanti"):
        return {"ok": False, "error": "canale deve essere 'banca', 'carta' o 'contanti'"}

    fc = get_fc_db()
    try:
        u_row = fc.execute(
            "SELECT id, stato, banca_movimento_id, metodo_pagamento FROM cg_uscite WHERE id = ?",
            (uscita_id,),
        ).fetchone()
        if not u_row:
            return {"ok": False, "error": "Uscita non trovata"}
        u = dict(u_row)

        if u["banca_movimento_id"]:
            return {
                "ok": False,
                "error": "Uscita gia' collegata a un movimento bancario. Scollegala prima.",
            }

        if target == "banca":
            new_metodo = None
            new_stato = "PAGATO_MANUALE"
        elif target == "carta":
            new_metodo = "CARTA"
            new_stato = "PAGATO_MANUALE"
        else:  # contanti
            new_metodo = "CONTANTI"
            new_stato = "PAGATO"

        fc.execute("""
            UPDATE cg_uscite
            SET metodo_pagamento = ?,
                stato = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (new_metodo, new_stato, uscita_id))
        fc.commit()

        return {
            "ok": True,
            "canale": target,
            "metodo_pagamento": new_metodo,
            "nuovo_stato": new_stato,
        }
    finally:
        fc.close()


# ── Riconciliazione alternativa: CARTA DI CREDITO ─────────────────
@router.post("/uscite/{uscita_id}/paga-carta")
def paga_uscita_carta(
    uscita_id: int,
    payload: dict = Body(default={}),
    current_user=Depends(get_current_user),
):
    """
    Chiude la riconciliazione di una uscita marcandola come pagata con carta di credito.
    Body (tutti opzionali): { data_pagamento?: "YYYY-MM-DD", note?: str }

    NOTA: il modulo Carta di Credito (matching con estratti carta) e' pianificato
    ma non ancora implementato. Per ora l'uscita viene marcata con:
      - metodo_pagamento = 'CARTA'
      - stato = 'PAGATO_MANUALE'  (in attesa del matcher carta)
      - data_pagamento = oggi o valore passato
      - importo_pagato = totale
      - banca_movimento_id = NULL

    L'uscita scompare dalla worklist "banca" (filtrata per canale) e
    apparira' nella worklist "carta" quando il modulo sara' attivo.
    """
    data_pag = payload.get("data_pagamento") or date.today().isoformat()
    nota_extra = (payload.get("note") or "").strip()

    fc = get_fc_db()
    try:
        u_row = fc.execute(
            "SELECT id, stato, banca_movimento_id, note FROM cg_uscite WHERE id = ?",
            (uscita_id,),
        ).fetchone()
        if not u_row:
            return {"ok": False, "error": "Uscita non trovata"}
        u = dict(u_row)

        if u["banca_movimento_id"]:
            return {
                "ok": False,
                "error": "Uscita gia' collegata a un movimento bancario. Scollegala prima.",
            }

        note_final = (u.get("note") or "").strip()
        if nota_extra:
            note_final = f"{note_final} | {nota_extra}".strip(" |")

        # Bug D5: reset in_pagamento_at quando pagata in carta
        fc.execute("""
            UPDATE cg_uscite
            SET metodo_pagamento = 'CARTA',
                stato = 'PAGATO_MANUALE',
                data_pagamento = ?,
                importo_pagato = totale,
                note = ?,
                banca_movimento_id = NULL,
                in_pagamento_at = NULL,
                pagamento_batch_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (data_pag, note_final or None, uscita_id))
        fc.commit()

        return {
            "ok": True,
            "nuovo_stato": "PAGATO_MANUALE",
            "metodo_pagamento": "CARTA",
            "data_pagamento": data_pag,
        }
    finally:
        fc.close()


# ═══════════════════════════════════════════════════════════════════
# MOVIMENTI CONTANTI — pagamenti cash collegati a uscite CG
# ═══════════════════════════════════════════════════════════════════

@router.get("/movimenti-contanti")
def get_movimenti_contanti(
    anno: int = Query(None),
    mese: int = Query(None),
    data_da: str = Query(None),
    data_a: str = Query(None),
    current_user=Depends(get_current_user),
):
    """
    Lista uscite pagate in contanti (metodo_pagamento = 'CONTANTI').
    Filtrabili per anno/mese di data_pagamento oppure per intervallo data_da/data_a
    (se passati, l'intervallo ha priorità sul filtro anno/mese).
    """
    fc = get_fc_db()
    sql = """
        SELECT id, fornitore_nome, fornitore_piva, numero_fattura,
               data_fattura, totale AS importo, data_scadenza, importo_pagato,
               data_pagamento, stato, tipo_uscita, note,
               periodo_riferimento, metodo_pagamento
        FROM cg_uscite
        WHERE metodo_pagamento = 'CONTANTI'
    """
    params = []
    if data_da or data_a:
        if data_da:
            sql += " AND data_pagamento >= ?"
            params.append(data_da)
        if data_a:
            sql += " AND data_pagamento <= ?"
            params.append(data_a)
    else:
        if anno:
            sql += " AND strftime('%Y', data_pagamento) = ?"
            params.append(str(anno))
        if mese:
            sql += " AND CAST(strftime('%m', data_pagamento) AS INTEGER) = ?"
            params.append(mese)
    sql += " ORDER BY data_pagamento DESC, fornitore_nome"
    rows = [dict(r) for r in fc.execute(sql, params).fetchall()]

    totale = sum(r["importo_pagato"] or r["importo"] or 0 for r in rows)
    fc.close()
    return {"movimenti": rows, "count": len(rows), "totale": totale}


@router.get("/uscite-da-pagare")
def get_uscite_da_pagare(
    search: str = Query(""),
    current_user=Depends(get_current_user),
):
    """
    Lista uscite non ancora pagate — per selettore pagamento contanti.
    Filtro opzionale per nome fornitore o numero fattura.
    """
    fc = get_fc_db()

    # Pulizia 1: marca PAGATO le uscite la cui fattura sorgente è stata azzerata
    fc.execute("""
        UPDATE cg_uscite SET totale = 0, stato = 'PAGATO',
            note = COALESCE(note, '') || ' [azzerata da sconto/storno]',
            updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IS NOT NULL
          AND stato IN ('PROGRAMMATO', 'SCADUTO', 'PARZIALE')
          AND fattura_id IN (
              SELECT id FROM fe_fatture WHERE COALESCE(totale_fattura, 0) <= 0
          )
    """)

    fc.commit()

    sql = """
        SELECT id, fornitore_nome, fornitore_piva, numero_fattura,
               data_fattura, totale AS importo, data_scadenza, stato, tipo_uscita,
               periodo_riferimento, note
        FROM cg_uscite
        WHERE stato IN ('PROGRAMMATO', 'SCADUTO', 'PARZIALE')
          AND COALESCE(totale, 0) > 0
    """
    params = []
    if search:
        sql += " AND (fornitore_nome LIKE ? OR numero_fattura LIKE ? OR note LIKE ? OR periodo_riferimento LIKE ?)"
        params += [f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"]
    sql += " ORDER BY COALESCE(data_scadenza, '9999-12-31') ASC, totale DESC LIMIT 50"
    rows = [dict(r) for r in fc.execute(sql, params).fetchall()]
    fc.close()
    return {"uscite": rows, "count": len(rows)}


# ═══════════════════════════════════════════════════════════════════
# ADEGUAMENTO SPESE FISSE (ISTAT, variazioni canone)
# ═══════════════════════════════════════════════════════════════════

@router.post("/spese-fisse/{spesa_id}/adeguamento")
def adeguamento_spesa(
    spesa_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Applica un adeguamento (es. ISTAT) a una spesa fissa.
    Body: {
        "nuovo_importo": float,        # nuovo importo della rata/canone
        "data_decorrenza": "YYYY-MM-DD", # da quando si applica
        "motivo": "Adeguamento ISTAT 2026 +5.4%"  # opzionale
    }
    Effetto:
    1. Aggiorna importo in cg_spese_fisse
    2. Aggiorna tutte le cg_uscite future non pagate da data_decorrenza in poi
    3. Salva lo storico in cg_spese_fisse_adeguamenti
    """
    fc = get_fc_db()

    spesa = fc.execute("SELECT * FROM cg_spese_fisse WHERE id = ?", (spesa_id,)).fetchone()
    if not spesa:
        fc.close()
        return {"ok": False, "error": "Spesa fissa non trovata"}

    s = dict(spesa)
    nuovo_importo = payload.get("nuovo_importo")
    data_dec = payload.get("data_decorrenza")
    motivo = payload.get("motivo", "")

    if not nuovo_importo or not data_dec:
        fc.close()
        return {"ok": False, "error": "nuovo_importo e data_decorrenza sono obbligatori"}

    nuovo_importo = float(nuovo_importo)
    importo_vecchio = s["importo"]

    if nuovo_importo == importo_vecchio:
        fc.close()
        return {"ok": False, "error": "Il nuovo importo è uguale a quello attuale"}

    variazione_pct = round((nuovo_importo - importo_vecchio) / importo_vecchio * 100, 2) if importo_vecchio else 0

    # 1. Aggiorna importo nella spesa fissa
    oggi_str = date.today().isoformat()
    fc.execute("""
        UPDATE cg_spese_fisse SET importo = ?, updated_at = ? WHERE id = ?
    """, (nuovo_importo, oggi_str, spesa_id))

    # 2. Aggiorna uscite future non pagate (da data_decorrenza in poi)
    cur = fc.execute("""
        UPDATE cg_uscite
        SET totale = ?, updated_at = ?
        WHERE spesa_fissa_id = ?
          AND data_scadenza >= ?
          AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
    """, (nuovo_importo, oggi_str, spesa_id, data_dec))
    n_aggiornate = cur.rowcount

    # 3. Salva storico adeguamento
    try:
        fc.execute("""
            INSERT INTO cg_spese_fisse_adeguamenti
                (spesa_fissa_id, importo_vecchio, importo_nuovo, data_decorrenza,
                 variazione_pct, motivo, uscite_aggiornate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (spesa_id, importo_vecchio, nuovo_importo, data_dec,
              variazione_pct, motivo, n_aggiornate))
    except Exception:
        pass  # Tabella potrebbe non esistere ancora se la migration non è stata eseguita

    fc.commit()
    fc.close()

    return {
        "ok": True,
        "importo_vecchio": importo_vecchio,
        "importo_nuovo": nuovo_importo,
        "variazione_pct": variazione_pct,
        "uscite_aggiornate": n_aggiornate,
    }


@router.get("/spese-fisse/{spesa_id}/adeguamenti")
def storico_adeguamenti(
    spesa_id: int,
    current_user=Depends(get_current_user),
):
    """Storico adeguamenti di una spesa fissa."""
    fc = get_fc_db()
    try:
        rows = fc.execute("""
            SELECT * FROM cg_spese_fisse_adeguamenti
            WHERE spesa_fissa_id = ?
            ORDER BY data_decorrenza DESC
        """, (spesa_id,)).fetchall()
        fc.close()
        return [dict(r) for r in rows]
    except Exception:
        fc.close()
        return []
