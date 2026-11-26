# @version: v1.0 (2026-11-26) — template di risposta ai clienti coi blocchi vivi (mail e WhatsApp corta)
# -*- coding: utf-8 -*-
"""
Template di risposta ai clienti — Modulo: clienti — [core]

Marco (25-26/11/2026): risposte tipo per le mail dei clienti (poi anche WhatsApp). Un
template è un testo con dei BLOCCHI fra graffe che TRGB riempie nel momento in cui lo si usa:

    {nome}               nome del cliente (vuoto: sparisce, «Buongiorno,»)
    {data}               il giorno dell'occasione, per esteso
    {menu}               i piatti del menù della libreria legato al template
    {prezzo}             il prezzo a persona di quel menù, come nei preventivi
    {disponibilita}      UNO dei due paragrafi del template: «c'è posto» o «siamo pieni»,
                         scelto guardando i tavoli del giorno e turno dell'occasione
    {link_prenotazione}  il link scritto in Impostazioni › Template di risposta

Un template può non avere occasione (es. «Gruppi: serve un menù»): allora {data},
{menu}, {prezzo} e {disponibilita} non hanno da dove prendere i dati e, se usati, escono
vuoti con un avviso. Niente è deciso qui dentro: il numero di persone con cui si prova se
c'è posto (`pax_prova`) e il link stanno nei dati, li cambia Marco dalla pagina.

Dati degli altri moduli solo via servizi platform (regola 4): il posto da
`prenotazioni_posto_service`, il menù da `menu_templates_service`, il prezzo da
`preventivi_service.etichetta_prezzo`. `compila` li riceve anche da fuori (test).

    elenco() · leggi(id) · salva(dati, utente, id) · elimina(id)
    impostazioni() · salva_impostazioni(link)
    compila(template, canale, nome)  →  {"oggetto", "testo", "disponibilita", "avvisi"}
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Callable, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn
from app.utils.whatsapp import fill_template

TABELLA = "clienti_risposte_template"
CHIAVE_LINK = "risposte_link_prenotazione"
CANALI = ("mail", "wa")
TURNI = ("pranzo", "cena")
CAMPI = ("nome", "attivo", "occasione_data", "occasione_turno", "pax_prova", "menu_template_id",
         "oggetto", "testo_mail", "testo_wa", "disp_posto", "disp_pieno")

# I blocchi che la pagina propone coi pulsanti «Inserisci». `serve`: cosa deve avere il template.
BLOCCHI: List[Dict[str, Any]] = [
    {"chiave": "nome", "etichetta": "Nome cliente", "serve": None,
     "cosa": "Il nome di chi ha scritto; se manca sparisce («Buongiorno,»)"},
    {"chiave": "data", "etichetta": "Giorno", "serve": "occasione",
     "cosa": "Il giorno dell'occasione per esteso"},
    {"chiave": "menu", "etichetta": "Menù", "serve": "menu",
     "cosa": "I piatti del menù scelto dalla libreria, uno per riga"},
    {"chiave": "prezzo", "etichetta": "Prezzo", "serve": "menu",
     "cosa": "Il prezzo a persona del menù, scritto come nei preventivi"},
    {"chiave": "disponibilita", "etichetta": "Disponibilità", "serve": "occasione",
     "cosa": "Il paragrafo «c'è posto» o «siamo pieni», scelto guardando i tavoli"},
    {"chiave": "link_prenotazione", "etichetta": "Link prenotazione", "serve": None,
     "cosa": "Il link diretto scritto qui sotto nelle impostazioni"},
]
_NOTI = {b["chiave"] for b in BLOCCHI}
_GRAFFA = re.compile(r"\{([a-z_]+)\}")
MOTIVI = {
    "passata": "il giorno è passato",
    "chiuso": "quel turno risulta chiuso",
    "sale_chiuse": "le sale risultano chiuse in quel turno",
    "pieno": "non entra più un tavolo",
    "senza_orari": "quel turno non ha orari prenotabili",
    "data": "la data dell'occasione non è valida",
}


class ErroreTemplate(ValueError):
    """Dati non validi: il router lo trasforma in 400 (404 se finisce con «(404)»)."""


# ─────────────────────────────────────────────────────────── tabella ───
def _tabella_ok(conn) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (TABELLA,)).fetchone() is not None


def _riga(r) -> Dict[str, Any]:
    d = dict(r)
    d["attivo"] = bool(d.get("attivo"))
    return d


def elenco(solo_attivi: bool = False) -> List[Dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return []
        dove = "WHERE attivo = 1" if solo_attivi else ""
        return [_riga(r) for r in conn.execute(f"SELECT * FROM {TABELLA} {dove} ORDER BY attivo DESC, nome COLLATE NOCASE")]
    finally:
        conn.close()


def leggi(template_id: int) -> Optional[Dict[str, Any]]:
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return None
        r = conn.execute(f"SELECT * FROM {TABELLA} WHERE id = ?", (int(template_id),)).fetchone()
        return _riga(r) if r else None
    finally:
        conn.close()


def _testo(v: Any) -> Optional[str]:
    v = (str(v) if v is not None else "").replace("\r\n", "\n").strip()
    return v or None


def pulisci(dati: Dict[str, Any]) -> Dict[str, Any]:
    """Controlla e normalizza i campi di un template (anche per l'anteprima di uno non salvato)."""
    nome = _testo(dati.get("nome"))
    if not nome:
        raise ErroreTemplate("Il template deve avere un nome")
    giorno = _testo(dati.get("occasione_data"))
    turno = (_testo(dati.get("occasione_turno")) or "").lower() or None
    if giorno:
        try:
            date.fromisoformat(giorno)
        except ValueError:
            raise ErroreTemplate("Giorno dell'occasione non valido (AAAA-MM-GG)") from None
        if turno not in TURNI:
            raise ErroreTemplate("Con un giorno serve anche il turno: pranzo o cena")
    else:
        turno = None
    try:
        pax = int(dati.get("pax_prova") or 0)
    except (TypeError, ValueError):
        pax = 0
    if giorno and pax < 1:
        raise ErroreTemplate("Scrivi per quante persone va provato se c'è posto (almeno 1)")
    menu = dati.get("menu_template_id")
    try:
        menu = int(menu) if menu not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        raise ErroreTemplate("Menù della libreria non valido") from None
    return {
        "nome": nome, "attivo": 1 if dati.get("attivo", True) else 0,
        "occasione_data": giorno, "occasione_turno": turno, "pax_prova": pax if pax >= 1 else None,
        "menu_template_id": menu, "oggetto": _testo(dati.get("oggetto")),
        "testo_mail": _testo(dati.get("testo_mail")), "testo_wa": _testo(dati.get("testo_wa")),
        "disp_posto": _testo(dati.get("disp_posto")), "disp_pieno": _testo(dati.get("disp_pieno")),
    }


def salva(dati: Dict[str, Any], utente: str, template_id: Optional[int] = None) -> Dict[str, Any]:
    d = pulisci(dati)
    ora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            raise ErroreTemplate("La tabella dei template non c'è ancora: serve la migrazione 246")
        if d["pax_prova"] is None:   # senza occasione il numero non serve: resta quello che c'era, o quello della tabella
            campi = [c for c in CAMPI if c != "pax_prova"]
        else:
            campi = list(CAMPI)
        if template_id is None:
            cur = conn.execute(
                f"INSERT INTO {TABELLA} ({', '.join(campi)}, creato_da, creato_at, aggiornato_at) "
                f"VALUES ({', '.join('?' * len(campi))}, ?, ?, ?)",
                (*[d[c] for c in campi], utente, ora, ora))
            template_id = cur.lastrowid
        else:
            n = conn.execute(
                f"UPDATE {TABELLA} SET {', '.join(c + ' = ?' for c in campi)}, aggiornato_at = ? WHERE id = ?",
                (*[d[c] for c in campi], ora, int(template_id))).rowcount
            if not n:
                raise ErroreTemplate(f"Template {template_id} non trovato (404)")
        conn.commit()
    finally:
        conn.close()
    return leggi(template_id)


def elimina(template_id: int) -> bool:
    conn = get_clienti_conn()
    try:
        if not _tabella_ok(conn):
            return False
        n = conn.execute(f"DELETE FROM {TABELLA} WHERE id = ?", (int(template_id),)).rowcount
        conn.commit()
        return bool(n)
    finally:
        conn.close()


# ────────────────────────────────────────────────────── impostazioni ───
def impostazioni() -> Dict[str, Any]:
    conn = get_clienti_conn()
    try:
        try:
            r = conn.execute("SELECT valore FROM clienti_impostazioni WHERE chiave = ?", (CHIAVE_LINK,)).fetchone()
        except Exception:
            r = None
        return {"link_prenotazione": ((r["valore"] if r else "") or "").strip()}
    finally:
        conn.close()


def salva_impostazioni(link_prenotazione: Optional[str]) -> Dict[str, Any]:
    link = (link_prenotazione or "").strip()
    if link and not re.match(r"^https?://\S+$", link):
        raise ErroreTemplate("Il link deve cominciare con http:// o https:// e non avere spazi")
    conn = get_clienti_conn()
    try:
        n = conn.execute("UPDATE clienti_impostazioni SET valore = ? WHERE chiave = ?", (link, CHIAVE_LINK)).rowcount
        if not n:
            conn.execute(
                "INSERT INTO clienti_impostazioni (chiave, valore, descrizione) VALUES (?, ?, ?)",
                (CHIAVE_LINK, link, "Link diretto alla prenotazione messo nei template di risposta (blocco {link_prenotazione})"))
        conn.commit()
    finally:
        conn.close()
    return impostazioni()


# ─────────────────────────────────────────────── dati dagli altri moduli ───
def _menu_libreria(menu_id: int) -> Optional[Dict[str, Any]]:
    from app.services import menu_templates_service
    return menu_templates_service.get_template(int(menu_id))


def _prezzo(menu: Dict[str, Any]) -> str:
    from app.services.preventivi_service import etichetta_prezzo
    return etichetta_prezzo(menu)


def _posto(data: str, turno: str, pax: int) -> Dict[str, Any]:
    from app.services import prenotazioni_posto_service
    return prenotazioni_posto_service.c_e_posto(data, turno, pax)


def _giorno_esteso(data: str) -> str:
    from app.services.prenotazioni_sito_service import data_estesa
    return data_estesa(data, "it")


def righe_menu(menu: Dict[str, Any]) -> str:
    """I piatti uno per riga, nell'ordine della libreria; la descrizione, se c'è, dopo i due punti."""
    out = []
    for r in menu.get("righe") or []:
        nome = (r.get("name") or "").strip()
        if not nome:
            continue
        desc = (r.get("description") or "").strip()
        out.append(f"{nome}: {desc}" if desc else nome)
    return "\n".join(out)


def _frase_posto(st: Dict[str, Any]) -> str:
    try:
        d = date.fromisoformat(st["data"])
        quando = f"{d.day:02d}/{d.month:02d} {st['turno']}"
    except Exception:
        quando = f"{st.get('data')} {st.get('turno')}"
    conti = ""
    if st.get("coperti") is not None:
        conti = f": {st['coperti']} coperti" + (f" su {st['capienza']}" if st.get("capienza") else "")
    if st.get("posto") is True:
        return f"{quando}{conti} · c'è posto (entra un tavolo da {st['pax']})"
    if st.get("posto") is False:
        return f"{quando}{conti} · niente posto: {MOTIVI.get(st.get('motivo'), st.get('motivo') or 'pieno')}"
    return f"{quando} · non riesco a dire se c'è posto: {MOTIVI.get(st.get('motivo'), st.get('motivo') or 'dati mancanti')}"


# ───────────────────────────────────────────────────────── compila ───
def compila(template: Dict[str, Any], canale: str = "mail", nome: Optional[str] = None,
            posto_fn: Optional[Callable[[str, str, int], Dict[str, Any]]] = None,
            menu_fn: Optional[Callable[[int], Optional[Dict[str, Any]]]] = None,
            prezzo_fn: Optional[Callable[[Dict[str, Any]], str]] = None,
            link: Optional[str] = None) -> Dict[str, Any]:
    """Riempie i blocchi adesso. Non scrive niente e non manda niente."""
    if canale not in CANALI:
        raise ErroreTemplate("canale: mail o wa")
    avvisi: List[str] = []
    base = (template.get("testo_mail") if canale == "mail" else template.get("testo_wa")) or ""
    if not base.strip():
        avvisi.append("Questo template non ha il testo per " + ("la mail" if canale == "mail" else "WhatsApp"))
    oggetto = (template.get("oggetto") or "") if canale == "mail" else ""
    posto_txt, pieno_txt = template.get("disp_posto") or "", template.get("disp_pieno") or ""
    usati = set(_GRAFFA.findall(base + oggetto + posto_txt + pieno_txt)) & _NOTI

    giorno, turno = template.get("occasione_data"), template.get("occasione_turno")
    ha_occasione = bool(giorno and turno)
    valori: Dict[str, str] = {k: "" for k in _NOTI}

    valori["nome"] = (nome or "").strip()

    if "data" in usati:
        if ha_occasione:
            try:
                valori["data"] = _giorno_esteso(giorno)
            except Exception:
                avvisi.append("Giorno dell'occasione non leggibile")
        else:
            avvisi.append("Il blocco Giorno è vuoto: il template non ha un'occasione")

    if usati & {"menu", "prezzo"}:
        menu = None
        if template.get("menu_template_id"):
            menu = (menu_fn or _menu_libreria)(int(template["menu_template_id"]))
        if not menu:
            avvisi.append("I blocchi Menù e Prezzo sono vuoti: scegli un menù dalla libreria nel template")
        else:
            valori["menu"] = righe_menu(menu)
            if "menu" in usati and not valori["menu"]:
                avvisi.append(f"Il menù «{menu.get('nome')}» non ha piatti in libreria")
            valori["prezzo"] = (prezzo_fn or _prezzo)(menu)

    disponibilita = None
    if "disponibilita" in usati:
        if not ha_occasione:
            avvisi.append("Il blocco Disponibilità è vuoto: il template non ha un'occasione")
        else:
            disponibilita = dict((posto_fn or _posto)(giorno, turno, int(template.get("pax_prova") or 1)))
            disponibilita["frase"] = _frase_posto(disponibilita)
            if disponibilita.get("posto") is True:
                valori["disponibilita"] = posto_txt
                if not posto_txt:
                    avvisi.append("C'è posto, ma il paragrafo «Se c'è posto» è vuoto")
            elif disponibilita.get("posto") is False:
                valori["disponibilita"] = pieno_txt
                if not pieno_txt:
                    avvisi.append("Niente posto, ma il paragrafo «Se siamo pieni» è vuoto")
            else:
                avvisi.append("Non sono riuscito a controllare i tavoli: il paragrafo sulla disponibilità non c'è, scrivilo a mano")

    scelto = valori["disponibilita"]
    if "link_prenotazione" in set(_GRAFFA.findall(base + scelto)):
        valori["link_prenotazione"] = (link if link is not None else impostazioni()["link_prenotazione"]) or ""
        if not valori["link_prenotazione"]:
            avvisi.append("Manca il link di prenotazione: scrivilo in Clienti › Impostazioni › Template di risposta")

    def riempi(t: str) -> str:
        if not valori["nome"]:
            t = t.replace(" {nome}", "")
        # il paragrafo scelto può avere a sua volta dei blocchi (il link): due passate
        t = fill_template(t, disponibilita=valori["disponibilita"])
        t = fill_template(t, **{k: v for k, v in valori.items() if k != "disponibilita"})
        return t

    testo = re.sub(r"\n{3,}", "\n\n", riempi(base)).strip()
    oggetto = " ".join(riempi(oggetto).split())
    ignoti = sorted(set(_GRAFFA.findall(testo + oggetto)))
    if ignoti:
        avvisi.append("Blocchi che non conosco, rimasti nel testo: " + ", ".join("{" + i + "}" for i in ignoti))
    return {"canale": canale, "oggetto": oggetto or None, "testo": testo,
            "disponibilita": disponibilita, "avvisi": avvisi}


def compila_salvato(template_id: int, canale: str = "mail", nome: Optional[str] = None) -> Dict[str, Any]:
    t = leggi(template_id)
    if not t:
        raise ErroreTemplate(f"Template {template_id} non trovato (404)")
    out = compila(t, canale=canale, nome=nome)
    out["template"] = {"id": t["id"], "nome": t["nome"]}
    return out
