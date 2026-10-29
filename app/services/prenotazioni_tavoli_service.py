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

ATTIVE_NO = ("CANCELED", "NO_SHOW", "REFUSED", "LEFT")   # andati: il tavolo è di nuovo libero
TUTTO_TURNO = 24 * 60
LIMITE_NODI = 40000
PENALITA_FORZATA = 6   # un tavolo sotto il suo minimo «costa» come 6 posti sprecati
PENALITA_META = 1      # spezzare un tavolo che quel turno non è diviso: solo se conviene


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


def nomi_meta(t: Dict[str, Any]) -> List[str]:
    """Nomi delle due metà di un tavolo dividibile: quelli scritti nell'editor («4, 4C») o «4A, 4B»."""
    parti = [x.strip() for x in str(t.get("nomi_meta") or "").split(",") if x.strip()]
    return parti[:2] if len(parti) >= 2 else [f"{t['nome']}A", f"{t['nome']}B"]


def posti_meta(posti_max: int) -> Tuple[int, int]:
    p = posti_max or 2
    return (p + 1) // 2, max(1, p // 2)


def _unita(conn, data: str, turno: str, sale: set, posti_prolunga: int = 2) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    """
    Unità prenotabili del turno e mappa «nome scritto → pezzi occupati».

    Un tavolo dividibile è fatto di due pezzi (le sue metà, es. 4 e 4C): intero li
    occupa tutti e due, ogni metà il suo. Se quel turno è diviso (✂️ dalla mappa) ci
    sono solo le metà; altrimenti il motore può usare il tavolo intero o, se serve,
    una metà sola. Le combinazioni possono usare tavoli interi o metà («11A»).
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info(tavoli)")}
    rows = [dict(r) for r in conn.execute(
        f"SELECT id, nome, zona, posti_min, posti_max, {'dividibile' if 'dividibile' in cols else '0 AS dividibile'}, "
        f"{'nomi_meta' if 'nomi_meta' in cols else 'NULL AS nomi_meta'} FROM tavoli WHERE attivo = 1 ORDER BY ordine, id")]
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

    unita: List[Dict[str, Any]] = []
    mappa: Dict[str, List[str]] = {}
    pezzo: Dict[Any, Dict[str, Any]] = {}   # id tavolo o "11A"/"11B" → descrizione per le combinazioni
    for t in rows:
        if t["zona"] not in sale or t["id"] in bloccati:
            continue
        pmin, pmax = t["posti_min"] or 1, t["posti_max"] or 2
        if t["dividibile"]:
            nA, nB = nomi_meta(t)
            pA, pB = posti_meta(pmax)
            meta = [(f"{t['id']}A", nA, pA), (f"{t['id']}B", nB, pB)]
            for chiave, nome, posti in meta:
                pezzo[chiave] = {"nome": nome, "pezzi": [nome], "zona": t["zona"], "posti": posti}
                unita.append({"chiave": f"t{chiave}", "nome": nome, "zona": t["zona"], "pezzi": [nome], "parti": [nome],
                              "posti_min": 1, "posti_max": posti, "prolunghe": 0, "combinazione": False,
                              "mezzo": t["id"] not in divisi})
                mappa[nome] = [nome]
            if t["id"] in divisi:
                continue
            pezzi = [nA, nB]
            mappa[t["nome"]] = pezzi   # «4» scritto = il tavolo intero, se quel turno non è diviso
        else:
            pezzi = [t["nome"]]
            mappa[t["nome"]] = pezzi
        pezzo[t["id"]] = {"nome": t["nome"], "pezzi": pezzi, "zona": t["zona"], "posti": pmax}
        unita.append({"chiave": f"t{t['id']}", "nome": t["nome"], "zona": t["zona"], "pezzi": pezzi, "parti": [t["nome"]],
                      "posti_min": pmin, "posti_max": pmax, "prolunghe": 0, "combinazione": False, "mezzo": False})

    try:
        combos = [dict(c) for c in conn.execute("SELECT * FROM tavoli_combinazioni")]
    except Exception:
        combos = []
    for c in combos:
        try:
            ids = json.loads(c.get("tavoli_ids") or "[]")
        except ValueError:
            continue
        if not ids or any(i not in pezzo for i in ids):
            continue   # un tavolo chiuso, bloccato, o intero ma diviso quel turno
        ts = [pezzo[i] for i in ids]
        pz = [x for t in ts for x in t["pezzi"]]
        if len(set(pz)) != len(pz):
            continue   # un tavolo e la sua metà insieme: non ha senso
        posti = c.get("posti") or sum(t["posti"] for t in ts)
        pmin = c.get("posti_min") or max(1, min(posti, max(t["posti"] for t in ts) + 1))
        k = c.get("prolunghe") or 0
        parti = [t["nome"] for t in ts]
        # La prolunga è facoltativa (Marco: «se la collego aggiunge 2 posti, se non mi serve
        # posso non metterla»): la combinazione salvata è quella con tutte le prolunghe, il
        # motore la usa anche con meno prolunghe e `posti_prolunga` posti in meno per ognuna.
        for j in range(k, -1, -1):
            if j < k and (len(ts) < 2 or posti_prolunga <= 0):
                break   # un tavolo solo senza prolunga è già il tavolo; prolunga che non aggiunge posti: inutile
            meno = (k - j) * posti_prolunga
            if posti - meno < 1:
                break
            unita.append({
                "chiave": f"c{c['id']}" + (f"p{j}" if j < k else ""),
                "nome": (c.get("nome") or "+".join(parti)) if j == k else
                        "+".join(parti) + (f" + {j} prolung{'a' if j == 1 else 'he'}" if j else ""),
                "zona": ts[0]["zona"], "pezzi": pz, "parti": parti,
                "posti_min": max(1, pmin - meno), "posti_max": posti - meno, "prolunghe": j, "combinazione": True,
                "mezzo": any(isinstance(i, str) for i in ids),
            })
    # Unioni fatte dalla mappa per questo turno (mig 218): quei tavoli sono un tavolo solo,
    # si usano interi (l'unione, o una combinazione più grande che li contiene tutti)
    for un in unioni_turno(conn, data, turno):
        if not un["ids"] or any(i not in pezzo for i in un["ids"]):
            continue
        blocco = {x for i in un["ids"] for x in pezzo[i]["pezzi"]}
        unita = [u for u in unita if not (set(u["pezzi"]) & blocco) or blocco <= set(u["pezzi"])]
        if not any(set(u["pezzi"]) == blocco and u["posti_max"] == un["posti_max"] for u in unita):
            unita.append({
                "chiave": f"u{un['id']}", "nome": un["nome"], "zona": pezzo[un["ids"][0]]["zona"],
                "pezzi": sorted(blocco), "parti": un["nomi"], "posti_min": un["posti_min"] or 1,
                "posti_max": un["posti_max"] or 2, "prolunghe": un["prolunghe"] or 0, "combinazione": True,
                "mezzo": any(isinstance(i, str) for i in un["ids"]),
            })
        mappa[un["nome"]] = sorted(blocco)
    return unita, mappa


def unioni_turno(conn, data: str, turno: str) -> List[Dict[str, Any]]:
    """Le unioni del turno, con gli id e i nomi dei tavoli."""
    try:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM tavoli_unioni WHERE data_pasto = ? AND turno = ? ORDER BY id", (data, turno))]
    except Exception:  # mig 218 non ancora passata
        return []
    nomi = _nomi_pezzi(conn)
    for r in rows:
        try:
            r["ids"] = json.loads(r["tavoli_ids"] or "[]")
        except ValueError:
            r["ids"] = []
        r["nomi"] = [nomi.get(str(i), str(i)) for i in r["ids"]]
    return rows


def _nomi_pezzi(conn) -> Dict[str, str]:
    """id tavolo (e «11A»/«11B» per le metà) → nome."""
    out: Dict[str, str] = {}
    for r in conn.execute("SELECT * FROM tavoli WHERE attivo = 1"):
        r = dict(r)
        out[str(r["id"])] = r["nome"]
        if r.get("dividibile"):
            nA, nB = nomi_meta(r)
            out[f"{r['id']}A"], out[f"{r['id']}B"] = nA, nB
    return out


def posti_unione(conn, ids: List[Any], prolunghe: int, cfg: Optional[Dict[str, str]] = None) -> Tuple[int, int, Optional[int]]:
    """
    Posti di un'unione: se è una combinazione salvata (stessi tavoli) quelli decisi da
    Marco, corretti per le prolunghe; se no la sua regola: 2 di capotavola + per ogni
    tavolo i suoi posti meno uno (minimo 2: 8, 9 → 2; 5, 7 → 2; 10 → 6) + 2 a prolunga.
    """
    cfg = cfg or _config(conn)
    passo = _int(cfg.get("posti_prolunga"), 2)
    chiave = sorted(str(i) for i in ids)
    for c in conn.execute("SELECT * FROM tavoli_combinazioni"):
        try:
            cids = sorted(str(i) for i in json.loads(c["tavoli_ids"] or "[]"))
        except ValueError:
            continue
        if cids == chiave:
            k = c["prolunghe"] if "prolunghe" in c.keys() and c["prolunghe"] else 0
            meno = (k - prolunghe) * passo
            mx = (c["posti"] or 0) - meno
            mn = (c["posti_min"] or max(1, mx - 2)) - meno
            return max(1, mn), max(1, mx), c["id"]
    tav = {str(r["id"]): dict(r) for r in conn.execute("SELECT * FROM tavoli WHERE attivo = 1")}
    somma = 0
    for i in ids:
        k = str(i)
        if k[-1:] in ("A", "B") and k[:-1] in tav:
            pA, pB = posti_meta(tav[k[:-1]]["posti_max"] or 2)
            somma += pA if k.endswith("A") else pB
        elif k in tav:
            somma += max(2, (tav[k]["posti_max"] or 2) - 1)
    mx = 2 + somma + passo * prolunghe
    return max(1, mx - 2), mx, None


def crea_unione(conn, data: str, turno: str, ids: List[Any], prolunghe: int, utente: Optional[str]) -> Dict[str, Any]:
    if len(ids) < 2 and not (len(ids) == 1 and prolunghe > 0):
        raise ValueError("Scegli almeno due tavoli (o un tavolo e la prolunga)")
    if len({str(i) for i in ids}) != len(ids):
        raise ValueError("Un tavolo è scelto due volte")
    nomi = _nomi_pezzi(conn)
    for i in ids:
        if str(i) not in nomi:
            raise ValueError(f"Tavolo {i} inesistente")
    basi = {str(i)[:-1] if str(i)[-1:] in ("A", "B") else str(i) for i in ids}
    for i in ids:   # un tavolo intero e una sua metà insieme no
        if str(i)[-1:] in ("A", "B") and str(i)[:-1] in {str(x) for x in ids}:
            raise ValueError(f"{nomi[str(i)[:-1]]} è già intero nell'unione")
    for un in unioni_turno(conn, data, turno):
        gia = {str(x)[:-1] if str(x)[-1:] in ("A", "B") else str(x) for x in un["ids"]} & basi
        if gia:
            raise ValueError(f"{', '.join(nomi.get(g, g) for g in sorted(gia))} è già in «{un['nome']}»: staccalo prima")
    try:
        bloccati = {str(r[0]) for r in conn.execute(
            "SELECT tavolo_id FROM tavoli_blocchi WHERE data_pasto = ? AND turno = ?", (data, turno))}
    except Exception:
        bloccati = set()
    if basi & bloccati:
        raise ValueError(f"{', '.join(nomi[b] for b in sorted(basi & bloccati))} è bloccato")
    try:
        divisi = {str(r[0]) for r in conn.execute(
            "SELECT tavolo_id FROM tavoli_divisioni WHERE data_pasto = ? AND turno = ?", (data, turno))}
    except Exception:
        divisi = set()
    for i in ids:
        if str(i) in divisi:
            raise ValueError(f"Il {nomi[str(i)]} quel turno è diviso: scegli le sue metà")
    for i in ids:   # una metà nell'unione: il tavolo quel turno è diviso
        k = str(i)
        if k[-1:] in ("A", "B") and k[:-1] not in divisi:
            conn.execute("INSERT OR IGNORE INTO tavoli_divisioni (data_pasto, turno, tavolo_id, creato_da) VALUES (?, ?, ?, ?)",
                         (data, turno, int(k[:-1]), utente or "unione"))
            divisi.add(k[:-1])
    pmin, pmax, cid = posti_unione(conn, ids, prolunghe)
    nome = "+".join(nomi[str(i)] for i in ids)
    uid = conn.execute("""
        INSERT INTO tavoli_unioni (data_pasto, turno, tavoli_ids, nome, posti_min, posti_max, prolunghe, combinazione_id, creato_da)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (data, turno, json.dumps(ids), nome, pmin, pmax, prolunghe, cid, utente)).lastrowid
    conn.commit()
    return {"id": uid, "nome": nome, "posti_min": pmin, "posti_max": pmax, "prolunghe": prolunghe, "combinazione_id": cid}


