# @version: v1.0 (2026-11-27) — percorso unico delle prenotazioni prese da TRGB: form, sito, Q, walk-in
# -*- coding: utf-8 -*-
"""
Inserire una prenotazione — Modulo: prenotazioni — [core]

Marco, 27/11/2026: «form e sito devono ragionare nello stesso modo, il ragionamento e i
passaggi che fa uno o l'altro devono essere identici, altrimenti sarà un casino».

Ogni prenotazione presa da TRGB passa da qui, sempre con gli stessi sei passi:

    1. giorno e turno    calendario chiusure del locale (+ giorno di chiusura prenotazioni)
    2. posto             fasce (aperta, online, tetti), sale aperte, motore dei tavoli,
                         capienza, confronto con TheFork → «entra» o i motivi per cui no
    3. stato di partenza confermata, in opzione, lista d'attesa, richiesta
    4. cliente           riconoscimento da numero o email, persone della scheda
    5. riga              stessa tabella, stessi campi; cambia `fonte`
    6. dopo              tavolo diviso, TheFork, ricalcolo dell'online, doppioni,
                         avviso allo staff e conferma al cliente

I controlli sono identici per tutti. Cambia solo CHI PUÒ DIRE SÌ quando un controllo dice
no (REGOLE): l'operatore dal form vede l'avviso e può salvare lo stesso; il cliente dal
sito vede solo gli orari dove entra, e per gli altri può mettersi in lista d'attesa.

Niente limite di anticipo (Marco 27/11: «meno di 2 ore prima, oltre 60 giorni non lo
farei; online se c'è disponibilità posso farlo, tanto il controllo è immediato»): l'unico
limite, per tutto il sistema, è che il servizio sia aperto. Le fasce già passate non si
vendono online.

Porte: `prenotazioni_router.crea_prenotazione` (form, e da lì walk-in e connettore Q) e
`prenotazioni_sito_service.crea` / `.orari` / `.calendario` (sito). Gli arrivi da TheFork
restano fuori: sono la sincronizzazione, non un inserimento.
"""

from __future__ import annotations

import logging
import re
import secrets
import threading
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.clienti_db import get_clienti_conn
from app.services import clienti_riconosci_service as riconosci_srv
from app.services import prenotazioni_fasce_service as fasce_srv
from app.services import prenotazioni_stati as stati_srv
from app.utils import telefono as tel

log = logging.getLogger("trgb.prenotazioni.inserimento")

OPERATORE = "operatore"   # form di TRGB, walk-in, connettore Q: c'è una persona dello staff che decide
CLIENTE = "cliente"       # widget del sito: nessuno dello staff, il cliente non può forzare

BLOCCA, AVVISA, NON_CONTA = "blocca", "avvisa", "non_conta"

# Una riga per motivo: cosa succede quando il controllo dice no (tabella approvata da Marco il 27/11).
REGOLE: Dict[str, Dict[str, str]] = {
    "passata":        {OPERATORE: NON_CONTA, CLIENTE: BLOCCA},
    "chiusa":         {OPERATORE: AVVISA,    CLIENTE: BLOCCA},
    "online_chiusa":  {OPERATORE: NON_CONTA, CLIENTE: BLOCCA},
    "tetto_coperti":  {OPERATORE: AVVISA,    CLIENTE: BLOCCA},
    "tetto_online":   {OPERATORE: NON_CONTA, CLIENTE: BLOCCA},
    "sale_chiuse":    {OPERATORE: AVVISA,    CLIENTE: BLOCCA},
    "capienza":       {OPERATORE: AVVISA,    CLIENTE: BLOCCA},
    "tavolo":         {OPERATORE: AVVISA,    CLIENTE: BLOCCA},
    "thefork_chiusa": {OPERATORE: AVVISA,    CLIENTE: BLOCCA},
}
# Per una richiesta di gruppo dal sito la sala decide il posto: contano solo questi.
MOTIVI_RICHIESTA = ("passata", "chiusa", "online_chiusa", "sale_chiuse")

