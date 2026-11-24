# @version: v1.0 (2026-11-24) — le righe di un foglio diventano byte ESC/POS per le stampanti comande
# -*- coding: utf-8 -*-
"""
Stampa ESC/POS — servizio platform, parte del mattone M.M (ponte di stampa). [core]

Chi impagina (comande_stampa, domani la Cassa) descrive un foglio come una lista di righe:

    ("n", testo)                 carattere normale, a sinistra
    ("c", testo)                 carattere normale, al centro
    ("lr", sinistra, destra)     carattere normale, un pezzo per bordo
    ("dash",)                    riga di trattini
    ("dw", testo, al_centro)     doppia larghezza in grassetto (metà colonne)
    ("dd", testo, al_centro)     carattere doppio, largo e alto (metà colonne)
    ("neg", testo)               fascia nera a carattere doppio, al centro

Qui le righe diventano i byte da mandare alla stampante sulla porta 9100. Non c'è niente
di un modulo preciso: né comande né tavoli.

Provato su carta il 24/11/2026 sulle SOL801 dell'osteria (docs/operativo/rete.md):
- 48 colonne a carattere normale, 24 a carattere doppio;
- la stampante parte in modalità «caratteri cinesi», dove una lettera accentata si mangia il
  carattere che la segue (spazi e a capo compresi): `FS .` in testa a ogni foglio la spegne;
- in negativo il carattere largo e basso si legge male: per le fasce si usa il carattere doppio.
"""
from __future__ import annotations

import textwrap
from typing import Iterable, List, Sequence, Tuple

COLONNE = 48                      # carattere normale; il doppio ne ha la metà

ESC, GS, FS = b"\x1b", b"\x1d", b"\x1c"
_INIT = ESC + b"@"
# ESC @ azzera · FS . spegne i caratteri a due byte · ESC t 16 fissa la tabella WPC1252
INIZIO = _INIT + FS + b"." + ESC + b"t\x10"
TAGLIO = b"\n\n\n\n" + GS + b"V\x42\x00"          # quattro righe di carta, poi taglio parziale

Riga = Tuple


def _misura(n: int) -> bytes:                      # 0x00 normale · 0x10 larga · 0x01 alta · 0x11 doppia
    return GS + b"!" + bytes([n])


def _allinea(n: int) -> bytes:                     # 0 sinistra · 1 centro · 2 destra
    return ESC + b"a" + bytes([n])


def _grassetto(si: bool) -> bytes:
    return ESC + b"E" + bytes([1 if si else 0])


def _negativo(si: bool) -> bytes:
    return GS + b"B" + bytes([1 if si else 0])


_NORMALE = _misura(0) + _allinea(0) + _grassetto(False) + _negativo(False)


def _t(s) -> bytes:
    """Testo → WPC1252. Ciò che la tabella non ha (emoji, simboli) diventa «?»; niente a capo dentro."""
    return " ".join(str(s or "").split()).encode("cp1252", "replace") if s is not None else b""


def _grezzo(s: str) -> bytes:
    """Come _t ma tiene gli spazi così come sono (rientri, colonne già contate)."""
    return str(s or "").replace("\n", " ").replace("\r", " ").encode("cp1252", "replace")


def fascia(testo: str, colonne: int = COLONNE) -> str:
    """La scritta di una fascia nera a carattere doppio: uno spazio per parte se ci sta. Con una
    lettera sola di margine lo spazio va a sinistra (così fa iPratico); mai oltre le colonne."""
    meta = colonne // 2
    s = " ".join(str(testo or "").split())[:meta]
    if len(s) == meta - 1:
        return " " + s
    return s.center(min(meta, len(s) + 2))


def a_capo(testo: str, larghezza: int, prima: str = "", poi: str = "") -> List[str]:
    """Spezza un testo su più righe di `larghezza` colonne: `prima` davanti alla prima riga,
    `poi` davanti alle altre (il rientro). Una parola più lunga della riga viene tagliata."""
    testo = " ".join(str(testo or "").split())
    spazio = max(4, larghezza - max(len(prima), len(poi)))
    pezzi = textwrap.wrap(testo, spazio, break_long_words=True) or [""]
    return [(prima if i == 0 else poi) + p for i, p in enumerate(pezzi)]


def _riga(op: Sequence, colonne: int) -> bytes:
    k = op[0]
    meta = colonne // 2
    if k == "n":
        return _NORMALE + _grezzo(op[1])[:colonne] + b"\n"
    if k == "c":
        return _NORMALE + _allinea(1) + _t(op[1])[:colonne] + b"\n"
    if k == "lr":
        a, b = " ".join(str(op[1] or "").split()), " ".join(str(op[2] or "").split())
        a = a[:max(0, colonne - len(b) - 1)]
        return _NORMALE + _grezzo(a + " " * max(1, colonne - len(a) - len(b)) + b) + b"\n"
    if k == "dash":
        return _NORMALE + b"-" * colonne + b"\n"
    if k == "dw":
        centro = len(op) > 2 and op[2]
        return _NORMALE + _misura(0x10) + _grassetto(True) + (_allinea(1) if centro else b"") + _grezzo(op[1])[:meta] + b"\n"
    if k == "dd":
        centro = len(op) > 2 and op[2]
        return _NORMALE + _misura(0x11) + (_allinea(1) if centro else b"") + _grezzo(op[1])[:meta] + b"\n"
    if k == "neg":
        return _NORMALE + _misura(0x11) + _allinea(1) + _negativo(True) + _grezzo(fascia(op[1], colonne)) + _negativo(False) + b"\n"
    raise ValueError(f"Riga di stampa sconosciuta: {k!r}")


def foglio(righe: Iterable[Riga], colonne: int = COLONNE) -> bytes:
    """I byte di un foglio intero: inizio, righe, carta e taglio."""
    return INIZIO + b"".join(_riga(r, colonne) for r in righe) + _NORMALE + TAGLIO


def foglio_di_prova(stampante: str, quando: str, colonne: int = COLONNE) -> bytes:
    """Un foglio corto per vedere che una stampante riceve da TRGB: nome, ora, le tre misure,
    una fascia nera e gli accenti."""
    meta = colonne // 2
    righe: List[Riga] = [
        ("neg", "PROVA DI STAMPA"),
        ("dd", str(stampante or "")[:meta], True),
        ("c", f"mandato da TRGB il {quando}"),
        ("dash",),
        ("n", ("1234567890" * 10)[:colonne]),
        ("dd", ("1234567890" * 10)[:meta], False),
        ("dw", "--- doppia larghezza ---", True),
        ("c", "accenti: àèéìòù ÀÈÉ · « » €"),
        ("dash",),
        ("c", "Se lo leggi, la stampa da TRGB funziona."),
    ]
    return foglio(righe, colonne)
