# @version: v1.1-fase3-export
# -*- coding: utf-8 -*-
"""
Router Carta Bevande — TRGB Gestionale (sub-modulo Vini)

Gestisce le sezioni "statiche" della Carta delle Bevande:
Aperitivi, Birre, Amari fatti in casa, Amari & Liquori,
Distillati, Tisane, Tè.

La sezione logica 'vini' NON ha voci qui: i dati restano in fe_magazzino_vini
e il renderer della carta completa delega a carta_vini_service.

Permessi:
- admin / superadmin / sommelier → scrittura + lettura
- sala / chef / altri             → solo lettura (utile per anteprima staff)
- viewer                          → 403 (nessun accesso)

Changelog:
- v1.1 (Fase 3): endpoint export /bevande/carta, /bevande/carta/pdf, /pdf-staff,
                  /docx, /bevande/sezioni/{key}/preview.
- v1.0 (Fase 1): CRUD sezioni + voci + reorder + bulk-import.

Riferimento design: docs/carta_bevande_design.md
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
from weasyprint import HTML, CSS

from app.models.bevande_db import (
    count_voci_by_sezione,
    get_bevande_conn,
    get_sezione_by_key,
    init_bevande_db,
    list_sezioni,
)
from app.services.auth_service import get_current_user
from app.services.carta_bevande_service import (
    build_carta_bevande_docx,
    build_carta_bevande_html,
    build_copertina_html,
    build_section_html,
    build_toc_html,
    get_version_string,
    _load_voci_attive,
)


router = APIRouter(
    prefix="/bevande",
    tags=["Carta Bevande"],
    dependencies=[Depends(get_current_user)],
)

# ─────────────────────────────────────────────
# PATH COSTANTI (riuso degli stessi asset del router vini)
# ─────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
CSS_HTML = STATIC_DIR / "css" / "carta_html.css"
CSS_PDF = STATIC_DIR / "css" / "carta_pdf.css"
LOGO_PATH = STATIC_DIR / "img" / "logo_tregobbi.png"

# ─────────────────────────────────────────────
# PERMESSI
# ─────────────────────────────────────────────

_ROLES_EDITOR = {"admin", "superadmin", "sommelier"}
_ROLES_VIEWER_BLOCK = {"viewer"}


def _require_editor(user: dict) -> None:
    role = (user or {}).get("role") or ""
    if role not in _ROLES_EDITOR:
        raise HTTPException(403, "Permesso negato: solo admin/sommelier possono modificare la carta bevande.")


def _require_reader(user: dict) -> None:
    role = (user or {}).get("role") or ""
    if role in _ROLES_VIEWER_BLOCK:
        raise HTTPException(403, "Permesso negato.")


# ─────────────────────────────────────────────
# UTILITY
# ─────────────────────────────────────────────

def _ensure_db() -> None:
    """Safety net: garantisce che il DB bevande sia inizializzato anche se la
    migration 089 non è ancora stata applicata in dev. Idempotente."""
    init_bevande_db()


def _row_to_dict(row) -> dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    # Parse JSON fields
    for field in ("schema_form", "tags", "extra"):
        if field in d and d[field]:
            try:
                d[field] = json.loads(d[field])
            except (TypeError, ValueError):
                pass
    return d


def _sezione_exists(key: str) -> bool:
    return get_sezione_by_key(key) is not None


# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────

class SezioneUpdate(BaseModel):
    nome: Optional[str] = None
    intro_html: Optional[str] = None
    ordine: Optional[int] = None
    attivo: Optional[int] = Field(None, ge=0, le=1)
    layout: Optional[str] = None
    schema_form: Optional[dict] = None


class SezioneReorderItem(BaseModel):
    key: str
    ordine: int


class VoceBase(BaseModel):
    sezione_key: str
    nome: str
    sottotitolo: Optional[str] = None
    descrizione: Optional[str] = None
    produttore: Optional[str] = None
    regione: Optional[str] = None
    formato: Optional[str] = None
    gradazione: Optional[float] = None
    ibu: Optional[int] = None
    tipologia: Optional[str] = None
    paese_origine: Optional[str] = None
    prezzo_eur: Optional[float] = None
    prezzo_label: Optional[str] = None
    tags: Optional[list[str]] = None
    extra: Optional[dict] = None
    ordine: Optional[int] = 100
    attivo: Optional[int] = Field(1, ge=0, le=1)
    note_interne: Optional[str] = None


class VoceUpdate(BaseModel):
    # Tutti opzionali: PATCH-like su PUT
    nome: Optional[str] = None
    sottotitolo: Optional[str] = None
    descrizione: Optional[str] = None
    produttore: Optional[str] = None
    regione: Optional[str] = None
    formato: Optional[str] = None
    gradazione: Optional[float] = None
    ibu: Optional[int] = None
    tipologia: Optional[str] = None
    paese_origine: Optional[str] = None
    prezzo_eur: Optional[float] = None
    prezzo_label: Optional[str] = None
    tags: Optional[list[str]] = None
    extra: Optional[dict] = None
    ordine: Optional[int] = None
    attivo: Optional[int] = Field(None, ge=0, le=1)
    note_interne: Optional[str] = None


class VociReorder(BaseModel):
    sezione_key: str
    order: list[int]  # lista di ID in nuovo ordine


class BulkImportRow(BaseModel):
    nome: str
    sottotitolo: Optional[str] = None
    descrizione: Optional[str] = None
    produttore: Optional[str] = None
    regione: Optional[str] = None
    formato: Optional[str] = None
    gradazione: Optional[float] = None
    ibu: Optional[int] = None
    tipologia: Optional[str] = None
    paese_origine: Optional[str] = None
    prezzo_eur: Optional[float] = None
    prezzo_label: Optional[str] = None


class BulkImport(BaseModel):
    sezione_key: str
    rows: list[BulkImportRow]


# ─────────────────────────────────────────────
# SEZIONI
# ─────────────────────────────────────────────

@router.get("/sezioni/")
def get_sezioni(
    only_active: bool = Query(False, description="Filtra solo sezioni attive"),
    user: dict = Depends(get_current_user),
):
    """Lista sezioni ordinate. Include conteggio voci totali e attive per sezione."""
    _require_reader(user)
    _ensure_db()
    sezioni = [_row_to_dict(s) for s in list_sezioni(only_active=only_active)]
    counts = count_voci_by_sezione()
    for s in sezioni:
        c = counts.get(s["key"], {"totale": 0, "attive": 0})
        s["voci_totale"] = c["totale"]
        s["voci_attive"] = c["attive"]
    return sezioni


@router.get("/sezioni/{key}")
def get_sezione(key: str, user: dict = Depends(get_current_user)):
    """Dettaglio sezione + schema_form (per l'editor)."""
    _require_reader(user)
    _ensure_db()
    row = get_sezione_by_key(key)
    if not row:
        raise HTTPException(404, f"Sezione '{key}' non trovata")
    return _row_to_dict(row)


@router.put("/sezioni/{key}")
def update_sezione(key: str, patch: SezioneUpdate, user: dict = Depends(get_current_user)):
    """Aggiorna nome/intro_html/ordine/attivo/layout/schema_form di una sezione esistente."""
    _require_editor(user)
    _ensure_db()
    if not _sezione_exists(key):
        raise HTTPException(404, f"Sezione '{key}' non trovata")

    fields = patch.model_dump(exclude_unset=True)
    if not fields:
        return {"status": "noop"}

    # schema_form → JSON
    if "schema_form" in fields and fields["schema_form"] is not None:
        fields["schema_form"] = json.dumps(fields["schema_form"], ensure_ascii=False)

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [key]

    conn = get_bevande_conn()
    try:
        conn.execute(
            f"UPDATE bevande_sezioni SET {set_clause}, updated_at = datetime('now','localtime') WHERE key = ?",
            values,
        )
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "key": key}


