#!/usr/bin/env python3
# @version: v1.2-sezione-dolci (2026-07-19) — nuova sezione 'dolci' [core]
# @version: v1.1-menu-carta-router-foto (Modulo D, 2026-04-27)
# -*- coding: utf-8 -*-

"""
Router Menu Carta — sessione 57 (2026-04-25), v1.1 Modulo D foto piatto (2026-04-27)

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
  POST   /menu-carta/publications/{id}/foto       upload foto (multipart, Modulo D)
  DELETE /menu-carta/publications/{id}/foto       rimuovi foto (Modulo D)

  ── DEGUSTAZIONI ──
  GET    /menu-carta/tasting-paths/?edition_id=X  lista con steps
  POST   /menu-carta/tasting-paths/               crea (con steps)
  PUT    /menu-carta/tasting-paths/{id}           modifica (replace steps)
  DELETE /menu-carta/tasting-paths/{id}           elimina

  ── TRADUZIONI (i18n, mig 163) ──
  GET    /menu-carta/translations/?edition_id=X&lang=en   righe IT + traduzione
  PUT    /menu-carta/translations/                        upsert massivo
  GET    /menu-carta/translations/coverage/?edition_id=X  copertura per lingua

  ── PUBBLICO ──
  GET    /menu-carta/public/today[?lang=en]       menu attualmente in_carta (no auth)
"""

from datetime import datetime
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field

from app.models.cucina_db import get_cucina_connection
from app.services.auth_service import get_current_user
from app.utils.locale_strings import t as t_  # R5: t() helper per stringhe locale-aware
from app.services.menu_carta_image_service import (
    save_publication_image,
    delete_publication_image,
)
from app.services import menu_i18n_service as i18n  # motore traduzioni [core], mig 163


