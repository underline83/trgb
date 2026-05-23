#!/usr/bin/env python3
# @version: v3.1-foodcost-matching-conversione
# Modulo: ricette
# -*- coding: utf-8 -*-

"""
Router matching fatture → ingredienti

Gestisce il collegamento automatico tra righe fattura XML e ingredienti
del food cost, con aggiornamento prezzi automatico.

Flusso:
1. GET  /foodcost/matching/pending        → righe fattura non ancora abbinate
2. GET  /foodcost/matching/suggest        → suggerimenti match per una riga
3. POST /foodcost/matching/confirm        → conferma match (salva in ingredient_supplier_map + prezzo)
4. POST /foodcost/matching/auto           → auto-match tutte le righe con mapping noto
5. GET  /foodcost/matching/mappings       → lista mapping esistenti
6. DELETE /foodcost/matching/mappings/{id} → elimina un mapping
7. GET  /foodcost/matching/smart-suggest  → AI: analizza pending e suggerisce nuovi ingredienti
8. POST /foodcost/matching/bulk-create    → AI: crea ingredienti in blocco + auto-match
9. POST /foodcost/matching/ignore-description → ignora una descrizione (non ingrediente)
10. GET  /foodcost/matching/ignored-descriptions → lista descrizioni ignorate
11. DELETE /foodcost/matching/ignored-descriptions/{id} → ri-attiva descrizione
"""

import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/matching",
    tags=["foodcost-matching"],
    dependencies=[Depends(get_current_user)],
)


# ─────────────────────────────────────────────
#   MODELLI
# ─────────────────────────────────────────────

class PendingRow(BaseModel):
    """Riga fattura non ancora abbinata a un ingrediente."""
    riga_id: int
    fattura_id: int
    fornitore_nome: str
    fornitore_piva: Optional[str] = None
    numero_fattura: Optional[str] = None
    data_fattura: Optional[str] = None
    descrizione: str
    quantita: Optional[float] = None
    unita_misura: Optional[str] = None
    prezzo_unitario: Optional[float] = None
    prezzo_totale: Optional[float] = None


class MatchSuggestion(BaseModel):
    """Suggerimento di match per una riga fattura."""
    ingredient_id: int
    ingredient_name: str
    default_unit: str
    confidence: float  # 0-100
    reason: str  # "exact_code", "exact_desc", "fuzzy", "same_supplier"
    # Fattore di conversione confezione → unità base, indovinato per questa riga.
    suggested_factor: float = 1.0
    factor_detail: str = ""
    factor_safe: bool = True


class ConfirmMatchRequest(BaseModel):
    """Richiesta di conferma match riga→ingrediente."""
    riga_fattura_id: int
    ingredient_id: int
    codice_fornitore: Optional[str] = None
    unita_fornitore: Optional[str] = None
    fattore_conversione: float = Field(default=1.0, gt=0)


class MappingOut(BaseModel):
    """Mapping fornitore→ingrediente esistente."""
    id: int
    ingredient_id: int
    ingredient_name: str
    supplier_id: Optional[int] = None
    fornitore_nome: Optional[str] = None
    codice_fornitore: Optional[str] = None
    descrizione_fornitore: str
    unita_fornitore: Optional[str] = None
    fattore_conversione: float = 1.0
    is_default: bool = False
    confirmed_by: Optional[str] = None
    created_at: Optional[str] = None


class AutoMatchResult(BaseModel):
    """Risultato dell'auto-matching."""
    matched: int
    skipped: int
    details: List[Dict[str, Any]] = []


# ─────────────────────────────────────────────
#   HELPERS
# ─────────────────────────────────────────────

def _get_or_create_supplier(cur, fornitore_nome: str, fornitore_piva: Optional[str]) -> int:
    """Trova o crea un fornitore nella tabella suppliers partendo dai dati fattura."""
    if fornitore_piva:
        row = cur.execute(
            "SELECT id FROM suppliers WHERE partita_iva = ?", (fornitore_piva,)
        ).fetchone()
        if row:
            return row["id"]

    if fornitore_nome:
        row = cur.execute(
            "SELECT id FROM suppliers WHERE name = ?", (fornitore_nome,)
        ).fetchone()
        if row:
            return row["id"]

    # Crea nuovo fornitore
    cur.execute(
        "INSERT INTO suppliers (name, partita_iva) VALUES (?, ?)",
        (fornitore_nome or "Sconosciuto", fornitore_piva),
    )
    return cur.lastrowid


def _fuzzy_score(a: str, b: str) -> float:
    """Score di similarità 0-100 tra due stringhe."""
    if not a or not b:
        return 0.0
    a_clean = a.strip().upper()
    b_clean = b.strip().upper()
    if a_clean == b_clean:
        return 100.0
    return SequenceMatcher(None, a_clean, b_clean).ratio() * 100


def _compute_unit_price(cur, ingredient_id: int, prezzo_unitario,
                        unita_misura, fattore_conversione: float):
    """
    Calcola il prezzo per unità base dell'ingrediente, SENZA salvare nulla.

    Logica:
    1. Se è dato un fattore di conversione esplicito (!= 1.0), il prezzo per
       unità base è prezzo_unitario / fattore.
       (fattore = quante unità base stanno in 1 unità fattura — es. 1 sacco = 25 kg)
    2. Se il fattore è 1.0, prova una conversione automatica unità fattura →
       default_unit dell'ingrediente (rete di sicurezza per g↔kg, ml↔L, e per
       eventuali conversioni personalizzate dell'ingrediente).

    Ritorna il prezzo per unità base, oppure None se non calcolabile.
    """
    from app.routers.foodcost_recipes_router import convert_qty

    if prezzo_unitario is None or prezzo_unitario <= 0:
        return None

    # 1. Fattore esplicito
    if fattore_conversione and fattore_conversione != 1.0:
        return prezzo_unitario / fattore_conversione

    # 2. Conversione automatica unità fattura → default_unit
    unit_fattura = (unita_misura or "").strip()
    default_unit = None
    row = cur.execute(
        "SELECT default_unit FROM ingredients WHERE id = ?", (ingredient_id,)
    ).fetchone()
    if row:
        default_unit = row["default_unit"]

    if unit_fattura and default_unit:
        converted = convert_qty(1.0, unit_fattura, default_unit,
                                ingredient_id=ingredient_id, cur=cur)
        if converted is not None and converted != 0:
            return prezzo_unitario / converted

    return prezzo_unitario


