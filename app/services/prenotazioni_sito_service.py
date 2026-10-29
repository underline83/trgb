# @version: v1.0 — prenotazioni dal sito (widget pubblico) (2026-10-20, mig 205)
# -*- coding: utf-8 -*-
"""
Prenotazioni dal sito — Modulo: prenotazioni — [core]

Il pezzo che sostituisce il Booking Module di TheFork. Pagina pubblica /prenota
(anche in iframe nel sito). Regole:

- Giorni prenotabili: da oggi a `giorni_anticipo_max`, almeno
  `giorni_anticipo_min_ore` ore prima del pasto. Chiusure dal calendario del
  gestionale (closures_config: giorno fisso, giorni chiusi, turni chiusi) e
  dal giorno di chiusura delle prenotazioni.
- Orari: le fasce del turno (prenotazioni_fasce_service). Una fascia si vende
  se è aperta, aperta online, e con questa prenotazione non supera il massimo
  coperti, il massimo online (TheFork + sito) e la capienza del turno.
- Fino a `widget_max_automatica` persone la prenotazione è confermata
  (RECORDED); fino a `widget_max_richiesta` è una richiesta (REQUESTED) da
  accettare nel Planning, e si guarda solo che la fascia sia aperta; oltre, si
  chiede di telefonare.
- Cliente: stesso telefono (o email) di un cliente esistente → quello;
  altrimenti nuovo cliente (origine 'sito'). Non si sovrascrive niente, si
  completano solo telefono/email/lingua mancanti.
- Email (M.D email_service) in italiano o inglese: conferma, richiesta
  ricevuta, richiesta accettata/rifiutata, promemoria il giorno prima,
  annullamento. Registrate in prenotazioni_email_log.
- Avvisi M.A a sala e admin per ogni prenotazione, richiesta o annullamento.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.models.clienti_db import get_clienti_conn
from app.services import prenotazioni_fasce_service as fasce_srv
from app.services.clienti_thefork_service import pulisci_telefono
from app.services.notifiche_service import crea_notifica

log = logging.getLogger("trgb.prenotazioni.sito")

STATI_ATTIVI_ESCLUSI = ("CANCELED", "NO_SHOW", "REFUSED")
_lock = threading.Lock()


class NonDisponibile(Exception):
    """La richiesta non si può accettare: il messaggio va al cliente."""

    def __init__(self, codice: str, messaggio: str):
        super().__init__(messaggio)
        self.codice = codice
        self.messaggio = messaggio


# ── Config ───────────────────────────────────────────────────

def config(conn) -> Dict[str, str]:
    return {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM prenotazioni_config")}


def _int(cfg: Dict[str, str], chiave: str, default: int) -> int:
    try:
        return int(float(cfg.get(chiave) or default))
    except (TypeError, ValueError):
        return default


def regole(cfg: Dict[str, str]) -> Dict[str, Any]:
    return {
        "attivo": str(cfg.get("widget_attivo", "0")) == "1",
        "max_automatica": _int(cfg, "widget_max_automatica", 6),
        "max_richiesta": _int(cfg, "widget_max_richiesta", 35),
        "giorni_max": _int(cfg, "giorni_anticipo_max", 60),
        "ore_min": _int(cfg, "giorni_anticipo_min_ore", 2),
        "telefono": (cfg.get("widget_telefono") or "").strip(),
        "nota": (cfg.get("widget_nota") or "").strip(),
        "messaggio_pieno": (cfg.get("widget_messaggio_pieno") or "").strip(),
        "email_attive": str(cfg.get("widget_email_attive", "1")) == "1",
        "url_pubblico": (cfg.get("widget_url_pubblico") or "").rstrip("/"),
    }


def _nome_locale() -> str:
    try:
        from app.services.thefork_service import _locale_info
        return _locale_info().get("nome") or "Osteria"
    except Exception:
        return "Osteria"


# ── Chiusure ─────────────────────────────────────────────────

def _chiusure() -> Dict[str, Any]:
    try:
        from app.routers.closures_config_router import get_closures_config
        return get_closures_config() or {}
    except Exception:
        return {}


def turni_chiusi(cfg: Dict[str, str], d: date, chiusure: Optional[Dict[str, Any]] = None) -> set:
    """Turni chiusi quel giorno: {'pranzo','cena'} se tutto il giorno."""
    ch = chiusure if chiusure is not None else _chiusure()
    tutti = {"pranzo", "cena"}
    fisso = ch.get("giorno_chiusura_settimanale")
    if fisso is not None and d.weekday() == int(fisso):
        return tutti
    if d.isoformat() in set(ch.get("giorni_chiusi") or []):
        return tutti
    try:  # giorno di chiusura delle prenotazioni: 0=dom … 6=sab, -1 = nessuno
        g = int(cfg.get("giorno_chiusura", -1))
        if g >= 0 and (d.weekday() + 1) % 7 == g:
            return tutti
    except (TypeError, ValueError):
        pass
    out = set()
    for t in ch.get("turni_chiusi") or []:
        if t.get("data") == d.isoformat() and t.get("turno") in tutti:
            out.add(t["turno"])
    return out


# ── Disponibilità ────────────────────────────────────────────

def _coperti_turno(conn, data: str, turno: str) -> int:
    r = conn.execute(f"""
        SELECT COALESCE(SUM(pax), 0) FROM clienti_prenotazioni
        WHERE data_pasto = ? AND turno = ? AND stato NOT IN ({','.join('?' * len(STATI_ATTIVI_ESCLUSI))})
    """, (data, turno, *STATI_ATTIVI_ESCLUSI)).fetchone()
    return int(r[0] or 0)


def orari(conn, data: str, pax: int, adesso: Optional[datetime] = None,
          cfg: Optional[Dict[str, str]] = None, chiusure: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Orari prenotabili dal sito per quel giorno e quel numero di persone.
    Ritorna {"data", "richiesta": bool, "turni": [{"turno", "orari": [{"ora","libero"}]}], "motivo"}.
    """
    cfg = cfg or config(conn)
    rg = regole(cfg)
    adesso = adesso or datetime.now()
    out: Dict[str, Any] = {"data": data, "pax": pax, "richiesta": pax > rg["max_automatica"], "turni": [], "motivo": None}
    try:
        d = date.fromisoformat(data)
    except ValueError:
        out["motivo"] = "data"
        return out
    if pax < 1:
        out["motivo"] = "persone"
        return out
    if pax > rg["max_richiesta"]:
        out["motivo"] = "gruppo"
        return out
    if d < adesso.date() or d > adesso.date() + timedelta(days=rg["giorni_max"]):
        out["motivo"] = "fuori_periodo"
        return out
    chiusi = turni_chiusi(cfg, d, chiusure)
    if chiusi >= {"pranzo", "cena"}:
        out["motivo"] = "chiuso"
        return out
    limite = adesso + timedelta(hours=rg["ore_min"])
    for turno in ("pranzo", "cena"):
        if turno in chiusi:
            continue
        fasce = fasce_srv.fasce_giorno(conn, data, turno, cfg)["fasce"]
        if not fasce:
            continue
        from app.services import prenotazioni_sale_service as sale_srv
        capienza = sale_srv.capienza(conn, data, turno)  # tavoli delle sale aperte (mig 214)
        if capienza is None:
            capienza = _int(cfg, f"capienza_{turno}", 0)
        elif capienza == 0:
            continue  # tutte le sale chiuse in quel turno
        occupati = _coperti_turno(conn, data, turno)
        # Motore per tavoli: un orario si vende solo se c'è davvero un tavolo libero
        from app.services import prenotazioni_tavoli_service as tavoli_srv
        motore = None
        if not out["richiesta"]:
            try:
                motore = tavoli_srv.Verificatore(conn, data, turno)
                if not motore.ha_tavoli:
                    motore = None
            except Exception:
                motore = None
        lista = []
        for f in fasce:
            quando = datetime.combine(d, datetime.strptime(f["ora"], "%H:%M").time())
            if quando < limite or not f["aperta"] or not f["online_aperta"]:
                continue
            if out["richiesta"]:
                libero = True  # i gruppi li decide la sala
            else:
                libero = (
                    (f["max_coperti"] is None or f["coperti"] + pax <= f["max_coperti"])
                    and (f["max_online"] is None or f["online"] + pax <= f["max_online"])
                    # senza tavoli in mappa conta la capienza in coperti; coi tavoli decide il motore
                    and (motore is not None or capienza <= 0 or occupati + pax <= capienza)
                )
                if libero and motore is not None:
                    libero = motore.verifica(pax, f["ora"])["entra"]
            lista.append({"ora": f["ora"], "libero": libero})
        if lista:
            out["turni"].append({"turno": turno, "orari": lista})
    if not any(o["libero"] for t in out["turni"] for o in t["orari"]):
        out["motivo"] = "pieno"
    return out


