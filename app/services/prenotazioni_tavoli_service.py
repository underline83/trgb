# @version: v1.0 — motore per tavoli: tavolo suggerito e posto libero (2026-10-29)
# -*- coding: utf-8 -*-
"""
Motore per tavoli — Modulo: prenotazioni — [core]

Passo 2 della disponibilità per tavoli (decisione di Marco: «dobbiamo già
lavorare per tavoli»). Dato un giorno e un turno:

- le «unità» sono i tavoli delle sale aperte (i divisi diventano le due metà,
  i bloccati non ci sono) e le combinazioni salvate (posti decisi da Marco,
  prolunghe comprese) i cui tavoli sono tutti disponibili;
- una prenotazione occupa la sua unità dall'arrivo all'arrivo + durata
  (cena 120, pranzo 90, pranzo lungo nel weekend), tutto il turno dai
  `gruppo_turno_intero` coperti in su;
- le prenotazioni col tavolo già scritto tengono quello; le altre ricevono un
  tavolo SUGGERITO (virtuale: non si scrive niente) — la soluzione che fa
  stare tutti col minor spreco di posti;
- le prolunghe usate nello stesso momento non superano `prolunghe_disponibili`.

Sola lettura. Funzioni: piano(conn, data, turno), verifica(conn, data, turno,
pax, ora) per sapere se una prenotazione nuova entra e dove.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

ATTIVE_NO = ("CANCELED", "NO_SHOW", "REFUSED")
TUTTO_TURNO = 24 * 60
LIMITE_NODI = 40000
PENALITA_FORZATA = 6   # un tavolo sotto il suo minimo «costa» come 6 posti sprecati


# ── lettura ────────────────────────────────────────────────────

def _config(conn) -> Dict[str, str]:
    return {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM prenotazioni_config")}


def _int(v, d):
    try:
        return int(v) if v not in (None, "") else d
    except (TypeError, ValueError):
        return d


def _minuti(ora) -> Optional[int]:
    try:
        h, m = str(ora)[:5].split(":")
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        return None


def durata(config: Dict[str, str], turno: str, data: str) -> int:
    if turno == "pranzo" and data:
        try:
            giorni = json.loads(config.get("giorni_pranzo_lungo") or "[5,6]")
            if date.fromisoformat(data[:10]).weekday() in giorni:
                return _int(config.get("durata_pranzo_lungo"), 120)
        except (ValueError, TypeError):
            pass
    return _int(config.get(f"durata_{turno}"), _int(config.get("durata_media_tavolo_min"), 90))


def nomi_tavolo(testo) -> List[str]:
    """«0+1», «17 + 18», «9,10» → ['0','1'] …"""
    return [n.strip() for n in str(testo or "").replace(",", "+").split("+") if n.strip()]


def _sale_aperte(conn, data: str, turno: str, extra: Optional[set] = None) -> set:
    try:
        from app.services import prenotazioni_sale_service as sale_srv
        aperte = sale_srv.aperte(conn, data, turno)
    except Exception:
        aperte = set()
    if not aperte:
        aperte = {r[0] for r in conn.execute("SELECT DISTINCT zona FROM tavoli WHERE attivo = 1")}
    return aperte | (extra or set())


def _tavoli(conn, data: str, turno: str, sale: set) -> List[Dict[str, Any]]:
    """Tavoli prenotabili del turno: sale aperte, divisi → metà, senza i bloccati."""
    rows = [dict(r) for r in conn.execute(
        "SELECT id, nome, zona, posti_min, posti_max, dividibile FROM tavoli WHERE attivo = 1 ORDER BY ordine, id")]
    try:
        bloccati = {r[0] for r in conn.execute(
            "SELECT tavolo_id FROM tavoli_blocchi WHERE data_pasto = ? AND turno = ?", (data, turno))}
    except Exception:
        bloccati = set()
    try:
        divisi = {r[0] for r in conn.execute(
            "SELECT tavolo_id FROM tavoli_divisioni WHERE data_pasto = ? AND turno = ?", (data, turno))}
    except Exception:
        divisi = set()
    out = []
    for t in rows:
        if t["zona"] not in sale or t["id"] in bloccati:
            continue
        if t["id"] in divisi:
            p = t["posti_max"] or 2
            out.append({**t, "id": f"{t['id']}A", "nome": f"{t['nome']}A", "posti_min": 1, "posti_max": (p + 1) // 2, "base": t["id"]})
            out.append({**t, "id": f"{t['id']}B", "nome": f"{t['nome']}B", "posti_min": 1, "posti_max": max(1, p // 2), "base": t["id"]})
        else:
            out.append({**t, "base": t["id"]})
    return out


def _unita(conn, tavoli: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Tavoli singoli + combinazioni coi tavoli tutti disponibili (un tavolo diviso non si combina)."""
    per_id = {t["id"]: t for t in tavoli if t["id"] == t["base"]}
    out = [{
        "chiave": f"t{t['id']}", "nome": t["nome"], "zona": t["zona"], "tavoli": [t["nome"]],
        "posti_min": t["posti_min"] or 1, "posti_max": t["posti_max"] or 2, "prolunghe": 0, "combinazione": False,
    } for t in tavoli]
    try:
        combos = conn.execute("SELECT * FROM tavoli_combinazioni").fetchall()
    except Exception:
        combos = []
    for c in combos:
        c = dict(c)
        try:
            ids = json.loads(c.get("tavoli_ids") or "[]")
        except ValueError:
            continue
        if not ids or any(i not in per_id for i in ids):
            continue
        ts = [per_id[i] for i in ids]
        posti = c.get("posti") or sum(t["posti_max"] or 0 for t in ts)
        out.append({
            "chiave": f"c{c['id']}", "nome": c.get("nome") or "+".join(t["nome"] for t in ts),
            "zona": ts[0]["zona"], "tavoli": [t["nome"] for t in ts],
            "posti_min": c.get("posti_min") or max(1, min(posti, max(t["posti_max"] or 0 for t in ts) + 1)),
            "posti_max": posti, "prolunghe": c.get("prolunghe") or 0, "combinazione": True,
        })
    return out


