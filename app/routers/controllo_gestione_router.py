"""
TRGB — Controllo di Gestione Router
Dashboard unificata che incrocia dati da: Acquisti, Banca, Vendite.
Tabellone Uscite: importa fatture da Acquisti, calcola scadenze, gestisce stati.

Prefix: /controllo-gestione
DB: foodcost.db (lettura acquisti, banca, cg_uscite, cg_spese_fisse),
    admin_finance.sqlite3 (lettura vendite)
"""

import calendar
import sqlite3
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, Body
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
    - Se data_scadenza < oggi → SCADUTA (arretrato)
    - Se data_scadenza >= oggi → DA_PAGARE (uscita corrente)
    - Se data_scadenza è NULL → DA_PAGARE (senza scadenza, richiede attenzione)

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
        WHERE f.is_autofattura = 0
          AND COALESCE(f.tipo_documento, 'TD01') NOT IN ('TD04')
          AND f.totale_fattura > 0
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

        # ── Cross-ref: se c'è un link bancario, la fattura è PAGATA ──
        linked_mov = fat.get("linked_movimento_id")
        linked_data = fat.get("linked_data_mov")

        # ── Calcola stato ──
        if linked_mov:
            stato = "PAGATA"
        elif data_scad and data_scad < oggi_str:
            stato = "SCADUTA"
        else:
            stato = "DA_PAGARE"

        # ── Controlla se già importata ──
        existing = fc.execute(
            "SELECT id, stato, data_scadenza, totale, numero_fattura, banca_movimento_id FROM cg_uscite WHERE fattura_id = ?",
            (fattura_id,)
        ).fetchone()

        if existing:
            ex = dict(existing)
            # Se già PAGATA, PAGATA_MANUALE o PARZIALE, non toccare
            # ECCEZIONE: se c'è un cross-ref nuovo non ancora propagato, aggiorna
            if ex["stato"] in ("PAGATA", "PAGATA_MANUALE", "PARZIALE"):
                if linked_mov and not ex.get("banca_movimento_id"):
                    # Cross-ref esiste ma non era propagato — aggiorna
                    fc.execute("""
                        UPDATE cg_uscite
                        SET banca_movimento_id = ?, stato = 'PAGATA',
                            importo_pagato = totale,
                            data_pagamento = COALESCE(data_pagamento, ?),
                            updated_at = ?
                        WHERE id = ?
                    """, (linked_mov, linked_data, oggi_str, ex["id"]))
                    aggiornate += 1
                else:
                    saltate += 1
                continue
            # Se DA_PAGARE/SCADUTA ma ha cross-ref → marca PAGATA
            if linked_mov:
                fc.execute("""
                    UPDATE cg_uscite
                    SET stato = 'PAGATA', banca_movimento_id = ?,
                        importo_pagato = totale,
                        data_pagamento = COALESCE(data_pagamento, ?),
                        data_scadenza = ?, totale = ?,
                        numero_fattura = ?, data_fattura = ?,
                        fornitore_nome = ?, fornitore_piva = ?,
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
            # Nuova uscita — se ha cross-ref, inserisci già come PAGATA
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
          AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
          AND (f.totale_fattura <= 0 OR f.totale_fattura IS NULL)
          AND cu.totale > 0
    """).fetchall()
    for az in fatture_azzerate:
        fc.execute("""
            UPDATE cg_uscite SET totale = 0, stato = 'PAGATA', note = 'Fattura azzerata/stornata', updated_at = ?
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
                stato_sf = "SCADUTA" if data_scad < oggi_str else "DA_PAGARE"
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
                      AND stato NOT IN ('PAGATA', 'PAGATA_MANUALE', 'PARZIALE')
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

                # Importo: dal piano rate se esiste, altrimenti fisso dalla spesa
                importo_rata = sf["importo"]
                nota_rata = None
                try:
                    pr = fc.execute(
                        "SELECT importo, note FROM cg_piano_rate WHERE spesa_fissa_id = ? AND periodo = ?",
                        (sf["id"], periodo)
                    ).fetchone()
                    if pr:
                        importo_rata = pr["importo"]
                        nota_rata = pr["note"]
                except Exception:
                    pass  # Tabella non ancora creata

                existing = fc.execute(
                    "SELECT id, stato FROM cg_uscite WHERE spesa_fissa_id = ? AND periodo_riferimento = ?",
                    (sf["id"], periodo)
                ).fetchone()
                if not existing:
                    stato_sf = "SCADUTA" if data_scad < oggi_str else "DA_PAGARE"
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
                    if ex["stato"] not in ("PAGATA", "PAGATA_MANUALE", "PARZIALE"):
                        new_stato = "SCADUTA" if data_scad < oggi_str else "DA_PAGARE"
                        # Sync titolo, importo e stato
                        fc.execute("""
                            UPDATE cg_uscite SET fornitore_nome = ?, totale = ?, stato = ?, updated_at = ?
                            WHERE id = ?
                        """, (sf["titolo"], importo_rata, new_stato, oggi_str, ex["id"]))
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
    current_user=Depends(get_current_user),
):
    """
    Tabellone uscite (v2.0 — CG aggregatore).
    cg_uscite resta indice di workflow; per le righe FATTURA la "verità" dei
    campi di pianificazione finanziaria (data scadenza effettiva, IBAN,
    modalità pagamento) viene letta da fe_fatture via JOIN.
    Filtri: stato (DA_PAGARE, SCADUTA, PAGATA, PARZIALE), fornitore, range scadenza.
    """
    fc = get_fc_db()
    oggi_str = date.today().isoformat()

    # Filtro fisso: nascondi rateizzate di default (riattivabili con includi_rateizzate)
    where = ["(:includi_rateizzate = 1 OR (f.rateizzata_in_spesa_fissa_id IS NULL AND u.stato <> 'RATEIZZATA'))"]
    params: dict = {"includi_rateizzate": 1 if includi_rateizzate else 0}

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
                WHEN u.stato = 'RATEIZZATA' THEN 1
                ELSE 0
            END                              AS is_rateizzata,

            -- Stato normalizzato (display): fa vedere come RATEIZZATA/PAGATA
            -- anche quando cg_uscite non è ancora allineata
            CASE
                WHEN f.rateizzata_in_spesa_fissa_id IS NOT NULL THEN 'RATEIZZATA'
                WHEN u.stato = 'RATEIZZATA' THEN 'RATEIZZATA'
                WHEN f.data_effettiva_pagamento IS NOT NULL AND u.stato NOT IN ('PAGATA','PAGATA_MANUALE','PARZIALE')
                     THEN 'PAGATA'
                ELSE u.stato
            END                              AS stato

        FROM cg_uscite u
        LEFT JOIN fe_fatture         f  ON u.fattura_id         = f.id
        LEFT JOIN suppliers          s  ON u.fornitore_piva     = s.partita_iva
        LEFT JOIN cg_spese_fisse     sf ON u.spesa_fissa_id     = sf.id
        LEFT JOIN cg_pagamenti_batch pb ON u.pagamento_batch_id = pb.id
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
            _sf_tipo_labels = {"AFFITTO": "Affitto", "TASSA": "Tassa", "STIPENDIO": "Stipendio",
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
    totale_da_pagare = sum(r["totale"] - r["importo_pagato"] for r in rows if r["stato"] == "DA_PAGARE")
    totale_scadute = sum(r["totale"] - r["importo_pagato"] for r in rows if r["stato"] == "SCADUTA")
    stati_pagata = ("PAGATA", "PAGATA_MANUALE", "PARZIALE")
    totale_pagate = sum(r["importo_pagato"] for r in rows if r["stato"] in stati_pagata)
    n_senza_scadenza = sum(1 for r in rows if r["data_scadenza"] is None and r["stato"] not in stati_pagata)
    n_pagata_manuale = sum(1 for r in rows if r["stato"] == "PAGATA_MANUALE")
    n_riconciliate = sum(1 for r in rows if r.get("banca_movimento_id"))
    n_da_riconciliare = sum(1 for r in rows if r["stato"] == "PAGATA_MANUALE" and not r.get("banca_movimento_id"))

    fc.close()

    return {
        "uscite": rows,
        "riepilogo": {
            "totale_da_pagare": round(totale_da_pagare, 2),
            "totale_scadute": round(totale_scadute, 2),
            "totale_pagate": round(totale_pagate, 2),
            "num_da_pagare": sum(1 for r in rows if r["stato"] == "DA_PAGARE"),
            "num_scadute": sum(1 for r in rows if r["stato"] == "SCADUTA"),
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

@router.get("/uscite/senza-scadenza")
def get_fatture_senza_scadenza(
    current_user=Depends(get_current_user),
):
    """
    Lista fatture importate in cg_uscite che non hanno data_scadenza.
    Queste richiedono: configurare giorni_pagamento sul fornitore,
    oppure scadenza manuale.
    """
    fc = get_fc_db()
    rows = fc.execute("""
        SELECT
            u.id, u.fattura_id, u.fornitore_nome, u.fornitore_piva,
            u.numero_fattura, u.data_fattura, u.totale,
            s.id AS supplier_id,
            s.modalita_pagamento_default,
            s.giorni_pagamento
        FROM cg_uscite u
        LEFT JOIN suppliers s ON u.fornitore_piva = s.partita_iva
        WHERE u.data_scadenza IS NULL
          AND u.stato NOT IN ('PAGATA')
        ORDER BY u.totale DESC
    """).fetchall()
    fc.close()

    return {
        "fatture": [dict(r) for r in rows],
        "count": len(rows),
    }


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


@router.get("/mp-labels")
def get_mp_labels(current_user=Depends(get_current_user)):
    """Ritorna il mapping codici modalità pagamento FatturaPA → label italiane."""
    return MP_LABELS


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

TIPO_SPESA = ("AFFITTO", "TASSA", "STIPENDIO", "PRESTITO", "RATEIZZAZIONE", "ASSICURAZIONE", "ALTRO")
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
            SUM(CASE WHEN stato IN ('PAGATA','PAGATA_MANUALE','PARZIALE')
                     THEN COALESCE(importo_pagato, 0) ELSE 0 END) AS totale_pagato,
            SUM(CASE WHEN stato IN ('DA_PAGARE','SCADUTA','PARZIALE')
                     THEN COALESCE(totale, 0) - COALESCE(importo_pagato, 0) ELSE 0 END) AS totale_residuo,
            SUM(CASE WHEN stato IN ('PAGATA','PAGATA_MANUALE') THEN 1 ELSE 0 END) AS n_pagate,
            SUM(CASE WHEN stato = 'DA_PAGARE' THEN 1 ELSE 0 END) AS n_da_pagare,
            SUM(CASE WHEN stato = 'SCADUTA' THEN 1 ELSE 0 END) AS n_scadute,
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
        fc.execute("""
            INSERT INTO cg_spese_fisse
                (tipo, titolo, descrizione, importo, frequenza, giorno_scadenza,
                 data_inizio, data_fine, note, iban, attiva,
                 importo_originale, spese_legali)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
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

                # Stato: se scaduta → SCADUTA, altrimenti DA_PAGARE
                try:
                    ds = date.fromisoformat(data_scad)
                    stato_u = "SCADUTA" if ds < oggi else "DA_PAGARE"
                except Exception:
                    stato_u = "DA_PAGARE"

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

    allowed = ("tipo", "titolo", "descrizione", "importo", "frequenza",
               "giorno_scadenza", "data_inizio", "data_fine", "note", "iban", "attiva")
    sets = []
    params = []
    for field in allowed:
        if field in payload:
            sets.append(f"{field} = ?")
            params.append(payload[field])
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
              AND stato NOT IN ('PAGATA', 'PAGATA_MANUALE', 'PARZIALE')
        """, upd_params)

    fc.commit()
    fc.close()
    return {"ok": True}


@router.delete("/spese-fisse/{spesa_id}")
def delete_spesa_fissa(
    spesa_id: int,
    current_user=Depends(get_current_user),
):
    """Elimina una spesa fissa."""
    fc = get_fc_db()
    fc.execute("DELETE FROM cg_spese_fisse WHERE id = ?", (spesa_id,))
    fc.commit()
    fc.close()
    return {"ok": True}


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
    """
    fc = get_fc_db()
    try:
        # Meta spesa fissa (titolo, tipo, importo riferimento)
        sf_row = fc.execute(
            "SELECT id, tipo, titolo, importo, data_inizio, data_fine FROM cg_spese_fisse WHERE id = ?",
            (spesa_id,)
        ).fetchone()
        spesa = dict(sf_row) if sf_row else None

        # Piano rate + LEFT JOIN con cg_uscite (per stato + importo effettivamente pagato)
        rows = fc.execute("""
            SELECT
                pr.id, pr.numero_rata, pr.periodo, pr.importo, pr.note,
                u.id              AS uscita_id,
                u.stato           AS uscita_stato,
                u.data_scadenza   AS uscita_scadenza,
                u.importo_pagato  AS uscita_pagato,
                u.data_pagamento  AS uscita_data_pagamento,
                u.totale          AS uscita_totale
            FROM cg_piano_rate pr
            LEFT JOIN cg_uscite u
              ON u.spesa_fissa_id = pr.spesa_fissa_id
             AND u.periodo_riferimento = pr.periodo
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
        for r in rows:
            d = dict(r)
            imp = float(d.get("importo") or 0)
            tot_pianificato += imp
            stato = d.get("uscita_stato")
            if stato in ("PAGATA", "PAGATA_MANUALE"):
                n_pagate += 1
                tot_pagato += float(d.get("uscita_pagato") or 0)
            elif stato == "PARZIALE":
                n_pagate += 1
                tot_pagato += float(d.get("uscita_pagato") or 0)
                tot_residuo += max(float(d.get("uscita_totale") or imp) - float(d.get("uscita_pagato") or 0), 0)
            elif stato == "SCADUTA":
                n_scadute += 1
                tot_residuo += imp
            elif stato == "DA_PAGARE":
                n_da_pagare += 1
                tot_residuo += imp
            else:
                # Nessuna uscita associata (rata nel piano senza scadenza generata)
                tot_residuo += imp
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
    Body: { rate: [{ numero_rata, periodo, importo, note? }] }
    oppure: { numero_rata, periodo, importo, note? }

    Se sync_uscite = true (default), aggiorna anche l'importo (totale) delle
    cg_uscite collegate per quel periodo, purché non siano già PAGATA / PAGATA_MANUALE / PARZIALE.
    """
    fc = get_fc_db()
    try:
        rate_input = payload.get("rate", [payload] if "periodo" in payload else [])
        sync_uscite = bool(payload.get("sync_uscite", True))
        inserite = 0
        uscite_aggiornate = 0
        oggi_str = date.today().isoformat()
        for r in rate_input:
            periodo = r.get("periodo")
            importo = r.get("importo")
            if not periodo or importo is None:
                continue
            try:
                fc.execute("""
                    INSERT INTO cg_piano_rate (spesa_fissa_id, numero_rata, periodo, importo, note)
                    VALUES (?, ?, ?, ?, ?)
                """, (spesa_id, r.get("numero_rata", 0), periodo, importo, r.get("note")))
                inserite += 1
            except Exception:
                # Duplicato (spesa_fissa_id + periodo) — aggiorna
                fc.execute("""
                    UPDATE cg_piano_rate SET importo = ?, numero_rata = ?, note = ?
                    WHERE spesa_fissa_id = ? AND periodo = ?
                """, (importo, r.get("numero_rata", 0), r.get("note"), spesa_id, periodo))
                inserite += 1

            # Propaga sul tabellone uscite (solo righe non ancora pagate)
            if sync_uscite:
                cur = fc.execute("""
                    UPDATE cg_uscite
                       SET totale = ?, updated_at = ?
                     WHERE spesa_fissa_id = ?
                       AND periodo_riferimento = ?
                       AND stato NOT IN ('PAGATA', 'PAGATA_MANUALE', 'PARZIALE')
                """, (float(importo), oggi_str, spesa_id, periodo))
                uscite_aggiornate += cur.rowcount or 0
        fc.commit()
        return {"ok": True, "inserite": inserite, "uscite_aggiornate": uscite_aggiornate}
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
    ricalcolato rispetto a oggi: SCADUTA se nuova < oggi, altrimenti
    DA_PAGARE (solo quando lo stato attuale è DA_PAGARE o SCADUTA).

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
        if row["stato"] == "PAGATA":
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

        # Ricalcola stato workflow (sempre su cg_uscite): SCADUTA se < oggi, DA_PAGARE altrimenti
        oggi = date.today().isoformat()
        if nuova < oggi and row["stato"] == "DA_PAGARE":
            conn.execute("UPDATE cg_uscite SET stato = 'SCADUTA', updated_at = datetime('now') WHERE id = ?", [uscita_id])
        elif nuova >= oggi and row["stato"] == "SCADUTA":
            conn.execute("UPDATE cg_uscite SET stato = 'DA_PAGARE', updated_at = datetime('now') WHERE id = ?", [uscita_id])

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
        if row["stato"] == "PAGATA":
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
        if row["stato"] == "PAGATA":
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

    - CONTANTI → stato = PAGATA (il modulo contanti è la riconciliazione)
    - Altri metodi → stato = PAGATA_MANUALE (richiede riconciliazione banca)
    Non tocca righe già PAGATA (riconciliate via banca).
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
    nuovo_stato = "PAGATA" if metodo == "CONTANTI" else "PAGATA_MANUALE"

    conn = get_fc_db()
    try:
        placeholders = ",".join("?" * len(ids))
        # Aggiorna solo righe DA_PAGARE, SCADUTA o PARZIALE (non toccare PAGATA già riconciliate)
        conn.execute(f"""
            UPDATE cg_uscite
            SET stato = ?,
                metodo_pagamento = ?,
                data_pagamento = ?,
                importo_pagato = totale
            WHERE id IN ({placeholders})
              AND stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE', 'PAGATA_MANUALE')
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
        # Calcola totale e conteggio dalle uscite effettive (non pagate)
        agg = conn.execute(f"""
            SELECT COUNT(*) AS n, COALESCE(SUM(totale - importo_pagato), 0) AS tot
            FROM cg_uscite
            WHERE id IN ({placeholders})
              AND stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE')
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
              AND stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE')
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
                sf.iban AS sf_iban
            FROM cg_uscite u
            LEFT JOIN suppliers s ON u.fornitore_piva = s.partita_iva
            LEFT JOIN cg_spese_fisse sf ON u.spesa_fissa_id = sf.id
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
                sf.iban AS sf_iban
            FROM cg_uscite u
            LEFT JOIN suppliers s ON u.fornitore_piva = s.partita_iva
            LEFT JOIN cg_spese_fisse sf ON u.spesa_fissa_id = sf.id
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


# ── Segna pagata singola fattura (da Acquisti) ───────────────────
@router.post("/fattura/{fattura_id}/segna-pagata-manuale")
def segna_pagata_manuale(
    fattura_id: int,
    payload: dict = Body(default={}),
    current_user=Depends(get_current_user),
):
    """
    Segna una fattura come PAGATA_MANUALE (in attesa di riconciliazione banca).
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

    nuovo_stato = "PAGATA" if metodo == "CONTANTI" else "PAGATA_MANUALE"

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
            if uscita["stato"] == "PAGATA":
                return {"ok": False, "error": "Fattura già riconciliata via banca"}
            # Aggiorna stato
            fc.execute("""
                UPDATE cg_uscite
                SET stato = ?, metodo_pagamento = ?, data_pagamento = ?,
                    importo_pagato = totale, updated_at = CURRENT_TIMESTAMP
                WHERE fattura_id = ? AND stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE', 'PAGATA_MANUALE')
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

        # Aggiorna fe_fatture.pagato
        fc.execute("UPDATE fe_fatture SET pagato = 1 WHERE id = ?", (fattura_id,))
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
    Effetto: banca_movimento_id viene salvato, stato → PAGATA.
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

    fc.execute("""
        UPDATE cg_uscite
        SET banca_movimento_id = ?,
            stato = 'PAGATA',
            data_pagamento = COALESCE(data_pagamento, ?),
            importo_pagato = totale,
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

    return {"ok": True, "nuovo_stato": "PAGATA"}


@router.delete("/uscite/{uscita_id}/riconcilia")
def scollega_uscita(
    uscita_id: int,
    current_user=Depends(get_current_user),
):
    """
    Scollega un'uscita dal movimento bancario.
    Riporta lo stato a PAGATA_MANUALE.
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
            stato = 'PAGATA_MANUALE',
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

    return {"ok": True, "nuovo_stato": "PAGATA_MANUALE"}


# ═══════════════════════════════════════════════════════════════════
# MOVIMENTI CONTANTI — pagamenti cash collegati a uscite CG
# ═══════════════════════════════════════════════════════════════════

@router.get("/movimenti-contanti")
def get_movimenti_contanti(
    anno: int = Query(None),
    mese: int = Query(None),
    current_user=Depends(get_current_user),
):
    """
    Lista uscite pagate in contanti (metodo_pagamento = 'CONTANTI').
    Filtrabili per anno/mese di data_pagamento.
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

    # Pulizia 1: marca PAGATA le uscite la cui fattura sorgente è stata azzerata
    fc.execute("""
        UPDATE cg_uscite SET totale = 0, stato = 'PAGATA',
            note = COALESCE(note, '') || ' [azzerata da sconto/storno]',
            updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IS NOT NULL
          AND stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE')
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
        WHERE stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE')
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
          AND stato NOT IN ('PAGATA', 'PAGATA_MANUALE', 'PARZIALE')
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
