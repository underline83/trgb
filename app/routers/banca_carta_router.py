# Modulo: banca
"""
Router modulo Banca — sub-area "Carta di Credito".

Prefix: `/banca/carta`. DB: `foodcost.db` (stesso degli altri router banca).
Tabelle: `carte_credito`, `carta_estratti`, `banca_movimenti` (con colonne carta).

Endpoint:
  POST   /banca/carta/upload              — upload PDF estratto, parse, insert
  GET    /banca/carta/carte               — lista carte (anagrafica)
  GET    /banca/carta/carte/{id}          — dettaglio singola carta
  GET    /banca/carta/estratti            — lista estratti (?carta_id=)
  GET    /banca/carta/estratti/{id}       — dettaglio estratto + movimenti
  DELETE /banca/carta/estratti/{id}       — elimina estratto + suoi movimenti
                                            (utile per ri-importare PDF dopo bugfix)

CC.4 — riconciliazione livello A (match movimento carta ↔ uscita CG):
  GET    /banca/carta/movimenti/{id}/candidati  — lista uscite CG candidate con score
  POST   /banca/carta/movimenti/{id}/link        — applica link (stato → PAGATO)
  DELETE /banca/carta/movimenti/{id}/link        — rimuove link (stato → PAGATO_MANUALE)
  GET    /banca/carta/match-settings             — legge tolleranze/pesi (singleton)

Auth: tutti gli endpoint richiedono utente loggato (admin in produzione, ma
non blocchiamo i ruoli a livello router — il controllo è delegato a
useModuleAccess + permessi cc/carta su FE).
"""

from __future__ import annotations

import json
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile

from app.services.auth_service import get_current_user
from app.services.carta_pdf_parser import parse_estratto_carta, to_dict
from app.services import carta_match_service
from app.utils.locale_data import locale_data_path


router = APIRouter(prefix="/banca/carta", tags=["banca-carta"])

