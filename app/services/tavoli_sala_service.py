# @version: v1.0 (2026-11-24) — tavoli e sale per chi non è il modulo Prenotazioni
# -*- coding: utf-8 -*-
"""
Tavoli e sale — Modulo: platform — [core]

I tavoli li disegna il modulo Prenotazioni (tabella `tavoli` del DB clienti,
TavoliEditor). Altri moduli — la Comanda per prima — devono poterli leggere
senza importare niente dal modulo Prenotazioni (regola 4 dell'architettura
modulare): passano da qui.

Sola lettura. Funzioni:
    elenco_tavoli()        tavoli attivi in ordine di sala e di posizione
    tavolo(tavolo_id)      un tavolo, anche se disattivato (None se non c'è)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn

_CAMPI = "id, nome, zona, posti_min, posti_max, ordine, attivo"


def _tabella_ok(conn) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='tavoli'"
    ).fetchone())


def elenco_tavoli() -> List[Dict[str, Any]]:
    """Tavoli attivi. Le sale vengono nell'ordine del loro primo tavolo, come in Prenotazioni."""
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return []
        righe = [dict(r) for r in conn.execute(
            f"SELECT {_CAMPI} FROM tavoli WHERE attivo = 1 ORDER BY ordine, id"
        ).fetchall()]
    finally:
        conn.close()
    ordine_sala: Dict[str, int] = {}
    for r in righe:
        z = r.get("zona") or ""
        o = r.get("ordine") or 0
        if z not in ordine_sala or o < ordine_sala[z]:
            ordine_sala[z] = o
    righe.sort(key=lambda r: (ordine_sala.get(r.get("zona") or "", 0), r.get("ordine") or 0, r["id"]))
    return righe


def tavolo(tavolo_id: int) -> Optional[Dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return None
        r = conn.execute(f"SELECT {_CAMPI} FROM tavoli WHERE id = ?", (tavolo_id,)).fetchone()
        return dict(r) if r else None
    finally:
        conn.close()
