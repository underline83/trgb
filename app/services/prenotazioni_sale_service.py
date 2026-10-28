# @version: v1.0 — sale aperte per giorno e turno (2026-10-28, mig 214)
# -*- coding: utf-8 -*-
"""
Sale aperte — Modulo: prenotazioni — [core]

La sala è tavoli.zona (Osteria, Dehor, Veranda…). Ogni sala ha un'apertura di
default (sale_config.aperta_default) e si apre/chiude per un giorno e turno
(sale_aperture). I tavoli delle sale chiuse non contano: né capienza, né
disponibilità, né tavoli suggeriti.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set


def _ok(conn) -> bool:
    try:
        conn.execute("SELECT 1 FROM sale_config LIMIT 1")
        return True
    except Exception:  # mig 214 non ancora passata
        return False


def elenco(conn, data: Optional[str] = None, turno: Optional[str] = None) -> List[Dict[str, Any]]:
    """Sale con default, apertura effettiva quel giorno/turno, numero tavoli e posti."""
    sale = conn.execute("""
        SELECT zona, COUNT(*) AS tavoli, COALESCE(SUM(posti_min), 0) AS posti_min,
               COALESCE(SUM(posti_max), 0) AS posti_max, MIN(ordine) AS o
        FROM tavoli WHERE attivo = 1 AND zona IS NOT NULL AND zona != ''
        GROUP BY zona ORDER BY o, zona
    """).fetchall()
    default: Dict[str, int] = {}
    eccezioni: Dict[str, Dict[str, Any]] = {}
    if _ok(conn):
        default = {r["zona"]: r["aperta_default"] for r in conn.execute("SELECT * FROM sale_config")}
        if data and turno:
            eccezioni = {r["zona"]: dict(r) for r in conn.execute(
                "SELECT * FROM sale_aperture WHERE data_pasto = ? AND turno = ?", (data, turno))}
    out = []
    for s in sale:
        d = bool(default.get(s["zona"], 1))
        e = eccezioni.get(s["zona"])
        out.append({
            "zona": s["zona"], "tavoli": s["tavoli"], "posti_min": s["posti_min"], "posti_max": s["posti_max"],
            "aperta_default": d,
            "aperta": bool(e["aperta"]) if e else d,
            "eccezione": bool(e),
            "aggiornato_da": e["aggiornato_da"] if e else None,
        })
    return out


def aperte(conn, data: str, turno: str) -> Set[str]:
    return {s["zona"] for s in elenco(conn, data, turno) if s["aperta"]}


def imposta_default(conn, zona: str, aperta: bool) -> None:
    conn.execute("""
        INSERT INTO sale_config (zona, aperta_default) VALUES (?, ?)
        ON CONFLICT(zona) DO UPDATE SET aperta_default = excluded.aperta_default,
                                        updated_at = datetime('now','localtime')
    """, (zona, 1 if aperta else 0))
    conn.commit()


def imposta_giorno(conn, data: str, turno: str, zona: str, aperta: Optional[bool], utente: Optional[str]) -> None:
    """aperta=None → torna al default della sala."""
    if aperta is None:
        conn.execute("DELETE FROM sale_aperture WHERE data_pasto = ? AND turno = ? AND zona = ?", (data, turno, zona))
    else:
        conn.execute("""
            INSERT INTO sale_aperture (data_pasto, turno, zona, aperta, aggiornato_da) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(data_pasto, turno, zona) DO UPDATE SET aperta = excluded.aperta,
                aggiornato_da = excluded.aggiornato_da, updated_at = datetime('now','localtime')
        """, (data, turno, zona, 1 if aperta else 0, utente))
    conn.commit()


def capienza(conn, data: str, turno: str) -> Optional[int]:
    """Posti massimi dei tavoli delle sale aperte, tolti i tavoli bloccati. None se non ci sono tavoli."""
    sale = elenco(conn, data, turno)
    if not sale:
        return None
    zone = [s["zona"] for s in sale if s["aperta"]]
    if not zone:
        return 0
    try:
        bloccati = {r["tavolo_id"] for r in conn.execute(
            "SELECT tavolo_id FROM tavoli_blocchi WHERE data_pasto = ? AND turno = ?", (data, turno))}
    except Exception:
        bloccati = set()
    tot = 0
    for r in conn.execute(
        f"SELECT id, posti_max FROM tavoli WHERE attivo = 1 AND zona IN ({','.join('?' * len(zone))})", zone
    ):
        if r["id"] not in bloccati:
            tot += r["posti_max"] or 0
    return tot