def _prenotazioni(conn, data: str, turno: str) -> List[Dict[str, Any]]:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(clienti_prenotazioni)")}
    nome = "COALESCE(NULLIF(p.nome_ospite,''), NULLIF(c.nome,''), '') || ' ' || COALESCE(NULLIF(p.cognome_ospite,''), c.cognome, '')" \
        if "nome_ospite" in cols else "COALESCE(c.nome,'') || ' ' || COALESCE(c.cognome,'')"
    return [dict(r) for r in conn.execute(f"""
        SELECT p.id, p.ora_pasto, p.pax, p.tavolo, p.stato, TRIM({nome}) AS nome
        FROM clienti_prenotazioni p LEFT JOIN clienti c ON c.id = p.cliente_id
        WHERE p.data_pasto = ? AND p.turno = ? AND p.stato NOT IN ({','.join('?' * len(ATTIVE_NO))})
        ORDER BY p.ora_pasto, p.id
    """, (data, turno, *ATTIVE_NO))]


# ── algoritmo (puro) ───────────────────────────────────────────

def _intervallo(p, dur: int, soglia: int) -> Tuple[int, int]:
    a = _minuti(p.get("ora_pasto")) or 0
    return (0, TUTTO_TURNO) if (p.get("pax") or 0) >= soglia else (a, a + dur)


