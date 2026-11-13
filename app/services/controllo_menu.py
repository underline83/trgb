# Modulo: cucina (legge menu_carta, ricette e task_manager in sola lettura)  ·  [core]
# @version: v1.0 — Controllo menu: porzioni realizzabili per piatto (2026-11-13, mig 233)
# -*- coding: utf-8 -*-
"""
Controllo menu — per ogni piatto in carta, quante porzioni si possono fare con
quello che c'e' in casa.

Doc: docs/spec_linea_cucina.md §10.

LA CATENA (la stessa della linea, services/linea_checklist.py)
--------------------------------------------------------------
    carta in corso → ricetta del piatto → elementi (preparazioni e componenti)
      → articoli in Frigoriferi e scorte → giacenze per ripiano

Una preparazione che ha un suo articolo si ferma li' (il fondo bruno e' un
articolo); una che non ce l'ha si esplode nelle sue righe.

DAI PEZZI ALLE PORZIONI (decisione Marco 2026-11-13)
----------------------------------------------------
Le ricette sono in g/ml a porzione, le scorte in pezzi (buste, vaschette).
Il ponte e' `cucina_menu_elementi.porzioni_per_pezzo`: per quel piatto, quante
porzioni da' UNA unita' di scorta dell'elemento. Si scrive dalla pagina.
Dove non e' scritto e le unita' si parlano da sole (scorta in kg e ricetta in
grammi, scorta in litri e ricetta in ml, scorta in pezzi e ricetta in pezzi)
il numero si ricava dalla grammatura: e' segnato `auto`. Altrimenti l'elemento
resta «senza dato».

DUE NUMERI (decisione Marco 2026-11-13)
---------------------------------------
  · subito      = frigo, cella, dispensa, banco (tutto cio' che non e' gelo)
  · con il gelo = subito + congelatore/abbattitore (va scongelato)
Il piatto prende il minimo fra i suoi elementi: quello e' il collo di bottiglia.

SENZA DATO (decisione Marco 2026-11-13)
---------------------------------------
Un elemento senza articolo, mai contato o senza porzioni per pezzo NON limita
il numero: il piatto risulta «incompleto» e dice che cosa manca. Un elemento
marcato `non_limita` (sale, olio; vale per tutti i piatti) non conta e non
viene segnalato.

Ogni piatto e' calcolato da solo: due piatti che usano lo stesso fondo non si
dividono la scorta (il numero risponde a «se faccio solo questo»).

Nessuna scrittura qui, tranne `salva_elemento()` (i due campi della tabella).
"""

from __future__ import annotations

import math
import sqlite3
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.cucina_scorte_db import config_int
from app.models.foodcost_db import get_foodcost_connection
from app.services.cucina_scorte_service import stato_dato
from app.services.menu_i18n_service import SEZIONI_LABEL
from app.utils.locale_data import locale_data_path

TASKS_DB = locale_data_path("tasks.sqlite3")
TIPI_GELO = ("FREEZER", "ABBATTITORE")
TIPI_ELEMENTO = ("I", "R")
_UM = {"PZ": "pz", "CF": "conf.", "KG": "kg", "G": "g", "L": "l", "ML": "ml"}
_PESO = {"g": 1.0, "gr": 1.0, "kg": 1000.0}
_VOLUME = {"ml": 1.0, "cl": 10.0, "dl": 100.0, "l": 1000.0, "lt": 1000.0}
_PEZZI = {"pz", "n", "nr", "pezzo", "pezzi"}
_PEGGIO = {"ROSSO": 3, "GIALLO": 2, "VERDE": 1}


# ─────────────────────────────────────────────────────────────
# Conversione automatica (solo quando le unita' si parlano)
# ─────────────────────────────────────────────────────────────

