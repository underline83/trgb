# @version: v1.0 (2026-11-24) — catalogo di vendita per la Comanda
# -*- coding: utf-8 -*-
"""
Catalogo di vendita — Modulo: platform — [core]

Tutto quello che si può battere in sala, letto da dove TRGB lo tiene già.
Nessuna copia: ogni volta si rilegge, così un prezzo cambiato in carta o un
vino finito si vedono subito. Sola lettura.

Fonti (ognuna in un modulo diverso: per questo è un servizio platform,
regola 4 dell'architettura modulare):
    carta del momento    menu_editions stato «in_carta» + menu_dish_publications visibili
                         + percorsi degustazione (menu_tasting_paths)          → ricette / menu_carta
    piatti del giorno    piatti_giorno attivi e non archiviati                  → ricette
    pranzo               Menù Business della settimana (pranzo_menu + righe)    → menu_carta (pranzo)
    vini                 vini_bottiglie con IPRATICO=1, in giacenza, a bottiglia
                         e a calice (VENDITA_CALICE)                            → vini
    bevande              voci attive delle sezioni Carta Bevande sincronizzate  → vini (carta bevande)
    menu template        template dei preventivi con «iPratico» acceso          → clienti (preventivi)

Codici (lo SKU di iPratico dove esiste già, così Cassa e statistiche si parlano):
    0123   vino a bottiglia (vini_bottiglie.id)     0123C  lo stesso vino a calice
    B0045  voce Carta Bevande                        M0012 / M0012V  menu template (con vino)
    C0031  piatto della carta (pubblicazione)        C0031P / C0031G  porzione piccola / grande
    D0006  percorso degustazione                     G0010  piatto del giorno
    L2     Menù Business a 2 portate                 LP0145 piatto del pranzo della settimana (0 €)

Funzione: catalogo() → {gruppi, articoli, avvisi, carta, pranzo}. Una fonte
che non si legge non ferma le altre: finisce in `avvisi`.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

# Etichette e ordine delle sezioni della carta: stesse chiavi di
# menu_carta_router.SEZIONI_VALIDE, nomi corti come le categorie di cassa.
SEZIONI_CARTA = {
    "antipasti": "Antipasti",
    "paste_risi_zuppe": "Primi",
    "piatti_del_giorno": "Piatti del giorno",
    "secondi": "Secondi",
    "contorni": "Contorni",
    "dolci": "Dolci",
    "degustazioni": "Degustazioni",
    "bambini": "Bambini",
    "servizio": "Servizio",
}
# Ordine dei gruppi in sala; i gruppi delle bevande seguono l'ordine delle sezioni.
ORDINE_GRUPPI = [
    "Antipasti", "Primi", "Piatti del giorno", "Secondi", "Contorni", "Dolci",
    "Bambini", "Degustazioni", "Menu", "Pranzo", "Servizio", "Calici", "Bottiglie",
]
FAMIGLIA_GRUPPO = {"Servizio": "servizio", "Calici": "beverage", "Bottiglie": "beverage"}


def _num(v) -> Optional[float]:
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def _euro(v: Optional[float]) -> str:
    if v is None:
        return ""
    return f"{v:.2f}".replace(".", ",").replace(",00", "")


def _art(codice: str, tipo: str, nome: str, gruppo: str, famiglia: str,
         prezzo: Optional[float], dettaglio: str = "", fonte_id: Any = None,
         prezzo_libero: bool = False) -> Dict[str, Any]:
    return {
        "codice": codice, "tipo": tipo, "nome": " ".join(str(nome or "").split()),
        "gruppo": gruppo, "famiglia": famiglia,
        "prezzo": round(prezzo, 2) if prezzo is not None else None,
        "prezzo_libero": bool(prezzo_libero or prezzo is None),
        "dettaglio": dettaglio or "", "fonte_id": fonte_id,
    }


# ── cucina: carta, degustazioni, piatti del giorno, pranzo ─────────

def _carta(out: List[Dict[str, Any]], info: Dict[str, Any]) -> None:
    from app.models.foodcost_db import get_foodcost_connection
    conn = get_foodcost_connection()
    try:
        ed = conn.execute(
            "SELECT id, nome FROM menu_editions WHERE stato = 'in_carta' "
            "ORDER BY data_inizio DESC, id DESC LIMIT 1"
        ).fetchone()
        if not ed:
            info["carta"] = None
            return
        info["carta"] = ed["nome"]
        righe = conn.execute("""
            SELECT p.id, p.sezione, p.sort_order, p.prezzo_singolo, p.prezzo_min, p.prezzo_max,
                   p.prezzo_piccolo, p.prezzo_grande, p.prezzo_label,
                   COALESCE(NULLIF(p.titolo_override, ''), NULLIF(r.menu_name, ''), r.name) AS nome
              FROM menu_dish_publications p
              LEFT JOIN recipes r ON r.id = p.recipe_id
             WHERE p.edition_id = ? AND COALESCE(p.is_visible, 1) = 1
             ORDER BY p.sezione, p.sort_order, p.id
        """, (ed["id"],)).fetchall()
        for r in righe:
            gruppo = SEZIONI_CARTA.get(r["sezione"], (r["sezione"] or "Carta").capitalize())
            fam = FAMIGLIA_GRUPPO.get(gruppo, "food")
            cod = f"C{r['id']:04d}"
            singolo, piccolo, grande = _num(r["prezzo_singolo"]), _num(r["prezzo_piccolo"]), _num(r["prezzo_grande"])
            if singolo is not None:
                out.append(_art(cod, "piatto_carta", r["nome"], gruppo, fam, singolo, fonte_id=r["id"]))
            elif piccolo is not None or grande is not None:
                if piccolo is not None:
                    out.append(_art(cod + "P", "piatto_carta", f"{r['nome']} (piccolo)", gruppo, fam,
                                    piccolo, fonte_id=r["id"]))
                if grande is not None:
                    out.append(_art(cod + "G", "piatto_carta", f"{r['nome']} (grande)", gruppo, fam,
                                    grande, fonte_id=r["id"]))
            else:
                lo, hi = _num(r["prezzo_min"]), _num(r["prezzo_max"])
                det = r["prezzo_label"] or (f"da {_euro(lo)} a {_euro(hi)} €" if lo and hi else "prezzo a voce")
                out.append(_art(cod, "piatto_carta", r["nome"], gruppo, fam, None, det, r["id"], True))

        for t in conn.execute(
            "SELECT id, nome, prezzo_persona FROM menu_tasting_paths "
            "WHERE edition_id = ? AND COALESCE(is_visible, 1) = 1 ORDER BY sort_order, id", (ed["id"],)
        ).fetchall():
            out.append(_art(f"D{t['id']:04d}", "degustazione", f"Degustazione «{t['nome']}»",
                            "Degustazioni", "food", _num(t["prezzo_persona"]), "a persona", t["id"]))
    finally:
        conn.close()


def _piatti_giorno(out: List[Dict[str, Any]]) -> None:
    from app.models.foodcost_db import get_foodcost_connection
    conn = get_foodcost_connection()
    try:
        for p in conn.execute(
            "SELECT id, nome, categoria, prezzo_euro FROM piatti_giorno "
            "WHERE attivo = 1 AND archiviato_at IS NULL ORDER BY categoria, id"
        ).fetchall():
            out.append(_art(f"G{p['id']:04d}", "piatto_giorno", p["nome"], "Piatti del giorno", "food",
                            _num(p["prezzo_euro"]), p["categoria"] or "", p["id"]))
    finally:
        conn.close()


def _pranzo(out: List[Dict[str, Any]], info: Dict[str, Any], oggi: date) -> None:
    from app.models.foodcost_db import get_foodcost_connection
    lunedi = (oggi - timedelta(days=oggi.weekday())).isoformat()
    conn = get_foodcost_connection()
    try:
        cfg = conn.execute("SELECT * FROM pranzo_settings ORDER BY id LIMIT 1").fetchone()
        titolo = (cfg["titolo_business"] if cfg and cfg["titolo_business"] else "Menù Business")
        menu = conn.execute(
            "SELECT * FROM pranzo_menu WHERE settimana_inizio = ? ORDER BY id DESC LIMIT 1", (lunedi,)
        ).fetchone()
        prezzi = []
        for n in (1, 2, 3):
            v = _num(menu[f"prezzo_{n}"]) if menu else None
            if v is None and cfg:
                v = _num(cfg[f"prezzo_{n}_default"])
            prezzi.append(v)
        for n, v in enumerate(prezzi, start=1):
            if v is not None:
                out.append(_art(f"L{n}", "pranzo_menu", f"{titolo} {n} {'portata' if n == 1 else 'portate'}",
                                "Pranzo", "food", v, "il piatto si batte a parte, a 0 €"))
        info["pranzo"] = lunedi if menu else None
        if menu:
            for r in conn.execute(
                "SELECT id, nome, categoria FROM pranzo_menu_righe WHERE menu_id = ? ORDER BY ordine, id",
                (menu["id"],)
            ).fetchall():
                out.append(_art(f"LP{r['id']:04d}", "pranzo_piatto", r["nome"], "Pranzo", "food", 0.0,
                                r["categoria"] or "", r["id"]))
    finally:
        conn.close()


# ── sala: vini, bevande, menu template ─────────────────────────────

def _vini(out: List[Dict[str, Any]]) -> None:
    from app.models.vini_magazzino_db import get_magazzino_connection
    conn = get_magazzino_connection()
    try:
        righe = conn.execute("""
            SELECT id, TIPOLOGIA, DESCRIZIONE, PRODUTTORE, ANNATA, FORMATO,
                   PREZZO_CARTA, PREZZO_CALICE, VENDITA_CALICE, BOTTIGLIA_APERTA, QTA_TOTALE
              FROM vini_bottiglie
             WHERE COALESCE(IPRATICO, 0) = 1
             ORDER BY TIPOLOGIA, DESCRIZIONE, ANNATA
        """).fetchall()
    finally:
        conn.close()
    for v in righe:
        nome = " ".join(x for x in (v["DESCRIZIONE"], v["PRODUTTORE"], v["ANNATA"]) if x)
        det = " · ".join(x for x in (v["TIPOLOGIA"], v["FORMATO"]) if x)
        qta = v["QTA_TOTALE"] or 0
        bott = _num(v["PREZZO_CARTA"])
        if qta > 0 and bott is not None:
            out.append(_art(f"{v['id']:04d}", "vino_bottiglia", nome, "Bottiglie", "beverage", bott,
                            f"{det} · {qta} bt" if det else f"{qta} bt", v["id"]))
        calice = _num(v["PREZZO_CALICE"])
        if v["VENDITA_CALICE"] and calice is not None and (qta > 0 or v["BOTTIGLIA_APERTA"]):
            out.append(_art(f"{v['id']:04d}C", "vino_calice", f"Calice {nome}", "Calici", "beverage",
                            calice, det, v["id"]))


def _bevande(out: List[Dict[str, Any]], ordine_extra: List[str]) -> None:
    from app.models.bevande_db import get_bevande_conn
    from app.services import ipratico_bevande_service as bev
    sezioni = {s["key"]: s for s in bev.carica_sezioni()}
    conn = get_bevande_conn()
    try:
        voci = conn.execute(
            "SELECT id, sezione_key, nome, produttore, formato, tipologia, prezzo_eur, attivo, ordine "
            "FROM bevande_voci WHERE sezione_key != 'vini' AND attivo = 1 ORDER BY sezione_key, ordine, id"
        ).fetchall()
    finally:
        conn.close()
    ordine_sez = sorted(sezioni.values(), key=lambda s: (s.get("ordine") or 0))
    for v in voci:
        sez = sezioni.get(v["sezione_key"])
        prezzo = _num(v["prezzo_eur"])
        if not sez or not sez["ipratico"]["attivo"] or not sez.get("attivo", 1) or prezzo is None:
            continue
        voce = dict(v)
        gruppo = bev.categoria_ipratico(voce, sez["ipratico"])
        if gruppo not in ordine_extra:
            ordine_extra.append(gruppo)
        out.append(_art(bev.codice(v["id"]), "bevanda", bev.nome_ipratico(voce), gruppo, "beverage",
                        prezzo, " · ".join(x for x in (v["tipologia"], v["formato"]) if x), v["id"]))
    # i gruppi delle bevande nell'ordine delle sezioni
    pos = {s["nome"]: i for i, s in enumerate(ordine_sez)}
    ordine_extra.sort(key=lambda g: pos.get(g, 999))


def _menu_template(out: List[Dict[str, Any]]) -> None:
    from app.services import ipratico_menu_service as mnu
    for codice, a in sorted(mnu.articoli_attivi().items()):
        out.append(_art(codice, "menu_template", a["nome"], "Menu", "food", _num(a["prezzo"]),
                        "a persona", a["template_id"]))


# ── catalogo ───────────────────────────────────────────────────────

def catalogo(oggi: Optional[date] = None) -> Dict[str, Any]:
    oggi = oggi or date.today()
    articoli: List[Dict[str, Any]] = []
    avvisi: List[str] = []
    info: Dict[str, Any] = {"carta": None, "pranzo": None}
    gruppi_bevande: List[str] = []

    fonti = (
        ("carta", lambda: _carta(articoli, info)),
        ("piatti del giorno", lambda: _piatti_giorno(articoli)),
        ("pranzo", lambda: _pranzo(articoli, info, oggi)),
        ("menu template", lambda: _menu_template(articoli)),
        ("vini", lambda: _vini(articoli)),
        ("bevande", lambda: _bevande(articoli, gruppi_bevande)),
    )
    for nome, fn in fonti:
        try:
            fn()
        except Exception as e:  # una fonte rotta non ferma la sala
            avvisi.append(f"{nome}: non letta ({e})")

    if info["carta"] is None and not any(a.startswith("carta") for a in avvisi):
        avvisi.append("carta: nessuna edizione «in carta»")

    ordine = ORDINE_GRUPPI + [g for g in gruppi_bevande if g not in ORDINE_GRUPPI]
    conteggi: Dict[str, Dict[str, Any]] = {}
    for a in articoli:
        g = conteggi.setdefault(a["gruppo"], {"nome": a["gruppo"], "famiglia": a["famiglia"], "n": 0})
        g["n"] += 1
    gruppi = sorted(conteggi.values(), key=lambda g: (ordine.index(g["nome"]) if g["nome"] in ordine else 999, g["nome"]))
    for i, g in enumerate(gruppi):
        g["ordine"] = i
    return {"gruppi": gruppi, "articoli": articoli, "avvisi": avvisi, **info}


def indice(cat: Optional[Dict[str, Any]] = None) -> Dict[str, Dict[str, Any]]:
    """codice → articolo."""
    cat = cat or catalogo()
    return {a["codice"]: a for a in cat["articoli"]}
