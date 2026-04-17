# app/services/liquidita_service.py
# @version: v1.0
#
# Aggregatore Liquidita' per Controllo di Gestione.
#
# Questa sezione risponde al PRINCIPIO DI CASSA (entrate/uscite quando arrivano
# in banca), complementare alla dashboard CG principale che invece usa il
# PRINCIPIO DI COMPETENZA (vendite attribuite al giorno in cui sono state fatte).
#
# Fonte dati unica: banca_movimenti (foodcost.db).
#
# Tassonomia entrate custom (la categoria_banca del feed BPM e' incompleta:
# molti POS arrivano senza categoria, quindi classifichiamo anche per pattern
# su descrizione + ragione_sociale + sottocategoria_banca):
#   - POS carte/bancomat  -> "POS"
#   - Versamenti contanti -> "Contanti"
#   - Bonifici clienti    -> "Bonifici"
#   - Rimborsi / altro    -> "Altro"
#
# Ispirato a vendite_aggregator.py per la disciplina "una sola sorgente di verita".

import sqlite3
from datetime import date, timedelta
from typing import Dict, List, Tuple


# ══════════════════════════════════════════════
# Classificazione entrate
# ══════════════════════════════════════════════

def classify_entrata(row: sqlite3.Row) -> str:
    """
    Ritorna uno dei tag: POS, Contanti, Bonifici, Altro.

    Logica:
      - se descrizione contiene "inc.pos" / "incas. tramite p.o.s" / "pos" oppure
        la sottocategoria_banca contiene "POS" -> POS
      - se descrizione contiene "vers" + "contant" oppure sottocategoria = "Deposito contanti" -> Contanti
      - se categoria_banca = "Ricavi" oppure sottocategoria_banca contiene "Bonifico" -> Bonifici
      - altrimenti -> Altro (finanziamenti, rimborsi, giroconti, misti)
    """
    descr = (row["descrizione"] or "").lower()
    cat = (row["categoria_banca"] or "")
    sub = (row["sottocategoria_banca"] or "")

    if ("inc.pos" in descr) or ("incas. tramite p.o.s" in descr) or \
       ("p.o.s" in descr and "incas" in descr) or ("POS" in sub):
        return "POS"

    if ("vers" in descr and "contant" in descr) or (sub == "Deposito contanti"):
        return "Contanti"

    if cat == "Ricavi" or "Bonifico" in sub or "bonifico" in descr:
        return "Bonifici"

    return "Altro"


# ══════════════════════════════════════════════
# Query helpers
# ══════════════════════════════════════════════

def _range_mese(anno: int, mese: int) -> Tuple[str, str]:
    """Ritorna (primo_giorno_incl, primo_del_mese_successivo_escl) in YYYY-MM-DD."""
    primo = f"{anno}-{mese:02d}-01"
    if mese == 12:
        next_primo = f"{anno + 1}-01-01"
    else:
        next_primo = f"{anno}-{mese + 1:02d}-01"
    return primo, next_primo


def _fmt_mese(m: int) -> str:
    nomi = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
            "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    return nomi[m] if 1 <= m <= 12 else f"M{m}"


# ══════════════════════════════════════════════
# SALDO ATTUALE (cumulativo all'ultimo movimento)
# ══════════════════════════════════════════════

def saldo_attuale(conn: sqlite3.Connection) -> Dict:
    """
    Saldo cumulativo = somma di tutti gli importi. La data di riferimento e'
    quella dell'ultimo movimento contabile.
    """
    r = conn.execute("""
        SELECT COALESCE(SUM(importo), 0) AS saldo,
               MAX(data_contabile) AS ultima_data,
               COUNT(*) AS n_movimenti
        FROM banca_movimenti
    """).fetchone()
    return {
        "saldo": round(r["saldo"] or 0, 2),
        "data_riferimento": r["ultima_data"],
        "num_movimenti_totali": r["n_movimenti"] or 0,
    }


# ══════════════════════════════════════════════
# KPI MESE CORRENTE — con breakdown entrate/uscite
# ══════════════════════════════════════════════

