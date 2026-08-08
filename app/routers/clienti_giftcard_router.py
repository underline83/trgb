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
import random
import string
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.clienti_db import get_clienti_conn, init_clienti_db
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.clienti.giftcard")

router = APIRouter(prefix="/clienti/giftcard", tags=["Clienti - Gift Card"])

init_clienti_db()

STATI_VALIDI = {"attiva", "usata", "annullata"}
TIPI_VALIDI = {"valore", "esperienza"}

# Alfabeto senza caratteri ambigui: niente 0/O, 1/I/L, 5/S, 8/B.
# Una gift card viene letta ad alta voce al telefono e ricopiata a mano.
ALFABETO_CODICE = "234679ACDEFGHJKMNPQRTUVWXYZ"


# ─────────────────────────────────────────────────────────────
# Impostazioni (mai soglie hardcoded)
# ─────────────────────────────────────────────────────────────

def _get_setting(conn, chiave: str, default: str) -> str:
    row = conn.execute(
        "SELECT valore FROM clienti_impostazioni WHERE chiave = ?", (chiave,)
    ).fetchone()
    return row["valore"] if row else default


def _genera_codice(conn) -> str:
    """
    Codice leggibile del tipo TG-4KMP-9XQD.
    Ritenta su collisione (il vincolo UNIQUE resta l'autorita' finale).
    """
    prefisso = (_get_setting(conn, "giftcard_prefisso", "TG") or "TG").strip().upper()
    for _ in range(30):
        blocco1 = "".join(random.choices(ALFABETO_CODICE, k=4))
        blocco2 = "".join(random.choices(ALFABETO_CODICE, k=4))
        codice = f"{prefisso}-{blocco1}-{blocco2}"
        esiste = conn.execute(
            "SELECT 1 FROM clienti_giftcard WHERE codice = ?", (codice,)
        ).fetchone()
        if not esiste:
            return codice
    raise HTTPException(500, "Impossibile generare un codice univoco, riprova")


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


class AzioneRequest(BaseModel):
    note: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Lista e statistiche
# ─────────────────────────────────────────────────────────────

@router.get("/")
def lista_giftcard(
    stato: Optional[str] = Query(None, description="attiva | usata | annullata"),
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
              COUNT(*) AS totali,
              SUM(CASE WHEN stato='attiva'    THEN 1 ELSE 0 END) AS attive,
              SUM(CASE WHEN stato='usata'     THEN 1 ELSE 0 END) AS usate,
              SUM(CASE WHEN stato='annullata' THEN 1 ELSE 0 END) AS annullate
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
            "prefisso": _get_setting(conn, "giftcard_prefisso", "TG"),
            "validita_mesi": int(_get_setting(conn, "giftcard_validita_mesi", "12") or 12),
            "alert_giorni": int(_get_setting(conn, "giftcard_alert_giorni", "30") or 30),
            "importi_rapidi": importi,
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

        if gc["stato"] == "usata":
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
                 stato, data_scadenza, emessa_da, note)
            VALUES (?,?,?,?,?,?, 'attiva', ?,?,?)
            """,
            (
                codice,
                body.tipo,
                body.importo if body.tipo == "valore" else None,
                (body.descrizione or "").strip() or None,
                body.cliente_id,
                (body.intestatario_nome or "").strip() or None,
                data_scadenza,
                current_user["username"],
                (body.note or "").strip() or None,
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
        if row["stato"] == "attiva":
            return {"status": "ok", **_serializza(row)}

        conn.execute(
            """
            UPDATE clienti_giftcard
            SET stato = 'attiva', data_utilizzo = NULL, utilizzata_da = NULL
            WHERE id = ?
            """,
            (gc_id,),
        )
        _log_movimento(conn, gc_id, "riattivazione", row["stato"], "attiva",
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
