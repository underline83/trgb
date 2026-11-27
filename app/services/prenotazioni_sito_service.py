# @version: v2.0 — porta del percorso unico (inserimento_service), lista d'attesa, niente anticipo (2026-11-27); v1.0 widget pubblico (2026-10-20, mig 205)
# -*- coding: utf-8 -*-
"""
Prenotazioni dal sito — Modulo: prenotazioni — [core]

Il pezzo che sostituisce il Booking Module di TheFork. Pagina pubblica /prenota
(anche in iframe nel sito).

Dal 27/11/2026 (Prenotazioni 2.60) il sito è una porta del percorso unico
(prenotazioni_inserimento_service): stessi passi e stessi controlli del form.
Cambia solo chi può dire sì: il cliente vede solo gli orari dove entra; per gli
altri orari del turno può mettersi in lista d'attesa. Fino a
`widget_max_automatica` persone è confermata, fino a `widget_max_richiesta` è
una richiesta da accettare nel Planning, oltre si chiede di telefonare. Niente
anticipo minimo né massimo: conta che il servizio sia aperto.

Qui restano le cose solo del sito:
- Email (M.D email_service) in italiano o inglese: conferma, richiesta
  ricevuta, lista d'attesa, richiesta accettata/rifiutata, promemoria il giorno
  prima, annullamento. Registrate in prenotazioni_email_log.
- Avvisi M.A a sala e admin per ogni prenotazione, richiesta, lista d'attesa o
  annullamento.
- Annullamento dal link nell'email (anche su TheFork, se la prenotazione era partita).
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.models.clienti_db import get_clienti_conn
from app.services import prenotazioni_fasce_service as fasce_srv
from app.services.notifiche_service import crea_notifica
from app.services import prenotazioni_stati as stati_srv

log = logging.getLogger("trgb.prenotazioni.sito")

# Quella del percorso unico: il router pubblico la intercetta come sito.NonDisponibile.
from app.services.prenotazioni_inserimento_service import NonDisponibile  # noqa: E402,F401


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
    from app.services import calendario_chiusure
    return calendario_chiusure.config()


def turni_chiusi_motivi(cfg: Dict[str, str], d: date, chiusure: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    """{turno: motivo} chiusi quel giorno: calendario chiusure del locale (platform)
    + giorno di chiusura delle prenotazioni (prenotazioni_config.giorno_chiusura,
    0=dom … 6=sab, -1 = nessuno)."""
    from app.services import calendario_chiusure
    cal = chiusure if chiusure is not None else _chiusure()
    out = calendario_chiusure.turni_chiusi(d, cal)
    try:
        g = int(cfg.get("giorno_chiusura", -1))
        # un'apertura straordinaria vale anche sul giorno di chiusura delle prenotazioni
        if g >= 0 and (d.weekday() + 1) % 7 == g and not calendario_chiusure.aperto_straordinario(d, cal):
            return {t: out.get(t) or "giorno di chiusura" for t in calendario_chiusure.TURNI}
    except (TypeError, ValueError):
        pass
    return out


def turni_chiusi(cfg: Dict[str, str], d: date, chiusure: Optional[Dict[str, Any]] = None) -> set:
    """Turni chiusi quel giorno: {'pranzo','cena'} se tutto il giorno."""
    return set(turni_chiusi_motivi(cfg, d, chiusure))


# ── Disponibilità: dal percorso unico (2026-11-27) ───────────
# Gli orari e il calendario del sito sono quelli di prenotazioni_inserimento_service, con le
# regole del cliente: solo gli orari dove si entra sono liberi; gli altri del turno (pieni,
# chiusi per l'online o su TheFork) si possono chiedere in lista d'attesa («attesa»).
# Niente anticipo minimo né massimo: conta che il servizio sia aperto (Marco 27/11).

def orari(conn, data: str, pax: int, adesso: Optional[datetime] = None,
          cfg: Optional[Dict[str, str]] = None, chiusure: Optional[Dict[str, Any]] = None,
          con_thefork: bool = True) -> Dict[str, Any]:
    """Orari prenotabili dal sito per quel giorno e quel numero di persone."""
    from app.services import prenotazioni_inserimento_service as ins
    return ins.orari(conn, data, pax, ins.CLIENTE, adesso=adesso, cfg=cfg, chiusure=chiusure, con_thefork=con_thefork)


def calendario(conn, mese: str, pax: int) -> Dict[str, Any]:
    """Per ogni giorno del mese: 'libero' | 'pieno' | 'chiuso' | 'fuori'.
    Senza chiedere a TheFork giorno per giorno: lo si guarda quando si apre il giorno."""
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
        o = orari(conn, d.isoformat(), pax, adesso, cfg, chiusure, con_thefork=False)
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


# ── Prenotazione ─────────────────────────────────────────────

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _pulisci(v: Any, n: int) -> Optional[str]:
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return s[:n] or None


def crea(dati: Dict[str, Any]) -> Dict[str, Any]:
    """
    dati: data, ora, pax, nome, cognome, telefono, email, note, allergie, occasione,
    lingua, titolo, lista_attesa. Solleva NonDisponibile / ValueError (campo).
    I passi sono quelli del form: prenotazioni_inserimento_service.inserisci.
    """
    from app.services import prenotazioni_inserimento_service as ins
    from app.utils import telefono as tel
    nome = _pulisci(dati.get("nome"), 60)
    cognome = _pulisci(dati.get("cognome"), 60)
    email = (_pulisci(dati.get("email"), 120) or "").lower() or None
    numero = tel.normalizza(dati.get("telefono"))
    if not nome or not cognome:
        raise ValueError("nome")
    if not numero or len(tel.cifre(numero)) < 8:
        raise ValueError("telefono")
    if not email or not _EMAIL.match(email):
        raise ValueError("email")
    try:
        pax = int(dati.get("pax"))
    except (TypeError, ValueError):
        raise ValueError("pax")
    titolo = (str(dati.get("titolo") or "").strip().lower().replace(".", "").replace(" ", "_")) or None
    r = ins.inserisci({
        "data_pasto": str(dati.get("data") or ""), "ora_pasto": str(dati.get("ora") or "")[:5], "pax": pax,
        "nome": nome, "cognome": cognome, "telefono": numero, "email": email,
        "lingua": dati.get("lingua") or "it", "titolo": titolo,
        "nota_cliente": dati.get("note"), "allergie_segnalate": dati.get("allergie"),
        "occasione": dati.get("occasione"), "lista_attesa": bool(dati.get("lista_attesa")),
    }, ins.CLIENTE)
    return {"id": r["id"], "stato": r["stato"], "token": r["token"], "data": r["data"], "ora": r["ora"],
            "pax": r["pax"], "cliente_nuovo": r["cliente_nuovo"]}


def _avvisa_staff(pid, stato, data, ora, pax, nome, cognome, doppi, nota=None) -> None:
    try:
        richiesta = stato == "REQUESTED"
        attesa = stato == "WAITLIST"
        gg = data.split("-")
        crea_notifica(
            tipo="prenotazioni",
            titolo=(f"Richiesta dal sito da accettare: {nome} {cognome}, {pax} pax" if richiesta
                    else f"Lista d'attesa dal sito: {nome} {cognome}, {pax} pax" if attesa
                    else f"Prenotazione dal sito: {nome} {cognome}, {pax} pax"),
            messaggio=(f"{gg[2]}/{gg[1]} alle {ora}"
                       + (f" — possibile doppione di {doppi[0]['nome']} ({doppi[0]['ora']})" if doppi else "")
                       + (f" — {nota}" if nota else "")),
            link=f"/prenotazioni/planning/{data}",
            icona="🙋" if richiesta else "🕰️" if attesa else "🌐",
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
        if r["stato"] not in ("RECORDED", "REQUESTED", "WAITLIST") or quando <= datetime.now():
            raise NonDisponibile("non_annullabile", "non annullabile")
        conn.execute("""
            UPDATE clienti_prenotazioni SET stato = 'CANCELED',
                   nota_ristorante = TRIM(COALESCE(nota_ristorante, '') || ' · annullata dal cliente online', ' ·'),
                   updated_at = datetime('now','localtime')
            WHERE id = ?
        """, (r["id"],))
        conn.commit()
        pid, data, ora, pax, nome = r["id"], r["data_pasto"], (r["ora_pasto"] or "")[:5], r["pax"], r["nome"]
        stato_prima = r["stato"]
    finally:
        conn.close()
    from app.services.prenotazioni_attese_service import avvisa_posto_liberato_sicuro
    avvisa_posto_liberato_sicuro(pid, stato_prima, "CANCELED")  # lista d'attesa (2026-11-13)
    try:  # se era partita per TheFork, la si cancella anche lì (2026-11-27)
        from app.services import thefork_invio_service as invio_tf
        invio_tf.dopo_modifica(pid, {"stato": stato_prima})
    except Exception as e:  # noqa: BLE001
        log.warning("annullamento #%s verso TheFork: %s", pid, e)
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
        "attesa": ("Sei in lista d'attesa", "Ciao {nome},\n\nti abbiamo messo in lista d'attesa per {quando} alle {ora}, {pax}.\nSe si libera un posto ti contattiamo noi.\n"),
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
        "attesa": ("You are on the waiting list", "Hi {nome},\n\nwe have put you on the waiting list for {quando} at {ora}, {pax}.\nIf a table becomes free we will get in touch.\n"),
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
    if tipo in ("conferma", "richiesta", "attesa", "accettata", "promemoria") and rg.get("url_pubblico") and p.get("token_cancellazione"):
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
    """Hook dal Planning: una richiesta o una lista d'attesa dal sito accettata o rifiutata → email al cliente."""
    if prima not in ("REQUESTED", "WAITLIST") or dopo not in ("RECORDED", "REFUSED"):
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
