# @version: v1.0 (2026-11-24) — il foglio di cucina della Comanda e la sua coda di stampa
# -*- coding: utf-8 -*-
"""
Stampa delle comande — Modulo: comande. [core]

Due cose:
1. IL FOGLIO. Ogni invio a un reparto (comande_invii) diventa un foglio per la stampante di
   quel reparto. Marco ha scelto il foglio «B» sulle tavole del 24/11/2026: l'ossatura di
   iPratico (tavolo grande in testa e in coda, piatti a carattere doppio, nota sotto il
   piatto) più «PROVA - NON PREPARARE» finché il conto è in prova, coperti in testa, allergie
   del tavolo, fascia nera sull'uscita che parte e «attende» sulle altre, nome del piatto
   tagliato alla prima virgola. Le chiamate: VAI CON LA PREPARAZIONE, SOLLECITO, ATTENDI e,
   per uno storno, ANNULLA (non «STORNO»: scelta di Marco).
2. LA CODA. Non c'è una tabella in più: un invio nasce «in attesa di stampa» se il suo
   reparto ha una stampante accesa, e il ponte lo viene a prendere (ponte_service, fonte
   «comande»). Lo stato sta in comande_invii: stampa_stato (attesa · stampato · spenta),
   stampa_da, stampa_presa_at, stampa_tentativi, stampa_esito, stampato_at.

Niente indirizzi né soglie qui: le stampanti e i tempi li dà il ponte (ponte_service).
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.comande_db import get_comande_conn
from app.services import ponte_service, prenotazioni_giorno_service
from app.services import stampa_escpos as carta

logger = logging.getLogger("trgb.comande.stampa")

PROVA = "PROVA - NON PREPARARE"
CHIAMATE = {
    "vai": (["VAI CON LA PREPARAZIONE", ": USCITA {n}"], None),
    "sollecito": (["SOLLECITO : USCITA {n}"], None),
    "attendi": (["ATTENDI : USCITA {n}"], "ferma questa uscita finché non la richiamo"),
}


class StampaErrore(Exception):
    """Ristampa non possibile (→ 400 dal router)."""


# ── il foglio ────────────────────────────────────────────────

def _quanti(q) -> str:
    try:
        f = float(q)
        return str(int(f)) if f == int(f) else str(f).replace(".", ",")
    except (TypeError, ValueError):
        return "1"


def _quando(ts: Optional[str]) -> str:
    try:
        return datetime.strptime(str(ts)[:19], "%Y-%m-%d %H:%M:%S").strftime("%d/%m/%Y %H:%M")
    except (TypeError, ValueError):
        return ""


def _ora(ts: Optional[str]) -> str:
    return str(ts)[11:16] if ts and len(str(ts)) >= 16 else ""


def _minuti_fra(da: Optional[str], a: Optional[str]) -> Optional[int]:
    try:
        f = "%Y-%m-%d %H:%M:%S"
        return max(0, int((datetime.strptime(str(a)[:19], f) - datetime.strptime(str(da)[:19], f)).total_seconds() // 60))
    except (TypeError, ValueError):
        return None


def nome_cucina(nome: Optional[str]) -> str:
    """Il nome del piatto sul foglio: fino alla prima virgola, in maiuscolo."""
    return " ".join(str(nome or "").split(",")[0].split()).upper() or "?"


def _piatti(righe: List[Dict[str, Any]], meta: int) -> List[tuple]:
    out: List[tuple] = []
    for r in righe:
        for riga in carta.a_capo(nome_cucina(r.get("nome")), meta, _quanti(r.get("quantita")) + " ", "  "):
            out.append(("dd", riga, False))
        aggiunte = [str(v) for v in (r.get("varianti") or []) if str(v).strip()]
        if r.get("nota"):
            aggiunte.append(str(r["nota"]))
        for a in aggiunte:
            for riga in carta.a_capo(a, meta, " ** ", "    "):
                out.append(("dw", riga, False))
    return out


def _allergie(testo: Optional[str], meta: int) -> List[tuple]:
    voci = [v for v in (" ".join(p.split()) for p in re.split(r"[·;,\n]+", str(testo or ""))) if v]
    if not voci:
        return []
    out: List[tuple] = [("neg", "ALLERGIE AL TAVOLO")]
    for v in voci:
        for riga in carta.a_capo(v.upper(), meta):
            out.append(("dd", riga, True))
    return out


def righe_foglio(invio: Dict[str, Any], conto: Dict[str, Any], allergie: Optional[str] = None,
                 uscita: Optional[Dict[str, Any]] = None, colonne: int = carta.COLONNE) -> List[tuple]:
    """Le righe del foglio di un invio. `conto`: tavolo, zona, coperti, prova. `uscita`: lo stato
    dell'uscita chiamata (andata_at, solleciti), per il sollecito."""
    meta = colonne // 2
    tavolo = str(conto.get("tavolo") or "?")[:meta]
    coperti = conto.get("coperti") or 0
    sotto = " · ".join(x for x in (str(conto.get("zona") or "").strip(),
                                    f"{coperti} {'coperto' if coperti == 1 else 'coperti'}") if x)
    righe = invio.get("righe") or []
    f: List[tuple] = []
    if conto.get("prova"):
        f.append(("neg", PROVA))
    f += [("dd", tavolo, True), ("c", sotto), ("lr", invio.get("creato_da") or "", _quando(invio.get("creato_at")))]

    tipo = invio.get("tipo")
    if tipo == "comanda":
        f += _allergie(allergie, meta)
        for n in sorted({int(r.get("uscita") or 0) for r in righe}):
            sue = [r for r in righe if int(r.get("uscita") or 0) == n]
            nome = "SUBITO" if n == 0 else f"USCITA {n}"
            f.append(("dash",))
            if all(r.get("va") is not False for r in sue):
                f.append(("neg", f"{nome} - VA ADESSO"))
            else:
                f.append(("dw", f"--- {nome} attende ---", True))
            f += _piatti(sue, meta)
        f += [("dash",), ("dd", tavolo, True), ("c", sotto)]
        return f

    n = invio.get("uscita")
    if tipo == "storno":
        fasce, sotto_fascia = ["ANNULLA : USCITA {n}" if n else "ANNULLA"], "da non fare più"
    else:
        fasce, sotto_fascia = CHIAMATE.get(invio.get("azione") or "vai", CHIAMATE["vai"])
        if (invio.get("azione") or "vai") == "sollecito" and uscita and uscita.get("andata_at"):
            fa = _minuti_fra(uscita["andata_at"], invio.get("creato_at"))
            sotto_fascia = f"andata alle {_ora(uscita['andata_at'])}" + (f", {fa} minuti fa" if fa is not None else "")
            if (uscita.get("solleciti") or 0) > 1:
                sotto_fascia += f" · sollecito n. {uscita['solleciti']}"
    fasce = [x.format(n=n) for x in fasce]
    f += [("neg", x) for x in fasce]
    if sotto_fascia:
        f.append(("c", sotto_fascia))
    f.append(("dash",))
    f += _piatti(righe, meta)
    if tipo == "storno":
        for r in righe:
            if r.get("motivo"):
                for riga in carta.a_capo(str(r["motivo"]), colonne, "Motivo: ", "        "):
                    f.append(("n", riga))
    f.append(("dash",))
    f += [("neg", x) for x in fasce]
    f.append(("dd", tavolo, True))
    return f


