# Modulo: prenotazioni (le prenotazioni prese in TRGB vanno anche su TheFork) — [core]
# -*- coding: utf-8 -*-
"""
TRGB è la fonte: le prenotazioni prese a mano partono per TheFork (2026-11-26).

Decisioni di Marco del 26/11 (Q #415, #416, #417, #418):
- il form di TRGB è la fonte, non si inserisce più da TheFork Manager;
- se l'orario è prenotabile online la prenotazione parte subito; se no resta in TRGB
  «da mandare» e si riprova a ogni giro (coda, via A), finché l'orario riapre;
- chi non ha email parte con un'email di servizio fatta sul numero (config
  `thefork_email_servizio`, con {numero}); quando torna da TheFork quell'email per TRGB
  non esiste (`email_vera`);
- a TheFork vanno sempre i dati della SCHEDA (nome, email, telefono), chi ha chiamato va
  in nota: TheFork riconosce il cliente da email o telefono e sovrascrive il resto;
- i gruppi partono lo stesso: su TheFork nascono «da confermare», li conferma l'osteria;
- walk-in, lista d'attesa e «in opzione» non partono (l'opzione parte quando è confermata).

Provato dal vero il 26/11: senza email TheFork rifiuta (INVALID_CUSTOMER_EMAIL), fuori
dalle fasce online rifiuta (NO_AVAILABILITY), l'ora va mandata con l'offset.
NON provato dal vero: la garanzia con carta (se TheFork la chiede e l'email è di servizio
la prenotazione viene ritirata da TheFork e resta solo in TRGB).

Stato sulla riga: clienti_prenotazioni.thefork_invio = da_mandare | sospesa | inviata | no | errore
(NULL = non riguarda TheFork). L'interruttore `thefork_invio_attivo` nasce spento.
Niente doppioni: alla creazione su TheFork la riga prende `thefork_booking_id`, quindi la
sincronizzazione ritrova la stessa riga (`tieni_trgb` le lascia cliente e canale di TRGB).
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime
from typing import Any, Dict, Optional

from app.models.clienti_db import get_clienti_conn
from app.services import thefork_prenota_service as prenota
from app.services import thefork_service as tf
from app.utils import telefono as tel

logger = logging.getLogger("trgb.thefork.invio")

CIVILITY = ("mr", "mrs", "ms", "mr_and_mrs", "mx", "doctor", "professor", "company")
_RIPROVA = ("NO_AVAILABILITY",)          # l'orario non è prenotabile online: si aspetta
_cache_modello: Dict[str, Any] = {"quando": 0.0, "regex": None}


def _cfg(conn, chiave: str, default: str = "") -> str:
    try:
        r = conn.execute("SELECT valore FROM prenotazioni_config WHERE chiave = ?", (chiave,)).fetchone()
    except Exception:  # noqa: BLE001  (config non ancora creata)
        return default
    return (r["valore"] if r and r["valore"] is not None else default).strip()


def attivo(conn) -> bool:
    return _cfg(conn, "thefork_invio_attivo", "0") == "1" and tf.credenziali_presenti()


def _regex_servizio(modello: str) -> Optional[re.Pattern]:
    if not modello or "{numero}" not in modello or "@" not in modello:
        return None
    prima, dopo = modello.split("{numero}", 1)
    return re.compile("^" + re.escape(prima.strip().lower()) + r"\d{6,15}" + re.escape(dopo.strip().lower()) + "$")


def email_di_servizio(email: Optional[str]) -> bool:
    """True se è l'email di comodo fatta da TRGB per TheFork (non un indirizzo del cliente)."""
    if not email:
        return False
    if time.time() - _cache_modello["quando"] > 60:
        conn = get_clienti_conn()
        try:
            _cache_modello["regex"] = _regex_servizio(_cfg(conn, "thefork_email_servizio"))
        finally:
            conn.close()
        _cache_modello["quando"] = time.time()
    rx = _cache_modello["regex"]
    return bool(rx and rx.match(str(email).strip().lower()))