def porzioni_auto(um_scorta: Optional[str], qty: Optional[float], unit: Optional[str]) -> Optional[float]:
    """Quante porzioni da' una unita' di scorta, dalla grammatura della ricetta.
    None se le unita' non si parlano (busta ↔ grammi): li' serve il numero a mano."""
    if not qty or qty <= 0:
        return None
    um = (um_scorta or "").strip().upper()
    u = (unit or "").strip().lower().rstrip(".")
    if um in ("KG", "G") and u in _PESO:
        return (1000.0 if um == "KG" else 1.0) / (qty * _PESO[u])
    if um in ("L", "ML") and u in _VOLUME:
        return (1000.0 if um == "L" else 1.0) / (qty * _VOLUME[u])
    if um == "PZ" and u in _PEZZI:
        return 1.0 / qty
    return None


# ─────────────────────────────────────────────────────────────
# Lettura
# ─────────────────────────────────────────────────────────────

def _linea_oggi() -> Dict[int, str]:
    """{articolo_id: VERDE|GIALLO|ROSSO} — l'ultimo semaforo di linea dato oggi."""
    if not TASKS_DB.exists():
        return {}
    try:
        tk = sqlite3.connect(f"file:{TASKS_DB}?mode=ro", uri=True, timeout=10)
        tk.row_factory = sqlite3.Row
    except sqlite3.Error:
        return {}
    try:
        out: Dict[int, str] = {}
        for r in tk.execute("""
            SELECT it.articolo_id, e.valore_testo
              FROM checklist_execution e
              JOIN checklist_instance i ON i.id = e.instance_id
              JOIN checklist_item it    ON it.id = e.item_id
              JOIN checklist_template t ON t.id = i.template_id
             WHERE i.data_riferimento = ? AND t.generato_da LIKE 'linea:%'
               AND it.tipo = 'LINEA' AND it.articolo_id IS NOT NULL
               AND e.valore_testo IN ('VERDE', 'GIALLO', 'ROSSO')
             ORDER BY e.completato_at
        """, (date.today().isoformat(),)):
            out[r["articolo_id"]] = r["valore_testo"]     # l'ultimo vince
        return out
    except sqlite3.Error:
        return {}
    finally:
        tk.close()


def _leggi(conn) -> Dict[str, Any]:
    piatti = [dict(r) for r in conn.execute("""
        SELECT p.id AS pub_id, p.recipe_id, p.sezione, p.sort_order, e.nome AS edizione,
               COALESCE(NULLIF(TRIM(p.titolo_override), ''), NULLIF(TRIM(r.menu_name), ''), r.name) AS nome
          FROM menu_dish_publications p
          JOIN menu_editions e ON e.id = p.edition_id
          LEFT JOIN recipes r  ON r.id = p.recipe_id
         WHERE e.stato = 'in_carta' AND COALESCE(p.is_visible, 1) = 1
           AND p.recipe_id IS NOT NULL       -- coperto, acqua, «raccontati a voce»: niente da contare
         ORDER BY p.sort_order, p.id
    """)]

    righe: Dict[int, List[dict]] = {}
    for r in conn.execute("""
        SELECT i.recipe_id, i.ingredient_id, i.sub_recipe_id, i.qty, i.unit,
               ing.name AS ing_nome, sr.name AS sub_nome
          FROM recipe_items i
          LEFT JOIN ingredients ing ON ing.id = i.ingredient_id
          LEFT JOIN recipes sr      ON sr.id  = i.sub_recipe_id
         ORDER BY i.recipe_id, i.sort_order, i.id
    """):
        righe.setdefault(r["recipe_id"], []).append(dict(r))

    articoli = {r["id"]: dict(r) for r in conn.execute("""
        SELECT id, nome, um, regime, recipe_id, ingredient_id,
               famiglia_freschezza, giorni_dato_fresco
          FROM cucina_articoli WHERE attivo = 1
    """)}
    per: Dict[Tuple[str, int], List[int]] = {}
    for a in articoli.values():
        if a["recipe_id"]:
            per.setdefault(("R", a["recipe_id"]), []).append(a["id"])
        if a["ingredient_id"]:
            per.setdefault(("I", a["ingredient_id"]), []).append(a["id"])

    giac: Dict[int, Dict[str, Any]] = {}
    for r in conn.execute("""
        SELECT g.articolo_id, u.tipo, g.qta, g.aggiornato_at
          FROM cucina_giacenze g JOIN cucina_ubicazioni u ON u.id = g.ubicazione_id
         WHERE u.attivo = 1
    """):
        g = giac.setdefault(r["articolo_id"], {"subito": 0.0, "gelo": 0.0, "contato": False, "agg": None})
        if r["qta"] is None:
            continue
        g["contato"] = True
        g["gelo" if (r["tipo"] or "").upper() in TIPI_GELO else "subito"] += float(r["qta"])
        if r["aggiornato_at"] and (g["agg"] is None or r["aggiornato_at"] > g["agg"]):
            g["agg"] = r["aggiornato_at"]

    regole: Dict[Tuple[int, str, int], dict] = {}
    for r in conn.execute("SELECT recipe_id, tipo, ref_id, porzioni_per_pezzo, non_limita FROM cucina_menu_elementi"):
        regole[(r["recipe_id"], r["tipo"], r["ref_id"])] = dict(r)

    return {"piatti": piatti, "righe": righe, "articoli": articoli, "per": per,
            "giac": giac, "regole": regole}


