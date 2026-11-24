# @version: v1.1 (2026-11-24) — anche le scritture di chi apre un tavolo: walk-in, «Seduto», «Completata», sempre con le funzioni del Planning
# -*- coding: utf-8 -*-
"""
Prenotazioni del giorno — Modulo: platform — [core]

Le prenotazioni vivono nel modulo Prenotazioni (tabella `clienti_prenotazioni` del DB
clienti). Altri moduli — la Comanda per prima, per legare un tavolo aperto a chi l'ha
prenotato — le leggono da qui, senza importare niente dal router Prenotazioni
(regola 4 dell'architettura modulare).

Si legge solo ciò che serve in sala: ora, nome, coperti, tavolo, stato, allergie e note.
Niente email; il telefono solo con le ultime cifre, per distinguere due omonimi.

    del_giorno(data)   le prenotazioni di un giorno che tengono il tavolo (in ordine d'ora)
    una(pren_id)       una prenotazione qualunque sia il suo stato (None se non c'è)
    turno_di(ora)      'pranzo' | 'cena' secondo la soglia di Prenotazioni
    turno_adesso()     il turno in corso per l'orologio del server
    cerca_clienti(q, chi)   clienti per nome o telefono (come nel form di una prenotazione)

Dalla 1.1 anche le poche SCRITTURE di chi apre un tavolo (Marco, 24/11/2026: «dovresti
sistemare la cosa anche sulle prenotazioni»). Passano tutte dalle funzioni delle pagine di
Prenotazioni — le stesse del «+ Nuova», del «Modifica» e del cambio di stato del Planning,
come fa il connettore — così valgono le stesse regole (turno chiuso, passaggi di stato,
tavoli a metà) e niente è copiato qui:

    crea_al_tavolo(...)   chi si siede senza prenotazione: nasce una prenotazione di oggi,
                          adesso, canale «Walk-in» (con o senza cliente), già «Seduto»
    siedi(pren, chi, tavolo)      la prenotazione è al tavolo: «Seduto», sul tavolo giusto
    cambia(pren, chi, …)          tavolo o coperti che seguono il conto
    completa(pren, chi)           tavolo chiuso: «Completata»
    rimetti(pren, stato, tavolo, chi)   collegamento tolto: torna com'era
    togli_creata(pren)            toglie del tutto un walk-in nato da un tavolo aperto per sbaglio

`chi` è l'utente che fa la cosa ({username, role}): i ruoli li controlla Prenotazioni.
Al cliente non parte mai niente (né email né messaggi).

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
CANALE_WALKIN = "Walk-in"   # il canale che il form di Prenotazioni già usa per chi entra senza prenotare
STATO_SEDUTO = "SEATED"
STATO_ANDATO = "LEFT"
GIA_AL_TAVOLO = ("SEATED", "BILL", "LEFT")   # da qui «Seduto» non si riscrive


class PrenotazioneErrore(Exception):
    """Prenotazioni ha detto di no: il messaggio è quello che vedrebbe chi usa il Planning."""

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


# ── clienti (lettura) ──────────────────────────────────────────────

def _rotte():
    # Import pigro, come nel connettore: le funzioni sono quelle delle pagine di Prenotazioni.
    from app.routers import prenotazioni_router
    return prenotazioni_router


def _chiama(fn, **kw):
    from fastapi import HTTPException
    try:
        return fn(**kw)
    except HTTPException as e:
        raise PrenotazioneErrore(str(e.detail))


def _telefono_corto(tel: Optional[str]) -> str:
    cifre = "".join(ch for ch in str(tel or "") if ch.isdigit())
    return f"…{cifre[-4:]}" if len(cifre) >= 4 else ""


def cerca_clienti(q: str, chi: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Clienti per nome, cognome o telefono: la stessa ricerca del form di una prenotazione.
    Del telefono tornano solo le ultime quattro cifre."""
    q = " ".join(str(q or "").split())
    if len(q) < 2:
        return []
    righe = _chiama(_rotte().search_clienti, q=q, user=chi)["clienti"]
    return [{
        "id": c["id"],
        "nome": " ".join(f"{c.get('cognome') or ''} {c.get('nome') or ''}".split()) or "senza nome",
        "telefono": _telefono_corto(c.get("telefono")),
        "visite": c.get("visite_totali") or 0,
        "vip": bool(c.get("vip")),
        "allergie": _unisci(c.get("allergie"), c.get("restrizioni_dietetiche")),
    } for c in righe]


# ── scritture, con le funzioni del Planning ─────────────────────────