def _save_price_from_riga(cur, ingredient_id: int, supplier_id: int,
                          riga: dict, fattore_conversione: float):
    """
    Salva un prezzo in ingredient_prices a partire da una riga fattura.

    Normalizza il prezzo nell'unità base dell'ingrediente (vedi _compute_unit_price).
    Ritorna il prezzo per unità base salvato (o None se la riga non aveva prezzo).
    """
    prezzo_unitario = riga.get("prezzo_unitario")
    unit_price = _compute_unit_price(
        cur, ingredient_id, prezzo_unitario,
        riga.get("unita_misura"), fattore_conversione,
    )
    if unit_price is None:
        return None

    now = datetime.utcnow().isoformat()
    cur.execute(
        """
        INSERT INTO ingredient_prices (
            ingredient_id, supplier_id, unit_price,
            original_price, original_unit, original_qty,
            fattura_id, riga_fattura_id,
            price_date, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ingredient_id,
            supplier_id,
            round(unit_price, 6),
            prezzo_unitario,
            riga.get("unita_misura"),
            riga.get("quantita"),
            riga.get("fattura_id"),
            riga.get("riga_id"),
            riga.get("data_fattura") or now[:10],
            f"Auto da fattura #{riga.get('numero_fattura', '?')}",
            now,
        ),
    )
    return round(unit_price, 6)


# ─────────────────────────────────────────────
#   ENDPOINT: RIGHE FATTURA NON ABBINATE
# ─────────────────────────────────────────────

@router.get("/pending", response_model=List[PendingRow])
def list_pending_rows(
    fornitore: Optional[str] = None,
):
    """
    Righe fattura che non hanno ancora un match in ingredient_supplier_map.
    Esclude fornitori marcati come 'escluso' in fe_fornitore_categoria.
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    params = []
    where_extra = ""
    if fornitore:
        where_extra = "AND f.fornitore_nome LIKE ?"
        params.append(f"%{fornitore}%")

    rows = cur.execute(
        f"""
        SELECT
            r.id AS riga_id,
            r.fattura_id,
            f.fornitore_nome,
            f.fornitore_piva,
            f.numero_fattura,
            f.data_fattura,
            r.descrizione,
            r.quantita,
            r.unita_misura,
            r.prezzo_unitario,
            r.prezzo_totale
        FROM fe_righe r
        JOIN fe_fatture f ON f.id = r.fattura_id
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        WHERE r.id NOT IN (
            SELECT ip.riga_fattura_id
            FROM ingredient_prices ip
            WHERE ip.riga_fattura_id IS NOT NULL
        )
        AND r.id NOT IN (
            SELECT mir.riga_id FROM matching_ignored_righe mir
        )
        AND COALESCE(fc.escluso, 0) = 0
        {where_extra}
        ORDER BY f.data_fattura DESC, r.id
        """,
        params,
    ).fetchall()

    conn.close()
    return [PendingRow(**dict(r)) for r in rows]


# ─────────────────────────────────────────────
#   ENDPOINT: SUGGERIMENTI MATCH
# ─────────────────────────────────────────────

@router.get("/suggest", response_model=List[MatchSuggestion])
def suggest_match(riga_id: int):
    """
    Dato l'ID di una riga fattura, suggerisce possibili ingredienti.
    Ordina per confidence decrescente.
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    # Carica la riga
    riga = cur.execute(
        """
        SELECT r.descrizione, r.unita_misura, f.fornitore_piva, f.fornitore_nome
        FROM fe_righe r
        JOIN fe_fatture f ON f.id = r.fattura_id
        WHERE r.id = ?
        """,
        (riga_id,),
    ).fetchone()

    if not riga:
        conn.close()
        raise HTTPException(status_code=404, detail="Riga fattura non trovata")

    desc = riga["descrizione"] or ""
    piva = riga["fornitore_piva"]

    # 1. Cerca match esatti in ingredient_supplier_map (stesso fornitore + descrizione)
    suggestions = []
    seen = set()

    if piva:
        # Trova supplier_id da P.IVA
        sup = cur.execute(
            "SELECT id FROM suppliers WHERE partita_iva = ?", (piva,)
        ).fetchone()

        if sup:
            # Match esatti su descrizione_fornitore
            exact_maps = cur.execute(
                """
                SELECT ism.ingredient_id, i.name, i.default_unit, ism.descrizione_fornitore
                FROM ingredient_supplier_map ism
                JOIN ingredients i ON i.id = ism.ingredient_id
                WHERE ism.supplier_id = ?
                """,
                (sup["id"],),
            ).fetchall()

            for m in exact_maps:
                score = _fuzzy_score(desc, m["descrizione_fornitore"])
                if score > 50 and m["ingredient_id"] not in seen:
                    reason = "exact_desc" if score > 90 else "same_supplier"
                    suggestions.append(MatchSuggestion(
                        ingredient_id=m["ingredient_id"],
                        ingredient_name=m["name"],
                        default_unit=m["default_unit"],
                        confidence=min(score, 99),
                        reason=reason,
                    ))
                    seen.add(m["ingredient_id"])

    # 2. Fuzzy match contro tutti gli ingredienti
    ingredients = cur.execute(
        "SELECT id, name, default_unit FROM ingredients WHERE is_active = 1"
    ).fetchall()

    for ing in ingredients:
        if ing["id"] in seen:
            continue
        score = _fuzzy_score(desc, ing["name"])
        if score > 40:
            suggestions.append(MatchSuggestion(
                ingredient_id=ing["id"],
                ingredient_name=ing["name"],
                default_unit=ing["default_unit"],
                confidence=round(score, 1),
                reason="fuzzy",
            ))
            seen.add(ing["id"])

    # Ordina per confidence
    suggestions.sort(key=lambda s: s.confidence, reverse=True)

    conn.close()

    # Arricchisci i suggerimenti col fattore di conversione confezione → unità base
    top = suggestions[:10]
    for s in top:
        guess = _guess_conversion_factor(desc, riga["unita_misura"], s.default_unit)
        s.suggested_factor = guess["factor"]
        s.factor_detail = guess["detail"]
        s.factor_safe = guess["safe"]

    return top


# ─────────────────────────────────────────────
#   ENDPOINT: CONFERMA MATCH
# ─────────────────────────────────────────────

@router.post("/confirm")
def confirm_match(
    payload: ConfirmMatchRequest,
    current_user: Any = Depends(get_current_user),
):
    """
    Conferma il match tra una riga fattura e un ingrediente.

    1. Crea/aggiorna ingredient_supplier_map (per ricordare il match)
    2. Salva il prezzo in ingredient_prices
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    username = (
        current_user.get("username") if isinstance(current_user, dict)
        else getattr(current_user, "username", "system")
    )

    # Carica riga fattura
    riga = cur.execute(
        """
        SELECT r.id AS riga_id, r.fattura_id, r.descrizione, r.quantita,
               r.unita_misura, r.prezzo_unitario, r.prezzo_totale,
               f.fornitore_nome, f.fornitore_piva, f.numero_fattura, f.data_fattura
        FROM fe_righe r
        JOIN fe_fatture f ON f.id = r.fattura_id
        WHERE r.id = ?
        """,
        (payload.riga_fattura_id,),
    ).fetchone()

    if not riga:
        conn.close()
        raise HTTPException(status_code=404, detail="Riga fattura non trovata")

    # Verifica ingrediente
    ing = cur.execute(
        "SELECT id, name, default_unit FROM ingredients WHERE id = ?",
        (payload.ingredient_id,),
    ).fetchone()
    if not ing:
        conn.close()
        raise HTTPException(status_code=404, detail="Ingrediente non trovato")

    # Trova/crea supplier
    supplier_id = _get_or_create_supplier(
        cur, riga["fornitore_nome"], riga["fornitore_piva"]
    )

    now = datetime.utcnow().isoformat()

    # Salva mapping (se non esiste già per questa combinazione)
    existing_map = cur.execute(
        """
        SELECT id FROM ingredient_supplier_map
        WHERE ingredient_id = ? AND supplier_id = ? AND descrizione_fornitore = ?
        """,
        (payload.ingredient_id, supplier_id, riga["descrizione"]),
    ).fetchone()

    if not existing_map:
        cur.execute(
            """
            INSERT INTO ingredient_supplier_map (
                ingredient_id, supplier_id, codice_fornitore,
                descrizione_fornitore, unita_fornitore, fattore_conversione,
                is_default, confirmed_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (
                payload.ingredient_id,
                supplier_id,
                payload.codice_fornitore,
                riga["descrizione"],
                payload.unita_fornitore or riga["unita_misura"],
                payload.fattore_conversione,
                username,
                now,
            ),
        )

    # Salva prezzo
    unit_price = _save_price_from_riga(
        cur,
        payload.ingredient_id,
        supplier_id,
        dict(riga),
        payload.fattore_conversione,
    )

    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "detail": "Match confermato e prezzo aggiornato",
        "ingredient_name": ing["name"],
        "default_unit": ing["default_unit"],
        "unit_price": unit_price,
        "fattore_conversione": payload.fattore_conversione,
    }


# ─────────────────────────────────────────────
#   ENDPOINT: AUTO-MATCH
# ─────────────────────────────────────────────

@router.post("/auto", response_model=AutoMatchResult)
def auto_match():
    """
    Tenta di abbinare automaticamente tutte le righe fattura pendenti
    usando i mapping già esistenti in ingredient_supplier_map.

    Per ogni riga: cerca un match esatto (supplier + descrizione) nel map.
    Se trovato, salva il prezzo automaticamente.
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    # Righe pendenti
    pending = cur.execute(
        """
        SELECT r.id AS riga_id, r.fattura_id, r.descrizione, r.quantita,
               r.unita_misura, r.prezzo_unitario, r.prezzo_totale,
               f.fornitore_nome, f.fornitore_piva, f.numero_fattura, f.data_fattura
        FROM fe_righe r
        JOIN fe_fatture f ON f.id = r.fattura_id
        WHERE r.id NOT IN (
            SELECT ip.riga_fattura_id
            FROM ingredient_prices ip
            WHERE ip.riga_fattura_id IS NOT NULL
        )
        """
    ).fetchall()

    matched = 0
    skipped = 0
    details = []

    for riga in pending:
        riga_dict = dict(riga)
        desc = riga["descrizione"] or ""
        piva = riga["fornitore_piva"]

        # Trova supplier
        sup = None
        if piva:
            sup = cur.execute(
                "SELECT id FROM suppliers WHERE partita_iva = ?", (piva,)
            ).fetchone()

        if not sup:
            sup = cur.execute(
                "SELECT id FROM suppliers WHERE name = ?", (riga["fornitore_nome"],)
            ).fetchone()

        if not sup:
            skipped += 1
            continue

        # Cerca match esatto in ingredient_supplier_map
        mapping = cur.execute(
            """
            SELECT ingredient_id, fattore_conversione
            FROM ingredient_supplier_map
            WHERE supplier_id = ? AND UPPER(descrizione_fornitore) = UPPER(?)
            """,
            (sup["id"], desc),
        ).fetchone()

        if not mapping:
            skipped += 1
            continue

        # Match trovato → salva prezzo
        _save_price_from_riga(
            cur,
            mapping["ingredient_id"],
            sup["id"],
            riga_dict,
            mapping["fattore_conversione"],
        )
        matched += 1

        ing = cur.execute(
            "SELECT name FROM ingredients WHERE id = ?", (mapping["ingredient_id"],)
        ).fetchone()
        details.append({
            "riga_id": riga["riga_id"],
            "descrizione": desc,
            "ingredient": ing["name"] if ing else "?",
        })

    conn.commit()
    conn.close()

    return AutoMatchResult(matched=matched, skipped=skipped, details=details)


# ─────────────────────────────────────────────
#   ENDPOINT: LISTA MAPPINGS
# ─────────────────────────────────────────────

@router.get("/mappings", response_model=List[MappingOut])
def list_mappings():
    """Lista tutti i mapping fornitore→ingrediente."""
    conn = get_foodcost_connection()
    rows = conn.execute(
        """
        SELECT
            ism.id, ism.ingredient_id, i.name AS ingredient_name,
            ism.supplier_id, s.name AS fornitore_nome,
            ism.codice_fornitore, ism.descrizione_fornitore,
            ism.unita_fornitore, ism.fattore_conversione,
            ism.is_default, ism.confirmed_by, ism.created_at
        FROM ingredient_supplier_map ism
        JOIN ingredients i ON i.id = ism.ingredient_id
        LEFT JOIN suppliers s ON s.id = ism.supplier_id
        ORDER BY i.name, s.name
        """
    ).fetchall()
    conn.close()

    return [
        MappingOut(
            **{**dict(r), "is_default": bool(r["is_default"])}
        )
        for r in rows
    ]


# ─────────────────────────────────────────────
#   ENDPOINT: ELIMINA MAPPING
# ─────────────────────────────────────────────

@router.delete("/mappings/{mapping_id}")
def delete_mapping(mapping_id: int):
    conn = get_foodcost_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id FROM ingredient_supplier_map WHERE id = ?", (mapping_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Mapping non trovato")

    cur.execute("DELETE FROM ingredient_supplier_map WHERE id = ?", (mapping_id,))
    conn.commit()
    conn.close()

    return {"status": "ok", "detail": "Mapping eliminato"}


# ─────────────────────────────────────────────
#   ENDPOINT: FORNITORI CON STATO ESCLUSIONE
# ─────────────────────────────────────────────

class SupplierMatchingInfo(BaseModel):
    fornitore_nome: str
    fornitore_piva: Optional[str] = None
    n_righe_pending: int = 0
    escluso: bool = False
    motivo_esclusione: Optional[str] = None
    categoria_nome: Optional[str] = None


@router.get("/suppliers", response_model=List[SupplierMatchingInfo])
def list_suppliers_for_matching():
    """
    Lista fornitori unici dalle righe pending (non ancora matchate),
    con stato esclusione e conteggio righe.
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT
            f.fornitore_nome,
            f.fornitore_piva,
            COUNT(r.id) AS n_righe_pending,
            COALESCE(fc.escluso, 0) AS escluso,
            fc.motivo_esclusione,
            c.nome AS categoria_nome
        FROM fe_righe r
        JOIN fe_fatture f ON f.id = r.fattura_id
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        WHERE r.id NOT IN (
            SELECT ip.riga_fattura_id
            FROM ingredient_prices ip
            WHERE ip.riga_fattura_id IS NOT NULL
        )
        GROUP BY f.fornitore_nome, f.fornitore_piva
        ORDER BY n_righe_pending DESC
        """
    ).fetchall()

    conn.close()
    return [
        SupplierMatchingInfo(
            fornitore_nome=r["fornitore_nome"],
            fornitore_piva=r["fornitore_piva"],
            n_righe_pending=r["n_righe_pending"],
            escluso=bool(r["escluso"]),
            motivo_esclusione=r["motivo_esclusione"],
            categoria_nome=r["categoria_nome"],
        )
        for r in rows
    ]