def _elementi(d: Dict[str, Any], recipe_id: int) -> List[dict]:
    """Gli elementi di un piatto, in ordine di ricetta, senza doppioni.
    La grammatura (qty, unit) si tiene solo per le righe dirette del piatto:
    dentro una preparazione esplosa le quantita' sono per la resa, non a porzione."""
    out: Dict[Tuple[str, int], dict] = {}
    visti = set()

    def metti(tipo: str, ref: int, nome: str, qty, unit):
        k = (tipo, ref)
        if k in out:
            e = out[k]
            if e["qty"] is not None and qty is not None and (e["unit"] or "") == (unit or ""):
                e["qty"] += qty
            else:
                e["qty"] = e["unit"] = None
            return
        out[k] = {"tipo": tipo, "ref_id": ref, "nome": nome, "qty": qty, "unit": unit}

    def visita(rid: int, prof: int):
        if rid in visti or prof > 6:
            return
        visti.add(rid)
        for r in d["righe"].get(rid, []):
            qty, unit = (r["qty"], r["unit"]) if prof == 0 else (None, None)
            if r["ingredient_id"]:
                metti("I", r["ingredient_id"], r["ing_nome"] or "?", qty, unit)
            elif r["sub_recipe_id"]:
                sub = r["sub_recipe_id"]
                if d["per"].get(("R", sub)) or not d["righe"].get(sub):
                    metti("R", sub, r["sub_nome"] or "?", qty, unit)
                else:
                    visita(sub, prof + 1)

    propri = d["per"].get(("R", recipe_id))                # il piatto stesso e' un articolo (lasagnetta)
    if propri:
        metti("R", recipe_id, f"{d['articoli'][propri[0]]['nome']} (pronto)", 1.0, "pz")
    visita(recipe_id, 0)
    return list(out.values())


# ─────────────────────────────────────────────────────────────
# Calcolo
# ─────────────────────────────────────────────────────────────

def _porzioni(qta: float, ppp: float) -> int:
    return max(0, int(math.floor(qta * ppp + 1e-9)))


