# app/services/vendite_aggregator.py
# @version: v1.0
#
# Aggregatore vendite per Controllo di Gestione e altri consumer.
# Fonte primaria: shift_closures (turni registrati in app).
# Fallback: daily_closures (import Excel/legacy) per date non coperte dai turni.
#
# Principio: una sola sorgente di verita' per "quanto ha incassato l'osteria"
# un giorno. Qualsiasi modulo che voglia leggere le vendite DEVE passare da qui,
# mai fare SELECT diretta su daily_closures (rischio dati stantii) o solo su
# shift_closures (rischio di perdere lo storico pre-turni).
#
# Ispirato a _merge_shift_and_daily() in corrispettivi_export.py che fa la
# stessa cosa ma per il formato export Excel.

import sqlite3
from typing import Dict, List, Optional

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware. Modulo: statistiche (vendite cross-modulo).
VENDITE_DB = str(locale_data_path("admin_finance.sqlite3"))


def get_vendite_db() -> sqlite3.Connection:
    """Apri connessione al DB vendite con row_factory.

    Fix 1.11.2 (sessione 52) — WAL + synchronous=NORMAL + busy_timeout:
    prevenzione corruzioni sqlite_master su SIGTERM mid-write.
    """
    conn = sqlite3.connect(VENDITE_DB, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


# ══════════════════════════════════════════════
# CORE: merge shift + daily per range di date
# ══════════════════════════════════════════════

def giorni_merged(
    conn: sqlite3.Connection,
    date_from: str,
    date_to: str,
) -> List[Dict]:
    """
    Ritorna una lista di dict, uno per ogni giorno del range [date_from, date_to),
    fondendo shift_closures (primario) e daily_closures (fallback).

    Ogni dict ha i campi:
        date, corrispettivi, fatture, corrispettivi_tot,
        contanti, pos_bpm, pos_sella, theforkpay, other_e_payments,
        bonifici, mance

    date_from e date_to sono YYYY-MM-DD. date_to e' ESCLUSIVO (half-open).

    Logica:
    - shift_closures puo' avere 1 o 2 turni per giorno (pranzo/cena).
      La chiusura di cassa e' unica, quindi 'preconto', 'contanti', POS, ecc.
      si prendono dal turno "base" = cena se esiste, altrimenti pranzo.
      Le fatture sono additive (pranzo + cena).
    - daily_closures ha una riga per giorno, formato legacy.
    - Se per un giorno esiste shift_closures -> shift vince.
      Altrimenti -> si usa daily (se c'e').
    """
    # 1. Shift closures: una o due righe per giorno
    shift_rows = conn.execute("""
        SELECT date, turno, preconto, fatture, contanti,
               pos_bpm, pos_sella, theforkpay, other_e_payments,
               bonifici, mance
        FROM shift_closures
        WHERE date >= ? AND date < ?
        ORDER BY date ASC
    """, (date_from, date_to)).fetchall()

    shift_by_date: Dict[str, List[sqlite3.Row]] = {}
    for r in shift_rows:
        shift_by_date.setdefault(r["date"], []).append(r)

    shift_map: Dict[str, Dict] = {}
    for date_str, turni in shift_by_date.items():
        pranzo = next((t for t in turni if t["turno"] == "pranzo"), None)
        cena = next((t for t in turni if t["turno"] != "pranzo"), None)

        # Base giornaliera = cena se esiste (chiusura unica fine giornata),
        # altrimenti pranzo (pranzo-only).
        base = cena or pranzo

        chiusura = (base["preconto"] or 0) if base else 0
        fatture_tot = ((pranzo["fatture"] if pranzo else 0) or 0) + \
                      ((cena["fatture"] if cena else 0) or 0)

        shift_map[date_str] = {
            "date": date_str,
            "corrispettivi": float(chiusura),
            "fatture": float(fatture_tot),
            "corrispettivi_tot": float(chiusura + fatture_tot),
            "contanti": float((base["contanti"] or 0) if base else 0),
            "pos_bpm": float((base["pos_bpm"] or 0) if base else 0),
            "pos_sella": float((base["pos_sella"] or 0) if base else 0),
            "theforkpay": float((base["theforkpay"] or 0) if base else 0),
            "other_e_payments": float((base["other_e_payments"] or 0) if base else 0),
            "bonifici": float((base["bonifici"] or 0) if base else 0),
            "mance": float((base["mance"] or 0) if base else 0),
            "_source": "shift",
        }

    # 2. Daily closures: fallback
    daily_rows = conn.execute("""
        SELECT date, corrispettivi, fatture, corrispettivi_tot,
               contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
               bonifici, mance
        FROM daily_closures
        WHERE date >= ? AND date < ?
        ORDER BY date ASC
    """, (date_from, date_to)).fetchall()

    daily_map: Dict[str, Dict] = {}
    for r in daily_rows:
        corr = float(r["corrispettivi"] or 0)
        fat = float(r["fatture"] or 0)
        corr_tot = r["corrispettivi_tot"]
        daily_map[r["date"]] = {
            "date": r["date"],
            "corrispettivi": corr,
            "fatture": fat,
            "corrispettivi_tot": float(corr_tot) if corr_tot is not None else (corr + fat),
            "contanti": float(r["contanti_finali"] or 0),
            "pos_bpm": float(r["pos_bpm"] or 0),
            "pos_sella": float(r["pos_sella"] or 0),
            "theforkpay": float(r["theforkpay"] or 0),
            "other_e_payments": float(r["other_e_payments"] or 0),
            "bonifici": float(r["bonifici"] or 0),
            "mance": float(r["mance"] or 0),
            "_source": "daily",
        }

    # 3. Merge: shift primario, daily fallback
    all_dates = sorted(set(list(shift_map.keys()) + list(daily_map.keys())))
    return [shift_map.get(d) or daily_map[d] for d in all_dates]


# ══════════════════════════════════════════════
# AGGREGATI DI COMODO per dashboard CG
# ══════════════════════════════════════════════

def totali_periodo(
    conn: sqlite3.Connection,
    date_from: str,
    date_to: str,
) -> Dict:
    """
    Ritorna totali aggregati sul periodo [date_from, date_to) (date_to esclusivo).
    Usato dalle KPI "Vendite mese" del CG.

    Campi ritornati:
        totale_corrispettivi, totale_fatture_emesse, totale_incassi (corr+fat),
        totale_contanti, totale_pos, totale_theforkpay, totale_bonifici,
        giorni_apertura (giorni con corrispettivi+fatture > 0),
        media_giornaliera (totale_corrispettivi / giorni_apertura o 0).
    """
    righe = giorni_merged(conn, date_from, date_to)

    totale_corr = sum(r["corrispettivi"] for r in righe)
    totale_fat = sum(r["fatture"] for r in righe)
    totale_cont = sum(r["contanti"] for r in righe)
    totale_pos = sum(r["pos_bpm"] + r["pos_sella"] for r in righe)
    totale_tfp = sum(r["theforkpay"] for r in righe)
    totale_bon = sum(r["bonifici"] for r in righe)

    # Giorno "aperto" = ha registrato qualche incasso (corrispettivi o fatture).
    # NOTA: un pranzo chiuso con sola cena aperta conta come aperto.
    giorni_aperti = sum(1 for r in righe if (r["corrispettivi"] + r["fatture"]) > 0)

    media = (totale_corr / giorni_aperti) if giorni_aperti > 0 else 0.0

    return {
        "totale_corrispettivi": round(totale_corr, 2),
        "totale_fatture_emesse": round(totale_fat, 2),
        "totale_incassi": round(totale_corr + totale_fat, 2),
        "totale_contanti": round(totale_cont, 2),
        "totale_pos": round(totale_pos, 2),
        "totale_theforkpay": round(totale_tfp, 2),
        "totale_bonifici": round(totale_bon, 2),
        "giorni_apertura": giorni_aperti,
        "media_giornaliera": round(media, 2),
    }


def totali_mensili_anno(
    conn: sqlite3.Connection,
    anno: int,
) -> List[Dict]:
    """
    Ritorna una lista di 12 dict (uno per mese) con totale corrispettivi
    per l'anno richiesto. Usato dall'andamento annuale del CG.

    Ogni dict: {mese: int (1-12), totale_corrispettivi: float, totale_incassi: float}
    """
    result = []
    for m in range(1, 13):
        primo = f"{anno}-{m:02d}-01"
        if m == 12:
            ultimo = f"{anno + 1}-01-01"
        else:
            ultimo = f"{anno}-{m + 1:02d}-01"
        righe = giorni_merged(conn, primo, ultimo)
        tot_corr = sum(r["corrispettivi"] for r in righe)
        tot_fat = sum(r["fatture"] for r in righe)
        result.append({
            "mese": m,
            "totale_corrispettivi": round(tot_corr, 2),
            "totale_incassi": round(tot_corr + tot_fat, 2),
        })
    return result