def email_vera(email: Optional[str]) -> Optional[str]:
    """Per la sincronizzazione: l'email di servizio, tornando da TheFork, è come se non ci fosse."""
    return None if email_di_servizio(email) else (email or None)


def _titolo(conn, titolo: Optional[str]) -> str:
    t = (titolo or "").strip().lower().replace(" ", "_").replace(".", "")
    return t if t in CIVILITY else (_cfg(conn, "thefork_titolo_predefinito", "mx") or "mx")


def _lingua(lingua: Optional[str], numero: Optional[str]) -> str:
    l = (lingua or "").strip()
    if re.match(r"^[a-z]{2,3}(_[A-Z]{2})?$", l):
        return l
    p = tel.paese_di(numero)
    return p["lingua"] if p else "it_IT"


def _cliente_per_thefork(conn, c) -> Dict[str, Any]:
    """Dati della SCHEDA nel formato di TheFork. Solleva ValueError con il perché se non bastano."""
    numero = tel.normalizza(c["telefono"]) or tel.normalizza(c["telefono2"])
    email = (c["email"] or "").strip()
    servizio = False
    if not email or "@" not in email or email_di_servizio(email):
        modello = _cfg(conn, "thefork_email_servizio")
        if not modello or "{numero}" not in modello:
            raise ValueError("il cliente non ha un'email e l'email di servizio non è impostata")
        if not numero:
            raise ValueError("il cliente non ha né email né telefono")
        email, servizio = modello.replace("{numero}", tel.cifre(numero)), True
    nome, cognome = (c["nome"] or "").strip(), (c["cognome"] or "").strip()
    if not cognome and not nome:
        raise ValueError("il cliente non ha un nome")
    dati = {"email": email, "firstName": nome or cognome, "lastName": cognome or nome,
            "locale": _lingua(c["lingua"], numero), "civility": _titolo(conn, c["titolo"])}
    if numero:
        dati["phone"] = numero
    return {"dati": dati, "servizio": servizio}


def _segna(conn, pid: int, stato: Optional[str], nota: Optional[str], uuid: Optional[str] = None) -> None:
    sets, vals = ["thefork_invio = ?", "thefork_invio_nota = ?",
                  "thefork_invio_at = datetime('now','localtime')"], [stato, (nota or "")[:300] or None]
    if uuid:
        sets.append("thefork_booking_id = ?")
        vals.append(uuid)
    conn.execute(f"UPDATE clienti_prenotazioni SET {', '.join(sets)} WHERE id = ?", (*vals, pid))
    conn.commit()


def _codice(e: tf.TheForkErroreAPI) -> str:
    m = re.search(r'"code"\s*:\s*"([A-Z_]+)"', str(e))
    return m.group(1) if m else ""


def _va_mandata(p) -> Optional[str]:
    """None se la prenotazione deve andare su TheFork, altrimenti il perché no."""
    if p["thefork_booking_id"]:
        return "già su TheFork"
    if (p["fonte"] or "manuale") != "manuale":
        return "non è nata dal form"
    if (p["canale"] or "") == "Walk-in":
        return "walk-in"
    if p["stato"] != "RECORDED":
        return "stato " + str(p["stato"])
    if not p["cliente_id"]:
        return "senza cliente"
    if (p["data_pasto"] or "") < datetime.now().strftime("%Y-%m-%d"):
        return "data passata"
    return None


