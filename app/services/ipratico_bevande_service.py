# Modulo: vini (sub-moduli carta bevande + ipratico) — [core]
# @version: v1.1 — codice B0123 nella colonna SKU, non più nel nome (Marco 2026-10-10)
# v1.0 — voci Carta Bevande ↔ prodotti iPratico (mig 186, 2026-10-10)
# -*- coding: utf-8 -*-
"""
Sincronizzazione Carta Bevande → iPratico

Stesso principio dei vini (ipratico_products_router): TRGB comanda. Ogni voce
della Carta Bevande è un prodotto iPratico; il codice sta nella colonna SKU
(vuota su tutti gli altri prodotti), il nome resta pulito:

    SKU  B0123                          (B + bevande_voci.id a 4 cifre)
    Name Benromach 10 years 43%         (produttore abbreviato + nome)

Dal produttore si tolgono le parti tra parentesi (località) e «Birrificio».

Riconoscimento di una riga, in ordine:
1. SKU «B0123»;
2. codice in testa al nome «B0123 …» (export generati con la v1.0) → il nome
   viene ripulito e il codice passa nello SKU;
3. nome identico a quello che TRGB genera, solo nelle categorie bevande (righe
   importate in iPratico dove lo SKU fosse andato perso).
Mai sulla sola categoria: i generici in «Alcolici» («Distillato 10€» ecc.) e i
prodotti senza codice restano intatti.

Sull'export che arriva da iPratico:
- prodotto riconosciuto e voce esistente → Name, Category, Price_table_1
  (listino Ristorante, come per i vini), Hidden = No se la voce è attiva in una
  sezione sincronizzata, altrimenti Si.
- prodotto con codice ma voce sparita da TRGB → Hidden = Si.
- voce attiva con prezzo e senza prodotto → riga nuova (campi di default della
  tabella ipratico_export_defaults, come i vini; tutti i prezzi = prezzo_eur).
- voce attiva senza prezzo_eur (solo «prezzo in carta» testuale) → non
  aggiunta, segnalata.

Le categorie arrivano da bevande_sezioni.ipratico: «categoria» della sezione,
con eccezioni per tipologia («per_tipologia», es. Grappa → Grappe).
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from app.models.bevande_db import get_bevande_conn

PREFISSO = "B"
_RE_CODICE = re.compile(r"^\s*B(\d{4})\b")

PRICE_FIELDS = (
    "Price_table", "Price_counter", "Price_takeaway", "Price_delivery",
    "Price_table_1", "Price_counter_1", "Price_takeaway_1", "Price_delivery_1",
    "Price_table_2", "Price_counter_2", "Price_takeaway_2", "Price_delivery_2",
)


# ─────────────────────────────────────────────
# CONFIG SEZIONI
# ─────────────────────────────────────────────

def _json(v: Any) -> Optional[dict]:
    if isinstance(v, dict):
        return v
    if not v:
        return None
    try:
        d = json.loads(v)
        return d if isinstance(d, dict) else None
    except (TypeError, ValueError):
        return None


def carica_sezioni() -> list[dict[str, Any]]:
    """Sezioni editabili (no 'vini') con config iPratico, tipologie e conteggi."""
    conn = get_bevande_conn()
    try:
        sez = [dict(r) for r in conn.execute(
            "SELECT key, nome, ordine, attivo, schema_form, ipratico FROM bevande_sezioni "
            "WHERE key != 'vini' ORDER BY ordine, id"
        ).fetchall()]
        conti = {r["sezione_key"]: dict(r) for r in conn.execute(
            """SELECT sezione_key,
                      SUM(attivo = 1) AS attive,
                      SUM(attivo = 1 AND (prezzo_eur IS NULL OR prezzo_eur <= 0)) AS senza_prezzo
                 FROM bevande_voci GROUP BY sezione_key"""
        ).fetchall()}
    finally:
        conn.close()
    out = []
    for s in sez:
        schema = _json(s.pop("schema_form")) or {}
        tip = next((f for f in schema.get("fields", []) if (f.get("key") or f.get("name")) == "tipologia"), None)
        tipologie = []
        for o in (tip or {}).get("options", []) or []:
            tipologie.append(str(o.get("value")) if isinstance(o, dict) else str(o))
        conf = _json(s.pop("ipratico")) or {"attivo": False, "categoria": s["nome"], "per_tipologia": {}}
        c = conti.get(s["key"], {})
        out.append({
            **s,
            "ipratico": {
                "attivo": bool(conf.get("attivo")),
                "categoria": conf.get("categoria") or s["nome"],
                "per_tipologia": dict(conf.get("per_tipologia") or {}),
            },
            "tipologie": tipologie,
            "voci_attive": int(c.get("attive") or 0),
            "voci_senza_prezzo": int(c.get("senza_prezzo") or 0),
        })
    return out


def salva_config(key: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Valida e salva la config iPratico di una sezione. ValueError se non valida."""
    if key == "vini":
        raise ValueError("La sezione Vini si sincronizza con le Bottiglie, non da qui.")
    cat = (raw.get("categoria") or "").strip()
    if not cat:
        raise ValueError("Serve il nome della categoria iPratico.")
    if cat.lower() == "alcolici" or cat.lower() == "bottiglie":
        raise ValueError(f"«{cat}» è già usata in iPratico (generici / vini): scegli un altro nome.")
    per_tip = {}
    for t, c in (raw.get("per_tipologia") or {}).items():
        c = (c or "").strip()
        if not c:
            continue
        if c.lower() in ("alcolici", "bottiglie"):
            raise ValueError(f"«{c}» è già usata in iPratico (generici / vini): scegli un altro nome.")
        per_tip[str(t)] = c
    conf = {"attivo": bool(raw.get("attivo")), "categoria": cat, "per_tipologia": per_tip}
    conn = get_bevande_conn()
    try:
        cur = conn.execute(
            "UPDATE bevande_sezioni SET ipratico = ?, updated_at = datetime('now','localtime') WHERE key = ?",
            (json.dumps(conf, ensure_ascii=False), key),
        )
        if cur.rowcount == 0:
            raise LookupError(f"Sezione '{key}' non trovata")
        conn.commit()
    finally:
        conn.close()
    return conf


