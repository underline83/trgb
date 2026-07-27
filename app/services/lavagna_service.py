# ============================================================
# FILE: app/services/lavagna_service.py
# La Lavagna — briefing di servizio per la Home (platform)
# ============================================================

# @version: v1.0-lavagna
# -*- coding: utf-8 -*-
"""
La Lavagna — servizio platform [core]

Sostituisce il widget "Bacheca" della Home, che restava vuoto perche' era
l'unico blocco che richiedeva lavoro umano per riempirsi.

Tre strati in una card sola:
  1. IL SERVIZIO  — si compila da solo leggendo dati che TRGB ha gia'
                    (coperti, tavoli con allergie/occasioni/gruppi,
                     selezioni del giorno, chi e' in turno, task aperti)
  2. LA NOTA      — una riga scritta dalla Home, vive un turno e sparisce
                    (tabella comunicazioni, tipo='nota_servizio')
  3. GLI EVENTI   — cosa e' successo oggi (prenotazioni entrate, disdette,
                     alert dell'engine M.F)

REGOLE MODULARI (CLAUDE.md §2)
Questo e' un servizio platform, non un modulo: aggrega dati di clienti,
dipendenti, tasks e notifiche. Legge SOLO tramite i model (`app/models/*`),
mai importando router di altri moduli. Le selezioni del giorno e gli alert
NON vengono ricalcolati qui: li inietta il chiamante (dashboard_router), che
li ha gia' in mano — cosi' la dipendenza resta router → service e mai il
contrario.

Ogni query e' difensiva: se un DB non risponde il blocco relativo sparisce
dalla Lavagna, ma la Home non si rompe mai.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn
from app.models.dipendenti_db import get_dipendenti_conn
from app.models.tasks_db import get_tasks_conn
from app.services.notifiche_service import get_nota_servizio

logger = logging.getLogger("trgb.lavagna")

# Soglia oraria pranzo/cena, coerente con dashboard_router._prenotazioni_oggi
SOGLIA_TURNO = "15:00"

# Prenotazioni che "contano" per il servizio (stessa lista della dashboard)
STATI_ATTIVI = ("RECORDED", "SEATED", "LEFT", "ARRIVED", "BILL")

# Sopra questo numero di coperti il tavolo entra da solo nel briefing
SOGLIA_GRUPPO = 8

GIORNI_IT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]
MESI_IT = ["gen", "feb", "mar", "apr", "mag", "giu",
           "lug", "ago", "set", "ott", "nov", "dic"]

# Occasioni: il campo arriva sia da TheFork (inglese) sia a mano (italiano)
OCCASIONI_LABEL = {
    "birthday": "Compleanno",
    "anniversary": "Anniversario",
    "celebration": "Festeggiamento",
    "business": "Cena di lavoro",
}


# ─────────────────────────────────────────────────────────
# Nome del locale (per l'intestazione del testo WhatsApp)
# ─────────────────────────────────────────────────────────

_NOME_LOCALE_CACHE: Optional[str] = None


def nome_locale() -> str:
    """
    Legge `locali/<TRGB_LOCALE>/locale.json` → campo `nome`.
    Serve solo per intestare il testo da incollare in WhatsApp: se il file
    manca si torna stringa vuota e l'intestazione sparisce, niente crash.
    Letto una volta sola: il nome del locale non cambia a runtime.
    """
    global _NOME_LOCALE_CACHE
    if _NOME_LOCALE_CACHE is not None:
        return _NOME_LOCALE_CACHE
    nome = ""
    try:
        import json
        import os
        from pathlib import Path
        locale_id = os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"
        f = Path(__file__).resolve().parents[2] / "locali" / locale_id / "locale.json"
        if f.exists():
            nome = (json.loads(f.read_text(encoding="utf-8")).get("nome") or "").strip()
    except Exception as e:
        logger.warning(f"Lavagna: nome locale non leggibile: {e}")
    _NOME_LOCALE_CACHE = nome
    return nome


# ─────────────────────────────────────────────────────────
# Helper generici
# ─────────────────────────────────────────────────────────

def turno_corrente(ora: Optional[str] = None) -> str:
    """'pranzo' fino alle 15:00, poi 'cena'."""
    if ora is None:
        ora = datetime.now().strftime("%H:%M")
    return "pranzo" if ora < SOGLIA_TURNO else "cena"


def _data_label(d: date, turno: str) -> str:
    return f"{GIORNI_IT[d.weekday()]} {d.day} {MESI_IT[d.month - 1]} · {turno}"


def _plur(n: int, uno: str, molti: str) -> str:
    return uno if n == 1 else molti


def _nome_occasione(raw: str) -> str:
    if not raw:
        return ""
    return OCCASIONI_LABEL.get(raw.strip().lower(), raw.strip().capitalize())


# ─────────────────────────────────────────────────────────
# STRATO 1 — il servizio
# ─────────────────────────────────────────────────────────

def _prenotazioni_turno(oggi: str, turno: str) -> Dict[str, Any]:
    """Prenotazioni attive del turno richiesto, con i tavoli da segnalare."""
    vuoto = {"pax": 0, "tavoli": 0, "picco": None, "notevoli": []}
    try:
        conn = get_clienti_conn()
        rows = conn.execute(f"""
            SELECT p.ora_pasto, p.pax, p.nota_ristorante, p.allergie_segnalate,
                   p.occasione, p.seggioloni,
                   COALESCE(c.nome, p.nome_ospite, '')     AS nome,
                   COALESCE(c.cognome, p.cognome_ospite, '') AS cognome
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.data_pasto = ?
              AND p.stato IN ({','.join('?' * len(STATI_ATTIVI))})
            ORDER BY p.ora_pasto, p.id
        """, (oggi, *STATI_ATTIVI)).fetchall()
        conn.close()
    except Exception as e:
        logger.warning(f"Lavagna: prenotazioni non leggibili: {e}")
        return vuoto

    pax = 0
    tavoli = 0
    per_ora: Dict[str, int] = {}
    notevoli: List[Dict[str, Any]] = []

    for r in rows:
        ora = (r["ora_pasto"] or "12:00")[:5]
        if ("pranzo" if ora < SOGLIA_TURNO else "cena") != turno:
            continue

        n = r["pax"] or 0
        pax += n
        tavoli += 1
        per_ora[ora] = per_ora.get(ora, 0) + n

        nome = f'{r["nome"]} {r["cognome"]}'.strip() or "Senza nome"
        allergie = (r["allergie_segnalate"] or "").strip()
        nota = (r["nota_ristorante"] or "").strip()
        occasione = _nome_occasione(r["occasione"] or "")

        if allergie:
            notevoli.append({
                "icona": "⚠️",
                "titolo": f"{ora} · {nome}, {n} pax",
                "dettaglio": allergie,
                "chip": "allergie",
                "tono": "red",
                "peso": 0,
            })
        elif occasione:
            notevoli.append({
                "icona": "🎂",
                "titolo": f"{ora} · {nome}, {n} pax",
                "dettaglio": f"{occasione}{' — ' + nota if nota else ''}",
                "chip": "occasione",
                "tono": "ambra",
                "peso": 1,
            })
        elif n >= SOGLIA_GRUPPO:
            notevoli.append({
                "icona": "👨‍👩‍👧",
                "titolo": f"{ora} · {nome}, {n} pax",
                "dettaglio": nota or "Tavolo grande",
                "chip": "gruppo",
                "tono": "ambra",
                "peso": 2,
            })
        elif nota:
            notevoli.append({
                "icona": "📝",
                "titolo": f"{ora} · {nome}, {n} pax",
                "dettaglio": nota,
                "chip": "nota",
                "tono": "neutro",
                "peso": 3,
            })

    notevoli.sort(key=lambda x: (x["peso"], x["titolo"]))
    for x in notevoli:
        x.pop("peso", None)
        # Le note libere possono essere lunghe e contenere dettagli interni:
        # in una card da colonna, e ancor piu' in un messaggio incollato in
        # chat, tenerle corte e' meglio.
        if len(x["dettaglio"]) > 90:
            x["dettaglio"] = x["dettaglio"][:87].rstrip() + "…"

    return {"pax": pax, "tavoli": tavoli,
            "picco": _fascia_picco(per_ora), "notevoli": notevoli}


def _fascia_picco(per_ora: Dict[str, int]) -> Optional[str]:
    """
    La fascia da un'ora che concentra piu' coperti, come "19:30-20:30".
    Meglio di un orario secco tipo "19:55": allo staff serve sapere quando
    arriva l'onda, non l'orario esatto della prenotazione piu' grossa.
    Ritorna None se le prenotazioni stanno tutte dentro la stessa mezz'ora
    (in quel caso la fascia non aggiunge informazione).
    """
    if not per_ora:
        return None

    def _min(hhmm: str) -> int:
        h, m = hhmm.split(":")[:2]
        return int(h) * 60 + int(m)

    orari = sorted(per_ora, key=_min)
    if _min(orari[-1]) - _min(orari[0]) < 30:
        return None

    best_start, best_pax = None, -1
    for o in orari:
        inizio = _min(o)
        tot = sum(n for k, n in per_ora.items() if inizio <= _min(k) < inizio + 60)
        if tot > best_pax:
            best_pax, best_start = tot, inizio

    if best_start is None:
        return None
    fine = best_start + 60
    return f"{best_start // 60:02d}:{best_start % 60:02d}-{(fine // 60) % 24:02d}:{fine % 60:02d}"


def _staff_in_turno(oggi: str, turno: str) -> List[Dict[str, str]]:
    """Chi lavora oggi in questo turno, raggruppato per reparto."""
    try:
        conn = get_dipendenti_conn()
        rows = conn.execute("""
            SELECT t.ora_inizio,
                   COALESCE(NULLIF(d.nickname, ''), d.nome) AS nome,
                   COALESCE(r.nome, '') AS reparto
            FROM turni_calendario t
            JOIN dipendenti d ON d.id = t.dipendente_id
            LEFT JOIN reparti r ON r.id = d.reparto_id
            WHERE t.data = ?
              AND COALESCE(t.stato, 'CONFERMATO') = 'CONFERMATO'
            ORDER BY r.ordine, d.nome
        """, (oggi,)).fetchall()
        conn.close()
    except Exception as e:
        logger.warning(f"Lavagna: turni non leggibili: {e}")
        return []

    per_reparto: Dict[str, List[str]] = {}
    for r in rows:
        ora = (r["ora_inizio"] or "12:00")[:5]
        if ("pranzo" if ora < SOGLIA_TURNO else "cena") != turno:
            continue
        rep = r["reparto"] or "Staff"
        nome = (r["nome"] or "").strip()
        if nome and nome not in per_reparto.setdefault(rep, []):
            per_reparto[rep].append(nome)

    return [{"reparto": k, "persone": ", ".join(v)} for k, v in per_reparto.items() if v]


def _task_aperti(oggi: str, turno: str) -> Dict[str, Any]:
    """Task singoli in scadenza oggi + checklist del turno non chiuse."""
    titoli: List[str] = []
    try:
        conn = get_tasks_conn()
        for r in conn.execute("""
            SELECT titolo FROM task_singolo
            WHERE data_scadenza = ? AND stato IN ('APERTO', 'SCADUTO')
            ORDER BY ora_scadenza, id LIMIT 6
        """, (oggi,)).fetchall():
            if r["titolo"]:
                titoli.append(r["titolo"])

        for r in conn.execute("""
            SELECT ct.nome AS titolo
            FROM checklist_instance ci
            JOIN checklist_template ct ON ct.id = ci.template_id
            WHERE ci.data_riferimento = ?
              AND COALESCE(ci.stato, '') NOT IN ('COMPLETATA', 'SALTATA')
              AND (ci.turno IS NULL OR ci.turno = '' OR LOWER(ci.turno) = ?)
            ORDER BY ci.scadenza_at, ci.id LIMIT 6
        """, (oggi, turno)).fetchall():
            if r["titolo"] and r["titolo"] not in titoli:
                titoli.append(r["titolo"])
        conn.close()
    except Exception as e:
        logger.warning(f"Lavagna: task non leggibili: {e}")
        return {"count": 0, "titoli": []}

    return {"count": len(titoli), "titoli": titoli[:4]}


def _lede(pren: Dict[str, Any], turno: str) -> str:
    """La frase di apertura, in italiano, non una tabella di numeri."""
    pax, tavoli, picco = pren["pax"], pren["tavoli"], pren["picco"]
    if pax == 0:
        return f"Nessuna prenotazione per {'il pranzo' if turno == 'pranzo' else 'la cena'}."
    frase = (f"{pax} copert{_plur(pax, 'o', 'i')} "
             f"su {tavoli} tavol{_plur(tavoli, 'o', 'i')}.")
    if picco and tavoli > 1:
        da, a = picco.split("-")
        frase += f" Il grosso tra le {da} e le {a}."
    return frase


# ─────────────────────────────────────────────────────────
# STRATO 3 — gli eventi di oggi
# ─────────────────────────────────────────────────────────

def _eventi(oggi: str, alerts: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    """Cosa e' successo oggi che vale la pena sapere."""
    eventi: List[Dict[str, str]] = []

    try:
        conn = get_clienti_conn()

        # Prenotazioni entrate oggi (per qualsiasi data futura)
        for r in conn.execute(f"""
            SELECT p.created_at, p.data_pasto, p.ora_pasto, p.pax,
                   COALESCE(c.cognome, p.cognome_ospite, c.nome, p.nome_ospite, '') AS chi
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE DATE(p.created_at) = ?
              AND p.stato IN ({','.join('?' * len(STATI_ATTIVI))})
            ORDER BY p.created_at DESC LIMIT 5
        """, (oggi, *STATI_ATTIVI)).fetchall():
            quando = "oggi" if r["data_pasto"] == oggi else _quando_breve(r["data_pasto"])
            eventi.append({
                "ora": (r["created_at"] or "")[11:16],
                "icona": "📅",
                "testo": f'Prenotazione {quando} — {r["chi"] or "senza nome"}, {r["pax"] or 0} pax',
            })

        # Disdette di oggi
        for r in conn.execute("""
            SELECT p.updated_at, p.ora_pasto, p.pax,
                   COALESCE(c.cognome, p.cognome_ospite, c.nome, p.nome_ospite, '') AS chi
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.data_pasto = ?
              AND p.stato IN ('CANCELED', 'NO_SHOW', 'REFUSED')
              AND DATE(COALESCE(p.updated_at, p.created_at)) = ?
            ORDER BY p.updated_at DESC LIMIT 4
        """, (oggi, oggi)).fetchall():
            eventi.append({
                "ora": (r["updated_at"] or "")[11:16],
                "icona": "❌",
                "testo": f'Disdetta {(r["ora_pasto"] or "")[:5]} — {r["chi"] or "senza nome"}, {r["pax"] or 0} pax',
            })
        conn.close()
    except Exception as e:
        logger.warning(f"Lavagna: eventi prenotazioni non leggibili: {e}")

    # Alert dell'engine M.F, iniettati dal chiamante
    for a in (alerts or []):
        testo = a.get("testo") if isinstance(a, dict) else getattr(a, "testo", None)
        if testo:
            eventi.append({"ora": "", "icona": "🔔", "testo": testo})

    eventi.sort(key=lambda e: e["ora"] or "00:00", reverse=True)
    return eventi[:6]


