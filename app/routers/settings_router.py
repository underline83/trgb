# @version: v2.1-stable
# -*- coding: utf-8 -*-
"""
Router Impostazioni Carta Vini
Usa db: app/data/settings.sqlite3
Gestisce:
- ordinamento tipologie
- ordinamento nazioni
- ordinamento regioni
"""

from fastapi import APIRouter, HTTPException
from app.models.settings_db import get_settings_conn, init_settings_db

router = APIRouter(prefix="/settings/vini", tags=["Impostazioni Carta Vini"])


# ============================================================
# INIT (PRIMA DI OGNI RICHIESTA)
# ============================================================
def ensure_db():
    """
    Verifica che il DB delle impostazioni sia inizializzato.
    """
    init_settings_db()


# ============================================================
# TIPOLOGIE
# ============================================================
@router.get("/tipologie")
def get_tipologie():
    ensure_db()
    conn = get_settings_conn()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT nome, ordine FROM tipologia_order ORDER BY ordine ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/tipologie")
def save_tipologie(order_list: list[str]):
    """
    order_list = ["GRANDI FORMATI", "BOLLICINE FRANCIA", ...]
    """
    ensure_db()

    conn = get_settings_conn()
    cur = conn.cursor()

    # reset tabella
    cur.execute("DELETE FROM tipologia_order;")

    # salva nuovo ordine
    for idx, nome in enumerate(order_list, start=1):
        cur.execute(
            "INSERT INTO tipologia_order (nome, ordine) VALUES (?, ?)",
            (nome, idx)
        )

    conn.commit()
    conn.close()

    return {"status": "ok", "updated": len(order_list)}


# ============================================================
# NAZIONI
# ============================================================
@router.get("/nazioni")
def get_nazioni():
    ensure_db()
    conn = get_settings_conn()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT nazione, ordine FROM nazioni_order ORDER BY ordine ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/nazioni")
def save_nazioni(order_list: list[str]):
    """
    order_list = ["ITALIA", "FRANCIA", "GERMANIA", ...]
    """
    ensure_db()

    conn = get_settings_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM nazioni_order;")

    for idx, nazione in enumerate(order_list, start=1):
        cur.execute(
            "INSERT INTO nazioni_order (nazione, ordine) VALUES (?, ?)",
            (nazione, idx)
        )

    conn.commit()
    conn.close()

    return {"status": "ok", "updated": len(order_list)}


# ============================================================
# REGIONI PER NAZIONE
# ============================================================
@router.get("/regioni/{nazione}")
def get_regioni(nazione: str):
    ensure_db()
    conn = get_settings_conn()
    cur = conn.cursor()

    rows = cur.execute(
        "SELECT codice, nome, ordine FROM regioni_order WHERE nazione=? ORDER BY ordine ASC",
        (nazione,)
    ).fetchall()

    conn.close()
    return [dict(r) for r in rows]


@router.post("/regioni/{nazione}")
def save_regioni(nazione: str, order_list: list[dict]):
    """
    order_list = [
        {"codice": "IT01", "nome": "Lombardia"},
        {"codice": "IT02", "nome": "Piemonte"},
        ...
    ]
    """
    ensure_db()

    conn = get_settings_conn()
    cur = conn.cursor()

    # reset solo quelle della nazione scelta
    cur.execute("DELETE FROM regioni_order WHERE nazione=?", (nazione,))

    for idx, reg in enumerate(order_list, start=1):
        cur.execute("""
            INSERT INTO regioni_order (nazione, codice, nome, ordine)
            VALUES (?, ?, ?, ?)
        """, (nazione, reg["codice"], reg["nome"], idx))

    conn.commit()
    conn.close()

    return {"status": "ok", "updated": len(order_list)}