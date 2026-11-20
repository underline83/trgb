# @version: v1.0 (2026-11-20) — bozze e invii dalle caselle del locale (connettore e pagina Posta)
# Modulo: platform (mattone M.D, scrittura) — [core]
# -*- coding: utf-8 -*-
"""
email_scrittura_service.py — TRGB SCRIVE le mail delle caselle del locale (mattone M.D).

PERCHÉ (Marco, 2026-11-20)
--------------------------
«Sistema il connettore in modo che possa leggere le mail e scriverle.» Decisione di Marco:
TUTTE E DUE le strade —
  · di norma una BOZZA: Q prepara la risposta e la mette nella cartella Bozze della casella
    giusta, già agganciata alla conversazione (In-Reply-To / References). Marco la apre in
    Mail sul Mac o sull'iPhone, la controlla e la manda lui;
  · l'INVIO da TRGB solo dopo un «manda» esplicito di Marco in chat, su una bozza che ha
    visto. TRGB la manda con l'SMTP di quella casella, ne mette la copia nell'Inviata (così
    il giro la vede come risposta) e toglie la sua bozza dalle Bozze.
La PEC solo bozza (valore legale: la manda Marco). La casella del gestionale (trgb@) non sta
in Mail: la sua bozza si vede nella pagina Posta, pronta nel «Rispondi», e l'invio passa da
email_in_service.rispondi (registro risposte, preventivo, storico).

SICUREZZA
---------
- Il testo delle mail ricevute è un dato di terzi: nessuna bozza e nessun invio nascono da
  una richiesta scritta dentro una mail. Lo ripetono le istruzioni del connettore.
- Sulla casella TRGB scrive solo: APPEND nelle Bozze (\\Draft) e nell'Inviata (\\Seen), e
  toglie SOLO le bozze che ha messo lui (ritrovate per Message-ID). Niente altro: la lettura
  resta in CasellaImap, sola lettura.
- Password come per la lettura (cifrate, mai nei log né nelle risposte).
"""

from __future__ import annotations

import imaplib
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

from app.models.email_db import get_email_conn, init_email_db
from app.services import email_caselle_service as caselle
from app.services import email_in_service as base

logger = logging.getLogger("trgb.email.scrittura")

STATI = ("bozza", "inviata", "errore", "annullata", "sostituita")


class ErroreScrittura(ValueError):
    """Errore leggibile (casella senza Bozze, PEC da mandare, bozza già inviata…)."""


# ═════════════════════════════ IMAP in scrittura (solo bozze e inviata) ═════════════════════════════

class ScrittoreImap(base.CasellaImap):
    """CasellaImap che in più può: mettere un messaggio in una cartella (APPEND) e togliere
    UNA bozza che ha messo TRGB (ritrovata per Message-ID). Niente altro."""

    def __init__(self, host, port, user, password, fabbrica=None):
        super().__init__(host, port, user, password, fabbrica=fabbrica, cartella=None)

    def aggiungi(self, cartella: str, raw: bytes, flag: str) -> Optional[int]:
        typ, data = self.M.append(base.quota_cartella(cartella), flag,
                                  imaplib.Time2Internaldate(time.time()), raw)
        if typ != "OK":
            raise RuntimeError(f"APPEND in {cartella} rifiutato dal server")
        m = re.search(rb"APPENDUID \d+ (\d+)", b" ".join(d for d in (data or []) if isinstance(d, bytes)))
        return int(m.group(1)) if m else None

    def togli_bozza(self, cartella: str, message_id: str) -> bool:
        """Toglie dalle Bozze la bozza con quel Message-ID (solo quella). True se l'ha trovata."""
        if not message_id or not message_id.endswith("@" + message_id.split("@")[-1]):
            return False
        typ, _ = self.M.select(base.quota_cartella(cartella), readonly=False)
        if typ != "OK":
            raise RuntimeError(f"Cartella {cartella} non apribile in scrittura")
        typ, data = self.M.uid("SEARCH", None, "HEADER", "Message-ID", message_id.strip("<>"))
        uids = [int(x) for x in b" ".join(d for d in (data or []) if d).split()] if typ == "OK" else []
        if not uids:
            return False
        lista = ",".join(str(u) for u in uids)
        self.M.uid("STORE", lista, "+FLAGS", "(\\Deleted)")
        if "UIDPLUS" in (getattr(self.M, "capabilities", ()) or ()):
            self.M.uid("EXPUNGE", lista)          # solo quegli UID: le altre bozze non si toccano
        return True