DESCRIZIONE = {
    "passata": "orario già passato",
    "chiusa": "fascia chiusa",
    "online_chiusa": "fascia chiusa per l'online",
    "tetto_coperti": "supera il massimo di coperti della fascia",
    "tetto_online": "supera il massimo online della fascia",
    "sale_chiuse": "sale tutte chiuse in quel turno",
    "capienza": "supera la capienza del turno",
    "tavolo": "nessun tavolo libero per quel numero di persone",
    "thefork_chiusa": "su TheFork quell'orario non è prenotabile online",
}

STATI_OPERATORE = ("RECORDED", "OPTION", "WAITLIST")
FONTE = {OPERATORE: "manuale", CLIENTE: "sito"}
LINGUE_SITO = {"it": "it_IT", "en": "en_GB", "fr": "fr_FR", "de": "de_DE", "es": "es_ES", "uk": "uk_UA"}

_lock = threading.Lock()   # due inserimenti sull'ultimo posto: uno solo passa


class Rifiutata(Exception):
    """L'inserimento non si fa. `codice` per le porte, `messaggio` per chi legge, `http` per il router."""

    def __init__(self, codice: str, messaggio: str, http: int = 409):
        super().__init__(messaggio)
        self.codice = codice
        self.messaggio = messaggio
        self.http = http


class NonDisponibile(Rifiutata):
    """Dal sito: non c'è posto, è un gruppo da telefonare, il giorno è chiuso…"""

    def __init__(self, codice: str, messaggio: str = ""):
        super().__init__(codice, messaggio or codice, 409)


# ── Passo 1 · giorno e turno ─────────────────────────────────

def _cfg(conn) -> Dict[str, str]:
    from app.services import prenotazioni_sito_service as sito
    return sito.config(conn)


def _regole_sito(cfg: Dict[str, str]) -> Dict[str, Any]:
    from app.services import prenotazioni_sito_service as sito
    return sito.regole(cfg)


def turno_di(ora: str, cfg: Dict[str, str]) -> str:
    soglia = cfg.get("soglia_pranzo_cena") or "15:00"
    return "pranzo" if (ora or "")[:5] < soglia else "cena"