class ToggleExclusionRequest(BaseModel):
    fornitore_nome: str
    fornitore_piva: Optional[str] = None
    escluso: bool
    motivo_esclusione: Optional[str] = None


@router.post("/suppliers/toggle-exclusion")
def toggle_supplier_exclusion(payload: ToggleExclusionRequest):
    """Toggle esclusione fornitore dal matching ingredienti."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    piva = payload.fornitore_piva
    nome = payload.fornitore_nome

    if piva:
        existing = cur.execute(
            "SELECT id FROM fe_fornitore_categoria WHERE fornitore_piva = ?", (piva,)
        ).fetchone()
    else:
        existing = cur.execute(
            "SELECT id FROM fe_fornitore_categoria WHERE fornitore_nome = ? AND fornitore_piva IS NULL",
            (nome,),
        ).fetchone()

    escluso_val = 1 if payload.escluso else 0

    if existing:
        cur.execute(
            "UPDATE fe_fornitore_categoria SET escluso = ?, motivo_esclusione = ? WHERE id = ?",
            (escluso_val, payload.motivo_esclusione, existing["id"]),
        )
    else:
        cur.execute(
            """
            INSERT INTO fe_fornitore_categoria (fornitore_piva, fornitore_nome, escluso, motivo_esclusione)
            VALUES (?, ?, ?, ?)
            """,
            (piva, nome, escluso_val, payload.motivo_esclusione),
        )

    conn.commit()
    conn.close()
    return {"status": "ok", "escluso": payload.escluso}


# ─────────────────────────────────────────────
#   ENDPOINT: IGNORA DESCRIZIONI (non ingredienti)
# ─────────────────────────────────────────────

class IgnoreDescriptionRequest(BaseModel):
    descrizione_normalizzata: str
    riga_ids: List[int] = []
    motivo: Optional[str] = None
    raw_examples: Optional[List[str]] = None


class IgnoredDescriptionOut(BaseModel):
    id: int
    descrizione_normalizzata: str
    raw_examples: Optional[str] = None
    motivo: Optional[str] = None
    n_righe: int = 0
    created_at: Optional[str] = None


@router.post("/ignore-description")
def ignore_description(payload: IgnoreDescriptionRequest):
    """
    Ignora una descrizione dal matching (es. trasporto, spedizione, consulenza).
    Salva la descrizione normalizzata + segna tutte le righe collegate come ignorate.
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    desc_norm = payload.descrizione_normalizzata.strip().upper()
    if not desc_norm or len(desc_norm) < 2:
        conn.close()
        raise HTTPException(status_code=400, detail="Descrizione troppo corta")

    # Upsert nella tabella exclusions
    existing = cur.execute(
        "SELECT id FROM matching_description_exclusions WHERE descrizione_normalizzata = ?",
        (desc_norm,),
    ).fetchone()

    raw_ex = ", ".join(payload.raw_examples[:5]) if payload.raw_examples else None

    if existing:
        exclusion_id = existing["id"]
        cur.execute(
            "UPDATE matching_description_exclusions SET motivo = ?, raw_examples = ? WHERE id = ?",
            (payload.motivo, raw_ex, exclusion_id),
        )
    else:
        cur.execute(
            """
            INSERT INTO matching_description_exclusions (descrizione_normalizzata, raw_examples, motivo)
            VALUES (?, ?, ?)
            """,
            (desc_norm, raw_ex, payload.motivo),
        )
        exclusion_id = cur.lastrowid

    # Segna le righe come ignorate
    for riga_id in payload.riga_ids:
        cur.execute(
            "INSERT OR IGNORE INTO matching_ignored_righe (riga_id, exclusion_id) VALUES (?, ?)",
            (riga_id, exclusion_id),
        )

    conn.commit()
    conn.close()

    return {"status": "ok", "exclusion_id": exclusion_id, "righe_ignored": len(payload.riga_ids)}