def _apri_scrittore(c: dict, password: str):
    return ScrittoreImap(c["imap_host"], c["imap_port"], c["utente"], password)


# ═════════════════════════════ utilità ═════════════════════════════

def _lista(v) -> List[str]:
    if v is None:
        return []
    if isinstance(v, str):
        v = re.split(r"[,;]", v)
    return [x.strip() for x in v if x and x.strip()]


def _valida(indirizzi: List[str]) -> None:
    for x in indirizzi:
        if not re.fullmatch(r"[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+", x):
            raise ErroreScrittura(f"Indirizzo non valido: {x}")


def _casella(cid: str) -> dict:
    cs = (cid or "").strip().lower()
    for c in caselle.config()["caselle"]:
        if cs in (c["id"], c["indirizzo"]) or c["indirizzo"].startswith(cs + "@"):
            return c
    raise ErroreScrittura(f"Casella «{cid}» non trovata tra quelle del locale")


def _account(c: dict) -> dict:
    from app.services import email_service
    nome = c.get("nome_mittente") or (email_service._cfg().get("from_name") or "")
    return {"host": c["smtp_host"], "port": str(c["smtp_port"]), "user": c["utente"],
            "password": caselle._password(c), "from_addr": c["indirizzo"], "from_name": nome}


def _riga_bozza(r) -> dict:
    d = dict(r)
    return {k: d.get(k) for k in ("id", "casella", "rif_fonte", "rif_id", "a", "cc", "oggetto", "testo", "cita",
                                  "stato", "errore", "creata_da", "creata_at", "inviata_da", "inviata_at",
                                  "cartella_bozze")}


def leggi_bozza(bozza_id: int) -> Optional[dict]:
    init_email_db()
    conn = get_email_conn()
    try:
        r = conn.execute("SELECT * FROM email_bozze WHERE id = ?", (int(bozza_id),)).fetchone()
    finally:
        conn.close()
    return dict(r) if r else None


def bozze(stato: Optional[str] = "bozza", rif_fonte: Optional[str] = None, rif_id: Optional[int] = None,
          limite: int = 50) -> List[dict]:
    init_email_db()
    where, par = [], []
    if stato:
        if stato not in STATI:
            raise ErroreScrittura(f"stato: uno fra {', '.join(STATI)}")
        where.append("stato = ?")
        par.append(stato)
    if rif_fonte:
        where.append("rif_fonte = ?")
        par.append(rif_fonte)
    if rif_id:
        where.append("rif_id = ?")
        par.append(int(rif_id))
    conn = get_email_conn()
    try:
        righe = conn.execute(f"SELECT * FROM email_bozze WHERE {' AND '.join(where) or '1=1'} "
                             f"ORDER BY id DESC LIMIT ?", par + [max(1, min(int(limite), 200))]).fetchall()
    finally:
        conn.close()
    return [_riga_bozza(r) for r in righe]


# ═════════════════════════════ preparare ═════════════════════════════

def _dalla_casella(rif_id: int, casella_scelta: Optional[str]) -> dict:
    """Destinatari, oggetto, thread e citazione per rispondere a una mail di una casella."""
    init_email_db()
    conn = get_email_conn()
    try:
        r = conn.execute("SELECT * FROM email_posta WHERE id = ?", (int(rif_id),)).fetchone()
    finally:
        conn.close()
    if not r:
        raise ErroreScrittura(f"Mail {rif_id} non trovata (404)")
    r = dict(r)
    c = _casella(casella_scelta) if casella_scelta else next(
        (x for x in caselle.config()["caselle"] if x["id"] == r["casella"]), None)
    if not c:
        raise ErroreScrittura("La casella di questa mail non è più configurata: scegli da quale rispondere")
    nostri = set(caselle.indirizzi_nostri())
    mitt = (r.get("mittente") or "").lower()
    if r["ruolo"] == "inviata" or mitt in nostri:
        a = [x for x in base._indirizzi([r.get("a") or ""]) if x not in nostri]
    else:
        a = [mitt] if mitt else []
    cc = [x for x in base._indirizzi([r.get("a") or "", r.get("cc") or ""]) if x not in nostri and x not in a]
    rif = [x for x in (r.get("riferimenti") or "").split() if x]
    mid = r.get("message_id") or ""
    valido = mid and not mid.endswith(("@trgb.senza-id>", "@trgb.illeggibile>"))
    return {"casella": c, "a": a, "cc": cc, "oggetto": base._re(base.ripara_codifica(r.get("oggetto") or "")),
            "citazione": base._citazione(r), "in_reply_to": mid if valido else None,
            "riferimenti": " ".join(dict.fromkeys(rif + ([mid] if valido else []))) or None}