def turni_chiusi(cfg: Dict[str, str], d: date, chiusure: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    from app.services import prenotazioni_sito_service as sito
    return sito.turni_chiusi_motivi(cfg, d, chiusure)


def controlla_aperto(cfg: Dict[str, str], data: str, turno: str) -> None:
    """Passo 1: turno chiuso = niente prenotazioni da TRGB, per nessuno (Marco 2026-11-19)."""
    try:
        d = date.fromisoformat(str(data)[:10])
    except ValueError:
        raise Rifiutata("data", "Data non valida", 400)
    motivo = turni_chiusi(cfg, d).get(turno)
    if motivo is not None:
        from app.services import calendario_chiusure
        raise Rifiutata("chiuso", calendario_chiusure.descrivi(data, turno, motivo)
                        + ": non si inseriscono prenotazioni. Per riaprirlo: Vendite › Chiusure.", 409)


# ── Passo 2 · posto ──────────────────────────────────────────

def _minuti(ora: str) -> int:
    h, m = (ora or "00:00")[:5].split(":")
    return int(h) * 60 + int(m)


def _coperti_turno(conn, data: str, turno: str, escludi_id: Optional[int] = None) -> int:
    non = stati_srv.non_occupano()
    r = conn.execute(f"""
        SELECT COALESCE(SUM(pax), 0) FROM clienti_prenotazioni
        WHERE data_pasto = ? AND turno = ? AND stato NOT IN ({','.join('?' * len(non))}) AND id != ?
    """, (data, turno, *non, escludi_id or -1)).fetchone()
    return int(r[0] or 0)


def _thefork_chiuse(conn, data: str, turno: str) -> set:
    """Orari che TRGB crede aperti online ma TheFork non vende (chiusi a mano da TheFork Manager).
    Se TheFork non risponde o non è configurato: nessuno (il controllo non blocca per un guasto)."""
    try:
        c = fasce_srv.confronto_thefork(conn, data, turno)
    except Exception:  # noqa: BLE001
        return set()
    return set(c.get("non_prenotabili") or []) if c.get("controllato") else set()


class _Turno:
    """Tutto quello che serve per valutare gli orari di un turno, calcolato una volta."""

    def __init__(self, conn, data: str, turno: str, cfg: Dict[str, str], con_thefork: bool,
                 escludi_id: Optional[int] = None):
        from app.services import prenotazioni_sale_service as sale_srv
        from app.services import prenotazioni_tavoli_service as tavoli_srv
        self.data, self.turno = data, turno
        self.fasce = fasce_srv.fasce_giorno(conn, data, turno, cfg)["fasce"]
        cap = sale_srv.capienza(conn, data, turno)           # tavoli delle sale aperte (mig 214)
        self.sale_chiuse = cap == 0
        self.capienza = cap if cap is not None else int(float(cfg.get(f"capienza_{turno}") or 0))
        self.occupati = _coperti_turno(conn, data, turno, escludi_id)
        self.motore = None
        try:
            m = tavoli_srv.Verificatore(conn, data, turno, escludi_id=escludi_id)
            self.motore = m if m.ha_tavoli else None
        except Exception:  # noqa: BLE001
            self.motore = None
        self.thefork = _thefork_chiuse(conn, data, turno) if con_thefork else set()

    def fascia_di(self, ora: str) -> Optional[Dict[str, Any]]:
        """La fascia in cui cade un orario: l'ultima che non lo supera (come i conti delle fasce)."""
        if not self.fasce:
            return None
        m = _minuti(ora)
        scelta = self.fasce[0]
        for f in self.fasce:
            if _minuti(f["ora"]) <= m:
                scelta = f
        return scelta

    def motivi(self, ora: str, pax: int, adesso: datetime, durata_min: Optional[int] = None,
               solo: Optional[Tuple[str, ...]] = None) -> List[str]:
        """Perché `pax` persone alle `ora` non entrano. Lista vuota = entra."""
        out: List[str] = []
        f = self.fascia_di(ora)
        quando = datetime.combine(date.fromisoformat(self.data), datetime.strptime(ora[:5], "%H:%M").time())
        if quando < adesso:
            out.append("passata")
        if self.sale_chiuse:
            out.append("sale_chiuse")
        if f is not None:
            if not f["aperta"]:
                out.append("chiusa")
            elif not f["online_aperta"]:
                out.append("online_chiusa")
            if f["max_coperti"] is not None and f["coperti"] + pax > f["max_coperti"]:
                out.append("tetto_coperti")
            if f["max_online"] is not None and f["online"] + pax > f["max_online"]:
                out.append("tetto_online")
            if f["ora"] in self.thefork:
                out.append("thefork_chiusa")
        if solo is not None:
            return [m for m in out if m in solo]
        # senza tavoli in mappa conta la capienza in coperti; coi tavoli decide il motore
        if self.motore is None:
            if self.capienza > 0 and self.occupati + pax > self.capienza:
                out.append("capienza")
        else:
            try:
                if not self.motore.verifica(pax, ora[:5], durata_min)["entra"]:
                    out.append("tavolo")
            except Exception:  # noqa: BLE001
                pass
        return out


def bloccanti(motivi: List[str], chi: str) -> List[str]:
    return [m for m in motivi if REGOLE.get(m, {}).get(chi) == BLOCCA]


def avvisi(motivi: List[str], chi: str) -> List[str]:
    return [m for m in motivi if REGOLE.get(m, {}).get(chi) == AVVISA]


def orari(conn, data: str, pax: int, chi: str = CLIENTE, adesso: Optional[datetime] = None,
          cfg: Optional[Dict[str, str]] = None, chiusure: Optional[Dict[str, Any]] = None,
          con_thefork: bool = True) -> Dict[str, Any]:
    """
    Gli orari di un giorno per `pax` persone, con per ognuno `libero` e i motivi.
    {"data", "pax", "richiesta", "turni": [{"turno", "orari": [{"ora", "libero", "motivi", "attesa"}]}], "motivo"}
    `attesa` = per il sito si può chiedere la lista d'attesa su quell'orario (non libero, fascia
    non chiusa dallo staff, non passata).
    """
    cfg = cfg or _cfg(conn)
    rg = _regole_sito(cfg)
    adesso = adesso or datetime.now()
    richiesta = chi == CLIENTE and pax > rg["max_automatica"]
    out: Dict[str, Any] = {"data": data, "pax": pax, "richiesta": richiesta, "turni": [], "motivo": None}
    try:
        d = date.fromisoformat(data)
    except ValueError:
        out["motivo"] = "data"
        return out
    if pax < 1:
        out["motivo"] = "persone"
        return out
    if chi == CLIENTE and pax > rg["max_richiesta"]:
        out["motivo"] = "gruppo"
        return out
    if d < adesso.date():
        out["motivo"] = "fuori_periodo"
        return out
    chiusi = turni_chiusi(cfg, d, chiusure)
    if set(chiusi) >= {"pranzo", "cena"}:
        out["motivo"] = "chiuso"
        return out
    for turno in ("pranzo", "cena"):
        if turno in chiusi:
            continue
        t = _Turno(conn, data, turno, cfg, con_thefork=con_thefork)
        if not t.fasce or (chi == CLIENTE and t.sale_chiuse):
            continue
        lista = []
        for f in t.fasce:
            mot = t.motivi(f["ora"], pax, adesso, solo=MOTIVI_RICHIESTA if richiesta else None)
            if chi == CLIENTE and "passata" in mot:
                continue
            libero = not bloccanti(mot, chi)
            lista.append({"ora": f["ora"], "libero": libero, "motivi": mot,
                          "attesa": not libero and "chiusa" not in mot and "passata" not in mot})
        if lista:
            out["turni"].append({"turno": turno, "orari": lista})
    if not any(o["libero"] for t in out["turni"] for o in t["orari"]):
        out["motivo"] = "pieno"
    return out


def valuta(conn, data: str, ora: str, pax: int, chi: str, cfg: Optional[Dict[str, str]] = None,
           durata_min: Optional[int] = None, escludi_id: Optional[int] = None,
           adesso: Optional[datetime] = None, richiesta: bool = False) -> Dict[str, Any]:
    """Passo 2 per un orario solo: {"entra", "motivi", "bloccanti", "avvisi", "turno", "fascia"}.
    Il confronto con TheFork (una chiamata a TheFork) si fa per il cliente, dove blocca; per
    l'operatore sarebbe solo un avviso, e al salvataggio dal form non lo si aspetta: l'esito
    dell'invio a TheFork dice già se quell'orario lì non è prenotabile."""
    cfg = cfg or _cfg(conn)
    turno = turno_di(ora, cfg)
    t = _Turno(conn, data, turno, cfg, con_thefork=(chi == CLIENTE), escludi_id=escludi_id)
    mot = t.motivi(ora, pax, adesso or datetime.now(), durata_min, solo=MOTIVI_RICHIESTA if richiesta else None)
    f = t.fascia_di(ora)
    blocca = bloccanti(mot, chi)
    return {"entra": not mot, "motivi": mot, "bloccanti": blocca, "avvisi": avvisi(mot, chi),
            "turno": turno, "fascia": f["ora"] if f else None,
            "fascia_esatta": bool(f and f["ora"] == ora[:5])}


# ── Passo 4 · cliente ────────────────────────────────────────

def _parole(*testi: Optional[str]) -> set:
    return {p for t in testi for p in re.split(r"\s+", (t or "").strip().lower()) if p}


def stessa_persona(nome: str, cognome: str, scheda: Dict[str, Any]) -> bool:
    """«Mario Rossi» e la scheda «Rossi Mario» (o solo «Rossi») sono la stessa persona."""
    scritte, sulla_scheda = _parole(nome, cognome), _parole(scheda.get("nome"), scheda.get("cognome"))
    if not scritte or not sulla_scheda:
        return True
    return scritte <= sulla_scheda or sulla_scheda <= scritte


def cliente_dal_sito(conn, nome: str, cognome: str, telefono: Optional[str], email: Optional[str],
                     lingua: Optional[str], titolo: Optional[str] = None) -> Dict[str, Any]:
    """
    Passo 4 per chi prenota dal sito: la stessa regola del form, senza nessuno che sceglie.
    - numero o email noti → quella scheda (vince il numero); si completano solo i campi vuoti;
    - nome diverso da quello della scheda → «a nome di» e persona aggiunta alla scheda;
    - numero di una scheda ed email di un'altra → vale il numero, l'email non si scrive e la
      prenotazione esce con la nota (Marco 27/11);
    - nessuno la riconosce → scheda nuova (origine 'sito').
    """
    numero = tel.normalizza(telefono)
    lingua_cod = LINGUE_SITO.get((lingua or "it")[:2].lower(), "it_IT")
    trovati = riconosci_srv.riconosci(conn, numero, email)["clienti"]
    per_tel = [c for c in trovati if c["riconosciuto_da"] == "telefono"]
    per_mail = [c for c in trovati if c["riconosciuto_da"] == "email"]
    scheda = (per_tel or per_mail or [None])[0]
    out = {"cliente_id": None, "nuovo": False, "persona": None, "nota": None}
    if scheda:
        conflitto = per_mail[0] if (per_tel and per_mail and per_mail[0]["id"] != scheda["id"]) else None
        riga = conn.execute("SELECT telefono, email, lingua, titolo FROM clienti WHERE id = ?", (scheda["id"],)).fetchone()
        upd: Dict[str, Any] = {}
        if numero and not riga["telefono"]:
            upd["telefono"] = numero
        if email and not riga["email"] and not conflitto:
            upd["email"] = email
        if not riga["lingua"]:
            upd["lingua"] = lingua_cod
        if titolo and not riga["titolo"]:
            upd["titolo"] = titolo
        if upd:
            conn.execute(f"UPDATE clienti SET {', '.join(f'{k} = ?' for k in upd)}, updated_at = datetime('now','localtime') "
                         f"WHERE id = ?", (*upd.values(), scheda["id"]))
        out["cliente_id"] = scheda["id"]
        if not stessa_persona(nome, cognome, scheda):
            out["persona"] = " ".join(f"{nome} {cognome}".split())
            riconosci_srv.aggiungi_persona(conn, scheda["id"], out["persona"], None, "sito")
        if conflitto:
            out["nota"] = (f"⚠️ Dal sito: l'email {email} è della scheda {conflitto['nome']} {conflitto['cognome']} "
                           f"(#{conflitto['id']}), il numero di questa: verificare").replace("  ", " ")
        return out
    cur = conn.execute("""
        INSERT INTO clienti (nome, cognome, telefono, email, lingua, titolo, origine, protetto)
        VALUES (?, ?, ?, ?, ?, ?, 'sito', 1)
    """, (nome, cognome, numero, email, lingua_cod, titolo or None))
    out.update(cliente_id=cur.lastrowid, nuovo=True)
    return out


def cliente_dal_form(conn, dati: Dict[str, Any]) -> Tuple[Optional[int], bool]:
    """Passo 4 per l'operatore: scheda scelta, oppure scheda nuova se nessuno la riconosce
    (2026-11-26: un numero o un'email già di una scheda → si sceglie quella, 409)."""
    if not dati.get("cliente_id") and not (dati.get("nuovo_cognome") or "").strip() and not (dati.get("nuovo_nome") or "").strip() \
            and (dati.get("canale") or "") == "Walk-in":
        # Walk-in senza nome (Marco 2026-11-28: «non chiedere il nome, lascia walk-in»): tutti sulla
        # stessa scheda «Walk-in», senza telefono né email, creata la prima volta.
        gia = conn.execute("""
            SELECT id FROM clienti WHERE cognome = 'Walk-in' AND COALESCE(nome, '') = ''
              AND COALESCE(telefono, '') = '' AND COALESCE(email, '') = '' ORDER BY id LIMIT 1
        """).fetchone()
        if gia:
            return gia[0], False
        cur = conn.execute("""
            INSERT INTO clienti (nome, cognome, lingua, origine, protetto) VALUES ('', 'Walk-in', 'it_IT', 'diretto', 1)
        """)
        return cur.lastrowid, True
    # Basta il nome O il cognome (Marco 2026-11-28: «talvolta mettiamo solo il nome»)
    nome_n, cognome_n = (dati.get("nuovo_nome") or "").strip(), (dati.get("nuovo_cognome") or "").strip()
    if dati.get("cliente_id") or not (nome_n or cognome_n):
        return dati.get("cliente_id"), False
    numero = tel.normalizza(dati.get("nuovo_telefono"), dati.get("nuovo_prefisso")) or (dati.get("nuovo_telefono") or None)
    email = (dati.get("nuovo_email") or "").strip() or None
    gia = riconosci_srv.riconosci(conn, dati.get("nuovo_telefono"), email, dati.get("nuovo_prefisso"))["clienti"]
    if gia:
        g = gia[0]
        raise Rifiutata("cliente_noto", (
            f"Questo {'numero' if g['riconosciuto_da'] == 'telefono' else 'indirizzo email'} è già della scheda "
            f"{g['nome']} {g['cognome']}".strip() + ": scegli quella scheda (puoi aggiungere chi sta prenotando)."), 409)
    paese = tel.paese_di(numero)
    cur = conn.execute("""
        INSERT INTO clienti (nome, cognome, telefono, email, lingua, titolo, origine, protetto)
        VALUES (?, ?, ?, ?, COALESCE(?, 'it_IT'), ?, 'diretto', 1)
    """, (nome_n, cognome_n, numero, email,
          dati.get("nuovo_lingua") or (paese["lingua"] if paese else None),
          (dati.get("nuovo_titolo") or "").strip() or None))
    log.info("Nuovo cliente creato da prenotazione: id=%s", cur.lastrowid)
    return cur.lastrowid, True


# ── Il percorso ──────────────────────────────────────────────

def _testo(v: Any, n: int) -> Optional[str]:
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return s[:n] or None


def inserisci(dati: Dict[str, Any], chi: str, autore: str = "staff",
              adesso: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Inserisce una prenotazione con i sei passi. Solleva Rifiutata (o NonDisponibile dal sito).

    dati, campi comuni: data_pasto, ora_pasto, pax, nota_cliente, occasione, allergie_segnalate.
    Operatore: stato, tenuto_fino_al, cliente_id | nuovo_*, persona_nome, persona_relazione,
               tavolo, canale, nota_ristorante, tavolo_esterno, seggioloni, durata_min.
    Cliente:   nome, cognome, telefono, email, lingua, titolo, lista_attesa (bool).
    """
    adesso = adesso or datetime.now()
    data = str(dati.get("data_pasto") or "")[:10]
    ora = str(dati.get("ora_pasto") or "")
    pax = int(dati.get("pax") or 0)
    if pax < 1:
        raise Rifiutata("pax", "Numero di persone non valido", 400)

    with _lock:
        conn = get_clienti_conn()
        try:
            cfg = _cfg(conn)
            rg = _regole_sito(cfg)
            turno = turno_di(ora, cfg)

            # 1 · giorno e turno
            if chi == CLIENTE:
                try:
                    controlla_aperto(cfg, data, turno)
                except Rifiutata:
                    raise NonDisponibile("chiuso")
            else:
                controlla_aperto(cfg, data, turno)

            # 3 (prima del 2: decide quali controlli valgono) · stato di partenza
            tenuto = None
            if chi == OPERATORE:
                stato = dati.get("stato") or "RECORDED"
                if stato not in STATI_OPERATORE:
                    raise Rifiutata("stato", f"Una prenotazione nuova nasce {', '.join(STATI_OPERATORE)}, non {stato}", 400)
                if stato in stati_srv.gruppo("incerta"):
                    tenuto = dati.get("tenuto_fino_al")
                    if not tenuto:
                        from app.services.prenotazioni_attese_service import tenuto_fino_proposto
                        tenuto = tenuto_fino_proposto(conn, data)
            else:
                if pax > rg["max_richiesta"]:
                    raise NonDisponibile("gruppo")
                if dati.get("lista_attesa"):
                    stato = "WAITLIST"
                elif pax > rg["max_automatica"]:
                    stato = "REQUESTED"
                else:
                    stato = "RECORDED"

            # 2 · posto
            richiesta = stato == "REQUESTED"
            posto = valuta(conn, data, ora, pax, chi, cfg, durata_min=dati.get("durata_min") or None,
                           adesso=adesso, richiesta=richiesta)
            if chi == CLIENTE:
                if not posto["fascia_esatta"]:
                    raise NonDisponibile("occupato")
                if stato == "WAITLIST":
                    # la lista d'attesa si chiede sugli orari non liberi, mai su una fascia chiusa o passata
                    if "chiusa" in posto["motivi"] or "passata" in posto["motivi"] or "sale_chiuse" in posto["motivi"]:
                        raise NonDisponibile("occupato")
                elif posto["bloccanti"]:
                    raise NonDisponibile("occupato")

            # 4 · cliente
            persona, nota_auto, nuovo = None, None, False
            if chi == CLIENTE:
                cli = cliente_dal_sito(conn, dati["nome"], dati["cognome"], dati.get("telefono"),
                                       dati.get("email"), dati.get("lingua"), dati.get("titolo"))
                cliente_id, nuovo, persona, nota_auto = cli["cliente_id"], cli["nuovo"], cli["persona"], cli["nota"]
            else:
                cliente_id, nuovo = cliente_dal_form(conn, dati)
                persona = " ".join((dati.get("persona_nome") or "").split()) or None

            # 5 · riga
            token = secrets.token_urlsafe(16)
            nota_r = " · ".join(x for x in ((dati.get("nota_ristorante") or "").strip(), nota_auto or "") if x) or None
            cur = conn.execute("""
                INSERT INTO clienti_prenotazioni (
                    cliente_id, data_pasto, ora_pasto, stato, pax, tavolo,
                    canale, occasione, nota_ristorante, nota_cliente,
                    allergie_segnalate, tavolo_esterno, seggioloni,
                    data_prenotazione, prenotato_da, turno, fonte, creato_da,
                    token_cancellazione, tenuto_fino_al, persona_nome, durata_min,
                    nome_ospite, cognome_ospite
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cliente_id, data,
                ora if chi == OPERATORE else f"{ora[:5]}:00",
                stato, pax,
                dati.get("tavolo") if chi == OPERATORE else None,
                dati.get("canale") or "Telefono" if chi == OPERATORE else "Sito",
                _testo(dati.get("occasione"), 40) if chi == CLIENTE else dati.get("occasione"),
                nota_r,
                _testo(dati.get("nota_cliente"), 500) if chi == CLIENTE else dati.get("nota_cliente"),
                _testo(dati.get("allergie_segnalate"), 300) if chi == CLIENTE else dati.get("allergie_segnalate"),
                int(dati.get("tavolo_esterno") or 0) if chi == OPERATORE else 0,
                dati.get("seggioloni") if chi == OPERATORE else None,
                autore if chi == OPERATORE else "sito",
                turno, FONTE[chi],
                autore if chi == OPERATORE else "sito",
                token, tenuto, persona,
                (dati.get("durata_min") or None) if chi == OPERATORE else None,
                dati.get("nome") if chi == CLIENTE else None,
                dati.get("cognome") if chi == CLIENTE else None,
            ))
            pid = cur.lastrowid
            if chi == OPERATORE and persona and cliente_id:
                riconosci_srv.aggiungi_persona(conn, cliente_id, persona, dati.get("persona_relazione"), autore)
            conn.commit()

            # 6 · dopo (quello che sta nel DB)
            from app.services import prenotazioni_tavoli_service as tavoli_srv
            if chi == OPERATORE:
                tavoli_srv.dividi_se_meta(conn, pid, autore)
            try:
                from app.services.prenotazioni_doppioni_service import doppioni_di
                doppi = doppioni_di(conn, pid)
            except Exception:  # noqa: BLE001
                doppi = []
        finally:
            conn.close()

    # 6 · dopo (fuori dal lucchetto: TheFork, online, avvisi, conferma al cliente)
    from app.services import thefork_invio_service as invio_tf
    thefork = invio_tf.dopo_creazione(pid)   # parte, resta «da mandare», o «sospesa» finché non è confermata
    try:
        from app.services import prenotazioni_online_auto_service as online_auto
        online_auto.ricalcola_presto()        # un posto in meno: il motore ricontrolla l'online
    except Exception:  # noqa: BLE001
        pass
    if chi == CLIENTE:
        from app.services import prenotazioni_sito_service as sito
        sito._avvisa_staff(pid, stato, data, ora[:5], pax, dati.get("nome"), dati.get("cognome"), doppi, nota_auto)
        sito._invia_in_background(pid, {"REQUESTED": "richiesta", "WAITLIST": "attesa"}.get(stato, "conferma"))

    return {
        "id": pid, "cliente_id": cliente_id, "cliente_nuovo": nuovo, "stato": stato, "token": token,
        "data": data, "ora": ora[:5], "pax": pax, "turno": turno, "thefork": thefork,
        "avvisi": [{"codice": m, "testo": DESCRIZIONE.get(m, m)} for m in posto["avvisi"]] if chi == OPERATORE else [],
        "doppioni": doppi,
    }