@router.get("/ignored-descriptions", response_model=List[IgnoredDescriptionOut])
def list_ignored_descriptions():
    """Lista tutte le descrizioni ignorate dal matching."""
    conn = get_foodcost_connection()
    rows = conn.execute(
        """
        SELECT mde.id, mde.descrizione_normalizzata, mde.raw_examples,
               mde.motivo, mde.created_at,
               COUNT(mir.riga_id) AS n_righe
        FROM matching_description_exclusions mde
        LEFT JOIN matching_ignored_righe mir ON mir.exclusion_id = mde.id
        GROUP BY mde.id
        ORDER BY mde.descrizione_normalizzata
        """
    ).fetchall()
    conn.close()

    return [IgnoredDescriptionOut(**dict(r)) for r in rows]


@router.delete("/ignored-descriptions/{exclusion_id}")
def remove_ignored_description(exclusion_id: int):
    """Rimuovi una descrizione dalla lista ignorati (riattiva le righe)."""
    conn = get_foodcost_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id FROM matching_description_exclusions WHERE id = ?", (exclusion_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Esclusione non trovata")

    # Rimuovi righe ignorate collegate
    cur.execute("DELETE FROM matching_ignored_righe WHERE exclusion_id = ?", (exclusion_id,))
    # Rimuovi exclusion
    cur.execute("DELETE FROM matching_description_exclusions WHERE id = ?", (exclusion_id,))

    conn.commit()
    conn.close()

    return {"status": "ok", "detail": "Descrizione riattivata"}


