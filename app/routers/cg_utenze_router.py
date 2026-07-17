# Modulo: controllo_gestione
"""
TRGB — Analisi Utenze Router (spec docs/spec_utenze.md, sessione 2026-07-17)

Upload bollette A2A (luce+gas) → parser → serie storica consumi/costi + KPI.
Layer di SOLA ANALISI: nessun importo entra nel Conto Economico (la
contabilità resta su fe_fatture) → zero doppio conteggio.

Prefix: /controllo-gestione/utenze
DB: foodcost.db (cg_utenze_*, lettura fe_fatture per aggancio)
Archivio PDF: locali/<locale>/data/uploads/utenze/

Flow upload a 2 fasi (pattern preview→conferma):
  1. POST /upload   → parsa, archivia il PDF (keyed by hash), ritorna preview.
                      NON scrive nelle tabelle.
  2. POST /conferma → {"pdf_hash": ...} → ri-parsa dal file archiviato e
                      scrive: upsert fornitura, insert bolletta, upsert
                      consumi mensili, aggancio fe_fatture via numero.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.auth_service import get_current_user
from app.services.utenze_parser import parse_bolletta_a2a, UnsupportedLayoutError
from app.utils.locale_data import locale_data_dir, locale_data_path

router = APIRouter(prefix="/controllo-gestione/utenze", tags=["controllo-gestione-utenze"])

FOODCOST_DB = locale_data_path("foodcost.db")


def get_db():
    conn = sqlite3.connect(FOODCOST_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _archivio_dir() -> Path:
    d = locale_data_dir() / "uploads" / "utenze"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _path_archivio(pdf_hash: str) -> Path | None:
    """Il PDF archiviato è salvato come '<hash16>_<nomeoriginale>'."""
    matches = list(_archivio_dir().glob(f"{pdf_hash[:16]}_*"))
    return matches[0] if matches else None


# ─────────────────────────────────────────────────────────────────
# Upload (fase 1 — preview, non scrive nelle tabelle)
# ─────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_bolletta(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """
    Parsa una bolletta PDF A2A e ritorna la preview dei dati estratti.
    Il PDF viene archiviato subito (serve alla /conferma); le tabelle
    cg_utenze_* NON vengono toccate qui.
    """
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Serve un file PDF")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF troppo grande (max 10 MB)")

    import hashlib
    pdf_hash = hashlib.sha256(content).hexdigest()

    conn = get_db()
    try:
        gia = conn.execute(
            "SELECT id, numero_bolletta FROM cg_utenze_bollette WHERE pdf_hash = ?",
            (pdf_hash,),
        ).fetchone()
    finally:
        conn.close()

    # Archivia (idempotente: stesso hash → stesso file)
    dest = _path_archivio(pdf_hash)
    if dest is None:
        safe_name = Path(file.filename).name.replace(" ", "_")
        dest = _archivio_dir() / f"{pdf_hash[:16]}_{safe_name}"
        dest.write_bytes(content)

    try:
        parsed = parse_bolletta_a2a(dest)
    except UnsupportedLayoutError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore parsing PDF: {e}")

    return {
        "gia_importata": bool(gia),
        "bolletta_esistente_id": gia["id"] if gia else None,
        "parsed": parsed,
        "pdf_hash": pdf_hash,
    }


# ─────────────────────────────────────────────────────────────────
# Conferma (fase 2 — scrive)
# ─────────────────────────────────────────────────────────────────

class ConfermaBody(BaseModel):
    pdf_hash: str


def _upsert_fornitura(conn, p: dict) -> int:
    row = conn.execute(
        "SELECT id FROM cg_utenze_forniture WHERE numero_fornitura = ?",
        (p["numero_fornitura"],),
    ).fetchone()
    campi = dict(
        tipo=p["tipo"],
        fornitore=p.get("fornitore"),
        pod_pdr=p.get("pod_pdr"),
        indirizzo=p.get("indirizzo_fornitura"),
        offerta=p.get("offerta"),
        codice_offerta=p.get("codice_offerta"),
        indice_riferimento=p.get("indice_riferimento"),
        spread=p.get("spread"),
        scadenza_condizioni=p.get("scadenza_condizioni"),
        potenza_impegnata_kw=p.get("potenza_impegnata_kw"),
    )
    if row:
        sets = ", ".join(f"{k} = ?" for k in campi)
        conn.execute(
            f"UPDATE cg_utenze_forniture SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [*campi.values(), row["id"]],
        )
        return row["id"]
    cols = ", ".join(["numero_fornitura", *campi])
    qs = ", ".join("?" * (len(campi) + 1))
    cur = conn.execute(
        f"INSERT INTO cg_utenze_forniture ({cols}) VALUES ({qs})",
        [p["numero_fornitura"], *campi.values()],
    )
    return cur.lastrowid


def _consumi_da_parsed(p: dict) -> list[dict]:
    """Storico 18 mesi + potenza mensile → righe cg_utenze_consumi_mensili."""
    righe = []
    unita = p.get("unita")
    storico = p.get("storico_mensile") or {}
    potenza = p.get("potenza_max_mensile") or {}

    if p["tipo"] == "LUCE":
        for mese, fasce in storico.items():
            tot = 0.0
            for fascia in ("F1", "F2", "F3"):
                v = fasce.get(fascia)
                if v is None:
                    continue
                tot += v
                righe.append(dict(anno_mese=mese, fascia=fascia, consumo=v,
                                  unita=unita, potenza_max_kw=None))
            righe.append(dict(anno_mese=mese, fascia="TOT", consumo=tot,
                              unita=unita, potenza_max_kw=potenza.get(mese)))
        # mesi con potenza ma fuori dallo storico fasce (finestre diverse: 12 vs 18)
        for mese, kw in potenza.items():
            if mese not in storico:
                righe.append(dict(anno_mese=mese, fascia="TOT", consumo=None,
                                  unita=unita, potenza_max_kw=kw))
    else:  # GAS
        for mese, v in storico.items():
            reale = v.get("reale") or 0.0
            stimata = v.get("stimata") or 0.0
            righe.append(dict(anno_mese=mese, fascia="TOT", consumo=reale + stimata,
                              unita=unita, potenza_max_kw=None))
            righe.append(dict(anno_mese=mese, fascia="STIMATA", consumo=stimata,
                              unita=unita, potenza_max_kw=None))
    return righe


@router.post("/conferma")
def conferma_bolletta(body: ConfermaBody, current_user=Depends(get_current_user)):
    """
    Scrive la bolletta precedentemente caricata con /upload (individuata dal
    pdf_hash): upsert fornitura, insert bolletta, upsert consumi mensili
    (vince la bolletta con data emissione più recente), aggancio fe_fatture.
    """
    pdf_path = _path_archivio(body.pdf_hash)
    if pdf_path is None:
        raise HTTPException(status_code=404, detail="PDF non trovato in archivio: rifai l'upload")

    try:
        p = parse_bolletta_a2a(pdf_path)
    except UnsupportedLayoutError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not p.get("numero_bolletta") or not p.get("numero_fornitura"):
        raise HTTPException(
            status_code=422,
            detail="Parser senza numero bolletta/fornitura: impossibile importare "
                   f"(warnings: {p.get('warnings')})",
        )

    conn = get_db()
    try:
        gia = conn.execute(
            "SELECT id FROM cg_utenze_bollette WHERE pdf_hash = ? OR numero_bolletta = ?",
            (p["fonte_hash"], p["numero_bolletta"]),
        ).fetchone()
        if gia:
            raise HTTPException(status_code=409, detail="Bolletta già importata")

        fornitura_id = _upsert_fornitura(conn, p)

        # Aggancio contabilità: numero bolletta == fe_fatture.numero_fattura
        # (verificato su dati reali 2026-07-17). Solo fatture A2A per prudenza.
        fe = conn.execute(
            "SELECT id FROM fe_fatture WHERE numero_fattura = ? "
            "AND fornitore_nome LIKE '%A2A%' ORDER BY id LIMIT 1",
            (p["numero_bolletta"],),
        ).fetchone()

        cur = conn.execute(
            """
            INSERT INTO cg_utenze_bollette (
                fornitura_id, numero_bolletta, data_emissione, periodo_da,
                periodo_a, scadenza_pagamento, unita, consumo_fatturato,
                consumo_stimato, totale, accise_iva, prezzo_medio,
                prezzo_energia, prezzo_rete_oneri, quota_fissa_importo,
                quota_potenza_importo, spread, valori_indice, fe_fattura_id,
                pdf_filename, pdf_hash, parsed_json, warnings
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                fornitura_id, p["numero_bolletta"], p.get("data_emissione"),
                p.get("periodo_da"), p.get("periodo_a"), p.get("scadenza_pagamento"),
                p.get("unita"), p.get("consumo_fatturato"), p.get("consumo_stimato"),
                p.get("totale_da_pagare"), p.get("accise_iva"), p.get("prezzo_medio"),
                p.get("prezzo_energia"), p.get("prezzo_rete_oneri"),
                p.get("quota_fissa_importo"), p.get("quota_potenza_importo"),
                p.get("spread"), json.dumps(p.get("valori_indice") or {}),
                fe["id"] if fe else None, pdf_path.name, p["fonte_hash"],
                json.dumps(p, ensure_ascii=False), json.dumps(p.get("warnings") or []),
            ),
        )
        bolletta_id = cur.lastrowid

        # Upsert consumi mensili: vince la bolletta con data emissione più recente
        emissione = p.get("data_emissione") or ""
        n_upsert = 0
        for r in _consumi_da_parsed(p):
            conn.execute(
                """
                INSERT INTO cg_utenze_consumi_mensili
                    (fornitura_id, anno_mese, fascia, consumo, unita,
                     potenza_max_kw, fonte_bolletta_id, fonte_data_emissione)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT (fornitura_id, anno_mese, fascia) DO UPDATE SET
                    consumo = excluded.consumo,
                    unita = excluded.unita,
                    potenza_max_kw = COALESCE(excluded.potenza_max_kw, potenza_max_kw),
                    fonte_bolletta_id = excluded.fonte_bolletta_id,
                    fonte_data_emissione = excluded.fonte_data_emissione
                WHERE excluded.fonte_data_emissione >= COALESCE(fonte_data_emissione, '')
                """,
                (fornitura_id, r["anno_mese"], r["fascia"], r["consumo"],
                 r["unita"], r["potenza_max_kw"], bolletta_id, emissione),
            )
            n_upsert += 1

        # Retro-aggancio: bollette confermate PRIMA che la fattura arrivasse
        # in fe_fatture (es. bolletta caricata il giorno dell'emissione, sync
        # FIC giorni dopo) si agganciano alla prima conferma successiva.
        conn.execute(
            """
            UPDATE cg_utenze_bollette SET fe_fattura_id = (
                SELECT f.id FROM fe_fatture f
                WHERE f.numero_fattura = cg_utenze_bollette.numero_bolletta
                  AND f.fornitore_nome LIKE '%A2A%' LIMIT 1
            )
            WHERE fe_fattura_id IS NULL
            """
        )
        conn.commit()

        return {
            "ok": True,
            "bolletta_id": bolletta_id,
            "fornitura_id": fornitura_id,
            "fe_fattura_id": fe["id"] if fe else None,
            "consumi_upsert": n_upsert,
            "warnings": p.get("warnings") or [],
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────
# Lettura
# ─────────────────────────────────────────────────────────────────

@router.get("/")
def dashboard_utenze(current_user=Depends(get_current_user)):
    """
    Dashboard: forniture con ultima bolletta + KPI.
    KPI per fornitura: €/unità all-in ultima bolletta, spesa annua dichiarata,
    giorni alla scadenza condizioni, % consumo stimato (gas), potenza max
    12 mesi vs impegnata (luce).
    """
    conn = get_db()
    try:
        out = []
        for f in conn.execute(
            "SELECT * FROM cg_utenze_forniture WHERE attiva = 1 ORDER BY tipo"
        ).fetchall():
            f = dict(f)
            ultima = conn.execute(
                "SELECT * FROM cg_utenze_bollette WHERE fornitura_id = ? "
                "ORDER BY data_emissione DESC, id DESC LIMIT 1",
                (f["id"],),
            ).fetchone()
            ultima = dict(ultima) if ultima else None
            kpi = {}
            if ultima:
                if ultima["consumo_fatturato"]:
                    kpi["prezzo_allin"] = round(
                        (ultima["totale"] or 0) / ultima["consumo_fatturato"], 4
                    )
                if f["tipo"] == "GAS" and ultima["consumo_fatturato"]:
                    kpi["pct_stimato"] = round(
                        100.0 * (ultima["consumo_stimato"] or 0) / ultima["consumo_fatturato"], 1
                    )
                parsed = json.loads(ultima.pop("parsed_json") or "{}")
                kpi["spesa_annua"] = parsed.get("spesa_annua")
                kpi["consumo_annuo"] = parsed.get("consumo_annuo")
            if f["scadenza_condizioni"]:
                try:
                    delta = (
                        datetime.strptime(f["scadenza_condizioni"], "%Y-%m-%d").date()
                        - datetime.now().date()
                    ).days
                    kpi["giorni_a_scadenza_condizioni"] = delta
                except ValueError:
                    pass
            if f["tipo"] == "LUCE":
                row = conn.execute(
                    "SELECT MAX(potenza_max_kw) AS mx FROM cg_utenze_consumi_mensili "
                    "WHERE fornitura_id = ? AND anno_mese >= ?",
                    (f["id"], (datetime.now().date().replace(day=1)
                               .replace(year=datetime.now().year - 1)).strftime("%Y-%m")),
                ).fetchone()
                kpi["potenza_max_12m_kw"] = row["mx"] if row else None
            out.append({"fornitura": f, "ultima_bolletta": ultima, "kpi": kpi})
        return {"forniture": out}
    finally:
        conn.close()


@router.get("/consumi")
def serie_consumi(
    fornitura_id: int | None = None,
    da: str | None = None,   # 'YYYY-MM'
    a: str | None = None,    # 'YYYY-MM'
    current_user=Depends(get_current_user),
):
    """Serie mensile per i grafici (filtri opzionali fornitura/range)."""
    q = ("SELECT fornitura_id, anno_mese, fascia, consumo, unita, potenza_max_kw "
         "FROM cg_utenze_consumi_mensili WHERE 1=1")
    params: list = []
    if fornitura_id:
        q += " AND fornitura_id = ?"
        params.append(fornitura_id)
    if da:
        q += " AND anno_mese >= ?"
        params.append(da)
    if a:
        q += " AND anno_mese <= ?"
        params.append(a)
    q += " ORDER BY anno_mese, fascia"
    conn = get_db()
    try:
        return {"consumi": [dict(r) for r in conn.execute(q, params).fetchall()]}
    finally:
        conn.close()


@router.get("/bollette/{bolletta_id}")
def dettaglio_bolletta(bolletta_id: int, current_user=Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM cg_utenze_bollette WHERE id = ?", (bolletta_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Bolletta non trovata")
        d = dict(row)
        d["parsed"] = json.loads(d.pop("parsed_json") or "{}")
        d["valori_indice"] = json.loads(d["valori_indice"] or "{}")
        d["warnings"] = json.loads(d["warnings"] or "[]")
        return d
    finally:
        conn.close()


@router.delete("/bollette/{bolletta_id}")
def elimina_bolletta(bolletta_id: int, current_user=Depends(get_current_user)):
    """
    Elimina la bolletta e le righe consumi di cui era fonte.
    NB: i mesi il cui dato veniva da questa bolletta spariscono dalla serie
    finché non si ricarica una bolletta che li copre (documentato in spec §5).
    """
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM cg_utenze_bollette WHERE id = ?", (bolletta_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Bolletta non trovata")
        n = conn.execute(
            "DELETE FROM cg_utenze_consumi_mensili WHERE fonte_bolletta_id = ?",
            (bolletta_id,),
        ).rowcount
        conn.execute("DELETE FROM cg_utenze_bollette WHERE id = ?", (bolletta_id,))
        conn.commit()
        return {"ok": True, "consumi_rimossi": n}
    finally:
        conn.close()
