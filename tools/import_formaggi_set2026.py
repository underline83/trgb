#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Modulo: cucina (selezioni)
# Classificazione: [locale:tregobbi] — dati dell'osteria, non funzione di prodotto
"""
Import one-shot dei formaggi (francesi + orobici, settembre 2026) nella zona
Formaggi di Selezioni del Giorno.

Passa SOLO dall'API del gestionale (POST/PUT/PATCH /formaggi/...), come farebbe
la UI: niente INSERT sul DB. Idempotente: si puo' rilanciare, aggiorna invece
di duplicare.

USO
---
    python3 tools/import_formaggi_set2026.py --url https://trgb.tregobbi.it --utente marco        # prova
    python3 tools/import_formaggi_set2026.py --url https://trgb.tregobbi.it --utente marco --vai  # esegue

Di default NON scrive: stampa il piano. Serve `--vai` per applicare.
La password viene chiesta a terminale (getpass), non va passata in chiaro.
Richiede ruolo admin/chef (le scritture /formaggi/ sono riservate alla cucina).

COSA FA
-------
1. Crea le categorie mancanti: Crosta fiorita, Crosta lavata, Semistagionati.
2. Formaggi "base": crea o aggiorna (match per nome normalizzato, senza
   accenti e senza DOP/AOP/IGP: "Taleggio" esistente → "Taleggio DOP").
3. Formaggi "alternativa": crea o aggiorna, collegati al base che sostituiscono.
4. Stato: base IN CARTA, alternative in ARCHIVIO (pronte da riattivare).
5. Elimina i vecchi formaggi di prova indicati da Marco (DA_TOGLIERE: Bagoss,
   Fontina, Formagella, Pecorino di Pienza) con DELETE /formaggi/{id}.
   Elenco esplicito per nome, cosi' un formaggio aggiunto nel frattempo non
   viene mai cancellato per sbaglio.
6. Ogni altro formaggio in carta che non e' in questa lista → ARCHIVIO
   (non cancellato). Disattivabile con --non-archiviare-altri.

MAPPATURA (decisa con Marco il 2026-10-01)
------------------------------------------
- famiglia      → paese (francesi=Francia, orobici=Italia)
- latte         → Vaccino / Caprino / Ovino / Misto (vacca e capra)
- provenienza   → territorio (+ "Presidio Slow Food" se indicato nella tipologia)
- tipologia     → categoria (vedi CATEGORIA)
- racconto+gusto→ descrizione ("…\\n\\nGusto: …")
- fornitore/codice/formato/listino → note, finche' non arriva la fattura e si
  collega l'ingrediente Food cost (campo ingredient_id, dalla scheda formaggio)
- orobici: prezzo e fornitore vuoti (acquisto di persona)
"""

from __future__ import annotations

import argparse
import getpass
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

DATI = Path(__file__).resolve().parent.parent / "locali" / "tregobbi" / "seeds" / "formaggi_set_2026.json"

PAESE = {"francesi": "Francia", "orobici": "Italia"}
LATTE = {"vacca": "Vaccino", "capra": "Caprino", "pecora": "Ovino", "vacca e capra": "Misto (vacca e capra)"}

CATEGORIE_NUOVE = [  # (nome, emoji, ordine) — le esistenti: Freschi 10, Stagionati 20, Erborinati 30, Caprini 40
    ("Crosta fiorita", "\U0001F9C0", 12),
    ("Crosta lavata", "\U0001F9C0", 14),
    ("Semistagionati", "\U0001F9C0", 16),
]

CATEGORIA = {
    "Saint-Maure de Touraine AOP alla cenere": "Crosta fiorita",
    "Brillat-Savarin": "Crosta fiorita",
    "Époisses AOP Fermier": "Crosta lavata",
    "Tomme de Brebis": "Semistagionati",
    "Comté d'Alpeggio AOP 30 mesi": "Stagionati",
    "Mimolette Vieille Réserve": "Stagionati",
    "Roquefort AOP Cosse Noir": "Erborinati",
    "Agrì di Valtorta": "Freschi",
    "Stracchino all'antica delle valli orobiche": "Freschi",
    "Caprino orobico": "Caprini",
    "Scimudin": "Crosta fiorita",
    "Taleggio DOP": "Crosta lavata",
    "Formai de Mut dell'Alta Val Brembana DOP": "Semistagionati",
    "Branzi": "Semistagionati",
    "Storico Ribelle (Bitto Storico)": "Stagionati",
    "Gorgonzola DOP piccante": "Erborinati",
    "Strachitunt DOP": "Erborinati",
    "Blu di capra": "Erborinati",
}

