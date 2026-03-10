#!/usr/bin/env python3
# @version: v1.0-foodcost-matching
# -*- coding: utf-8 -*-

"""
Router matching fatture → ingredienti

Gestisce il collegamento automatico tra righe fattura XML e ingredienti
del food cost, con aggiornamento prezzi automatico.

Flusso:
1. GET /foodcost/matching/pending    → righe fattura non ancora abbinate
2. GET /foodcost/matching/suggest    → suggerimenti match per una riga
3. POST /foodcost/matching/confirm   → conferma match (salva in ingredient_supplier_map + prezzo)
4. POST /foodcost/matching/auto      → auto-match tutte le righe con mapping noto
5. GET /foodcost/matching/mappings   → lista mapping esistenti
6. DELETE /foodcost/matching/mappings/{id} → elimina un mapping

Il matching usa ingredient_supplier_map: una volta che l'utente conferma
"questa riga di questo fornitore = questo ingrediente", il sistema lo ricorda
e le prossime fatture dello stesso fornitore vengono abbinate automaticamente.
"""

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


def _save_price_from_riga(cur, ingredient_id: int, supplier_id: int,
                          riga: dict, fattore_conversione: float) -> None:
    """Salva un prezzo in ingredient_prices a partire da una riga fattura."""
    prezzo_unitario = riga.get("prezzo_unitario")
    if prezzo_unitario is None or prezzo_unitario <= 0:
        return

    # Prezzo convertito nell'unità base dell'ingrediente
    unit_price = prezzo_unitario / fattore_conversione if fattore_conversione else prezzo_unitario

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


# ─────────────────────────────────────────────
#   ENDPOINT: RIGHE FATTURA NON ABBINATE
# ─────────────────────────────────────────────

@router.get("/pending", response_model=List[PendingRow])
def list_pending_rows(
    limit: int = Query(100, ge=1, le=500),
    fornitore: Optional[str] = None,
):
    """
    Righe fattura che non hanno ancora un match in ingredient_supplier_map.
    Sono le righe da abbinare manualmente.
    """
    conn = get_foodcost_connection()
    cur = conn.cursor()

    params = []
    where_extra = ""
    if fornitore:
        where_extra = "AND f.fornitore_nome LIKE ?"
        params.append(f"%{fornitore}%")

    params.append(limit)

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
        WHERE r.id NOT IN (
            SELECT ip.riga_fattura_id
            FROM ingredient_prices ip
            WHERE ip.riga_fattura_id IS NOT NULL
        )
        {where_extra}
        ORDER BY f.data_fattura DESC, r.id
        LIMIT ?
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
    return suggestions[:10]


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
        "SELECT id FROM ingredients WHERE id = ?", (payload.ingredient_id,)
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
    _save_price_from_riga(
        cur,
        payload.ingredient_id,
        supplier_id,
        dict(riga),
        payload.fattore_conversione,
    )

    conn.commit()
    conn.close()

    return {"status": "ok", "detail": "Match confermato e prezzo aggiornato"}


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
