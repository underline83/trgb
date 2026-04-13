# @version: v1.0-whatsapp-utils
# -*- coding: utf-8 -*-
"""
Mattone M.C — Utility WhatsApp lato backend.

Funzioni per normalizzare telefoni e costruire link wa.me.
Usato da prenotazioni_router, preventivi_router (futuro), ecc.

Uso:
    from app.utils.whatsapp import normalize_phone, build_wa_link, fill_template

    link = build_wa_link("333 1234567", "Ciao {nome}!", nome="Marco")
"""

import re
import urllib.parse


def normalize_phone(telefono: str) -> str | None:
    """
    Normalizza un numero di telefono italiano per wa.me.

    >>> normalize_phone("+39 333-123.4567")
    '393331234567'
    >>> normalize_phone("3331234567")
    '393331234567'
    >>> normalize_phone("")
    None
    """
    if not telefono:
        return None

    # Rimuovi tutto tranne cifre e +
    tel = re.sub(r"[^\d+]", "", telefono)

    # Rimuovi + iniziale
    if tel.startswith("+"):
        tel = tel[1:]

    # Gia' con prefisso 39 e lunghezza corretta
    if tel.startswith("39") and len(tel) >= 11:
        return tel

    # Cellulare italiano (3xx) senza prefisso
    if tel.startswith("3") and len(tel) == 10:
        return "39" + tel

    # Fisso italiano (0xx) senza prefisso
    if tel.startswith("0") and len(tel) >= 9:
        return "39" + tel

    # Abbastanza lungo ma senza 39
    if len(tel) >= 10 and not tel.startswith("39"):
        return "39" + tel

    # Gia' con prefisso internazionale non italiano
    if len(tel) >= 10:
        return tel

    return None


def fill_template(template: str, **kwargs) -> str:
    """
    Sostituisce {variabili} nel template con i valori forniti.

    >>> fill_template("Ciao {nome}, {pax} persone", nome="Marco", pax=4)
    'Ciao Marco, 4 persone'
    """
    if not template:
        return ""
    result = template
    for key, value in kwargs.items():
        result = result.replace(f"{{{key}}}", str(value) if value is not None else "")
    return result


def build_wa_link(telefono: str, testo: str = "", **template_vars) -> str | None:
    """
    Costruisce un URL wa.me completo.

    Se template_vars sono forniti, applica fill_template al testo.

    >>> build_wa_link("3331234567", "Ciao {nome}!", nome="Marco")
    'https://wa.me/393331234567?text=Ciao%20Marco%21'
    """
    tel = normalize_phone(telefono)
    if not tel:
        return None

    messaggio = fill_template(testo, **template_vars) if template_vars else testo
    encoded = urllib.parse.quote(messaggio) if messaggio else ""

    return f"https://wa.me/{tel}{'?text=' + encoded if encoded else ''}"
