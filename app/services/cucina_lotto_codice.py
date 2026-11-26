#!/usr/bin/env python3
# Modulo: cucina
# @version: v1.1 — la chiave nasce da sola fra i dati del locale (2026-11-26); v1.0 codice lotto a 6 caratteri
# -*- coding: utf-8 -*-
"""
Codice lotto di produzione — modulo cucina.

Logica decisa da Marco il 2026-11-26: un codice di 6 caratteri (lettere e cifre)
che per il pubblico non vuol dire niente e che TRGB sa rileggere in

    data di produzione (anno, mese, giorno) · persona · numero produzione (2 cifre)

COME E' FATTO
-------------
1. data, persona e numero produzione diventano UN numero solo;
2. quel numero viene rimescolato con una chiave segreta (mai nel repo: il file
   `lotto_chiave.json` fra i dati del locale, creato da solo al primo codice, o
   `LOTTO_CHIAVE` nell'ambiente): due produzioni dello stesso giorno e della
   stessa persona escono senza niente in comune;
3. il numero rimescolato si scrive in 5 caratteri; il sesto e' di controllo,
   cosi' un codice battuto male viene rifiutato invece di «dire» una data falsa.

Qui dentro c'e' SOLO il calcolo: niente DB, niente endpoint. Il registro
(`cucina_produzioni`, service `cucina_produzioni_service`) salva ogni codice
generato: se un giorno la chiave andasse persa, i codici gia' stampati si
rileggono da li'.

ATTENZIONE — I NUMERI DEL FORMATO NON SONO SOGLIE
-------------------------------------------------
`ANNO_BASE`, `PERSONE_MAX`, `PRODUZIONI_MAX` e l'alfabeto NON vanno in una
tabella di configurazione: cambiarli cambia il significato dei codici gia'
stampati. Se servono capienze diverse si fa un formato nuovo (7 caratteri),
non si ritocca questo.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

# Senza 0, 1, I, O: su un'etichetta piccola si confondono.
ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
assert len(ALFABETO) == 32

LUNGHEZZA = 6                      # 5 di contenuto + 1 di controllo
ANNO_BASE = 2026                   # il giorno 0 e' il 1° gennaio 2026
PERSONE_MAX = 90                   # numeri persona 1..90
PRODUZIONI_MAX = 100               # numero produzione 0..99 (due cifre)

_SPAZIO = 32 ** (LUNGHEZZA - 1)    # 33.554.432 codici possibili
_PER_GIORNO = PERSONE_MAX * PRODUZIONI_MAX
_GIORNI = _SPAZIO // _PER_GIORNO   # 3.728 giorni: fino a meta' marzo 2036
_GIORNO_ZERO = date(ANNO_BASE, 1, 1)
ULTIMO_GIORNO = _GIORNO_ZERO + timedelta(days=_GIORNI - 1)

_META_BIT = 13                     # rimescolamento su 26 bit, due meta' da 13
_MASCHERA = (1 << _META_BIT) - 1
_GIRI = 8

class CodiceLottoErrore(ValueError):
    """Dati fuori formato, codice scritto male o chiave mancante."""


@dataclass(frozen=True)
class Lotto:
    data: date
    persona: int
    produzione: int


def _chiave_del_locale() -> str:
    """La chiave del locale: `locali/<locale>/data/lotto_chiave.json`, creata da sola al
    primo codice. Sta fra i dati del locale (fuori da git) ed e' un .json apposta:
    `scripts/backup_db.sh` copia i *.json di quella cartella, quindi finisce nei backup."""
    import json
    import secrets
    from app.utils.locale_data import locale_data_path

    f = locale_data_path("lotto_chiave.json")
    if f.exists():
        try:
            k = (json.loads(f.read_text(encoding="utf-8")) or {}).get("chiave") or ""
        except (OSError, ValueError):
            k = ""
        if not k:
            # File illeggibile: NON se ne crea uno nuovo sopra (i codici gia' stampati
            # smetterebbero di leggersi dal calcolo). Si ferma e lo dice.
            raise CodiceLottoErrore(
                "Il file della chiave dei codici lotto (lotto_chiave.json) non si legge: "
                "va ripreso dal backup prima di generare altri codici."
            )
        return k
    k = secrets.token_urlsafe(32)
    f.write_text(json.dumps({"chiave": k, "nota": "Chiave dei codici lotto. Non cambiarla e non cancellarla."},
                            ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(f, 0o600)
    except OSError:
        pass
    return k


def _chiave(chiave: Optional[str] = None) -> bytes:
    """Ordine: quella passata (prove), `LOTTO_CHIAVE` nell'ambiente, il file del locale."""
    k = chiave if chiave is not None else os.getenv("LOTTO_CHIAVE", "")
    if not k:
        k = _chiave_del_locale()
    return k.encode("utf-8")


