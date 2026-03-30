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
    fatture = fc.execute("""
        SELECT
            f.id, f.fornitore_nome, f.fornitore_piva,
            f.numero_fattura, f.data_fattura,
            f.totale_fattura, f.data_scadenza,
            f.condizioni_pagamento, f.modalita_pagamento,
            s.giorni_pagamento AS fornitore_giorni,
            s.modalita_pagamento_default AS fornitore_mp
        FROM fe_fatture f
        LEFT JOIN suppliers s ON f.fornitore_piva = s.partita_iva
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

        # ── Calcola stato ──
        if data_scad and data_scad < oggi_str:
            stato = "SCADUTA"
        else:
            stato = "DA_PAGARE"

        # ── Controlla se già importata ──
        existing = fc.execute(
            "SELECT id, stato, data_scadenza FROM cg_uscite WHERE fattura_id = ?",
            (fattura_id,)
        ).fetchone()

        if existing:
            ex = dict(existing)
            # Se già PAGATA, PAGATA_MANUALE o PARZIALE, non toccare
            if ex["stato"] in ("PAGATA", "PAGATA_MANUALE", "PARZIALE"):
                saltate += 1
                continue
            # Aggiorna stato e scadenza se cambiati
            if ex["stato"] != stato or ex["data_scadenza"] != data_scad:
                fc.execute("""
                    UPDATE cg_uscite
                    SET stato = ?, data_scadenza = ?, updated_at = ?
                    WHERE id = ?
                """, (stato, data_scad, oggi_str, ex["id"]))
                aggiornate += 1
            else:
                saltate += 1
        else:
            # Nuova uscita
            fc.execute("""
                INSERT INTO cg_uscite (
                    fattura_id, fornitore_nome, fornitore_piva,
                    numero_fattura, data_fattura, totale,
                    data_scadenza, stato, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                fattura_id, fat["fornitore_nome"], fat["fornitore_piva"],
                fat["numero_fattura"], fat["data_fattura"],
                fat["totale_fattura"],
                data_scad, stato, oggi_str, oggi_str,
            ))
            importate += 1

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
                            stato, periodo_riferimento, created_at, updated_at
                        ) VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        sf["id"], sf["titolo"],
                        sf["tipo"], sf["importo"], data_scad,
                        stato_sf, periodo, oggi_str, oggi_str,
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
                        """, (sf["titolo"], sf["importo"], new_stato, oggi_str, ex["id"]))
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
    current_user=Depends(get_current_user),
):
    """
    Tabellone uscite.
    Filtri: stato (DA_PAGARE, SCADUTA, PAGATA, PARZIALE), fornitore, range scadenza.
    """
    fc = get_fc_db()
    oggi_str = date.today().isoformat()

    where = []
    params = []

    if stato:
        where.append("u.stato = ?")
        params.append(stato)
    if fornitore:
        where.append("u.fornitore_nome LIKE ?")
        params.append(f"%{fornitore}%")
    if da:
        where.append("u.data_scadenza >= ?")
        params.append(da)
    if a:
        where.append("u.data_scadenza <= ?")
        params.append(a)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    ordine_map = {
        "scadenza_asc": "u.data_scadenza ASC NULLS LAST",
        "scadenza_desc": "u.data_scadenza DESC NULLS LAST",
        "importo_asc": "u.totale ASC",
        "importo_desc": "u.totale DESC",
        "fornitore": "u.fornitore_nome ASC",
        "data_fattura": "u.data_fattura DESC",
    }
    order_sql = ordine_map.get(ordine, "u.data_scadenza ASC NULLS LAST")

    uscite = fc.execute(f"""
        SELECT
            u.*,
            f.modalita_pagamento AS mp_xml,
            f.condizioni_pagamento AS cp_xml,
            s.modalita_pagamento_default AS mp_fornitore,
            s.giorni_pagamento AS giorni_fornitore,
            sf.tipo AS sf_tipo,
            sf.frequenza AS sf_frequenza,
            sf.titolo AS sf_titolo
        FROM cg_uscite u
        LEFT JOIN fe_fatture f ON u.fattura_id = f.id
        LEFT JOIN suppliers s ON u.fornitore_piva = s.partita_iva
        LEFT JOIN cg_spese_fisse sf ON u.spesa_fissa_id = sf.id
        {where_sql}
        ORDER BY {order_sql}
    """, params).fetchall()

    rows = []
    for r in uscite:
        row = dict(r)
        # Arricchisci con label modalità pagamento
        mp = row.get("mp_xml") or row.get("mp_fornitore")
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
        if row.get("mp_xml") or (r["data_scadenza"] and not row.get("giorni_fornitore")):
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
        "spese": [dict(r) for r in rows],
        "count": len(rows),
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
            data_inizio?, data_fine?, note? }
    """
    tipo = payload.get("tipo", "ALTRO")
    if tipo not in TIPO_SPESA:
        tipo = "ALTRO"
    freq = payload.get("frequenza", "MENSILE")
    if freq not in FREQ_SPESA:
        freq = "MENSILE"

    fc = get_fc_db()
    fc.execute("""
        INSERT INTO cg_spese_fisse
            (tipo, titolo, descrizione, importo, frequenza, giorno_scadenza,
             data_inizio, data_fine, note, iban, attiva)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
    ))
    fc.commit()
    new_id = fc.execute("SELECT last_insert_rowid()").fetchone()[0]
    fc.close()
    return {"ok": True, "id": new_id}


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


# ── Modifica scadenza singola uscita ───────────────────────────
@router.put("/uscite/{uscita_id}/scadenza")
def modifica_scadenza(
    uscita_id: int,
    payload: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """
    Cambia la data_scadenza di un'uscita.
    Body: { data_scadenza: "YYYY-MM-DD" }
    Se lo spostamento rispetto a data_scadenza_originale è > 10 giorni,
    il frontend lo mostrerà come 'arretrato'.
    Restituisce anche il delta in giorni per decidere lato client.
    """
    nuova = payload.get("data_scadenza")
    if not nuova:
        return {"ok": False, "error": "data_scadenza obbligatoria"}

    conn = get_fc_db()
    try:
        row = conn.execute(
            "SELECT id, data_scadenza, data_scadenza_originale, stato FROM cg_uscite WHERE id = ?",
            [uscita_id],
        ).fetchone()
        if not row:
            return {"ok": False, "error": "Uscita non trovata"}

        # Non permettere modifica se già pagata via banca
        if row["stato"] == "PAGATA":
            return {"ok": False, "error": "Impossibile modificare: uscita già riconciliata con banca"}

        originale = row["data_scadenza_originale"] or row["data_scadenza"]

        conn.execute("""
            UPDATE cg_uscite
            SET data_scadenza = ?,
                data_scadenza_originale = COALESCE(data_scadenza_originale, data_scadenza),
                updated_at = datetime('now')
            WHERE id = ?
        """, [nuova, uscita_id])

        # Ricalcola stato: se nuova scadenza < oggi e non pagata → SCADUTA
        oggi = date.today().isoformat()
        if nuova < oggi and row["stato"] in ("DA_PAGARE",):
            conn.execute("UPDATE cg_uscite SET stato = 'SCADUTA' WHERE id = ?", [uscita_id])
        elif nuova >= oggi and row["stato"] == "SCADUTA":
            conn.execute("UPDATE cg_uscite SET stato = 'DA_PAGARE' WHERE id = ?", [uscita_id])

        conn.commit()

        # Calcola delta giorni dall'originale
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
    Segna più uscite come PAGATA_MANUALE in un colpo solo.
    Body: { ids: [int], metodo_pagamento: str, data_pagamento?: str }
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

    conn = get_fc_db()
    try:
        placeholders = ",".join("?" * len(ids))
        # Aggiorna solo righe DA_PAGARE, SCADUTA o PARZIALE (non toccare PAGATA già riconciliate)
        conn.execute(f"""
            UPDATE cg_uscite
            SET stato = 'PAGATA_MANUALE',
                metodo_pagamento = ?,
                data_pagamento = ?,
                importo_pagato = totale
            WHERE id IN ({placeholders})
              AND stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE', 'PAGATA_MANUALE')
        """, [metodo, data_pag] + ids)
        aggiornate = conn.total_changes
        conn.commit()
        return {"ok": True, "aggiornate": aggiornate}
    finally:
        conn.close()


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
               data_fattura, totale, data_scadenza, importo_pagato,
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

    totale = sum(r["importo_pagato"] or r["totale"] or 0 for r in rows)
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
    sql = """
        SELECT id, fornitore_nome, fornitore_piva, numero_fattura,
               data_fattura, totale AS importo, data_scadenza, stato, tipo_uscita,
               periodo_riferimento, descrizione
        FROM cg_uscite
        WHERE stato IN ('DA_PAGARE', 'SCADUTA', 'PARZIALE')
    """
    params = []
    if search:
        sql += " AND (fornitore_nome LIKE ? OR numero_fattura LIKE ? OR descrizione LIKE ? OR periodo_riferimento LIKE ?)"
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
