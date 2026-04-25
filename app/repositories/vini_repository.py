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

from app.models.vini_magazzino_db import get_magazzino_connection
from app.models.settings_db import get_settings_conn, init_settings_db
from app.models.vini_settings import ensure_settings_defaults, _TIPOLOGIA_MAP


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
    reg_map = {r["nome"]: r["ordine"] for r in cur.execute("SELECT nome, ordine FROM regioni_order;")}

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

    Legge dal DB magazzino (vini_magazzino.sqlite3).

    Usata da:
      - /vini/carta (HTML)
      - /vini/carta/pdf
      - /vini/carta/pdf-staff
      - /vini/carta/docx
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Filtri settings
    min_qta_stampa, mostra_negativi, mostra_senza_prezzo = _load_filtri()

    # Query dal magazzino
    # Sessione 58 (2026-04-25): aggiunti PREZZO_CALICE, VENDITA_CALICE,
    # BOTTIGLIA_APERTA per esporre il prezzo calice nella carta cliente
    # accanto a quello bottiglia, quando il vino e' venduto a calici.
    rows = cur.execute(
        """
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA,
            PREZZO_CARTA,
            PREZZO_CALICE,
            VENDITA_CALICE,
            BOTTIGLIA_APERTA,
            QTA_TOTALE
        FROM vini_magazzino
        WHERE
            TIPOLOGIA IS NOT NULL
            AND TIPOLOGIA <> 'ERRORE'
            AND CARTA = 'SI'
        """
    ).fetchall()
    conn.close()

    # ---------------------------------------------------------
    # FILTRI DI SELEZIONE
    # ---------------------------------------------------------
    filtered = []
    for r in rows:
        qta = r["QTA_TOTALE"] or 0
        prezzo = r["PREZZO_CARTA"]

        # filtro quantità
        if not (qta >= min_qta_stampa or (mostra_negativi and qta < 0)):
            continue

        # filtro prezzo
        if not mostra_senza_prezzo:
            if prezzo is None or prezzo == 0:
                continue

        filtered.append(dict(r))

    # ---------------------------------------------------------
    # NORMALIZZAZIONE TIPOLOGIE (vecchie → nuove)
    # ---------------------------------------------------------
    for r in filtered:
        r["TIPOLOGIA"] = _TIPOLOGIA_MAP.get(r["TIPOLOGIA"], r["TIPOLOGIA"])

    # ---------------------------------------------------------
    # ORDINAMENTO
    # ---------------------------------------------------------
    tip_map, naz_map, reg_map = _load_ordinamenti()

    def sort_key(r):
        return (
            tip_map.get(r["TIPOLOGIA"], 9999),
            naz_map.get(r["NAZIONE"], 9999),
            reg_map.get(r["REGIONE"], 9999),
            (r["PRODUTTORE"] or "").upper(),
            (r["DESCRIZIONE"] or "").upper(),
            r["ANNATA"] or "",
        )

    ordered = sorted(filtered, key=sort_key)

    # ---------------------------------------------------------
    # CONVERSIONE (nomi campo uniformi per carta_vini_service)
    # ---------------------------------------------------------
    out: List[Dict[str, Any]] = []
    for r in ordered:
        # Calcolo prezzo calice "effettivo": se PREZZO_CALICE non c'e'
        # ma il vino e' venduto al calice / e' in mescita, fallback su
        # PREZZO_CARTA / 5 (stessa logica di load_vini_calici).
        prezzo_calice = r["PREZZO_CALICE"]
        if (prezzo_calice is None or prezzo_calice == 0):
            pc = r["PREZZO_CARTA"]
            if pc and pc > 0:
                prezzo_calice = round(pc / 5, 2)

        is_calice = (r["VENDITA_CALICE"] or "") == "SI" or bool(r["BOTTIGLIA_APERTA"] or 0)

        out.append({
            "id": r["id"],
            "TIPOLOGIA": r["TIPOLOGIA"],
            "NAZIONE": r["NAZIONE"],
            "REGIONE": r["REGIONE"],
            "PRODUTTORE": r["PRODUTTORE"],
            "DESCRIZIONE": r["DESCRIZIONE"],
            "ANNATA": r["ANNATA"],
            "PREZZO": r["PREZZO_CARTA"],
            "PREZZO_CALICE": prezzo_calice if is_calice else None,
            "QTA": r["QTA_TOTALE"],
        })

    return out