def calendario(conn, mese: str, pax: int) -> Dict[str, Any]:
    """Per ogni giorno del mese: 'libero' | 'pieno' | 'chiuso' | 'fuori'."""
    cfg = config(conn)
    chiusure = _chiusure()
    try:
        primo = date.fromisoformat(f"{mese}-01")
    except ValueError:
        return {"mese": mese, "giorni": {}}
    adesso = datetime.now()
    giorni: Dict[str, str] = {}
    d = primo
    while d.month == primo.month:
        o = orari(conn, d.isoformat(), pax, adesso, cfg, chiusure)
        if o["motivo"] in ("fuori_periodo", "data", "persone", "gruppo"):
            giorni[d.isoformat()] = "fuori"
        elif o["motivo"] == "chiuso":
            giorni[d.isoformat()] = "chiuso"
        elif o["motivo"] == "pieno":
            giorni[d.isoformat()] = "pieno" if o["turni"] or d > adesso.date() else "fuori"
        else:
            giorni[d.isoformat()] = "libero"
        d += timedelta(days=1)
    return {"mese": mese, "pax": pax, "giorni": giorni}


# ── Cliente ──────────────────────────────────────────────────

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _trova_o_crea_cliente(conn, nome: str, cognome: str, telefono: Optional[str],
                          email: Optional[str], lingua: str) -> Tuple[int, bool]:
    riga = None
    if telefono:
        cifre = re.sub(r"\D", "", telefono)[-9:]
        for r in conn.execute(
            "SELECT id, telefono, email, lingua FROM clienti WHERE attivo = 1 AND telefono IS NOT NULL AND telefono LIKE ?",
            (f"%{cifre}",),
        ):
            if re.sub(r"\D", "", r["telefono"] or "").endswith(re.sub(r"\D", "", telefono)[-10:]):
                riga = r
                break
    if not riga and email:
        riga = conn.execute(
            "SELECT id, telefono, email, lingua FROM clienti WHERE attivo = 1 AND LOWER(email) = ? ORDER BY id LIMIT 1",
            (email.lower(),),
        ).fetchone()
    if riga:
        upd = {}
        if telefono and not riga["telefono"]:
            upd["telefono"] = telefono
        if email and not riga["email"]:
            upd["email"] = email
        if lingua and not riga["lingua"]:
            upd["lingua"] = lingua
        if upd:
            conn.execute(
                f"UPDATE clienti SET {', '.join(f'{k} = ?' for k in upd)}, updated_at = datetime('now','localtime') WHERE id = ?",
                [*upd.values(), riga["id"]],
            )
        return riga["id"], False
    cur = conn.execute("""
        INSERT INTO clienti (nome, cognome, telefono, email, lingua, origine, protetto)
        VALUES (?, ?, ?, ?, ?, 'sito', 1)
    """, (nome, cognome, telefono, email, lingua))
    return cur.lastrowid, True


