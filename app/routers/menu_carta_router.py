#!/usr/bin/env python3
# @version: v1.0-menu-carta-router
# -*- coding: utf-8 -*-

"""
Router Menu Carta — sessione 57 (2026-04-25)

Schema in foodcost.db (mig 098): menu_editions, menu_dish_publications,
menu_tasting_paths, menu_tasting_path_steps + ALTER recipes.

Specifica completa: docs/menu_carta.md (sezione 4 — endpoint API).

Endpoint principali:
  ── EDIZIONI ──
  GET    /menu-carta/editions/                    lista (filtri: ?stato=)
  GET    /menu-carta/editions/{id}                dettaglio + pubblicazioni raggruppate per sezione
  POST   /menu-carta/editions/                    crea (stato='bozza')
  PUT    /menu-carta/editions/{id}                modifica
  POST   /menu-carta/editions/{id}/publish        promuove a 'in_carta' (archivia la precedente)
  POST   /menu-carta/editions/{id}/clone          clona in nuova bozza
  POST   /menu-carta/editions/{id}/archive        forza 'archiviata'
  DELETE /menu-carta/editions/{id}                solo se 'bozza'

  ── PUBBLICAZIONI PIATTI ──
  GET    /menu-carta/publications/?edition_id=X   lista
  POST   /menu-carta/publications/                crea
  PUT    /menu-carta/publications/{id}            modifica
  DELETE /menu-carta/publications/{id}            elimina

  ── DEGUSTAZIONI ──
  GET    /menu-carta/tasting-paths/?edition_id=X  lista con steps
  POST   /menu-carta/tasting-paths/               crea (con steps)
  PUT    /menu-carta/tasting-paths/{id}           modifica (replace steps)
  DELETE /menu-carta/tasting-paths/{id}           elimina

  ── PUBBLICO ──
  GET    /menu-carta/public/today                 menu attualmente in_carta (no auth)
"""

from datetime import datetime
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user


# Path al DB tasks.sqlite3 (modulo Cucina HACCP) — usato dal generatore MEP
TASKS_DB = Path(__file__).resolve().parents[2] / "app" / "data" / "tasks.sqlite3"


# ─────────────────────────────────────────────
#   ROUTER
# ─────────────────────────────────────────────

router = APIRouter(dependencies=[Depends(get_current_user)])
public_router = APIRouter()  # endpoint pubblici senza auth


# ─────────────────────────────────────────────
#   COSTANTI
# ─────────────────────────────────────────────

SEZIONI_VALIDE = {
    "antipasti", "paste_risi_zuppe", "piatti_del_giorno",
    "secondi", "contorni", "degustazioni", "bambini", "servizio",
}
STATI_VALIDI = {"bozza", "in_carta", "archiviata"}


# ─────────────────────────────────────────────
#   MODELLI Pydantic
# ─────────────────────────────────────────────

class EditionIn(BaseModel):
    nome: str = Field(..., min_length=1)
    slug: str = Field(..., min_length=1)
    stagione: Optional[str] = None
    anno: Optional[int] = None
    data_inizio: Optional[str] = None
    data_fine: Optional[str] = None
    note: Optional[str] = None
    pdf_path: Optional[str] = None


class EditionUpdate(BaseModel):
    nome: Optional[str] = None
    stagione: Optional[str] = None
    anno: Optional[int] = None
    data_inizio: Optional[str] = None
    data_fine: Optional[str] = None
    note: Optional[str] = None
    pdf_path: Optional[str] = None


class PublicationIn(BaseModel):
    edition_id: int
    recipe_id: Optional[int] = None
    sezione: str
    sort_order: int = 0
    titolo_override: Optional[str] = None
    descrizione_override: Optional[str] = None
    prezzo_singolo: Optional[float] = None
    prezzo_min: Optional[float] = None
    prezzo_max: Optional[float] = None
    prezzo_piccolo: Optional[float] = None
    prezzo_grande: Optional[float] = None
    prezzo_label: Optional[str] = None
    consigliato_per: Optional[int] = None
    descrizione_variabile: bool = False
    badge: Optional[str] = None
    is_visible: bool = True
    allergeni_dichiarati: Optional[str] = None
    foto_path: Optional[str] = None


class PublicationUpdate(BaseModel):
    recipe_id: Optional[int] = None
    sezione: Optional[str] = None
    sort_order: Optional[int] = None
    titolo_override: Optional[str] = None
    descrizione_override: Optional[str] = None
    prezzo_singolo: Optional[float] = None
    prezzo_min: Optional[float] = None
    prezzo_max: Optional[float] = None
    prezzo_piccolo: Optional[float] = None
    prezzo_grande: Optional[float] = None
    prezzo_label: Optional[str] = None
    consigliato_per: Optional[int] = None
    descrizione_variabile: Optional[bool] = None
    badge: Optional[str] = None
    is_visible: Optional[bool] = None
    allergeni_dichiarati: Optional[str] = None
    foto_path: Optional[str] = None


class TastingStepIn(BaseModel):
    sort_order: int = 0
    publication_id: Optional[int] = None
    titolo_libero: Optional[str] = None
    note: Optional[str] = None


class TastingPathIn(BaseModel):
    edition_id: int
    nome: str
    sottotitolo: Optional[str] = None
    prezzo_persona: float
    note: Optional[str] = None
    sort_order: int = 0
    is_visible: bool = True
    steps: List[TastingStepIn] = []


# ─────────────────────────────────────────────
#   HELPER
# ─────────────────────────────────────────────