def _sostituisci_precedenti(conn, rif_fonte: Optional[str], rif_id: Optional[int], nuova_id: int) -> List[dict]:
    """Una mail ha una bozza aperta sola: quelle di prima diventano «sostituita» (e si tolgono dalle Bozze)."""
    if not rif_fonte or not rif_id:
        return []
    vecchie = [dict(x) for x in conn.execute(
        "SELECT * FROM email_bozze WHERE rif_fonte = ? AND rif_id = ? AND stato = 'bozza' AND id != ?",
        (rif_fonte, int(rif_id), nuova_id))]
    for v in vecchie:
        conn.execute("UPDATE email_bozze SET stato = 'sostituita' WHERE id = ?", (v["id"],))
    return vecchie


def crea_bozza(testo: str, utente: str, rif_fonte: Optional[str] = None, rif_id: Optional[int] = None,
               casella: Optional[str] = None, a=None, cc=None, oggetto: Optional[str] = None, cita: bool = True,
               apri: Optional[Any] = None) -> dict:
    """Prepara una mail. Risposta (rif_fonte + rif_id) o nuova (casella + a + oggetto). Per le
    caselle in Mail la mette nelle Bozze; per trgb@ resta in TRGB (pagina Posta, «Rispondi»)."""
    if not (testo or "").strip():
        raise ErroreScrittura("Testo vuoto")
    if rif_fonte not in (None, "casella", "trgb"):
        raise ErroreScrittura("rif_fonte: casella o trgb")
    init_email_db()
    ora = caselle.adesso()
    if rif_fonte == "trgb":
        b = base.bozza_risposta(int(rif_id or 0))
        if not b:
            raise ErroreScrittura(f"Mail {rif_id} della casella del gestionale non trovata (404)")
        dest_a = _lista(a) if a is not None else b["a"]
        dest_cc = _lista(cc) if cc is not None else b["cc"]
        if not dest_a:
            raise ErroreScrittura("Nessun destinatario")
        _valida(dest_a + dest_cc)
        conn = get_email_conn()
        try:
            bid = conn.execute(
                """INSERT INTO email_bozze (casella, rif_fonte, rif_id, a, cc, oggetto, testo, cita, stato,
                   creata_da, creata_at) VALUES ('trgb', 'trgb', ?, ?, ?, ?, ?, ?, 'bozza', ?, ?)""",
                (int(rif_id), ", ".join(dest_a), ", ".join(dest_cc), (oggetto or "").strip() or b["oggetto"],
                 testo.rstrip(), int(bool(cita)), utente, ora)).lastrowid
            _sostituisci_precedenti(conn, "trgb", rif_id, bid)
            conn.commit()
        finally:
            conn.close()
        out = _riga_bozza(leggi_bozza(bid))
        out["dove"] = "pagina Posta di TRGB: aprendo la mail, «Rispondi» è già compilato"
        return out

    if rif_fonte == "casella":
        info = _dalla_casella(int(rif_id or 0), casella)
        c = info["casella"]
    else:
        if not casella:
            raise ErroreScrittura("Per una mail nuova serve la casella da cui parte")
        c = _casella(casella)
        info = {"a": [], "cc": [], "oggetto": "", "citazione": "", "in_reply_to": None, "riferimenti": None}
    dest_a = _lista(a) if a is not None else info["a"]
    dest_cc = _lista(cc) if cc is not None else info["cc"]
    ogg = (oggetto or "").strip() or info["oggetto"]
    if not dest_a:
        raise ErroreScrittura("Nessun destinatario")
    if not ogg:
        raise ErroreScrittura("Manca l'oggetto")
    _valida(dest_a + dest_cc)
    gia = {x.lower() for x in dest_a}
    dest_cc = [x for x in dict.fromkeys(dest_cc) if x.lower() not in gia]
    corpo = testo.rstrip() + ("\n\n" + info["citazione"] if cita and info["citazione"] else "")
    intest = {}
    if info["in_reply_to"]:
        intest = {"In-Reply-To": info["in_reply_to"], "References": info["riferimenti"]}

    from app.services import email_service
    pw = caselle._password(c)
    if caselle._mancanti(c, pw):
        raise ErroreScrittura(f"Casella {c['indirizzo']} senza {', '.join(caselle._mancanti(c, pw))}")
    msg = email_service.costruisci_messaggio(dest_a, ogg, corpo, dest_cc, intest, _account(c))
    raw = msg.as_bytes()
    try:
        with (apri or _apri_scrittore)(c, pw) as cas:
            cartella = c.get("cartella_bozze") or caselle.trova_bozze(cas.elenco_cartelle())
            if not cartella:
                raise ErroreScrittura(f"Nella casella {c['indirizzo']} non trovo la cartella Bozze")
            uid = cas.aggiungi(cartella, raw, "(\\Draft \\Seen)")
    except ErroreScrittura:
        raise
    except Exception as e:                              # noqa: BLE001
        err = f"{type(e).__name__}: {e}"
        raise ErroreScrittura(f"Bozza non salvata nella casella: {err.replace(pw, '***') if pw else err}"[:500])

    conn = get_email_conn()
    try:
        bid = conn.execute(
            """INSERT INTO email_bozze (casella, rif_fonte, rif_id, a, cc, oggetto, testo, cita, in_reply_to, riferimenti,
               message_id, cartella_bozze, uid_bozza, stato, creata_da, creata_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'bozza', ?, ?)""",
            (c["id"], rif_fonte, int(rif_id) if rif_id else None, ", ".join(dest_a), ", ".join(dest_cc), ogg,
             testo.rstrip(), int(bool(cita)), info["in_reply_to"], info["riferimenti"], msg["Message-ID"],
             cartella, uid, utente, ora)).lastrowid
        vecchie = _sostituisci_precedenti(conn, rif_fonte, rif_id, bid)
        conn.commit()
    finally:
        conn.close()
    for v in vecchie:
        _togli_dalle_bozze(v, apri)
    out = _riga_bozza(leggi_bozza(bid))
    out["dove"] = f"Bozze di {c['indirizzo']} ({cartella}): si apre in Mail"
    out["puo_inviare"] = c["puo_inviare"]
    return out