def calcola(conn=None) -> Dict[str, Any]:
    chiudi = conn is None
    conn = conn or get_foodcost_connection()
    try:
        d = _leggi(conn)
        soglia = config_int(conn, "controllo_menu_poche_porzioni", 5)
        stato_art: Dict[int, str] = {}
        for aid, g in d["giac"].items():
            a = d["articoli"].get(aid)
            if a and g["contato"]:
                stato_art[aid] = stato_dato(conn, a, g["agg"])["stato"]
    finally:
        if chiudi:
            conn.close()
    linea = _linea_oggi()

    sezioni: Dict[str, dict] = {}
    for p in d["piatti"]:
        piatto: Dict[str, Any] = {
            "pub_id": p["pub_id"], "recipe_id": p["recipe_id"], "nome": p["nome"] or "(senza nome)",
            "porzioni_subito": None, "porzioni_con_gelo": None,
            "collo_subito": None, "collo_con_gelo": None,
            "mancanti": [], "da_verificare": [], "linea": None, "elementi": [], "avviso": None,
        }
        elementi = _elementi(d, p["recipe_id"]) if p["recipe_id"] else []
        if not p["recipe_id"]:
            piatto["avviso"] = "Il piatto non ha una ricetta collegata"
        elif not elementi:
            piatto["avviso"] = "La ricetta non ha ancora le righe"

        for e in elementi:
            ids = d["per"].get((e["tipo"], e["ref_id"]), [])
            arts = [d["articoli"][i] for i in ids]
            um_set = {(a["um"] or "").upper() for a in arts}
            um = next(iter(um_set)) if len(um_set) == 1 else None
            contati = [i for i in ids if d["giac"].get(i, {}).get("contato")]
            subito = sum(d["giac"][i]["subito"] for i in contati) if contati else None
            gelo = sum(d["giac"][i]["gelo"] for i in contati) if contati else None
            agg = max((d["giac"][i]["agg"] for i in contati if d["giac"][i]["agg"]), default=None)
            vecchio = bool(contati) and any(stato_art.get(i) == "DA_VERIFICARE" for i in contati)

            propria = d["regole"].get((p["recipe_id"], e["tipo"], e["ref_id"])) or {}
            globale = d["regole"].get((0, e["tipo"], e["ref_id"])) or {}
            non_limita = bool(globale.get("non_limita"))
            ppp, origine = propria.get("porzioni_per_pezzo"), "manuale"
            if not ppp:
                ppp, origine = (porzioni_auto(um, e["qty"], e["unit"]) if um else None), "auto"
            if not ppp:
                origine = None

            colori = [linea[i] for i in ids if i in linea]
            col = max(colori, key=lambda c: _PEGGIO[c]) if colori else None

            motivo = None
            if not non_limita:
                if not arts:
                    motivo = "non è in Frigoriferi e scorte"
                elif not contati:
                    motivo = "mai contato"
                elif not ppp:
                    motivo = "mancano le porzioni per pezzo"

            el = {
                "tipo": e["tipo"], "ref_id": e["ref_id"], "nome": e["nome"],
                "qty": e["qty"], "unit": e["unit"],
                "articoli": [{"id": a["id"], "nome": a["nome"]} for a in arts],
                "um": _UM.get(um, (um or "").lower()) if um else None,
                "subito": subito, "gelo": gelo, "aggiornato_at": agg, "da_verificare": vecchio,
                "porzioni_per_pezzo": round(ppp, 2) if ppp else None,
                "porzioni_origine": origine,
                "porzioni_manuale": propria.get("porzioni_per_pezzo"),
                "non_limita": non_limita, "motivo": motivo, "linea": col,
                "porzioni_subito": None, "porzioni_con_gelo": None,
            }
            if not non_limita and not motivo:
                el["porzioni_subito"] = _porzioni(subito, ppp)
                el["porzioni_con_gelo"] = _porzioni(subito + gelo, ppp)
                for campo, collo in (("porzioni_subito", "collo_subito"), ("porzioni_con_gelo", "collo_con_gelo")):
                    if piatto[campo] is None or el[campo] < piatto[campo]:
                        piatto[campo], piatto[collo] = el[campo], e["nome"]
                if vecchio:
                    piatto["da_verificare"].append(e["nome"])
            elif motivo:
                piatto["mancanti"].append({"nome": e["nome"], "motivo": motivo})
            if col and not non_limita and (piatto["linea"] is None or _PEGGIO[col] > _PEGGIO[piatto["linea"]]):
                piatto["linea"] = col
            piatto["elementi"].append(el)

        piatto["completo"] = bool(elementi) and not piatto["mancanti"]
        n = piatto["porzioni_subito"]
        piatto["stato"] = ("SENZA_DATO" if n is None else "ZERO" if n == 0
                           else "POCHE" if n <= soglia else "OK")
        sez = sezioni.setdefault(p["sezione"] or "altro", {
            "k": p["sezione"] or "altro",
            "label": (SEZIONI_LABEL.get(p["sezione"] or "", {}) or {}).get("it") or (p["sezione"] or "Altro"),
            "piatti": []})
        sez["piatti"].append(piatto)

    ordine = list(SEZIONI_LABEL.keys())
    lista = sorted(sezioni.values(), key=lambda s: ordine.index(s["k"]) if s["k"] in ordine else 99)
    tutti = [x for s in lista for x in s["piatti"]]
    return {
        "edizione": d["piatti"][0]["edizione"] if d["piatti"] else None,
        "calcolato_at": datetime.now().isoformat(timespec="seconds"),
        "soglia_poche": soglia,
        "riassunto": {
            "piatti": len(tutti),
            "zero": sum(1 for x in tutti if x["stato"] == "ZERO"),
            "poche": sum(1 for x in tutti if x["stato"] == "POCHE"),
            "ok": sum(1 for x in tutti if x["stato"] == "OK"),
            "senza_dato": sum(1 for x in tutti if x["stato"] == "SENZA_DATO"),
            "incompleti": sum(1 for x in tutti if not x["completo"]),
        },
        "sezioni": lista,
    }


