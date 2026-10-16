# Modulo: acquisti (categorie fornitori) — letto dal Conto Economico (controllo_gestione) — [core]
# -*- coding: utf-8 -*-
"""
Regole di spalmatura di default per categoria/sottocategoria (mig 191, 2026-10-16).

Una regola dice: le righe di fattura di questa (sotto)categoria, nel Conto
Economico, si spalmano su N mesi a partire dal mese di competenza della
fattura, per le fatture con competenza da `valida_dal` in avanti.

Priorità (decisione Marco 16/10/2026, opzione «per riga»):
  spalmatura manuale della fattura (fe_fatture.spalmatura_mesi) > regola
  sottocategoria > regola categoria > nessuna (mese di competenza).
Una sottocategoria con mesi = 1 vuol dire «non spalmare» anche se la sua
categoria ha una regola. NULL = eredita dalla categoria.

Servizio condiviso: lo usano conto_economico.py (calcolo) e fe_import.py
(dettaglio fattura, per mostrare quale regola si applica).
"""
import sqlite3
from typing import Optional


def _ha_colonne(conn: sqlite3.Connection, tabella: str) -> bool:
    cols = {r[1] for r in conn.execute(f"PRAGMA table_info({tabella})").fetchall()}
    return "spalmatura_mesi_default" in cols and "spalmatura_valida_dal" in cols


def carica_regole(conn: sqlite3.Connection) -> dict:
    """Ritorna {"cat": {id: (mesi, valida_dal)}, "sub": {id: (mesi, valida_dal)}}.

    Solo le righe con spalmatura_mesi_default valorizzato. Se la migrazione 191
    non è applicata ritorna dizionari vuoti (comportamento di prima).
    """
    regole = {"cat": {}, "sub": {}}
    for chiave, tabella in (("cat", "fe_categorie"), ("sub", "fe_sottocategorie")):
        if not _ha_colonne(conn, tabella):
            continue
        for r in conn.execute(
            f"SELECT id, spalmatura_mesi_default, spalmatura_valida_dal FROM {tabella} "
            f"WHERE spalmatura_mesi_default IS NOT NULL AND spalmatura_mesi_default > 0"
        ).fetchall():
            regole[chiave][r[0]] = (int(r[1]), (r[2] or "")[:7] or None)
    return regole


def regola_per(regole: dict, cat_id: Optional[int], sub_id: Optional[int]) -> Optional[tuple]:
    """(mesi, valida_dal 'YYYY-MM' o None) della regola che vale, o None.

    mesi = 1 vuol dire «nessuna spalmatura» (esclusione esplicita).
    """
    if sub_id is not None and sub_id in regole["sub"]:
        return regole["sub"][sub_id]
    if cat_id is not None and cat_id in regole["cat"]:
        return regole["cat"][cat_id]
    return None


def mesi_tra(da_mese: str, a_mese: str) -> int:
    """Numero di mesi da 'YYYY-MM' a 'YYYY-MM' (0 se uguali, negativo se prima)."""
    return (int(a_mese[:4]) - int(da_mese[:4])) * 12 + int(a_mese[5:7]) - int(da_mese[5:7])


def sposta_mese(mese: str, delta: int) -> str:
    """'YYYY-MM' + delta mesi."""
    n = int(mese[:4]) * 12 + int(mese[5:7]) - 1 + delta
    return f"{n // 12:04d}-{n % 12 + 1:02d}"


def regola_attiva(regole: dict, cat_id, sub_id, mese_competenza: str) -> Optional[int]:
    """N mesi (>1) se la regola si applica a una riga con questo mese di
    competenza, altrimenti None."""
    r = regola_per(regole, cat_id, sub_id)
    if not r:
        return None
    mesi, valida_dal = r
    if mesi <= 1:
        return None
    if valida_dal and mese_competenza < valida_dal:
        return None
    return mesi