def _f(chiave: bytes, giro: int, meta: int) -> int:
    d = hmac.new(chiave, bytes([giro]) + meta.to_bytes(2, "big"), hashlib.sha256).digest()
    return int.from_bytes(d[:2], "big") & _MASCHERA


def _mescola(n: int, chiave: bytes) -> int:
    s, d = n >> _META_BIT, n & _MASCHERA
    for g in range(_GIRI):
        s, d = d, s ^ _f(chiave, g, d)
    return (s << _META_BIT) | d


def _smescola(n: int, chiave: bytes) -> int:
    s, d = n >> _META_BIT, n & _MASCHERA
    for g in reversed(range(_GIRI)):
        s, d = d ^ _f(chiave, g, s), s
    return (s << _META_BIT) | d


def _controllo(corpo: str, chiave: bytes) -> str:
    d = hmac.new(chiave, b"controllo:" + corpo.encode("ascii"), hashlib.sha256).digest()
    return ALFABETO[d[0] % 32]


def pulisci(codice: str) -> str:
    """Toglie spazi e trattini e mette in maiuscolo: `g5c-tb7` e `G5CTB7` sono lo stesso codice."""
    return "".join(ch for ch in (codice or "").upper() if ch.isalnum())


def genera(data: date, persona: int, produzione: int, chiave: Optional[str] = None) -> str:
    """Il codice lotto di una produzione. Solleva CodiceLottoErrore se i dati sono fuori formato."""
    if not (_GIORNO_ZERO <= data <= ULTIMO_GIORNO):
        raise CodiceLottoErrore(
            f"Data fuori dal formato: va dal {_GIORNO_ZERO.isoformat()} al {ULTIMO_GIORNO.isoformat()}."
        )
    if not (1 <= persona <= PERSONE_MAX):
        raise CodiceLottoErrore(f"Numero persona fuori dal formato (1-{PERSONE_MAX}).")
    if not (0 <= produzione < PRODUZIONI_MAX):
        raise CodiceLottoErrore(f"Numero produzione fuori dal formato (0-{PRODUZIONI_MAX - 1}).")

    k = _chiave(chiave)
    n = ((data - _GIORNO_ZERO).days * PERSONE_MAX + (persona - 1)) * PRODUZIONI_MAX + produzione
    # Il rimescolamento lavora su 26 bit ma i codici sono 25: si rigira finche'
    # il risultato rientra (in media due giri, e resta reversibile).
    m = _mescola(n, k)
    while m >= _SPAZIO:
        m = _mescola(m, k)

    corpo = ""
    for _ in range(LUNGHEZZA - 1):
        corpo = ALFABETO[m % 32] + corpo
        m //= 32
    return corpo + _controllo(corpo, k)


def leggi(codice: str, chiave: Optional[str] = None) -> Lotto:
    """Dal codice a data, persona e numero produzione. Solleva CodiceLottoErrore se il
    codice e' scritto male (lunghezza, caratteri, carattere di controllo)."""
    c = pulisci(codice)
    if len(c) != LUNGHEZZA:
        raise CodiceLottoErrore(f"Il codice lotto ha {LUNGHEZZA} caratteri.")
    if any(ch not in ALFABETO for ch in c):
        raise CodiceLottoErrore("Nel codice lotto non esistono 0, 1, I e O: ricontrolla l'etichetta.")

    k = _chiave(chiave)
    corpo, ctrl = c[:-1], c[-1]
    if not hmac.compare_digest(_controllo(corpo, k), ctrl):
        raise CodiceLottoErrore("Codice lotto non valido: ricontrolla l'etichetta.")

    m = 0
    for ch in corpo:
        m = m * 32 + ALFABETO.index(ch)
    n = _smescola(m, k)
    while n >= _SPAZIO:
        n = _smescola(n, k)

    n, produzione = divmod(n, PRODUZIONI_MAX)
    giorni, persona0 = divmod(n, PERSONE_MAX)
    if giorni >= _GIORNI:
        raise CodiceLottoErrore("Codice lotto non valido: ricontrolla l'etichetta.")
    return Lotto(data=_GIORNO_ZERO + timedelta(days=giorni), persona=persona0 + 1, produzione=produzione)
