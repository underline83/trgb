# @version: v1.0 (2026-11-24) — le prenotazioni di un giorno per chi non è il modulo Prenotazioni
# -*- coding: utf-8 -*-
"""
Prenotazioni del giorno — Modulo: platform — [core]

Le prenotazioni vivono nel modulo Prenotazioni (tabella `clienti_prenotazioni` del DB
clienti). Altri moduli — la Comanda per prima, per legare un tavolo aperto a chi l'ha
prenotato — le leggono da qui, senza importare niente dal router Prenotazioni
(regola 4 dell'architettura modulare).

Sola lettura, e solo ciò che serve in sala: ora, nome, coperti, tavolo, stato, allergie
e note. Niente telefono né email.

    del_giorno(data)   le prenotazioni di un giorno che tengono il tavolo (in ordine d'ora)
    una(pren_id)       una prenotazione qualunque sia il suo stato (None se non c'è)
    turno_di(ora)      'pranzo' | 'cena' secondo la soglia di Prenotazioni
    turno_adesso()     il turno in corso per l'orologio del server

Stati e gruppi vengono da `prenotazioni_stati`, i nomi dei tavoli («3C+3» → 3C e 3)
da `abbinamento_conti_service`: le stesse regole che usa la Cassa per i conti.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn
from app.services import prenotazioni_stati as stati_srv
from app.services.abbinamento_conti_service import normalizza_tavolo, tavoli_prenotazione

SOGLIA_SE_MANCA = "15:00"   # come il valore iniziale di prenotazioni_config.soglia_pranzo_cena

_SELECT = """
    SELECT p.id, p.cliente_id, p.data_pasto, p.ora_pasto, p.turno, p.stato, p.pax, p.tavolo,
           p.occasione, p.nota_ristorante, p.nota_cliente, p.allergie_segnalate, p.seggioloni,
           COALESCE(NULLIF(c.nome, ''), p.nome_ospite)       AS nome,
           COALESCE(NULLIF(c.cognome, ''), p.cognome_ospite) AS cognome,
           c.vip, c.allergie AS allergie_cliente, c.restrizioni_dietetiche
    FROM clienti_prenotazioni p
    LEFT JOIN clienti c ON c.id = p.cliente_id
"""


def _tabella_ok(conn) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_prenotazioni'"
    ).fetchone())


def _soglia(conn) -> str:
    """Ora che separa pranzo da cena: la stessa impostazione di Prenotazioni."""
    try:
        r = conn.execute(
            "SELECT valore FROM prenotazioni_config WHERE chiave = 'soglia_pranzo_cena'").fetchone()
        return (r["valore"] if r and r["valore"] else SOGLIA_SE_MANCA)[:5]
    except Exception:  # noqa: BLE001 — tabella assente su un DB nuovo
        return SOGLIA_SE_MANCA


def _turno(ora: Optional[str], soglia: str) -> str:
    return "pranzo" if (ora or "")[:5] < soglia else "cena"


def _unisci(*testi) -> str:
    """Più campi di testo in uno, senza ripetere lo stesso valore («Glutine» e «glutine»)."""
    visti, out = set(), []
    for t in testi:
        t = " ".join(str(t or "").split())
        if t and t.lower() not in visti:
            visti.add(t.lower())
            out.append(t)
    return " · ".join(out)


def _riga(r, soglia: str) -> Dict[str, Any]:
    ora = (r["ora_pasto"] or "")[:5]
    nome = " ".join(f"{r['cognome'] or ''} {r['nome'] or ''}".split())
    return {
        "id": r["id"],
        "cliente_id": r["cliente_id"],
        "data": r["data_pasto"],
        "ora": ora,
        "turno": r["turno"] or _turno(ora, soglia),
        "pax": r["pax"] or 0,
        "stato": r["stato"],
        "stato_etichetta": stati_srv.etichetta(r["stato"]),
        "tiene_il_tavolo": stati_srv.is_occupa(r["stato"]),
        "tavolo": (r["tavolo"] or "").strip(),
        "tavoli": sorted(tavoli_prenotazione(r["tavolo"])),
        "nome": nome or "senza nome",
        "vip": bool(r["vip"]),
        # allergie dette alla prenotazione + quelle della scheda cliente: in sala servono insieme
        "allergie": _unisci(r["allergie_segnalate"], r["allergie_cliente"], r["restrizioni_dietetiche"]),
        "nota": _unisci(r["nota_ristorante"]),
        "nota_cliente": _unisci(r["nota_cliente"]),
        "occasione": _unisci(r["occasione"]),
        "seggioloni": r["seggioloni"] or 0,
    }


def del_giorno(data: str) -> List[Dict[str, Any]]:
    """Prenotazioni di `data` (AAAA-MM-GG) che tengono il tavolo — confermate, in opzione,
    arrivate, sedute, andate — in ordine d'ora. Fuori cancellate, no-show e lista d'attesa."""
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return []
        soglia = _soglia(conn)
        fuori = stati_srv.sql_in(stati_srv.non_occupano())
        return [_riga(r, soglia) for r in conn.execute(
            f"{_SELECT} WHERE p.data_pasto = ? AND p.stato NOT IN {fuori} ORDER BY p.ora_pasto, p.id",
            (data,))]
    finally:
        conn.close()


def una(pren_id: int) -> Optional[Dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return None
        r = conn.execute(f"{_SELECT} WHERE p.id = ?", (pren_id,)).fetchone()
        return _riga(r, _soglia(conn)) if r else None
    finally:
        conn.close()


def turno_di(ora: Optional[str]) -> str:
    conn = get_clienti_conn()
    try:
        return _turno(ora, _soglia(conn))
    finally:
        conn.close()


def turno_adesso() -> str:
    return turno_di(datetime.now().strftime("%H:%M"))


def sul_tavolo(prenotazione: Dict[str, Any], nome_tavolo: Optional[str]) -> bool:
    """Vero se il tavolo è uno di quelli scritti sulla prenotazione («1+2+0» vale per 1, 2 e 0)."""
    n = normalizza_tavolo(nome_tavolo)
    return bool(n) and n in prenotazione.get("tavoli", [])