# ─────────────────────────────────────────────
# NOMI / CATEGORIE
# ─────────────────────────────────────────────

def codice(voce_id: int) -> str:
    return f"{PREFISSO}{int(voce_id):04d}"


def estrai_codice(name: Any) -> Optional[int]:
    """Codice in testa al nome (formato v1.0)."""
    m = _RE_CODICE.match(str(name or ""))
    return int(m.group(1)) if m else None


_RE_SKU = re.compile(r"^\s*B(\d{4})\s*$")


def codice_da_sku(sku: Any) -> Optional[int]:
    m = _RE_SKU.match(str(sku or ""))
    return int(m.group(1)) if m else None


_RE_PARENTESI = re.compile(r"\s*\([^)]*\)")
_RE_BIRRIFICIO = re.compile(r"^\s*birrificio\s+", re.IGNORECASE)


def produttore_corto(prod: Any) -> str:
    """«Birrificio Beer In (Trivero, BI)» → «Beer In»."""
    p = _RE_PARENTESI.sub("", str(prod or ""))
    p = _RE_BIRRIFICIO.sub("", p)
    return " ".join(p.split())


def nome_ipratico(voce: dict[str, Any]) -> str:
    """produttore nome — il produttore si salta se è già nel nome. Niente codice."""
    nome = " ".join((voce.get("nome") or "").split())
    prod = produttore_corto(voce.get("produttore"))
    parts = []
    if prod and prod.lower() not in nome.lower():
        parts.append(prod)
    if nome:
        parts.append(nome)
    return " ".join(parts)


def categoria_ipratico(voce: dict[str, Any], conf: dict[str, Any]) -> str:
    tip = voce.get("tipologia") or ""
    return (conf.get("per_tipologia") or {}).get(tip) or conf["categoria"]


# ─────────────────────────────────────────────
# SYNC SUL FOGLIO
# ─────────────────────────────────────────────

