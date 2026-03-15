# -*- coding: utf-8 -*-
"""
Parser per export iPratico (file .xls che in realtà è HTML).

iPratico esporta file con estensione .xls ma contenuto HTML.
Contiene 2 tabelle:
  - Tabella 0: riepilogo categorie (Categoria, Quantità, Totale in centesimi)
  - Tabella 1: dettaglio prodotti (Categoria, Prodotto, Quantità, Totale, PLU, Barcode)
"""

from __future__ import annotations
from typing import List, Dict, Any, Tuple
import pandas as pd


def parse_ipratico_html(file_path: str) -> Tuple[List[Dict], List[Dict]]:
    """
    Parsa un file export iPratico e ritorna:
      (categorie, prodotti)

    Ogni categoria: {categoria, quantita, totale_cent}
    Ogni prodotto: {categoria, prodotto, quantita, totale_cent, plu, barcode}

    I totali sono in centesimi (iPratico li esporta così).
    """
    tables = pd.read_html(file_path, encoding="utf-8")

    if len(tables) < 2:
        raise ValueError(
            f"Formato iPratico non riconosciuto: trovate {len(tables)} tabelle, attese almeno 2"
        )

    # --- Tabella 0: categorie ---
    t0 = tables[0]
    t0.columns = t0.iloc[0]
    t0 = t0.iloc[1:].reset_index(drop=True)

    # Normalizza nomi colonne (iPratico usa "Quantità" con encoding variabile)
    col_map_0 = {}
    for c in t0.columns:
        cl = str(c).lower().strip()
        if "categ" in cl:
            col_map_0[c] = "categoria"
        elif "quant" in cl:
            col_map_0[c] = "quantita"
        elif "total" in cl:
            col_map_0[c] = "totale"
    t0 = t0.rename(columns=col_map_0)

    categorie = []
    for _, r in t0.iterrows():
        cat = str(r.get("categoria", "")).strip()
        if not cat:
            continue
        categorie.append({
            "categoria": cat,
            "quantita": int(pd.to_numeric(r.get("quantita", 0), errors="coerce") or 0),
            "totale_cent": int(pd.to_numeric(r.get("totale", 0), errors="coerce") or 0),
        })

    # --- Tabella 1: prodotti ---
    t1 = tables[1]
    t1.columns = t1.iloc[0]
    t1 = t1.iloc[1:].reset_index(drop=True)

    col_map_1 = {}
    for c in t1.columns:
        cl = str(c).lower().strip()
        if "categ" in cl:
            col_map_1[c] = "categoria"
        elif "prodot" in cl:
            col_map_1[c] = "prodotto"
        elif "quant" in cl:
            col_map_1[c] = "quantita"
        elif "total" in cl:
            col_map_1[c] = "totale"
        elif "plu" in cl:
            col_map_1[c] = "plu"
        elif "barco" in cl:
            col_map_1[c] = "barcode"
    t1 = t1.rename(columns=col_map_1)

    prodotti = []
    for _, r in t1.iterrows():
        cat = str(r.get("categoria", "")).strip()
        prod = str(r.get("prodotto", "")).strip()
        if not cat or not prod:
            continue
        prodotti.append({
            "categoria": cat,
            "prodotto": prod,
            "quantita": int(pd.to_numeric(r.get("quantita", 0), errors="coerce") or 0),
            "totale_cent": int(pd.to_numeric(r.get("totale", 0), errors="coerce") or 0),
            "plu": str(r.get("plu", "")).strip() if pd.notna(r.get("plu")) else None,
            "barcode": str(r.get("barcode", "")).strip() if pd.notna(r.get("barcode")) else None,
        })

    return categorie, prodotti