# Decisione Marco 2026-10-01: «i vecchi puoi toglierli» → eliminati, non archiviati.
DA_TOGLIERE = ["Bagoss", "Fontina", "Formagella", "Pecorino di Pienza"]

CAMPI_CONFRONTO = ("categoria", "paese", "latte", "territorio", "descrizione", "note",
                   "posizione", "ruolo", "alternativa_di_id")


# ───────────────────────── trasformazione dati ─────────────────────────

def norm(nome: str) -> str:
    s = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(dop|aop|igp)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def prezzo_kg(v) -> str:
    return f"{v:.2f}".replace(".", ",")


def mappa(f: dict) -> dict:
    tip = f.get("tipologia") or ""
    territorio = f["provenienza"]
    if "presidio slow food" in tip.lower():
        territorio += " · Presidio Slow Food"
    note = []
    if f.get("fornitore"):
        note.append(
            f"Listino {f['fornitore']} (Parma) set. 2026, IVA escl.: cod. {f['codice_fornitore']} · "
            f"{f['formato']} · {f['prezzo_listino']}"
            + ("" if "€/kg" in f["prezzo_listino"] else f" ({prezzo_kg(f['costo_kg'])} €/kg)")
        )
    if f.get("note"):
        note.append(f["note"][0].upper() + f["note"][1:])
    return {
        "nome": f["nome"],
        "categoria": CATEGORIA[f["nome"]],
        "paese": PAESE[f["famiglia"]],
        "latte": LATTE[f["latte"]],
        "territorio": territorio,
        "descrizione": f"{f['racconto']}\n\nGusto: {f['gusto']}",
        "note": " — ".join(note) or None,
        "posizione": f["posizione"],
        "ruolo": f["ruolo"],
        # risolto dopo, quando i base hanno un id
        "_alternativa_a": f.get("alternativa_a"),
    }


# ───────────────────────────── client API ─────────────────────────────

class Api:
    def __init__(self, url: str, token: str):
        self.url = url.rstrip("/")
        self.token = token

    @classmethod
    def login(cls, url: str, utente: str, password: str) -> "Api":
        api = cls(url, "")
        tok = api._req("POST", "/auth/login", {"username": utente, "password": password})
        api.token = tok["access_token"]
        return api

    def _req(self, metodo: str, path: str, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=metodo)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise SystemExit(f"✗ {metodo} {path} → HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")

    def get(self, path):          return self._req("GET", path)
    def post(self, path, body):   return self._req("POST", path, body)
    def put(self, path, body):    return self._req("PUT", path, body)
    def patch(self, path, body):  return self._req("PATCH", path, body)
    def delete(self, path):       return self._req("DELETE", path)


# ─────────────────────────────── import ───────────────────────────────