def _quando_breve(iso: Optional[str]) -> str:
    if not iso:
        return ""
    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return iso
    return f"{GIORNI_IT[d.weekday()]} {d.day}/{d.month}"


# ─────────────────────────────────────────────────────────
# Testo per WhatsApp
# ─────────────────────────────────────────────────────────

def _testo_whatsapp(lav: Dict[str, Any], intestazione: str = "") -> str:
    """
    Testo pronto da incollare nel gruppo dello staff.
    NON e' un invio: i link wa.me del mattone M.C non funzionano sui gruppi,
    quindi il frontend si limita a copiare negli appunti.
    """
    testa = f"*{intestazione} — " if intestazione else "*"
    righe = [f"{testa}{lav['data_label']}*", "", lav["lede"]]

    if lav["notevoli"]:
        righe.append("")
        for n in lav["notevoli"]:
            righe.append(f'{n["icona"]} {n["titolo"]} — {n["dettaglio"]}')

    if lav["selezioni"]:
        vals = " · ".join(s["valore"] for s in lav["selezioni"] if s.get("valore"))
        if vals:
            righe += ["", f"*Selezioni:* {vals}"]

    if lav["staff"]:
        righe.append("*In turno:* " + " · ".join(
            f'{s["reparto"]}: {s["persone"]}' for s in lav["staff"]))

    if lav.get("nota"):
        righe += ["", f'📌 {lav["nota"]["messaggio"]}']

    return "\n".join(righe)