def _titolo(invio: Dict[str, Any], tavolo: str) -> str:
    cosa = {"comanda": "comanda", "storno": "annulla"}.get(invio.get("tipo"), invio.get("azione") or "vai")
    return f"Tavolo {tavolo} · {cosa}" + (f" · uscita {invio['uscita']}" if invio.get("uscita") else "")


# ── la coda ──────────────────────────────────────────────────

def _stampante_di(conn, reparto: Optional[str]) -> Optional[Dict[str, Any]]:
    if not reparto:
        return None
    r = conn.execute("SELECT stampante FROM comande_reparti WHERE key = ?", (reparto,)).fetchone()
    return ponte_service.stampante(r["stampante"]) if r and r["stampante"] else None


def stato_iniziale(conn, reparto: Optional[str]) -> str:
    """Con che stato di stampa nasce un invio: «attesa» se il reparto ha una stampante accesa,
    «spenta» se no (e allora non uscirà nemmeno accendendola dopo)."""
    try:
        return "attesa" if ponte_service.pronta(_stampante_di(conn, reparto)) else "spenta"
    except Exception as e:  # la stampa non deve mai fermare un invio
        logger.warning("Stato di stampa non leggibile per il reparto %s: %s", reparto, e)
        return "spenta"


def _foglio(conn, i, colonne: int) -> bytes:
    invio = dict(i)
    try:
        invio["righe"] = json.loads(invio.get("righe_json") or "[]")
    except (TypeError, ValueError):
        invio["righe"] = []
    allergie = None
    if invio.get("tipo") == "comanda" and i["prenotazione_id"]:
        try:
            p = prenotazioni_giorno_service.una(i["prenotazione_id"])
            allergie = (p or {}).get("allergie")
        except Exception as e:  # senza allergie il foglio esce lo stesso
            logger.warning("Allergie non leggibili per l'invio %s: %s", i["id"], e)
    uscita = None
    if invio.get("tipo") == "via" and invio.get("uscita") is not None:
        u = conn.execute("SELECT andata_at, solleciti FROM comande_uscite WHERE conto_id = ? AND numero = ?",
                         (i["conto_id"], invio["uscita"])).fetchone()
        uscita = dict(u) if u else None
    conto = {"tavolo": i["tavolo"], "zona": i["zona"], "coperti": i["coperti"], "prova": i["prova"]}
    return carta.foglio(righe_foglio(invio, conto, allergie, uscita, colonne), colonne)