def invia(conn, pid: int) -> Dict[str, Any]:
    """Prova a mandare a TheFork la prenotazione #pid. Non solleva: scrive l'esito sulla riga."""
    p = conn.execute("SELECT * FROM clienti_prenotazioni WHERE id = ?", (pid,)).fetchone()
    if not p:
        return {"stato": None, "nota": "prenotazione non trovata"}
    perche_no = _va_mandata(p)
    if perche_no:
        # Walk-in: fuori senza segno. Opzione e lista d'attesa: «sospesa», parte quando diventa confermata.
        # (Il segno serve anche a non mandare, alla prima modifica, le prenotazioni a mano di prima del 26/11.)
        if p["stato"] in ("OPTION", "WAITLIST") and not p["thefork_booking_id"] and (p["fonte"] or "manuale") == "manuale":
            if p["thefork_invio"] != "sospesa":
                _segna(conn, pid, "sospesa", "Parte per TheFork quando viene confermata")
            return {"stato": "sospesa", "nota": perche_no}
        if p["thefork_invio"] in ("da_mandare", "sospesa"):
            _segna(conn, pid, "no", perche_no)
        return {"stato": p["thefork_invio"], "nota": perche_no}
    c = conn.execute("SELECT * FROM clienti WHERE id = ?", (p["cliente_id"],)).fetchone()
    try:
        cli = _cliente_per_thefork(conn, c)
    except (ValueError, TypeError) as e:
        _segna(conn, pid, "no", f"Solo in TRGB: {e}")
        return {"stato": "no", "nota": str(e)}

    nota_r = " · ".join(x for x in (
        (f"A nome {p['persona_nome']}" if p["persona_nome"] else ""), (p["nota_ristorante"] or "").strip()) if x)
    try:
        with tf._lock_elabora:   # la sincronizzazione non deve vedere la prenotazione prima che la riga abbia il suo codice
            r = prenota.crea_prenotazione(
                f"{p['data_pasto']}T{str(p['ora_pasto'])[:5]}", int(p["pax"]), cli["dati"],
                nota_ristorante=nota_r or None, nota_cliente=(p["nota_cliente"] or None))
            uuid = r.get("reservationUuid")
            if r.get("paymentMethodRequest") and cli["servizio"]:
                # TheFork chiede la carta per email, ma l'email è di servizio: si ritira da TheFork
                try:
                    prenota.cancella_prenotazione(uuid)
                except tf.TheForkErroreAPI as e:
                    logger.warning("ritiro prenotazione con garanzia #%s: %s", pid, e)
                _segna(conn, pid, "no", "Solo in TRGB: TheFork chiede la garanzia con carta e il cliente non ha un'email")
                return {"stato": "no", "nota": "garanzia con carta senza email"}
            nota = "Da confermare su TheFork Manager" if r.get("status") == "REQUESTED" else None
            _segna(conn, pid, "inviata", nota, uuid)
        return {"stato": "inviata", "nota": nota, "uuid": uuid}
    except tf.TheForkNonConfigurato as e:
        _segna(conn, pid, "da_mandare", str(e))
        return {"stato": "da_mandare", "nota": str(e)}
    except tf.TheForkErroreAPI as e:
        codice = _codice(e)
        if codice in _RIPROVA:
            _segna(conn, pid, "da_mandare", "Orario non prenotabile online: parte quando riapre")
            return {"stato": "da_mandare", "nota": codice}
        if e.status in (0, 429) or e.status >= 500:
            _segna(conn, pid, "da_mandare", f"TheFork non raggiungibile ({e.status}): si riprova")
            return {"stato": "da_mandare", "nota": str(e)[:120]}
        _segna(conn, pid, "errore", f"TheFork ha rifiutato: {codice or str(e)[:200]}")
        return {"stato": "errore", "nota": codice or str(e)[:200]}


def dopo_creazione(pid: int) -> Dict[str, Any]:
    """Dal form, dopo il salvataggio. Con l'interruttore spento non fa niente."""
    conn = get_clienti_conn()
    try:
        if not attivo(conn):
            return {"stato": None, "nota": "invio a TheFork spento"}
        return invia(conn, pid)
    except Exception as e:  # noqa: BLE001  — mai far fallire il salvataggio in TRGB
        logger.exception("invio a TheFork #%s", pid)
        return {"stato": "errore", "nota": str(e)[:200]}
    finally:
        conn.close()