def dividi_se_meta(conn, pren_id: int, utente: Optional[str] = None) -> Optional[str]:
    """Scritta su una metà («4C») di un tavolo non diviso quel turno: lo divide, così la mappa la mostra."""
    try:
        p = conn.execute("SELECT data_pasto, turno, tavolo FROM clienti_prenotazioni WHERE id = ?", (pren_id,)).fetchone()
        if not p or not p["tavolo"]:
            return None
        nomi = set(nomi_tavolo(p["tavolo"]))
        for r in conn.execute("SELECT * FROM tavoli WHERE attivo = 1 AND dividibile = 1"):
            r = dict(r)
            meta = nomi_meta(r)
            if any(n in nomi and n != r["nome"] for n in meta):
                cur = conn.execute(
                    "INSERT OR IGNORE INTO tavoli_divisioni (data_pasto, turno, tavolo_id, creato_da) VALUES (?, ?, ?, ?)",
                    (p["data_pasto"], p["turno"], r["id"], utente or "motore tavoli"))
                conn.commit()
                if cur.rowcount:
                    return r["nome"]
    except Exception:  # noqa: BLE001 — mai bloccare chi assegna
        return None
    return None


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
            prolunghe_max: Optional[int] = None, fisse_da_tavolo: bool = True,
            mappa: Optional[Dict[str, List[str]]] = None) -> Dict[str, Any]:
    """
    Assegna le prenotazioni senza tavolo alle unità. Ritorna
    {assegnate: {pren_id: unità}, senza_posto: [pren_id], fisse: {pren_id: [nomi]}, forzate: {pren_id: unità}}.
    Prima cerca una soluzione esatta (tutti dentro, minimo spreco), con un limite di
    tentativi; poi, per chi resta fuori, prova i tavoli sotto il loro minimo («forzate»).
    """
    if mappa is None:
        mappa = {n: [n] for u in unita for n in u["pezzi"]}
    occ: Dict[str, List[Tuple[int, int]]] = {}   # pezzo di tavolo → intervalli occupati
    prol_usate: List[Tuple[Tuple[int, int], int]] = []
    fisse, conflitti, da_fare = {}, {}, []
    for p in prenotazioni:
        iv = _intervallo(p, dur, soglia)
        scritti = nomi_tavolo(p.get("tavolo")) if fisse_da_tavolo else []
        nomi = [x for n in scritti for x in mappa.get(n, [])]
        if scritti:   # tavolo scritto a mano: resta quello, anche se non è nella mappa
            fisse[p["id"]] = scritti
            doppi = [n for n in nomi if any(_sovrap(iv, x) for x in occ.get(n, ()))]
            if doppi:
                conflitti[p["id"]] = doppi
            for n in nomi:
                occ.setdefault(n, []).append(iv)
            # stesse parti: la variante più piccola dove stanno (con meno prolunghe)
            simili = sorted((u for u in unita if u["combinazione"] and sorted(u["parti"]) == sorted(scritti)),
                            key=lambda u: u["posti_max"])
            u = next((u for u in simili if u["posti_max"] >= (p.get("pax") or 0)), simili[-1] if simili else None)
            if u and u["prolunghe"]:
                prol_usate.append((iv, u["prolunghe"]))
        else:
            da_fare.append((p, iv))

    def libera(u, iv):
        return all(not _sovrap(iv, x) for n in u["pezzi"] for x in occ.get(n, ()))

    def prol_ok(u, iv):
        if not u["prolunghe"] or prolunghe_max is None:
            return True
        punti = [iv[0]] + [x[0] for x, _ in prol_usate if iv[0] <= x[0] < iv[1]]
        return all(u["prolunghe"] + sum(k for x, k in prol_usate if x[0] <= t < x[1]) <= prolunghe_max for t in punti)

    def candidati(p):
        """Prima le unità giuste (min ≤ pax ≤ max), poi quelle sotto il loro minimo (forzate)."""
        pax = p.get("pax") or 0
        ordina = lambda u: (u["posti_max"] - pax, u["mezzo"], u["combinazione"], len(u["parti"]), u["prolunghe"], u["nome"])
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
        for n in u["pezzi"]:
            occ.setdefault(n, []).append(iv)
        if u["prolunghe"]:
            prol_usate.append((iv, u["prolunghe"]))

    def togli(u, iv):
        for n in u["pezzi"]:
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
                cerca(i + 1, sol, n_dentro + 1, spreco + u["posti_max"] - (p.get("pax") or 0)
                      + (PENALITA_FORZATA if forz else 0) + (PENALITA_META if u["mezzo"] else 0))
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
    return {"assegnate": assegnate, "forzate": forzate, "senza_posto": senza, "fisse": fisse, "conflitti": conflitti,
            "completa": nodi[0] <= LIMITE_NODI or migliore["n"] == len(da_fare)}