DB_PATH = locale_data_path("foodcost.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────


def _build_banca_tag(emittente: Optional[str], ultime: Optional[str]) -> str:
    """Costruisce il valore per banca_movimenti.banca per i mov di questa carta.

    Convenzione: 'CARTA_<EMITT_SHORT>_<ULT3>'. Esempio: 'CARTA_BPM_623'.
    Vale come prefisso per filtrare via `WHERE banca LIKE 'CARTA_%'`.
    """
    emitt = (emittente or "UNK").upper()
    if "BPM" in emitt or "BANCO BPM" in emitt:
        short = "BPM"
    elif "INTESA" in emitt:
        short = "ISP"
    elif "AMEX" in emitt or "AMERICAN" in emitt:
        short = "AMEX"
    else:
        short = "".join(c for c in emitt if c.isalnum())[:6] or "CARTA"
    return f"CARTA_{short}_{ultime or 'XXX'}"


def _find_or_create_carta(conn: sqlite3.Connection, carta_info, *, emittente_default: str = "BANCO BPM") -> int:
    """Trova carta per codice_posizione o la crea. Ritorna l'id."""
    if not carta_info.codice_posizione:
        raise HTTPException(400, "PDF senza codice_posizione: impossibile identificare la carta")

    cur = conn.cursor()
    row = cur.execute(
        "SELECT id FROM carte_credito WHERE codice_posizione = ?",
        (carta_info.codice_posizione,),
    ).fetchone()
    if row:
        return row["id"]

    emittente = emittente_default  # da PDF Banco BPM oggi; in futuro auto-detect
    banca_tag = _build_banca_tag(emittente, carta_info.ultime_visibili)
    nickname = f"{emittente} {carta_info.intestatario or ''} *{carta_info.ultime_visibili or 'XXX'}".strip()

    cur.execute(
        """INSERT INTO carte_credito
           (nickname, emittente, codice_posizione, carta_numero_mask, ultime_visibili,
            intestatario, titolare, codice_titolare, cc_addebito, abi, cab, piva,
            limite_utilizzo, banca_tag, attiva)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
        (
            nickname,
            emittente,
            carta_info.codice_posizione,
            carta_info.carta_numero_mask,
            carta_info.ultime_visibili,
            carta_info.intestatario,
            carta_info.titolare,
            carta_info.codice_titolare,
            carta_info.cc_addebito,
            carta_info.abi,
            carta_info.cab,
            carta_info.piva,
            carta_info.limite,
            banca_tag,
        ),
    )
    return cur.lastrowid


def _dedup_hash_carta(codice_riferimento: str) -> str:
    """Dedup hash per movimento carta = il codice_riferimento (23 cifre unique BPM)."""
    return f"CARTA:{codice_riferimento}"


# ──────────────────────────────────────────────────────────────
# POST /banca/carta/upload
# ──────────────────────────────────────────────────────────────


@router.post("/upload", summary="Upload PDF estratto carta, parse, insert")
async def upload_estratto_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Riceve un PDF Banco BPM "Estratto carta", lo parsea via
    `carta_pdf_parser`, e popola:
      - `carte_credito` (se nuova) — identificata da `codice_posizione`
      - `carta_estratti` — un record per PDF (dedup su pdf_sha256)
      - `banca_movimenti` — uno per riga del dettaglio, con campi carta

    Rifiuta l'import se il sanity check di chiusura non quadra (delta > 0.02€)
    e ritorna 422 con i warning del parser.
    """
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "File deve essere un PDF")

    # Salva su file temporaneo per pdftotext
    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = parse_estratto_carta(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    if not (result.quadra and result.quadra_addebito):
        raise HTTPException(
            422,
            detail={
                "error": "Sanity check fallito: l'estratto non quadra",
                "delta_quadratura": result.delta_quadratura,
                "delta_addebito": result.delta_addebito,
                "warnings": result.warnings,
            },
        )

    conn = get_db()
    try:
        cur = conn.cursor()

        # Dedup su sha256 del PDF
        if result.pdf_sha256:
            existing = cur.execute(
                "SELECT id FROM carta_estratti WHERE pdf_sha256 = ?",
                (result.pdf_sha256,),
            ).fetchone()
            if existing:
                raise HTTPException(
                    409,
                    detail={
                        "error": "Questo PDF è già stato importato",
                        "estratto_id": existing["id"],
                    },
                )

        carta_id = _find_or_create_carta(conn, result.carta)
        # Recupera banca_tag della carta per popolare banca_movimenti.banca
        banca_tag = cur.execute(
            "SELECT banca_tag FROM carte_credito WHERE id = ?", (carta_id,)
        ).fetchone()["banca_tag"]

        # Insert estratto
        cur.execute(
            """INSERT INTO carta_estratti
               (carta_id, data_chiusura, data_valuta_addebito,
                debito_residuo_precedente, totale_addebitato_precedente,
                totale_movimenti, imposta_bollo, spese_invio, addebito_totale_cc,
                pdf_filename, pdf_sha256, n_movimenti, quadra, warnings)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                carta_id,
                result.estratto.data_chiusura,
                result.estratto.data_valuta_addebito,
                result.estratto.debito_residuo_precedente,
                result.estratto.totale_addebitato_precedente,
                result.estratto.totale_movimenti,
                result.estratto.imposta_bollo,
                result.estratto.spese_invio,
                result.estratto.addebito_totale_cc,
                result.pdf_filename,
                result.pdf_sha256,
                len(result.movimenti),
                1 if result.quadra and result.quadra_addebito else 0,
                json.dumps(result.warnings, ensure_ascii=False),
            ),
        )
        estratto_id = cur.lastrowid

        # Insert movimenti (skip dup su codice_riferimento)
        inserted = 0
        skipped = 0
        for mov in result.movimenti:
            dedup_hash = _dedup_hash_carta(mov.codice_riferimento)
            # Skip se codice_riferimento già esiste (dedup naturale BPM)
            already = cur.execute(
                "SELECT id FROM banca_movimenti WHERE carta_codice_riferimento = ?",
                (mov.codice_riferimento,),
            ).fetchone()
            if already:
                skipped += 1
                continue
            cur.execute(
                """INSERT INTO banca_movimenti
                   (data_contabile, data_valuta, banca, rapporto,
                    importo, divisa, descrizione,
                    categoria_banca, sottocategoria_banca, hashtag,
                    dedup_hash,
                    carta_codice_riferimento, carta_mcc, carta_estratto_id,
                    valuta_estera, importo_estero, cambio_valuta,
                    magg_circuito, magg_cambio)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    mov.data_operazione,         # data_contabile = data operazione
                    mov.data_registrazione,      # data_valuta    = data registrazione
                    banca_tag,                   # es. CARTA_BPM_623
                    result.carta.codice_posizione,  # rapporto
                    -abs(mov.importo),           # importo NEGATIVO (è uscita)
                    "EUR",
                    mov.descrizione,
                    "CARTA_CREDITO",             # categoria base; futuro: auto-detect via MCC
                    None,                        # sottocategoria — TODO MCC mapping
                    mov.mcc[:4] if mov.mcc else None,  # hashtag = primi 4 del MCC
                    dedup_hash,
                    mov.codice_riferimento,
                    mov.mcc,
                    estratto_id,
                    mov.valuta_estera,
                    mov.importo_estero,
                    mov.cambio_valuta,
                    mov.magg_circuito,
                    mov.magg_cambio,
                ),
            )
            inserted += 1

        conn.commit()

        return {
            "ok": True,
            "estratto_id": estratto_id,
            "carta_id": carta_id,
            "movimenti_inseriti": inserted,
            "movimenti_skipped_dup": skipped,
            "totale_movimenti": result.estratto.totale_movimenti,
            "addebito_totale_cc": result.estratto.addebito_totale_cc,
            "data_chiusura": result.estratto.data_chiusura,
            "data_valuta_addebito": result.estratto.data_valuta_addebito,
            "warnings": result.warnings,
        }

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, f"Errore import: {e}")
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# GET /banca/carta/carte
# ──────────────────────────────────────────────────────────────