# ─────────────────────────────────────────────
#   SMART SUGGEST — Analisi intelligente pending
# ─────────────────────────────────────────────

# Pattern comuni da rimuovere nella pulizia nome
_NOISE_PATTERNS = [
    r"\bCF\s*\d+",            # codici tipo CF12345
    r"\bCOD\.?\s*\w+",        # COD. ABC123
    r"\bART\.?\s*\w+",        # ART. 123
    r"\bRIF\.?\s*\w+",        # RIF. 123
    r"\bLOTTO\s*\w+",         # LOTTO ABC
    r"\bSCAD\.?\s*[\d/.-]+",  # SCAD. 12/2025
    r"\bKG\s*[\d.,]+",        # KG 0,500
    r"\bLT\s*[\d.,]+",        # LT 0,750
    r"\bN\.\s*\d+",           # N. 12
    r"\bPZ\.?\s*\d+",         # PZ 24
    r"\bCONF\.?\s*\d+",       # CONF 6
    r"\d+\s*X\s*\d+",         # 6X500, 12 X 100
    r"\bBIO\b",               # rimuovi "BIO" come noise (lo aggiungiamo in nota)
    r"\bIGP\b",
    r"\bDOP\b",
    r"\bDOC\b",
    r"\bSTG\b",
    r"[€$]\s*[\d.,]+",        # prezzi
    r"\d{2}[/-]\d{2}[/-]\d{2,4}",  # date
]

# Mapping unità fattura → unità ingrediente
_UNIT_MAP = {
    "KG": "kg", "KGM": "kg", "CHILO": "kg", "KILO": "kg",
    "GR": "g", "G": "g", "GRM": "g", "GRAMMI": "g",
    "LT": "L", "L": "L", "LTR": "L", "LITRI": "L", "LITRO": "L",
    "ML": "ml", "MLT": "ml",
    "CL": "cl",
    "PZ": "pz", "NR": "pz", "N": "pz", "PEZZI": "pz", "PEZZO": "pz",
    "CF": "pz", "CONF": "pz", "CONFEZIONE": "pz",
    "BT": "pz", "BTL": "pz", "BOTTIGLIA": "pz",
    "SC": "pz", "SCATOLA": "pz",
    "CT": "pz", "CARTONE": "pz",
    "PKG": "pz",
}

# Unità di misura "reali" (peso/volume) → unità standard. Usate per leggere il
# contenuto di una confezione dalla descrizione (es. "SACCO 25 KG" → 25 kg).
_MEASURE_UNITS = {
    "KG": "kg", "KGM": "kg", "CHILO": "kg", "KILO": "kg",
    "G": "g", "GR": "g", "GRM": "g", "GRAMMI": "g", "GRAMMO": "g",
    "LT": "L", "L": "L", "LTR": "L", "LITRI": "L", "LITRO": "L",
    "ML": "ml", "MLT": "ml",
    "CL": "cl",
}

# Codici che indicano una "confezione" (non un'unità di misura): il prezzo è
# per confezione, e dentro ci stanno N unità base da ricavare dalla descrizione.
_PACKAGE_UNITS = {
    "CF", "CONF", "CONFEZIONE", "SC", "SCATOLA", "CT", "CARTONE",
    "PKG", "COLLO", "BT", "BTL", "BOTTIGLIA", "BOX",
}


def _to_float(s) -> Optional[float]:
    """Converte una stringa numerica (virgola o punto come decimale) in float."""
    try:
        return float(str(s).strip().replace(",", "."))
    except (ValueError, TypeError):
        return None


# Alternativa regex delle unità di misura (le multi-carattere PRIMA delle
# singole, così "KG" vince su "G" e "LT" su "L").
_MEAS_RE = r"KGM|KG|GRAMMI|GRAMMO|GRM|GR|LITRI|LITRO|LTR|LT|MLT|ML|CL|G|L"


def _unit_family(u: str) -> Optional[str]:
    """Famiglia dell'unità: 'peso', 'volume', 'pz' o None."""
    u = (u or "").strip().lower()
    if u in ("kg", "g", "mg"):
        return "peso"
    if u in ("l", "ml", "cl"):
        return "volume"
    if u == "pz":
        return "pz"
    return None