@router.post("/sezioni/reorder")
def reorder_sezioni(items: list[SezioneReorderItem], user: dict = Depends(get_current_user)):
    """Riordino batch: body = [{'key':'aperitivi','ordine':10}, …]."""
    _require_editor(user)
    _ensure_db()
    if not items:
        return {"status": "noop"}

    conn = get_bevande_conn()
    try:
        cur = conn.cursor()
        for it in items:
            cur.execute(
                "UPDATE bevande_sezioni SET ordine = ?, updated_at = datetime('now','localtime') WHERE key = ?",
                (it.ordine, it.key),
            )
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "count": len(items)}


# ─────────────────────────────────────────────
# VOCI — LIST / GET
# ─────────────────────────────────────────────

@router.get("/voci/")
def list_voci(
    sezione: Optional[str] = Query(None, description="Filtro per sezione_key"),
    attivo: Optional[int] = Query(None, ge=0, le=1, description="Filtra per attivo (0/1)"),
    q: Optional[str] = Query(None, description="Ricerca full-text su nome/produttore/descrizione"),
    user: dict = Depends(get_current_user),
):
    """Lista voci filtrata per sezione / attivo / ricerca. Ordinata per ordine, id."""
    _require_reader(user)
    _ensure_db()

    where = []
    params: list[Any] = []
    if sezione is not None:
        where.append("sezione_key = ?")
        params.append(sezione)
    if attivo is not None:
        where.append("attivo = ?")
        params.append(attivo)
    if q:
        where.append("(nome LIKE ? OR produttore LIKE ? OR descrizione LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"SELECT * FROM bevande_voci {where_sql} ORDER BY ordine, id"

    conn = get_bevande_conn()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/voci/{voce_id}")
def get_voce(voce_id: int, user: dict = Depends(get_current_user)):
    """Dettaglio voce."""
    _require_reader(user)
    _ensure_db()
    conn = get_bevande_conn()
    try:
        row = conn.execute("SELECT * FROM bevande_voci WHERE id = ?", (voce_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Voce {voce_id} non trovata")
        return _row_to_dict(row)
    finally:
        conn.close()


# ─────────────────────────────────────────────
# VOCI — CREATE / UPDATE / DELETE
# ─────────────────────────────────────────────

_VOCE_FIELDS = [
    "sezione_key", "nome", "sottotitolo", "descrizione", "produttore", "regione",
    "formato", "gradazione", "ibu", "tipologia", "paese_origine",
    "prezzo_eur", "prezzo_label", "tags", "extra", "ordine", "attivo", "note_interne",
]


def _validate_sezione_or_404(sezione_key: str) -> None:
    if sezione_key == "vini":
        # La sezione 'vini' è dinamica: le voci vengono da fe_magazzino_vini
        raise HTTPException(
            400,
            "La sezione 'vini' è dinamica: i vini si gestiscono dal modulo Cantina (fe_magazzino_vini), non qui."
        )
    if not _sezione_exists(sezione_key):
        raise HTTPException(404, f"Sezione '{sezione_key}' non trovata")


@router.post("/voci/")
def create_voce(voce: VoceBase, user: dict = Depends(get_current_user)):
    """Crea una nuova voce in una sezione."""
    _require_editor(user)
    _ensure_db()
    _validate_sezione_or_404(voce.sezione_key)

    data = voce.model_dump()
    # tags/extra → JSON
    if data.get("tags") is not None:
        data["tags"] = json.dumps(data["tags"], ensure_ascii=False)
    if data.get("extra") is not None:
        data["extra"] = json.dumps(data["extra"], ensure_ascii=False)

    cols = [c for c in _VOCE_FIELDS if c in data]
    placeholders = ", ".join("?" for _ in cols)
    cols_sql = ", ".join(cols)

    conn = get_bevande_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            f"INSERT INTO bevande_voci ({cols_sql}) VALUES ({placeholders})",
            [data[c] for c in cols],
        )
        new_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "id": new_id}


@router.put("/voci/{voce_id}")
def update_voce(voce_id: int, patch: VoceUpdate, user: dict = Depends(get_current_user)):
    """Aggiorna campi di una voce esistente (PATCH-like: solo campi forniti)."""
    _require_editor(user)
    _ensure_db()

    fields = patch.model_dump(exclude_unset=True)
    if not fields:
        return {"status": "noop"}

    # JSON fields
    if "tags" in fields and fields["tags"] is not None:
        fields["tags"] = json.dumps(fields["tags"], ensure_ascii=False)
    if "extra" in fields and fields["extra"] is not None:
        fields["extra"] = json.dumps(fields["extra"], ensure_ascii=False)

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [voce_id]

    conn = get_bevande_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE bevande_voci SET {set_clause}, updated_at = datetime('now','localtime') WHERE id = ?",
            values,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, f"Voce {voce_id} non trovata")
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "id": voce_id}