def da_stampare() -> List[Dict[str, Any]]:
    """Per il ponte: gli invii in attesa, non troppo vecchi e non già consegnati da poco."""
    v = ponte_service.valori()
    conn = get_comande_conn()
    try:
        out = []
        for i in conn.execute(
                "SELECT i.*, c.tavolo, c.zona, c.coperti, c.prova, c.prenotazione_id FROM comande_invii i "
                "JOIN comande_conti c ON c.id = i.conto_id WHERE i.stampa_stato = 'attesa' "
                "AND i.stampa_da >= datetime('now','localtime', ?) "
                "AND (i.stampa_presa_at IS NULL OR i.stampa_presa_at <= datetime('now','localtime', ?)) "
                "ORDER BY i.id LIMIT 20",
                (f"-{v['scadenza_minuti']} minutes", f"-{v['presa_secondi']} seconds")).fetchall():
            s = _stampante_di(conn, i["reparto"])
            if not ponte_service.pronta(s):
                continue
            try:
                dati = _foglio(conn, i, int(s.get("colonne") or carta.COLONNE))
            except Exception as e:  # un foglio che non si impagina non blocca gli altri
                logger.exception("Invio %s non impaginabile: %s", i["id"], e)
                conn.execute("UPDATE comande_invii SET stampa_esito = ?, stampa_tentativi = COALESCE(stampa_tentativi, 0) + 1, "
                             "stampa_presa_at = datetime('now','localtime') WHERE id = ?", (f"foglio non impaginabile: {e}"[:200], i["id"]))
                continue
            conn.execute("UPDATE comande_invii SET stampa_presa_at = datetime('now','localtime') WHERE id = ?", (i["id"],))
            out.append({"id": i["id"], "stampante": s["chiave"], "titolo": _titolo(dict(i), i["tavolo"]), "dati": dati})
        conn.commit()
        return out
    finally:
        conn.close()


def esito(invio_id, ok: bool, errore: Optional[str] = None) -> None:
    """Il ponte riferisce: stampato, oppure perché no (e allora si riprova finché non scade)."""
    try:
        n = int(invio_id)
    except (TypeError, ValueError):
        return
    conn = get_comande_conn()
    try:
        if ok:
            conn.execute("UPDATE comande_invii SET stampa_stato = 'stampato', stampa_esito = 'ok', stampa_presa_at = NULL, "
                         "stampato_at = datetime('now','localtime') WHERE id = ? AND stampa_stato = 'attesa'", (n,))
        else:
            conn.execute("UPDATE comande_invii SET stampa_esito = ?, stampa_tentativi = COALESCE(stampa_tentativi, 0) + 1, "
                         "stampa_presa_at = NULL WHERE id = ? AND stampa_stato = 'attesa'", ((errore or "errore")[:200], n))
        conn.commit()
    finally:
        conn.close()


def ristampa(invio_id: int) -> None:
    """Rimette un invio in attesa di stampa, da adesso."""
    conn = get_comande_conn()
    try:
        i = conn.execute("SELECT id, reparto FROM comande_invii WHERE id = ?", (invio_id,)).fetchone()
        if not i:
            raise StampaErrore("Invio inesistente")
        s = _stampante_di(conn, i["reparto"])
        if not s:
            raise StampaErrore(f"Il reparto «{i['reparto']}» non ha una stampante: si sceglie in Impostazioni")
        if not ponte_service.pronta(s):
            raise StampaErrore(f"La stampante {s['nome']} è spenta: si accende in Impostazioni")
        conn.execute("UPDATE comande_invii SET stampa_stato = 'attesa', stampa_da = datetime('now','localtime'), "
                     "stampa_presa_at = NULL, stampa_tentativi = 0, stampa_esito = NULL, stampato_at = NULL WHERE id = ?", (invio_id,))
        conn.commit()
    finally:
        conn.close()


def etichetta(d: Dict[str, Any], scadenza_minuti: int) -> Dict[str, Any]:
    """Cosa dire di un invio nella pagina Invii: {stato, testo}. stato: stampato · attesa ·
    errore · scaduta · spenta · None (invii nati prima della stampa)."""
    st = d.get("stampa_stato")
    if st == "stampato":
        return {"stato": "stampato", "testo": f"stampato {_ora(d.get('stampato_at'))}".strip()}
    if st == "spenta":
        return {"stato": "spenta", "testo": "stampa spenta"}
    if st == "attesa":
        try:
            eta = (datetime.now() - datetime.strptime(str(d.get("stampa_da"))[:19], "%Y-%m-%d %H:%M:%S")).total_seconds() / 60
        except (TypeError, ValueError):
            eta = None
        if eta is not None and eta > scadenza_minuti:
            return {"stato": "scaduta", "testo": "non stampato"}
        if d.get("stampa_esito") and d.get("stampa_esito") != "ok":
            return {"stato": "errore", "testo": f"non riesce: {d['stampa_esito']}"}
        return {"stato": "attesa", "testo": "in stampa…"}
    return {"stato": None, "testo": "non stampato"}


ponte_service.registra_fonte("comande", da_stampare, esito)