def _parse_package_content(desc: str, base_unit: str) -> Optional[float]:
    """
    Cerca nella descrizione fattura il contenuto di una confezione, espresso
    nell'unità base dell'ingrediente.

    Esempi:
    - "FARINA 00 SACCO 25 KG"  + base kg → 25.0
    - "ACQUA 6 X 1,5 LT"       + base L  → 9.0
    - "UOVA CONF 6 PZ"         + base pz → 6.0

    Ritorna None se non trova nulla di affidabile.
    """
    from app.routers.foodcost_recipes_router import convert_qty

    if not desc:
        return None
    d = desc.upper()
    base = (base_unit or "").strip().lower()

    # 1. Multipack "6 X 500 ML" / "12X1L"
    m = re.search(rf"(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)\s*({_MEAS_RE})\b", d)
    if m:
        count = _to_float(m.group(1))
        size = _to_float(m.group(2))
        unit = _MEASURE_UNITS.get(m.group(3))
        if count and size and unit:
            per = convert_qty(size, unit, base)
            if per is not None and per > 0:
                return round(count * per, 6)

    # 2. Numero + unità di misura: "25 KG", "2,5 KG", "0,750 LT"
    for m in re.finditer(rf"(\d+(?:[.,]\d+)?)\s*({_MEAS_RE})\b", d):
        val = _to_float(m.group(1))
        unit = _MEASURE_UNITS.get(m.group(2))
        if val and unit:
            conv = convert_qty(val, unit, base)
            if conv is not None and conv > 0:
                return round(conv, 6)

    # 3. Unità di misura + numero: "KG 25", "LT 0,750"
    for m in re.finditer(rf"\b({_MEAS_RE})\s*(\d+(?:[.,]\d+)?)", d):
        unit = _MEASURE_UNITS.get(m.group(1))
        val = _to_float(m.group(2))
        if val and unit:
            conv = convert_qty(val, unit, base)
            if conv is not None and conv > 0:
                return round(conv, 6)

    # 4. Conteggio pezzi: "CONF 6", "DA 6", "X6"
    if base == "pz":
        m = re.search(r"(?:CONF\.?|DA|X)\s*(\d{1,3})\b", d) or \
            re.search(r"\b(\d{1,3})\s*(?:PZ|PEZZI|NR)\b", d)
        if m:
            val = _to_float(m.group(1))
            if val and val > 0:
                return val

    return None


def _guess_conversion_factor(descrizione: str, unita_misura: str,
                             default_unit: str) -> Dict[str, Any]:
    """
    Indovina il fattore di conversione confezione → unità base.

    factor = quante unità base dell'ingrediente stanno in 1 unità fattura.
    prezzo_per_unita_base = prezzo_fattura / factor.

    Ritorna {"factor": float, "detail": str, "safe": bool}.
    """
    from app.routers.foodcost_recipes_router import convert_qty

    base = (default_unit or "").strip().lower()
    inv_raw = (unita_misura or "").strip().upper()

    if not base:
        return {"factor": 1.0, "detail": "ingrediente senza unità base", "safe": False}

    is_package = inv_raw in _PACKAGE_UNITS

    # Caso 1: l'unità fattura è una misura reale della STESSA famiglia dell'unità
    # base (peso↔peso, volume↔volume, pz↔pz) → conversione standard diretta.
    if not is_package and inv_raw:
        inv_norm = _MEASURE_UNITS.get(inv_raw) or _UNIT_MAP.get(inv_raw, inv_raw.lower())
        if _unit_family(inv_norm) and _unit_family(inv_norm) == _unit_family(base):
            std = convert_qty(1.0, inv_norm, base)
            if std is not None and std > 0:
                if abs(std - 1.0) < 1e-9:
                    return {"factor": 1.0,
                            "detail": f"unità fattura ({inv_raw}) = unità ingrediente ({base})",
                            "safe": True}
                return {"factor": round(std, 6),
                        "detail": f"1 {inv_raw} = {std:g} {base}",
                        "safe": True}

    # Caso 2: confezione (o unità non risolvibile) → leggi il contenuto dalla descrizione
    content = _parse_package_content(descrizione or "", base)
    if content is not None and content > 0:
        etichetta = inv_raw or "confezione"
        return {"factor": round(content, 6),
                "detail": f"1 {etichetta} ≈ {content:g} {base} (stimato dalla descrizione)",
                "safe": True}

    # Caso 3: non determinabile
    return {"factor": 1.0,
            "detail": "fattore non determinato — verifica a mano",
            "safe": False}


# Keyword → categoria suggerita
_CATEGORY_HINTS = {
    "carne": ["MANZO", "VITELLO", "MAIALE", "POLLO", "AGNELLO", "CONIGLIO", "ANATRA",
              "FESA", "COSTATA", "FILETTO", "BISTECCA", "BRACIOLA", "LONZA", "COPPA",
              "GUANCIA", "OSSOBUCO", "PETTO", "COSCIA", "SALSICCIA", "SALAME", "PROSCIUTTO",
              "BRESAOLA", "SPECK", "PANCETTA", "LARDO", "COTECHINO"],
    "pesce": ["SALMONE", "TONNO", "MERLUZZO", "BACCALA", "GAMBERO", "SCAMPO",
              "CALAMARO", "POLPO", "SEPPIA", "COZZE", "VONGOLE", "ORATA", "BRANZINO",
              "TROTA", "PESCE", "ACCIUGA", "SARDINA", "SGOMBRO", "RANA PESCATRICE"],
    "latticini": ["LATTE", "PANNA", "BURRO", "FORMAGGIO", "MOZZARELLA", "RICOTTA",
                  "GORGONZOLA", "PARMIGIANO", "GRANA", "PECORINO", "MASCARPONE",
                  "STRACCHINO", "TALEGGIO", "YOGURT", "FONTINA", "PROVOLONE"],
    "verdure": ["POMODORO", "ZUCCHINA", "MELANZANA", "PEPERONE", "CIPOLLA", "AGLIO",
                "CAROTA", "SEDANO", "PATATA", "INSALATA", "LATTUGA", "RUCOLA",
                "SPINACI", "CAVOLO", "BROCCOLI", "CARCIOFO", "ASPARAGO", "FUNGHI",
                "PORCINI", "RADICCHIO", "ZUCCA", "FINOCCHIO", "FAGIOLINI"],
    "frutta": ["MELA", "PERA", "ARANCIA", "LIMONE", "FRAGOLA", "LAMPONE", "MIRTILLO",
               "BANANA", "UVA", "PESCA", "ALBICOCCA", "CILIEGIA", "FICO", "CASTAGNA",
               "NOCE", "MANDORLA", "NOCCIOLA", "PISTACCHIO", "FRUTTA"],
    "pasta e cereali": ["PASTA", "SPAGHETTI", "PENNE", "RIGATONI", "TAGLIATELLE",
                        "LASAGNA", "RISO", "RISOTTO", "FARINA", "SEMOLA",
                        "PANE", "GRISSINI", "FOCACCIA", "POLENTA", "GNOCCHI"],
    "olio e condimenti": ["OLIO", "ACETO", "BALSAMICO", "SALE", "PEPE", "SPEZIE",
                           "BASILICO", "ROSMARINO", "SALVIA", "ORIGANO", "PREZZEMOLO",
                           "CAPPERI", "OLIVE", "SENAPE", "MAIONESE", "KETCHUP"],
    "bevande": ["VINO", "BIRRA", "ACQUA", "SUCCO", "CAFFE", "CAFFÈ", "THE", "COCA",
                "ARANCIATA", "SPRITE", "TONICA"],
}


