# @version: v2.3-stable
# -*- coding: utf-8 -*-
"""
Router Impostazioni Carta Vini
File: app/routers/vini_settings_router.py

Gestisce:
- GET/POST /settings/vini/tipologie
- GET/POST /settings/vini/nazioni
- GET/POST /settings/vini/regioni/{nazione}
- GET/POST /settings/vini/filtri
- POST     /settings/vini/reset
"""

# @changelog:
#   - v2.3-stable (2025-11-13):
#       • ADD: nuovo filtro mostra_senza_prezzo (lettura e salvataggio)
#       • UPDATE: endpoint /filtri ora restituisce anche mostra_senza_prezzo
#       • UPDATE: POST /filtri aggiorna anche mostra_senza_prezzo
#
#   - v2.2-stable:
#       • versione precedente (filtri base min_qta_stampa / mostra_negativi)

from __future__ import annotations
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException
from app.models.settings_db import get_settings_conn, init_settings_db
from app.models.vini_settings import ensure_settings_defaults

router = APIRouter(prefix="/settings/vini", tags=["Impostazioni Carta Vini"])


def _ensure():
    """Assicura che il DB impostazioni sia pronto e popolato con i default."""
    init_settings_db()
    ensure_settings_defaults()


# ------------------------------------------------------------
# TIPOLOGIE
# ------------------------------------------------------------
@router.get("/tipologie")
def get_tipologie() -> List[Dict[str, Any]]:
    _ensure()
    conn = get_settings_conn()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT nome, ordine FROM tipologia_order ORDER BY ordine ASC;"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/tipologie")
def save_tipologie(order_list: List[str]):
    if not isinstance(order_list, list):
        raise HTTPException(400, "Il body deve essere una lista di nomi tipologia.")

    _ensure()
    conn = get_settings_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM tipologia_order;")
    for idx, nome in enumerate(order_list, start=1):
        cur.execute(
            "INSERT INTO tipologia_order (nome, ordine) VALUES (?, ?);",
            (nome, idx),
        )
    conn.commit()
    conn.close()
    return {"status": "ok", "count": len(order_list)}


# ------------------------------------------------------------
# NAZIONI
# ------------------------------------------------------------
@router.get("/nazioni")
def get_nazioni() -> List[Dict[str, Any]]:
    _ensure()
    conn = get_settings_conn()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT nazione, ordine FROM nazioni_order ORDER BY ordine ASC;"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/nazioni")
def save_nazioni(order_list: List[str]):
    if not isinstance(order_list, list):
        raise HTTPException(400, "Il body deve essere una lista di nazioni.")

    _ensure()
    conn = get_settings_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM nazioni_order;")
    for idx, nazione in enumerate(order_list, start=1):
        cur.execute(
            "INSERT INTO nazioni_order (nazione, ordine) VALUES (?, ?);",
            (nazione, idx),
        )
    conn.commit()
    conn.close()
    return {"status": "ok", "count": len(order_list)}


# ------------------------------------------------------------
# REGIONI
# ------------------------------------------------------------
@router.get("/regioni/{nazione}")
def get_regioni(nazione: str) -> List[Dict[str, Any]]:
    _ensure()
    conn = get_settings_conn()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT codice, nome, ordine FROM regioni_order "
        "WHERE nazione=? ORDER BY ordine ASC;",
        (nazione,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/regioni/{nazione}")
def save_regioni(nazione: str, order_list: List[Dict[str, Any]]):
    """
    order_list: [{ "codice": "IT01", "nome": "LOMBARDIA" }, ...]
    """
    if not isinstance(order_list, list):
        raise HTTPException(400, "Il body deve essere una lista di regioni.")

    _ensure()
    conn = get_settings_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM regioni_order WHERE nazione=?;", (nazione,))

    for idx, r in enumerate(order_list, start=1):
        codice = r.get("codice")
        nome = r.get("nome")
        if not codice or not nome:
            continue
        cur.execute(
            """
            INSERT INTO regioni_order (codice, nazione, nome, ordine)
            VALUES (?, ?, ?, ?);
            """,
            (codice, nazione, nome, idx),
        )

    conn.commit()
    conn.close()
    return {"status": "ok", "count": len(order_list)}


# ------------------------------------------------------------
# FILTRI CARTA
# ------------------------------------------------------------
@router.get("/filtri")
def get_filtri() -> Dict[str, Any]:
    """
    Ritorna:
    {
      "min_qta_stampa": int,
      "mostra_negativi": bool,
      "mostra_senza_prezzo": bool
    }
    """
    _ensure()
    conn = get_settings_conn()
    cur = conn.cursor()
    row = cur.execute(
        """
        SELECT 
            min_qta_stampa, 
            mostra_negativi,
            mostra_senza_prezzo
        FROM filtri_carta 
        WHERE id = 1;
        """
    ).fetchone()
    conn.close()

    if not row:
        return {
            "min_qta_stampa": 1,
            "mostra_negativi": False,
            "mostra_senza_prezzo": False,
        }

    return {
        "min_qta_stampa": row["min_qta_stampa"],
        "mostra_negativi": bool(row["mostra_negativi"]),
        "mostra_senza_prezzo": bool(row["mostra_senza_prezzo"]),
    }


@router.post("/filtri")
def save_filtri(data: Dict[str, Any]):
    """
    Body atteso:
    { 
      "min_qta_stampa": 1,
      "mostra_negativi": true/false,
      "mostra_senza_prezzo": true/false
    }
    """
    _ensure()

    # Parsing sicuro
    try:
        min_qta = int(data.get("min_qta_stampa", 1))
    except (TypeError, ValueError):
        raise HTTPException(400, "min_qta_stampa deve essere un intero.")

    mostra_neg = bool(data.get("mostra_negativi", False))
    mostra_no_price = bool(data.get("mostra_senza_prezzo", False))

    conn = get_settings_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO filtri_carta 
            (id, min_qta_stampa, mostra_negativi, mostra_senza_prezzo)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            min_qta_stampa = excluded.min_qta_stampa,
            mostra_negativi = excluded.mostra_negativi,
            mostra_senza_prezzo = excluded.mostra_senza_prezzo;
        """,
        (min_qta, 1 if mostra_neg else 0, 1 if mostra_no_price else 0),
    )
    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "min_qta_stampa": min_qta,
        "mostra_negativi": mostra_neg,
        "mostra_senza_prezzo": mostra_no_price,
    }


# ------------------------------------------------------------
# RESET COMPLETO
# ------------------------------------------------------------
@router.post("/reset")
def reset_impostazioni():
    """
    Ripristina tutte le impostazioni Carta Vini ai default.
    """
    conn = get_settings_conn()
    cur = conn.cursor()

    cur.execute("DELETE FROM tipologia_order;")
    cur.execute("DELETE FROM nazioni_order;")
    cur.execute("DELETE FROM regioni_order;")
    cur.execute("DELETE FROM filtri_carta;")

    conn.commit()
    conn.close()

    ensure_settings_defaults()

    return {"status": "ok", "msg": "Impostazioni ripristinate ai valori di default."}