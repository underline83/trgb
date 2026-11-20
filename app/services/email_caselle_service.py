# @version: v1.6 (2026-11-20) — «risposto» anche se una bozza di TRGB per quella mail risulta inviata (senza aspettare la copia
#   nell'Inviata né gli header); a fine giro email_scrittura_service.ripulisci (bozze rimaste nelle Bozze, flag \Answered)
# v1.5 (2026-11-20) — invio per casella: smtp_host/smtp_port (dedotti dall'IMAP), puo_inviare (no per la PEC), nome_mittente; cartella Bozze trovata da sola
# v1.4 (2026-11-20) — «scartata»: cancellata/archiviata/spostata da Marco (era in arrivo e non c'è più) o letta nel cestino/spam = vista, fuori da «da rispondere»
# v1.3 (2026-11-20) — «arrivata in ritardo» solo se il SERVER l'ha ricevuta da poco (INTERNALDATE), non se l'ha letta tardi TRGB (primo import a rate); le mail marcate spam dal provider stanno con le massive
# v1.2 (2026-11-20) — mail senza intestazione Date: data dal server (INTERNALDATE), anche per quelle già lette; mail mandate da una nostra casella = «da noi», non da rispondere
# v1.1 (2026-11-19) — «da rispondere» salta anche le mail di trgb@ già gestite; caselle per la pagina Posta
# v1.0 (2026-11-19) — le altre caselle del locale in sola lettura (posta in arrivo, inviata, spam, cestino; PEC)
# Modulo: platform (mattone M.D, lettura) — [core]
# -*- coding: utf-8 -*-
"""
email_caselle_service.py — TRGB legge le ALTRE caselle del locale (mattone M.D, lettura).

PERCHÉ (Marco, 2026-11-19)
--------------------------
Il giro mail di Claude leggeva info@, marco@, prenotazioni@ e la PEC dall'archivio di
Apple Mail sul Mac (uno script lanciato sul Mac): col Mac spento o addormentato il giro
era cieco. Ora le legge TRGB sul server, come fa già per la casella del gestionale
(email_in_service, che resta com'è con l'abbinamento ai preventivi), e Q le legge dal
connettore senza mai vedere una password. (Roadmap ML.4, versione «lettura».)

COSA FA
-------
- Per ogni casella configurata: IMAP over SSL, cartelle trovate da sole (SPECIAL-USE
  \\Sent \\Junk \\Trash; altrimenti dal nome: Inviata/Sent, Spam/Junk/Indesiderata,
  Cestino/Trash/Deleted), aperte in SOLA LETTURA (EXAMINE) e scaricate con BODY.PEEK
  (CasellaImap di email_in_service). Nessuno STORE/COPY/MOVE/EXPUNGE/APPEND: le mail
  restano come sono, anche «non lette».
- Posta in arrivo, spam e cestino: messaggio intero, testo ripulito come email_in.
  Inviata: solo l'intestazione (serve a sapere a quali mail si è risposto).
- A ogni giro, per ogni cartella: UID nuovi (cursore per casella + cartella), i flag
  degli ultimi `giorni_flag` giorni (letta, risposta, contrassegnata) e «presente»
  (una mail spostata o cancellata non è più lì: la copia nel cestino è una riga sua).
- PEC: il messaggio vero sta in postacert.eml → mittente, oggetto e testo vengono da lì;
  le ricevute (accettazione/consegna) e le anomalie sono segnate in pec_tipo.
- «massiva»: newsletter e notifiche automatiche (List-Id, List-Unsubscribe, Precedence
  bulk/list, Feedback-ID, Auto-Submitted, mittenti come no-reply). Non si butta niente:
  si separa, la classifica vera la fa chi legge.
- «risposto»: flag di risposta sul server, oppure una mail mandata da una delle caselle
  (cartella Inviata) che la cita in In-Reply-To/References.

CREDENZIALI (mai nei log, nel DB, nelle risposte API)
-----------------------------------------------------
Per ogni casella la password si scrive dalla pagina Impostazioni › Email ed è salvata
cifrata (stessa chiave TRGB_SECRET_KEY del canale email), oppure nel .env del server
come POSTA_PASSWORD_<ID> (es. POSTA_PASSWORD_INFO_TREGOBBI_IT). Quella della pagina vince.

CONFIG (file `email_caselle.json` nella cartella dati del locale)
-----------------------------------------------------------------
  attiva, minuti (10), giorni_primo_import (30), giorni_flag (14), max_mb (15),
  max_caratteri (100000), max_per_giro (300 per cartella), mittenti_massivi (regex),
  segni_spam (pezzi di oggetto messi dall'antispam), caselle: [
    {id, indirizzo, nome, imap_host, imap_port, utente, password_cifrata, attiva,
     ruoli: [in_arrivo, inviata, spam, cestino], cartelle: {ruolo: [nomi]} (facoltativo:
     se manca, le trova da sole)}]
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from datetime import date, datetime, timedelta
from email import message_from_bytes, policy
from typing import Any, Callable, Dict, Iterable, List, Optional

from app.models.email_db import get_email_conn, init_email_db
from app.services import email_in_service as base
from app.utils.locale_data import locale_data_dir, locale_timezone

logger = logging.getLogger("trgb.email.caselle")

CONFIG_FILENAME = "email_caselle.json"
RUOLI = ("in_arrivo", "inviata", "spam", "cestino")
DOVE = {"in_arrivo": "posta in arrivo", "inviata": "inviata", "spam": "spam", "cestino": "cestino"}
PRIORITA_DOVE = {"in_arrivo": 0, "spam": 1, "cestino": 2, "inviata": 3}
DEFAULT = {
    "attiva": True,
    "minuti": 10,
    "giorni_primo_import": 30,
    "giorni_flag": 14,
    "max_mb": 15,
    "max_caratteri": 100000,
    "max_per_giro": 300,
    "mittenti_massivi": r"(^|[._+-])(no-?reply|do-?not-?reply|noreply|newsletter|news|mailer-daemon|"
                        r"notifications?|notifiche|marketing|promo)([._+-]|@)",
    "segni_spam": ["*****SPAM*****"],
    "ore_nuova": 24,
}
NUMERICI = ("minuti", "giorni_primo_import", "giorni_flag", "max_mb", "max_caratteri", "max_per_giro", "ore_nuova")
GIRI_TENUTI = 2000
AVVISO_TERZI = base.AVVISO_TERZI

# nomi riconosciuti quando il server non dichiara SPECIAL-USE (ultimo pezzo del nome, minuscolo)
_NOMI = {
    "inviata": ("sent", "inviat", "posta inviata", "sent items", "sent messages", "elementi inviati"),
    "spam": ("spam", "junk", "indesiderat", "bulk"),
    "cestino": ("trash", "cestino", "deleted", "eliminat"),
}
_FLAG_RUOLO = {"\\sent": "inviata", "\\junk": "spam", "\\trash": "cestino"}
_SALTA = ("drafts", "bozze", "draft", "templates", "modelli", "outbox", "posta in uscita")

_lock_giro = threading.Lock()


# ═════════════════════════════ configurazione ═════════════════════════════

def adesso() -> str:
    """Ora del locale (AAAA-MM-GG HH:MM:SS), come la data delle mail: il server può stare in UTC."""
    return datetime.now(locale_timezone()).strftime("%Y-%m-%d %H:%M:%S")


def _config_file():
    return locale_data_dir() / CONFIG_FILENAME


def _load_file() -> dict:
    try:
        f = _config_file()
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    except Exception:                                   # noqa: BLE001
        logger.exception("email_caselle.json illeggibile — nessuna casella in più")
        return {}


def _scrivi_file(dati: dict) -> None:
    f = _config_file()
    f.write_text(json.dumps(dati, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        os.chmod(f, 0o600)      # contiene password, anche se cifrate
    except OSError:
        pass


def slug(indirizzo: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (indirizzo or "").strip().lower()).strip("-")


def _env_password(cid: str) -> str:
    return os.getenv("POSTA_PASSWORD_" + cid.upper().replace("-", "_")) or ""


def _bool(v) -> bool:
    return v.strip().lower() in ("1", "true", "si", "sì") if isinstance(v, str) else bool(v)


def config() -> dict:
    """Impostazioni generali + caselle (password ancora cifrate: si decifrano solo al giro)."""
    f = _load_file()
    out = dict(DEFAULT)
    out.update({k: v for k, v in f.items() if k in DEFAULT and v not in (None, "")})
    for k in NUMERICI:
        try:
            out[k] = max(1, int(out[k]))
        except (TypeError, ValueError):
            out[k] = DEFAULT[k]
    out["attiva"] = _bool(out["attiva"])
    if not isinstance(out["segni_spam"], list):
        out["segni_spam"] = DEFAULT["segni_spam"]
    caselle = []
    for c in f.get("caselle") or []:
        if not isinstance(c, dict) or not c.get("indirizzo"):
            continue
        c = dict(c)
        c["id"] = c.get("id") or slug(c["indirizzo"])
        c["attiva"] = _bool(c.get("attiva", True))
        try:
            c["imap_port"] = int(c.get("imap_port") or 993)
        except (TypeError, ValueError):
            c["imap_port"] = 993
        c["utente"] = (c.get("utente") or c["indirizzo"]).strip()
        c["pec"] = "pec" in (c.get("imap_host") or "").lower() or c["indirizzo"].endswith(("@pec.it", "@legalmail.it"))
        c["smtp_host"] = (c.get("smtp_host") or re.sub(r"^imap", "smtp", (c.get("imap_host") or "").strip())).strip()
        try:
            c["smtp_port"] = int(c.get("smtp_port") or 465)
        except (TypeError, ValueError):
            c["smtp_port"] = 465
        # la PEC non parte da qui (valore legale): solo bozza, la manda Marco
        c["puo_inviare"] = False if c["pec"] else _bool(c.get("puo_inviare", True))
        c["nome_mittente"] = (c.get("nome_mittente") or "").strip()
        ruoli = [r for r in (c.get("ruoli") or RUOLI) if r in RUOLI]
        c["ruoli"] = ruoli or list(RUOLI)
        c["cartelle"] = {r: [x for x in v if x] for r, v in (c.get("cartelle") or {}).items()
                         if r in RUOLI and isinstance(v, list)}
        caselle.append(c)
    out["caselle"] = caselle
    return out


def _password(c: dict) -> str:
    if c.get("password_cifrata"):
        from app.services import email_service
        fer = email_service._fernet()
        if fer:
            try:
                return fer.decrypt(c["password_cifrata"].encode()).decode()
            except Exception:                           # noqa: BLE001
                logger.error("password della casella %s non decifrabile: TRGB_SECRET_KEY cambiata?", c.get("id"))
        else:
            logger.error("password della casella %s cifrata ma manca TRGB_SECRET_KEY in .env", c.get("id"))
    return _env_password(c["id"])


def _mancanti(c: dict, pw: Optional[str] = None) -> List[str]:
    out = []
    if not (c.get("imap_host") or "").strip():
        out.append("server IMAP")
    if not (c.get("utente") or "").strip():
        out.append("utente")
    if not (pw if pw is not None else _password(c)):
        out.append("password")
    return out


def indirizzi_nostri(cfg: Optional[dict] = None) -> List[str]:
    """Le caselle del locale: quelle lette qui + quella del gestionale."""
    c = cfg or config()
    nostri = {x["indirizzo"].lower() for x in c["caselle"]}
    try:
        nostri |= set(base.config().get("nostri") or [])
    except Exception:                                   # noqa: BLE001
        pass
    return sorted(nostri)


def salva_impostazioni(dati: dict) -> dict:
    cur = _load_file()
    for k, v in (dati or {}).items():
        if k not in DEFAULT or v is None:
            continue
        if k in NUMERICI:
            try:
                v = int(v)
            except (TypeError, ValueError):
                raise ValueError(f"{k}: serve un numero")
            if v < 1 or v > 1_000_000:
                raise ValueError(f"{k}: valore fuori misura ({v})")
        elif k == "attiva":
            v = bool(v)
        elif k == "mittenti_massivi":
            v = str(v).strip()
            try:
                re.compile(v)
            except re.error as e:
                raise ValueError(f"mittenti_massivi: espressione non valida ({e})")
        elif k == "segni_spam":
            v = [str(x).strip() for x in (v if isinstance(v, list) else str(v).split("\n")) if str(x).strip()]
        cur[k] = v
    _scrivi_file(cur)
    return stato()


def salva_casella(dati: dict) -> dict:
    """Crea o modifica una casella (per id, o per indirizzo se nuova). `password` vuota =
    resta quella che c'è (la pagina non la rilegge mai). Nessuna casella si cancella da qui:
    si spegne (attiva=false) e le mail già lette restano."""
    dati = dict(dati or {})
    indirizzo = (dati.get("indirizzo") or "").strip().lower()
    cur = _load_file()
    caselle = [dict(c) for c in cur.get("caselle") or [] if isinstance(c, dict)]
    cid = (dati.get("id") or "").strip()
    trovata = next((c for c in caselle if (c.get("id") or slug(c.get("indirizzo", ""))) == cid), None) if cid else None
    if trovata is None:
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", indirizzo):
            raise ValueError("Indirizzo della casella non valido")
        cid = slug(indirizzo)
        if any((c.get("id") or slug(c.get("indirizzo", ""))) == cid for c in caselle):
            raise ValueError(f"La casella {indirizzo} c'è già")
        trovata = {"id": cid, "indirizzo": indirizzo, "attiva": True}
        caselle.append(trovata)
    elif indirizzo and indirizzo != trovata.get("indirizzo"):
        raise ValueError("L'indirizzo di una casella non si cambia: aggiungine una nuova e spegni questa")
    for k in ("nome", "imap_host", "utente", "smtp_host", "nome_mittente"):
        if dati.get(k) is not None:
            trovata[k] = str(dati[k]).strip()
    if dati.get("smtp_port") not in (None, ""):
        p = str(dati["smtp_port"]).strip()
        if not p.isdigit():
            raise ValueError(f"Porta SMTP non numerica: {p!r}")
        trovata["smtp_port"] = int(p)
    if dati.get("puo_inviare") is not None:
        trovata["puo_inviare"] = bool(dati["puo_inviare"])
    if dati.get("imap_port") not in (None, ""):
        p = str(dati["imap_port"]).strip()
        if not p.isdigit():
            raise ValueError(f"Porta IMAP non numerica: {p!r}")
        trovata["imap_port"] = int(p)
    if dati.get("attiva") is not None:
        trovata["attiva"] = bool(dati["attiva"])
    if dati.get("ruoli") is not None:
        ruoli = [r for r in dati["ruoli"] if r in RUOLI]
        if not ruoli:
            raise ValueError("Scegli almeno una cartella da leggere")
        trovata["ruoli"] = ruoli
    if dati.get("cartelle") is not None:
        cart = {}
        for r, v in (dati["cartelle"] or {}).items():
            if r not in RUOLI:
                continue
            nomi = [x.strip() for x in (v if isinstance(v, list) else str(v).split(",")) if x and x.strip()]
            if nomi:
                cart[r] = nomi
        trovata["cartelle"] = cart
    if dati.get("password"):
        from app.services import email_service
        fer = email_service._fernet()
        if not fer:
            raise ValueError(
                "Per salvare la password serve una chiave di cifratura: aggiungi al .env "
                f"del server la riga TRGB_SECRET_KEY={email_service.genera_chiave()} e riavvia il backend. "
                "La password non viene salvata in chiaro perché i backup escono dalla macchina.")
        trovata["password_cifrata"] = fer.encrypt(str(dati["password"]).encode()).decode()
    if not (trovata.get("imap_host") or "").strip():
        raise ValueError("Manca il server IMAP (es. imaps.aruba.it, per la PEC Aruba imaps.pec.aruba.it)")
    cur["caselle"] = caselle
    _scrivi_file(cur)
    return casella_pubblica(next(c for c in config()["caselle"] if c["id"] == cid))


# ═════════════════════════════ cartelle ═════════════════════════════

def trova_bozze(elenco: List[Dict[str, Any]]) -> Optional[str]:
    """La cartella Bozze: flag SPECIAL-USE \\Drafts, altrimenti dal nome (Drafts, Bozze)."""
    for c in elenco:
        if "\\drafts" in set(c.get("flag") or []):
            return c["nome"]
    for c in elenco:
        ultimo = re.split(r"[./]", c.get("leggibile") or c["nome"])[-1].strip().lower()
        if ultimo in ("drafts", "draft", "bozze", "bozza"):
            return c["nome"]
    return None


def trova_cartelle(elenco: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Dalla risposta di LIST: {ruolo: [nomi]}. Valgono i flag SPECIAL-USE del server E i nomi
    noti (Apple Mail, per esempio, può aggiungere «Sent Messages» o «Deleted Messages» accanto
    a quelle del server): meglio una cartella in più che una risposta persa. Bozze no."""
    out: Dict[str, List[str]] = {"in_arrivo": [], "inviata": [], "spam": [], "cestino": []}
    per_nome: Dict[str, List[str]] = {"inviata": [], "spam": [], "cestino": []}
    for c in elenco:
        nome, flag = c["nome"], set(c.get("flag") or [])
        if "\\noselect" in flag or "\\nonexistent" in flag:
            continue
        if nome.upper() == "INBOX":
            out["in_arrivo"].append(nome)
            continue
        ruolo = next((r for f, r in _FLAG_RUOLO.items() if f in flag), None)
        if ruolo:
            out[ruolo].append(nome)
            continue
        leggibile = (c.get("leggibile") or nome)
        ultimo = re.split(r"[./]", leggibile)[-1].strip().lower() if leggibile else ""
        if any(ultimo.startswith(s) for s in _SALTA):
            continue
        for r, chiavi in _NOMI.items():
            if any(ultimo == k or ultimo.startswith(k) for k in chiavi):
                per_nome[r].append(nome)
                break
    for r, nomi in per_nome.items():
        out[r] += [n for n in nomi if n not in out[r]]
    return out