# ── API del service ────────────────────────────────────────────

def _contesto(conn, data: str, turno: str):
    config = _config(conn)
    pren = _prenotazioni(conn, data, turno)
    nomi_scritti = {n for p in pren for n in nomi_tavolo(p.get("tavolo"))}
    tutti: Dict[str, str] = {}
    for r in conn.execute("SELECT * FROM tavoli WHERE attivo = 1"):
        r = dict(r)
        tutti[r["nome"]] = r["zona"]
        if r.get("dividibile"):
            for n in nomi_meta(r):
                tutti[n] = r["zona"]
    # una sala chiusa ma con tavoli già assegnati quel turno conta come aperta
    sale = _sale_aperte(conn, data, turno, {tutti[n] for n in nomi_scritti if n in tutti})
    unita, mappa = _unita(conn, data, turno, sale, _int(config.get("posti_prolunga"), 2))
    # «4» è sia il tavolo intero sia una metà (metà «4» e «4C»): se quel turno qualcuno
    # è scritto sull'altra metà, «4» vuol dire la metà
    for r in conn.execute("SELECT * FROM tavoli WHERE attivo = 1 AND dividibile = 1"):
        r = dict(r)
        meta = nomi_meta(r)
        if r["nome"] in meta and r["nome"] in mappa:
            altra = meta[1] if meta[0] == r["nome"] else meta[0]
            if altra in nomi_scritti:
                mappa[r["nome"]] = [r["nome"]]
    pm = config.get("prolunghe_disponibili")
    return config, pren, unita, {
        "mappa": mappa,
        "dur": durata(config, turno, data),
        "soglia": _int(config.get("gruppo_turno_intero"), 10),
        "prolunghe_max": _int(pm, None) if pm not in (None, "") else None,
        "sale": sorted(sale),
    }


