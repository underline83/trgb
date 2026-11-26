# @version: v1.0 (2026-11-26) — «c'è ancora posto in quel turno?» per chi non è il modulo Prenotazioni
# -*- coding: utf-8 -*-
"""
C'è posto? — Modulo: platform — [core]

Altri moduli (i template di risposta di Clienti per primi) devono poter dire a un cliente
«abbiamo ancora disponibilità» senza importare niente dal router Prenotazioni (regola 4
dell'architettura modulare). Qui c'è la domanda sola:

    c_e_posto(data, turno, pax)  →  {"posto": True | False | None, "motivo", "coperti",
                                     "capienza", "orari": [ore in cui entrerebbe]}

La risposta è quella della SALA, non del sito: stesse fasce, stessi limiti di coperti e
stesso motore per tavoli di `prenotazioni_sito_service.orari`, ma senza le regole che
valgono solo per chi prenota online (anticipo minimo e massimo, vendita online chiusa,
tetto online, gruppi a richiesta). Nessuna soglia qui dentro: il numero di persone lo
passa chi chiede.

posto = None quando non si può dire (data non valida, turno senza orari): chi chiama
decide cosa farne, non lo si traveste da «pieno».
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional


def c_e_posto(data: str, turno: str, pax: int, conn=None, oggi: Optional[date] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {"data": data, "turno": turno, "pax": pax, "posto": None, "motivo": None,
                           "coperti": None, "capienza": None, "orari": []}
    try:
        d = date.fromisoformat(str(data))
    except (TypeError, ValueError):
        out["motivo"] = "data"
        return out
    turno = str(turno or "").lower()
    if turno not in ("pranzo", "cena") or int(pax or 0) < 1:
        out["motivo"] = "turno" if turno not in ("pranzo", "cena") else "persone"
        return out
    if d < (oggi or date.today()):
        out.update(posto=False, motivo="passata")
        return out

    from app.models.clienti_db import get_clienti_conn
    from app.services import prenotazioni_fasce_service as fasce_srv
    from app.services import prenotazioni_sale_service as sale_srv
    from app.services import prenotazioni_sito_service as sito_srv
    from app.services import prenotazioni_stati as stati_srv
    from app.services import prenotazioni_tavoli_service as tavoli_srv

    mia = conn is None
    conn = conn or get_clienti_conn()
    try:
        cfg = sito_srv.config(conn)
        if turno in sito_srv.turni_chiusi(cfg, d):
            out.update(posto=False, motivo="chiuso")
            return out
        fasce = fasce_srv.fasce_giorno(conn, data, turno, cfg)["fasce"]
        if not fasce:
            out["motivo"] = "senza_orari"
            return out
        non_occupano = stati_srv.non_occupano()
        occupati = int(conn.execute(
            f"""SELECT COALESCE(SUM(pax), 0) FROM clienti_prenotazioni
                WHERE data_pasto = ? AND turno = ? AND stato NOT IN ({','.join('?' * len(non_occupano))})""",
            (data, turno, *non_occupano)).fetchone()[0] or 0)
        out["coperti"] = occupati
        capienza = sale_srv.capienza(conn, data, turno)   # tavoli delle sale aperte
        if capienza is None:
            try:
                capienza = int(float(cfg.get(f"capienza_{turno}") or 0))
            except (TypeError, ValueError):
                capienza = 0
        elif capienza == 0:
            out.update(posto=False, motivo="sale_chiuse", capienza=0)
            return out
        out["capienza"] = capienza or None
        motore = None
        try:
            motore = tavoli_srv.Verificatore(conn, data, turno)
            if not motore.ha_tavoli:
                motore = None
        except Exception:
            motore = None
        for f in fasce:
            if not f["aperta"]:
                continue
            libero = (
                (f["max_coperti"] is None or f["coperti"] + pax <= f["max_coperti"])
                # senza tavoli in mappa conta la capienza in coperti; coi tavoli decide il motore
                and (motore is not None or capienza <= 0 or occupati + pax <= capienza)
            )
            if libero and motore is not None:
                libero = motore.verifica(pax, f["ora"])["entra"]
            if libero:
                out["orari"].append(f["ora"])
        out["posto"] = bool(out["orari"])
        if not out["posto"]:
            out["motivo"] = "pieno"
        return out
    finally:
        if mia:
            conn.close()