def _togli_dalle_bozze(b: dict, apri=None) -> bool:
    """Toglie dalla casella la bozza messa da TRGB (se Marco non l'ha già mandata o cancellata)."""
    if not (b.get("cartella_bozze") and b.get("message_id")) or b.get("casella") == "trgb":
        return False
    try:
        c = _casella(b["casella"])
        pw = caselle._password(c)
        with (apri or _apri_scrittore)(c, pw) as cas:
            return cas.togli_bozza(b["cartella_bozze"], b["message_id"])
    except Exception:                                   # noqa: BLE001 — una bozza rimasta non è un danno
        logger.warning("Bozza %s non tolta da %s", b.get("id"), b.get("casella"))
        return False


def annulla_bozza(bozza_id: int, utente: str, apri=None) -> dict:
    b = leggi_bozza(bozza_id)
    if not b:
        raise ErroreScrittura(f"Bozza {bozza_id} non trovata (404)")
    if b["stato"] != "bozza":
        raise ErroreScrittura(f"La bozza {bozza_id} è già «{b['stato']}»")
    tolta = _togli_dalle_bozze(b, apri)
    conn = get_email_conn()
    try:
        conn.execute("UPDATE email_bozze SET stato = 'annullata', errore = NULL WHERE id = ?", (int(bozza_id),))
        conn.commit()
    finally:
        conn.close()
    out = _riga_bozza(leggi_bozza(bozza_id))
    out["tolta_dalla_casella"] = tolta
    return out


# ═════════════════════════════ mandare ═════════════════════════════

