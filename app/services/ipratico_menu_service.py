# Modulo: clienti (sub-modulo preventivi) → export iPratico — [core]
# @version: v1.0 — menu template dei preventivi come articoli iPratico (mig 231, 2026-11-13)
# -*- coding: utf-8 -*-
"""
Sincronizzazione Menu Template (preventivi) → iPratico

Stesso principio di vini e bevande: TRGB comanda. Chiamato dall'export iPratico
(ipratico_products_router, POST /vini/ipratico/export) sullo stesso foglio.

Decisioni di Marco (13/11/2026):
- ogni template con l'interruttore «iPratico» acceso (default) è un articolo;
- doppio prezzo (vino escluso / incluso) = DUE articoli separati, non una variante:
      SKU M0012   Name «Menù gruppi Quadri»            prezzo vino escluso
      SKU M0012V  Name «Menù gruppi Quadri con vino»   prezzo vino incluso
- categoria iPratico da clienti_impostazioni.ipratico_categoria_menu
  (seed «Degustazioni», mig 231).

Prezzo a persona, al netto dello sconto del template (come etichetta_prezzo):
- a corpo: prezzo_corpo − sconto (e prezzo_corpo_vino − sconto per la «V»);
- somma piatti: somma dei prezzi delle righe − sconto.

Sull'export che arriva da iPratico (riconoscimento SOLO dallo SKU M####/M####V):
- articolo riconosciuto e attivo → Name, Category, Price_table_1, Hidden = No;
- template spento, cancellato, senza doppio prezzo (per la «V») o a prezzo 0
  → Hidden = Si (la riga resta, iPratico non la perde);
- articolo attivo e mancante → riga nuova coi default di ipratico_export_defaults,
  tutti i 12 prezzi uguali, senza Id (lo assegna iPratico).
"""

from __future__ import annotations

import re
from typing import Any, Optional

from app.models.clienti_db import get_clienti_conn

PREFISSO = "M"
SUFFISSO_VINO = "V"
CATEGORIA_DEFAULT = "Degustazioni"
CHIAVE_CATEGORIA = "ipratico_categoria_menu"
_RE_SKU = re.compile(r"^\s*M(\d{4})(V?)\s*$")

PRICE_FIELDS = (
    "Price_table", "Price_counter", "Price_takeaway", "Price_delivery",
    "Price_table_1", "Price_counter_1", "Price_takeaway_1", "Price_delivery_1",
    "Price_table_2", "Price_counter_2", "Price_takeaway_2", "Price_delivery_2",
)


def codice(template_id: int, vino: bool = False) -> str:
    return f"{PREFISSO}{int(template_id):04d}{SUFFISSO_VINO if vino else ''}"


def da_sku(sku: Any) -> Optional[tuple[int, bool]]:
    m = _RE_SKU.match(str(sku or ""))
    return (int(m.group(1)), m.group(2) == SUFFISSO_VINO) if m else None


# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

def get_categoria() -> str:
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            "SELECT valore FROM clienti_impostazioni WHERE chiave = ?", (CHIAVE_CATEGORIA,)
        ).fetchone()
        return (r["valore"] if r else "").strip() or CATEGORIA_DEFAULT
    except Exception:
        return CATEGORIA_DEFAULT
    finally:
        conn.close()


def set_categoria(valore: str) -> str:
    v = (valore or "").strip()
    if not v:
        raise ValueError("La categoria iPratico non può essere vuota")
    conn = get_clienti_conn()
    try:
        conn.execute(
            """INSERT INTO clienti_impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)
               ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore""",
            (CHIAVE_CATEGORIA, v, "Categoria iPratico dei menu template (export iPratico)"),
        )
        conn.commit()
        return v
    finally:
        conn.close()


# ─────────────────────────────────────────────
# ARTICOLI
# ─────────────────────────────────────────────

def _templates() -> dict[int, dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        if not conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_menu_template'"
        ).fetchone():
            return {}
        cols = {r[1] for r in conn.execute("PRAGMA table_info(clienti_menu_template)").fetchall()}
        rows = conn.execute("""
            SELECT t.*, COALESCE((SELECT SUM(r.price) FROM clienti_menu_template_righe r
                                  WHERE r.template_id = t.id), 0) AS subtotale
            FROM clienti_menu_template t
        """).fetchall()
        out = {}
        for r in rows:
            d = dict(r)
            if "ipratico" not in cols:
                d["ipratico"] = 1
            out[int(d["id"])] = d
        return out
    finally:
        conn.close()


