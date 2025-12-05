# app/services/admin_finance_closure_utils.py
# @version: v1.0

"""
Utility functions per la gestione delle chiusure giornaliere.

Regole definite:
- un giorno è considerato "effettivamente chiuso" quando:
    • corrispettivi_tot > 0  **oppure**
    • totale_incassi > 0     **oppure**
    • is_closed == 1
- i valori numerici vanno sempre convertiti a float, anche se null.

Tutte le funzioni sono pure e non accedono al DB.
"""

from typing import Dict, Any


# -------------------------------------------------------------
# NORMALIZZAZIONE NUMERI
# -------------------------------------------------------------

def num(value) -> float:
    """Converte tutto a float, None/NaN → 0.0"""
    try:
        if value is None:
            return 0.0
        return float(value)
    except Exception:
        return 0.0


# -------------------------------------------------------------
# CHIUSURA GIORNALIERA: LOGICA DI INTERPRETAZIONE
# -------------------------------------------------------------

def is_effectively_closed(row: Dict[str, Any]) -> bool:
    """
    Ritorna True se la riga risulta 'chiusa' secondo la logica Tre Gobbi.
    Evita crash se mancano campi.
    """
    corr_tot = num(row.get("corrispettivi_tot"))
    tot_inc = num(row.get("totale_incassi"))
    flag = int(row.get("is_closed", 0))

    if flag == 1:
        return True
    if corr_tot > 0:
        return True
    if tot_inc > 0:
        return True

    return False


# -------------------------------------------------------------
# VALIDAZIONE INPUT CHIUSURA GIORNALIERA
# -------------------------------------------------------------

def validate_closure_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Garantisce che il payload contenga almeno i campi fondamentali:
    - tutti i numerici vengono convertiti a float
    - note può essere None
    - is_closed viene normalizzato a 0/1
    """
    fields = [
        "corrispettivi", "iva_10", "iva_22", "fatture", "corrispettivi_tot",
        "contanti_finali", "pos_bpm", "pos_sella", "theforkpay",
        "other_e_payments", "bonifici", "mance",
        "totale_incassi", "cash_diff"
    ]

    cleaned = {}

    for f in fields:
        cleaned[f] = num(payload.get(f))

    cleaned["note"] = payload.get("note")
    cleaned["is_closed"] = 1 if payload.get("is_closed") else 0

    return cleaned


# -------------------------------------------------------------
# RICALCOLO: totale incassi & cash diff
# -------------------------------------------------------------

def recalc_totals(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ricalcola:
        totale_incassi = contanti + pos_bpm + pos_sella + thefork + other_e_payments + bonifici
        cash_diff = totale_incassi − corrispettivi_tot
    """
    totale = (
        num(data.get("contanti_finali"))
        + num(data.get("pos_bpm"))
        + num(data.get("pos_sella"))
        + num(data.get("theforkpay"))
        + num(data.get("other_e_payments"))
        + num(data.get("bonifici"))
    )

    data["totale_incassi"] = totale
    data["cash_diff"] = totale - num(data.get("corrispettivi_tot"))

    return data


# -------------------------------------------------------------
# PREPARAZIONE OUTPUT PER IL FRONTEND
# -------------------------------------------------------------

def closure_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Converte una riga DB in oggetto serializzabile per il frontend.
    """
    return {
        "date": row.get("date"),
        "weekday": row.get("weekday"),
        "is_closed": bool(row.get("is_closed", 0)),
        "corrispettivi": num(row.get("corrispettivi")),
        "iva_10": num(row.get("iva_10")),
        "iva_22": num(row.get("iva_22")),
        "fatture": num(row.get("fatture")),
        "corrispettivi_tot": num(row.get("corrispettivi_tot")),
        "contanti_finali": num(row.get("contanti_finali")),
        "pos_bpm": num(row.get("pos_bpm")),
        "pos_sella": num(row.get("pos_sella")),
        "theforkpay": num(row.get("theforkpay")),
        "other_e_payments": num(row.get("other_e_payments")),
        "bonifici": num(row.get("bonifici")),
        "mance": num(row.get("mance")),
        "totale_incassi": num(row.get("totale_incassi")),
        "cash_diff": num(row.get("cash_diff")),
        "note": row.get("note"),
    }