# ═════════════════════════════ lettura di un messaggio ═════════════════════════════

def _pec(msg) -> Optional[dict]:
    """Busta PEC? {tipo: messaggio|ricevuta|anomalia, dettaglio, interno: bytes|None}."""
    trasporto = (base._header(msg, "X-Trasporto") or "").strip().lower()
    ricevuta = (base._header(msg, "X-Ricevuta") or "").strip().lower()
    if not trasporto and not ricevuta:
        return None
    tipo = "ricevuta" if ricevuta else ("anomalia" if trasporto == "errore" else "messaggio")
    interno = None
    for part in msg.walk():
        if (part.get_filename() or "").lower() != "postacert.eml":
            continue
        try:
            if part.get_content_type() == "message/rfc822":
                pl = part.get_payload()
                inner = pl[0] if isinstance(pl, list) else pl
                interno = inner.as_bytes()
            else:
                interno = part.get_payload(decode=True)
        except Exception:                               # noqa: BLE001
            interno = None
        break
    return {"tipo": tipo, "dettaglio": ricevuta or trasporto, "interno": interno}


def _massiva(msg, mittente: str, regex: str) -> Optional[str]:
    for h in ("List-Unsubscribe", "List-Id", "Feedback-ID"):
        if base._header(msg, h):
            return h
    prec = (base._header(msg, "Precedence") or "").strip().lower()
    if prec in ("bulk", "list", "junk"):
        return f"Precedence: {prec}"
    auto = (base._header(msg, "Auto-Submitted") or "").strip().lower()
    if auto and auto != "no":
        return f"Auto-Submitted: {auto}"
    if regex and mittente:
        try:
            if re.search(regex, mittente, re.IGNORECASE):
                return "mittente automatico"
        except re.error:
            pass
    return None