def _u(u) -> Dict[str, Any]:
    return {"nome": u["nome"], "tavoli": u["parti"], "posti": u["posti_max"], "prolunghe": u["prolunghe"],
            "zona": u["zona"], "mezzo": u["mezzo"]}


def piano(conn, data: str, turno: str) -> Dict[str, Any]:
    """Tavolo suggerito per ogni prenotazione senza tavolo del turno."""
    _, pren, unita, k = _contesto(conn, data, turno)
    r = risolvi(pren, unita, k["dur"], k["soglia"], k["prolunghe_max"], mappa=k["mappa"])
    out = []
    for p in pren:
        voce = {"id": p["id"], "ora": (p["ora_pasto"] or "")[:5], "pax": p["pax"], "nome": p["nome"], "tavolo": p["tavolo"] or None}
        if p["id"] in r["conflitti"]:
            voce.update(stato="conflitto", tavoli_doppi=r["conflitti"][p["id"]])
        elif p["id"] in r["fisse"]:
            voce["stato"] = "assegnato"
        elif p["id"] in r["assegnate"]:
            voce.update(stato="suggerito", suggerito=_u(r["assegnate"][p["id"]]))
        elif p["id"] in r["forzate"]:
            voce.update(stato="forzato", suggerito=_u(r["forzate"][p["id"]]))
        else:
            voce["stato"] = "senza_posto"
        out.append(voce)
    conta = {s: sum(1 for v in out if v["stato"] == s) for s in ("suggerito", "forzato", "senza_posto", "conflitto")}
    return {"data": data, "turno": turno, "durata": k["dur"], "sale": k["sale"],
            "prolunghe_disponibili": k["prolunghe_max"], "completa": r["completa"], "conta": conta, "prenotazioni": out}


