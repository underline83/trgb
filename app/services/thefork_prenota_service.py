# Modulo: prenotazioni (integrazione TheFork B2B API, scrittura prenotazioni) — [core]
# -*- coding: utf-8 -*-
"""
Scrivere prenotazioni su TheFork Manager via B2B API (2026-11-26).

Primo pezzo: creare, cancellare e la PROVA (crea una prenotazione finta e la
cancella subito) per capire se il permesso del token basta. Régis (TheFork,
25/11/2026): «creare prenotazioni è già possibile con gli scope attuali»; la
specifica dice che `tfm-restaurant` è «Full access».

  POST  /v1/restaurants/{id}/reservations   crea (mealDate, partySize, customer)
  PATCH /v1/reservations/{id}/cancel        cancella (motivo sempre «ristorante»)

Il cliente vuole obbligatori email, nome, cognome, lingua (locale) e titolo
(civility); il telefono è facoltativo, in formato +39….
Il collegamento col form «Nuova prenotazione» NON c'è ancora: lo decide Marco.
Tutte le chiamate passano dal client di thefork_service (token, errori).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.services import thefork_service as tf


def crea_prenotazione(data_ora: str, coperti: int, cliente: Dict[str, Any],
                      nota_ristorante: Optional[str] = None,
                      nota_cliente: Optional[str] = None) -> Dict[str, Any]:
    """
    Crea una prenotazione su TheFork. `data_ora` = «AAAA-MM-GGTHH:MM» in ora del
    locale. `cliente` = email, firstName, lastName, locale, civility (+ phone).
    Solleva TheForkErroreAPI (403 = manca il permesso, 409 = fascia non prenotabile).
    """
    uuid = tf._restaurant_uuid_atteso()
    if not tf.credenziali_presenti() or not uuid:
        raise tf.TheForkNonConfigurato("credenziali B2B API non configurate")
    corpo: Dict[str, Any] = {"mealDate": data_ora, "partySize": int(coperti), "customer": cliente}
    if nota_ristorante:
        corpo["restaurantNote"] = nota_ristorante[:1000]
    if nota_cliente:
        corpo["customerNote"] = nota_cliente[:1000]
    r = tf._richiesta("POST", f"/v1/restaurants/{uuid}/reservations", corpo=corpo)
    if r is None:
        raise tf.TheForkErroreAPI(404, "ristorante non trovato su TheFork")
    return r


def cancella_prenotazione(reservation_uuid: str) -> Dict[str, Any]:
    """Cancella una prenotazione su TheFork (409 se è già cancellata)."""
    if not tf.credenziali_presenti():
        raise tf.TheForkNonConfigurato("credenziali B2B API non configurate")
    r = tf._richiesta("PATCH", f"/v1/reservations/{reservation_uuid}/cancel")
    if r is None:
        raise tf.TheForkErroreAPI(404, "prenotazione non trovata su TheFork")
    return r


def _con_fuso(data: str, ora: str) -> str:
    """«AAAA-MM-GGTHH:MM+01:00» col fuso del locale (per provare l'ora con e senza offset)."""
    from datetime import datetime
    dt = datetime.fromisoformat(f"{data}T{ora}")
    fuso = tf._fuso_locale()
    return dt.replace(tzinfo=fuso).isoformat() if fuso else dt.astimezone().isoformat()


def _solo(d: Any, chiavi) -> Dict[str, Any]:
    return {k: d.get(k) for k in chiavi if isinstance(d, dict) and k in d}


def prova_creazione(data: str, email: str, nome: str, cognome: str,
                    ora: Optional[str] = None, coperti: int = 2,
                    lingua: str = "it", titolo: str = "mr",
                    telefono: Optional[str] = None, con_fuso: bool = False,
                    modifica: bool = False) -> Dict[str, Any]:
    """
    Crea una prenotazione di prova e la cancella subito. Senza `ora` prende la
    prima fascia prenotabile online di quel giorno. Non solleva: racconta i passi.
    `dettagli` riporta quello che TheFork ha risposto davvero (fasce grezze, ora
    mandata, prenotazione riletta, cliente): serve a studiare l'API (2026-11-26).
    `con_fuso` manda l'ora con l'offset del locale; `modifica` prova anche la PATCH.
    """
    dett: Dict[str, Any] = {}
    esito: Dict[str, Any] = {"creata": False, "cancellata": False, "data": data, "ora": ora,
                             "scope": None, "uuid": None, "errore": None, "messaggio": "", "dettagli": dett}
    try:
        uuid_r = tf._restaurant_uuid_atteso()
        try:
            grezze = tf.api_get(f"/v1/restaurants/{uuid_r}/timeslots", {"date": data, "partySize": coperti}) or []
            dett["fasce_grezze"] = [
                _solo(f, ("datetime", "hasNormalStock")) for f in grezze if f.get("hasNormalStock")
            ][:4]
        except tf.TheForkErroreAPI as e:
            dett["fasce_grezze"] = f"errore: {e}"
        if not ora:
            fasce = tf.fasce_prenotabili_online(data, coperti)
            if not fasce:
                esito["errore"] = "nessuna fascia online"
                esito["messaggio"] = (f"Il {data} TheFork non ha fasce prenotabili online per {coperti}: "
                                      "scegli un altro giorno o indica un'ora.")
                return esito
            ora = fasce[0]
            esito["ora"] = ora
        cliente = {"email": email, "firstName": nome, "lastName": cognome, "locale": lingua, "civility": titolo}
        if telefono:
            cliente["phone"] = telefono
        quando = _con_fuso(data, ora) if con_fuso else f"{data}T{ora}"
        dett["mandato"] = {"mealDate": quando, "partySize": coperti, "customer": cliente}
        r = crea_prenotazione(quando, coperti, cliente,
                              nota_ristorante="PROVA TRGB — da ignorare, cancellata subito")
    except tf.TheForkNonConfigurato as e:
        esito["errore"] = "non configurato"
        esito["messaggio"] = str(e)
        return esito
    except tf.TheForkErroreAPI as e:
        esito["errore"] = f"HTTP {e.status}"
        esito["scope"] = tf._token_cache.get("scope")
        if e.status == 403:
            esito["messaggio"] = (f"TheFork ha RIFIUTATO la creazione (403: manca il permesso). "
                                  f"Permessi del token: {esito['scope'] or '—'}")
        else:
            esito["messaggio"] = f"TheFork non ha creato la prenotazione — {e}"
        return esito

    esito["creata"] = True
    esito["scope"] = tf._token_cache.get("scope")
    esito["uuid"] = r.get("reservationUuid")
    esito["stato_thefork"] = r.get("status")
    esito["garanzia_richiesta"] = bool(r.get("paymentMethodRequest"))
    dett["risposta_creazione"] = _solo(r, ("reservationUuid", "mealDate", "status", "partySize", "customer",
                                           "paymentMethodRequest", "creditCardGuaranteeDetails"))
    try:
        letta = tf.api_get(f"/v1/reservations/{esito['uuid']}") or {}
        dett["riletta"] = _solo(letta, ("mealDate", "status", "partySize", "channel", "origin", "customer",
                                        "customerUuid", "createdAt", "tables", "restaurantNote"))
    except tf.TheForkErroreAPI as e:
        dett["riletta"] = f"errore: {e}"
    if modifica:
        try:
            m = tf._richiesta("PATCH", f"/v1/reservations/{esito['uuid']}", corpo={
                "mealDate": quando, "partySize": coperti + 1,
                "restaurantNote": "PROVA TRGB — modificata, cancellata subito"})
            dett["modifica"] = _solo(m or {}, ("mealDate", "status", "partySize", "restaurantNote")) or "ok"
        except tf.TheForkErroreAPI as e:
            dett["modifica"] = f"errore: {e}"
    try:
        cancella_prenotazione(esito["uuid"])
        esito["cancellata"] = True
        esito["messaggio"] = (f"Creazione OK: prenotazione di prova del {data} alle {ora} per {coperti} "
                              f"creata su TheFork e cancellata subito.")
    except (tf.TheForkErroreAPI, tf.TheForkNonConfigurato) as e:
        esito["errore"] = f"cancellazione: {e}"
        esito["messaggio"] = (f"ATTENZIONE: prenotazione di prova CREATA ({data} {ora}, {nome} {cognome}) "
                              f"ma NON cancellata — cancellala da TheFork Manager. {e}")
    return esito