# ── Prenotazione ─────────────────────────────────────────────

def _pulisci(v: Any, n: int) -> Optional[str]:
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return s[:n] or None


def crea(dati: Dict[str, Any]) -> Dict[str, Any]:
    """
    dati: data, ora, pax, nome, cognome, telefono, email, note, allergie,
    occasione, lingua. Solleva NonDisponibile / ValueError (campo, messaggio).
    """
    lingua = "en" if str(dati.get("lingua") or "it").lower().startswith("en") else "it"
    nome = _pulisci(dati.get("nome"), 60)
    cognome = _pulisci(dati.get("cognome"), 60)
    email = (_pulisci(dati.get("email"), 120) or "").lower() or None
    telefono = pulisci_telefono(dati.get("telefono"))
    if not nome or not cognome:
        raise ValueError("nome")
    if not telefono:
        raise ValueError("telefono")
    if not email or not _EMAIL.match(email):
        raise ValueError("email")
    try:
        pax = int(dati.get("pax"))
    except (TypeError, ValueError):
        raise ValueError("pax")
    data = str(dati.get("data") or "")
    ora = str(dati.get("ora") or "")[:5]

    with _lock:  # due clienti sull'ultimo posto: uno solo passa
        conn = get_clienti_conn()
        try:
            cfg = config(conn)
            rg = regole(cfg)
            disp = orari(conn, data, pax, cfg=cfg)
            if disp["motivo"] == "gruppo":
                raise NonDisponibile("gruppo", "gruppo")
            scelta = next((o for t in disp["turni"] for o in t["orari"] if o["ora"] == ora), None)
            turno = next((t["turno"] for t in disp["turni"] for o in t["orari"] if o["ora"] == ora), None)
            if not scelta or not scelta["libero"]:
                raise NonDisponibile("occupato", "occupato")

            cliente_id, nuovo = _trova_o_crea_cliente(conn, nome, cognome, telefono, email, lingua)
            stato = "REQUESTED" if pax > rg["max_automatica"] else "RECORDED"
            token = secrets.token_urlsafe(16)
            occasione = _pulisci(dati.get("occasione"), 40)
            cur = conn.execute("""
                INSERT INTO clienti_prenotazioni (
                    cliente_id, data_pasto, ora_pasto, stato, pax, canale, occasione,
                    nota_cliente, allergie_segnalate, data_prenotazione, prenotato_da,
                    turno, fonte, creato_da, token_cancellazione, nome_ospite, cognome_ospite
                ) VALUES (?, ?, ?, ?, ?, 'Sito', ?, ?, ?, datetime('now','localtime'), 'sito', ?, 'sito', 'sito', ?, ?, ?)
            """, (cliente_id, data, f"{ora}:00", stato, pax, occasione,
                  _pulisci(dati.get("note"), 500), _pulisci(dati.get("allergie"), 300),
                  turno, token, nome, cognome))
            pid = cur.lastrowid
            conn.commit()
            try:  # posto venduto dal sito: il motore ricontrolla l'online (TheFork)
                from app.services import prenotazioni_online_auto_service as online_auto
                online_auto.ricalcola_presto()
            except Exception:  # noqa: BLE001
                pass

            try:
                from app.services.prenotazioni_doppioni_service import doppioni_di
                doppi = doppioni_di(conn, pid)
            except Exception:
                doppi = []
        finally:
            conn.close()

    _avvisa_staff(pid, stato, data, ora, pax, nome, cognome, doppi)
    _invia_in_background(pid, "richiesta" if stato == "REQUESTED" else "conferma")
    return {"id": pid, "stato": stato, "token": token, "data": data, "ora": ora, "pax": pax,
            "cliente_nuovo": nuovo}