def _sovrap(a, b) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def risolvi(prenotazioni: List[Dict[str, Any]], unita: List[Dict[str, Any]], dur: int, soglia: int,
            prolunghe_max: Optional[int] = None, fisse_da_tavolo: bool = True) -> Dict[str, Any]:
    """
    Assegna le prenotazioni senza tavolo alle unità. Ritorna
    {assegnate: {pren_id: unità}, senza_posto: [pren_id], fisse: {pren_id: [nomi]}, forzate: {pren_id: unità}}.
    Prima cerca una soluzione esatta (tutti dentro, minimo spreco), con un limite di
    tentativi; poi, per chi resta fuori, prova i tavoli sotto il loro minimo («forzate»).
    """
    nomi_validi = {n for u in unita for n in u["tavoli"]}
    occ: Dict[str, List[Tuple[int, int]]] = {}   # nome tavolo → intervalli occupati
    prol_usate: List[Tuple[Tuple[int, int], int]] = []
    fisse, da_fare = {}, []
    for p in prenotazioni:
        iv = _intervallo(p, dur, soglia)
        nomi = [n for n in nomi_tavolo(p.get("tavolo")) if n in nomi_validi] if fisse_da_tavolo else []
        if nomi:
            fisse[p["id"]] = nomi
            for n in nomi:
                occ.setdefault(n, []).append(iv)
            u = next((u for u in unita if u["combinazione"] and sorted(u["tavoli"]) == sorted(nomi)), None)
            if u and u["prolunghe"]:
                prol_usate.append((iv, u["prolunghe"]))
        else:
            da_fare.append((p, iv))

    def libera(u, iv):
        return all(not _sovrap(iv, x) for n in u["tavoli"] for x in occ.get(n, ()))

    def prol_ok(u, iv):
        if not u["prolunghe"] or prolunghe_max is None:
            return True
        punti = [iv[0]] + [x[0] for x, _ in prol_usate if iv[0] <= x[0] < iv[1]]
        return all(u["prolunghe"] + sum(k for x, k in prol_usate if x[0] <= t < x[1]) <= prolunghe_max for t in punti)

    def candidati(p):
        """Prima le unità giuste (min ≤ pax ≤ max), poi quelle sotto il loro minimo (forzate)."""
        pax = p.get("pax") or 0
        ordina = lambda u: (u["posti_max"] - pax, u["combinazione"], len(u["tavoli"]), u["prolunghe"], u["nome"])
        giuste = sorted([u for u in unita if u["posti_min"] <= pax <= u["posti_max"]], key=ordina)
        forzate = sorted([u for u in unita if pax < u["posti_min"]], key=ordina)
        return [(u, False) for u in giuste] + [(u, True) for u in forzate]

    # i più difficili prima: tutto il turno, poi più persone, poi meno alternative
    da_fare.sort(key=lambda x: (-(x[1][1] - x[1][0]), -(x[0].get("pax") or 0), len(candidati(x[0])), x[1][0]))
    # chi non ha nessuna unità abbastanza grande (es. gruppo senza combinazione salvata) è fuori subito
    impossibili = [(p, iv) for p, iv in da_fare if not candidati(p)]
    da_fare = [x for x in da_fare if candidati(x[0])]
    cand = [candidati(p) for p, _ in da_fare]

    migliore = {"n": -1, "spreco": 10 ** 9, "sol": {}}
    nodi = [0]

    def metti(u, iv):
        for n in u["tavoli"]:
            occ.setdefault(n, []).append(iv)
        if u["prolunghe"]:
            prol_usate.append((iv, u["prolunghe"]))

    def togli(u, iv):
        for n in u["tavoli"]:
            occ[n].remove(iv)
        if u["prolunghe"]:
            prol_usate.remove((iv, u["prolunghe"]))

    def cerca(i, sol, n_dentro, spreco):
        nodi[0] += 1
        resto = len(da_fare) - i
        if n_dentro + resto < migliore["n"] or (n_dentro + resto == migliore["n"] and spreco >= migliore["spreco"]):
            return
        if i == len(da_fare):
            migliore.update(n=n_dentro, spreco=spreco, sol=dict(sol))
            return
        if nodi[0] > LIMITE_NODI:
            return
        p, iv = da_fare[i]
        for u, forz in cand[i]:
            if libera(u, iv) and prol_ok(u, iv):
                metti(u, iv)
                sol[p["id"]] = (u, forz)
                cerca(i + 1, sol, n_dentro + 1, spreco + u["posti_max"] - (p.get("pax") or 0) + (PENALITA_FORZATA if forz else 0))
                del sol[p["id"]]
                togli(u, iv)
                if migliore["n"] == len(da_fare) and nodi[0] > LIMITE_NODI:
                    return
        cerca(i + 1, sol, n_dentro, spreco)   # questa resta senza posto

    cerca(0, {}, 0, 0)
    sol = migliore["sol"]
    assegnate = {pid: u for pid, (u, f) in sol.items() if not f}
    forzate = {pid: u for pid, (u, f) in sol.items() if f}
    senza = [p["id"] for p, _ in da_fare + impossibili if p["id"] not in sol]
    return {"assegnate": assegnate, "forzate": forzate, "senza_posto": senza, "fisse": fisse,
            "completa": nodi[0] <= LIMITE_NODI or migliore["n"] == len(da_fare)}