def dopo_modifica(pid: int, prima: Dict[str, Any]) -> Dict[str, Any]:
    """Dopo una modifica o una cancellazione fatta in TRGB: la riporta su TheFork se l'avevamo mandata noi."""
    conn = get_clienti_conn()
    try:
        if not attivo(conn):
            return {"stato": None}
        p = conn.execute("SELECT * FROM clienti_prenotazioni WHERE id = ?", (pid,)).fetchone()
        if not p:
            return {"stato": None}
        inv = p["thefork_invio"]
        if inv == "inviata" and p["thefork_booking_id"]:
            try:
                if p["stato"] == "CANCELED" and prima.get("stato") != "CANCELED":
                    try:
                        prenota.cancella_prenotazione(p["thefork_booking_id"])
                    except tf.TheForkErroreAPI as e:
                        if e.status != 409:   # 409 = già cancellata
                            raise
                    _segna(conn, pid, "inviata", "Cancellata anche su TheFork")
                elif any(k in prima and str(p[k] or "") != str(prima.get(k) or "") for k in ("data_pasto", "ora_pasto", "pax", "nota_ristorante", "persona_nome")):
                    nota_r = " · ".join(x for x in (
                        (f"A nome {p['persona_nome']}" if p["persona_nome"] else ""), (p["nota_ristorante"] or "").strip()) if x)
                    tf._richiesta("PATCH", f"/v1/reservations/{p['thefork_booking_id']}", corpo={
                        "mealDate": prenota._con_fuso(p["data_pasto"], str(p["ora_pasto"])[:5]),
                        "partySize": int(p["pax"]), "restaurantNote": nota_r or None})
                    _segna(conn, pid, "inviata", "Modifica riportata su TheFork")
            except (tf.TheForkErroreAPI, tf.TheForkNonConfigurato) as e:
                _segna(conn, pid, "inviata", f"ATTENZIONE: modifica NON arrivata a TheFork ({_codice(e) or str(e)[:120]})")
                return {"stato": "inviata", "errore": str(e)[:200]}
            return {"stato": "inviata"}
        if inv == "da_mandare" and p["stato"] == "CANCELED":
            _segna(conn, pid, "no", "Cancellata prima di partire")
            return {"stato": "no"}
        if inv == "sospesa" and p["stato"] == "CANCELED":
            _segna(conn, pid, "no", "Cancellata prima di partire")
            return {"stato": "no"}
        if not p["thefork_booking_id"] and p["stato"] == "RECORDED" and inv in ("da_mandare", "sospesa"):
            return invia(conn, pid)   # confermata un'opzione, o cambiato orario a una in coda
        return {"stato": inv}
    except Exception as e:  # noqa: BLE001
        logger.exception("modifica verso TheFork #%s", pid)
        return {"stato": "errore", "nota": str(e)[:200]}
    finally:
        conn.close()


def giro_coda(limite: int = 30) -> Dict[str, int]:
    """Riprova le prenotazioni «da mandare» (chiamato dal giro periodico di TheFork)."""
    conn = get_clienti_conn()
    esito = {"provate": 0, "inviate": 0}
    try:
        if not attivo(conn):
            return esito
        ids = [r["id"] for r in conn.execute(
            "SELECT id FROM clienti_prenotazioni WHERE thefork_invio = 'da_mandare' ORDER BY data_pasto, ora_pasto LIMIT ?",
            (limite,))]
        for pid in ids:
            esito["provate"] += 1
            if invia(conn, pid).get("stato") == "inviata":
                esito["inviate"] += 1
        return esito
    finally:
        conn.close()


def tieni_trgb(conn, rec: Dict[str, Any]) -> None:
    """Sincronizzazione: una prenotazione mandata da TRGB tiene cliente, canale e nomi di TRGB."""
    try:
        gia = conn.execute(
            "SELECT thefork_invio FROM clienti_prenotazioni WHERE thefork_booking_id = ?",
            (rec.get("thefork_booking_id"),)).fetchone()
    except Exception:  # noqa: BLE001  (colonna non ancora creata)
        return
    if gia and gia["thefork_invio"] == "inviata":
        for k in ("cliente_id", "canale", "nome_ospite", "cognome_ospite", "prenotato_da", "fonte",
                  "creato_da", "nota_cliente", "data_prenotazione"):
            rec.pop(k, None)