# ─────────────────────────────────────────────────────────────
# Scrittura — i due campi di cucina_menu_elementi
# ─────────────────────────────────────────────────────────────

def salva_elemento(conn, recipe_id: int, tipo: str, ref_id: int, utente: str, *,
                   porzioni_per_pezzo: Optional[float] = None, cambia_porzioni: bool = False,
                   non_limita: Optional[bool] = None) -> None:
    """`porzioni_per_pezzo` vale per quel piatto (None = torna al calcolo
    automatico); `non_limita` vale per tutti i piatti (riga con recipe_id = 0)."""
    if tipo not in TIPI_ELEMENTO:
        raise ValueError("tipo: I (ingrediente) o R (preparazione)")
    ora = datetime.now().isoformat(timespec="seconds")
    if cambia_porzioni:
        if porzioni_per_pezzo is not None and porzioni_per_pezzo <= 0:
            raise ValueError("porzioni per pezzo: un numero maggiore di zero")
        if not recipe_id:
            raise ValueError("porzioni per pezzo: serve il piatto")
        conn.execute("""
            INSERT INTO cucina_menu_elementi (recipe_id, tipo, ref_id, porzioni_per_pezzo, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(recipe_id, tipo, ref_id) DO UPDATE SET
                porzioni_per_pezzo = excluded.porzioni_per_pezzo,
                updated_at = excluded.updated_at, updated_by = excluded.updated_by
        """, (recipe_id, tipo, ref_id, porzioni_per_pezzo, ora, utente))
    if non_limita is not None:
        conn.execute("""
            INSERT INTO cucina_menu_elementi (recipe_id, tipo, ref_id, non_limita, updated_at, updated_by)
            VALUES (0, ?, ?, ?, ?, ?)
            ON CONFLICT(recipe_id, tipo, ref_id) DO UPDATE SET
                non_limita = excluded.non_limita,
                updated_at = excluded.updated_at, updated_by = excluded.updated_by
        """, (tipo, ref_id, 1 if non_limita else 0, ora, utente))