def piano_sicuro(conn, data: str, turno: str) -> Optional[Dict[str, Any]]:
    """Come piano(), ma non rompe chi lo chiama (Planning): None se qualcosa va storto."""
    try:
        return piano(conn, data, turno)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("motore tavoli %s %s", data, turno)
        return None


class Verificatore:
    """Legge il turno una volta sola e risponde a «entra?» per più orari o coperti (sito, TheFork)."""

    def __init__(self, conn, data: str, turno: str, escludi_id: Optional[int] = None):
        _, pren, self.unita, self.k = _contesto(conn, data, turno)
        self.pren = [p for p in pren if p["id"] != escludi_id]
        base = risolvi(self.pren, self.unita, self.k["dur"], self.k["soglia"], self.k["prolunghe_max"], mappa=self.k["mappa"])
        self.fuori_prima = len(base["senza_posto"])
        self.ha_tavoli = bool(self.unita)

    def verifica(self, pax: int, ora: str) -> Dict[str, Any]:
        nuova = {"id": "_nuova", "ora_pasto": ora, "pax": pax, "tavolo": None}
        r = risolvi(self.pren + [nuova], self.unita, self.k["dur"], self.k["soglia"], self.k["prolunghe_max"], mappa=self.k["mappa"])
        fuori_dopo = len(r["senza_posto"])
        u = r["assegnate"].get("_nuova") or r["forzate"].get("_nuova")
        entra = u is not None and fuori_dopo <= self.fuori_prima
        return {"entra": entra, "tavolo": _u(u) if entra else None, "gia_fuori": self.fuori_prima,
                "forzato": entra and "_nuova" in r["forzate"]}


def verifica(conn, data: str, turno: str, pax: int, ora: str, escludi_id: Optional[int] = None) -> Dict[str, Any]:
    """Una prenotazione nuova (pax, ora) entra senza spostare fuori nessun altro? Dove?"""
    return Verificatore(conn, data, turno, escludi_id).verifica(pax, ora)