@router.get("/carte", summary="Lista carte di credito")
def list_carte(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT c.id, c.nickname, c.emittente, c.codice_posizione,
                      c.carta_numero_mask, c.ultime_visibili, c.intestatario,
                      c.titolare, c.cc_addebito, c.limite_utilizzo,
                      c.banca_tag, c.attiva, c.created_at,
                      (SELECT COUNT(*) FROM carta_estratti WHERE carta_id = c.id) AS n_estratti,
                      (SELECT COUNT(*) FROM banca_movimenti WHERE banca = c.banca_tag) AS n_movimenti
               FROM carte_credito c
               ORDER BY c.attiva DESC, c.created_at DESC"""
        ).fetchall()
        return {"carte": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/carte/{carta_id}", summary="Dettaglio singola carta")
def get_carta(carta_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM carte_credito WHERE id = ?", (carta_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Carta non trovata")
        return dict(row)
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# GET /banca/carta/estratti
# ──────────────────────────────────────────────────────────────


@router.get("/estratti", summary="Lista estratti carta")
def list_estratti(
    carta_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    try:
        if carta_id is not None:
            rows = conn.execute(
                """SELECT e.*, c.nickname AS carta_nickname, c.banca_tag
                   FROM carta_estratti e
                   JOIN carte_credito c ON c.id = e.carta_id
                   WHERE e.carta_id = ?
                   ORDER BY e.data_chiusura DESC""",
                (carta_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT e.*, c.nickname AS carta_nickname, c.banca_tag
                   FROM carta_estratti e
                   JOIN carte_credito c ON c.id = e.carta_id
                   ORDER BY e.data_chiusura DESC
                   LIMIT 200"""
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["warnings"] = json.loads(d.get("warnings") or "[]")
            out.append(d)
        return {"estratti": out}
    finally:
        conn.close()


@router.get("/estratti/{estratto_id}", summary="Dettaglio estratto + movimenti")
def get_estratto(estratto_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        e = conn.execute(
            """SELECT e.*, c.nickname AS carta_nickname, c.banca_tag, c.codice_posizione
               FROM carta_estratti e
               JOIN carte_credito c ON c.id = e.carta_id
               WHERE e.id = ?""",
            (estratto_id,),
        ).fetchone()
        if not e:
            raise HTTPException(404, "Estratto non trovato")

        # CC.4: aggiungo info match A (l'uscita CG già linkata, se c'è)
        movs = conn.execute(
            """SELECT m.id, m.data_contabile AS data_operazione,
                      m.data_valuta AS data_registrazione,
                      ABS(m.importo) AS importo,
                      m.descrizione, m.categoria_banca,
                      m.carta_codice_riferimento, m.carta_mcc,
                      m.valuta_estera, m.importo_estero, m.cambio_valuta,
                      m.magg_circuito, m.magg_cambio,
                      u.id AS match_uscita_id,
                      u.fornitore_nome AS match_uscita_fornitore,
                      u.totale AS match_uscita_totale
               FROM banca_movimenti m
               LEFT JOIN cg_uscite u ON u.banca_movimento_id = m.id
               WHERE m.carta_estratto_id = ?
               ORDER BY m.data_contabile, m.id""",
            (estratto_id,),
        ).fetchall()

        out = dict(e)
        out["warnings"] = json.loads(out.get("warnings") or "[]")
        out["movimenti"] = [dict(m) for m in movs]
        return out
    finally:
        conn.close()


@router.delete("/estratti/{estratto_id}", summary="Elimina estratto e suoi movimenti")
def delete_estratto(estratto_id: int, current_user: dict = Depends(get_current_user)):
    """Elimina un estratto importato e tutti i suoi movimenti.

    Utile se l'import è stato fatto con un parser bacato e va rifatto.
    NON disfa le riconciliazioni con cg_uscite: prima di cancellare un estratto
    vanno staccati i link manualmente (futuro: cascade controllato).
    """
    conn = get_db()
    try:
        # Verifica esistenza
        existing = conn.execute(
            "SELECT id FROM carta_estratti WHERE id = ?", (estratto_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Estratto non trovato")

        # Verifica che nessun movimento sia linkato a fatture
        linked = conn.execute(
            """SELECT COUNT(*) AS n
               FROM banca_fatture_link bfl
               JOIN banca_movimenti bm ON bm.id = bfl.movimento_id
               WHERE bm.carta_estratto_id = ?""",
            (estratto_id,),
        ).fetchone()
        if linked["n"] > 0:
            raise HTTPException(
                409,
                f"Impossibile cancellare: {linked['n']} movimenti hanno link con fatture. "
                "Staccare prima i link e riprovare.",
            )

        # CC.4: verifica che nessun movimento sia linkato a uscite CG (match A)
        cg_linked = conn.execute(
            """SELECT COUNT(*) AS n
               FROM cg_uscite u
               JOIN banca_movimenti bm ON bm.id = u.banca_movimento_id
               WHERE bm.carta_estratto_id = ?""",
            (estratto_id,),
        ).fetchone()
        if cg_linked["n"] > 0:
            raise HTTPException(
                409,
                f"Impossibile cancellare: {cg_linked['n']} movimenti sono riconciliati "
                f"con uscite di Controllo Gestione. Staccare prima i link e riprovare.",
            )

        deleted_movs = conn.execute(
            "DELETE FROM banca_movimenti WHERE carta_estratto_id = ?",
            (estratto_id,),
        ).rowcount
        conn.execute("DELETE FROM carta_estratti WHERE id = ?", (estratto_id,))
        conn.commit()
        return {"ok": True, "movimenti_eliminati": deleted_movs}
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# CC.4 — Match livello A: movimento carta ↔ uscita CG
# ──────────────────────────────────────────────────────────────


@router.get(
    "/match-settings",
    summary="Legge tolleranze/pesi del matcher carta (singleton)",
)
def get_match_settings_endpoint(current_user: dict = Depends(get_current_user)):
    """Espone le settings correnti del match service. Modifiche via UI
    (CC.4.e in roadmap) o SQL diretto. Default in carta_match_service.DEFAULTS."""
    conn = get_db()
    try:
        return carta_match_service.get_match_settings(conn)
    finally:
        conn.close()


@router.get(
    "/movimenti/{movimento_id}/candidati",
    summary="Cerca uscite CG candidate per il match con questo movimento carta",
)
def get_candidati(
    movimento_id: int,
    search: Optional[str] = Query(None, description="Filtro extra su fornitore_nome (substring)"),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Ritorna le uscite CG candidate ordinate per score decrescente.

    Filtri:
      - cg_uscite.metodo_pagamento = 'CARTA'
      - cg_uscite.banca_movimento_id IS NULL
      - |importo_uscita − importo_movimento| < tolerance_importo_eur
      - |data_pagamento − data_carta| < tolerance_data_days (se data_pagamento presente)

    Score (0–1) pesato: importo + data + fornitore. Vedi carta_match_service.
    """
    conn = get_db()
    try:
        # Verifica esistenza movimento
        mov = conn.execute(
            "SELECT id FROM banca_movimenti WHERE id = ? AND banca LIKE 'CARTA_%'",
            (movimento_id,),
        ).fetchone()
        if not mov:
            raise HTTPException(404, "Movimento carta non trovato")

        candidati = carta_match_service.find_candidati(
            conn, movimento_id, limit=limit, search=search
        )
        return {"candidati": candidati, "n": len(candidati)}
    finally:
        conn.close()


@router.post(
    "/movimenti/{movimento_id}/link",
    summary="Linka movimento carta a un'uscita CG (stato → PAGATO)",
)
def link_movimento(
    movimento_id: int,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Body: {uscita_id: int}.

    Effetto:
      cg_uscite.banca_movimento_id = movimento_id
      cg_uscite.stato = 'PAGATO'
      cg_uscite.importo_pagato = totale
      cg_uscite.data_pagamento = COALESCE(data_pagamento, data_carta)

    Errori:
      400 — uscita_id mancante o invalida
      409 — movimento già linkato OPPURE uscita già linkata OPPURE
            uscita ha metodo_pagamento ≠ 'CARTA'
    """
    uscita_id = payload.get("uscita_id")
    if not isinstance(uscita_id, int):
        raise HTTPException(400, "uscita_id mancante o non int")

    conn = get_db()
    try:
        try:
            return carta_match_service.apply_link(
                conn, movimento_id, uscita_id, user=current_user.get("username")
            )
        except ValueError as e:
            raise HTTPException(409, str(e))
    finally:
        conn.close()


@router.delete(
    "/movimenti/{movimento_id}/link",
    summary="Rimuove link tra movimento carta e uscita CG (stato → PAGATO_MANUALE)",
)
def unlink_movimento(
    movimento_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Idempotente: se non esiste un link, ritorna {ok: True, uscita_id: None}.
    Rimette lo stato dell'uscita a PAGATO_MANUALE (se metodo è ancora 'CARTA')."""
    conn = get_db()
    try:
        return carta_match_service.remove_link(
            conn, movimento_id, user=current_user.get("username")
        )
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# CC.4 D2 — Auto-match bulk con anteprima
# ──────────────────────────────────────────────────────────────


@router.post(
    "/estratti/{estratto_id}/automatch",
    summary="Auto-match bulk movimenti carta ↔ uscite CG (anteprima / applica)",
)
def automatch_estratto(
    estratto_id: int,
    dry_run: bool = Query(True, description="True = solo anteprima (default); False = applica i match selezionati"),
    payload: Optional[dict] = Body(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Per ogni movimento dell'estratto NON ancora linkato, sceglie il
    miglior candidato. In `dry_run=true` (default) ritorna l'anteprima per UI
    di conferma. In `dry_run=false` richiede `body.mov_ids = [int]` con
    l'elenco dei movimenti DA APPLICARE (selezione utente).

    Risposta dry_run:
        { "preview": [ {movimento_id, mov_descrizione, mov_importo, mov_data,
                         uscita_id, uscita_fornitore, uscita_totale, uscita_data_pagamento,
                         score, imp_score, data_score, forn_score, auto_select}, ... ] }

    Risposta apply:
        { "applied": [...], "skipped": [...], "n_applied": int, "n_skipped": int }
    """
    conn = get_db()
    try:
        # Verifica estratto esista
        existing = conn.execute(
            "SELECT id FROM carta_estratti WHERE id = ?", (estratto_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Estratto non trovato")

        if dry_run:
            preview = carta_match_service.automatch_dry_run(conn, estratto_id)
            return {"preview": preview, "n": len(preview)}

        # apply mode
        body = payload or {}
        mov_ids = body.get("mov_ids")
        if not isinstance(mov_ids, list) or not all(isinstance(x, int) for x in mov_ids):
            raise HTTPException(400, "body.mov_ids deve essere una lista di interi")

        result = carta_match_service.automatch_apply(
            conn, estratto_id, movimenti_id=mov_ids, user=current_user.get("username")
        )
        return result
    finally:
        conn.close()
