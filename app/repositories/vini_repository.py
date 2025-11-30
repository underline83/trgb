# @version: v1.2-stable
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Query Carta Vini ordinata
File: app/repositories/vini_repository.py

Funzioni:
- load_vini_ordinati() → ritorna lista dei vini ordinati:
  Tipologia → Nazione → Regione → Produttore → Descrizione → Annata

Filtri applicati (da tabella filtri_carta):
- min_qta_stampa      : quantità minima per includere il vino
- mostra_negativi     : include vini con QTA < 0
- mostra_senza_prezzo : include vini con PREZZO NULL o 0 (default = False)
"""

# @changelog:
#   - v1.2-stable (2025-11-13):
#       • ADD: filtro mostra_senza_prezzo su PREZZO NULL/0
#       • ADD: lettura del nuovo campo da filtri_carta
#       • REFACTOR: applicazione filtri centralizzata
#
#   - v1.1-stable:
#       • FIX: allineamento ensure_settings_defaults()
#       • ADD: filtri quantità min_qta_stampa / mostra_negativi
#       • REFACTOR: ritorno semplificato come dict

from __future__ import annotations
from typing import List, Dict, Any, Tuple

from app.models.vini_db import get_connection, init_database
from app.models.settings_db import get_settings_conn, init_settings_db
from app.models.vini_settings import ensure_settings_defaults


# ---------------------------------------------------------
# ORDINAMENTI
# ---------------------------------------------------------
def _load_ordinamenti() -> Tuple[Dict[str, int], Dict[str, int], Dict[str, int]]:
    init_settings_db()
    ensure_settings_defaults()

    conn = get_settings_conn()
    cur = conn.cursor()

    tip_map = {r["nome"]: r["ordine"] for r in cur.execute("SELECT nome, ordine FROM tipologia_order;")}
    naz_map = {r["nazione"]: r["ordine"] for r in cur.execute("SELECT nazione, ordine FROM nazioni_order;")}
    reg_map = {r["codice"]: r["ordine"] for r in cur.execute("SELECT codice, ordine FROM regioni_order;")}

    conn.close()
    return tip_map, naz_map, reg_map


# ---------------------------------------------------------
# FILTRI
# ---------------------------------------------------------
def _load_filtri() -> tuple[int, bool, bool]:
    """
    Ritorna:
        (min_qta_stampa, mostra_negativi, mostra_senza_prezzo)
    """
    init_settings_db()
    conn = get_settings_conn()
    cur = conn.cursor()

    row = cur.execute(
        "SELECT min_qta_stampa, mostra_negativi, mostra_senza_prezzo "
        "FROM filtri_carta WHERE id = 1;"
    ).fetchone()

    conn.close()

    if not row:
        return 1, False, False

    try:
        min_qta = int(row["min_qta_stampa"])
    except Exception:
        min_qta = 1

    return (
        min_qta,
        bool(row["mostra_negativi"]),
        bool(row["mostra_senza_prezzo"]),
    )


# ---------------------------------------------------------
# FUNZIONE PRINCIPALE
# ---------------------------------------------------------
def load_vini_ordinati() -> List[Dict[str, Any]]:
    init_database()
    conn_vini = get_connection()
    cur_v = conn_vini.cursor()

    # Filtri settings
    min_qta_stampa, mostra_negativi, mostra_senza_prezzo = _load_filtri()

    # Query base
    rows = cur_v.execute(
        """
        SELECT
            TIPOLOGIA,
            NAZIONE,
            CODICE,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA,
            PREZZO,
            QTA
        FROM vini
        WHERE
            TIPOLOGIA IS NOT NULL
            AND TIPOLOGIA <> 'ERRORE'
            AND CARTA = 'SI'
        """
    ).fetchall()
    conn_vini.close()

    # ---------------------------------------------------------
    # FILTRI DI SELEZIONE
    # ---------------------------------------------------------
    filtered = []
    for r in rows:
        qta = r["QTA"] or 0
        prezzo = r["PREZZO"]

        # filtro quantità
        if not (qta >= min_qta_stampa or (mostra_negativi and qta < 0)):
            continue

        # filtro prezzo
        if not mostra_senza_prezzo:
            if prezzo is None or prezzo == 0:
                continue

        filtered.append(r)

    # ---------------------------------------------------------
    # ORDINAMENTO
    # ---------------------------------------------------------
    tip_map, naz_map, reg_map = _load_ordinamenti()

    def sort_key(r):
        return (
            tip_map.get(r["TIPOLOGIA"], 9999),
            naz_map.get(r["NAZIONE"], 9999),
            reg_map.get(r["CODICE"], 9999),
            (r["PRODUTTORE"] or "").upper(),
            (r["DESCRIZIONE"] or "").upper(),
            r["ANNATA"],
        )

    ordered = sorted(filtered, key=sort_key)

    # ---------------------------------------------------------
    # CONVERSIONE
    # ---------------------------------------------------------
    out = []
    for r in ordered:
        out.append({
            "TIPOLOGIA": r["TIPOLOGIA"],
            "NAZIONE": r["NAZIONE"],
            "CODICE": r["CODICE"],
            "REGIONE": r["REGIONE"],
            "PRODUTTORE": r["PRODUTTORE"],
            "DESCRIZIONE": r["DESCRIZIONE"],
            "ANNATA": r["ANNATA"],
            "PREZZO": r["PREZZO"],
            "QTA": r["QTA"],
        })

    return out