def _row_to_edition(r) -> Dict[str, Any]:
    return {
        "id": r["id"], "nome": r["nome"], "slug": r["slug"],
        "stagione": r["stagione"], "anno": r["anno"],
        "data_inizio": r["data_inizio"], "data_fine": r["data_fine"],
        "stato": r["stato"], "note": r["note"], "pdf_path": r["pdf_path"],
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def _row_to_publication(r) -> Dict[str, Any]:
    return {
        "id": r["id"], "edition_id": r["edition_id"],
        "recipe_id": r["recipe_id"],
        "recipe_menu_name": r["recipe_menu_name"] if "recipe_menu_name" in r.keys() else None,
        "recipe_menu_description": r["recipe_menu_description"] if "recipe_menu_description" in r.keys() else None,
        "sezione": r["sezione"], "sort_order": r["sort_order"],
        "titolo_override": r["titolo_override"],
        "descrizione_override": r["descrizione_override"],
        "prezzo_singolo": r["prezzo_singolo"],
        "prezzo_min": r["prezzo_min"], "prezzo_max": r["prezzo_max"],
        "prezzo_piccolo": r["prezzo_piccolo"], "prezzo_grande": r["prezzo_grande"],
        "prezzo_label": r["prezzo_label"],
        "consigliato_per": r["consigliato_per"],
        "descrizione_variabile": bool(r["descrizione_variabile"]),
        "badge": r["badge"],
        "is_visible": bool(r["is_visible"]),
        "allergeni_dichiarati": r["allergeni_dichiarati"],
        "foto_path": r["foto_path"],
    }


# ═══════════════════════════════════════════════════════════
#   EDIZIONI
# ═══════════════════════════════════════════════════════════

@router.get("/editions/")
def list_editions(stato: Optional[str] = None):
    """Lista edizioni. Filtri: stato (bozza|in_carta|archiviata)."""
    if stato and stato not in STATI_VALIDI:
        raise HTTPException(400, f"stato non valido: {stato}")

    conn = get_foodcost_connection()
    try:
        q = "SELECT * FROM menu_editions"
        params: List[Any] = []
        if stato:
            q += " WHERE stato = ?"
            params.append(stato)
        q += " ORDER BY CASE stato WHEN 'in_carta' THEN 0 WHEN 'bozza' THEN 1 ELSE 2 END, anno DESC, id DESC"
        rows = conn.execute(q, params).fetchall()
        return [_row_to_edition(r) for r in rows]
    finally:
        conn.close()


@router.get("/editions/{edition_id}")
def get_edition(edition_id: int):
    """Dettaglio edizione + pubblicazioni raggruppate per sezione + degustazioni."""
    conn = get_foodcost_connection()
    try:
        e = conn.execute("SELECT * FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        edition = _row_to_edition(e)

        # Pubblicazioni con join recipes per fallback nome/descrizione
        pubs = conn.execute("""
            SELECT p.*,
                   r.menu_name as recipe_menu_name,
                   r.menu_description as recipe_menu_description
            FROM menu_dish_publications p
            LEFT JOIN recipes r ON p.recipe_id = r.id
            WHERE p.edition_id = ?
            ORDER BY
              CASE p.sezione
                WHEN 'antipasti' THEN 1
                WHEN 'paste_risi_zuppe' THEN 2
                WHEN 'piatti_del_giorno' THEN 3
                WHEN 'secondi' THEN 4
                WHEN 'contorni' THEN 5
                WHEN 'degustazioni' THEN 6
                WHEN 'bambini' THEN 7
                WHEN 'servizio' THEN 8
                ELSE 9 END,
              p.sort_order
        """, (edition_id,)).fetchall()

        # Raggruppa per sezione
        sezioni: Dict[str, List[Dict[str, Any]]] = {}
        for r in pubs:
            sezioni.setdefault(r["sezione"], []).append(_row_to_publication(r))

        # Degustazioni con steps
        paths_rows = conn.execute("""
            SELECT * FROM menu_tasting_paths WHERE edition_id = ? ORDER BY sort_order, id
        """, (edition_id,)).fetchall()
        paths = []
        for tp in paths_rows:
            steps = conn.execute("""
                SELECT s.*,
                       p.titolo_override as pub_titolo,
                       r.menu_name as recipe_menu_name
                FROM menu_tasting_path_steps s
                LEFT JOIN menu_dish_publications p ON s.publication_id = p.id
                LEFT JOIN recipes r ON p.recipe_id = r.id
                WHERE s.path_id = ?
                ORDER BY s.sort_order
            """, (tp["id"],)).fetchall()
            paths.append({
                "id": tp["id"], "nome": tp["nome"], "sottotitolo": tp["sottotitolo"],
                "prezzo_persona": tp["prezzo_persona"], "note": tp["note"],
                "sort_order": tp["sort_order"], "is_visible": bool(tp["is_visible"]),
                "steps": [
                    {
                        "id": s["id"], "sort_order": s["sort_order"],
                        "publication_id": s["publication_id"],
                        "titolo_libero": s["titolo_libero"],
                        "publication_label": (
                            s["pub_titolo"] or s["recipe_menu_name"]
                            if "pub_titolo" in s.keys() else None
                        ),
                        "note": s["note"],
                    }
                    for s in steps
                ],
            })

        # KPI riepilogo
        n_pubs = len(pubs)
        n_dish_pubs = sum(1 for r in pubs if r["recipe_id"] is not None)
        prezzo_medio = None
        prezzi = [r["prezzo_singolo"] for r in pubs if r["prezzo_singolo"] is not None and r["sezione"] not in ("servizio", "bambini")]
        if prezzi:
            prezzo_medio = round(sum(prezzi) / len(prezzi), 2)

        return {
            "edition": edition,
            "sezioni": sezioni,
            "tasting_paths": paths,
            "kpi": {
                "totale_pubblicazioni": n_pubs,
                "piatti_collegati": n_dish_pubs,
                "degustazioni": len(paths),
                "prezzo_medio_carta": prezzo_medio,
            },
        }
    finally:
        conn.close()


@router.post("/editions/", status_code=201)
def create_edition(payload: EditionIn):
    conn = get_foodcost_connection()
    try:
        # check slug univoco
        ex = conn.execute("SELECT id FROM menu_editions WHERE slug = ?", (payload.slug,)).fetchone()
        if ex:
            raise HTTPException(409, f"Slug '{payload.slug}' già esistente")

        cur = conn.execute("""
            INSERT INTO menu_editions
                (nome, slug, stagione, anno, data_inizio, data_fine,
                 stato, note, pdf_path)
            VALUES (?, ?, ?, ?, ?, ?, 'bozza', ?, ?)
        """, (
            payload.nome, payload.slug, payload.stagione, payload.anno,
            payload.data_inizio, payload.data_fine, payload.note, payload.pdf_path,
        ))
        conn.commit()
        return {"id": cur.lastrowid, "nome": payload.nome, "stato": "bozza"}
    finally:
        conn.close()


@router.put("/editions/{edition_id}")
def update_edition(edition_id: int, payload: EditionUpdate):
    conn = get_foodcost_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Edizione non trovata")

        fields = payload.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(400, "Nessun campo da aggiornare")

        sets = ", ".join(f"{k} = ?" for k in fields.keys())
        params = list(fields.values()) + [edition_id]
        conn.execute(f"UPDATE menu_editions SET {sets}, updated_at = datetime('now') WHERE id = ?", params)
        conn.commit()
        return {"ok": True, "updated_fields": list(fields.keys())}
    finally:
        conn.close()


@router.post("/editions/{edition_id}/publish")
def publish_edition(edition_id: int):
    """
    Promuove l'edizione a stato 'in_carta'. Se ce n'e' un'altra in_carta,
    la archivia automaticamente (solo una in_carta per volta).
    """
    conn = get_foodcost_connection()
    try:
        e = conn.execute("SELECT id, stato FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        if e["stato"] == "in_carta":
            return {"ok": True, "msg": "Già in carta"}

        # Archivia la precedente in carta
        conn.execute("UPDATE menu_editions SET stato='archiviata', updated_at=datetime('now') WHERE stato='in_carta'")
        conn.execute("UPDATE menu_editions SET stato='in_carta', updated_at=datetime('now') WHERE id=?", (edition_id,))
        conn.commit()
        return {"ok": True, "stato": "in_carta"}
    finally:
        conn.close()


@router.post("/editions/{edition_id}/clone")
def clone_edition(edition_id: int, payload: dict):
    """Clona un'edizione (con tutte le pubblicazioni e degustazioni) in nuova bozza.
    Body: { nome, slug, stagione?, anno?, data_inizio?, data_fine? }"""
    nome = payload.get("nome")
    slug = payload.get("slug")
    if not nome or not slug:
        raise HTTPException(400, "nome e slug obbligatori")

    conn = get_foodcost_connection()
    try:
        src = conn.execute("SELECT * FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not src:
            raise HTTPException(404, "Edizione non trovata")

        ex = conn.execute("SELECT id FROM menu_editions WHERE slug = ?", (slug,)).fetchone()
        if ex:
            raise HTTPException(409, f"Slug '{slug}' già esistente")

        # nuova edizione
        cur = conn.execute("""
            INSERT INTO menu_editions
                (nome, slug, stagione, anno, data_inizio, data_fine, stato, note, pdf_path)
            VALUES (?, ?, ?, ?, ?, ?, 'bozza', ?, NULL)
        """, (
            nome, slug,
            payload.get("stagione") or src["stagione"],
            payload.get("anno") or src["anno"],
            payload.get("data_inizio"),
            payload.get("data_fine"),
            f"Clonata da '{src['nome']}'.",
        ))
        new_id = cur.lastrowid

        # clona publications
        pubs = conn.execute("SELECT * FROM menu_dish_publications WHERE edition_id = ?", (edition_id,)).fetchall()
        pub_id_map: Dict[int, int] = {}
        for p in pubs:
            cnew = conn.execute("""
                INSERT INTO menu_dish_publications
                    (edition_id, recipe_id, sezione, sort_order,
                     titolo_override, descrizione_override,
                     prezzo_singolo, prezzo_min, prezzo_max,
                     prezzo_piccolo, prezzo_grande, prezzo_label,
                     consigliato_per, descrizione_variabile, badge,
                     is_visible, allergeni_dichiarati, foto_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                new_id, p["recipe_id"], p["sezione"], p["sort_order"],
                p["titolo_override"], p["descrizione_override"],
                p["prezzo_singolo"], p["prezzo_min"], p["prezzo_max"],
                p["prezzo_piccolo"], p["prezzo_grande"], p["prezzo_label"],
                p["consigliato_per"], p["descrizione_variabile"], p["badge"],
                p["is_visible"], p["allergeni_dichiarati"], p["foto_path"],
            ))
            pub_id_map[p["id"]] = cnew.lastrowid

        # clona tasting paths e steps
        paths = conn.execute("SELECT * FROM menu_tasting_paths WHERE edition_id = ?", (edition_id,)).fetchall()
        for tp in paths:
            cnew = conn.execute("""
                INSERT INTO menu_tasting_paths
                    (edition_id, nome, sottotitolo, prezzo_persona, note, sort_order, is_visible)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                new_id, tp["nome"], tp["sottotitolo"], tp["prezzo_persona"],
                tp["note"], tp["sort_order"], tp["is_visible"],
            ))
            new_path_id = cnew.lastrowid
            steps = conn.execute("SELECT * FROM menu_tasting_path_steps WHERE path_id = ?", (tp["id"],)).fetchall()
            for s in steps:
                conn.execute("""
                    INSERT INTO menu_tasting_path_steps
                        (path_id, sort_order, publication_id, titolo_libero, note)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    new_path_id, s["sort_order"],
                    pub_id_map.get(s["publication_id"]), s["titolo_libero"], s["note"],
                ))

        conn.commit()
        return {"id": new_id, "nome": nome, "stato": "bozza", "publications_clonate": len(pubs)}
    finally:
        conn.close()


@router.post("/editions/{edition_id}/archive")
def archive_edition(edition_id: int):
    conn = get_foodcost_connection()
    try:
        e = conn.execute("SELECT id FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        conn.execute("UPDATE menu_editions SET stato='archiviata', updated_at=datetime('now') WHERE id=?", (edition_id,))
        conn.commit()
        return {"ok": True, "stato": "archiviata"}
    finally:
        conn.close()


@router.delete("/editions/{edition_id}")
def delete_edition(edition_id: int):
    """Elimina edizione (cascade su pubblicazioni e degustazioni). Solo se bozza."""
    conn = get_foodcost_connection()
    try:
        e = conn.execute("SELECT id, stato, nome FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        if e["stato"] != "bozza":
            raise HTTPException(400, f"Si possono eliminare solo le edizioni in bozza (questa è '{e['stato']}')")
        conn.execute("DELETE FROM menu_editions WHERE id = ?", (edition_id,))
        conn.commit()
        return {"ok": True, "deleted": e["nome"]}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#   PUBBLICAZIONI
# ═══════════════════════════════════════════════════════════

@router.get("/publications/")
def list_publications(edition_id: int = Query(...)):
    conn = get_foodcost_connection()
    try:
        rows = conn.execute("""
            SELECT p.*,
                   r.menu_name as recipe_menu_name,
                   r.menu_description as recipe_menu_description
            FROM menu_dish_publications p
            LEFT JOIN recipes r ON p.recipe_id = r.id
            WHERE p.edition_id = ?
            ORDER BY p.sezione, p.sort_order
        """, (edition_id,)).fetchall()
        return [_row_to_publication(r) for r in rows]
    finally:
        conn.close()


@router.post("/publications/", status_code=201)
def create_publication(payload: PublicationIn):
    if payload.sezione not in SEZIONI_VALIDE:
        raise HTTPException(400, f"sezione '{payload.sezione}' non valida")

    conn = get_foodcost_connection()
    try:
        cur = conn.execute("""
            INSERT INTO menu_dish_publications
                (edition_id, recipe_id, sezione, sort_order,
                 titolo_override, descrizione_override,
                 prezzo_singolo, prezzo_min, prezzo_max,
                 prezzo_piccolo, prezzo_grande, prezzo_label,
                 consigliato_per, descrizione_variabile, badge,
                 is_visible, allergeni_dichiarati, foto_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.edition_id, payload.recipe_id, payload.sezione, payload.sort_order,
            payload.titolo_override, payload.descrizione_override,
            payload.prezzo_singolo, payload.prezzo_min, payload.prezzo_max,
            payload.prezzo_piccolo, payload.prezzo_grande, payload.prezzo_label,
            payload.consigliato_per, 1 if payload.descrizione_variabile else 0, payload.badge,
            1 if payload.is_visible else 0, payload.allergeni_dichiarati, payload.foto_path,
        ))
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@router.put("/publications/{pub_id}")
def update_publication(pub_id: int, payload: PublicationUpdate):
    fields = payload.model_dump(exclude_unset=True)
    if "sezione" in fields and fields["sezione"] not in SEZIONI_VALIDE:
        raise HTTPException(400, f"sezione '{fields['sezione']}' non valida")
    # converte bool a int
    for k in ("descrizione_variabile", "is_visible"):
        if k in fields:
            fields[k] = 1 if fields[k] else 0
    if not fields:
        raise HTTPException(400, "Nessun campo da aggiornare")

    conn = get_foodcost_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_dish_publications WHERE id = ?", (pub_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Pubblicazione non trovata")

        sets = ", ".join(f"{k} = ?" for k in fields.keys())
        params = list(fields.values()) + [pub_id]
        conn.execute(f"UPDATE menu_dish_publications SET {sets}, updated_at = datetime('now') WHERE id = ?", params)
        conn.commit()
        return {"ok": True, "updated_fields": list(fields.keys())}
    finally:
        conn.close()


@router.delete("/publications/{pub_id}")
def delete_publication(pub_id: int):
    conn = get_foodcost_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_dish_publications WHERE id = ?", (pub_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Pubblicazione non trovata")
        conn.execute("DELETE FROM menu_dish_publications WHERE id = ?", (pub_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#   DEGUSTAZIONI
# ═══════════════════════════════════════════════════════════

@router.get("/tasting-paths/")
def list_tasting_paths(edition_id: int = Query(...)):
    conn = get_foodcost_connection()
    try:
        paths = conn.execute("""
            SELECT * FROM menu_tasting_paths WHERE edition_id = ?
            ORDER BY sort_order, id
        """, (edition_id,)).fetchall()
        out = []
        for tp in paths:
            steps = conn.execute("""
                SELECT s.*, p.titolo_override as pub_titolo, r.menu_name as recipe_menu_name
                FROM menu_tasting_path_steps s
                LEFT JOIN menu_dish_publications p ON s.publication_id = p.id
                LEFT JOIN recipes r ON p.recipe_id = r.id
                WHERE s.path_id = ?
                ORDER BY s.sort_order
            """, (tp["id"],)).fetchall()
            out.append({
                "id": tp["id"], "nome": tp["nome"], "sottotitolo": tp["sottotitolo"],
                "prezzo_persona": tp["prezzo_persona"], "note": tp["note"],
                "sort_order": tp["sort_order"], "is_visible": bool(tp["is_visible"]),
                "steps": [
                    {
                        "id": s["id"], "sort_order": s["sort_order"],
                        "publication_id": s["publication_id"],
                        "titolo_libero": s["titolo_libero"],
                        "publication_label": s["pub_titolo"] or s["recipe_menu_name"],
                        "note": s["note"],
                    } for s in steps
                ],
            })
        return out
    finally:
        conn.close()


@router.post("/tasting-paths/", status_code=201)
def create_tasting_path(payload: TastingPathIn):
    conn = get_foodcost_connection()
    try:
        cur = conn.execute("""
            INSERT INTO menu_tasting_paths
                (edition_id, nome, sottotitolo, prezzo_persona, note, sort_order, is_visible)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.edition_id, payload.nome, payload.sottotitolo, payload.prezzo_persona,
            payload.note, payload.sort_order, 1 if payload.is_visible else 0,
        ))
        path_id = cur.lastrowid
        for s in payload.steps:
            conn.execute("""
                INSERT INTO menu_tasting_path_steps (path_id, sort_order, publication_id, titolo_libero, note)
                VALUES (?, ?, ?, ?, ?)
            """, (path_id, s.sort_order, s.publication_id, s.titolo_libero, s.note))
        conn.commit()
        return {"id": path_id, "steps": len(payload.steps)}
    finally:
        conn.close()


@router.put("/tasting-paths/{path_id}")
def update_tasting_path(path_id: int, payload: TastingPathIn):
    """Modifica path + replace di tutti gli steps."""
    conn = get_foodcost_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_tasting_paths WHERE id = ?", (path_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Degustazione non trovata")
        conn.execute("""
            UPDATE menu_tasting_paths
               SET nome = ?, sottotitolo = ?, prezzo_persona = ?, note = ?,
                   sort_order = ?, is_visible = ?, updated_at = datetime('now')
             WHERE id = ?
        """, (
            payload.nome, payload.sottotitolo, payload.prezzo_persona, payload.note,
            payload.sort_order, 1 if payload.is_visible else 0, path_id,
        ))
        # replace steps
        conn.execute("DELETE FROM menu_tasting_path_steps WHERE path_id = ?", (path_id,))
        for s in payload.steps:
            conn.execute("""
                INSERT INTO menu_tasting_path_steps (path_id, sort_order, publication_id, titolo_libero, note)
                VALUES (?, ?, ?, ?, ?)
            """, (path_id, s.sort_order, s.publication_id, s.titolo_libero, s.note))
        conn.commit()
        return {"ok": True, "steps": len(payload.steps)}
    finally:
        conn.close()


@router.delete("/tasting-paths/{path_id}")
def delete_tasting_path(path_id: int):
    conn = get_foodcost_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_tasting_paths WHERE id = ?", (path_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Degustazione non trovata")
        conn.execute("DELETE FROM menu_tasting_paths WHERE id = ?", (path_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#   GENERATORE MEP DINAMICO (Blocco E, sessione 57)
#
#   Date le pubblicazioni di un'edizione menu, costruisce in tasks.sqlite3
#   N template "MEP Carta · {sezione} · {slug}" (uno per ogni partita
#   coperta) con item CHECKBOX uno per ogni piatto della sezione.
#
#   Quando il menu cambia (es. da Primavera a Estate) basta:
#     1. clone edition  -> bozza Estate 2026
#     2. modifica piatti
#     3. publish
#     4. POST /menu-carta/editions/{estate_id}/generate-mep
#
#   I 5 template MEP fissi della mig 097 restano indipendenti come
#   fallback / scheletro generale. I template generati qui hanno nome
#   diverso ("MEP Carta · ...") e non si sovrappongono.
# ═══════════════════════════════════════════════════════════

# Mapping sezione -> partita (alcune sezioni vanno raggruppate sotto
# la stessa partita; piatti del giorno vivono in MEP Antipasti perchè
# la lavagna sta li').
SEZIONE_TO_PARTITA: Dict[str, str] = {
    "antipasti":         "Antipasti",
    "piatti_del_giorno": "Antipasti",   # lavagna, gestita dalla partita antipasti
    "paste_risi_zuppe":  "Primi",
    "secondi":           "Secondi",
    "contorni":          "Contorni",
}


@router.get("/editions/{edition_id}/mep-preview")
def preview_mep_for_edition(edition_id: int):
    """Anteprima JSON dei template MEP che verrebbero generati. NON scrive niente."""
    conn = get_foodcost_connection()
    try:
        e = conn.execute("SELECT slug, nome FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")

        rows = conn.execute("""
            SELECT p.id, p.sezione, p.sort_order,
                   COALESCE(p.titolo_override, r.menu_name, '(senza titolo)') as titolo,
                   p.descrizione_variabile,
                   p.is_visible,
                   r.istruzioni_impiattamento as impiatt
            FROM menu_dish_publications p
            LEFT JOIN recipes r ON p.recipe_id = r.id
            WHERE p.edition_id = ? AND p.is_visible = 1
            ORDER BY p.sezione, p.sort_order
        """, (edition_id,)).fetchall()

        # Raggruppa per partita
        partite: Dict[str, List[Dict[str, Any]]] = {}
        for r in rows:
            partita = SEZIONE_TO_PARTITA.get(r["sezione"])
            if not partita:
                continue  # bambini/servizio/degustazioni non hanno mep dedicato
            partite.setdefault(partita, []).append({
                "publication_id": r["id"],
                "titolo": r["titolo"],
                "descrizione_variabile": bool(r["descrizione_variabile"]),
                "istruzioni_impiattamento": r["impiatt"],
            })

        return {
            "edition_id": edition_id,
            "edition_slug": e["slug"],
            "edition_nome": e["nome"],
            "templates_da_generare": [
                {
                    "nome": f"MEP Carta · {partita} · {e['slug']}",
                    "n_item": len(items),
                    "items": items,
                }
                for partita, items in partite.items()
            ],
        }
    finally:
        conn.close()


@router.post("/editions/{edition_id}/generate-mep")
def generate_mep_for_edition(edition_id: int):
    """
    Genera/rigenera i template MEP "carta" per questa edizione in tasks.sqlite3.

    Comportamento:
      - cancella TUTTI i template precedenti il cui nome inizia per
        'MEP Carta · ' e finisce per ' · {edition_slug}' (idempotenza)
      - per ogni partita (Antipasti / Primi / Secondi / Contorni):
        crea 1 template con item CHECKBOX uno per piatto pubblicato
      - tutti i template generati: attivo=0, reparto='cucina', frequenza='GIORNALIERA',
        turno='APERTURA', livello_cucina=NULL, ora_scadenza_entro='11:30'

    Attivazione: lasciata a Marco/chef da Impostazioni Cucina (decisione
    consapevole — non si attivano automaticamente per non duplicare i 5
    template MEP fissi della mig 097 quando ancora attivi).

    Idempotente: rilanciabile senza danni.
    """
    if not TASKS_DB.exists():
        raise HTTPException(503, "tasks.sqlite3 non disponibile (modulo Cucina HACCP non inizializzato)")

    # 1) Carica preview dal foodcost.db
    fc = get_foodcost_connection()
    try:
        e = fc.execute("SELECT slug, nome FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        slug = e["slug"]
        nome_edizione = e["nome"]

        rows = fc.execute("""
            SELECT p.id, p.sezione, p.sort_order,
                   COALESCE(p.titolo_override, r.menu_name, '(senza titolo)') as titolo,
                   p.descrizione_variabile,
                   r.istruzioni_impiattamento as impiatt
            FROM menu_dish_publications p
            LEFT JOIN recipes r ON p.recipe_id = r.id
            WHERE p.edition_id = ? AND p.is_visible = 1
            ORDER BY p.sezione, p.sort_order
        """, (edition_id,)).fetchall()
    finally:
        fc.close()

    # Raggruppa per partita
    partite: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        partita = SEZIONE_TO_PARTITA.get(r["sezione"])
        if not partita:
            continue
        partite.setdefault(partita, []).append({
            "titolo": r["titolo"],
            "descrizione_variabile": bool(r["descrizione_variabile"]),
            "impiatt": r["impiatt"],
        })

    # 2) Apre tasks.sqlite3 e ricrea
    tk = sqlite3.connect(str(TASKS_DB))
    try:
        tk.execute("PRAGMA foreign_keys = ON")
        cur = tk.cursor()

        # Cancella precedenti per questa edizione (cascade su items)
        # Pattern nome: "MEP Carta · {partita} · {slug}"
        like = f"MEP Carta · % · {slug}"
        old = cur.execute(
            "SELECT id, nome FROM checklist_template WHERE nome LIKE ?",
            (like,),
        ).fetchall()
        for o in old:
            cur.execute("DELETE FROM checklist_template WHERE id = ?", (o[0],))

        # Crea nuovi
        creati = []
        for partita, items in partite.items():
            tmpl_nome = f"MEP Carta · {partita} · {slug}"
            cur.execute("""
                INSERT INTO checklist_template
                    (nome, reparto, frequenza, turno, ora_scadenza_entro,
                     attivo, livello_cucina, note, created_by)
                VALUES (?, 'cucina', 'GIORNALIERA', 'APERTURA', '11:30',
                        0, NULL, ?, 'menu_carta_gen')
            """, (
                tmpl_nome,
                f"Generata automaticamente da edizione menu '{nome_edizione}' "
                f"(slug={slug}). Rigenerare con POST /menu-carta/editions/{edition_id}/generate-mep "
                f"dopo modifiche al menu.",
            ))
            tmpl_id = cur.lastrowid

            for ordine, it in enumerate(items):
                title = it["titolo"]
                if it["descrizione_variabile"]:
                    title += " (raccontato a voce — verifica con cuoco capo)"
                elif it["impiatt"]:
                    # tronca a 100 caratteri
                    note_short = (it["impiatt"][:100] + "...") if len(it["impiatt"]) > 100 else it["impiatt"]
                    title += f" — {note_short}"

                cur.execute("""
                    INSERT INTO checklist_item
                        (template_id, ordine, titolo, tipo, obbligatorio)
                    VALUES (?, ?, ?, 'CHECKBOX', 1)
                """, (tmpl_id, ordine, title))

            creati.append({
                "template_id": tmpl_id,
                "nome": tmpl_nome,
                "n_item": len(items),
            })

        tk.commit()

        return {
            "ok": True,
            "edition_id": edition_id,
            "edition_slug": slug,
            "rimossi_precedenti": len(old),
            "creati": creati,
            "nota": (
                "Tutti i template generati hanno attivo=0. Vai in Impostazioni "
                "Cucina -> Template per attivarli (e disattivare gli MEP fissi "
                "della mig 097 se vuoi che siano rimpiazzati)."
            ),
        }
    finally:
        tk.close()


# ═══════════════════════════════════════════════════════════
#   EXPORT PDF (Blocco F, sessione 57) — via mattone M.B PDF brand
# ═══════════════════════════════════════════════════════════

# Etichette stampa per ogni sezione (usate nel template menu_carta.html)
PDF_SEZIONI_ORDER = [
    ("antipasti",          "Antipasti"),
    ("paste_risi_zuppe",   "Paste, Risi e Zuppe"),
    ("piatti_del_giorno",  "Piatti del Giorno"),
    ("secondi",            "Secondi"),
    ("contorni",           "Contorni"),
    ("bambini",            "Bambini"),
    ("servizio",           "Servizio"),
]


def _menu_carta_css() -> str:
    """CSS dedicato del menu carta. Tenuto in sync con il commento di riferimento
    in app/templates/pdf/menu_carta.html (CSS_REFERENCE_START/END)."""
    return """
    .menu-cover { text-align: center; padding: 60px 0 30px; margin-bottom: 30px; }
    .cover-title { font-family: 'Playfair Display', Georgia, serif; font-size: 32pt; font-weight: 700;
                   letter-spacing: 0.02em; color: #111111; margin: 0; }
    .cover-divider { width: 80px; height: 3px; background: #E8402B; margin: 16px auto 18px; }
    .cover-edition { font-family: 'Playfair Display', Georgia, serif; font-size: 18pt; font-weight: 400;
                     font-style: italic; color: #555; margin: 0; }
    .cover-dates { font-size: 9pt; color: #999; margin-top: 6px; }

    .menu-section { page-break-inside: avoid; margin-bottom: 30px; }
    .section-title { font-family: 'Playfair Display', Georgia, serif; font-size: 18pt; font-weight: 400;
                     text-align: center; text-transform: uppercase; letter-spacing: 0.4em;
                     color: #111111; margin: 0 0 18px; padding-bottom: 6px; }
    .dish { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
            padding: 10px 0; border-bottom: 1px solid #f0eeea; page-break-inside: avoid; }
    .dish:last-child { border-bottom: none; }
    .dish-content { flex: 1; min-width: 0; }
    .dish-title { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
                  font-size: 9.5pt; color: #111111; }
    .dish-desc { font-size: 8.5pt; color: #555; margin-top: 3px; line-height: 1.4; }
    .dish-allergens { font-size: 7pt; color: #999; margin-top: 2px; font-style: italic; }
    .dish-price { font-weight: 700; font-size: 11pt; color: #111111; flex-shrink: 0;
                  text-align: right; min-width: 70px; }

    .tasting-card { border: 2px solid #2E7BE8; border-radius: 16px; padding: 24px 28px;
                    margin: 24px 0; page-break-inside: avoid; }
    .tasting-eyebrow { font-size: 8pt; letter-spacing: 0.25em; color: #2E7BE8;
                       font-weight: 700; text-align: center; }
    .tasting-name { font-family: 'Playfair Display', Georgia, serif; font-size: 22pt; font-style: italic;
                    text-align: center; color: #111111; margin: 4px 0 12px; }
    .tasting-sub { font-size: 8.5pt; color: #555; text-align: center; margin: 0 auto 14px;
                   max-width: 360px; line-height: 1.4; }
    .tasting-steps { list-style: none; padding: 0; margin: 0 0 16px; text-align: center; }
    .tasting-steps li { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em;
                        font-weight: 600; color: #111111; padding: 4px 0; }
    .tasting-price { font-size: 26pt; font-weight: 700; text-align: center; color: #2E7BE8;
                     margin: 8px 0; }
    .tasting-note { font-size: 7.5pt; color: #888; text-align: center; font-style: italic;
                    margin: 8px 0 0; line-height: 1.4; }

    .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px;
                   padding-top: 20px; border-top: 1px solid #e0ddd8; page-break-inside: avoid; }
    .footer-title { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.2em;
                    font-weight: 700; color: #111111; margin: 0 0 8px; }
    .footer-meta { font-size: 8pt; color: #999; margin: 0 0 8px; font-style: italic; }
    .footer-line { display: flex; justify-content: space-between; font-size: 9pt; padding: 3px 0; }
    .footer-price { font-weight: 700; }

    .legal-line { margin-top: 24px; text-align: center; font-size: 8pt; color: #888;
                  font-style: italic; border-top: 1px solid #f0eeea; padding-top: 12px; }
    .page-break { page-break-after: always; }
    """


@router.get("/editions/{edition_id}/pdf")
def export_edition_pdf(edition_id: int):
    """Genera PDF stampabile dell'edizione tramite M.B PDF brand."""
    from app.services.pdf_brand import genera_pdf_html

    # Carica dati edizione
    conn = get_foodcost_connection()
    try:
        e = conn.execute("SELECT * FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        edition = _row_to_edition(e)

        # Pubblicazioni con join recipes
        pubs = conn.execute("""
            SELECT p.*, r.menu_name as recipe_menu_name, r.menu_description as recipe_menu_description
            FROM menu_dish_publications p
            LEFT JOIN recipes r ON p.recipe_id = r.id
            WHERE p.edition_id = ? AND p.is_visible = 1
            ORDER BY
              CASE p.sezione
                WHEN 'antipasti' THEN 1
                WHEN 'paste_risi_zuppe' THEN 2
                WHEN 'piatti_del_giorno' THEN 3
                WHEN 'secondi' THEN 4
                WHEN 'contorni' THEN 5
                WHEN 'bambini' THEN 7
                WHEN 'servizio' THEN 8
                ELSE 9 END,
              p.sort_order
        """, (edition_id,)).fetchall()

        sezioni: Dict[str, List[Dict[str, Any]]] = {}
        for r in pubs:
            sezioni.setdefault(r["sezione"], []).append(_row_to_publication(r))

        # Degustazioni con steps
        paths_rows = conn.execute("""
            SELECT * FROM menu_tasting_paths WHERE edition_id = ? AND is_visible = 1
            ORDER BY sort_order, id
        """, (edition_id,)).fetchall()
        tasting = []
        for tp in paths_rows:
            steps = conn.execute("""
                SELECT s.*, p.titolo_override as pub_titolo, r.menu_name as recipe_menu_name
                FROM menu_tasting_path_steps s
                LEFT JOIN menu_dish_publications p ON s.publication_id = p.id
                LEFT JOIN recipes r ON p.recipe_id = r.id
                WHERE s.path_id = ?
                ORDER BY s.sort_order
            """, (tp["id"],)).fetchall()
            tasting.append({
                "nome": tp["nome"], "sottotitolo": tp["sottotitolo"],
                "prezzo_persona": tp["prezzo_persona"], "note": tp["note"],
                "steps": [{
                    "publication_label": s["pub_titolo"] or s["recipe_menu_name"],
                    "titolo_libero": s["titolo_libero"],
                } for s in steps],
            })

        try:
            pdf_bytes = genera_pdf_html(
                template="menu_carta.html",
                dati={
                    "edition": edition,
                    "sezioni": sezioni,
                    "tasting_paths": tasting,
                    "SEZIONI_ORDER": PDF_SEZIONI_ORDER,
                },
                titolo=f"Menu — {edition['nome']}",
                sottotitolo="Osteria Tre Gobbi",
                orientamento="portrait",
                filename=f"menu_carta_{edition['slug']}.pdf",
                css_extra=_menu_carta_css(),
            )
        except Exception as ex:
            raise HTTPException(500, f"Errore generazione PDF: {ex}")

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="menu_carta_{edition["slug"]}.pdf"',
            },
        )
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#   PUBBLICO (no auth)
# ═══════════════════════════════════════════════════════════

@public_router.get("/public/today")
def public_menu_today():
    """Menu attualmente in_carta. NESSUNA AUTH — pensato per app esterne / sito / QR."""
    conn = get_foodcost_connection()
    try:
        e = conn.execute("SELECT * FROM menu_editions WHERE stato = 'in_carta' LIMIT 1").fetchone()
        if not e:
            raise HTTPException(404, "Nessuna edizione in carta")

        edition = _row_to_edition(e)

        pubs = conn.execute("""
            SELECT p.*,
                   r.menu_name as recipe_menu_name,
                   r.menu_description as recipe_menu_description
            FROM menu_dish_publications p
            LEFT JOIN recipes r ON p.recipe_id = r.id
            WHERE p.edition_id = ? AND p.is_visible = 1
            ORDER BY
              CASE p.sezione
                WHEN 'antipasti' THEN 1
                WHEN 'paste_risi_zuppe' THEN 2
                WHEN 'piatti_del_giorno' THEN 3
                WHEN 'secondi' THEN 4
                WHEN 'contorni' THEN 5
                WHEN 'degustazioni' THEN 6
                WHEN 'bambini' THEN 7
                WHEN 'servizio' THEN 8
                ELSE 9 END,
              p.sort_order
        """, (edition["id"],)).fetchall()

        sezioni: Dict[str, List[Dict[str, Any]]] = {}
        for r in pubs:
            sezioni.setdefault(r["sezione"], []).append(_row_to_publication(r))

        paths = conn.execute("""
            SELECT * FROM menu_tasting_paths WHERE edition_id = ? AND is_visible = 1
            ORDER BY sort_order, id
        """, (edition["id"],)).fetchall()
        tasting = []
        for tp in paths:
            steps = conn.execute("""
                SELECT s.*, p.titolo_override as pub_titolo, r.menu_name as recipe_menu_name
                FROM menu_tasting_path_steps s
                LEFT JOIN menu_dish_publications p ON s.publication_id = p.id
                LEFT JOIN recipes r ON p.recipe_id = r.id
                WHERE s.path_id = ?
                ORDER BY s.sort_order
            """, (tp["id"],)).fetchall()
            tasting.append({
                "nome": tp["nome"], "sottotitolo": tp["sottotitolo"],
                "prezzo_persona": tp["prezzo_persona"], "note": tp["note"],
                "steps": [{
                    "label": (s["pub_titolo"] or s["recipe_menu_name"] or s["titolo_libero"])
                } for s in steps],
            })

        return {"edition": edition, "sezioni": sezioni, "tasting_paths": tasting}
    finally:
        conn.close()