# ── API del service ────────────────────────────────────────────

def _contesto(conn, data: str, turno: str):
    config = _config(conn)
    pren = _prenotazioni(conn, data, turno)
    nomi_scritti = {n for p in pren for n in nomi_tavolo(p.get("tavolo"))}
    tutti = {r["nome"]: r["zona"] for r in conn.execute("SELECT nome, zona FROM tavoli WHERE attivo = 1")}
    # una sala chiusa ma con tavoli già assegnati quel turno conta come aperta
    sale = _sale_aperte(conn, data, turno, {tutti[n] for n in nomi_scritti if n in tutti})
    unita = _unita(conn, _tavoli(conn, data, turno, sale))
    pm = config.get("prolunghe_disponibili")
    return config, pren, unita, {
        "dur": durata(config, turno, data),
        "soglia": _int(config.get("gruppo_turno_intero"), 10),
        "prolunghe_max": _int(pm, None) if pm not in (None, "") else None,
        "sale": sorted(sale),
    }


def _u(u) -> Dict[str, Any]:
    return {"nome": u["nome"], "tavoli": u["tavoli"], "posti": u["posti_max"], "prolunghe": u["prolunghe"], "zona": u["zona"]}


def piano(conn, data: str, turno: str) -> Dict[str, Any]:
    """Tavolo suggerito per ogni prenotazione senza tavolo del turno."""
    _, pren, unita, k = _contesto(conn, data, turno)
    r = risolvi(pren, unita, k["dur"], k["soglia"], k["prolunghe_max"])
    out = []
    for p in pren:
        voce = {"id": p["id"], "ora": (p["ora_pasto"] or "")[:5], "pax": p["pax"], "nome": p["nome"], "tavolo": p["tavolo"] or None}
        if p["id"] in r["fisse"]:
            voce["stato"] = "assegnato"
        elif p["id"] in r["assegnate"]:
            voce.update(stato="suggerito", suggerito=_u(r["assegnate"][p["id"]]))
        elif p["id"] in r["forzate"]:
            voce.update(stato="forzato", suggerito=_u(r["forzate"][p["id"]]))
        else:
            voce["stato"] = "senza_posto"
        out.append(voce)
    return {"data": data, "turno": turno, "durata": k["dur"], "sale": k["sale"],
            "prolunghe_disponibili": k["prolunghe_max"], "completa": r["completa"], "prenotazioni": out}


def verifica(conn, data: str, turno: str, pax: int, ora: str, escludi_id: Optional[int] = None) -> Dict[str, Any]:
    """Una prenotazione nuova (pax, ora) entra senza spostare fuori nessun altro? Dove?"""
    _, pren, unita, k = _contesto(conn, data, turno)
    pren = [p for p in pren if p["id"] != escludi_id]
    base = risolvi(pren, unita, k["dur"], k["soglia"], k["prolunghe_max"])
    fuori_prima = len(base["senza_posto"]) + len(base["forzate"])
    nuova = {"id": "_nuova", "ora_pasto": ora, "pax": pax, "tavolo": None}
    r = risolvi(pren + [nuova], unita, k["dur"], k["soglia"], k["prolunghe_max"])
    fuori_dopo = len(r["senza_posto"]) + len(r["forzate"])
    u = r["assegnate"].get("_nuova")
    entra = u is not None and fuori_dopo <= fuori_prima
    return {"entra": entra, "tavolo": _u(u) if entra else None, "gia_fuori": fuori_prima}


def orari_liberi(conn, data: str, turno: str, pax: int, orari: List[str]) -> Dict[str, bool]:
    return {o: verifica(conn, data, turno, pax, o)["entra"] for o in orari}