def siedi(pren_id: int, chi: Dict[str, Any], tavolo: Optional[str] = None) -> None:
    """La prenotazione è al tavolo: se era scritto un altro tavolo prende questo, e passa a
    «Seduto» (col passaggio del Planning dove c'è; per «Da confermare» e «In opzione», che a
    mano passerebbero prima da «Confermata», si scrive lo stato com'è: sono seduti)."""
    p = una(pren_id)
    if not p:
        raise PrenotazioneErrore("Prenotazione inesistente")
    rotte = _rotte()
    if tavolo and not sul_tavolo(p, tavolo):
        _chiama(rotte.modifica_prenotazione, pren_id=pren_id,
                req=rotte.PrenotazioneUpdate(tavolo=str(tavolo)), user=chi)
    if p["stato"] in GIA_AL_TAVOLO:
        return
    if STATO_SEDUTO in stati_srv.transizioni(p["stato"]):
        _chiama(rotte.cambio_stato, pren_id=pren_id, req=rotte.StatoUpdate(stato=STATO_SEDUTO), user=chi)
    else:
        _chiama(rotte.modifica_prenotazione, pren_id=pren_id,
                req=rotte.PrenotazioneUpdate(stato=STATO_SEDUTO), user=chi)


def crea_al_tavolo(tavolo: str, pax: int, chi: Dict[str, Any], cliente_id: Optional[int] = None,
                   nome: Optional[str] = None, cognome: Optional[str] = None,
                   telefono: Optional[str] = None) -> Dict[str, Any]:
    """Chi si siede senza prenotazione. Nasce una prenotazione di oggi, a quest'ora, su questo
    tavolo, canale «Walk-in», come dal «+ Nuova» del Planning, e passa subito a «Seduto».
    Senza cliente = walk-in senza nome; con cliente_id = un cliente che c'è già; con cognome
    = un cliente nuovo (lo crea il Planning, come sempre)."""
    rotte = _rotte()
    adesso = datetime.now()
    cognome = " ".join(str(cognome or "").split()) or None
    req = rotte.PrenotazioneCreate(
        cliente_id=cliente_id, data_pasto=adesso.date().isoformat(), ora_pasto=adesso.strftime("%H:%M"),
        pax=max(1, min(50, int(pax or 1))), tavolo=str(tavolo), canale=CANALE_WALKIN,
        nuovo_nome=None if cliente_id else (" ".join(str(nome or "").split()) or None),
        nuovo_cognome=None if cliente_id else cognome,
        nuovo_telefono=None if cliente_id else (" ".join(str(telefono or "").split()) or None))
    r = _chiama(rotte.crea_prenotazione, req=req, user=chi)
    siedi(r["id"], chi)
    return una(r["id"])


def cambia(pren_id: int, chi: Dict[str, Any], tavolo: Optional[str] = None, pax: Optional[int] = None) -> None:
    """Tavolo o coperti della prenotazione seguono il conto (tavolo spostato, coperti corretti)."""
    campi: Dict[str, Any] = {}
    if tavolo is not None:
        campi["tavolo"] = str(tavolo)
    if pax is not None:
        campi["pax"] = max(1, min(50, int(pax)))
    if campi:
        rotte = _rotte()
        _chiama(rotte.modifica_prenotazione, pren_id=pren_id, req=rotte.PrenotazioneUpdate(**campi), user=chi)


def completa(pren_id: int, chi: Dict[str, Any]) -> bool:
    """Tavolo chiuso: «Completata», se dal suo stato il Planning lo permette (Seduto, Al conto,
    Parziale). Vero se l'ha scritto."""
    p = una(pren_id)
    if not p or STATO_ANDATO not in stati_srv.transizioni(p["stato"]):
        return False
    rotte = _rotte()
    _chiama(rotte.cambio_stato, pren_id=pren_id, req=rotte.StatoUpdate(stato=STATO_ANDATO), user=chi)
    return True


def rimetti(pren_id: int, stato: Optional[str], tavolo: Optional[str], chi: Dict[str, Any]) -> None:
    """Collegamento tolto o conto annullato: stato e tavolo tornano quelli di prima. È un annullo,
    non un passaggio del Planning («Seduto → Confermata» a mano non esiste): si scrive com'era."""
    p = una(pren_id)
    if not p:
        return
    campi: Dict[str, Any] = {}
    if stato and stato != p["stato"] and stato in stati_srv.codici():
        campi["stato"] = stato
    if tavolo is not None and (tavolo or "").strip() != p["tavolo"]:
        campi["tavolo"] = (tavolo or "").strip()
    if campi:
        rotte = _rotte()
        _chiama(rotte.modifica_prenotazione, pren_id=pren_id, req=rotte.PrenotazioneUpdate(**campi), user=chi)


def togli_creata(pren_id: int) -> bool:
    """Toglie del tutto una prenotazione «Walk-in» nata da un tavolo aperto per sbaglio.
    Non la si annulla: finirebbe fra le cancellate e conterebbe come cancellazione del cliente
    (stessa scelta dei doppioni, prenotazioni_router.unisci_prenotazione_doppia; Marco: i
    doppioni «vanno eliminati del tutto»). Solo se è ancora quella nata qui: inserita a mano,
    canale Walk-in, senza TheFork e senza preventivo. Vero se l'ha tolta."""
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return False
        cur = conn.execute(
            "DELETE FROM clienti_prenotazioni WHERE id = ? AND fonte = 'manuale' AND canale = ? "
            "AND thefork_booking_id IS NULL AND preventivo_id IS NULL", (pren_id, CANALE_WALKIN))
        conn.commit()
        return cur.rowcount == 1
    finally:
        conn.close()