# ---------------------------------------------------------
# CARTA VINI — SEZIONE CALICI
# ---------------------------------------------------------
def load_vini_calici() -> List[Dict[str, Any]]:
    """
    Restituisce i vini destinati alla sezione CALICI della carta.

    Logica di inclusione (sessione 58, 2026-04-25):
    - vini flaggati `VENDITA_CALICE='SI'` in anagrafica → standard;
    - vini con `BOTTIGLIA_APERTA=1` (bottiglia in mescita) → inclusi anche se
      `VENDITA_CALICE='NO'`. Caso d'uso: il sommelier apre estemporaneamente
      una bottiglia da carta normale per servirla al calice; il vino appare
      in carta calici finche' il flag e' attivo.

    Il filtro giacenza permette di restare in carta anche con QTA_TOTALE=0
    quando la bottiglia e' in mescita (calici residui ancora vendibili).
    Usa PREZZO_CALICE; se mancante, fallback `PREZZO_CARTA / 5` arrotondato.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    min_qta_stampa, mostra_negativi, mostra_senza_prezzo = _load_filtri()

    rows = cur.execute(
        """
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA,
            PREZZO_CALICE,
            PREZZO_CARTA,
            QTA_TOTALE,
            BOTTIGLIA_APERTA,
            VENDITA_CALICE
        FROM vini_magazzino
        WHERE
            TIPOLOGIA IS NOT NULL
            AND TIPOLOGIA <> 'ERRORE'
            AND (VENDITA_CALICE = 'SI' OR BOTTIGLIA_APERTA = 1)
        """
    ).fetchall()
    conn.close()

    filtered = []
    for r in rows:
        qta = r["QTA_TOTALE"] or 0
        bottiglia_aperta = bool(r["BOTTIGLIA_APERTA"] or 0)
        # Prezzo calice: usa PREZZO_CALICE se esiste, altrimenti auto-calc da PREZZO_CARTA / 5
        prezzo_calice = r["PREZZO_CALICE"]
        if prezzo_calice is None or prezzo_calice == 0:
            prezzo_carta = r["PREZZO_CARTA"]
            if prezzo_carta and prezzo_carta > 0:
                prezzo_calice = round(prezzo_carta / 5, 2)

        # Filtro giacenza: passa se qta sufficiente, oppure negative-mode, oppure
        # se la bottiglia e' aperta in mescita (anche con qta=0).
        passa_giacenza = (
            qta >= min_qta_stampa
            or (mostra_negativi and qta < 0)
            or bottiglia_aperta
        )
        if not passa_giacenza:
            continue
        if not mostra_senza_prezzo:
            if prezzo_calice is None or prezzo_calice == 0:
                continue

        d = dict(r)
        d["_PREZZO_CALICE_FINAL"] = prezzo_calice
        filtered.append(d)

    for r in filtered:
        r["TIPOLOGIA"] = _TIPOLOGIA_MAP.get(r["TIPOLOGIA"], r["TIPOLOGIA"])

    tip_map, naz_map, reg_map = _load_ordinamenti()

    def sort_key(r):
        return (
            tip_map.get(r["TIPOLOGIA"], 9999),
            naz_map.get(r["NAZIONE"], 9999),
            reg_map.get(r["REGIONE"], 9999),
            (r["PRODUTTORE"] or "").upper(),
            (r["DESCRIZIONE"] or "").upper(),
            r["ANNATA"] or "",
        )

    ordered = sorted(filtered, key=sort_key)

    out: List[Dict[str, Any]] = []
    for r in ordered:
        out.append({
            "id": r["id"],
            "TIPOLOGIA": r["TIPOLOGIA"],
            "NAZIONE": r["NAZIONE"],
            "REGIONE": r["REGIONE"],
            "PRODUTTORE": r["PRODUTTORE"],
            "DESCRIZIONE": r["DESCRIZIONE"],
            "ANNATA": r["ANNATA"],
            "PREZZO": r["_PREZZO_CALICE_FINAL"],
            "QTA": r["QTA_TOTALE"],
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
    Legge dal DB magazzino.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    sql = """
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            REGIONE,
            PRODUTTORE,
            DESCRIZIONE,
            ANNATA,
            PREZZO_CARTA,
            QTA_TOTALE,
            CARTA
        FROM vini_magazzino
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
                )
            """
            params.extend([like, like, like])

    # filtro tipologia
    if tipologia:
        sql += " AND TIPOLOGIA = ?"
        params.append(tipologia)

    # solo vini in carta
    if solo_in_carta:
        sql += " AND CARTA = 'SI'"

    # solo vini con stock positivo
    if solo_disponibili:
        sql += " AND QTA_TOTALE > 0"

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
            "TIPOLOGIA": _TIPOLOGIA_MAP.get(r["TIPOLOGIA"], r["TIPOLOGIA"]),
            "NAZIONE": r["NAZIONE"],
            "REGIONE": r["REGIONE"],
            "PRODUTTORE": r["PRODUTTORE"],
            "DESCRIZIONE": r["DESCRIZIONE"],
            "ANNATA": r["ANNATA"],
            "PREZZO": r["PREZZO_CARTA"],
            "QTA": r["QTA_TOTALE"],
            "CARTA": r["CARTA"],
        })

    return out


def get_vino_dettaglio(vino_id: int) -> Optional[Dict[str, Any]]:
    """
    Ritorna il dettaglio di un singolo vino dal DB magazzino.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    row = cur.execute(
        """
        SELECT
            id,
            TIPOLOGIA,
            NAZIONE,
            REGIONE,
            CARTA,
            DESCRIZIONE,
            ANNATA,
            PRODUTTORE,
            PREZZO_CARTA,
            FORMATO,
            QTA_TOTALE
        FROM vini_magazzino
        WHERE id = ?
        """,
        (vino_id,),
    ).fetchone()

    conn.close()

    if not row:
        return None

    return {
        "id": row["id"],
        "TIPOLOGIA": _TIPOLOGIA_MAP.get(row["TIPOLOGIA"], row["TIPOLOGIA"]),
        "NAZIONE": row["NAZIONE"],
        "REGIONE": row["REGIONE"],
        "CARTA": row["CARTA"],
        "DESCRIZIONE": row["DESCRIZIONE"],
        "ANNATA": row["ANNATA"],
        "PRODUTTORE": row["PRODUTTORE"],
        "PREZZO": row["PREZZO_CARTA"],
        "FORMATO": row["FORMATO"],
        "QTA": row["QTA_TOTALE"],
    }