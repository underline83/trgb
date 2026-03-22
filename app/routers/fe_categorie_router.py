# @version: v1.2-sposta-sottocategorie
# -*- coding: utf-8 -*-
"""
Router per gestione categorie fornitori fatture elettroniche.

Categorie a 2 livelli (Cat.1 → Cat.2) + mapping fornitore → categoria.
Tabelle: fe_categorie, fe_sottocategorie, fe_fornitore_categoria
DB: app/data/foodcost.db
"""

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import get_current_user

router = APIRouter(
    prefix="/contabilita/fe/categorie",
    tags=["contabilita-fe-categorie"],
    dependencies=[Depends(get_current_user)],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FOODCOST_DB_PATH = BASE_DIR / "data" / "foodcost.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(FOODCOST_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ─── Pydantic models ───────────────────────────────────────────

class CategoriaIn(BaseModel):
    nome: str

class CategoriaUpdate(BaseModel):
    nome: Optional[str] = None
    ordine: Optional[int] = None
    attiva: Optional[bool] = None

class SottocategoriaIn(BaseModel):
    nome: str

class SottocategoriaUpdate(BaseModel):
    nome: Optional[str] = None
    ordine: Optional[int] = None
    attiva: Optional[bool] = None

class FornitoreAssign(BaseModel):
    fornitore_piva: Optional[str] = None
    fornitore_nome: str
    categoria_id: Optional[int] = None
    sottocategoria_id: Optional[int] = None
    note: Optional[str] = None


class FornitoreEscludi(BaseModel):
    """Marca un fornitore come escluso (auto-fattura, duplicato, ecc.)."""
    fornitore_piva: Optional[str] = None
    fornitore_nome: str
    escluso: bool = True
    motivo_esclusione: Optional[str] = None  # 'auto-fattura', 'duplicato', 'test'
    alias_di: Optional[str] = None  # P.IVA fornitore principale (per merge)


# ─── CATEGORIE (livello 1) ─────────────────────────────────────

@router.get("", summary="Lista tutte le categorie con sottocategorie")
def list_categorie():
    """Ritorna albero completo: categorie → sottocategorie."""
    conn = _get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, nome, ordine, attiva
        FROM fe_categorie
        ORDER BY ordine ASC, nome ASC
    """)
    cats = [dict(r) for r in cur.fetchall()]

    for cat in cats:
        cur.execute("""
            SELECT id, nome, ordine, attiva
            FROM fe_sottocategorie
            WHERE categoria_id = ?
            ORDER BY ordine ASC, nome ASC
        """, (cat["id"],))
        cat["sottocategorie"] = [dict(r) for r in cur.fetchall()]

    conn.close()
    return cats


@router.post("", status_code=status.HTTP_201_CREATED, summary="Crea nuova categoria")
def create_categoria(body: CategoriaIn):
    conn = _get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO fe_categorie (nome, ordine) VALUES (?, (SELECT COALESCE(MAX(ordine),0)+1 FROM fe_categorie))",
            (body.nome.strip().upper(),),
        )
        conn.commit()
        cat_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Categoria '{body.nome}' esiste gia'")
    conn.close()
    return {"id": cat_id, "nome": body.nome.strip().upper()}


@router.put("/{cat_id}", summary="Modifica categoria")
def update_categoria(cat_id: int, body: CategoriaUpdate):
    conn = _get_conn()
    cur = conn.cursor()
    fields = []
    params = []
    if body.nome is not None:
        fields.append("nome = ?")
        params.append(body.nome.strip().upper())
    if body.ordine is not None:
        fields.append("ordine = ?")
        params.append(body.ordine)
    if body.attiva is not None:
        fields.append("attiva = ?")
        params.append(1 if body.attiva else 0)
    if not fields:
        conn.close()
        return {"ok": True}
    params.append(cat_id)
    cur.execute(f"UPDATE fe_categorie SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/{cat_id}", summary="Elimina categoria e relative sottocategorie")
def delete_categoria(cat_id: int):
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM fe_sottocategorie WHERE categoria_id = ?", (cat_id,))
    cur.execute("DELETE FROM fe_categorie WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── SOTTOCATEGORIE (livello 2) ────────────────────────────────

@router.post("/{cat_id}/sotto", status_code=status.HTTP_201_CREATED,
             summary="Aggiungi sottocategoria a una categoria")
def create_sottocategoria(cat_id: int, body: SottocategoriaIn):
    conn = _get_conn()
    cur = conn.cursor()
    # verifica che la categoria esista
    cur.execute("SELECT id FROM fe_categorie WHERE id = ?", (cat_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    try:
        cur.execute(
            "INSERT INTO fe_sottocategorie (categoria_id, nome, ordine) VALUES (?, ?, (SELECT COALESCE(MAX(ordine),0)+1 FROM fe_sottocategorie WHERE categoria_id = ?))",
            (cat_id, body.nome.strip().upper(), cat_id),
        )
        conn.commit()
        sub_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Sottocategoria '{body.nome}' esiste gia' in questa categoria")
    conn.close()
    return {"id": sub_id, "nome": body.nome.strip().upper()}


@router.put("/sotto/{sub_id}", summary="Modifica sottocategoria")
def update_sottocategoria(sub_id: int, body: SottocategoriaUpdate):
    conn = _get_conn()
    cur = conn.cursor()
    fields = []
    params = []
    if body.nome is not None:
        fields.append("nome = ?")
        params.append(body.nome.strip().upper())
    if body.ordine is not None:
        fields.append("ordine = ?")
        params.append(body.ordine)
    if body.attiva is not None:
        fields.append("attiva = ?")
        params.append(1 if body.attiva else 0)
    if not fields:
        conn.close()
        return {"ok": True}
    params.append(sub_id)
    cur.execute(f"UPDATE fe_sottocategorie SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/sotto/{sub_id}", summary="Elimina sottocategoria")
def delete_sottocategoria(sub_id: int):
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM fe_sottocategorie WHERE id = ?", (sub_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


class SpostaSottocategoria(BaseModel):
    new_categoria_id: int

@router.post("/sotto/{sub_id}/sposta", summary="Sposta sottocategoria sotto un'altra categoria")
def sposta_sottocategoria(sub_id: int, body: SpostaSottocategoria):
    """Sposta una sottocategoria sotto un'altra categoria padre.
    Aggiorna tutti i mapping fornitori e prodotti che la usavano."""
    conn = _get_conn()
    cur = conn.cursor()

    # Verifica che la sottocategoria esista
    sub = cur.execute("SELECT id, nome, categoria_id FROM fe_sottocategorie WHERE id = ?", (sub_id,)).fetchone()
    if not sub:
        conn.close()
        raise HTTPException(404, "Sottocategoria non trovata")

    # Verifica che la nuova categoria esista
    new_cat = cur.execute("SELECT id FROM fe_categorie WHERE id = ?", (body.new_categoria_id,)).fetchone()
    if not new_cat:
        conn.close()
        raise HTTPException(404, "Categoria destinazione non trovata")

    old_cat_id = sub["categoria_id"]

    # Sposta la sottocategoria
    cur.execute(
        "UPDATE fe_sottocategorie SET categoria_id = ? WHERE id = ?",
        (body.new_categoria_id, sub_id)
    )

    # Aggiorna mapping fornitori che avevano la vecchia combinazione
    cur.execute(
        "UPDATE fe_fornitore_categoria SET categoria_id = ? "
        "WHERE categoria_id = ? AND sottocategoria_id = ?",
        (body.new_categoria_id, old_cat_id, sub_id)
    )

    # Aggiorna mapping prodotti
    cur.execute(
        "UPDATE fe_prodotto_categoria_map SET categoria_id = ? "
        "WHERE categoria_id = ? AND sottocategoria_id = ?",
        (body.new_categoria_id, old_cat_id, sub_id)
    )

    # Aggiorna righe fatture
    cur.execute(
        "UPDATE fe_righe SET categoria_id = ? "
        "WHERE categoria_id = ? AND sottocategoria_id = ?",
        (body.new_categoria_id, old_cat_id, sub_id)
    )

    conn.commit()
    conn.close()
    return {"ok": True}


# ─── MAPPING FORNITORE → CATEGORIA ─────────────────────────────

@router.get("/fornitori", summary="Lista fornitori con categoria assegnata")
def list_fornitori_categorizzati():
    """
    Ritorna tutti i fornitori unici dalle fatture importate,
    con la categoria eventualmente assegnata.
    """
    conn = _get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            f.fornitore_nome,
            f.fornitore_piva,
            COUNT(*) AS n_fatture,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale_spesa,
            fc.categoria_id,
            fc.sottocategoria_id,
            fc.note AS cat_note,
            c.nome AS categoria_nome,
            s.nome AS sottocategoria_nome,
            COALESCE(fc.escluso, 0) AS escluso,
            fc.motivo_esclusione,
            fc.alias_di,
            MAX(COALESCE(f.is_autofattura, 0)) AS is_autofattura,
            GROUP_CONCAT(DISTINCT f.tipo_documento) AS tipi_documento
        FROM fe_fatture f
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        LEFT JOIN fe_sottocategorie s ON fc.sottocategoria_id = s.id
        GROUP BY f.fornitore_nome, f.fornitore_piva
        ORDER BY totale_spesa DESC
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/fornitori/assegna", summary="Assegna categoria a un fornitore")
def assegna_fornitore(body: FornitoreAssign):
    """Crea o aggiorna il mapping fornitore → categoria/sottocategoria."""
    conn = _get_conn()
    cur = conn.cursor()

    if body.fornitore_piva:
        # Upsert per P.IVA
        cur.execute("SELECT id FROM fe_fornitore_categoria WHERE fornitore_piva = ?",
                     (body.fornitore_piva,))
        existing = cur.fetchone()
        if existing:
            cur.execute("""
                UPDATE fe_fornitore_categoria
                SET categoria_id = ?, sottocategoria_id = ?, note = ?, fornitore_nome = ?
                WHERE fornitore_piva = ?
            """, (body.categoria_id, body.sottocategoria_id, body.note,
                  body.fornitore_nome, body.fornitore_piva))
        else:
            cur.execute("""
                INSERT INTO fe_fornitore_categoria (fornitore_piva, fornitore_nome, categoria_id, sottocategoria_id, note)
                VALUES (?, ?, ?, ?, ?)
            """, (body.fornitore_piva, body.fornitore_nome,
                  body.categoria_id, body.sottocategoria_id, body.note))
    else:
        # Upsert per nome
        cur.execute("SELECT id FROM fe_fornitore_categoria WHERE fornitore_nome = ? AND fornitore_piva IS NULL",
                     (body.fornitore_nome,))
        existing = cur.fetchone()
        if existing:
            cur.execute("""
                UPDATE fe_fornitore_categoria
                SET categoria_id = ?, sottocategoria_id = ?, note = ?
                WHERE id = ?
            """, (body.categoria_id, body.sottocategoria_id, body.note, existing["id"]))
        else:
            cur.execute("""
                INSERT INTO fe_fornitore_categoria (fornitore_piva, fornitore_nome, categoria_id, sottocategoria_id, note)
                VALUES (NULL, ?, ?, ?, ?)
            """, (body.fornitore_nome, body.categoria_id, body.sottocategoria_id, body.note))

    conn.commit()
    conn.close()
    return {"ok": True}


# ─── ESCLUSIONE FORNITORI (auto-fatture, duplicati) ───────────

@router.post("/fornitori/escludi", summary="Marca/smarca un fornitore come escluso")
def escludi_fornitore(body: FornitoreEscludi):
    """
    Marca un fornitore come escluso (auto-fattura = noi stessi, duplicato, test).
    I fornitori esclusi vengono nascosti dalle analisi e dashboard.
    """
    conn = _get_conn()
    cur = conn.cursor()

    if body.fornitore_piva:
        cur.execute("SELECT id FROM fe_fornitore_categoria WHERE fornitore_piva = ?",
                     (body.fornitore_piva,))
        existing = cur.fetchone()
        if existing:
            cur.execute("""
                UPDATE fe_fornitore_categoria
                SET escluso = ?, motivo_esclusione = ?, alias_di = ?
                WHERE fornitore_piva = ?
            """, (1 if body.escluso else 0, body.motivo_esclusione,
                  body.alias_di, body.fornitore_piva))
        else:
            cur.execute("""
                INSERT INTO fe_fornitore_categoria
                (fornitore_piva, fornitore_nome, escluso, motivo_esclusione, alias_di)
                VALUES (?, ?, ?, ?, ?)
            """, (body.fornitore_piva, body.fornitore_nome,
                  1 if body.escluso else 0, body.motivo_esclusione, body.alias_di))
    else:
        cur.execute(
            "SELECT id FROM fe_fornitore_categoria WHERE fornitore_nome = ? AND fornitore_piva IS NULL",
            (body.fornitore_nome,))
        existing = cur.fetchone()
        if existing:
            cur.execute("""
                UPDATE fe_fornitore_categoria
                SET escluso = ?, motivo_esclusione = ?, alias_di = ?
                WHERE id = ?
            """, (1 if body.escluso else 0, body.motivo_esclusione,
                  body.alias_di, existing["id"]))
        else:
            cur.execute("""
                INSERT INTO fe_fornitore_categoria
                (fornitore_piva, fornitore_nome, escluso, motivo_esclusione, alias_di)
                VALUES (NULL, ?, ?, ?, ?)
            """, (body.fornitore_nome, 1 if body.escluso else 0,
                  body.motivo_esclusione, body.alias_di))

    conn.commit()
    conn.close()
    return {"ok": True}


# ─── STATS PER CATEGORIA ───────────────────────────────────────

# ─── CATEGORIZZAZIONE PRODOTTI (per riga fattura) ──────────────

class ProdottoAssign(BaseModel):
    """Assegna categoria a un prodotto (descrizione) di un fornitore."""
    fornitore_piva: Optional[str] = None
    fornitore_nome: str
    descrizione: str
    categoria_id: Optional[int] = None
    sottocategoria_id: Optional[int] = None


def _normalize_desc(desc: str) -> str:
    """Normalizza descrizione per matching: lowercase, strip, collapse spaces."""
    import re
    return re.sub(r"\s+", " ", desc.strip().lower())


@router.get("/fornitori/{fornitore_piva}/prodotti",
            summary="Lista prodotti unici di un fornitore con categoria")
def list_prodotti_fornitore(fornitore_piva: str):
    """
    Ritorna tutti i prodotti unici (descrizioni) acquistati da un fornitore,
    con la categoria assegnata (se presente) e totali qty/spesa.
    """
    conn = _get_conn()
    cur = conn.cursor()

    # Cerca per P.IVA, fallback per nome
    cur.execute("""
        SELECT
            r.descrizione,
            COUNT(*) AS n_righe,
            ROUND(SUM(COALESCE(r.prezzo_totale, 0)), 2) AS totale_spesa,
            ROUND(AVG(COALESCE(r.prezzo_unitario, 0)), 2) AS prezzo_medio,
            SUM(COALESCE(r.quantita, 0)) AS quantita_totale,
            r.unita_misura,
            r.categoria_id,
            r.sottocategoria_id,
            c.nome AS categoria_nome,
            s.nome AS sottocategoria_nome
        FROM fe_righe r
        JOIN fe_fatture f ON r.fattura_id = f.id
        LEFT JOIN fe_categorie c ON r.categoria_id = c.id
        LEFT JOIN fe_sottocategorie s ON r.sottocategoria_id = s.id
        WHERE f.fornitore_piva = ?
          AND r.descrizione IS NOT NULL
          AND r.descrizione != ''
        GROUP BY LOWER(TRIM(r.descrizione))
        ORDER BY totale_spesa DESC
    """, (fornitore_piva,))

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/fornitori/prodotti/assegna",
             summary="Assegna categoria a un prodotto (aggiorna tutte le righe)")
def assegna_prodotto(body: ProdottoAssign):
    """
    Assegna una categoria a tutte le righe fattura che matchano
    la descrizione per questo fornitore. Salva anche il mapping
    per auto-categorizzare import futuri.
    """
    conn = _get_conn()
    cur = conn.cursor()
    desc_norm = _normalize_desc(body.descrizione)

    # 1. Aggiorna tutte le righe esistenti per questo fornitore + descrizione
    cur.execute("""
        UPDATE fe_righe
        SET categoria_id = ?, sottocategoria_id = ?
        WHERE id IN (
            SELECT r.id FROM fe_righe r
            JOIN fe_fatture f ON r.fattura_id = f.id
            WHERE f.fornitore_piva = ?
              AND LOWER(TRIM(r.descrizione)) = ?
        )
    """, (body.categoria_id, body.sottocategoria_id,
          body.fornitore_piva, desc_norm))

    # 2. Salva/aggiorna il mapping per futuri import
    cur.execute("""
        SELECT id FROM fe_prodotto_categoria_map
        WHERE fornitore_piva = ? AND descrizione_norm = ?
    """, (body.fornitore_piva, desc_norm))
    existing = cur.fetchone()

    if existing:
        cur.execute("""
            UPDATE fe_prodotto_categoria_map
            SET categoria_id = ?, sottocategoria_id = ?
            WHERE id = ?
        """, (body.categoria_id, body.sottocategoria_id, existing["id"]))
    else:
        cur.execute("""
            INSERT INTO fe_prodotto_categoria_map
            (fornitore_piva, fornitore_nome, descrizione_norm, categoria_id, sottocategoria_id)
            VALUES (?, ?, ?, ?, ?)
        """, (body.fornitore_piva, body.fornitore_nome, desc_norm,
              body.categoria_id, body.sottocategoria_id))

    n_updated = cur.execute("SELECT changes()").fetchone()[0]
    conn.commit()
    conn.close()
    return {"ok": True, "righe_aggiornate": n_updated}


@router.get("/fornitori/{fornitore_piva}/stats",
            summary="Riepilogo prodotti per categoria di un fornitore")
def stats_fornitore(fornitore_piva: str):
    """Breakdown spesa per categoria dentro un singolo fornitore."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            COALESCE(c.nome, '(Non categorizzato)') AS categoria,
            COALESCE(s.nome, '') AS sottocategoria,
            COUNT(*) AS n_righe,
            ROUND(SUM(COALESCE(r.prezzo_totale, 0)), 2) AS totale_spesa
        FROM fe_righe r
        JOIN fe_fatture f ON r.fattura_id = f.id
        LEFT JOIN fe_categorie c ON r.categoria_id = c.id
        LEFT JOIN fe_sottocategorie s ON r.sottocategoria_id = s.id
        WHERE f.fornitore_piva = ?
          AND r.descrizione IS NOT NULL
        GROUP BY c.nome, s.nome
        ORDER BY totale_spesa DESC
    """, (fornitore_piva,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ─── STATS GLOBALI ──────────────────────────────────────────────

@router.get("/stats", summary="Riepilogo spesa per categoria")
def stats_per_categoria(year: Optional[int] = None):
    """Totale spesa raggruppato per Cat.1 e Cat.2."""
    conn = _get_conn()
    cur = conn.cursor()

    where = "WHERE f.data_fattura IS NOT NULL AND COALESCE(fc.escluso, 0) = 0 AND COALESCE(f.is_autofattura, 0) = 0"
    params = []
    if year:
        where += " AND substr(f.data_fattura, 1, 4) = ?"
        params.append(str(year))

    cur.execute(f"""
        SELECT
            COALESCE(c.nome, '(Non categorizzato)') AS categoria,
            COALESCE(s.nome, '') AS sottocategoria,
            COUNT(*) AS n_fatture,
            ROUND(SUM(COALESCE(f.totale_fattura, 0)), 2) AS totale_spesa
        FROM fe_fatture f
        LEFT JOIN fe_fornitore_categoria fc
            ON (f.fornitore_piva IS NOT NULL AND f.fornitore_piva = fc.fornitore_piva)
            OR (f.fornitore_piva IS NULL AND f.fornitore_nome = fc.fornitore_nome)
        LEFT JOIN fe_categorie c ON fc.categoria_id = c.id
        LEFT JOIN fe_sottocategorie s ON fc.sottocategoria_id = s.id
        {where}
        GROUP BY c.nome, s.nome
        ORDER BY totale_spesa DESC
    """, params)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows
