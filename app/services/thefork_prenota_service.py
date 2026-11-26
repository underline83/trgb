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


def prova_creazione(data: str, email: str, nome: str, cognome: str,
                    ora: Optional[str] = None, coperti: int = 2,
                    lingua: str = "it", titolo: str = "mr") -> Dict[str, Any]:
    """
    Crea una prenotazione di prova e la cancella subito. Senza `ora` prende la
    prima fascia prenotabile online di quel giorno. Non solleva: racconta i passi.
    """
    esito: Dict[str, Any] = {"creata": False, "cancellata": False, "data": data, "ora": ora,
                             "scope": None, "uuid": None, "errore": None, "messaggio": ""}
    try:
        if not ora:
            fasce = tf.fasce_prenotabili_online(data, coperti)
            if not fasce:
                esito["errore"] = "nessuna fascia online"
                esito["messaggio"] = (f"Il {data} TheFork non ha fasce prenotabili online per {coperti}: "
                                      "scegli un altro giorno o indica un'ora.")
                return esito
            ora = fasce[0]
            esito["ora"] = ora
        r = crea_prenotazione(
            f"{data}T{ora}", coperti,
            {"email": email, "firstName": nome, "lastName": cognome, "locale": lingua, "civility": titolo},
            nota_ristorante="PROVA TRGB — da ignorare, cancellata subito",
        )
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