@router.delete("/voci/{voce_id}")
def delete_voce(
    voce_id: int,
    hard: bool = Query(False, description="Se True, hard-delete (solo admin)"),
    user: dict = Depends(get_current_user),
):
    """Soft-delete di default (attivo=0). Con ?hard=1 rimuove fisicamente (solo admin)."""
    _require_editor(user)
    _ensure_db()

    role = (user or {}).get("role") or ""
    if hard and role not in {"admin", "superadmin"}:
        raise HTTPException(403, "Hard-delete riservato ad admin/superadmin")

    conn = get_bevande_conn()
    try:
        cur = conn.cursor()
        if hard:
            cur.execute("DELETE FROM bevande_voci WHERE id = ?", (voce_id,))
        else:
            cur.execute(
                "UPDATE bevande_voci SET attivo = 0, updated_at = datetime('now','localtime') WHERE id = ?",
                (voce_id,),
            )
        if cur.rowcount == 0:
            raise HTTPException(404, f"Voce {voce_id} non trovata")
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "id": voce_id, "mode": "hard" if hard else "soft"}


@router.post("/voci/reorder")
def reorder_voci(payload: VociReorder, user: dict = Depends(get_current_user)):
    """Riordino batch voci di una sezione: body = {sezione_key, order:[id1,id2,…]}."""
    _require_editor(user)
    _ensure_db()
    _validate_sezione_or_404(payload.sezione_key)

    if not payload.order:
        return {"status": "noop"}

    conn = get_bevande_conn()
    try:
        cur = conn.cursor()
        for idx, voce_id in enumerate(payload.order, start=1):
            cur.execute(
                """
                UPDATE bevande_voci
                   SET ordine = ?, updated_at = datetime('now','localtime')
                 WHERE id = ? AND sezione_key = ?
                """,
                (idx * 10, voce_id, payload.sezione_key),
            )
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "count": len(payload.order)}