# ─────────────────────────────────────────────────────────
# Composizione
# ─────────────────────────────────────────────────────────

def build_lavagna(
    selezioni: Optional[Dict[str, Any]] = None,
    alerts: Optional[List[Any]] = None,
    nome: Optional[str] = None,
    oggi: Optional[str] = None,
    turno: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compone la Lavagna per il turno corrente.

    `selezioni` e `alerts` arrivano dal chiamante (dashboard_router) che li ha
    gia' calcolati: vedi nota sulle regole modulari in cima al file.
    """
    d = date.fromisoformat(oggi) if oggi else date.today()
    oggi_str = d.isoformat()
    t = turno or turno_corrente()

    pren = _prenotazioni_turno(oggi_str, t)
    staff = _staff_in_turno(oggi_str, t)
    task = _task_aperti(oggi_str, t)

    try:
        nota = get_nota_servizio(oggi_str, t)
    except Exception as e:
        logger.warning(f"Lavagna: nota di servizio non leggibile: {e}")
        nota = None

    lav: Dict[str, Any] = {
        "data": oggi_str,
        "turno": t,
        "data_label": _data_label(d, t),
        "lede": _lede(pren, t),
        "pax": pren["pax"],
        "tavoli": pren["tavoli"],
        "notevoli": pren["notevoli"][:4],
        "selezioni": _selezioni_flat(selezioni),
        "staff": staff,
        "task": task,
        "nota": nota,
        "eventi": _eventi(oggi_str, _alerts_as_dicts(alerts)),
    }
    lav["whatsapp"] = _testo_whatsapp(lav, nome if nome is not None else nome_locale())
    return lav


def _selezioni_flat(selezioni: Optional[Any]) -> List[Dict[str, str]]:
    """
    Appiattisce il widget Selezioni in coppie label/valore per il briefing.

    Forma in ingresso (dashboard_router.SelezioniWidget):
        { macellaio: { categorie: [ { nome, tagli: [ {nome, ...} ] } ] }, ... }
    In uscita: [ {label: "Carne", valore: "Fassona, Scottona"} ]

    Preferisce i nomi dei tagli (dicono qualcosa allo staff); se non ci sono
    ripiega sui nomi delle categorie. Accetta modello Pydantic, dict o None.
    """
    if not selezioni:
        return []
    if hasattr(selezioni, "model_dump"):
        selezioni = selezioni.model_dump()
    elif hasattr(selezioni, "dict"):
        selezioni = selezioni.dict()
    if not isinstance(selezioni, dict):
        return []

    etichette = [("macellaio", "Carne"), ("pescato", "Pescato"),
                 ("salumi", "Salumi"), ("formaggi", "Formaggi")]
    out: List[Dict[str, str]] = []

    for chiave, label in etichette:
        blocco = selezioni.get(chiave) or {}
        if hasattr(blocco, "model_dump"):
            blocco = blocco.model_dump()
        if not isinstance(blocco, dict):
            continue

        categorie = blocco.get("categorie") or []
        nomi_tagli: List[str] = []
        nomi_cat: List[str] = []

        for cat in categorie:
            if hasattr(cat, "model_dump"):
                cat = cat.model_dump()
            if not isinstance(cat, dict):
                continue
            if cat.get("nome"):
                nomi_cat.append(str(cat["nome"]).strip())
            for taglio in (cat.get("tagli") or []):
                if hasattr(taglio, "model_dump"):
                    taglio = taglio.model_dump()
                nome = (taglio.get("nome") if isinstance(taglio, dict) else str(taglio)) or ""
                nome = nome.strip()
                if nome and nome not in nomi_tagli:
                    nomi_tagli.append(nome)

        scelti = nomi_tagli[:2] or nomi_cat[:2]
        if scelti:
            out.append({"label": label, "valore": ", ".join(scelti)})

    return out


def _alerts_as_dicts(alerts: Optional[List[Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for a in (alerts or []):
        if isinstance(a, dict):
            out.append(a)
        elif hasattr(a, "model_dump"):
            out.append(a.model_dump())
        elif hasattr(a, "dict"):
            out.append(a.dict())
    return out