def kpi_mese(conn: sqlite3.Connection, anno: int, mese: int) -> Dict:
    primo, next_primo = _range_mese(anno, mese)

    # Totali base
    tot = conn.execute("""
        SELECT
            COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END), 0) AS entrate,
            COALESCE(SUM(CASE WHEN importo < 0 THEN importo ELSE 0 END), 0) AS uscite
        FROM banca_movimenti
        WHERE data_contabile >= ? AND data_contabile < ?
    """, (primo, next_primo)).fetchone()

    entrate = round(tot["entrate"] or 0, 2)
    uscite = round(tot["uscite"] or 0, 2)  # valore negativo
    delta = round(entrate + uscite, 2)  # entrate - |uscite|

    # Breakdown entrate per tipo (classificazione custom)
    entrate_rows = conn.execute("""
        SELECT id, ragione_sociale, categoria_banca, sottocategoria_banca,
               descrizione, importo
        FROM banca_movimenti
        WHERE data_contabile >= ? AND data_contabile < ? AND importo > 0
    """, (primo, next_primo)).fetchall()

    buckets: Dict[str, Dict] = {
        "POS":       {"tipo": "POS",       "totale": 0.0, "num": 0},
        "Contanti":  {"tipo": "Contanti",  "totale": 0.0, "num": 0},
        "Bonifici":  {"tipo": "Bonifici",  "totale": 0.0, "num": 0},
        "Altro":     {"tipo": "Altro",     "totale": 0.0, "num": 0},
    }
    for r in entrate_rows:
        tipo = classify_entrata(r)
        buckets[tipo]["totale"] += r["importo"]
        buckets[tipo]["num"] += 1
    entrate_per_tipo = [
        {"tipo": b["tipo"], "totale": round(b["totale"], 2), "num": b["num"]}
        for b in buckets.values()
    ]

    # Breakdown uscite per categoria_banca (quella gia' nel feed)
    uscite_per_cat = conn.execute("""
        SELECT
            CASE WHEN COALESCE(categoria_banca,'')='' THEN 'Non categorizzato'
                 ELSE categoria_banca END AS categoria,
            COUNT(*) AS num,
            COALESCE(SUM(ABS(importo)), 0) AS totale
        FROM banca_movimenti
        WHERE data_contabile >= ? AND data_contabile < ? AND importo < 0
        GROUP BY categoria
        ORDER BY totale DESC
    """, (primo, next_primo)).fetchall()

    return {
        "anno": anno,
        "mese": mese,
        "mese_label": _fmt_mese(mese),
        "periodo": f"{_fmt_mese(mese)} {anno}",
        "num_movimenti": tot["n"] or 0,
        "entrate_totali": entrate,
        "uscite_totali": round(abs(uscite), 2),
        "delta": delta,
        "entrate_per_tipo": entrate_per_tipo,
        "uscite_per_categoria": [
            {"categoria": r["categoria"], "totale": round(r["totale"], 2), "num": r["num"]}
            for r in uscite_per_cat
        ],
    }


# ══════════════════════════════════════════════
# PERIODO 90 GIORNI (rolling)
# ══════════════════════════════════════════════

def kpi_periodo_90gg(conn: sqlite3.Connection, data_riferimento: str) -> Dict:
    """
    Finestra rolling 90 giorni terminante a data_riferimento (inclusiva).
    """
    dr = date.fromisoformat(data_riferimento)
    da = (dr - timedelta(days=89)).isoformat()  # 90 giorni inclusivi

    r = conn.execute("""
        SELECT
            COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END), 0) AS entrate,
            COALESCE(SUM(CASE WHEN importo < 0 THEN importo ELSE 0 END), 0) AS uscite
        FROM banca_movimenti
        WHERE data_contabile >= ? AND data_contabile <= ?
    """, (da, data_riferimento)).fetchone()

    entrate = round(r["entrate"] or 0, 2)
    uscite = round(r["uscite"] or 0, 2)
    media_entrate = round(entrate / 90, 2)

    return {
        "data_inizio": da,
        "data_fine": data_riferimento,
        "num_movimenti": r["n"] or 0,
        "entrate_totali": entrate,
        "uscite_totali": round(abs(uscite), 2),
        "delta": round(entrate + uscite, 2),
        "media_entrate_giorno": media_entrate,
    }


# ══════════════════════════════════════════════
# TREND SALDO (linea cumulativa ultimi 90 giorni)
# ══════════════════════════════════════════════

def trend_saldo(conn: sqlite3.Connection, giorni: int = 90) -> List[Dict]:
    """
    Lista di punti (data, saldo) con saldo cumulativo progressivo.
    Parte dal saldo all'inizio del periodo e avanza giorno per giorno.
    Solo i giorni con movimenti compaiono nel risultato (per non sovraccaricare
    il grafico con ~90 punti identici).
    """
    dr = conn.execute("SELECT MAX(data_contabile) AS maxd FROM banca_movimenti").fetchone()
    if not dr["maxd"]:
        return []
    data_fine = dr["maxd"]
    data_inizio = (date.fromisoformat(data_fine) - timedelta(days=giorni - 1)).isoformat()

    # Saldo iniziale = somma di tutti i movimenti prima del periodo
    saldo0 = conn.execute("""
        SELECT COALESCE(SUM(importo), 0) AS s
        FROM banca_movimenti
        WHERE data_contabile < ?
    """, (data_inizio,)).fetchone()["s"]

    # Delta giornalieri nel periodo
    rows = conn.execute("""
        SELECT data_contabile AS d, COALESCE(SUM(importo), 0) AS delta
        FROM banca_movimenti
        WHERE data_contabile >= ? AND data_contabile <= ?
        GROUP BY data_contabile
        ORDER BY data_contabile
    """, (data_inizio, data_fine)).fetchall()

    serie = []
    saldo = saldo0
    for r in rows:
        saldo += r["delta"]
        serie.append({"data": r["d"], "saldo": round(saldo, 2)})

    return serie