def articoli_template(t: dict[str, Any]) -> list[dict[str, Any]]:
    """Gli articoli iPratico di un template (1, o 2 col doppio prezzo), anche se spento."""
    sconto = float(t.get("sconto") or 0)
    nome = " ".join((t.get("nome") or "").split())
    if t.get("pricing_mode") == "corpo":
        base = max(0.0, float(t.get("prezzo_corpo") or 0) - sconto)
    else:
        base = max(0.0, float(t.get("subtotale") or 0) - sconto)
    art = [{"codice": codice(t["id"]), "template_id": t["id"], "vino": False,
            "nome": nome, "prezzo": round(base, 2)}]
    if t.get("pricing_mode") == "corpo" and t.get("doppio_prezzo"):
        inc = max(0.0, float(t.get("prezzo_corpo_vino") or 0) - sconto)
        art.append({"codice": codice(t["id"], True), "template_id": t["id"], "vino": True,
                    "nome": f"{nome} con vino", "prezzo": round(inc, 2)})
    return art


def articoli_attivi() -> dict[str, dict[str, Any]]:
    """codice → articolo, solo template con iPratico acceso."""
    out = {}
    for t in _templates().values():
        if not t.get("ipratico"):
            continue
        for a in articoli_template(t):
            out[a["codice"]] = a
    return out


# ─────────────────────────────────────────────
# SYNC SUL FOGLIO
# ─────────────────────────────────────────────

def sincronizza_foglio(ws, headers: dict[str, int], defaults: dict[str, str]) -> dict[str, Any]:
    """Aggiorna il foglio openpyxl dell'export iPratico. Ritorna i conteggi."""
    name_col = headers.get("Name")
    cat_col = headers.get("Category")
    hid_col = headers.get("Hidden")
    p1_col = headers.get("Price_table_1")
    sku_col = headers.get("SKU")
    if not name_col or not cat_col:
        return {"errore": "colonne Name/Category assenti"}
    if not sku_col:
        return {"errore": "colonna SKU assente: serve per il codice dei menu"}

    categoria = get_categoria()
    attivi = articoli_attivi()
    st = {"abbinati": 0, "nomi": 0, "prezzi": 0, "categorie": 0, "nascosti": 0,
          "aggiunti": 0, "senza_prezzo": [], "doppi": 0}
    presenti: set[str] = set()

    for row in range(2, ws.max_row + 1):
        parsed = da_sku(ws.cell(row=row, column=sku_col).value)
        if not parsed:
            continue
        cod = codice(*parsed)
        if cod in presenti:
            st["doppi"] += 1
            continue
        presenti.add(cod)
        a = attivi.get(cod)
        visibile = bool(a and a["prezzo"] > 0)
        if hid_col:
            nuovo = "No" if visibile else "Si"
            if str(ws.cell(row=row, column=hid_col).value or "") != nuovo:
                ws.cell(row=row, column=hid_col).value = nuovo
                if not visibile:
                    st["nascosti"] += 1
        if not visibile:
            continue
        st["abbinati"] += 1
        if ws.cell(row=row, column=name_col).value != a["nome"]:
            ws.cell(row=row, column=name_col).value = a["nome"]
            st["nomi"] += 1
        if ws.cell(row=row, column=cat_col).value != categoria:
            ws.cell(row=row, column=cat_col).value = categoria
            st["categorie"] += 1
        if p1_col and ws.cell(row=row, column=p1_col).value != a["prezzo"]:
            ws.cell(row=row, column=p1_col).value = a["prezzo"]
            st["prezzi"] += 1

    for cod, a in attivi.items():
        if cod in presenti:
            continue
        if a["prezzo"] <= 0:
            st["senza_prezzo"].append(a["nome"])
            continue
        r = ws.max_row + 1
        for field, value in defaults.items():
            col = headers.get(field)
            if col:
                ws.cell(row=r, column=col).value = value
        ws.cell(row=r, column=cat_col).value = categoria
        ws.cell(row=r, column=name_col).value = a["nome"]
        ws.cell(row=r, column=sku_col).value = cod
        if hid_col:
            ws.cell(row=r, column=hid_col).value = "No"
        for f in PRICE_FIELDS:
            if headers.get(f):
                ws.cell(row=r, column=headers[f]).value = a["prezzo"]
        st["aggiunti"] += 1

    return st


def anteprima() -> dict[str, Any]:
    """Articoli che andrebbero su iPratico + categoria."""
    return {"categoria": get_categoria(),
            "articoli": sorted(articoli_attivi().values(), key=lambda a: a["codice"])}