def esegui(api, vai: bool, archivia_altri: bool = True, out=print) -> dict:
    dati = [mappa(f) for f in json.loads(DATI.read_text(encoding="utf-8"))]
    nomi_lista = {norm(d["nome"]) for d in dati}
    assert len(nomi_lista) == len(dati), "nomi duplicati nella lista"
    stat = {"creati": 0, "aggiornati": 0, "invariati": 0, "archiviati": 0, "riattivati": 0,
            "eliminati": 0, "categorie": 0}

    # 1) categorie
    esistenti = {c["nome"] for c in api.get("/formaggi/categorie/?solo_attive=false")}
    for nome, emoji, ordine in CATEGORIE_NUOVE:
        if nome in esistenti:
            continue
        out(f"+ categoria {nome}")
        stat["categorie"] += 1
        if vai:
            api.post("/formaggi/categorie/", {"nome": nome, "emoji": emoji, "ordine": ordine, "attivo": True})

    # indice formaggi esistenti per nome normalizzato
    tutti = api.get("/formaggi/?stato=tutti")
    indice: dict[str, dict] = {}
    for t in tutti:
        k = norm(t["nome"])
        if k in indice and k in nomi_lista:
            raise SystemExit(f"✗ due formaggi esistenti con lo stesso nome '{t['nome']}': sistemali dalla UI prima")
        indice.setdefault(k, t)

    ids: dict[str, int] = {}  # nome lista → id (anche finti in prova)

    def scrivi(d: dict):
        payload = {k: v for k, v in d.items() if not k.startswith("_")}
        if d["ruolo"] == "alternativa":
            payload["alternativa_di_id"] = ids[d["_alternativa_a"]]
        else:
            payload["alternativa_di_id"] = None
        ex = indice.get(norm(d["nome"]))
        if ex is None:
            out(f"+ crea   {d['paese']:<7} {d['posizione']}. {d['nome']}  [{d['ruolo']}]")
            stat["creati"] += 1
            nuovo = api.post("/formaggi/", payload) if vai else {"id": -(len(ids) + 1), "attivo": True}
            ids[d["nome"]] = nuovo["id"]
            return nuovo
        ids[d["nome"]] = ex["id"]
        # Il PUT riscrive l'intera riga: i campi non gestiti qui (produttore,
        # stagionatura, ingredient_id, ...) si ripassano com'erano.
        for k in ("produttore", "stagionatura", "grammatura_g", "prezzo_euro", "ingredient_id"):
            payload[k] = ex.get(k)
        diff = [k for k in CAMPI_CONFRONTO + ("nome",) if (ex.get(k) or None) != (payload.get(k) or None)]
        if not diff:
            out(f"= ok     {d['paese']:<7} {d['posizione']}. {d['nome']}")
            stat["invariati"] += 1
            return ex
        rinomina = f"  (era '{ex['nome']}')" if ex["nome"] != d["nome"] else ""
        out(f"~ aggiorna #{ex['id']} {d['nome']}{rinomina}: {', '.join(diff)}")
        stat["aggiornati"] += 1
        return api.put(f"/formaggi/{ex['id']}", payload) if vai else ex

    def stato(t: dict, nome: str, attivo: bool):
        if bool(t.get("attivo", True)) == attivo:
            return
        out(f"{'↻ riattiva' if attivo else '📦 archivia'} {nome}")
        stat["riattivati" if attivo else "archiviati"] += 1
        if vai and t.get("id", 0) > 0:
            api.patch(f"/formaggi/{t['id']}/attivo", {"attivo": attivo})

    # 2) base, 3) alternative (servono gli id dei base)
    for d in [x for x in dati if x["ruolo"] == "base"] + [x for x in dati if x["ruolo"] == "alternativa"]:
        t = scrivi(d)
        # 4) base in carta, alternative in archivio
        stato(t, d["nome"], d["ruolo"] == "base")

    # 5) vecchi da togliere → DELETE
    da_togliere = {norm(n) for n in DA_TOGLIERE}
    assert not (da_togliere & nomi_lista), "un formaggio da togliere e' anche nella lista nuova"
    for t in tutti:
        if norm(t["nome"]) in da_togliere:
            out(f"🗑  elimina #{t['id']} {t['nome']}")
            stat["eliminati"] += 1
            if vai:
                api.delete(f"/formaggi/{t['id']}")

    # 6) gli altri in carta → archivio
    if archivia_altri:
        for t in tutti:
            k = norm(t["nome"])
            if k not in nomi_lista and k not in da_togliere and t.get("attivo"):
                stato(t, f"{t['nome']}  (non in lista)", False)

    out("")
    out("Riepilogo: " + ", ".join(f"{k} {v}" for k, v in stat.items()))
    if not vai:
        out("PROVA — nessuna scrittura. Rilancia con --vai per applicare.")
    return stat


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True, help="es. https://trgb.tregobbi.it")
    ap.add_argument("--utente", required=True)
    ap.add_argument("--vai", action="store_true", help="applica (senza: solo piano)")
    ap.add_argument("--non-archiviare-altri", action="store_true",
                    help="lascia in carta i formaggi che non sono in questa lista")
    a = ap.parse_args()
    api = Api.login(a.url, a.utente, getpass.getpass(f"Password per {a.utente}: "))
    esegui(api, vai=a.vai, archivia_altri=not a.non_archiviare_altri)


if __name__ == "__main__":
    sys.exit(main())
