# Modulo: platform (servizio condiviso ricette ↔ cucina)
# @version: v1.0 — estratto da foodcost_recipes_router (2026-09-07)
# -*- coding: utf-8 -*-
"""
Prezzo corrente di un ingrediente — servizio platform.

PERCHE' ESISTE QUI E NON DENTRO UN ROUTER
------------------------------------------
Il modulo `cucina` (Scorte) deve valorizzare l'inventario, e per farlo gli serve
il prezzo di un ingrediente. Quel prezzo lo sa calcolare il modulo `ricette`.
La regola 4 di disciplina modulare vieta a un modulo di importare dal router di
un altro: la via consentita e' un servizio platform condiviso, ed e' questo.

⚠️ DEBITO DICHIARATO (2026-09-07)
`foodcost_recipes_router.prezzo_corrente_ingrediente()` contiene oggi la stessa
logica. Non l'ho toccato di proposito: quella e' una modifica al modulo ricette
e questa e' una sessione cucina — una sessione, una direzione. In una prossima
sessione ricette, `foodcost_recipes_router` va fatto importare da qui e la sua
copia va cancellata. Finche' convivono, **questo file e' la copia canonica**:
ogni fix va fatto qui e riportato li', mai il contrario.
Tracciato in docs/modulo_scorte_cucina.md §10.2.

STRATEGIA — MEDIANA, non ultimo prezzo
--------------------------------------
Mediana degli `unit_price` nella finestra di `foodcost_settings.prezzo_finestra_giorni`
(default 90 gg). La mediana ignora gli outlier — l'acquisto occasionale al
supermercato che con «ultimo prezzo» inquinava food cost e KPI (fix Sedano
2026-06-08). Se nella finestra non cade nessun prezzo (ingrediente comprato di
rado) si ripiega sull'ultimo prezzo in assoluto: meglio un dato vecchio che None.
"""

from __future__ import annotations

import sqlite3
from typing import Optional

FINESTRA_DEFAULT_GG = 90


def finestra_giorni(cur: sqlite3.Cursor) -> int:
    """La finestra di calcolo da `foodcost_settings`, con fallback a 90 giorni."""
    try:
        row = cur.execute(
            "SELECT prezzo_finestra_giorni FROM foodcost_settings WHERE id = 1"
        ).fetchone()
        if row and row[0]:
            return int(row[0])
    except sqlite3.Error:
        pass
    return FINESTRA_DEFAULT_GG


def prezzo_corrente(
    cur: sqlite3.Cursor,
    ingredient_id: Optional[int],
    finestra: Optional[int] = None,
) -> Optional[float]:
    """Prezzo corrente (€/unita' base) di un ingrediente, o None.

    `ingredient_id` None ritorna None senza interrogare nulla: un articolo di
    cucina puo' legittimamente non essere un ingrediente (carta forno,
    detersivo) e in quel caso non si valorizza.
    """
    if not ingredient_id:
        return None
    if finestra is None:
        finestra = finestra_giorni(cur)

    try:
        rows = cur.execute(
            """
            SELECT unit_price
            FROM ingredient_prices
            WHERE ingredient_id = ?
              AND unit_price IS NOT NULL
              AND date(price_date) >= date('now', ?)
            ORDER BY unit_price
            """,
            (ingredient_id, f"-{int(finestra)} days"),
        ).fetchall()
    except sqlite3.Error:
        return None

    valori = [float(r[0]) for r in rows if r[0] is not None]
    if valori:
        n = len(valori)
        mid = n // 2
        if n % 2:
            return valori[mid]
        return (valori[mid - 1] + valori[mid]) / 2.0

    try:
        row = cur.execute(
            """
            SELECT unit_price
            FROM ingredient_prices
            WHERE ingredient_id = ? AND unit_price IS NOT NULL
            ORDER BY date(price_date) DESC, id DESC
            LIMIT 1
            """,
            (ingredient_id,),
        ).fetchone()
    except sqlite3.Error:
        return None
    return float(row[0]) if row and row[0] is not None else None
