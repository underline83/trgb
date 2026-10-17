# @version: v1.0 — recensioni TheFork in TRGB (2026-10-17, mig 197)
# -*- coding: utf-8 -*-
"""
Recensioni TheFork — Modulo: prenotazioni — [core]

Dalla B2B API:
  GET /v1/reviews?restaurantUuid&startDate&endDate (date del pasto, UTC) → solo uuid
  GET /v1/reviews/{id}                                                 → dettaglio
  PUT /v1/reviews/{id}/reply {content, language}  → la risposta torna in moderazione

Ogni recensione si collega al cliente (customerUuid → clienti.thefork_id, alias
compresi) e alla prenotazione (reservationUuid → thefork_booking_id). Sotto la
soglia di prenotazioni_config.recensioni_soglia_avviso (su 10) si avvisano gli
admin (M.A). Il giro periodico (thread TheFork) gira al massimo una volta l'ora:
scarica le nuove degli ultimi giorni e riaggiorna quelle recenti o con una
risposta ancora in moderazione.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn
from app.services import thefork_service as tf
from app.services.clienti_thefork_service import trova_cliente_id
from app.services.notifiche_service import crea_notifica

log = logging.getLogger("trgb.thefork.recensioni")

GIORNI_GIRO = 14            # finestra del giro periodico (data del pasto)
INTERVALLO_GIRO_S = 3600    # al massimo un giro all'ora
_stato: Dict[str, Any] = {"ultimo_ts": 0.0}


def _testo(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).replace("\\n", "\n").strip()
    return s or None


def _soglia(conn) -> Optional[float]:
    r = conn.execute("SELECT valore FROM prenotazioni_config WHERE chiave = 'recensioni_soglia_avviso'").fetchone()
    try:
        return float(r["valore"]) if r and str(r["valore"]).strip() else None
    except (TypeError, ValueError):
        return None


def mappa(r: Dict[str, Any]) -> Dict[str, Any]:
    pren = r.get("reservation") or {}
    cli = r.get("customer") or {}
    voti = r.get("dinerRating") or {}
    com = r.get("comment") or {}
    rep = r.get("restaurantReply") or {}
    pasto = tf._ora_locale(pren.get("mealDate"))
    return {
        "review_uuid": r.get("reviewUuid"),
        "valida": 1 if r.get("isValid", True) else 0,
        "customer_uuid": cli.get("customerUuid"),
        "reservation_uuid": pren.get("reservationUuid"),
        "nome": cli.get("firstName"),
        "cognome": cli.get("lastName"),
        "data_pasto": pasto.strftime("%Y-%m-%d") if pasto else None,
        "voto": voti.get("globalRating"),
        "voto_cibo": voti.get("foodQualityRating"),
        "voto_servizio": voti.get("serviceRating"),
        "voto_ambiente": voti.get("ambienceRating"),
        "prezzo": voti.get("priceEvaluation"),
        "attesa": voti.get("waitingTimeEvaluation"),
        "rumore": voti.get("noiseLevelEvaluation"),
        "occasione": (r.get("experienceDetail") or {}).get("occasion"),
        "commento": _testo(com.get("content")),
        "lingua": com.get("language"),
        "commento_stato": com.get("publicationStatus"),
        "risposta": _testo(rep.get("content")),
        "risposta_lingua": rep.get("language"),
        "risposta_stato": rep.get("publicationStatus"),
        "risposta_motivo": rep.get("moderationReason"),
        "creata_ts": r.get("createdTs"),
        "aggiornata_ts": r.get("updatedTs"),
        "payload": json.dumps(r, ensure_ascii=False),
    }


def salva(conn, r: Dict[str, Any]) -> str:
    """Inserisce o aggiorna una recensione dal dettaglio API. Ritorna 'nuova' | 'aggiornata'."""
    rec = mappa(r)
    if not rec["review_uuid"]:
        raise ValueError("recensione senza reviewUuid")
    rec["cliente_id"] = trova_cliente_id(conn, rec["customer_uuid"])
    p = conn.execute("SELECT id FROM clienti_prenotazioni WHERE thefork_booking_id = ?",
                     (rec["reservation_uuid"],)).fetchone() if rec["reservation_uuid"] else None
    rec["prenotazione_id"] = p["id"] if p else None

    esiste = conn.execute("SELECT id FROM thefork_recensioni WHERE review_uuid = ?", (rec["review_uuid"],)).fetchone()
    campi = list(rec.keys())
    if esiste:
        conn.execute(
            f"UPDATE thefork_recensioni SET {', '.join(f'{k} = ?' for k in campi)}, "
            "sincronizzata_at = datetime('now','localtime') WHERE review_uuid = ?",
            [rec[k] for k in campi] + [rec["review_uuid"]],
        )
        return "aggiornata"
    conn.execute(
        f"INSERT INTO thefork_recensioni ({', '.join(campi)}) VALUES ({', '.join('?' * len(campi))})",
        [rec[k] for k in campi],
    )
    soglia = _soglia(conn)
    if rec["valida"] and soglia is not None and rec["voto"] is not None and float(rec["voto"]) < soglia:
        try:
            nome = " ".join(x for x in (rec["nome"], rec["cognome"]) if x) or "Un cliente"
            crea_notifica(
                tipo="prenotazioni",
                titolo=f"Recensione TheFork {rec['voto']}/10 — {nome}",
                messaggio=(rec["commento"] or "Senza commento")[:300],
                link="/prenotazioni/recensioni",
                icona="⭐",
                modulo="prenotazioni",
                dest_ruolo="admin",
            )
        except Exception as e:  # noqa: BLE001
            log.warning("notifica recensione %s: %s", rec["review_uuid"], e)
    return "nuova"


def sincronizza_una(uuid: str) -> str:
    r = tf.api_get(f"/v1/reviews/{uuid}")
    if not r:
        return "IGNORATO: recensione non trovata su TheFork"
    conn = get_clienti_conn()
    try:
        esito = salva(conn, r)
        conn.commit()
        return f"recensione {esito}"
    finally:
        conn.close()


def _elenco_uuid(dal: str, al: str, massimo: int = 2000) -> List[str]:
    ristorante = tf._restaurant_uuid_atteso()
    if not tf.credenziali_presenti() or not ristorante:
        raise tf.TheForkNonConfigurato("credenziali B2B API non configurate")
    uuids: List[str] = []
    pagina = 1
    while len(uuids) < massimo:
        dati = tf.api_get("/v1/reviews", {
            "restaurantUuid": ristorante, "startDate": dal, "endDate": al, "limit": 100, "page": pagina,
        }) or {}
        blocco = dati.get("data") or []
        uuids.extend(blocco)
        if not blocco or not dati.get("hasNext"):
            break
        pagina += 1
    return uuids


def sincronizza(dal: str, al: str, solo_nuove: bool = False) -> Dict[str, Any]:
    """Scarica le recensioni con pasto fra dal e al (al > dal, date UTC)."""
    if al <= dal:
        al = (date.fromisoformat(dal) + timedelta(days=1)).isoformat()
    uuids = _elenco_uuid(dal, al)
    conn = get_clienti_conn()
    try:
        note = {r["review_uuid"]: dict(r) for r in conn.execute(
            "SELECT review_uuid, risposta, risposta_stato, sincronizzata_at, creata_ts FROM thefork_recensioni")}
    finally:
        conn.close()
    limite_recenti = (date.today() - timedelta(days=3)).isoformat()
    conti = {"trovate": len(uuids), "nuove": 0, "aggiornate": 0, "saltate": 0, "errori": 0}
    for u in uuids:
        n = note.get(u)
        if n and solo_nuove:
            risposta_in_corso = n["risposta"] and n["risposta_stato"] not in ("PUBLISHED", "REJECTED", "DELETED")
            recente = (n["creata_ts"] or "") >= limite_recenti
            if not (risposta_in_corso or recente):
                conti["saltate"] += 1
                continue
        try:
            r = tf.api_get(f"/v1/reviews/{u}")
            if not r:
                conti["saltate"] += 1
                continue
            conn = get_clienti_conn()
            try:
                esito = salva(conn, r)
                conn.commit()
            finally:
                conn.close()
            conti["nuove" if esito == "nuova" else "aggiornate"] += 1
        except Exception as e:  # noqa: BLE001
            log.warning("recensione %s: %s", u, e)
            conti["errori"] += 1
    return conti


def giro_periodico() -> Optional[Dict[str, Any]]:
    """Chiamato dal thread TheFork: al massimo una volta l'ora."""
    if time.time() - _stato["ultimo_ts"] < INTERVALLO_GIRO_S:
        return None
    _stato["ultimo_ts"] = time.time()
    oggi = date.today()
    esito = sincronizza((oggi - timedelta(days=GIORNI_GIRO)).isoformat(),
                        (oggi + timedelta(days=1)).isoformat(), solo_nuove=True)
    _stato["ultimo"] = esito
    return esito


