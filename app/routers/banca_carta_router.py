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
    """Espone le settings correnti del match service. Default in
    carta_match_service.DEFAULTS se la tabella è vuota."""
    conn = get_db()
    try:
        return carta_match_service.get_match_settings(conn)
    finally:
        conn.close()


@router.put(
    "/match-settings",
    summary="Aggiorna tolleranze/pesi del matcher carta (singleton)",
)
def update_match_settings_endpoint(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Aggiorna la riga singleton `carta_match_settings` (id=1).

    Validazioni:
      - tolerance_importo_eur > 0
      - tolerance_data_days >= 0 e <= 60
      - weight_importo + weight_data + weight_fornitore deve essere ≈ 1.0
        (tolleranza 0.01 per errori di arrotondamento JS)
      - 0 <= auto_apply_threshold <= 1

    Body atteso (tutti opzionali, vengono presi solo i campi presenti):
      {
        "tolerance_importo_eur": float,
        "tolerance_data_days": int,
        "weight_importo": float,
        "weight_data": float,
        "weight_fornitore": float,
        "auto_apply_threshold": float
      }
    """
    valid_keys = {
        "tolerance_importo_eur",
        "tolerance_data_days",
        "weight_importo",
        "weight_data",
        "weight_fornitore",
        "auto_apply_threshold",
        # CC.5.a — tolleranze match B
        "tolerance_cc_importo_eur",
        "tolerance_cc_data_days",
    }
    updates = {k: v for k, v in (payload or {}).items() if k in valid_keys}
    if not updates:
        raise HTTPException(400, "Nessun campo valido nel body")

    # Validazioni
    if "tolerance_importo_eur" in updates:
        v = updates["tolerance_importo_eur"]
        if not isinstance(v, (int, float)) or v <= 0:
            raise HTTPException(400, "tolerance_importo_eur deve essere > 0")
    if "tolerance_data_days" in updates:
        v = updates["tolerance_data_days"]
        if not isinstance(v, int) or v < 0 or v > 60:
            raise HTTPException(400, "tolerance_data_days deve essere intero 0–60")
    if "tolerance_cc_importo_eur" in updates:
        v = updates["tolerance_cc_importo_eur"]
        if not isinstance(v, (int, float)) or v <= 0:
            raise HTTPException(400, "tolerance_cc_importo_eur deve essere > 0")
    if "tolerance_cc_data_days" in updates:
        v = updates["tolerance_cc_data_days"]
        if not isinstance(v, int) or v < 0 or v > 30:
            raise HTTPException(400, "tolerance_cc_data_days deve essere intero 0–30")
    for wk in ("weight_importo", "weight_data", "weight_fornitore"):
        if wk in updates:
            v = updates[wk]
            if not isinstance(v, (int, float)) or v < 0 or v > 1:
                raise HTTPException(400, f"{wk} deve essere in [0, 1]")
    if "auto_apply_threshold" in updates:
        v = updates["auto_apply_threshold"]
        if not isinstance(v, (int, float)) or v < 0 or v > 1:
            raise HTTPException(400, "auto_apply_threshold deve essere in [0, 1]")

    # Verifica somma pesi (con merge sui valori correnti per pesi non passati)
    conn = get_db()
    try:
        current = carta_match_service.get_match_settings(conn)
        merged = {**current, **updates}
        somma = (
            float(merged["weight_importo"])
            + float(merged["weight_data"])
            + float(merged["weight_fornitore"])
        )
        if abs(somma - 1.0) > 0.01:
            raise HTTPException(
                400,
                f"La somma dei pesi (importo+data+fornitore) deve essere 1.0, "
                f"trovato {somma:.3f}.",
            )

        # Build UPDATE dinamico
        cols = list(updates.keys())
        set_clause = ", ".join(f"{c} = ?" for c in cols)
        params = [updates[c] for c in cols]
        params.append((current_user.get("username") or "")[:100])
        conn.execute(
            f"""UPDATE carta_match_settings
                SET {set_clause}, updated_at = datetime('now'), updated_by = ?
                WHERE id = 1""",
            params,
        )
        conn.commit()
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


# ──────────────────────────────────────────────────────────────
# CC.5.a — Match livello B: estratto carta ↔ addebito mensile sul CC bancario
# ──────────────────────────────────────────────────────────────


@router.get(
    "/estratti/{estratto_id}/candidati-cc",
    summary="Cerca movimenti CC bancari candidati come addebito mensile dell'estratto",
)
def get_candidati_cc(
    estratto_id: int,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Filtri: movimenti `banca NOT LIKE 'CARTA_%'`, importo opposto a
    `addebito_totale_cc` entro `tolerance_cc_importo_eur`, data ± `tolerance_cc_data_days`
    rispetto a `data_valuta_addebito`. Score 70% importo + 30% data."""
    conn = get_db()
    try:
        # Verifica estratto esista
        existing = conn.execute(
            "SELECT id FROM carta_estratti WHERE id = ?", (estratto_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Estratto non trovato")
        candidati = carta_match_service.find_candidati_cc(conn, estratto_id, limit=limit)
        return {"candidati": candidati, "n": len(candidati)}
    finally:
        conn.close()


@router.post(
    "/estratti/{estratto_id}/link-cc",
    summary="Linka estratto al movimento CC che rappresenta il suo addebito mensile",
)
def link_estratto_cc(
    estratto_id: int,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Body: {movimento_cc_id: int}. Salva in `carta_estratti.banca_movimento_id`."""
    movimento_cc_id = payload.get("movimento_cc_id")
    if not isinstance(movimento_cc_id, int):
        raise HTTPException(400, "movimento_cc_id mancante o non int")
    conn = get_db()
    try:
        try:
            return carta_match_service.apply_link_cc(
                conn, estratto_id, movimento_cc_id, user=current_user.get("username")
            )
        except ValueError as e:
            raise HTTPException(409, str(e))
    finally:
        conn.close()


@router.delete(
    "/estratti/{estratto_id}/link-cc",
    summary="Scollega l'estratto dal suo addebito CC (azzera banca_movimento_id)",
)
def unlink_estratto_cc(
    estratto_id: int,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    try:
        try:
            return carta_match_service.remove_link_cc(
                conn, estratto_id, user=current_user.get("username")
            )
        except ValueError as e:
            raise HTTPException(404, str(e))
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# CC.5.b — Riepilogo mensile spese carta per categoria
# ──────────────────────────────────────────────────────────────

# Mappa MCC prefix (primi 4 cifre del campo carta_mcc 8-cifre BPM) → categoria.
# Hardcoded perché stabile e poche voci. Tabella editabile (opzione 2 del
# design) rinviata a quando serviranno personalizzazioni cliente.
MCC_TO_CATEGORIA = {
    # Trasporti / pedaggi / benzinai / car rental
    "4111": "TRASPORTI", "4112": "TRASPORTI", "4131": "TRASPORTI",
    "4511": "TRASPORTI", "4789": "TRASPORTI", "4784": "TRASPORTI",  # ASPIT autostrade
    "4214": "TRASPORTI",
    "5541": "TRASPORTI", "5542": "TRASPORTI",  # benzinai
    "7512": "TRASPORTI", "7513": "TRASPORTI",
    # Alimentari / grocery / liquor
    "5300": "ALIMENTARI", "5311": "ALIMENTARI",
    "5411": "ALIMENTARI",  # Esselunga, Cash&Carry
    "5422": "ALIMENTARI", "5441": "ALIMENTARI", "5451": "ALIMENTARI",
    "5462": "ALIMENTARI",
    "5499": "ALIMENTARI",
    "5921": "ALIMENTARI",
    # Software / SaaS / digital goods / cloud
    "5734": "SOFTWARE",    # OpenAI, Claude, Aruba, generic SW
    "5815": "SOFTWARE",
    "5816": "SOFTWARE",    # NVIDIA
    "5817": "SOFTWARE",    # Adobe
    "5818": "SOFTWARE",    # Apple
    "5968": "SOFTWARE",    # Mailchimp
    "7372": "SOFTWARE",    # Backblaze
    "7379": "SOFTWARE",
    # Hotel
    "7011": "ALBERGHI", "7012": "ALBERGHI",
    # Ristoranti / bar / fast food
    "5811": "RISTORANTI", "5812": "RISTORANTI", "5813": "RISTORANTI",
    "5814": "RISTORANTI",
    # Finanziari / Klarna
    "6010": "FINANZIARI", "6011": "FINANZIARI", "6012": "FINANZIARI",
    "6051": "FINANZIARI",
    # Servizi professionali / servizi vari
    "7299": "SERVIZI", "7338": "SERVIZI", "7339": "SERVIZI",
    "7393": "SERVIZI", "7399": "SERVIZI",
    "8398": "SERVIZI", "8999": "SERVIZI",
}

_DEFAULT_CATEGORIA = "VARIE"


def _mcc_to_categoria(mcc: Optional[str]) -> str:
    if not mcc:
        return _DEFAULT_CATEGORIA
    prefix = mcc[:4] if len(mcc) >= 4 else mcc
    return MCC_TO_CATEGORIA.get(prefix, _DEFAULT_CATEGORIA)


@router.get(
    "/riepilogo",
    summary="Riepilogo mensile spese carta per categoria (CC.5.b)",
)
def riepilogo_mensile(
    carta_id: Optional[int] = Query(None, description="Filtra su una sola carta"),
    date_from: Optional[str] = Query(None, alias="from", description="ISO YYYY-MM-DD inclusivo"),
    date_to: Optional[str] = Query(None, alias="to", description="ISO YYYY-MM-DD inclusivo"),
    current_user: dict = Depends(get_current_user),
):
    """Aggrega le spese carta per mese (YYYY-MM) e categoria.

    Ritorna:
      {
        "mesi": [
          {
            "mese": "2026-04",
            "totale": 1858.92,
            "n_mov": 31,
            "per_categoria": { "TRASPORTI": 12.30, "ALIMENTARI": 184.75, ... }
          }, ...
        ],
        "categorie": ["TRASPORTI", "ALIMENTARI", "SOFTWARE", ...]
      }
    """
    conn = get_db()
    try:
        where = ["m.banca LIKE 'CARTA_%'"]
        params: list = []
        if carta_id is not None:
            where.append("m.rapporto = (SELECT codice_posizione FROM carte_credito WHERE id = ?)")
            params.append(carta_id)
        if date_from:
            where.append("m.data_contabile >= ?")
            params.append(date_from)
        if date_to:
            where.append("m.data_contabile <= ?")
            params.append(date_to)

        sql = f"""
            SELECT strftime('%Y-%m', m.data_contabile) AS mese,
                   m.carta_mcc, ABS(m.importo) AS imp
            FROM banca_movimenti m
            WHERE {' AND '.join(where)}
        """
        rows = conn.execute(sql, params).fetchall()

        agg: dict = {}
        cat_totali: dict = {}
        for r in rows:
            row = dict(r)
            mese = row["mese"]
            imp = float(row["imp"] or 0)
            cat = _mcc_to_categoria(row.get("carta_mcc"))
            if mese not in agg:
                agg[mese] = {"mese": mese, "totale": 0.0, "n_mov": 0, "per_categoria": {}}
            agg[mese]["totale"] += imp
            agg[mese]["n_mov"] += 1
            agg[mese]["per_categoria"][cat] = round(
                agg[mese]["per_categoria"].get(cat, 0.0) + imp, 2
            )
            cat_totali[cat] = cat_totali.get(cat, 0.0) + imp

        mesi = sorted(agg.values(), key=lambda x: x["mese"])
        for x in mesi:
            x["totale"] = round(x["totale"], 2)

        categorie = [c for c, _ in sorted(cat_totali.items(), key=lambda kv: -kv[1])]
        return {"mesi": mesi, "categorie": categorie}
    finally:
        conn.close()
