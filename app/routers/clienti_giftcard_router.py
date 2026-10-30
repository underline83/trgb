# ============================================================
# FILE: app/routers/clienti_giftcard_router.py
# Router Gift Card — TRGB Gestionale
# ============================================================
# Modulo: clienti
# Classificazione: [core] — funzionalita' di prodotto generica
#
# module.json (pre-R8, da raccogliere in R8):
#   id: clienti
#   endpoint prefix: /clienti/giftcard
#   tabelle DB: clienti_giftcard, clienti_giftcard_movimenti
#   frontend route: /clienti/giftcard
#   dipendenze platform: auth
#   dipendenze opzionali: M.F alert engine (scadenze), M.B PDF (buono stampabile)
# ============================================================

# @version: v1.0-giftcard
# -*- coding: utf-8 -*-
"""
Gift Card — emissione, ricerca per codice, scarico, annullamento.

MODELLO A USO UNICO (decisione Marco, 2026-08-08):
  una card si emette, si scarica in un colpo solo, o si annulla.
  Nessun saldo residuo parziale.

DUE DIMENSIONI SEPARATE (stessa disciplina di stato_pagamento_unificato §15):
  - CICLO DI VITA (`stato`): attiva | usata | annullata
  - SCADENZA (`data_scadenza`): dimensione temporale, calcolata a runtime
    nel campo derivato `scaduta`. NON esiste stato='scaduta'.
  Una card scaduta e' `stato='attiva'` + `scaduta=true`. Non e' spendibile,
  ma resta riattivabile/prorogabile senza dover "resuscitare" uno stato.

CONTABILITA' (decisione Marco, 2026-08-08):
  il modulo NON scrive nulla nei corrispettivi ne' nelle chiusure turno.
  Ne' all'emissione ne' allo scarico. E' un registro informativo: i numeri
  di cassa li inserisce Marco dove servono. Nessun import da router cassa
  (regola 2 disciplina modulare).
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.clienti_db import get_clienti_conn, init_clienti_db
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.clienti.giftcard")

from app.services.permessi import richiede_ruoli

# PERMESSI (2026-09-01, M.G) — gift card
# Erano aperte emissione e scarico delle gift card, cioe' la creazione e il consumo di valore. La sala le usa al banco: resta dentro (decisione Marco 2026-09-01).
# Ruoli da modules.json (`clienti`): admin, contabile, sala, sommelier (+superadmin implicito).
# Contesto: docs/audit_permessi_2026-09-01.md
router = APIRouter(prefix="/clienti/giftcard", tags=["Clienti - Gift Card"],
    dependencies=[
        Depends(richiede_ruoli("admin", "contabile", "sala", "sommelier", "capo_sala", cosa="gift card")),
    ],
)

# Pagina del QR (/regalo/<token>): senza login, la apre il cliente che
# inquadra l'etichetta sul buono. Montato in main.py accanto a `router`.
public_router = APIRouter(prefix="/public/regalo", tags=["Clienti - Gift Card (pubblico)"])

init_clienti_db()

# 'in_bianco' (2026-10-29): codice gia' stampato (scatoline di Natale) ma non
# ancora venduto. Niente importo, non spendibile, fuori da valore e avvisi
# (che guardano tutti stato='attiva'). Diventa 'attiva' con POST /{id}/vendi.
STATI_VALIDI = {"in_bianco", "attiva", "usata", "annullata"}
TIPI_VALIDI = {"valore", "esperienza"}

# Schema storico dei codici Tre Gobbi: <lettera>1<AA>-<progressivo>.
# `B126-354` = serie B, anno 2026, progressivo 354.
# Il progressivo NON riparte da 1 ogni anno: prosegue (281 nel 2024,
# 341 nel 2025, 353 nel 2026). L'anno sta nel codice, il contatore no.
RE_CODICE_SERIE = re.compile(r"^([A-Za-z])1(\d{2})-(\d+)$")


# ─────────────────────────────────────────────────────────────
# Impostazioni (mai soglie hardcoded)
# ─────────────────────────────────────────────────────────────

def _get_setting(conn, chiave: str, default: str) -> str:
    row = conn.execute(
        "SELECT valore FROM clienti_impostazioni WHERE chiave = ?", (chiave,)
    ).fetchone()
    return row["valore"] if row else default


def _prossimo_progressivo(conn) -> int:
    """
    Il progressivo piu' alto in circolazione + 1, contando TUTTE le serie e
    tutti gli anni: il contatore e' unico e non si azzera a Capodanno.
    Si guardano anche le card annullate e usate, altrimenti un numero
    gia' stampato su un buono in mano a qualcuno verrebbe riassegnato.
    """
    massimo = 0
    for (codice,) in conn.execute("SELECT codice FROM clienti_giftcard").fetchall():
        m = RE_CODICE_SERIE.match((codice or "").strip())
        if m:
            massimo = max(massimo, int(m.group(3)))
    return massimo + 1


def _genera_codice(conn) -> str:
    """
    Prossimo codice della serie: `B126-354`.

    - lettera: impostazione `giftcard_prefisso` (cambia quando cambia
      bollettario — era A fino al 2025, B dal 2026). La decide Marco, il
      sistema non la tocca mai da solo.
    - anno: le ultime 2 cifre dell'anno corrente.
    - progressivo: continuo su tutte le serie (vedi `_prossimo_progressivo`).

    Se il codice risultante esistesse gia' (progressivo scritto a mano fuori
    sequenza, o due emissioni nello stesso istante) si avanza al primo libero.
    """
    lettera = (_get_setting(conn, "giftcard_prefisso", "B") or "B").strip().upper()[:1] or "B"
    anno = datetime.now().strftime("%y")
    progressivo = _prossimo_progressivo(conn)

    for _ in range(50):
        codice = f"{lettera}1{anno}-{progressivo}"
        esiste = conn.execute(
            "SELECT 1 FROM clienti_giftcard "
            "WHERE REPLACE(REPLACE(UPPER(codice),'-',''),' ','') = ?",
            (_normalizza_codice(codice),),
        ).fetchone()
        if not esiste:
            return codice
        progressivo += 1
    raise HTTPException(500, "Impossibile calcolare il prossimo codice libero, riprova")


def _nuovo_token(conn) -> str:
    """Chiave casuale del QR (96 bit): non si indovina, a differenza del codice."""
    for _ in range(10):
        t = secrets.token_urlsafe(12)
        if not conn.execute("SELECT 1 FROM clienti_giftcard WHERE token_pubblico = ?", (t,)).fetchone():
            return t
    raise HTTPException(500, "Impossibile generare la chiave del QR, riprova")


def _assicura_token(conn, gc_id: int) -> str:
    """Le card nate prima della mig 213 (o importate) prendono la chiave alla prima etichetta."""
    row = conn.execute("SELECT token_pubblico FROM clienti_giftcard WHERE id = ?", (gc_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Gift card non trovata")
    if row["token_pubblico"]:
        return row["token_pubblico"]
    t = _nuovo_token(conn)
    conn.execute("UPDATE clienti_giftcard SET token_pubblico = ? WHERE id = ?", (t, gc_id))
    conn.commit()
    return t


def _normalizza_codice(codice: str) -> str:
    """
    Chi cerca al telefono scrive 'tg4kmp9xqd' o 'TG 4KMP 9XQD'.
    Normalizziamo a maiuscolo senza separatori per il confronto.
    """
    return "".join(ch for ch in (codice or "").upper() if ch.isalnum())


# ─────────────────────────────────────────────────────────────
# Serializzazione
# ─────────────────────────────────────────────────────────────

def _serializza(row) -> Dict[str, Any]:
    d = dict(row)

    # `scaduta` e' DERIVATO, non uno stato salvato. Vedi docstring modulo.
    scaduta = False
    giorni_alla_scadenza = None
    if d.get("data_scadenza"):
        try:
            scad = datetime.strptime(d["data_scadenza"], "%Y-%m-%d").date()
            giorni_alla_scadenza = (scad - date.today()).days
            scaduta = giorni_alla_scadenza < 0
        except ValueError:
            logger.warning("data_scadenza non parsabile su giftcard %s", d.get("id"))

    d["scaduta"] = scaduta
    d["giorni_alla_scadenza"] = giorni_alla_scadenza
    # Spendibile = viva E non scaduta. E' questo il flag che guarda la sala.
    d["spendibile"] = (d.get("stato") == "attiva") and not scaduta
    return d


def _carica(conn, gc_id: int):
    row = conn.execute(
        """
        SELECT g.*, c.nome AS cliente_nome, c.cognome AS cliente_cognome
        FROM clienti_giftcard g
        LEFT JOIN clienti c ON c.id = g.cliente_id
        WHERE g.id = ?
        """,
        (gc_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Gift card non trovata")
    return row


def _log_movimento(conn, gc_id: int, azione: str, stato_prima: Optional[str],
                   stato_dopo: Optional[str], utente: str, note: Optional[str] = None):
    conn.execute(
        """
        INSERT INTO clienti_giftcard_movimenti
            (giftcard_id, azione, stato_prima, stato_dopo, utente, note)
        VALUES (?,?,?,?,?,?)
        """,
        (gc_id, azione, stato_prima, stato_dopo, utente, note),
    )


# ─────────────────────────────────────────────────────────────
# Modelli
# ─────────────────────────────────────────────────────────────

class GiftCardCreate(BaseModel):
    tipo: str = Field(default="valore", description="'valore' o 'esperienza'")
    importo: Optional[float] = None
    descrizione: Optional[str] = None
    cliente_id: Optional[int] = None
    intestatario_nome: Optional[str] = None
    # Codice libero: serve per registrare buoni gia' in circolazione
    # (lo storico Excel) senza rigenerarli. Se assente, lo generiamo noi.
    codice: Optional[str] = None
    data_scadenza: Optional[str] = None
    mesi_validita: Optional[int] = None
    note: Optional[str] = None


class GiftCardUpdate(BaseModel):
    tipo: Optional[str] = None
    importo: Optional[float] = None
    descrizione: Optional[str] = None
    cliente_id: Optional[int] = None
    intestatario_nome: Optional[str] = None
    data_scadenza: Optional[str] = None
    note: Optional[str] = None


class InBiancoCreate(BaseModel):
    quantita: int = Field(..., ge=1, le=200)
    # Scadenza fissa del lotto (es. le scatoline di Natale: 2027-12-25).
    # Vuota = la scadenza la calcola la vendita con giftcard_validita_mesi.
    data_scadenza: Optional[str] = None
    note: Optional[str] = None


class VenditaRequest(BaseModel):
    tipo: str = Field(default="valore", description="'valore' o 'esperienza'")
    importo: Optional[float] = None
    descrizione: Optional[str] = None
    cliente_id: Optional[int] = None
    intestatario_nome: Optional[str] = None
    note: Optional[str] = None


class AzioneRequest(BaseModel):
    note: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Lista e statistiche
# ─────────────────────────────────────────────────────────────

@router.get("/")
def lista_giftcard(
    stato: Optional[str] = Query(None, description="in_bianco | attiva | usata | annullata"),
    tipo: Optional[str] = Query(None),
    cliente_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None, description="Ricerca su codice, intestatario, descrizione"),
    solo_spendibili: bool = Query(False),
    solo_scadute: bool = Query(False),
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        where = []
        params: List[Any] = []

        if stato:
            where.append("g.stato = ?")
            params.append(stato)
        if tipo:
            where.append("g.tipo = ?")
            params.append(tipo)
        if cliente_id:
            where.append("g.cliente_id = ?")
            params.append(cliente_id)
        if q:
            like = f"%{q.strip()}%"
            where.append("""(
                g.codice LIKE ? OR g.intestatario_nome LIKE ? OR g.descrizione LIKE ?
                OR c.nome LIKE ? OR c.cognome LIKE ?
            )""")
            params.extend([like] * 5)

        # Filtri su scadenza: la dimensione temporale si filtra in SQL sulla
        # data, mai su `stato` (che non contiene 'scaduta').
        oggi = date.today().isoformat()
        if solo_spendibili:
            where.append("g.stato = 'attiva' AND (g.data_scadenza IS NULL OR g.data_scadenza >= ?)")
            params.append(oggi)
        if solo_scadute:
            where.append("g.stato = 'attiva' AND g.data_scadenza IS NOT NULL AND g.data_scadenza < ?")
            params.append(oggi)

        sql_where = ("WHERE " + " AND ".join(where)) if where else ""

        totale = conn.execute(
            f"""
            SELECT COUNT(*) AS n FROM clienti_giftcard g
            LEFT JOIN clienti c ON c.id = g.cliente_id
            {sql_where}
            """,
            params,
        ).fetchone()["n"]

        rows = conn.execute(
            f"""
            SELECT g.*, c.nome AS cliente_nome, c.cognome AS cliente_cognome
            FROM clienti_giftcard g
            LEFT JOIN clienti c ON c.id = g.cliente_id
            {sql_where}
            ORDER BY g.data_emissione DESC, g.id DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()

        return {
            "totale": totale,
            "items": [_serializza(r) for r in rows],
        }
    finally:
        conn.close()