# ══════════════════════════════════════════════
# ENTRATE MENSILI (anno corrente, 12 mesi) — breakdown per tipo
# ══════════════════════════════════════════════

def entrate_mensili_anno(conn: sqlite3.Connection, anno: int) -> List[Dict]:
    """
    Per ogni mese dell'anno ritorna: pos, contanti, bonifici, altro, totale.
    """
    primo = f"{anno}-01-01"
    next_primo = f"{anno + 1}-01-01"

    rows = conn.execute("""
        SELECT id, ragione_sociale, categoria_banca, sottocategoria_banca,
               descrizione, importo, data_contabile
        FROM banca_movimenti
        WHERE data_contabile >= ? AND data_contabile < ? AND importo > 0
    """, (primo, next_primo)).fetchall()

    mesi: Dict[int, Dict] = {
        m: {"mese": m, "mese_label": _fmt_mese(m),
            "POS": 0.0, "Contanti": 0.0, "Bonifici": 0.0, "Altro": 0.0,
            "totale": 0.0}
        for m in range(1, 13)
    }
    for r in rows:
        try:
            m = int(r["data_contabile"][5:7])
        except Exception:
            continue
        if m < 1 or m > 12:
            continue
        tipo = classify_entrata(r)
        mesi[m][tipo] += r["importo"]
        mesi[m]["totale"] += r["importo"]

    return [
        {**{k: (round(v, 2) if isinstance(v, float) else v) for k, v in mesi[m].items()}}
        for m in range(1, 13)
    ]


# ══════════════════════════════════════════════
# CONFRONTO YoY — entrate mensili anno corrente vs precedente
# ══════════════════════════════════════════════

def confronto_yoy(conn: sqlite3.Connection, anno: int) -> List[Dict]:
    """
    Entrate mensili anno corrente vs anno precedente.
    Utile per intuire stagionalita'.
    """
    corrente = entrate_mensili_anno(conn, anno)
    prec = entrate_mensili_anno(conn, anno - 1)
    return [
        {
            "mese": m,
            "mese_label": _fmt_mese(m),
            "anno_corrente": corrente[m - 1]["totale"],
            "anno_prec": prec[m - 1]["totale"],
        }
        for m in range(1, 13)
    ]


# ══════════════════════════════════════════════
# ULTIME ENTRATE — tabella compatta
# ══════════════════════════════════════════════

def ultime_entrate(conn: sqlite3.Connection, limit: int = 15) -> List[Dict]:
    rows = conn.execute("""
        SELECT id, data_contabile, ragione_sociale, categoria_banca,
               sottocategoria_banca, descrizione, importo
        FROM banca_movimenti
        WHERE importo > 0
        ORDER BY data_contabile DESC, id DESC
        LIMIT ?
    """, (limit,)).fetchall()

    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "data": r["data_contabile"],
            "ragione_sociale": r["ragione_sociale"] or "",
            "descrizione": r["descrizione"] or "",
            "importo": round(r["importo"], 2),
            "tipo": classify_entrata(r),
        })
    return out


# ══════════════════════════════════════════════
# ENTRY POINT UNICO — un colpo solo, un DB call set
# ══════════════════════════════════════════════

def dashboard_liquidita(
    conn: sqlite3.Connection,
    anno: int,
    mese: int,
) -> Dict:
    """
    Assembla tutti i blocchi in un unico payload per la UI.
    """
    saldo = saldo_attuale(conn)
    mc = kpi_mese(conn, anno, mese)
    # 90gg prende come riferimento l'ultima data nota, non oggi
    ref_date = saldo["data_riferimento"] or date.today().isoformat()
    p90 = kpi_periodo_90gg(conn, ref_date)
    trend = trend_saldo(conn, giorni=90)
    mensili = entrate_mensili_anno(conn, anno)
    yoy = confronto_yoy(conn, anno)
    ultime = ultime_entrate(conn, limit=15)

    return {
        "anno": anno,
        "mese": mese,
        "periodo": mc["periodo"],
        "saldo_attuale": saldo,
        "mese_corrente": mc,
        "periodo_90gg": p90,
        "trend_saldo": trend,
        "entrate_mensili": mensili,
        "confronto_yoy": yoy,
        "ultime_entrate": ultime,
    }