def rispondi(review_uuid: str, testo: str, lingua: Optional[str], utente: Optional[str]) -> Dict[str, Any]:
    testo = (testo or "").strip()
    if not testo:
        raise ValueError("Scrivi la risposta")
    conn = get_clienti_conn()
    try:
        r = conn.execute("SELECT lingua FROM thefork_recensioni WHERE review_uuid = ?", (review_uuid,)).fetchone()
        if not r:
            raise LookupError("Recensione non trovata")
        lingua = (lingua or r["lingua"] or "it")[:2]
        out = tf.api_put(f"/v1/reviews/{review_uuid}/reply", {"content": testo, "language": lingua}) or {}
        rep = out.get("restaurantReply") or {}
        conn.execute("""
            UPDATE thefork_recensioni SET risposta = ?, risposta_lingua = ?, risposta_stato = ?,
                   risposta_motivo = ?, risposta_da = ?, risposta_at = datetime('now','localtime'), letta = 1
            WHERE review_uuid = ?
        """, (_testo(rep.get("content")) or testo, rep.get("language") or lingua,
              rep.get("publicationStatus") or "NOT_REVIEWED", rep.get("moderationReason"), utente, review_uuid))
        conn.commit()
        return dict(conn.execute("SELECT * FROM thefork_recensioni WHERE review_uuid = ?", (review_uuid,)).fetchone())
    finally:
        conn.close()