def _ha_data(msg) -> bool:
    try:
        from email.utils import parsedate_to_datetime
        return bool(base._header(msg, "Date")) and parsedate_to_datetime(base._header(msg, "Date")) is not None
    except Exception:                                   # noqa: BLE001
        return False


def analizza_casella(raw: bytes, cfg: dict, dimensione: Optional[int] = None, oltre_limite: bool = False,
                     solo_intestazione: bool = False, data_server: Optional[str] = None) -> Dict[str, Any]:
    """Come email_in_service.analizza, più PEC, massiva e spam marcato. Senza intestazione
    Date (succede: le mandava così anche TRGB fino al 2026-11-20) la data è quella in cui il
    server l'ha ricevuta, non l'ora della lettura."""
    mail = base.analizza(raw, dimensione, oltre_limite, cfg["max_caratteri"])
    if solo_intestazione and not oltre_limite:
        mail["testo"], mail["allegati"] = "", []
    msg = message_from_bytes(raw or b"", policy=policy.default)
    mail["data_origine"] = "intestazione"
    if not _ha_data(msg) and data_server:
        mail["data"], mail["data_origine"] = data_server, "server"
    pec = None if (oltre_limite or solo_intestazione) else _pec(msg)
    mail["pec_tipo"], mail["pec_busta"] = None, None
    controlla = msg
    if pec:
        mail["pec_tipo"], mail["pec_busta"] = pec["tipo"], mail.get("oggetto")
        if pec["tipo"] == "messaggio" and pec["interno"]:
            try:
                dentro = base.analizza(pec["interno"], None, False, cfg["max_caratteri"])
                for k in ("mittente", "mittente_nome", "oggetto", "testo", "testo_troncato", "allegati",
                          "a", "cc"):
                    mail[k] = dentro[k]
                if dentro.get("in_reply_to"):
                    mail["in_reply_to"] = dentro["in_reply_to"]
                mail["riferimenti"] = list(dict.fromkeys(list(mail.get("riferimenti") or []) +
                                                         list(dentro.get("riferimenti") or []) +
                                                         ([dentro["message_id"]] if dentro.get("message_id") else [])))
                controlla = message_from_bytes(pec["interno"], policy=policy.default)
            except Exception:                           # noqa: BLE001 — si tiene la busta
                logger.exception("postacert.eml illeggibile")
    perche = None if (pec and pec["tipo"] != "messaggio") else _massiva(controlla, mail.get("mittente") or "",
                                                                       cfg.get("mittenti_massivi") or "")
    mail["massiva"], mail["massiva_perche"] = bool(perche), perche
    ogg = mail.get("oggetto") or ""
    mail["spam_marcato"] = any(s and s in ogg for s in cfg.get("segni_spam") or [])
    return mail


# ═════════════════════════════ salvataggio ═════════════════════════════

