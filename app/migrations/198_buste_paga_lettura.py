# Modulo: dipendenti (sotto-modulo buste-paga) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 198 — Buste paga: presa visione del dipendente (2026-10-18)

Contesto (Marco): il dipendente collegato al proprio utente vede l'archivio
delle sue buste paga in «Le mie buste paga» e le scarica. Al PRIMO download
fatto da lui la busta si segna come letta, così l'admin sa che è stata presa.

buste_paga
  letta_il    'AAAA-MM-GG HH:MM:SS' del primo download del dipendente (NULL = mai)
  letta_da    username che l'ha scaricata (l'utente collegato al dipendente)

I download dell'admin NON segnano la lettura. Una volta scritta non si
sovrascrive (resta la data del primo download).

Solo ADD COLUMN con try/except: idempotente. DB toccato: dipendenti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    dip_path = locale_data_path("dipendenti.sqlite3")
    dconn = sqlite3.connect(dip_path)
    try:
        cols = {r[1] for r in dconn.execute("PRAGMA table_info(buste_paga)")}
        for nome, tipo in (("letta_il", "TEXT"), ("letta_da", "TEXT")):
            if nome not in cols:
                dconn.execute(f"ALTER TABLE buste_paga ADD COLUMN {nome} {tipo}")
        dconn.commit()
        print("  [198] buste_paga.letta_il / letta_da pronte")
    finally:
        dconn.close()