def elenco(conn, filtro: str = "tutte", q: Optional[str] = None, cliente_id: Optional[int] = None,
           limite: int = 50, pagina: int = 1) -> Dict[str, Any]:
    where, par = ["valida = 1"], []
    if filtro == "da_rispondere":
        where.append("commento IS NOT NULL AND risposta IS NULL")
    elif filtro == "non_lette":
        where.append("letta = 0")
    elif filtro == "basse":
        where.append("voto < COALESCE((SELECT CAST(valore AS REAL) FROM prenotazioni_config WHERE chiave = 'recensioni_soglia_avviso' AND valore != ''), 8)")
    if cliente_id:
        where.append("r.cliente_id = ?")
        par.append(cliente_id)
    for parola in (q or "").split()[:6]:
        where.append("(COALESCE(r.nome,'') || ' ' || COALESCE(r.cognome,'') || ' ' || COALESCE(commento,'')) LIKE ?")
        par.append(f"%{parola}%")
    w = " AND ".join(where)
    totale = conn.execute(f"SELECT COUNT(*) FROM thefork_recensioni r WHERE {w}", par).fetchone()[0]
    righe = conn.execute(f"""
        SELECT r.id, r.review_uuid, r.cliente_id, r.prenotazione_id, r.nome, r.cognome, r.data_pasto,
               r.voto, r.voto_cibo, r.voto_servizio, r.voto_ambiente, r.prezzo, r.attesa, r.rumore,
               r.occasione, r.commento, r.lingua, r.commento_stato, r.risposta, r.risposta_lingua,
               r.risposta_stato, r.risposta_motivo, r.risposta_da, r.risposta_at, r.letta, r.creata_ts,
               p.pax, p.tavolo, p.ora_pasto
        FROM thefork_recensioni r LEFT JOIN clienti_prenotazioni p ON p.id = r.prenotazione_id
        WHERE {w}
        ORDER BY COALESCE(r.creata_ts, r.data_pasto) DESC
        LIMIT ? OFFSET ?
    """, par + [limite, (max(pagina, 1) - 1) * limite]).fetchall()
    return {"totale": totale, "recensioni": [dict(x) for x in righe]}


def riepilogo(conn) -> Dict[str, Any]:
    def media(giorni: Optional[int]):
        cond = "valida = 1 AND voto IS NOT NULL"
        par: List[Any] = []
        if giorni:
            cond += " AND data_pasto >= ?"
            par.append((date.today() - timedelta(days=giorni)).isoformat())
        r = conn.execute(f"""
            SELECT COUNT(*) n, ROUND(AVG(voto), 2) voto, ROUND(AVG(voto_cibo), 2) cibo,
                   ROUND(AVG(voto_servizio), 2) servizio, ROUND(AVG(voto_ambiente), 2) ambiente
            FROM thefork_recensioni WHERE {cond}
        """, par).fetchone()
        return dict(r)
    return {
        "30_giorni": media(30),
        "90_giorni": media(90),
        "sempre": media(None),
        "da_rispondere": conn.execute(
            "SELECT COUNT(*) FROM thefork_recensioni WHERE valida = 1 AND commento IS NOT NULL AND risposta IS NULL"
        ).fetchone()[0],
        "non_lette": conn.execute("SELECT COUNT(*) FROM thefork_recensioni WHERE valida = 1 AND letta = 0").fetchone()[0],
        "ultimo_giro": _stato.get("ultimo"),
    }