@router.get("/stats")
def stats_giftcard(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Numeri per la testata della pagina."""
    conn = get_clienti_conn()
    try:
        oggi = date.today().isoformat()
        alert_giorni = int(_get_setting(conn, "giftcard_alert_giorni", "30") or 30)
        limite = (date.today() + timedelta(days=alert_giorni)).isoformat()

        r = conn.execute(
            """
            SELECT
              SUM(CASE WHEN stato<>'in_bianco' THEN 1 ELSE 0 END) AS totali,
              SUM(CASE WHEN stato='attiva'    THEN 1 ELSE 0 END) AS attive,
              SUM(CASE WHEN stato='usata'     THEN 1 ELSE 0 END) AS usate,
              SUM(CASE WHEN stato='annullata' THEN 1 ELSE 0 END) AS annullate,
              SUM(CASE WHEN stato='in_bianco' THEN 1 ELSE 0 END) AS in_bianco
            FROM clienti_giftcard
            """
        ).fetchone()

        spendibili = conn.execute(
            """
            SELECT COUNT(*) AS n, COALESCE(SUM(importo),0) AS valore
            FROM clienti_giftcard
            WHERE stato='attiva' AND (data_scadenza IS NULL OR data_scadenza >= ?)
            """,
            (oggi,),
        ).fetchone()

        scadute = conn.execute(
            """
            SELECT COUNT(*) AS n FROM clienti_giftcard
            WHERE stato='attiva' AND data_scadenza IS NOT NULL AND data_scadenza < ?
            """,
            (oggi,),
        ).fetchone()

        in_scadenza = conn.execute(
            """
            SELECT COUNT(*) AS n FROM clienti_giftcard
            WHERE stato='attiva' AND data_scadenza IS NOT NULL
              AND data_scadenza >= ? AND data_scadenza <= ?
            """,
            (oggi, limite),
        ).fetchone()

        return {
            "totali": r["totali"] or 0,
            "attive": r["attive"] or 0,
            "usate": r["usate"] or 0,
            "annullate": r["annullate"] or 0,
            "in_bianco": r["in_bianco"] or 0,
            "spendibili": spendibili["n"] or 0,
            # Valore ancora "aperto" verso i clienti: quanto potrebbero
            # presentarsi a incassare domani. Solo card a valore.
            "valore_spendibile": round(spendibili["valore"] or 0, 2),
            "scadute": scadute["n"] or 0,
            "in_scadenza": in_scadenza["n"] or 0,
            "alert_giorni": alert_giorni,
        }
    finally:
        conn.close()


@router.get("/impostazioni")
def get_impostazioni(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_clienti_conn()
    try:
        importi_raw = _get_setting(conn, "giftcard_importi_rapidi", "[25,50,100,150,200]")
        try:
            importi = json.loads(importi_raw)
        except (json.JSONDecodeError, TypeError):
            importi = [25, 50, 100, 150, 200]
        return {
            "prefisso": _get_setting(conn, "giftcard_prefisso", "B"),
            "validita_mesi": int(_get_setting(conn, "giftcard_validita_mesi", "12") or 12),
            "alert_giorni": int(_get_setting(conn, "giftcard_alert_giorni", "30") or 30),
            "importi_rapidi": importi,
            # Mostrato in emissione: chi emette vede che numero sta per uscire
            # prima di confermare, e si accorge subito se la serie e' sfasata.
            "prossimo_codice": _genera_codice(conn),
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Lookup per codice — l'endpoint che usa la sala
# ─────────────────────────────────────────────────────────────

@router.get("/lookup/{codice}")
def lookup_codice(codice: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Cerca una card dal codice digitato al banco, tollerando maiuscole,
    spazi e trattini mancanti. Risponde SEMPRE 200 con `trovata`:
    "codice inesistente" e' un esito da mostrare, non un errore HTTP.
    """
    norm = _normalizza_codice(codice)
    if not norm:
        return {"trovata": False, "motivo": "Codice vuoto"}

    conn = get_clienti_conn()
    try:
        row = conn.execute(
            """
            SELECT g.*, c.nome AS cliente_nome, c.cognome AS cliente_cognome
            FROM clienti_giftcard g
            LEFT JOIN clienti c ON c.id = g.cliente_id
            WHERE REPLACE(REPLACE(UPPER(g.codice),'-',''),' ','') = ?
            """,
            (norm,),
        ).fetchone()

        if not row:
            return {"trovata": False, "motivo": "Nessuna gift card con questo codice"}

        gc = _serializza(row)

        if gc["stato"] == "in_bianco":
            gc["motivo"] = "Non ancora venduta: premi Vendi e scrivi il prezzo"
        elif gc["stato"] == "usata":
            gc["motivo"] = f"Gia' utilizzata il {gc.get('data_utilizzo') or '?'}"
        elif gc["stato"] == "annullata":
            gc["motivo"] = "Gift card annullata"
        elif gc["scaduta"]:
            gc["motivo"] = f"Scaduta il {gc['data_scadenza']}"
        else:
            gc["motivo"] = None

        return {"trovata": True, **gc}
    finally:
        conn.close()


@router.get("/qr/{token}")
def da_qr(token: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    La card dalla chiave del QR, per lo staff loggato che inquadra l'etichetta
    (pagina /regalo/<token>). Stessi dati del lookup per codice.
    """
    conn = get_clienti_conn()
    try:
        row = conn.execute(
            "SELECT id FROM clienti_giftcard WHERE token_pubblico = ?", ((token or "").strip(),)
        ).fetchone()
        if not row:
            return {"trovata": False, "motivo": "QR non riconosciuto"}
        gc = _serializza(_carica(conn, row["id"]))
        if gc["stato"] == "in_bianco":
            gc["motivo"] = "Non ancora venduta: premi Vendi e scrivi il prezzo"
        elif gc["stato"] == "usata":
            gc["motivo"] = f"Gia' utilizzata il {gc.get('data_utilizzo') or '?'}"
        elif gc["stato"] == "annullata":
            gc["motivo"] = "Gift card annullata"
        elif gc["scaduta"]:
            gc["motivo"] = f"Scaduta il {gc['data_scadenza']}"
        else:
            gc["motivo"] = None
        return {"trovata": True, **gc}
    finally:
        conn.close()


@router.get("/{gc_id}/etichetta")
def etichetta_giftcard(gc_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Dati per l'etichetta QR (Brother 62x29): codice, scadenza, chiave del QR."""
    conn = get_clienti_conn()
    try:
        token = _assicura_token(conn, gc_id)
        gc = _serializza(_carica(conn, gc_id))
        return {"id": gc_id, "codice": gc["codice"], "data_scadenza": gc.get("data_scadenza"),
                "token": token}
    finally:
        conn.close()


@router.get("/{gc_id}")
def dettaglio_giftcard(gc_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_clienti_conn()
    try:
        gc = _serializza(_carica(conn, gc_id))
        movimenti = conn.execute(
            """
            SELECT * FROM clienti_giftcard_movimenti
            WHERE giftcard_id = ? ORDER BY id DESC
            """,
            (gc_id,),
        ).fetchall()
        gc["movimenti"] = [dict(m) for m in movimenti]
        return gc
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Emissione
# ─────────────────────────────────────────────────────────────

@router.post("/")
def crea_giftcard(body: GiftCardCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    if body.tipo not in TIPI_VALIDI:
        raise HTTPException(400, f"Tipo non valido: {body.tipo}")

    if body.tipo == "valore":
        if body.importo is None or body.importo <= 0:
            raise HTTPException(400, "Una gift card a valore richiede un importo maggiore di zero")
    else:
        if not (body.descrizione or "").strip():
            raise HTTPException(400, "Una gift card esperienza richiede una descrizione (es. 'Cena degustazione per 2')")

    conn = get_clienti_conn()
    try:
        if body.codice:
            codice = body.codice.strip().upper()
            gia = conn.execute(
                "SELECT id FROM clienti_giftcard WHERE REPLACE(REPLACE(UPPER(codice),'-',''),' ','') = ?",
                (_normalizza_codice(codice),),
            ).fetchone()
            if gia:
                raise HTTPException(409, f"Il codice {codice} esiste gia'")
        else:
            codice = _genera_codice(conn)

        # Scadenza: esplicita > mesi richiesti > default da impostazioni.
        # validita_mesi = 0 significa "senza scadenza".
        data_scadenza = body.data_scadenza
        if not data_scadenza:
            mesi = body.mesi_validita
            if mesi is None:
                mesi = int(_get_setting(conn, "giftcard_validita_mesi", "12") or 12)
            if mesi and mesi > 0:
                oggi = date.today()
                # +30 giorni per mese: approssimazione voluta, la scadenza
                # esatta e' comunque modificabile a mano in emissione.
                data_scadenza = (oggi + timedelta(days=30 * mesi)).isoformat()

        cur = conn.execute(
            """
            INSERT INTO clienti_giftcard
                (codice, tipo, importo, descrizione, cliente_id, intestatario_nome,
                 stato, data_scadenza, emessa_da, note, token_pubblico)
            VALUES (?,?,?,?,?,?, 'attiva', ?,?,?,?)
            """,
            (
                codice,
                body.tipo,
                # L'importo si conserva anche sulle esperienze: un buono
                # "2 degustazioni" ha comunque un valore incassato, che serve
                # al totale del valore ancora in circolazione. E' il PDF a
                # non stamparlo, non il DB a non saperlo.
                body.importo,
                (body.descrizione or "").strip() or None,
                body.cliente_id,
                (body.intestatario_nome or "").strip() or None,
                data_scadenza,
                current_user["username"],
                (body.note or "").strip() or None,
                _nuovo_token(conn),
            ),
        )
        gc_id = cur.lastrowid
        _log_movimento(conn, gc_id, "emissione", None, "attiva",
                       current_user["username"], body.note)
        conn.commit()
        return JSONResponse({"status": "ok", **_serializza(_carica(conn, gc_id))})
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("Errore emissione gift card")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/in-bianco")
def crea_in_bianco(body: InBiancoCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Un lotto di codici «in bianco»: si stampano le etichette prima (scatoline
    di Natale) e il prezzo si mette quando si vende (POST /{id}/vendi).
    Codici della serie normale, di seguito. Stessi ruoli dell'emissione.
    """
    if body.data_scadenza:
        try:
            datetime.strptime(body.data_scadenza, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "data_scadenza deve essere AAAA-MM-GG")

    conn = get_clienti_conn()
    try:
        ids = []
        for _ in range(body.quantita):
            codice = _genera_codice(conn)
            cur = conn.execute(
                """
                INSERT INTO clienti_giftcard
                    (codice, tipo, stato, data_scadenza, emessa_da, note, token_pubblico)
                VALUES (?, 'valore', 'in_bianco', ?, ?, ?, ?)
                """,
                (codice, body.data_scadenza, current_user["username"],
                 (body.note or "").strip() or None, _nuovo_token(conn)),
            )
            _log_movimento(conn, cur.lastrowid, "in_bianco", None, "in_bianco",
                           current_user["username"], body.note)
            ids.append(cur.lastrowid)
        conn.commit()
        items = [_serializza(_carica(conn, i)) for i in ids]
        return {"status": "ok", "creati": len(items), "items": items}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("Errore creazione gift card in bianco")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/{gc_id}/vendi")
def vendi_giftcard(gc_id: int, body: VenditaRequest,
                   current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Vendita di una card in bianco: si scrive cosa vale e diventa 'attiva'.
    La data di emissione diventa quella della vendita. La scadenza resta
    quella del lotto se c'era, altrimenti parte da oggi (giftcard_validita_mesi).
    """
    if body.tipo not in TIPI_VALIDI:
        raise HTTPException(400, f"Tipo non valido: {body.tipo}")
    if body.tipo == "valore" and (body.importo is None or body.importo <= 0):
        raise HTTPException(400, "Scrivi il prezzo del buono")
    if body.tipo == "esperienza" and not (body.descrizione or "").strip():
        raise HTTPException(400, "Scrivi cosa comprende il buono (es. 'Cena degustazione per 2')")

    conn = get_clienti_conn()
    try:
        row = _carica(conn, gc_id)
        if row["stato"] != "in_bianco":
            raise HTTPException(409, f"La gift card {row['codice']} non e' in bianco (stato: {row['stato']})")

        data_scadenza = row["data_scadenza"]
        if not data_scadenza:
            mesi = int(_get_setting(conn, "giftcard_validita_mesi", "12") or 12)
            if mesi > 0:
                data_scadenza = (date.today() + timedelta(days=30 * mesi)).isoformat()

        conn.execute(
            """
            UPDATE clienti_giftcard
            SET stato = 'attiva', tipo = ?, importo = ?, descrizione = ?,
                cliente_id = ?, intestatario_nome = ?, data_scadenza = ?,
                data_emissione = date('now','localtime'), emessa_da = ?,
                note = COALESCE(?, note)
            WHERE id = ?
            """,
            (
                body.tipo, body.importo, (body.descrizione or "").strip() or None,
                body.cliente_id, None if body.cliente_id else ((body.intestatario_nome or "").strip() or None),
                data_scadenza, current_user["username"], (body.note or "").strip() or None, gc_id,
            ),
        )
        _log_movimento(conn, gc_id, "vendita", "in_bianco", "attiva",
                       current_user["username"], body.note)
        conn.commit()
        return {"status": "ok", **_serializza(_carica(conn, gc_id))}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("Errore vendita gift card %s", gc_id)
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.put("/{gc_id}")
def modifica_giftcard(gc_id: int, body: GiftCardUpdate,
                      current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Correzione dati (intestatario, importo, scadenza, note).
    Il codice NON e' modificabile: e' gia' stampato sul buono in mano al cliente.
    """
    conn = get_clienti_conn()
    try:
        row = _carica(conn, gc_id)
        campi = body.model_dump(exclude_unset=True)
        if not campi:
            return {"status": "ok", "modificati": 0}

        if "tipo" in campi and campi["tipo"] not in TIPI_VALIDI:
            raise HTTPException(400, f"Tipo non valido: {campi['tipo']}")

        set_sql = ", ".join(f"{k} = ?" for k in campi)
        conn.execute(
            f"UPDATE clienti_giftcard SET {set_sql} WHERE id = ?",
            list(campi.values()) + [gc_id],
        )
        _log_movimento(conn, gc_id, "modifica", row["stato"], row["stato"],
                       current_user["username"],
                       "Campi: " + ", ".join(campi.keys()))
        conn.commit()
        return {"status": "ok", **_serializza(_carica(conn, gc_id))}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("Errore modifica gift card %s", gc_id)
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Scarico / annullamento / riattivazione
# ─────────────────────────────────────────────────────────────

@router.post("/{gc_id}/scarica")
def scarica_giftcard(gc_id: int, body: AzioneRequest = AzioneRequest(),
                     current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Scarico: la card e' stata spesa. Uso unico, niente residuo.
    Una card scaduta viene RIFIUTATA qui: se Marco vuole accettarla
    lo stesso, proroga la scadenza (PUT) e poi scarica — cosi' resta
    scritto nei movimenti che e' stata una decisione, non una svista.
    """
    conn = get_clienti_conn()
    try:
        row = _carica(conn, gc_id)
        gc = _serializza(row)

        if gc["stato"] == "in_bianco":
            raise HTTPException(409, "Gift card non ancora venduta: prima Vendi e scrivi il prezzo")
        if gc["stato"] == "usata":
            raise HTTPException(409, f"Gift card gia' utilizzata il {gc.get('data_utilizzo') or '?'}")
        if gc["stato"] == "annullata":
            raise HTTPException(409, "Gift card annullata, non utilizzabile")
        if gc["scaduta"]:
            raise HTTPException(409, f"Gift card scaduta il {gc['data_scadenza']}. Prorogare la scadenza per accettarla.")

        conn.execute(
            """
            UPDATE clienti_giftcard
            SET stato = 'usata',
                data_utilizzo = date('now','localtime'),
                utilizzata_da = ?
            WHERE id = ?
            """,
            (current_user["username"], gc_id),
        )
        _log_movimento(conn, gc_id, "scarico", gc["stato"], "usata",
                       current_user["username"], body.note)
        conn.commit()
        return {"status": "ok", **_serializza(_carica(conn, gc_id))}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("Errore scarico gift card %s", gc_id)
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/{gc_id}/annulla")
def annulla_giftcard(gc_id: int, body: AzioneRequest = AzioneRequest(),
                     current_user: Dict[str, Any] = Depends(get_current_user)):
    """Annullamento: buono perso, rimborsato, emesso per sbaglio."""
    conn = get_clienti_conn()
    try:
        row = _carica(conn, gc_id)
        if row["stato"] == "annullata":
            return {"status": "ok", **_serializza(row)}

        conn.execute("UPDATE clienti_giftcard SET stato = 'annullata' WHERE id = ?", (gc_id,))
        _log_movimento(conn, gc_id, "annullo", row["stato"], "annullata",
                       current_user["username"], body.note)
        conn.commit()
        return {"status": "ok", **_serializza(_carica(conn, gc_id))}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("Errore annullamento gift card %s", gc_id)
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/{gc_id}/riattiva")
def riattiva_giftcard(gc_id: int, body: AzioneRequest = AzioneRequest(),
                      current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Rimette in circolo una card scaricata o annullata per errore.
    Solo admin: e' la scappatoia per gli sbagli al banco, non un'operazione
    di routine. Resta tracciata nei movimenti.
    """
    if current_user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(403, "Solo un amministratore puo' riattivare una gift card")

    conn = get_clienti_conn()
    try:
        row = _carica(conn, gc_id)
        if row["stato"] in ("attiva", "in_bianco"):
            return {"status": "ok", **_serializza(row)}

        # Una card mai venduta (niente importo ne' descrizione) torna in bianco,
        # non 'attiva': sarebbe spendibile senza che nessuno l'abbia pagata.
        nuovo = "in_bianco" if (row["importo"] is None and not row["descrizione"]) else "attiva"
        conn.execute(
            """
            UPDATE clienti_giftcard
            SET stato = ?, data_utilizzo = NULL, utilizzata_da = NULL
            WHERE id = ?
            """,
            (nuovo, gc_id),
        )
        _log_movimento(conn, gc_id, "riattivazione", row["stato"], nuovo,
                       current_user["username"], body.note)
        conn.commit()
        return {"status": "ok", **_serializza(_carica(conn, gc_id))}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("Errore riattivazione gift card %s", gc_id)
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/{gc_id}/pdf")
def pdf_giftcard(gc_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Buono stampabile A5 da consegnare al cliente.
    Identita' visiva del LOCALE (branding.json → client_pdf), non del gestionale.
    """
    from fastapi.responses import Response

    conn = get_clienti_conn()
    try:
        gc = _serializza(_carica(conn, gc_id))
    finally:
        conn.close()

    try:
        from app.services.giftcard_pdf_service import genera_pdf_giftcard
        pdf_bytes = genera_pdf_giftcard(gc)
    except ImportError as e:
        logger.exception("weasyprint non disponibile")
        raise HTTPException(500, f"Generazione PDF non disponibile sul server: {e}")
    except Exception as e:
        logger.exception("Errore generazione PDF gift card %s", gc_id)
        raise HTTPException(500, str(e))

    nome_file = f"buono_{(gc.get('codice') or gc_id)}.pdf".replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nome_file}"'},
    )


@router.delete("/{gc_id}")
def elimina_giftcard(gc_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Cancellazione fisica: solo per righe inserite per sbaglio.
    Per un buono realmente emesso si usa /annulla, che lascia traccia.
    """
    if current_user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(403, "Solo un amministratore puo' eliminare una gift card")

    conn = get_clienti_conn()
    try:
        _carica(conn, gc_id)
        conn.execute("DELETE FROM clienti_giftcard WHERE id = ?", (gc_id,))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Pubblico — la pagina del QR vista dal cliente (senza login)
# ─────────────────────────────────────────────────────────────

def _colori_regalo() -> Dict[str, str]:
    """Colori della pagina del QR da branding.json → giftcard (identita' del locale, non di TRGB)."""
    colori = {"fondo": "#2b2b2b", "carta": "#faf8f4", "oro": "#8a7a5c", "oro_chiaro": "#d8cdb6"}
    try:
        from app.utils.locale_data import locale_data_dir
        f = locale_data_dir().parent / "branding.json"
        if f.exists():
            gc = json.loads(f.read_text(encoding="utf-8")).get("giftcard") or {}
            for k in colori:
                if isinstance(gc.get(k), str) and gc[k].startswith("#"):
                    colori[k] = gc[k]
    except Exception as e:
        logger.warning("branding.json non leggibile per la pagina regalo: %s", e)
    return colori


@public_router.get("/{token}")
def regalo_pubblico(token: str):
    """
    Cosa vede chi inquadra il QR senza essere loggato: cosa gli hanno
    regalato, se e' ancora valido, fino a quando.

    Decisione Marco 2026-10-25: l'IMPORTO non compare MAI, nemmeno sui buoni
    a valore. Niente intestatario, note, chi l'ha emessa, storico.
    Sulle esperienze si mostra la descrizione ("Cena degustazione per due").
    """
    from app.utils.locale_data import locale_info

    info = locale_info()
    sito = ((info.get("sito") or {}).get("domini") or [None])[0]
    esterno = info.get("prenota_esterno") or {}
    locale = {"nome": info.get("nome") or "", "sito": f"https://{sito}" if sito else None,
              "colori": _colori_regalo(),
              # dove prenotare se il widget TRGB e' spento (locale.json → prenota_esterno)
              "prenota_esterno": esterno.get("url") or None}

    t = (token or "").strip()
    if not t or len(t) > 64:
        return {"trovata": False, "locale": locale}

    conn = get_clienti_conn()
    try:
        row = conn.execute(
            "SELECT * FROM clienti_giftcard WHERE token_pubblico = ?", (t,)
        ).fetchone()
        if not row:
            return {"trovata": False, "locale": locale}
        gc = _serializza(row)
    finally:
        conn.close()

    if gc["stato"] == "in_bianco":
        esito = "non_attiva"
    elif gc["stato"] == "usata":
        esito = "usata"
    elif gc["stato"] == "annullata":
        esito = "annullata"
    elif gc["scaduta"]:
        esito = "scaduta"
    else:
        esito = "valida"

    return {
        "trovata": True,
        "locale": locale,
        "codice": gc["codice"],
        "tipo": gc["tipo"],
        "descrizione": gc.get("descrizione") if gc["tipo"] == "esperienza" else None,
        "esito": esito,
        "data_scadenza": gc.get("data_scadenza"),
        "data_utilizzo": gc.get("data_utilizzo") if esito == "usata" else None,
    }