def invia_bozza(bozza_id: int, utente: str, apri=None) -> dict:
    """Manda una bozza (solo dopo il «manda» di Marco). Casella: SMTP della casella + copia
    nell'Inviata + via la bozza dalle Bozze. trgb@: email_in_service.rispondi."""
    b = leggi_bozza(bozza_id)
    if not b:
        raise ErroreScrittura(f"Bozza {bozza_id} non trovata (404)")
    if b["stato"] != "bozza":
        raise ErroreScrittura(f"La bozza {bozza_id} è già «{b['stato']}»: non si manda due volte")
    ora = caselle.adesso()

    if b["casella"] == "trgb":
        res = base.rispondi(b["rif_id"], b["testo"], utente, a=b["a"], cc=b["cc"] or "", oggetto=b["oggetto"],
                            cita=bool(b["cita"]))
        if res is None:
            raise ErroreScrittura("La mail a cui risponde non c'è più (404)")
        _chiudi(bozza_id, res["ok"], res.get("errore"), utente, ora, (res.get("risposta") or {}).get("message_id"))
        return {"ok": res["ok"], "errore": res.get("errore"), "bozza": _riga_bozza(leggi_bozza(bozza_id)),
                "da": "trgb (gestionale)"}

    c = _casella(b["casella"])
    if not c["puo_inviare"]:
        raise ErroreScrittura(f"Da {c['indirizzo']} TRGB non manda: la bozza è nella casella, la manda Marco"
                              + (" (PEC: valore legale)" if c["pec"] else ""))
    from app.services import email_service
    corpo = b["testo"]
    if b["cita"] and b["rif_fonte"] == "casella" and b["rif_id"]:
        try:
            corpo = corpo + "\n\n" + _dalla_casella(b["rif_id"], b["casella"])["citazione"]
        except ErroreScrittura:
            pass
    intest = {"In-Reply-To": b["in_reply_to"], "References": b["riferimenti"]} if b["in_reply_to"] else None
    esito = email_service.invia_email(to=_lista(b["a"]), subject=b["oggetto"], body=corpo, cc=_lista(b["cc"]) or None,
                                      intestazioni=intest, account=_account(c))
    nota = None
    if esito.ok:
        # copia nell'Inviata (l'SMTP non la mette) e via la bozza: in Mail si vede come mandata da lì
        pw = caselle._password(c)
        try:
            with (apri or _apri_scrittore)(c, pw) as cas:
                elenco = cas.elenco_cartelle()
                inviata = (caselle.trova_cartelle(elenco).get("inviata") or [None])[0]
                if inviata and esito.eml:
                    cas.aggiungi(inviata, esito.eml, "(\\Seen)")
                else:
                    nota = "copia nell'Inviata non salvata (cartella non trovata)"
                if b["cartella_bozze"] and b["message_id"]:
                    cas.togli_bozza(b["cartella_bozze"], b["message_id"])
        except Exception as e:                          # noqa: BLE001 — la mail è partita: il resto non la blocca
            nota = f"mail partita, ma copia nell'Inviata o pulizia delle Bozze non riuscita ({type(e).__name__})"
            logger.warning("Dopo l'invio della bozza %s: %s", bozza_id, nota)
    _chiudi(bozza_id, esito.ok, esito.errore if not esito.ok else nota, utente, ora, esito.message_id)
    return {"ok": esito.ok, "errore": esito.errore, "nota": nota, "da": c["indirizzo"],
            "bozza": _riga_bozza(leggi_bozza(bozza_id))}


def _chiudi(bozza_id: int, ok: bool, errore: Optional[str], utente: str, ora: str, mid: Optional[str]) -> None:
    conn = get_email_conn()
    try:
        if ok:
            conn.execute("UPDATE email_bozze SET stato = 'inviata', errore = ?, inviata_da = ?, inviata_at = ?, "
                         "message_id_inviata = ? WHERE id = ?", (errore, utente, ora, mid, int(bozza_id)))
        else:
            # resta «bozza»: si può correggere e riprovare; l'errore resta scritto
            conn.execute("UPDATE email_bozze SET errore = ? WHERE id = ?", (errore, int(bozza_id)))
        conn.commit()
    finally:
        conn.close()


def bozze_per_mail(fonte: str, ids: List[int]) -> Dict[int, dict]:
    """{rif_id: bozza aperta} per la pagina Posta (chip «bozza pronta», «Rispondi» compilato)."""
    ids = sorted({int(i) for i in ids if i})
    if not ids:
        return {}
    init_email_db()
    conn = get_email_conn()
    try:
        righe = conn.execute(
            f"SELECT * FROM email_bozze WHERE rif_fonte = ? AND stato = 'bozza' AND rif_id IN ({','.join('?' * len(ids))}) "
            "ORDER BY id", [fonte] + ids).fetchall()
    finally:
        conn.close()
    return {r["rif_id"]: _riga_bozza(r) for r in righe}
