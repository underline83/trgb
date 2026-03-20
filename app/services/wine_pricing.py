# -*- coding: utf-8 -*-
"""
Tre Gobbi — Calcolo automatico PREZZO_CARTA
File: app/services/wine_pricing.py

Logica:
- Tabella di breakpoint (costo_listino → moltiplicatore)
- Interpolazione lineare tra breakpoint adiacenti
- Arrotondamento al €0.50 più vicino
- La tabella è configurabile via DB (vini_settings.sqlite3)
"""

from __future__ import annotations

import json
import math
from typing import List, Tuple, Optional

from app.models.settings_db import get_settings_conn

# ── Tabella breakpoint di default ──────────────────────────
# (costo_listino, moltiplicatore)
# Il prezzo di vendita = costo * moltiplicatore, arrotondato a €0.50
DEFAULT_BREAKPOINTS: List[Tuple[float, float]] = [
    (0,    15.00),
    (0.50, 10.00),
    (1,     8.00),
    (1.50,  7.25),
    (2,     7.00),
    (3,     6.50),
    (4,     6.00),
    (5,     5.50),
    (6,     5.00),
    (7,     4.50),
    (8,     4.00),
    (9,     3.75),
    (10,    3.50),
    (11,    3.25),
    (12,    3.15),
    (13,    3.05),
    (14,    2.95),
    (15,    2.895),
    (17,    2.795),
    (20,    2.65),
    (25,    2.60),
    (30,    2.55),
    (37,    2.50),
    (50,    2.42),
    (75,    2.30),
    (100,   2.17),
    (150,   2.12),
    (200,   2.07),
    (275,   2.00),
    (500,   1.89),
    (1000,  1.80),
    (4000,  1.71),
]


def _round_to_half(value: float) -> float:
    """Arrotonda al €0.50 più vicino (es. 22.30 → 22.50, 22.10 → 22.00)."""
    return round(value * 2) / 2


def _interpolate(costo: float, breakpoints: List[Tuple[float, float]]) -> float:
    """
    Calcola il moltiplicatore per un dato costo usando interpolazione lineare
    tra i breakpoint adiacenti.
    """
    if not breakpoints:
        return 3.0  # fallback sicuro

    # Sotto il primo breakpoint → usa il primo moltiplicatore
    if costo <= breakpoints[0][0]:
        return breakpoints[0][1]

    # Sopra l'ultimo breakpoint → usa l'ultimo moltiplicatore
    if costo >= breakpoints[-1][0]:
        return breakpoints[-1][1]

    # Trova i due breakpoint adiacenti
    for i in range(len(breakpoints) - 1):
        c0, m0 = breakpoints[i]
        c1, m1 = breakpoints[i + 1]
        if c0 <= costo <= c1:
            # Interpolazione lineare
            if c1 == c0:
                return m0
            t = (costo - c0) / (c1 - c0)
            return m0 + t * (m1 - m0)

    return breakpoints[-1][1]


def calcola_prezzo_carta(
    euro_listino: float,
    breakpoints: Optional[List[Tuple[float, float]]] = None,
) -> float:
    """
    Calcola il PREZZO_CARTA dato EURO_LISTINO.
    Usa i breakpoint forniti oppure quelli dal DB.
    Arrotonda al €0.50 più vicino.
    """
    if euro_listino is None or euro_listino <= 0:
        return 0.0

    if breakpoints is None:
        breakpoints = load_breakpoints()

    moltiplicatore = _interpolate(euro_listino, breakpoints)
    prezzo = euro_listino * moltiplicatore
    return _round_to_half(prezzo)


# ── Persistenza breakpoint in DB ───────────────────────────

def _init_markup_table() -> None:
    """Crea la tabella markup_breakpoints se non esiste."""
    conn = get_settings_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS markup_breakpoints (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            costo  REAL NOT NULL,
            moltiplicatore REAL NOT NULL,
            ordine INTEGER NOT NULL
        );
    """)
    conn.commit()
    conn.close()


def load_breakpoints() -> List[Tuple[float, float]]:
    """
    Carica i breakpoint dal DB. Se la tabella è vuota,
    inserisce i default e li restituisce.
    """
    _init_markup_table()
    conn = get_settings_conn()
    cur = conn.cursor()

    rows = cur.execute(
        "SELECT costo, moltiplicatore FROM markup_breakpoints ORDER BY ordine ASC;"
    ).fetchall()

    if not rows:
        # Inserisci i default
        conn.close()
        save_breakpoints(DEFAULT_BREAKPOINTS)
        return list(DEFAULT_BREAKPOINTS)

    result = [(float(r["costo"]), float(r["moltiplicatore"])) for r in rows]
    conn.close()
    return result


def save_breakpoints(breakpoints: List[Tuple[float, float]]) -> None:
    """Salva (sovrascrive) i breakpoint nel DB."""
    _init_markup_table()
    conn = get_settings_conn()
    cur = conn.cursor()

    cur.execute("DELETE FROM markup_breakpoints;")
    for i, (costo, molt) in enumerate(breakpoints):
        cur.execute(
            "INSERT INTO markup_breakpoints (costo, moltiplicatore, ordine) VALUES (?, ?, ?);",
            (costo, molt, i),
        )

    conn.commit()
    conn.close()


def reset_breakpoints_to_default() -> List[Tuple[float, float]]:
    """Ripristina i breakpoint ai valori di default."""
    save_breakpoints(DEFAULT_BREAKPOINTS)
    return list(DEFAULT_BREAKPOINTS)
