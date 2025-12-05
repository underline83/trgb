# app/services/admin_finance_stats.py
# @version: v1.0

"""
Modulo statistiche per il sistema Amministrazione Tre Gobbi.

Funzioni principali:
- get_year_summary
- get_month_summary
- get_top_days
- get_bottom_days
- get_year_vs_year
- get_month_vs_month
- daily_time_series

Tutte le funzioni accettano solo:
    (conn: sqlite3.Connection, ...)
e ritornano dizionari serializzabili.
"""

import sqlite3
from typing import List, Dict, Any
from datetime import datetime
from app.services.admin_finance_closure_utils import num, is_effectively_closed


# ============================================================
# HELPER SQL
# ============================================================

def _fetch_all(conn: sqlite3.Connection, query: str, params=()) -> List[Dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    cur = conn.execute(query, params)
    return [dict(row) for row in cur.fetchall()]


# ============================================================
# YEAR SUMMARY
# ============================================================

def get_year_summary(conn: sqlite3.Connection, year: int) -> Dict[str, Any]:
    """Riepilogo annuale: totale corrispettivi, totale incassi, giorni chiusi/aperti."""
    rows = _fetch_all(conn, 
        """
        SELECT *
        FROM daily_closures
        WHERE substr(date,1,4) = ?
        ORDER BY date
        """,
        (str(year),)
    )

    totale_corr = sum(num(r["corrispettivi_tot"]) for r in rows)
    totale_incassi = sum(num(r["totale_incassi"]) for r in rows)

    giorni = len(rows)
    chiusi = sum(1 for r in rows if is_effectively_closed(r))

    return {
        "year": year,
        "giorni_presenti": giorni,
        "giorni_chiusi": chiusi,
        "giorni_aperti": giorni - chiusi,
        "totale_corrispettivi": totale_corr,
        "totale_incassi": totale_incassi,
    }


# ============================================================
# MONTH SUMMARY
# ============================================================

def get_month_summary(conn: sqlite3.Connection, year: int, month: int) -> Dict[str, Any]:
    """Totali del mese e riepilogo chiusure."""
    ym = f"{year:04d}-{month:02d}"
    rows = _fetch_all(conn,
        """
        SELECT *
        FROM daily_closures
        WHERE date LIKE ? || '%'
        ORDER BY date
        """,
        (ym,)
    )

    totale_corr = sum(num(r["corrispettivi_tot"]) for r in rows)
    totale_incassi = sum(num(r["totale_incassi"]) for r in rows)

    chiusi = sum(1 for r in rows if is_effectively_closed(r))

    return {
        "year": year,
        "month": month,
        "totale_corrispettivi": totale_corr,
        "totale_incassi": totale_incassi,
        "giorni_presenti": len(rows),
        "giorni_chiusi": chiusi,
        "giorni_aperti": len(rows) - chiusi,
        "dettaglio": rows,
    }


# ============================================================
# TOP / BOTTOM DAYS
# ============================================================

def get_top_days(conn: sqlite3.Connection, year: int, limit: int = 10) -> List[Dict[str, Any]]:
    """Giorni con più corrispettivi_tot — solo giorni veramente aperti."""
    rows = _fetch_all(conn,
        """
        SELECT *
        FROM daily_closures
        WHERE substr(date,1,4) = ?
        """,
        (str(year),)
    )

    open_rows = [r for r in rows if is_effectively_closed(r)]
    open_rows.sort(key=lambda r: num(r["corrispettivi_tot"]), reverse=True)

    return open_rows[:limit]


def get_bottom_days(conn: sqlite3.Connection, year: int, limit: int = 10) -> List[Dict[str, Any]]:
    """Giorni con meno corrispettivi_tot — esclude quelli completamente nulli."""
    rows = _fetch_all(conn,
        """
        SELECT *
        FROM daily_closures
        WHERE substr(date,1,4) = ?
        """,
        (str(year),)
    )

    open_rows = [r for r in rows if is_effectively_closed(r)]
    open_rows.sort(key=lambda r: num(r["corrispettivi_tot"]))

    return open_rows[:limit]


# ============================================================
# YEAR vs YEAR
# ============================================================

def get_year_vs_year(conn: sqlite3.Connection, year1: int, year2: int) -> Dict[str, Any]:
    """Confronto annuale completo tra due anni."""
    s1 = get_year_summary(conn, year1)
    s2 = get_year_summary(conn, year2)

    return {
        "year1": s1,
        "year2": s2,
        "delta_corrispettivi": num(s2["totale_corrispettivi"]) - num(s1["totale_corrispettivi"]),
        "delta_incassi": num(s2["totale_incassi"]) - num(s1["totale_incassi"]),
    }


# ============================================================
# MONTH vs MONTH
# ============================================================

def get_month_vs_month(conn: sqlite3.Connection, y1: int, m1: int, y2: int, m2: int) -> Dict[str, Any]:
    """Confronto mese vs mese anche tra anni diversi."""
    s1 = get_month_summary(conn, y1, m1)
    s2 = get_month_summary(conn, y2, m2)

    return {
        "period1": s1,
        "period2": s2,
        "delta_corrispettivi": num(s2["totale_corrispettivi"]) - num(s1["totale_corrispettivi"]),
        "delta_incassi": num(s2["totale_incassi"]) - num(s1["totale_incassi"]),
    }


# ============================================================
# TIME SERIES Giornaliera
# ============================================================

def daily_time_series(conn: sqlite3.Connection, year: int) -> List[Dict[str, Any]]:
    """Per grafici: restituisce per ogni giorno dell'anno corrispettivi_tot, incassi, chiusura."""
    return _fetch_all(conn,
        """
        SELECT date, weekday, corrispettivi_tot, totale_incassi, is_closed
        FROM daily_closures
        WHERE substr(date,1,4) = ?
        ORDER BY date
        """,
        (str(year),)
    )