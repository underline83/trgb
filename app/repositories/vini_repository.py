# @version: v1.3-dev
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Repository Vini
File: app/repositories/vini_repository.py

Funzioni principali:

- load_vini_ordinati()
    → ritorna lista dei vini ordinati per la CARTA:
      Tipologia → Nazione → Regione → Produttore → Descrizione → Annata
    (usa filtri da tabella filtri_carta:
        min_qta_stampa, mostra_negativi, mostra_senza_prezzo)

- search_vini(...)
    → ricerca / lista vini per il gestionale:
      testo libero, filtri tipologia / carta / disponibilità, paginazione

- get_vino_dettaglio(vino_id)
    → ritorna il dettaglio di un singolo vino (anagrafica + stock base)
"""

# @changelog:
#   - v1.3-dev (2025-12-01):
#       • ADD: search_vini(...) per lista/ricerca lato gestionale
#       • ADD: get_vino_dettaglio(vino_id) per pagina dettaglio vino
#       • UPDATE: load_vini_ordinati ora include anche il campo id
#
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
from typing import List, Dict, Any, Tuple, Optional

from app.models.vini_db import get_connection, init_database
from app.models.settings_db import get_settings_conn, init_settings_db
from app.models.vini_settings import ensure_settings_defaults


# ---------------------------------------------------------
# ORDINAMENTI (per carta vini)
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
# FILTRI (per carta vini)
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
# CARTA VINI ORDINATA (per PDF/HTML/DOCX)
# ---------------------------------------------------------
def load_vini_ordinati() -> List[Dict[str, Any]]:
    """
    Restituisce i vini destinati alla CARTA, filtrati e ordinati
    secondo le impostazioni di tipologia / nazione / regione.

    Usata da:
      - /vini/carta (HTML)
      - /vini/carta/pdf
      - /vini/carta/pdf-staff
      - /vini/carta/docx
    """
    init_database()
    conn_vini = get_connection()
    cur_v = conn_vini.cursor()

    # Filtri settings
    min_qta_stampa, mostra_negativi, mostra_senza_prezzo = _load_filtri()

    # Query base
    rows = cur_v.execute(
        """
        SELECT
            id,
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
    out: List[Dict[str, Any]] = []
    for r in ordered:
        out.append({
            "id": r["id"],
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


# =========================================================
#  SEZIONE GESTIONALE — RICERCA / DETTAGLIO VINI
# =========================================================

def search_vini(
    q: Optional[str] = None,
    tipologia: Optional[str] = None,
    solo_in_carta: bool = False,
    solo_disponibili: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Ricerca / lista vini per il GESTIONALE.

    Filtri:
      - q: testo libero su PRODUTTORE / DESCRIZIONE / REGIONE / CODICE
      - tipologia: valore esatto di TIPOLOGIA
      - solo_in_carta: se True, filtra CARTA = 'SI'
      - solo_disponibili: se True, filtra QTA > 0

    Paginazione:
      - limit, offset
    """
    init_database()
    conn = get_connection()
    cur = conn.cursor()

    sql = """
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            CODICE,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA,
            PREZZO,
            QTA,
            CARTA
        FROM vini
        WHERE 1 = 1
    """
    params: list[Any] = []

    # filtro testo libero
    if q:
        q = q.strip()
        if q:
            like = f"%{q}%"
            sql += """
                AND (
                    UPPER(PRODUTTORE) LIKE UPPER(?)
                    OR UPPER(DESCRIZIONE) LIKE UPPER(?)
                    OR UPPER(REGIONE) LIKE UPPER(?)
                    OR UPPER(CODICE) LIKE UPPER(?)
                )
            """
            params.extend([like, like, like, like])

    # filtro tipologia
    if tipologia:
        sql += " AND TIPOLOGIA = ?"
        params.append(tipologia)

    # solo vini in carta
    if solo_in_carta:
        sql += " AND CARTA = 'SI'"

    # solo vini con stock positivo
    if solo_disponibili:
        sql += " AND QTA > 0"

    # ordine "gestionale": per tipologia/regione/produttore/descrizione
    sql += """
        ORDER BY
            TIPOLOGIA,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    rows = cur.execute(sql, params).fetchall()
    conn.close()

    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r["id"],
            "TIPOLOGIA": r["TIPOLOGIA"],
            "NAZIONE": r["NAZIONE"],
            "CODICE": r["CODICE"],
            "REGIONE": r["REGIONE"],
            "PRODUTTORE": r["PRODUTTORE"],
            "DESCRIZIONE": r["DESCRIZIONE"],
            "ANNATA": r["ANNATA"],
            "PREZZO": r["PREZZO"],
            "QTA": r["QTA"],
            "CARTA": r["CARTA"],
        })

    return out


def get_vino_dettaglio(vino_id: int) -> Optional[Dict[str, Any]]:
    """
    Ritorna il dettaglio di un singolo vino.
    (Per ora solo dati anagrafici + stock. I movimenti sono gestiti
     via helper in app.models.vini_db e relativi endpoint nel router.)
    """
    init_database()
    conn = get_connection()
    cur = conn.cursor()

    row = cur.execute(
        """
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            CODICE,
            REGIONE,
            CARTA,
            DESCRIZIONE,
            ANNATA,
            PRODUTTORE,
            PREZZO,
            FORMATO,
            N_FRIGO,
            N_LOC1,
            N_LOC2,
            QTA
        FROM vini
        WHERE id = ?
        """,
        (vino_id,),
    ).fetchone()

    conn.close()

    if not row:
        return None

    return {
        "id": row["id"],
        "TIPOLOGIA": row["TIPOLOGIA"],
        "NAZIONE": row["NAZIONE"],
        "CODICE": row["CODICE"],
        "REGIONE": row["REGIONE"],
        "CARTA": row["CARTA"],
        "DESCRIZIONE": row["DESCRIZIONE"],
        "ANNATA": row["ANNATA"],
        "PRODUTTORE": row["PRODUTTORE"],
        "PREZZO": row["PREZZO"],
        "FORMATO": row["FORMATO"],
        "N_FRIGO": row["N_FRIGO"],
        "N_LOC1": row["N_LOC1"],
        "N_LOC2": row["N_LOC2"],
        "QTA": row["QTA"],
    }