def _avvisa_staff(pid, stato, data, ora, pax, nome, cognome, doppi) -> None:
    try:
        richiesta = stato == "REQUESTED"
        gg = data.split("-")
        crea_notifica(
            tipo="prenotazioni",
            titolo=(f"Richiesta dal sito da accettare: {nome} {cognome}, {pax} pax" if richiesta
                    else f"Prenotazione dal sito: {nome} {cognome}, {pax} pax"),
            messaggio=(f"{gg[2]}/{gg[1]} alle {ora}"
                       + (f" — possibile doppione di {doppi[0]['nome']} ({doppi[0]['ora']})" if doppi else "")),
            link=f"/prenotazioni/planning/{data}",
            icona="🙋" if richiesta else "🌐",
            urgenza="alta" if richiesta else "normale",
            modulo="prenotazioni",
            entity_id=pid,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("notifica prenotazione sito #%s: %s", pid, e)


# ── Annullamento dal cliente ─────────────────────────────────

def _per_token(conn, token: str):
    if not token or len(token) < 10:
        return None
    return conn.execute("""
        SELECT p.id, p.data_pasto, p.ora_pasto, p.pax, p.stato, p.fonte,
               COALESCE(NULLIF(c.nome,''), p.nome_ospite) AS nome, c.lingua
        FROM clienti_prenotazioni p LEFT JOIN clienti c ON c.id = p.cliente_id
        WHERE p.token_cancellazione = ?
    """, (token,)).fetchone()


def dettaglio_token(token: str) -> Optional[Dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        r = _per_token(conn, token)
        if not r:
            return None
        quando = datetime.fromisoformat(f"{r['data_pasto']}T{(r['ora_pasto'] or '00:00')[:5]}")
        return {
            "data": r["data_pasto"], "ora": (r["ora_pasto"] or "")[:5], "pax": r["pax"], "nome": r["nome"],
            "stato": r["stato"], "lingua": r["lingua"] or "it",
            "annullabile": r["stato"] in ("RECORDED", "REQUESTED") and quando > datetime.now(),
            "locale": _nome_locale(),
        }
    finally:
        conn.close()


def annulla(token: str) -> Dict[str, Any]:
    conn = get_clienti_conn()
    try:
        r = _per_token(conn, token)
        if not r:
            raise LookupError("prenotazione non trovata")
        quando = datetime.fromisoformat(f"{r['data_pasto']}T{(r['ora_pasto'] or '00:00')[:5]}")
        if r["stato"] not in ("RECORDED", "REQUESTED") or quando <= datetime.now():
            raise NonDisponibile("non_annullabile", "non annullabile")
        conn.execute("""
            UPDATE clienti_prenotazioni SET stato = 'CANCELED',
                   nota_ristorante = TRIM(COALESCE(nota_ristorante, '') || ' · annullata dal cliente online', ' ·'),
                   updated_at = datetime('now','localtime')
            WHERE id = ?
        """, (r["id"],))
        conn.commit()
        pid, data, ora, pax, nome = r["id"], r["data_pasto"], (r["ora_pasto"] or "")[:5], r["pax"], r["nome"]
    finally:
        conn.close()
    try:
        gg = data.split("-")
        crea_notifica(tipo="prenotazioni", titolo=f"Annullata dal cliente: {nome or ''}, {pax} pax",
                      messaggio=f"{gg[2]}/{gg[1]} alle {ora}", link=f"/prenotazioni/planning/{data}",
                      icona="❌", modulo="prenotazioni", entity_id=pid)
    except Exception as e:  # noqa: BLE001
        log.warning("notifica annullamento #%s: %s", pid, e)
    _invia_in_background(pid, "annullata")
    return {"ok": True}


# ── Email al cliente ─────────────────────────────────────────

_MESI = {
    "it": ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
           "settembre", "ottobre", "novembre", "dicembre"],
    "en": ["January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December"],
}
_GIORNI = {
    "it": ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
}


def data_estesa(data: str, lingua: str) -> str:
    d = date.fromisoformat(data)
    if lingua == "en":
        return f"{_GIORNI['en'][d.weekday()]} {d.day} {_MESI['en'][d.month - 1]} {d.year}"
    return f"{_GIORNI['it'][d.weekday()]} {d.day} {_MESI['it'][d.month - 1]} {d.year}"


TESTI = {
    "it": {
        "conferma": ("La tua prenotazione è confermata", "Ciao {nome},\n\nti aspettiamo {quando} alle {ora}, {pax}.\n"),
        "richiesta": ("Abbiamo ricevuto la tua richiesta", "Ciao {nome},\n\nabbiamo ricevuto la richiesta per {quando} alle {ora}, {pax}.\nPer i gruppi confermiamo noi: ti scriviamo appena possibile.\n"),
        "accettata": ("La tua prenotazione è confermata", "Ciao {nome},\n\nabbiamo confermato la tua prenotazione: {quando} alle {ora}, {pax}.\n"),
        "rifiutata": ("Non riusciamo ad accoglierti", "Ciao {nome},\n\nci dispiace, per {quando} alle {ora} non abbiamo posto per {pax}.{tel_frase}\n"),
        "promemoria": ("Ci vediamo domani", "Ciao {nome},\n\nti ricordiamo la prenotazione di domani, {quando}, alle {ora}, {pax}.\n"),
        "annullata": ("Prenotazione annullata", "Ciao {nome},\n\nla prenotazione di {quando} alle {ora} è annullata. Speriamo di vederti presto.\n"),
        "persone": lambda n: "1 persona" if n == 1 else f"{n} persone",
        "annulla": "Se non riesci a venire, annulla qui: {link}",
        "telefono": "Per qualsiasi cosa chiamaci al {tel}.",
        "tel_frase": " Se vuoi, chiamaci al {tel} per trovare un'altra soluzione.",
        "firma": "A presto,\n{locale}",
    },
    "en": {
        "conferma": ("Your booking is confirmed", "Hi {nome},\n\nwe look forward to seeing you on {quando} at {ora}, {pax}.\n"),
        "richiesta": ("We have received your request", "Hi {nome},\n\nwe have received your request for {quando} at {ora}, {pax}.\nGroup bookings are confirmed by us: we will get back to you soon.\n"),
        "accettata": ("Your booking is confirmed", "Hi {nome},\n\nwe have confirmed your booking: {quando} at {ora}, {pax}.\n"),
        "rifiutata": ("We cannot accommodate you", "Hi {nome},\n\nwe are sorry, on {quando} at {ora} we have no room for {pax}.{tel_frase}\n"),
        "promemoria": ("See you tomorrow", "Hi {nome},\n\na reminder of your booking tomorrow, {quando}, at {ora}, {pax}.\n"),
        "annullata": ("Booking cancelled", "Hi {nome},\n\nyour booking on {quando} at {ora} has been cancelled. We hope to see you soon.\n"),
        "persone": lambda n: "1 guest" if n == 1 else f"{n} guests",
        "annulla": "If you cannot make it, please cancel here: {link}",
        "telefono": "For anything else call us on {tel}.",
        "tel_frase": " If you like, call us on {tel} and we will find another solution.",
        "firma": "See you soon,\n{locale}",
    },
}


def componi(tipo: str, p: Dict[str, Any], rg: Dict[str, Any]) -> Tuple[str, str]:
    lingua = "en" if (p.get("lingua") or "it").startswith("en") else "it"
    T = TESTI[lingua]
    locale = _nome_locale()
    oggetto, corpo = T[tipo]
    tel = rg.get("telefono") or ""
    corpo = corpo.format(
        nome=p.get("nome") or "", quando=data_estesa(p["data_pasto"], lingua),
        ora=(p.get("ora_pasto") or "")[:5], pax=T["persone"](p.get("pax") or 0),
        tel_frase=T["tel_frase"].format(tel=tel) if tel else "",
    )
    righe = [corpo]
    if tipo in ("conferma", "richiesta", "accettata", "promemoria") and rg.get("url_pubblico") and p.get("token_cancellazione"):
        righe.append(T["annulla"].format(link=f"{rg['url_pubblico']}/prenota/annulla/{p['token_cancellazione']}"))
    if tel and tipo != "rifiutata":
        righe.append(T["telefono"].format(tel=tel))
    righe.append("\n" + T["firma"].format(locale=locale))
    return f"{locale} — {oggetto}", "\n".join(righe)


def invia_email_cliente(pid: int, tipo: str, forza: bool = False) -> Dict[str, Any]:
    """Invia l'email `tipo` per la prenotazione. Una sola volta per tipo, salvo forza."""
    conn = get_clienti_conn()
    try:
        rg = regole(config(conn))
        if not rg["email_attive"]:
            return {"saltata": "email disattivate"}
        p = conn.execute("""
            SELECT p.id, p.data_pasto, p.ora_pasto, p.pax, p.stato, p.token_cancellazione,
                   COALESCE(NULLIF(c.nome,''), p.nome_ospite) AS nome, c.email, c.lingua
            FROM clienti_prenotazioni p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = ?
        """, (pid,)).fetchone()
        if not p or not p["email"]:
            return {"saltata": "senza email"}
        if not forza and conn.execute(
            "SELECT 1 FROM prenotazioni_email_log WHERE prenotazione_id = ? AND tipo = ? AND errore IS NULL", (pid, tipo)
        ).fetchone():
            return {"saltata": "già inviata"}
        oggetto, corpo = componi(tipo, dict(p), rg)
        from app.services import email_service
        reply = None
        try:
            reply = email_service._cfg().get("reply_to") or None
        except Exception:
            pass
        esito = email_service.invia_email(p["email"], oggetto, corpo, reply_to=reply)
        errore = None if getattr(esito, "ok", False) else (getattr(esito, "errore", None) or "errore invio")
        conn.execute(
            "INSERT INTO prenotazioni_email_log (prenotazione_id, tipo, destinatario, inviata_at, errore) "
            "VALUES (?, ?, ?, datetime('now','localtime'), ?)",
            (pid, tipo, p["email"], errore),
        )
        if not errore and tipo in ("conferma", "accettata"):
            conn.execute("UPDATE clienti_prenotazioni SET conferma_inviata = 1 WHERE id = ?", (pid,))
        conn.commit()
        if errore:
            log.warning("email %s prenotazione #%s: %s", tipo, pid, errore)
        return {"ok": not errore, "errore": errore}
    finally:
        conn.close()


def _invia_in_background(pid: int, tipo: str) -> None:
    def _v():
        try:
            invia_email_cliente(pid, tipo)
        except Exception as e:  # noqa: BLE001
            log.warning("email %s #%s: %s", tipo, pid, e)
    threading.Thread(target=_v, name=f"email-pren-{pid}", daemon=True).start()


def dopo_cambio_stato(pid: int, prima: str, dopo: str) -> None:
    """Hook dal Planning: una richiesta dal sito accettata o rifiutata → email al cliente."""
    if prima != "REQUESTED" or dopo not in ("RECORDED", "REFUSED"):
        return
    conn = get_clienti_conn()
    try:
        r = conn.execute("SELECT fonte FROM clienti_prenotazioni WHERE id = ?", (pid,)).fetchone()
    finally:
        conn.close()
    if r and r["fonte"] == "sito":
        _invia_in_background(pid, "accettata" if dopo == "RECORDED" else "rifiutata")


# ── Promemoria del giorno prima ──────────────────────────────

_stato_promemoria: Dict[str, Any] = {}


def invia_promemoria(oggi: Optional[date] = None) -> Dict[str, Any]:
    oggi = oggi or date.today()
    domani = (oggi + timedelta(days=1)).isoformat()
    conn = get_clienti_conn()
    try:
        ids = [r["id"] for r in conn.execute("""
            SELECT p.id FROM clienti_prenotazioni p JOIN clienti c ON c.id = p.cliente_id
            WHERE p.data_pasto = ? AND p.fonte = 'sito' AND p.stato = 'RECORDED' AND c.email IS NOT NULL
        """, (domani,))]
    finally:
        conn.close()
    inviate = sum(1 for pid in ids if invia_email_cliente(pid, "promemoria").get("ok"))
    return {"data": domani, "trovate": len(ids), "inviate": inviate}


def avvia_promemoria_periodico() -> None:
    """Thread: dopo l'ora di widget_ora_promemoria manda i promemoria per domani (una volta al giorno)."""
    if _stato_promemoria.get("avviato"):
        return
    _stato_promemoria["avviato"] = True

    def _giro():
        time.sleep(120)
        while True:
            try:
                conn = get_clienti_conn()
                try:
                    ora = (config(conn).get("widget_ora_promemoria") or "").strip()
                finally:
                    conn.close()
                oggi = date.today().isoformat()
                if ora and datetime.now().strftime("%H:%M") >= ora[:5] and _stato_promemoria.get("giorno") != oggi:
                    _stato_promemoria["giorno"] = oggi
                    _stato_promemoria["ultimo"] = invia_promemoria()
                    log.info("promemoria prenotazioni sito: %s", _stato_promemoria["ultimo"])
            except Exception as e:  # noqa: BLE001
                log.warning("promemoria prenotazioni sito: %s", e)
            time.sleep(600)

    threading.Thread(target=_giro, name="prenotazioni-promemoria", daemon=True).start()