def _clean_ingredient_name(raw_desc: str) -> str:
    """Pulisce la descrizione fattura per ricavare un nome ingrediente pulito."""
    name = raw_desc.strip().upper()

    # Rimuovi pattern rumorosi
    for pattern in _NOISE_PATTERNS:
        name = re.sub(pattern, "", name, flags=re.IGNORECASE)

    # Rimuovi punteggiatura superflua
    name = re.sub(r"[*#@!\[\]{}()|]", "", name)
    # Rimuovi spazi multipli
    name = re.sub(r"\s+", " ", name).strip()
    # Rimuovi trattini iniziali/finali
    name = name.strip("-–— .,;:/")

    # Title case
    if name:
        name = name.title()

    return name or raw_desc.strip().title()


def _guess_unit(unita_misura: Optional[str]) -> str:
    """Converte l'unità fattura in unità standard ingrediente."""
    if not unita_misura:
        return "kg"
    clean = unita_misura.strip().upper()
    return _UNIT_MAP.get(clean, "kg")


def _guess_category(name_upper: str) -> Optional[str]:
    """Suggerisce una categoria basandosi su keyword nel nome."""
    for cat, keywords in _CATEGORY_HINTS.items():
        for kw in keywords:
            if kw in name_upper:
                return cat
    return None


class SmartSuggestion(BaseModel):
    """Un ingrediente suggerito dall'analisi smart delle righe pending."""
    suggested_name: str
    raw_descriptions: List[str]  # descrizioni originali dalle fatture
    suggested_unit: str
    suggested_category: Optional[str] = None
    fornitori: List[str]  # nomi fornitori coinvolti
    righe_count: int  # quante righe pending verrebbero matchate
    riga_ids: List[int]  # ID delle righe pending coinvolte
    existing_match: Optional[Dict[str, Any]] = None  # se esiste già un ingrediente simile
    has_bio: bool = False
    has_dop_igp: bool = False
    # Fattore di conversione confezione → unità base, indovinato per il gruppo
    fornitore_unita: Optional[str] = None  # unità fattura più frequente
    suggested_factor: float = 1.0
    factor_detail: str = ""
    factor_safe: bool = True


class BulkCreateItem(BaseModel):
    """Singolo ingrediente da creare in bulk."""
    name: str
    default_unit: str
    category_name: Optional[str] = None
    riga_ids: List[int]  # righe da collegare automaticamente
    note: Optional[str] = None
    # Fattore confezione → unità base. Se None, viene indovinato riga per riga.
    fattore_conversione: Optional[float] = None


class BulkCreateRequest(BaseModel):
    """Richiesta di creazione ingredienti in blocco."""
    items: List[BulkCreateItem]


class BulkCreateResult(BaseModel):
    """Risultato della creazione in blocco."""
    created: int
    matched: int
    errors: List[str] = []