def _salva(conn, cid: str, cartella: str, ruolo: str, uid: int, uidvalidity, mail: dict,
           flag: Optional[set], primo: bool) -> bool:
    letta = risp = contr = None
    if flag is not None:
        letta, risp, contr = int("\\seen" in flag), int("\\answered" in flag), int("\\flagged" in flag)
    cur = conn.execute(
        """INSERT OR IGNORE INTO email_posta
           (casella, cartella, ruolo, uid, uidvalidity, message_id, in_reply_to, riferimenti, mittente,
            mittente_nome, a, cc, oggetto, data, testo, testo_troncato, allegati, dimensione, oltre_limite,
            letta, risposta_flag, contrassegnata, flag_at, massiva, massiva_perche, spam_marcato,
            pec_tipo, pec_busta, primo_import, ricevuta_at, data_origine)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (cid, cartella, ruolo, uid, uidvalidity, mail["message_id"], mail.get("in_reply_to"),
         " ".join(mail.get("riferimenti") or []) or None, mail.get("mittente"), mail.get("mittente_nome"),
         ", ".join(mail.get("a") or []), ", ".join(mail.get("cc") or []), mail.get("oggetto"), mail.get("data"),
         mail.get("testo"), int(bool(mail.get("testo_troncato"))),
         json.dumps(mail.get("allegati") or [], ensure_ascii=False), mail.get("dimensione"),
         int(bool(mail.get("oltre_limite"))), letta, risp, contr, adesso() if flag is not None else None,
         int(bool(mail.get("massiva"))), mail.get("massiva_perche"), int(bool(mail.get("spam_marcato"))),
         mail.get("pec_tipo"), mail.get("pec_busta"), int(bool(primo)), adesso(), mail.get("data_origine")))
    if cur.rowcount:
        return True
    conn.execute("UPDATE email_posta SET uid = ?, uidvalidity = ?, presente = 1, sparita_at = NULL "
                 "WHERE casella = ? AND cartella = ? AND message_id = ?",
                 (uid, uidvalidity, cid, cartella, mail["message_id"]))
    return False


def _cursore(conn, cid: str, cartella: str) -> Optional[dict]:
    r = conn.execute("SELECT * FROM email_posta_cursore WHERE casella = ? AND cartella = ?",
                     (cid, cartella)).fetchone()
    return dict(r) if r else None


def _scrivi_cursore(conn, cid: str, cartella: str, uidvalidity, ultimo_uid) -> None:
    conn.execute(
        """INSERT INTO email_posta_cursore (casella, cartella, uidvalidity, ultimo_uid, aggiornato_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(casella, cartella) DO UPDATE SET uidvalidity = excluded.uidvalidity,
               ultimo_uid = excluded.ultimo_uid, aggiornato_at = excluded.aggiornato_at""",
        (cid, cartella, uidvalidity, int(ultimo_uid or 0), adesso()))


def _aggiorna_flag(conn, cid: str, cartella: str, uidvalidity, flag: Dict[int, set], tutti: set) -> None:
    for uid, f in flag.items():
        conn.execute(
            "UPDATE email_posta SET letta = ?, risposta_flag = ?, contrassegnata = ?, "
            "flag_at = ? WHERE casella = ? AND cartella = ? AND uid = ? AND uidvalidity = ?",
            (int("\\seen" in f), int("\\answered" in f), int("\\flagged" in f), adesso(), cid, cartella, uid,
             uidvalidity))
    sparite = [r["id"] for r in conn.execute(
        "SELECT id, uid FROM email_posta WHERE casella = ? AND cartella = ? AND presente = 1 AND uidvalidity = ?",
        (cid, cartella, uidvalidity)) if r["uid"] not in tutti]
    for i in range(0, len(sparite), 500):
        blocco = sparite[i:i + 500]
        conn.execute(f"UPDATE email_posta SET presente = 0, sparita_at = ? "
                     f"WHERE id IN ({','.join('?' * len(blocco))})", [adesso()] + blocco)


def _illeggibile(cid: str, cartella: str, uid: int, uidvalidity, dimensione) -> dict:
    m = base._illeggibile(uid, uidvalidity, dimensione)
    m["message_id"] = f"<{cid}-{slug(cartella)}-{uidvalidity}-{uid}@trgb.illeggibile>"
    m.update({"massiva": False, "massiva_perche": None, "spam_marcato": False, "pec_tipo": None, "pec_busta": None})
    return m


# ═════════════════════════════ il giro ═════════════════════════════

def _apri(c: dict, password: str):
    return base.CasellaImap(c["imap_host"], c["imap_port"], c["utente"], password, cartella=None)


def esegui_giro(apri: Optional[Callable[[dict, str], Any]] = None, oggi: Optional[date] = None,
                solo: Optional[str] = None) -> Dict[str, Any]:
    """Un giro su tutte le caselle attive (o solo su `solo` = id). Non solleva mai: un errore
    resta nel registro della casella e il giro passa alla successiva. Uno solo alla volta."""
    if not _lock_giro.acquire(blocking=False):
        return {"esito": "saltato", "nota": "un altro giro è in corso"}
    try:
        init_email_db()
        cfg = config()
        if not cfg["attiva"] and not solo:
            return {"esito": "saltato", "nota": "lettura delle altre caselle spenta"}
        out = []
        for c in cfg["caselle"]:
            if solo and c["id"] != solo:
                continue
            if not c["attiva"] and not solo:
                continue
            out.append(_giro_casella(c, cfg, apri or _apri, oggi or date.today()))
        if apri is None:
            # bozze di TRGB già mandate/annullate ancora nelle Bozze, mail risposte da segnare sul server
            try:
                from app.services import email_scrittura_service as scr
                scr.ripulisci()
            except Exception as e:                      # noqa: BLE001 — la pulizia non ferma il giro
                logger.warning("Altre caselle: pulizia bozze — %s", type(e).__name__)
        if solo and not out:
            return {"esito": "errore", "errore": f"Casella {solo} non trovata"}
        esito = "ok" if all(x["esito"] in ("ok", "saltato") for x in out) else "errore"
        return {"esito": esito, "nuove": sum(x.get("nuove", 0) for x in out), "caselle": out}
    finally:
        _lock_giro.release()


def _giro_casella(c: dict, cfg: dict, apri, oggi: date) -> Dict[str, Any]:
    cid = c["id"]
    pw = _password(c)
    miss = _mancanti(c, pw)
    conn = get_email_conn()
    try:
        if miss:
            return {"casella": c["indirizzo"], "esito": "saltato", "nota": f"manca {', '.join(miss)}"}
        giro_id = conn.execute("INSERT INTO email_posta_giri (casella, esito, iniziato_at) VALUES (?, 'in_corso', ?)",
                               (cid, adesso())).lastrowid
        conn.commit()
        nuove = lette = 0
        note: List[str] = []
        trovate: Dict[str, List[str]] = {}
        try:
            with apri(c, pw) as cas:
                pw = None
                auto = trova_cartelle(cas.elenco_cartelle())
                for r in RUOLI:
                    trovate[r] = c["cartelle"].get(r) or auto.get(r) or []
                senza = [DOVE[r] for r in c["ruoli"] if not trovate.get(r)]
                if senza:
                    note.append(f"cartella non trovata: {', '.join(senza)}")
                for ruolo in c["ruoli"]:
                    for cartella in trovate.get(ruolo) or []:
                        n, l, nota = _giro_cartella(conn, cas, cid, cartella, ruolo, cfg, oggi)
                        nuove, lette = nuove + n, lette + l
                        if nota:
                            note.append(f"{cartella}: {nota}")
            nota = "; ".join(note) or None
            conn.execute(
                "UPDATE email_posta_giri SET finito_at = ?, esito = 'ok', nuove = ?, "
                "lette = ?, nota = ?, cartelle = ? WHERE id = ?",
                (adesso(), nuove, lette, nota, json.dumps(trovate, ensure_ascii=False), giro_id))
            conn.commit()
            if nuove:
                logger.info("Casella %s: %s nuove (%s lette)", cid, nuove, lette)
            return {"casella": c["indirizzo"], "esito": "ok", "nuove": nuove, "lette": lette, "nota": nota}
        except Exception as e:                          # noqa: BLE001 — rete, login, cartella sparita…
            errore = f"{type(e).__name__}: {e}"
            segreto = _password(c)
            if segreto:
                errore = errore.replace(segreto, "***")
            errore = errore[:500]
            logger.warning("Casella %s: giro fallito — %s", cid, errore)
            conn.execute(
                "UPDATE email_posta_giri SET finito_at = ?, esito = 'errore', nuove = ?, "
                "lette = ?, errore = ?, nota = ?, cartelle = ? WHERE id = ?",
                (adesso(), nuove, lette, errore, "; ".join(note) or None,
                 json.dumps(trovate, ensure_ascii=False) if trovate else None, giro_id))
            conn.commit()
            return {"casella": c["indirizzo"], "esito": "errore", "errore": errore, "nuove": nuove}
    finally:
        try:
            conn.execute("DELETE FROM email_posta_giri WHERE id NOT IN "
                         "(SELECT id FROM email_posta_giri ORDER BY id DESC LIMIT ?)", (GIRI_TENUTI,))
            conn.commit()
        except Exception:                               # noqa: BLE001
            pass
        conn.close()


def _giro_cartella(conn, cas, cid: str, cartella: str, ruolo: str, cfg: dict, oggi: date):
    uidvalidity = cas.seleziona(cartella)
    tutti = cas.tutti_uid()
    cur = _cursore(conn, cid, cartella)
    nota = ""
    primo = cur is None
    if cur and cur.get("uidvalidity") == uidvalidity and uidvalidity is not None:
        ultimo = int(cur["ultimo_uid"] or 0)
        uids = [u for u in tutti if u > ultimo]
    else:
        if cur:
            nota = (f"UIDVALIDITY cambiata ({cur.get('uidvalidity')} → {uidvalidity}): "
                    f"riletti gli ultimi {cfg['giorni_primo_import']} giorni")
            logger.warning("Casella %s, %s: %s", cid, cartella, nota)
            primo = True
        uids = cas.uid_dal_giorno(oggi - timedelta(days=cfg["giorni_primo_import"])) if tutti else []
        _scrivi_cursore(conn, cid, cartella, uidvalidity, 0)
        conn.commit()
    resto = max(0, len(uids) - cfg["max_per_giro"])
    uids = uids[:cfg["max_per_giro"]]
    if resto:
        nota = (nota + "; " if nota else "") + f"{resto} messaggi rimandati al giro dopo"
    finestra = set(cas.uid_dal_giorno(oggi - timedelta(days=cfg["giorni_flag"]))) if tutti else set()
    flag = cas.flag(sorted(finestra | set(uids))) if (finestra or uids) else {}
    dim = cas.dimensioni(uids) if uids else {}
    date_srv = cas.date_interne(uids) if uids else {}
    soglia_nuova = (datetime.now(locale_timezone()) - timedelta(hours=cfg["ore_nuova"])).strftime("%Y-%m-%d %H:%M:%S")
    limite = cfg["max_mb"] * 1024 * 1024
    solo_testa = ruolo == "inviata"
    nuove = lette = 0
    for uid in uids:
        d = dim.get(uid)
        oltre = bool(d and d > limite) and not solo_testa
        raw = cas.scarica(uid, solo_intestazione=oltre or solo_testa)   # errore di rete → giro fallito, si riprova
        lette += 1
        try:
            mail = analizza_casella(raw, cfg, d, oltre, solo_intestazione=solo_testa, data_server=date_srv.get(uid))
        except Exception:                               # noqa: BLE001
            logger.exception("Casella %s, %s: UID %s illeggibile", cid, cartella, uid)
            mail = _illeggibile(cid, cartella, uid, uidvalidity, d)
        # «nuova» = il server l'ha ricevuta da poco. Una mail vecchia letta adesso (primo import
        # che continua al giro dopo, cartella riletta) non è arrivata adesso.
        vecchia = bool(date_srv.get(uid) and date_srv[uid] < soglia_nuova)
        if _salva(conn, cid, cartella, ruolo, uid, uidvalidity, mail, flag.get(uid), primo or vecchia):
            nuove += 1
        _scrivi_cursore(conn, cid, cartella, uidvalidity, uid)
        conn.commit()
    _aggiorna_flag(conn, cid, cartella, uidvalidity, flag, set(tutti))
    _ripara_date(conn, cas, cid, cartella, uidvalidity, set(tutti))
    _ripara_ritardi(conn, cas, cid, cartella, uidvalidity, set(tutti), cfg)
    conn.commit()
    return nuove, lette, nota


def _ripara_ritardi(conn, cas, cid: str, cartella: str, uidvalidity, tutti: set, cfg: dict) -> None:
    """Righe che sembrano «arrivate in ritardo» (lette da TRGB più di ore_nuova ore dopo la loro
    data) ma non verificate: se il server le aveva da tempo erano solo lette tardi (primo_import
    = 1); se il server le ha ricevute davvero tardi restano in ritardo, verificate (= 2)."""
    righe = [dict(r) for r in conn.execute(
        "SELECT id, uid, ricevuta_at FROM email_posta WHERE casella = ? AND cartella = ? AND uidvalidity = ? "
        "AND presente = 1 AND primo_import = 0 AND (julianday(ricevuta_at) - julianday(data)) * 24 > ?",
        (cid, cartella, uidvalidity, cfg["ore_nuova"]))]
    righe = [r for r in righe if r["uid"] in tutti]
    if not righe:
        return
    date_srv = cas.date_interne([r["uid"] for r in righe])
    for r in righe:
        d = date_srv.get(r["uid"])
        if not d:
            continue
        lim = (datetime.strptime(r["ricevuta_at"], "%Y-%m-%d %H:%M:%S") - timedelta(hours=cfg["ore_nuova"])).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("UPDATE email_posta SET primo_import = ? WHERE id = ?", (1 if d < lim else 2, r["id"]))


def _ripara_date(conn, cas, cid: str, cartella: str, uidvalidity, tutti: set) -> None:
    """Mail lette prima della v1.2 (data_origine NULL) senza intestazione Date: la loro data è
    l'ora della lettura (uguale a ricevuta_at). Si prende quella del server, una volta sola."""
    righe = [dict(r) for r in conn.execute(
        "SELECT id, uid FROM email_posta WHERE casella = ? AND cartella = ? AND uidvalidity = ? AND presente = 1 "
        "AND data_origine IS NULL AND abs(julianday(data) - julianday(ricevuta_at)) * 86400 <= 3",
        (cid, cartella, uidvalidity))]
    righe = [r for r in righe if r["uid"] in tutti]
    if not righe:
        return
    date_srv = cas.date_interne([r["uid"] for r in righe])
    for r in righe:
        d = date_srv.get(r["uid"])
        if d:
            conn.execute("UPDATE email_posta SET data = ?, data_origine = 'server' WHERE id = ?", (d, r["id"]))


def prova(cid: str, apri: Optional[Callable[[dict, str], Any]] = None) -> Dict[str, Any]:
    """Collegamento di prova: login e cartelle trovate. Non scarica niente."""
    c = next((x for x in config()["caselle"] if x["id"] == cid), None)
    if not c:
        return {"ok": False, "errore": f"Casella {cid} non trovata"}
    pw = _password(c)
    miss = _mancanti(c, pw)
    if miss:
        return {"ok": False, "errore": f"Manca {', '.join(miss)}"}
    try:
        with (apri or _apri)(c, pw) as cas:
            elenco = cas.elenco_cartelle()
        auto = trova_cartelle(elenco)
        return {"ok": True, "cartelle_trovate": {DOVE[r]: (c["cartelle"].get(r) or auto.get(r) or []) for r in RUOLI},
                "tutte": [x["leggibile"] for x in elenco]}
    except Exception as e:                              # noqa: BLE001
        err = f"{type(e).__name__}: {e}"
        return {"ok": False, "errore": (err.replace(pw, "***") if pw else err)[:500]}


_avviato = {"ok": False}


def avvia_periodico() -> None:
    """Il job: un giro ogni `minuti` (10), in un thread daemon. Senza caselle non fa niente."""
    if _avviato["ok"]:
        return
    _avviato["ok"] = True

    def _ciclo():
        time.sleep(120)
        while True:
            minuti = DEFAULT["minuti"]
            try:
                cfg = config()
                minuti = cfg["minuti"]
                if cfg["attiva"] and cfg["caselle"]:
                    esegui_giro()
            except Exception as e:                      # noqa: BLE001
                logger.warning("Altre caselle: ciclo — %s", type(e).__name__)
            time.sleep(minuti * 60)

    threading.Thread(target=_ciclo, name="email-caselle", daemon=True).start()


# ═════════════════════════════ letture ═════════════════════════════

def aggiornamento(conn=None, cfg: Optional[dict] = None) -> List[Dict[str, Any]]:
    """Per casella: ultimo giro, ultimo riuscito, errori di fila, cartelle trovate."""
    cfg = cfg or config()
    chiudi = conn is None
    conn = conn or get_email_conn()
    out = []
    try:
        for c in cfg["caselle"]:
            giri = [dict(r) for r in conn.execute(
                "SELECT * FROM email_posta_giri WHERE casella = ? AND esito IN ('ok','errore') "
                "ORDER BY id DESC LIMIT 50", (c["id"],))]
            ok = next((g for g in giri if g["esito"] == "ok"), None)
            di_fila = 0
            for g in giri:
                if g["esito"] != "errore":
                    break
                di_fila += 1
            try:
                cart = json.loads((giri[0] if giri else {}).get("cartelle") or "null")
            except ValueError:
                cart = None
            out.append({
                "casella": c["indirizzo"], "attiva": c["attiva"],
                "ultimo_giro": giri[0]["finito_at"] if giri else None,
                "ultimo_esito": giri[0]["esito"] if giri else None,
                "ultimo_ok": ok["finito_at"] if ok else None,
                "errori_di_fila": di_fila,
                "ultimo_errore": giri[0]["errore"] if giri and giri[0]["esito"] == "errore" else None,
                "nota": giri[0]["nota"] if giri else None,
                "cartelle": {DOVE[r]: v for r, v in (cart or {}).items() if r in DOVE} if cart else None,
            })
    finally:
        if chiudi:
            conn.close()
    return out


def casella_pubblica(c: dict) -> dict:
    pw_file = bool(c.get("password_cifrata"))
    return {"id": c["id"], "indirizzo": c["indirizzo"], "nome": c.get("nome") or "", "imap_host": c.get("imap_host") or "",
            "imap_port": c["imap_port"], "utente": c["utente"], "attiva": c["attiva"], "ruoli": c["ruoli"],
            "cartelle": c["cartelle"], "ha_password": bool(_password(c)),
            "smtp_host": c["smtp_host"], "smtp_port": c["smtp_port"], "puo_inviare": c["puo_inviare"],
            "pec": c["pec"], "nome_mittente": c["nome_mittente"],
            "password_da": "gestionale" if pw_file else ("env" if _env_password(c["id"]) else None),
            "mancanti": _mancanti(c)}


def stato() -> Dict[str, Any]:
    """Per la pagina: impostazioni e caselle SENZA password + salute del job per casella."""
    from app.services import email_service
    init_email_db()
    cfg = config()
    salute = {a["casella"]: a for a in aggiornamento(cfg=cfg)}
    caselle = []
    for c in cfg["caselle"]:
        x = casella_pubblica(c)
        x.update({k: v for k, v in salute.get(c["indirizzo"], {}).items() if k not in ("casella", "attiva")})
        caselle.append(x)
    return {**{k: cfg[k] for k in DEFAULT}, "caselle": caselle, "chiave_cifratura": email_service._fernet() is not None}


def _dove(ruolo: str, presente) -> str:
    d = DOVE.get(ruolo, ruolo)
    return d if presente else f"{d} (non c'è più: spostata o cancellata)"


def _risposte(conn, mids: Iterable[str]) -> Dict[str, dict]:
    """{message_id: la prima mail mandata da noi che la cita} (Inviata di tutte le caselle)."""
    out: Dict[str, dict] = {}
    for mid in dict.fromkeys(m for m in mids if m):
        r = conn.execute(
            "SELECT id, data, casella, oggetto FROM email_posta WHERE ruolo = 'inviata' AND "
            "(instr(IFNULL(in_reply_to,''), ?) > 0 OR instr(IFNULL(riferimenti,''), ?) > 0) ORDER BY data LIMIT 1",
            (mid, mid)).fetchone()
        if r:
            out[mid] = dict(r)
    return out


def _risposte_da_bozze(conn, ids: Iterable[int]) -> Dict[int, str]:
    """{email_posta.id: quando} per le mail a cui TRGB ha mandato una sua bozza (stato «inviata»).
    Vale anche se la copia nell'Inviata non è ancora stata letta o non ha gli header giusti."""
    ids = sorted({int(i) for i in ids if i})
    out: Dict[int, str] = {}
    for i in range(0, len(ids), 400):
        blocco = ids[i:i + 400]
        for x in conn.execute(
                f"SELECT rif_id, MIN(inviata_at) AS q FROM email_bozze WHERE rif_fonte = 'casella' AND stato = 'inviata' "
                f"AND rif_id IN ({','.join('?' * len(blocco))}) GROUP BY rif_id", blocco):
            out[x["rif_id"]] = x["q"] or ""
    return out


def _indirizzo_di(cfg: dict) -> Dict[str, str]:
    return {c["id"]: c["indirizzo"] for c in cfg["caselle"]}


def _valida_dal(dal: Optional[str]) -> Optional[str]:
    if not dal:
        return None
    dal = dal.strip().replace("T", " ")
    if not re.match(r"^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$", dal):
        raise ValueError("dal: serve AAAA-MM-GG oppure AAAA-MM-GG HH:MM")
    return dal


def elenco(dal: Optional[str] = None, giorni: Optional[int] = None, casella: Optional[str] = None,
           dove: Optional[List[str]] = None, q: Optional[str] = None, solo_da_rispondere: bool = False,
           anche_massive: bool = True, anche_trgb: bool = True, limite: int = 100) -> Dict[str, Any]:
    """Le mail di tutte le caselle, dalla più recente, una volta sola per casella (la copia
    ancora presente, prima in arrivo poi spam poi cestino). `dal` vale sulla data della
    mail e prende anche le mail ARRIVATE dopo `dal` con una data più vecchia (in_ritardo:
    es. una PEC scaricata tardi). Le massive stanno a parte, solo con l'intestazione.
    anche_trgb = in più la casella del gestionale (email_in: risposte ai preventivi)."""
    init_email_db()
    cfg = config()
    dal = _valida_dal(dal)
    dove = [d for d in (dove or ["in_arrivo", "spam", "cestino"]) if d in RUOLI] or ["in_arrivo", "spam", "cestino"]
    where, par = [f"ruolo IN ({','.join('?' * len(dove))})"], list(dove)
    soglia = None
    if giorni:
        soglia = (datetime.now(locale_timezone()) - timedelta(days=int(giorni))).strftime("%Y-%m-%d %H:%M:%S")
    if dal and (not soglia or dal > soglia):
        soglia = dal
    if soglia:
        where.append("(data >= ? OR (ricevuta_at >= ? AND primo_import != 1))")
        par += [soglia, soglia]
    ids_casella = None
    if casella:
        cs = casella.strip().lower()
        ids_casella = [c["id"] for c in cfg["caselle"] if cs in (c["id"], c["indirizzo"], (c.get("nome") or "").lower())
                       or c["indirizzo"].startswith(cs)]
        if not ids_casella and not ("trgb" in cs or cs in indirizzi_nostri(cfg)):
            raise ValueError(f"casella: nessuna casella «{casella}»")
        where.append(f"casella IN ({','.join('?' * len(ids_casella))})" if ids_casella else "0")
        par += ids_casella
    if q:
        for parola in q.split():
            like = f"%{parola}%"
            where.append("(oggetto LIKE ? OR mittente LIKE ? OR mittente_nome LIKE ? OR a LIKE ? OR cc LIKE ? OR testo LIKE ?)")
            par += [like] * 6
    limite = max(1, min(int(limite), 500))
    indir = _indirizzo_di(cfg)
    conn = get_email_conn()
    try:
        righe = []
        for massiva, quante in ((0, limite * 4), (1, limite * 3)):
            if massiva and not anche_massive:
                continue
            righe += [dict(r) for r in conn.execute(
                f"SELECT * FROM email_posta WHERE {' AND '.join(where)} AND massiva = ? "
                f"ORDER BY data DESC, id DESC LIMIT ?", par + [massiva, quante])]
        # una riga per casella + Message-ID: quella ancora presente, poi la cartella più «viva»
        scelte: Dict[tuple, dict] = {}
        for r in righe:
            k = (r["casella"], r["message_id"])
            v = scelte.get(k)
            if v is None or (r["presente"], -PRIORITA_DOVE[r["ruolo"]]) > (v["presente"], -PRIORITA_DOVE[v["ruolo"]]):
                scelte[k] = r
        tenute = sorted(scelte.values(), key=lambda r: (r["data"] or "", r["id"]), reverse=True)
        risp = _risposte(conn, [r["message_id"] for r in tenute if not r["massiva"]])
        da_bozze = _risposte_da_bozze(conn, [r["id"] for r in tenute if not r["massiva"]])
        # dove altro è arrivata la stessa mail (altre caselle, casella del gestionale)
        mids = list({r["message_id"] for r in tenute})
        altrove: Dict[str, set] = {}
        for i in range(0, len(mids), 400):
            blocco = mids[i:i + 400]
            ph = ",".join("?" * len(blocco))
            for x in conn.execute(f"SELECT message_id, casella FROM email_posta WHERE message_id IN ({ph}) "
                                  f"AND ruolo != 'inviata'", blocco):
                altrove.setdefault(x["message_id"], set()).add(indir.get(x["casella"], x["casella"]))
            for x in conn.execute(f"SELECT message_id FROM email_in WHERE message_id IN ({ph})", blocco):
                altrove.setdefault(x["message_id"], set()).add("trgb (gestionale)")
        # erano nella posta in arrivo? (se sì e ora stanno altrove, le ha tolte Marco)
        passate: set = set()
        for i in range(0, len(mids), 400):
            blocco = mids[i:i + 400]
            ph = ",".join("?" * len(blocco))
            for x in conn.execute(f"SELECT casella, message_id FROM email_posta WHERE ruolo = 'in_arrivo' "
                                  f"AND message_id IN ({ph})", blocco):
                passate.add((x["casella"], x["message_id"]))
        trgb = []
        if anche_trgb and not ids_casella or (casella and "trgb" in casella.lower()):
            trgb = _da_trgb(conn, soglia, q, limite)
    finally:
        conn.close()

    nostri = set(indirizzi_nostri(cfg))
    vere, massive = [], []
    for r in tenute:
        da_dove = indir.get(r["casella"], r["casella"])
        anche = sorted(x for x in altrove.get(r["message_id"], set()) if x != da_dove)
        risposto, come = _stato_risposta(r, risp.get(r["message_id"]), indir)
        if not risposto and r["id"] in da_bozze:
            risposto, come = True, f"risposto il {da_bozze[r['id']][:16]} da TRGB"
        da_noi = (r["mittente"] or "").lower() in nostri
        if da_noi and not risposto:
            risposto, come = True, "mandata da una nostra casella (copia): non serve risposta"
        in_ritardo = bool(soglia and (r["data"] or "") < soglia)
        if (r["massiva"] or r["spam_marcato"]) and r["ruolo"] != "inviata":
            if anche_massive:
                massive.append(_senza_vuoti({
                    "id": r["id"], "casella": da_dove, "dove": _dove(r["ruolo"], r["presente"]),
                    "data": r["data"], "mittente": r["mittente"], "mittente_nome": r["mittente_nome"],
                    "oggetto": r["oggetto"],
                    "perche": "marcata spam dal provider" if r["spam_marcato"] else r["massiva_perche"],
                    "in_ritardo": in_ritardo or None}))
            continue
        scartata = _scartata(r, (r["casella"], r["message_id"]) in passate)
        if solo_da_rispondere and (risposto or scartata or r["pec_tipo"] in ("ricevuta", "anomalia")
                                   or r["ruolo"] == "inviata"):
            continue
        riga = _riga(r, da_dove, anche, risposto, come, in_ritardo)
        if da_noi:
            riga["da_noi"] = True
        if scartata:
            riga["scartata"] = scartata
        vere.append(riga)
    for m in trgb:
        if solo_da_rispondere and (m.get("risposto") or m.get("stato_trgb") == "gestita"):
            continue
        vere.append(m)
    vere.sort(key=lambda m: (m.get("data") or ""), reverse=True)
    vere = vere[:limite]
    try:                                    # bozza aperta preparata da TRGB/Q per la mail
        from app.services import email_scrittura_service as scr
        bz = {"casella": scr.bozze_per_mail("casella", [m["id"] for m in vere if m["fonte"] == "casella"]),
              "trgb": scr.bozze_per_mail("trgb", [m["id"] for m in vere if m["fonte"] == "trgb"])}
        for m in vere:
            b = bz[m["fonte"]].get(m["id"])
            if b:
                m["bozza"] = {"id": b["id"], "creata_da": b["creata_da"], "creata_at": b["creata_at"]}
    except Exception:                       # noqa: BLE001 — le bozze non bloccano la lettura
        logger.exception("bozze per l'elenco della posta")
    return {"quante": len(vere), "mail": vere, "massive": massive[:limite * 2],
            "n_massive": len(massive), "caselle": aggiornamento(cfg=cfg),
            "trgb_aggiornamento": base.aggiornamento() if trgb or anche_trgb else None}


def _scartata(r: dict, era_in_arrivo: bool) -> Optional[str]:
    """Vista da Marco e messa da parte, quindi non «da rispondere» (resta sotto «Tutte»):
    - era nella posta in arrivo e ora sta nel cestino/spam, o non c'è più (archiviata, cancellata);
    - sta nel cestino o nello spam ed è letta (l'ha aperta lui: i filtri non le segnano lette).
    Una mail finita nel cestino o nello spam da sola, mai letta, resta da guardare."""
    if r["ruolo"] == "in_arrivo":
        return None if r["presente"] else "archiviata o cancellata da te"
    if r["ruolo"] in ("cestino", "spam"):
        if era_in_arrivo:
            return "cancellata da te" if r["ruolo"] == "cestino" else "spostata nello spam da te"
        if r.get("letta"):
            return f"letta nel {'cestino' if r['ruolo'] == 'cestino' else 'spam'}"
    return None


def _stato_risposta(r: dict, inviata: Optional[dict], indir: Dict[str, str]):
    if inviata and (inviata.get("data") or "") >= (r.get("data") or ""):
        return True, f"risposto il {inviata['data'][:16]} da {indir.get(inviata['casella'], inviata['casella'])}"
    if r.get("risposta_flag"):
        return True, "segnata come risposta sul server"
    if inviata:
        return True, f"c'è una mail mandata che la cita ({inviata['data'][:16]})"
    return False, None


def _senza_vuoti(d: dict) -> dict:
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}


def _riga(r: dict, casella: str, anche: List[str], risposto: bool, come: Optional[str], in_ritardo: bool,
          completa: bool = False) -> dict:
    testo = base.ripara_codifica(r.get("testo") or "")
    try:
        allegati = json.loads(r.get("allegati") or "[]")
    except ValueError:
        allegati = []
    out = {
        "id": r["id"], "fonte": "casella", "casella": casella, "dove": _dove(r["ruolo"], r["presente"]),
        "data": r["data"], "mittente": r["mittente"], "mittente_nome": r["mittente_nome"],
        "a": r["a"], "cc": r["cc"], "oggetto": base.ripara_codifica(r.get("oggetto") or ""),
        "letta": None if r["letta"] is None else bool(r["letta"]),
        "risposto": risposto, "risposto_come": come,
        "contrassegnata": bool(r["contrassegnata"]) or None,
        "spam_marcato": bool(r["spam_marcato"]) or None,
        "pec": ({"tipo": r["pec_tipo"], "busta": r["pec_busta"]} if r["pec_tipo"] else None),
        "anche_in": anche or None, "in_ritardo": in_ritardo or None,
        "allegati": [a.get("nome") for a in allegati if a.get("nome") != "(inline)"] or None,
        "oltre_limite": bool(r["oltre_limite"]) or None,
    }
    if completa:
        out.update({"testo": testo, "parte_nuova": base.parte_nuova(testo),
                    "testo_troncato": bool(r["testo_troncato"]), "allegati_dettaglio": allegati,
                    "massiva": bool(r["massiva"]), "massiva_perche": r["massiva_perche"]})
    else:
        e = base.parte_nuova(testo)
        out["estratto"] = e[:300] + ("…" if len(e) > 300 else "")
    return _senza_vuoti(out) | {"risposto": risposto}


def _da_trgb(conn, soglia: Optional[str], q: Optional[str], limite: int) -> List[dict]:
    """Le mail della casella del gestionale nello stesso formato (fonte = trgb: si leggono
    con posta_trgb_leggi e hanno il preventivo abbinato)."""
    where, par = [], []
    if soglia:
        where.append("data >= ?")
        par.append(soglia)
    if q:
        for parola in q.split():
            like = f"%{parola}%"
            where.append("(oggetto LIKE ? OR mittente LIKE ? OR mittente_nome LIKE ? OR cc LIKE ? OR testo LIKE ?)")
            par += [like] * 5
    righe = [dict(r) for r in conn.execute(
        f"SELECT * FROM email_in WHERE {' AND '.join(where) or '1=1'} ORDER BY data DESC LIMIT ?", par + [limite])]
    if not righe:
        return []
    risposte = {r["email_in_id"] for r in conn.execute(
        f"SELECT DISTINCT email_in_id FROM email_in_risposte WHERE esito = 'ok' AND email_in_id IN "
        f"({','.join('?' * len(righe))})", [r["id"] for r in righe])}
    inviate = _risposte(conn, [r["message_id"] for r in righe])
    descr = base._descrivi(r["preventivo_id"] for r in righe)
    out = []
    for r in righe:
        risposto = r["id"] in risposte or r["message_id"] in inviate
        p = descr.get(r["preventivo_id"]) if r["preventivo_id"] else None
        e = base.parte_nuova(base.ripara_codifica(r.get("testo") or ""))
        out.append(_senza_vuoti({
            "id": r["id"], "fonte": "trgb", "casella": "trgb (gestionale)", "dove": "posta in arrivo",
            "data": r["data"], "mittente": r["mittente"], "mittente_nome": r["mittente_nome"], "a": r["a"],
            "cc": r["cc"], "oggetto": base.ripara_codifica(r.get("oggetto") or ""),
            "risposto_come": ("risposto dalla pagina Posta" if r["id"] in risposte
                              else "risposto da un'altra casella" if risposto else None),
            "stato_trgb": r["stato"], "abbinamento": r["abbinamento"],
            "preventivo": ({k: p.get(k) for k in ("numero", "cliente", "data_evento", "stato", "scadenza_conferma")}
                           if p else None),
            "estratto": e[:300] + ("…" if len(e) > 300 else ""),
        }) | {"risposto": risposto})
    return out


def leggi(email_id: int) -> Optional[dict]:
    """Una mail per intero, con le altre copie (altre cartelle, altre caselle) e le
    risposte mandate da noi che la citano."""
    init_email_db()
    cfg = config()
    indir = _indirizzo_di(cfg)
    conn = get_email_conn()
    try:
        r = conn.execute("SELECT * FROM email_posta WHERE id = ?", (int(email_id),)).fetchone()
        if not r:
            return None
        r = dict(r)
        copie = [{"id": x["id"], "casella": indir.get(x["casella"], x["casella"]), "dove": _dove(x["ruolo"], x["presente"])}
                 for x in conn.execute("SELECT id, casella, ruolo, presente FROM email_posta WHERE message_id = ? AND id != ?",
                                       (r["message_id"], r["id"]))]
        if conn.execute("SELECT 1 FROM email_in WHERE message_id = ?", (r["message_id"],)).fetchone():
            copie.append({"casella": "trgb (gestionale)", "dove": "posta in arrivo"})
        risposte = [{"data": x["data"], "casella": indir.get(x["casella"], x["casella"]), "a": x["a"], "oggetto": x["oggetto"]}
                    for x in conn.execute(
                        "SELECT data, casella, a, oggetto FROM email_posta WHERE ruolo = 'inviata' AND "
                        "(instr(IFNULL(in_reply_to,''), ?) > 0 OR instr(IFNULL(riferimenti,''), ?) > 0) ORDER BY data",
                        (r["message_id"], r["message_id"]))]
        da_bozze = _risposte_da_bozze(conn, [r["id"]])
        inviata = None
        if risposte:
            inviata = {"data": risposte[0]["data"], "casella": next(
                (k for k, v in indir.items() if v == risposte[0]["casella"]), risposte[0]["casella"])}
    finally:
        conn.close()
    risposto, come = _stato_risposta(r, inviata, indir)
    if not risposto and r["id"] in da_bozze:
        risposto, come = True, f"risposto il {da_bozze[r['id']][:16]} da TRGB"
    if (r["mittente"] or "").lower() in set(indirizzi_nostri(cfg)) and not risposto:
        risposto, come = True, "mandata da una nostra casella (copia): non serve risposta"
    out = _riga(r, indir.get(r["casella"], r["casella"]), [], risposto, come, False, completa=True)
    era_in_arrivo = any(c.get("id") and c["dove"].startswith("posta in arrivo") for c in copie if c["casella"] == indir.get(r["casella"], r["casella"]))
    sc = _scartata(r, era_in_arrivo)
    if sc:
        out["scartata"] = sc
    out["altre_copie"] = copie
    out["risposte_mandate"] = risposte
    try:
        from app.services import email_scrittura_service as scr
        b = scr.bozze_per_mail("casella", [r["id"]]).get(r["id"])
        if b:
            out["bozza"] = b
    except Exception:                       # noqa: BLE001
        logger.exception("bozza della mail %s", r["id"])
    return out