def _voci_e_config() -> tuple[dict[int, dict[str, Any]], dict[str, dict[str, Any]]]:
    sezioni = {s["key"]: s for s in carica_sezioni()}
    conn = get_bevande_conn()
    try:
        voci = {r["id"]: dict(r) for r in conn.execute(
            "SELECT id, sezione_key, nome, produttore, formato, tipologia, prezzo_eur, attivo, ordine "
            "FROM bevande_voci WHERE sezione_key != 'vini' ORDER BY sezione_key, ordine, id"
        ).fetchall()}
    finally:
        conn.close()
    return voci, sezioni


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
        return {"errore": "colonna SKU assente: serve per il codice delle bevande"}

    voci, sezioni = _voci_e_config()

    def sincronizzata(v: dict[str, Any]) -> Optional[dict[str, Any]]:
        s = sezioni.get(v["sezione_key"])
        if not s or not s["attivo"] or not s["ipratico"]["attivo"]:
            return None
        return s["ipratico"]

    st = {"abbinati": 0, "nomi": 0, "prezzi": 0, "categorie": 0, "nascosti": 0,
          "aggiunti": 0, "senza_prezzo": [], "orfani": 0, "per_nome": 0, "doppi": 0}
    presenti: set[int] = set()
    last_row = ws.max_row

    # Per il riconoscimento di ripiego (3): nomi generati, solo categorie bevande
    per_nome: dict[str, int] = {}
    categorie_bev: set[str] = set()
    for vid_, v_ in voci.items():
        c_ = sincronizzata(v_)
        if c_:
            per_nome.setdefault(nome_ipratico(v_).lower(), vid_)
            categorie_bev.add(categoria_ipratico(v_, c_))

    for row in range(2, last_row + 1):
        name_val = ws.cell(row=row, column=name_col).value
        vid = codice_da_sku(ws.cell(row=row, column=sku_col).value)
        if vid is None:
            vid = estrai_codice(name_val)
        if vid is None and not ws.cell(row=row, column=sku_col).value:
            if ws.cell(row=row, column=cat_col).value in categorie_bev:
                vid = per_nome.get(" ".join(str(name_val or "").split()).lower())
                if vid is not None:
                    st["per_nome"] += 1
        if vid is None:
            continue
        if vid in presenti:
            st["doppi"] += 1  # seconda riga per la stessa voce: non si tocca
            continue
        presenti.add(vid)
        if ws.cell(row=row, column=sku_col).value != codice(vid):
            ws.cell(row=row, column=sku_col).value = codice(vid)
        v = voci.get(vid)
        conf = sincronizzata(v) if v else None
        visibile = bool(v and v["attivo"] and conf)

        if hid_col:
            nuovo = "No" if visibile else "Si"
            if str(ws.cell(row=row, column=hid_col).value or "") != nuovo:
                ws.cell(row=row, column=hid_col).value = nuovo
                if not visibile:
                    st["nascosti"] += 1
        if not v:
            st["orfani"] += 1
            continue
        if not conf:
            continue
        st["abbinati"] += 1

        nuovo_nome = nome_ipratico(v)
        if ws.cell(row=row, column=name_col).value != nuovo_nome:
            ws.cell(row=row, column=name_col).value = nuovo_nome
            st["nomi"] += 1
        nuova_cat = categoria_ipratico(v, conf)
        if ws.cell(row=row, column=cat_col).value != nuova_cat:
            ws.cell(row=row, column=cat_col).value = nuova_cat
            st["categorie"] += 1
        prezzo = v.get("prezzo_eur")
        if p1_col and prezzo and prezzo > 0 and ws.cell(row=row, column=p1_col).value != prezzo:
            ws.cell(row=row, column=p1_col).value = prezzo
            st["prezzi"] += 1

    for vid, v in voci.items():
        if vid in presenti or not v["attivo"]:
            continue
        conf = sincronizzata(v)
        if not conf:
            continue
        prezzo = v.get("prezzo_eur")
        if not prezzo or prezzo <= 0:
            st["senza_prezzo"].append(nome_ipratico(v))
            continue
        r = ws.max_row + 1
        for field, value in defaults.items():
            col = headers.get(field)
            if col:
                ws.cell(row=r, column=col).value = value
        ws.cell(row=r, column=cat_col).value = categoria_ipratico(v, conf)
        ws.cell(row=r, column=name_col).value = nome_ipratico(v)
        ws.cell(row=r, column=sku_col).value = codice(vid)
        if hid_col:
            ws.cell(row=r, column=hid_col).value = "No"
        for f in PRICE_FIELDS:
            if headers.get(f):
                ws.cell(row=r, column=headers[f]).value = prezzo
        st["aggiunti"] += 1

    return st


def anteprima() -> dict[str, Any]:
    """Per iPratico Sync: config sezioni + voci che verrebbero esportate."""
    voci, sezioni = _voci_e_config()
    righe = []
    for v in voci.values():
        s = sezioni.get(v["sezione_key"])
        if not v["attivo"] or not s or not s["attivo"] or not s["ipratico"]["attivo"]:
            continue
        righe.append({
            "id": v["id"],
            "codice": codice(v["id"]),
            "sezione_key": v["sezione_key"],
            "nome_ipratico": nome_ipratico(v),
            "categoria": categoria_ipratico(v, s["ipratico"]),
            "prezzo_eur": v.get("prezzo_eur"),
        })
    return {"sezioni": list(sezioni.values()), "voci": righe}