@router.get("/smart-suggest", response_model=List[SmartSuggestion])
def smart_suggest():
    """
    Analisi intelligente delle righe fattura pending.

    Raggruppa per descrizione normalizzata, pulisce i nomi,
    suggerisce unità e categoria, e segnala se esiste già un
    ingrediente simile nel sistema.
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    # 1. Carica tutte le righe pending (esclude fornitori esclusi + righe ignorate)
    pending = cur.execute(
        """
        SELECT r.id AS riga_id, r.descrizione, r.unita_misura,
               f.fornitore_nome, f.fornitore_piva
        FROM fe_righe r
        JOIN fe_fatture f ON f.id = r.fattura_id
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        WHERE r.id NOT IN (
            SELECT ip.riga_fattura_id
            FROM ingredient_prices ip
            WHERE ip.riga_fattura_id IS NOT NULL
        )
        AND r.id NOT IN (
            SELECT mir.riga_id FROM matching_ignored_righe mir
        )
        AND COALESCE(fc.escluso, 0) = 0
        """
    ).fetchall()

    # 1b. Carica descrizioni ignorate per filtrare nuove righe con stessa descrizione
    ignored_descs = {
        r["descrizione_normalizzata"]
        for r in cur.execute(
            "SELECT descrizione_normalizzata FROM matching_description_exclusions"
        ).fetchall()
    }

    # 2. Carica ingredienti esistenti per fuzzy match
    existing_ingredients = cur.execute(
        "SELECT id, name, default_unit FROM ingredients WHERE is_active = 1"
    ).fetchall()

    # 3. Carica mapping esistenti per escludere ciò che ha già un mapping
    existing_maps = cur.execute(
        """
        SELECT DISTINCT UPPER(descrizione_fornitore) AS desc_upper,
               supplier_id
        FROM ingredient_supplier_map
        """
    ).fetchall()
    mapped_set = {(row["desc_upper"], row["supplier_id"]) for row in existing_maps}

    conn.close()

    # 4. Raggruppa per descrizione normalizzata
    groups = {}  # key: cleaned_name_upper → {info}
    for row in pending:
        desc = row["descrizione"] or ""
        cleaned = _clean_ingredient_name(desc)
        key = cleaned.upper()

        if not key or len(key) < 3:
            continue

        # Salta descrizioni già ignorate
        if key in ignored_descs:
            continue

        if key not in groups:
            groups[key] = {
                "cleaned": cleaned,
                "raw_descs": set(),
                "units": [],
                "fornitori": set(),
                "riga_ids": [],
                "has_bio": False,
                "has_dop_igp": False,
            }

        g = groups[key]
        g["raw_descs"].add(desc.strip())
        if row["unita_misura"]:
            g["units"].append(row["unita_misura"])
        if row["fornitore_nome"]:
            g["fornitori"].add(row["fornitore_nome"])
        g["riga_ids"].append(row["riga_id"])

        desc_upper = desc.upper()
        if "BIO" in desc_upper:
            g["has_bio"] = True
        if any(kw in desc_upper for kw in ["DOP", "IGP", "DOC", "STG"]):
            g["has_dop_igp"] = True

    # 5. Costruisci suggerimenti
    suggestions = []
    for key, g in groups.items():
        # Unità più frequente
        most_common_unit = None
        if g["units"]:
            from collections import Counter
            unit_counts = Counter(u.strip().upper() for u in g["units"])
            most_common_unit = unit_counts.most_common(1)[0][0]
            suggested_unit = _guess_unit(most_common_unit)
        else:
            suggested_unit = "kg"

        # Fattore di conversione del gruppo (confezione → unità base).
        # Usa la descrizione raw più informativa (la più lunga) per la stima.
        rep_desc = max(g["raw_descs"], key=len) if g["raw_descs"] else ""
        factor_guess = _guess_conversion_factor(rep_desc, most_common_unit, suggested_unit)

        # Categoria
        suggested_cat = _guess_category(key)

        # Controlla se esiste già un ingrediente simile
        existing_match = None
        best_score = 0
        for ing in existing_ingredients:
            score = _fuzzy_score(key, ing["name"])
            if score > best_score:
                best_score = score
                if score > 60:
                    existing_match = {
                        "id": ing["id"],
                        "name": ing["name"],
                        "score": round(score, 1),
                    }

        # Nota arricchita
        name = g["cleaned"]
        if g["has_bio"]:
            name = name.rstrip() + " Bio" if "Bio" not in name else name
        if g["has_dop_igp"]:
            for label in ["Dop", "Igp", "Doc", "Stg"]:
                if label.upper() in " ".join(g["raw_descs"]).upper() and label not in name:
                    name = name.rstrip() + f" {label}"
                    break

        suggestions.append(SmartSuggestion(
            suggested_name=name,
            raw_descriptions=sorted(g["raw_descs"])[:5],  # max 5 esempi
            suggested_unit=suggested_unit,
            suggested_category=suggested_cat,
            fornitori=sorted(g["fornitori"]),
            righe_count=len(g["riga_ids"]),
            riga_ids=g["riga_ids"],
            existing_match=existing_match,
            has_bio=g["has_bio"],
            has_dop_igp=g["has_dop_igp"],
            fornitore_unita=most_common_unit,
            suggested_factor=factor_guess["factor"],
            factor_detail=factor_guess["detail"],
            factor_safe=factor_guess["safe"],
        ))

    # Ordina: prima quelli con più righe (più impatto)
    suggestions.sort(key=lambda s: s.righe_count, reverse=True)

    return suggestions


@router.post("/bulk-create", response_model=BulkCreateResult)
def bulk_create_ingredients(
    payload: BulkCreateRequest,
    current_user: Any = Depends(get_current_user),
):
    """
    Crea ingredienti in blocco e auto-matcha le righe fattura collegate.

    Per ogni item:
    1. Crea l'ingrediente (o riusa se esiste già per nome esatto)
    2. Per ogni riga_id collegata: crea il supplier mapping + salva il prezzo
    """
    username = (
        current_user.get("username") if isinstance(current_user, dict)
        else getattr(current_user, "username", "system")
    )

    conn = get_foodcost_connection()
    cur = conn.cursor()

    created = 0
    matched = 0
    errors = []
    now = datetime.utcnow().isoformat()

    for item in payload.items:
        try:
            name = item.name.strip()
            if not name:
                errors.append("Nome vuoto — saltato")
                continue

            # Controlla se esiste già un ingrediente con lo stesso nome
            existing = cur.execute(
                "SELECT id FROM ingredients WHERE UPPER(name) = UPPER(?)",
                (name,),
            ).fetchone()

            if existing:
                ingredient_id = existing["id"]
            else:
                # Gestisci categoria
                category_id = None
                if item.category_name:
                    cat = cur.execute(
                        "SELECT id FROM ingredient_categories WHERE UPPER(name) = UPPER(?)",
                        (item.category_name.strip(),),
                    ).fetchone()
                    if cat:
                        category_id = cat["id"]
                    else:
                        cur.execute(
                            "INSERT INTO ingredient_categories (name) VALUES (?)",
                            (item.category_name.strip().title(),),
                        )
                        category_id = cur.lastrowid

                # Crea ingrediente
                cur.execute(
                    """
                    INSERT INTO ingredients (name, default_unit, category_id, note, is_active, created_at)
                    VALUES (?, ?, ?, ?, 1, ?)
                    """,
                    (name, item.default_unit, category_id, item.note, now),
                )
                ingredient_id = cur.lastrowid
                created += 1

            # Auto-match tutte le righe collegate
            for riga_id in item.riga_ids:
                riga = cur.execute(
                    """
                    SELECT r.id AS riga_id, r.fattura_id, r.descrizione, r.quantita,
                           r.unita_misura, r.prezzo_unitario, r.prezzo_totale,
                           f.fornitore_nome, f.fornitore_piva, f.numero_fattura, f.data_fattura
                    FROM fe_righe r
                    JOIN fe_fatture f ON f.id = r.fattura_id
                    WHERE r.id = ?
                    """,
                    (riga_id,),
                ).fetchone()

                if not riga:
                    continue

                # Già matchata? Skip
                already = cur.execute(
                    "SELECT id FROM ingredient_prices WHERE riga_fattura_id = ?",
                    (riga_id,),
                ).fetchone()
                if already:
                    continue

                # Trova/crea supplier
                supplier_id = _get_or_create_supplier(
                    cur, riga["fornitore_nome"], riga["fornitore_piva"]
                )

                # Fattore di conversione: override esplicito dell'item, altrimenti
                # indovinato riga per riga (le confezioni possono variare).
                if item.fattore_conversione is not None and item.fattore_conversione > 0:
                    fattore = item.fattore_conversione
                else:
                    fattore = _guess_conversion_factor(
                        riga["descrizione"], riga["unita_misura"], item.default_unit
                    )["factor"]

                # Crea mapping se non esiste
                existing_map = cur.execute(
                    """
                    SELECT id FROM ingredient_supplier_map
                    WHERE ingredient_id = ? AND supplier_id = ? AND UPPER(descrizione_fornitore) = UPPER(?)
                    """,
                    (ingredient_id, supplier_id, riga["descrizione"]),
                ).fetchone()

                if not existing_map:
                    cur.execute(
                        """
                        INSERT INTO ingredient_supplier_map (
                            ingredient_id, supplier_id, descrizione_fornitore,
                            unita_fornitore, fattore_conversione, is_default,
                            confirmed_by, created_at
                        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                        """,
                        (
                            ingredient_id, supplier_id,
                            riga["descrizione"],
                            riga["unita_misura"],
                            fattore,
                            username, now,
                        ),
                    )

                # Salva prezzo
                _save_price_from_riga(cur, ingredient_id, supplier_id, dict(riga), fattore)
                matched += 1

        except Exception as e:
            errors.append(f"{item.name}: {str(e)}")

    conn.commit()
    conn.close()

    return BulkCreateResult(created=created, matched=matched, errors=errors)