@router.post("/voci/bulk-import")
def bulk_import_voci(payload: BulkImport, user: dict = Depends(get_current_user)):
    """
    Import massivo di voci in una sezione.
    Frontend invia un array di righe pre-parsate (campi opzionali).
    Le voci vengono accodate con ordine progressivo (MAX+10, MAX+20, …).
    """
    _require_editor(user)
    _ensure_db()
    _validate_sezione_or_404(payload.sezione_key)

    if not payload.rows:
        return {"status": "noop", "imported": 0}

    conn = get_bevande_conn()
    try:
        cur = conn.cursor()
        row = cur.execute(
            "SELECT COALESCE(MAX(ordine), 0) AS mx FROM bevande_voci WHERE sezione_key = ?",
            (payload.sezione_key,),
        ).fetchone()
        base = (row["mx"] or 0) + 10

        cols = [
            "sezione_key", "nome", "sottotitolo", "descrizione", "produttore", "regione",
            "formato", "gradazione", "ibu", "tipologia", "paese_origine",
            "prezzo_eur", "prezzo_label", "ordine", "attivo",
        ]
        placeholders = ", ".join("?" for _ in cols)
        cols_sql = ", ".join(cols)

        imported = 0
        for i, r in enumerate(payload.rows):
            if not r.nome or not r.nome.strip():
                continue  # salta righe vuote
            cur.execute(
                f"INSERT INTO bevande_voci ({cols_sql}) VALUES ({placeholders})",
                (
                    payload.sezione_key,
                    r.nome.strip(),
                    r.sottotitolo, r.descrizione, r.produttore, r.regione,
                    r.formato, r.gradazione, r.ibu, r.tipologia, r.paese_origine,
                    r.prezzo_eur, r.prezzo_label,
                    base + i * 10,
                    1,
                ),
            )
            imported += 1
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "imported": imported, "sezione_key": payload.sezione_key}


# ═════════════════════════════════════════════════════════════
# EXPORT — Fase 3
# ═════════════════════════════════════════════════════════════
# HTML preview master (/bevande/carta)
# PDF cliente (/bevande/carta/pdf)
# PDF staff (/bevande/carta/pdf-staff, include note_interne)
# DOCX (/bevande/carta/docx)
# HTML singola sezione (/bevande/sezioni/{key}/preview)
#
# Nota permessi: tutti richiedono JWT (già applicato dal router-level Depends),
# reader block su viewer, editor non richiesto (basta leggere).
# ═════════════════════════════════════════════════════════════


def _html_preview_wrapper(body_html: str, title: str = "Carta delle Bevande") -> str:
    """Avvolge il body in un HTML completo per preview browser.

    NB: CSS inlinato invece di `<link>` perche' il FE apre questi HTML come
    blob URL (per passare l'header JWT tramite fetch). In un blob URL i path
    relativi si risolvono rispetto all'origin del documento, non a quello del
    backend → `/static/css/carta_html.css` → 404. Inlineando siamo self-contained.
    """
    version = get_version_string()
    try:
        css_inline = CSS_HTML.read_text(encoding="utf-8")
    except Exception:
        css_inline = ""
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title}</title>
    <style>{css_inline}</style>
