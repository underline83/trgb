# @version: v1.0 (2026-11-13) — risposte dei clienti via email abbinate ai preventivi
# Modulo: clienti (sub-modulo preventivi) — [core]
# -*- coding: utf-8 -*-
"""
Preventivi ↔ posta in arrivo (2026-11-13).

La piattaforma (email_in_service, mattone M.D) scarica la posta della casella del
gestionale; questo file è il pezzo del modulo preventivi che si aggancia con
`registra()` al boot (main.py) e decide a quale preventivo appartiene una mail.

Ordine dell'abbinamento (decisione di Marco, 2026-11-13):
  a) In-Reply-To / References contro il message_id degli invii salvati in
     clienti_preventivi_invii (o di una mail già abbinata dello stesso thread)
     → abbinamento «in_reply_to»;
  b) numero PRE-AAAA-NNN nell'oggetto → «numero»;
  c) email del mittente o dei cc contro il cliente (o i destinatari degli invii) di
     un preventivo aperto → «mittente». Se i preventivi aperti sono più d'uno si
     prende quello inviato per ultimo e lo si scrive nella nota.
Se c'è abbinamento: passo nello storico («Risposta del cliente via email, gg/mm
hh:mm»), campanello ai ruoli di `preventivi_avviso_ruoli`, e gli indirizzi nuovi del
thread (es. un collega del cliente in cc) segnati sulla mail — il cliente NON si
modifica in automatico.

Le mail dello staff (indirizzo staff / Rispondi a / la casella stessa) nel thread si
abbinano lo stesso ma non suonano il campanello.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional

from app.models.clienti_db import get_clienti_conn

logger = logging.getLogger("trgb.preventivi.email")

# Stati in cui un preventivo è «aperto» (aspetta o ha appena avuto la risposta del cliente)
STATI_APERTI = ("bozza", "inviato", "in_attesa", "confermato", "prenotato")
# Stati «inviato, in attesa di conferma» per i solleciti
STATI_SOLLECITO = ("inviato", "in_attesa")
RE_NUMERO = re.compile(r"\bPRE-(\d{4})-(\d{3,})\b", re.IGNORECASE)


def _split(s: Optional[str]) -> List[str]:
    return [x.strip().lower() for x in re.split(r"[,;\s]+", s or "") if "@" in x]


def _staff() -> set:
    from app.services.preventivi_scadenze import get_config
    cfg = get_config()
    return set(_split(cfg.get("preventivi_email_copia")) + _split(cfg.get("preventivi_reply_to")))


def _cliente_nome(r) -> str:
    return " ".join(x for x in [(r["cliente_cognome"] or "").strip(), (r["cliente_nome"] or "").strip()] if x)


def _gg_mm_hh(iso: Optional[str]) -> str:
    try:
        return datetime.strptime((iso or "")[:16], "%Y-%m-%d %H:%M").strftime("%d/%m %H:%M")
    except ValueError:
        return iso or ""


def _invii_esiste(conn) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_preventivi_invii'").fetchone())


def _noti(conn, preventivo_id: int) -> set:
    """Indirizzi già noti per un preventivo: cliente + destinatari e cc degli invii."""
    noti = set()
    r = conn.execute(
        "SELECT c.email FROM clienti_preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = ?",
        (preventivo_id,)).fetchone()
    if r and r["email"]:
        noti.update(_split(r["email"]))
    if _invii_esiste(conn):
        for i in conn.execute(
                "SELECT destinatario, cc FROM clienti_preventivi_invii WHERE preventivo_id = ? AND canale = 'email'",
                (preventivo_id,)):
            noti.update(_split(i["destinatario"]))
            noti.update(_split(i["cc"]))
    return noti


# ─────────────────────────── abbinamento ───────────────────────────

def abbina(mail: dict, preventivo_noto: Optional[int] = None) -> Optional[dict]:
    nostri = {x.lower() for x in mail.get("nostri") or []} | _staff()
    conn = get_clienti_conn()
    try:
        pid, metodo, nota = None, None, None
        # a) risposta a un invio del gestionale (o a una mail già abbinata del thread)
        ids = list(dict.fromkeys((mail.get("in_reply_to") or "").split() + list(mail.get("riferimenti") or [])))
        if ids and _invii_esiste(conn):
            r = conn.execute(
                f"SELECT preventivo_id FROM clienti_preventivi_invii WHERE LOWER(message_id) IN "
                f"({','.join('?' * len(ids))}) ORDER BY id DESC LIMIT 1", [i.lower() for i in ids]).fetchone()
            if r:
                pid, metodo = r["preventivo_id"], "in_reply_to"
        if not pid and preventivo_noto:
            pid, metodo, nota = preventivo_noto, "in_reply_to", "stesso thread di una mail già abbinata"
        # b) numero del preventivo nell'oggetto
        if not pid:
            m = RE_NUMERO.search(mail.get("oggetto") or "")
            if m:
                numero = f"PRE-{m.group(1)}-{m.group(2)}"
                r = conn.execute("SELECT id FROM clienti_preventivi WHERE UPPER(numero) = ?", (numero,)).fetchone()
                if r:
                    pid, metodo = r["id"], "numero"
        # c) mittente o cc contro il cliente / i destinatari di un preventivo aperto
        if not pid:
            indirizzi = [x for x in [mail.get("mittente") or ""] + list(mail.get("cc") or [])
                         if x and x.lower() not in nostri]
            if indirizzi:
                pid, nota = _per_indirizzo(conn, indirizzi, nostri)
                metodo = "mittente" if pid else None
        if not pid:
            return None
        p = conn.execute("SELECT id, cliente_id, numero FROM clienti_preventivi WHERE id = ?", (pid,)).fetchone()
        if not p:
            return None
        noti = _noti(conn, pid) | nostri
    finally:
        conn.close()

    try:   # indirizzi già visti in altre mail dello stesso preventivo: non sono «nuovi»
        from app.services.email_in_service import indirizzi_visti
        noti |= indirizzi_visti(pid, escludi_id=mail.get("id"))
    except Exception:                                   # noqa: BLE001
        logger.exception("indirizzi visti per il preventivo %s", pid)
    tutti = [mail.get("mittente") or ""] + list(mail.get("a") or []) + list(mail.get("cc") or [])
    cc_nuovi = [x for x in dict.fromkeys(x.lower() for x in tutti if x) if x not in noti]
    return {"preventivo_id": pid, "cliente_id": p["cliente_id"], "abbinamento": metodo,
            "nota": nota, "cc_nuovi": cc_nuovi, "numero": p["numero"],
            "da_staff": (mail.get("mittente") or "").lower() in nostri}


def _per_indirizzo(conn, indirizzi: List[str], nostri: set):
    cerca = {x.lower() for x in indirizzi}
    aperti = conn.execute(
        f"""SELECT p.id, p.numero, p.updated_at, p.created_at, c.email
            FROM clienti_preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id
            WHERE p.stato IN ({','.join('?' * len(STATI_APERTI))}) AND COALESCE(p.is_bozza_auto, 0) = 0""",
        STATI_APERTI).fetchall()
    if not aperti:
        return None, None
    per_id = {r["id"]: r for r in aperti}
    candidati = {r["id"] for r in aperti if cerca & set(_split(r["email"]))}
    ultimo_invio: Dict[int, int] = {}
    if _invii_esiste(conn):
        ids = list(per_id)
        for i in conn.execute(
                f"SELECT id, preventivo_id, destinatario, cc FROM clienti_preventivi_invii "
                f"WHERE canale = 'email' AND preventivo_id IN ({','.join('?' * len(ids))})", ids):
            ultimo_invio[i["preventivo_id"]] = max(ultimo_invio.get(i["preventivo_id"], 0), i["id"])
            if cerca & ((set(_split(i["destinatario"])) | set(_split(i["cc"]))) - nostri):
                candidati.add(i["preventivo_id"])
    if not candidati:
        return None, None
    scelto = max(candidati, key=lambda c: (ultimo_invio.get(c, 0), per_id[c]["updated_at"] or per_id[c]["created_at"] or ""))
    nota = None
    if len(candidati) > 1:
        altri = ", ".join(sorted(per_id[c]["numero"] or str(c) for c in candidati if c != scelto))
        nota = (f"{len(candidati)} preventivi aperti per questo indirizzo: scelto {per_id[scelto]['numero']} "
                f"(inviato per ultimo); gli altri: {altri}")
    return scelto, nota


# ─────────────────────────── dopo l'abbinamento ───────────────────────────

def dopo(mail: dict, ris: dict, avvisa: bool) -> None:
    from app.services.preventivi_scadenze import get_config, scrivi_storico
    pid = ris["preventivo_id"]
    quando = _gg_mm_hh(mail.get("data"))
    cc_nuovi = ris.get("cc_nuovi") or []
    if ris.get("da_staff"):
        testo = f"Email di {mail.get('mittente')} (staff) nel thread, {quando}"
    else:
        testo = f"Risposta del cliente via email, {quando}"
    if cc_nuovi:
        testo += f" — indirizzi nuovi nel thread: {', '.join(cc_nuovi)} (cliente non modificato)"
    scrivi_storico(pid, "risposta_email", testo, "sistema")
    if not avvisa or ris.get("da_staff"):
        return

    from app.services.notifiche_service import crea_notifica
    from app.services.email_in_service import parte_nuova
    conn = get_clienti_conn()
    try:
        p = conn.execute(
            """SELECT p.numero, p.titolo, c.nome AS cliente_nome, c.cognome AS cliente_cognome
               FROM clienti_preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = ?""",
            (pid,)).fetchone()
    finally:
        conn.close()
    if not p:
        return
    cliente = _cliente_nome(p) or (p["titolo"] or "")
    estratto = parte_nuova(mail.get("testo") or "")[:200]
    nome = (mail.get("mittente_nome") or "").strip()
    righe = [f"Da: {nome} <{mail.get('mittente') or ''}>" if nome else f"Da: {mail.get('mittente') or ''}",
             f"Oggetto: {mail.get('oggetto') or '(senza oggetto)'}"]
    if cc_nuovi:
        righe.append(f"Nel thread ci sono indirizzi nuovi: {', '.join(cc_nuovi)} (il cliente non è stato modificato)")
    if estratto:
        righe += ["", estratto + ("…" if len(estratto) >= 200 else "")]
    titolo = f"📥 {cliente}: risposta al preventivo {p['numero'] or ''}".strip()
    ruoli = [x.strip() for x in (get_config().get("preventivi_avviso_ruoli") or "").split(",") if x.strip()]
    for ruolo in ruoli:
        try:
            crea_notifica(tipo="preventivo_risposta", titolo=titolo, messaggio="\n".join(righe),
                          link=f"/clienti/preventivi/{pid}", icona="📥", urgenza="normale",
                          modulo="preventivi", entity_id=pid, dest_ruolo=ruolo)
        except Exception:                               # noqa: BLE001
            logger.exception("Campanello risposta preventivo %s fallito", pid)


# ─────────────────────────── letture per la posta ───────────────────────────

def descrivi(ids: Iterable[int]) -> Dict[int, dict]:
    """Il preventivo collegato, in breve: numero, cliente, evento e scadenza conferma."""
    ids = sorted({int(i) for i in ids if i})
    if not ids:
        return {}
    conn = get_clienti_conn()
    try:
        righe = conn.execute(
            f"""SELECT p.id, p.numero, p.titolo, p.stato, p.data_evento, p.ora_evento, p.n_persone,
                       p.scadenza_conferma, p.cliente_id, c.nome AS cliente_nome, c.cognome AS cliente_cognome
                FROM clienti_preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id
                WHERE p.id IN ({','.join('?' * len(ids))})""", ids).fetchall()
    finally:
        conn.close()
    return {r["id"]: {
        "id": r["id"], "numero": r["numero"], "titolo": r["titolo"], "stato": r["stato"],
        "cliente": _cliente_nome(r) or None, "cliente_id": r["cliente_id"],
        "data_evento": r["data_evento"], "ora_evento": r["ora_evento"], "n_persone": r["n_persone"],
        "scadenza_conferma": r["scadenza_conferma"],
    } for r in righe}


def senza_risposta(giorni: int = 3, oggi: Optional[date] = None) -> List[dict]:
    """Preventivi inviati, in attesa di conferma, con la scadenza entro N giorni (anche
    già passata) e NESSUNA mail ricevuta: i candidati al sollecito. Dice anche se c'è
    stato un invio WhatsApp (la risposta potrebbe essere arrivata lì)."""
    from app.services.email_in_service import ultima_mail_per_preventivo
    oggi = oggi or date.today()
    limite = (oggi + timedelta(days=int(giorni))).isoformat()
    conn = get_clienti_conn()
    try:
        righe = conn.execute(
            f"""SELECT p.id, p.numero, p.titolo, p.stato, p.data_evento, p.ora_evento, p.n_persone,
                       p.scadenza_conferma, p.cliente_id, c.nome AS cliente_nome, c.cognome AS cliente_cognome,
                       c.email AS cliente_email
                FROM clienti_preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id
                WHERE p.stato IN ({','.join('?' * len(STATI_SOLLECITO))})
                  AND COALESCE(p.is_bozza_auto, 0) = 0
                  AND COALESCE(p.scadenza_conferma, '') != '' AND p.scadenza_conferma <= ?
                ORDER BY p.scadenza_conferma, p.data_evento""",
            STATI_SOLLECITO + (limite,)).fetchall()
        invii: Dict[int, List[dict]] = {}
        if righe and _invii_esiste(conn):
            ids = [r["id"] for r in righe]
            for i in conn.execute(
                    f"SELECT preventivo_id, canale, esito, created_at FROM clienti_preventivi_invii "
                    f"WHERE preventivo_id IN ({','.join('?' * len(ids))}) ORDER BY id", ids):
                invii.setdefault(i["preventivo_id"], []).append(dict(i))
    finally:
        conn.close()
    con_mail = ultima_mail_per_preventivo(r["id"] for r in righe)
    out = []
    for r in righe:
        if r["id"] in con_mail:
            continue
        ok = [i for i in invii.get(r["id"], []) if i["esito"] == "ok"]
        try:
            g = (datetime.strptime(r["scadenza_conferma"], "%Y-%m-%d").date() - oggi).days
        except ValueError:
            g = None
        out.append({
            "id": r["id"], "numero": r["numero"], "titolo": r["titolo"], "stato": r["stato"],
            "cliente": _cliente_nome(r) or r["titolo"], "cliente_id": r["cliente_id"],
            "ha_email": bool(r["cliente_email"]),
            "data_evento": r["data_evento"], "ora_evento": r["ora_evento"], "n_persone": r["n_persone"],
            "scadenza_conferma": r["scadenza_conferma"], "giorni_alla_scadenza": g,
            "ultimo_invio": ok[-1]["created_at"] if ok else None,
            "canali_invio": sorted({i["canale"] for i in ok}),
            "nota": ("inviato anche su WhatsApp: la risposta potrebbe essere arrivata lì (whatsapp_cerca)"
                     if any(i["canale"] == "whatsapp" for i in ok) else None),
        })
    return out


def registra() -> None:
    """Al boot (main.py), se il modulo preventivi è attivo."""
    from app.services.email_in_service import registra_abbinatore
    registra_abbinatore(abbina, dopo=dopo, descrivi=descrivi, nome="preventivi")