# Path al DB tasks.sqlite3 (modulo Cucina HACCP) — usato dal generatore MEP
# R6.5 — path tenant-aware.
from app.utils.locale_data import locale_data_path
TASKS_DB = locale_data_path("tasks.sqlite3")


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
    "secondi", "contorni", "dolci", "degustazioni", "bambini", "servizio",
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
        # Modulo C: allergeni della ricetta collegata (suggerimento, non vincolo)
        "recipe_allergeni_calcolati": r["recipe_allergeni_calcolati"] if "recipe_allergeni_calcolati" in r.keys() else None,
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

    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
    try:
        e = conn.execute("SELECT * FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        edition = _row_to_edition(e)

        # Pubblicazioni con join recipes per fallback nome/descrizione/allergeni
        pubs = conn.execute("""
            SELECT p.*,
                   r.menu_name as recipe_menu_name,
                   r.menu_description as recipe_menu_description,
                   r.allergeni_calcolati as recipe_allergeni_calcolati
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
                WHEN 'dolci' THEN 6
                WHEN 'degustazioni' THEN 7
                WHEN 'bambini' THEN 8
                WHEN 'servizio' THEN 9
                ELSE 10 END,
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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

    conn = get_cucina_connection()
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
        path_id_map: Dict[int, int] = {}
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
            path_id_map[tp["id"]] = new_path_id
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

        # clona le traduzioni seguendo le mappe di id.
        # Senza questo, clonare Estate->Autunno perderebbe tutte le traduzioni
        # anche dei piatti riportati identici: 6 lingue da riscrivere a ogni
        # cambio di carta. Le righe clonate mantengono `rivisto` — erano gia'
        # state approvate su un testo italiano identico, che il clone copia.
        trad_clonate = 0
        for entita, id_map in (("publication", pub_id_map), ("tasting_path", path_id_map)):
            for old_id, new_pub_id in id_map.items():
                for t in conn.execute("""
                    SELECT lang, campo, valore, rivisto FROM menu_translations
                    WHERE entita = ? AND entita_id = ?
                """, (entita, old_id)).fetchall():
                    conn.execute("""
                        INSERT INTO menu_translations
                            (entita, entita_id, lang, campo, valore, rivisto)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT (entita, entita_id, lang, campo) DO NOTHING
                    """, (entita, new_pub_id, t["lang"], t["campo"], t["valore"], t["rivisto"]))
                    trad_clonate += 1

        conn.commit()
        return {
            "id": new_id, "nome": nome, "stato": "bozza",
            "publications_clonate": len(pubs),
            "traduzioni_clonate": trad_clonate,
        }
    finally:
        conn.close()


@router.post("/editions/{edition_id}/archive")
def archive_edition(edition_id: int):
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
    try:
        e = conn.execute("SELECT id, stato, nome FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not e:
            raise HTTPException(404, "Edizione non trovata")
        if e["stato"] != "bozza":
            raise HTTPException(400, f"Si possono eliminare solo le edizioni in bozza (questa è '{e['stato']}')")

        # i18n: cleanup orfani PRIMA del cascade, finche' le righe figlie
        # esistono ancora e si sa quali id appartenevano a questa edizione.
        conn.execute("""
            DELETE FROM menu_translations
            WHERE entita = 'publication' AND entita_id IN (
                SELECT id FROM menu_dish_publications WHERE edition_id = ?
            )
        """, (edition_id,))
        conn.execute("""
            DELETE FROM menu_translations
            WHERE entita = 'tasting_path' AND entita_id IN (
                SELECT id FROM menu_tasting_paths WHERE edition_id = ?
            )
        """, (edition_id,))
        conn.execute(
            "DELETE FROM menu_translations WHERE entita = 'edition' AND entita_id = ?",
            (edition_id,),
        )

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
    conn = get_cucina_connection()
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

    conn = get_cucina_connection()
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

    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
    try:
        # Recupera edition_id per cleanup foto
        ex = conn.execute(
            "SELECT id, edition_id, foto_path FROM menu_dish_publications WHERE id = ?",
            (pub_id,),
        ).fetchone()
        if not ex:
            raise HTTPException(404, "Pubblicazione non trovata")
        # Modulo D: cleanup foto orfana se presente
        if ex["foto_path"]:
            try:
                delete_publication_image(ex["edition_id"], pub_id)
            except Exception as e:
                import logging
                logging.getLogger("menu_carta").warning(f"[foto] cleanup fail pub={pub_id}: {e}")
        conn.execute("DELETE FROM menu_dish_publications WHERE id = ?", (pub_id,))
        # i18n: `menu_translations.entita_id` e' polimorfico, quindi non puo'
        # avere una FK e non lo raggiunge il cascade. Senza questa riga gli id
        # riciclati da AUTOINCREMENT si porterebbero dietro le traduzioni di un
        # piatto morto.
        conn.execute(
            "DELETE FROM menu_translations WHERE entita = 'publication' AND entita_id = ?",
            (pub_id,),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ─────────────────────────────────────────────
#   FOTO PIATTO (Modulo D, 2026-04-27)
# ─────────────────────────────────────────────

@router.post("/publications/{pub_id}/foto")
async def upload_publication_foto(pub_id: int, file: UploadFile = File(...)):
    """
    Upload foto piatto per una pubblicazione.

    Multipart/form-data, campo 'file'. Formati: JPG/JPEG/PNG/WEBP.
    L'immagine viene ridimensionata a max 1200x800 (aspect ratio preserved),
    convertita in JPEG quality 85, salvata in static/menu_carta/<edition>/<pub>.jpg.
    Il path relativo viene scritto in menu_dish_publications.foto_path.

    Rimpiazza eventuale foto esistente (overwrite).
    """
    conn = get_cucina_connection()
    try:
        pub = conn.execute(
            "SELECT id, edition_id FROM menu_dish_publications WHERE id = ?",
            (pub_id,),
        ).fetchone()
        if not pub:
            raise HTTPException(404, "Pubblicazione non trovata")

        try:
            file_bytes = await file.read()
        except Exception as e:
            raise HTTPException(400, f"Lettura file fallita: {e}")

        try:
            rel_path = save_publication_image(
                edition_id=pub["edition_id"],
                pub_id=pub_id,
                file_bytes=file_bytes,
                original_filename=file.filename,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            raise HTTPException(500, f"Errore salvataggio immagine: {e}")

        conn.execute(
            "UPDATE menu_dish_publications SET foto_path = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (rel_path, pub_id),
        )
        conn.commit()
        return {"ok": True, "foto_path": rel_path}
    finally:
        conn.close()


@router.delete("/publications/{pub_id}/foto")
def delete_publication_foto(pub_id: int):
    """Rimuove la foto di una pubblicazione (file su disco + foto_path NULL)."""
    conn = get_cucina_connection()
    try:
        pub = conn.execute(
            "SELECT id, edition_id, foto_path FROM menu_dish_publications WHERE id = ?",
            (pub_id,),
        ).fetchone()
        if not pub:
            raise HTTPException(404, "Pubblicazione non trovata")
        if not pub["foto_path"]:
            return {"ok": True, "had_foto": False}

        try:
            delete_publication_image(pub["edition_id"], pub_id)
        except Exception as e:
            import logging
            logging.getLogger("menu_carta").warning(f"[foto] delete file fail pub={pub_id}: {e}")
            # Continuiamo comunque con NULL DB anche se il file non si cancella

        conn.execute(
            "UPDATE menu_dish_publications SET foto_path = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (pub_id,),
        )
        conn.commit()
        return {"ok": True, "had_foto": True}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#   DEGUSTAZIONI
# ═══════════════════════════════════════════════════════════

@router.get("/tasting-paths/")
def list_tasting_paths(edition_id: int = Query(...)):
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
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
    conn = get_cucina_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_tasting_paths WHERE id = ?", (path_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Degustazione non trovata")
        conn.execute("DELETE FROM menu_tasting_paths WHERE id = ?", (path_id,))
        # i18n: cleanup orfani (nessuna FK possibile su entita_id polimorfico)
        conn.execute(
            "DELETE FROM menu_translations WHERE entita = 'tasting_path' AND entita_id = ?",
            (path_id,),
        )
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
    "dolci":             "Dolci",
}


@router.get("/editions/{edition_id}/mep-preview")
def preview_mep_for_edition(edition_id: int):
    """Anteprima JSON dei template MEP che verrebbero generati. NON scrive niente."""
    conn = get_cucina_connection()
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
    fc = get_cucina_connection()
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
    ("dolci",              "Dolci"),
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
    conn = get_cucina_connection()
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
                # R5: sottotitolo letto da locali/<locale>/strings.json key pdf.subtitle_menu
                sottotitolo=t_("pdf.subtitle_menu", "TRGB"),
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
#   TRADUZIONI (i18n) — [core], mig 163
# ═══════════════════════════════════════════════════════════

def _righe_traducibili(conn, edition_id: int) -> List[Dict[str, Any]]:
    """
    Elenco dei campi traducibili dell'edizione, con l'originale italiano.

    E' la SORGENTE DI VERITA' sia per il tab Traduzioni sia per il calcolo di
    copertura: un campo il cui italiano e' vuoto non entra qui, quindi non
    finisce nel denominatore. Altrimenti la copertura non arriverebbe mai al
    100% per colpa di descrizioni che in italiano non esistono.
    """
    righe: List[Dict[str, Any]] = []

    pubs = conn.execute("""
        SELECT p.id, p.sezione, p.sort_order, p.updated_at,
               p.titolo_override, p.descrizione_override, p.prezzo_label,
               r.menu_name AS recipe_menu_name,
               r.menu_description AS recipe_menu_description
        FROM menu_dish_publications p
        LEFT JOIN recipes r ON p.recipe_id = r.id
        WHERE p.edition_id = ?
        ORDER BY
          CASE p.sezione
            WHEN 'antipasti' THEN 1 WHEN 'paste_risi_zuppe' THEN 2
            WHEN 'piatti_del_giorno' THEN 3 WHEN 'secondi' THEN 4
            WHEN 'contorni' THEN 5 WHEN 'dolci' THEN 6
            WHEN 'degustazioni' THEN 7 WHEN 'bambini' THEN 8
            WHEN 'servizio' THEN 9 ELSE 10 END,
          p.sort_order
    """, (edition_id,)).fetchall()

    for p in pubs:
        originali = {
            # Stesso fallback della carta: quello che l'ospite legge in
            # italiano e' quello che il traduttore deve avere davanti.
            "titolo": p["titolo_override"] or p["recipe_menu_name"],
            "descrizione": p["descrizione_override"] or p["recipe_menu_description"],
            "prezzo_label": p["prezzo_label"],
        }
        for campo, italiano in originali.items():
            if italiano and str(italiano).strip():
                righe.append({
                    "entita": "publication", "entita_id": p["id"], "campo": campo,
                    "italiano": italiano, "sezione": p["sezione"],
                    "sort_order": p["sort_order"],
                    "italiano_updated_at": p["updated_at"],
                })

    paths = conn.execute("""
        SELECT id, nome, sottotitolo, note, sort_order, updated_at
        FROM menu_tasting_paths WHERE edition_id = ? ORDER BY sort_order, id
    """, (edition_id,)).fetchall()

    for tp in paths:
        # `nome` non e' in lista di proposito: resta italiano come firma della
        # casa (decisione 2026-08-07). Se un giorno cambia idea, basta
        # aggiungerlo qui e in CAMPI_PER_ENTITA.
        for campo, italiano in (("sottotitolo", tp["sottotitolo"]), ("note", tp["note"])):
            if italiano and str(italiano).strip():
                righe.append({
                    "entita": "tasting_path", "entita_id": tp["id"], "campo": campo,
                    "italiano": italiano, "sezione": "degustazioni",
                    "sort_order": tp["sort_order"],
                    "italiano_updated_at": tp["updated_at"],
                    "contesto": tp["nome"],
                })

    return righe


@router.get("/translations/")
def list_translations(
    edition_id: int = Query(...),
    lang: str = Query(...),
):
    """
    Righe traducibili dell'edizione con l'originale italiano e la traduzione
    corrente, per il tab Traduzioni del backoffice.

    `stale = True` quando l'italiano e' stato modificato DOPO l'ultima
    traduzione: e' la riga che Marco deve rileggere, perche' la traduzione
    ora descrive un piatto che non esiste piu' in quella forma.
    """
    lang = i18n.normalizza_lang(lang)
    if lang == i18n.LINGUA_MADRE:
        raise HTTPException(400, "L'italiano e' la lingua madre: si modifica dal menu, non dalle traduzioni")

    conn = get_cucina_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Edizione non trovata")

        righe = _righe_traducibili(conn, edition_id)

        esistenti: Dict[tuple, Any] = {}
        for entita in i18n.ENTITA_VALIDE:
            ids = [r["entita_id"] for r in righe if r["entita"] == entita]
            if not ids:
                continue
            place = ",".join("?" * len(ids))
            for t in conn.execute(f"""
                SELECT entita_id, campo, valore, rivisto, updated_at
                FROM menu_translations
                WHERE entita = ? AND lang = ? AND entita_id IN ({place})
            """, [entita, lang, *ids]).fetchall():
                esistenti[(entita, t["entita_id"], t["campo"])] = t

        out = []
        for r in righe:
            t = esistenti.get((r["entita"], r["entita_id"], r["campo"]))
            trad_at = t["updated_at"] if t else None
            it_at = r.get("italiano_updated_at")
            out.append({
                **r,
                "lang": lang,
                "valore": t["valore"] if t else None,
                "rivisto": bool(t["rivisto"]) if t else False,
                "updated_at": trad_at,
                "stale": bool(t and it_at and trad_at and str(it_at) > str(trad_at)),
            })

        return {
            "edition_id": edition_id,
            "lang": lang,
            "lingue": list(i18n.LINGUE_TRADOTTE),
            "righe": out,
        }
    finally:
        conn.close()


class TranslationRowIn(BaseModel):
    entita: str
    entita_id: int
    lang: str
    campo: str
    valore: Optional[str] = None      # vuoto/None = cancella, torna al fallback IT
    rivisto: bool = False


class TranslationsBulkIn(BaseModel):
    righe: List[TranslationRowIn]


@router.put("/translations/")
def upsert_translations(payload: TranslationsBulkIn):
    """
    Upsert massivo: il tab Traduzioni salva tutta la lingua in un colpo.

    Righe con `valore` vuoto vengono CANCELLATE (torna il fallback italiano),
    non salvate come stringa vuota — una riga vuota sarebbe un buco in carta.
    """
    conn = get_cucina_connection()
    try:
        esito = i18n.upsert(conn, [r.model_dump() for r in payload.righe])
        return {"ok": True, **esito}
    finally:
        conn.close()


@router.get("/translations/coverage/")
def translations_coverage(edition_id: int = Query(...)):
    """
    Copertura per lingua sull'edizione: quante righe traducibili hanno una
    traduzione, e quante di queste sono state approvate da un umano.

    Denominatore = campi con originale italiano non vuoto (vedi
    `_righe_traducibili`).
    """
    conn = get_cucina_connection()
    try:
        ex = conn.execute("SELECT id FROM menu_editions WHERE id = ?", (edition_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "Edizione non trovata")

        righe = _righe_traducibili(conn, edition_id)
        totale = len(righe)
        chiavi = {(r["entita"], r["entita_id"], r["campo"]) for r in righe}

        out: Dict[str, Any] = {}
        for lang in i18n.LINGUE_TRADOTTE:
            tradotte = riviste = 0
            for t in conn.execute("""
                SELECT entita, entita_id, campo, rivisto, valore
                FROM menu_translations WHERE lang = ?
            """, (lang,)).fetchall():
                # Filtro in Python e non in SQL perche' la chiave e'
                # polimorfica su 3 colonne: un IN su tuple non e' esprimibile
                # in modo portabile, e i volumi sono da menu, non da log.
                if (t["entita"], t["entita_id"], t["campo"]) not in chiavi:
                    continue
                if not (t["valore"] or "").strip():
                    continue
                tradotte += 1
                if t["rivisto"]:
                    riviste += 1
            out[lang] = {
                "tradotte": tradotte,
                "riviste": riviste,
                "totale": totale,
                "percentuale": round(100 * tradotte / totale) if totale else 0,
            }

        return {"edition_id": edition_id, "totale_campi": totale, "lingue": out}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════
#   PUBBLICO (no auth)
# ═══════════════════════════════════════════════════════════

@public_router.get("/public/today")
def public_menu_today(lang: Optional[str] = Query(None, description="it|en|fr|es|de|uk — default it")):
    """
    Menu attualmente in_carta. NESSUNA AUTH — pensato per app esterne / sito / QR.

    Multilingua (2026-08-07). `?lang=` accetta le lingue a sistema; qualsiasi
    altro valore, o l'assenza del parametro, vale italiano — un QR stampato con
    un lang sbagliato deve dare il menu, non un 400 a un ospite seduto.

    RETROCOMPATIBILITA': la forma della risposta non cambia. Le traduzioni
    vengono scritte dentro i campi originali (`titolo_override`,
    `descrizione_override`, ...), non in campi paralleli: un client che non sa
    nulla di lingue continua a vedere esattamente quello che vedeva prima.
    Gli unici campi NUOVI sono `lang` e `lingue_disponibili` in testa.
    """
    lang = i18n.normalizza_lang(lang)
    conn = get_cucina_connection()
    try:
        e = conn.execute("SELECT * FROM menu_editions WHERE stato = 'in_carta' LIMIT 1").fetchone()
        if not e:
            raise HTTPException(404, "Nessuna edizione in carta")

        edition = _row_to_edition(e)

        pubs = conn.execute("""
            SELECT p.*,
                   r.menu_name as recipe_menu_name,
                   r.menu_description as recipe_menu_description,
                   r.allergeni_calcolati as recipe_allergeni_calcolati
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
                WHEN 'dolci' THEN 6
                WHEN 'degustazioni' THEN 7
                WHEN 'bambini' THEN 8
                WHEN 'servizio' THEN 9
                ELSE 10 END,
              p.sort_order
        """, (edition["id"],)).fetchall()

        # ── i18n: due query sole per tutta la pagina, mai una per riga ──
        trad_pub = i18n.traduci(conn, "publication", [r["id"] for r in pubs], lang)

        sezioni: Dict[str, List[Dict[str, Any]]] = {}
        for r in pubs:
            pub = _row_to_publication(r)
            # La traduzione entra nel campo *_override: e' esattamente il suo
            # ruolo semantico ("il testo da mostrare invece di quello della
            # ricetta"). Se la traduzione manca, l'override resta l'italiano;
            # se anche quello e' NULL, il client cade su recipe_menu_name come
            # ha sempre fatto. Fallback a cascata senza toccare il client.
            i18n.applica_riga(pub, trad_pub, {
                "titolo": "titolo_override",
                "descrizione": "descrizione_override",
                "prezzo_label": "prezzo_label",
            })
            sezioni.setdefault(r["sezione"], []).append(pub)

        paths = conn.execute("""
            SELECT * FROM menu_tasting_paths WHERE edition_id = ? AND is_visible = 1
            ORDER BY sort_order, id
        """, (edition["id"],)).fetchall()
        trad_path = i18n.traduci(conn, "tasting_path", [p["id"] for p in paths], lang)

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
                # `nome` resta SEMPRE italiano: e' la firma della casa
                # ("Fidati dell'oste"), non contenuto da tradurre. Deciso con
                # Marco il 2026-08-07. Il sottotitolo, che e' discorsivo e
                # spiega il percorso, viene tradotto e fa il lavoro.
                "nome": tp["nome"],
                "sottotitolo": i18n.applica(trad_path, tp["id"], "sottotitolo", tp["sottotitolo"]),
                "prezzo_persona": tp["prezzo_persona"],
                "note": i18n.applica(trad_path, tp["id"], "note", tp["note"]),
                "steps": [{
                    # Lo step eredita il titolo tradotto della publication a
                    # cui punta: altrimenti la degustazione elencherebbe in
                    # italiano piatti che due righe sopra sono in inglese.
                    "label": (
                        i18n.applica(trad_pub, s["publication_id"], "titolo", s["pub_titolo"])
                        or s["recipe_menu_name"]
                        or s["titolo_libero"]
                    )
                } for s in steps],
            })

        return {
            "lang": lang,
            "lingue_disponibili": list(i18n.LINGUE),
            "edition": edition,
            "sezioni": sezioni,
            "tasting_paths": tasting,
        }
    finally:
        conn.close()