</head>
<body>
    <h1 class="title">OSTERIA TRE GOBBI — {title.upper()}</h1>
    {body_html}
    <div class="bev-version-footer">{version}</div>
</body>
</html>"""


def _html_pdf_wrapper(body_html: str, frontespizio: str, toc: str) -> str:
    """Avvolge il body per WeasyPrint (carta_pdf.css)."""
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="/static/css/carta_pdf.css">
</head>
<body>
    {frontespizio}
    {toc}
    <div class="carta-bevande-body">{body_html}</div>
</body>
</html>"""


@router.get("/carta", response_class=HTMLResponse)
def carta_bevande_html(user: dict = Depends(get_current_user)):
    """Preview HTML master della Carta delle Bevande (per iframe/browser)."""
    _require_reader(user)
    _ensure_db()
    body = build_carta_bevande_html(include_vini=True, for_pdf=False, staff=False)
    return HTMLResponse(_html_preview_wrapper(body))


@router.get("/carta/pdf")
def carta_bevande_pdf(user: dict = Depends(get_current_user)):
    """PDF cliente (no note staff) — Carta delle Bevande completa."""
    _require_reader(user)
    _ensure_db()
    frontespizio = build_copertina_html(
        logo_path=str(LOGO_PATH) if LOGO_PATH.exists() else None,
        staff=False,
    )
    sezioni_attive = [
        _row_to_dict(s) for s in list_sezioni(only_active=True)
    ]
    toc = build_toc_html(sezioni_attive)
    body = build_carta_bevande_html(include_vini=True, for_pdf=True, staff=False)
    html = _html_pdf_wrapper(body, frontespizio, toc)

    out = STATIC_DIR / "carta_bevande.pdf"
    HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        str(out),
        stylesheets=[CSS(filename=str(CSS_PDF))],
    )
    return FileResponse(out, filename="carta-bevande.pdf")


@router.get("/carta/pdf-staff")
def carta_bevande_pdf_staff(user: dict = Depends(get_current_user)):
    """PDF staff — include note_interne su ogni voce che le ha."""
    _require_reader(user)
    _ensure_db()
    frontespizio = build_copertina_html(
        logo_path=str(LOGO_PATH) if LOGO_PATH.exists() else None,
        staff=True,
    )
    sezioni_attive = [
        _row_to_dict(s) for s in list_sezioni(only_active=True)
    ]
    toc = build_toc_html(sezioni_attive)
    body = build_carta_bevande_html(include_vini=True, for_pdf=True, staff=True)
    html = _html_pdf_wrapper(body, frontespizio, toc)

    out = STATIC_DIR / "carta_bevande_staff.pdf"
    HTML(string=html, base_url=str(BASE_DIR)).write_pdf(
        str(out),
        stylesheets=[CSS(filename=str(CSS_PDF))],
    )
    return FileResponse(out, filename="carta-bevande-staff.pdf")


@router.get("/carta/docx")
def carta_bevande_docx(user: dict = Depends(get_current_user)):
    """DOCX master — Carta delle Bevande completa (staff=False)."""
    _require_reader(user)
    _ensure_db()
    doc = build_carta_bevande_docx(
        logo_path=LOGO_PATH if LOGO_PATH.exists() else None,
        staff=False,
    )
    out = STATIC_DIR / "carta_bevande.docx"
    doc.save(str(out))
    return FileResponse(
        out,
        filename="carta-bevande.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/sezioni/{key}/preview", response_class=HTMLResponse)
def carta_bevande_sezione_preview(key: str, user: dict = Depends(get_current_user)):
    """
    Preview HTML di una singola sezione — usata dall'editor per
    "Anteprima sezione" (iframe in nuovo tab).
    Per la sezione 'vini' rimanda alla preview vini storica.
    """
    _require_reader(user)
    _ensure_db()
    sezione_row = get_sezione_by_key(key)
    if not sezione_row:
        raise HTTPException(404, f"Sezione '{key}' non trovata")
    sezione = _row_to_dict(sezione_row)

    if key == "vini":
        # La sezione vini ha la sua preview dedicata esistente
        return HTMLResponse(
            "<html><head><meta http-equiv='refresh' content='0; url=/vini/carta'>"
            "</head><body>Redirezione alla Carta Vini…</body></html>"
        )

    voci = _load_voci_attive(key)
    body = build_section_html(sezione, voci, for_pdf=False, staff=False)
    return HTMLResponse(_html_preview_wrapper(body, title=sezione.get("nome") or key))
