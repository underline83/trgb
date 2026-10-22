# Modulo: platform (ponte cucina ↔ task_manager)  ·  [core]
# @version: v1.0 — linea cucina L2: checklist generate dal menu (2026-10-22)
# -*- coding: utf-8 -*-
"""
Linea cucina, fase L2 — le checklist di linea si scrivono dal menu.

Spec: docs/spec_linea_cucina.md §5.

PERCHE' ESISTE
--------------
Le 8 «Linea Antipasti/Primi/Secondi/Contorni · Pranzo/Sera» erano scritte a
mano: se cambia un piatto, qualcuno deve ricordarsi di cambiare la checklist.
Qui la checklist diventa una conseguenza:

    menu in corso (edizione in_carta, piatti visibili)
      → ricetta del piatto, esplosa fino agli elementi
        → articoli in Scorte che hanno una riga di linea nella partita
          → voci della checklist della partita, sotto il piatto come padre

Il Task Manager resta il motore (istanze, scadenze, punteggio, schermate
Oggi): questo servizio scrive solo `checklist_template` e `checklist_item`
delle checklist generate (`generato_da = 'linea:<partita>:<turno>'`). Le
spunte le scrivono i normali endpoint /tasks/execution/item/{id}/check, come
per le temperature (services/haccp_letture.py): il registro resta uno.

LE VOCI
-------
Per ogni articolo in linea nella partita:
  · LINEA         semaforo verde/giallo/rosso — una per piatto che lo usa
                  (gremolada sotto ossobuco e sotto rognone: la spunta e'
                  condivisa, se ne fa una e valgono tutte e due);
  · SCORTA_FRIGO  se l'articolo ha un minimo frigo — una sola per partita;
  · SCORTA_GELO   se ha un minimo gelo — una sola per partita.
Le righe di linea marcate `generale` vanno nel gruppo «Generale» (c'e'
sempre, anche se nessun piatto le usa: burro e parmigiano nei primi). Le voci
extra della partita (pentole in bollore, salvia sul pass) stanno li' anche
loro, come CHECKBOX.

Una riga di linea che nessun piatto in carta usa e non e' «generale» NON
entra: e' proprio il caso «il piatto e' uscito dalla carta».

STABILITA'
----------
Ogni voce ha una chiave (`linea_ref`). Al giro dopo la voce con la stessa
chiave si aggiorna sul posto (titolo, ordine, minimo): le spunte di oggi
restano attaccate. Una voce che non c'e' piu' prende `disattivo_at`: sparisce
dalle istanze nuove, resta in quelle che l'hanno gia' spuntata (storico).

Le checklist nuove nascono SPENTE (attivo = 0): le accende `attiva()`, che
spegne nello stesso colpo le vecchie scritte a mano con lo stesso nome.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.foodcost_db import get_foodcost_connection
from app.utils.locale_data import locale_data_path

logger = logging.getLogger("trgb.linea_checklist")

TASKS_DB = locale_data_path("tasks.sqlite3")

# I due servizi della linea: turno del Task Manager → (etichetta, chiave config ora)
TURNI_LINEA: Tuple[Tuple[str, str, str], ...] = (
    ("PRANZO", "Pranzo", "linea_ora_pranzo"),
    ("CENA", "Sera", "linea_ora_sera"),
)
GRUPPO_GENERALE = "Generale"
_UM = {"PZ": "pz", "CF": "conf.", "KG": "kg", "G": "g", "L": "l", "ML": "ml"}

_ultimo_giro = 0.0          # throttle per il richiamo «lazy» dalla Home
_THROTTLE_S = 60


# ─────────────────────────────────────────────────────────────
# Lettura (foodcost.db)
# ─────────────────────────────────────────────────────────────

def _config(conn) -> Dict[str, str]:
    try:
        return {r["chiave"]: r["valore"] for r in
                conn.execute("SELECT chiave, valore FROM cucina_scorte_config")}
    except sqlite3.Error:
        return {}


def _mappa_sezioni(cfg: Dict[str, str]) -> Dict[str, str]:
    """'antipasti:antipasti,paste_risi_zuppe:primi' → {sezione: partita}."""
    out = {}
    for coppia in (cfg.get("linea_sezioni") or "").split(","):
        if ":" in coppia:
            sez, par = coppia.split(":", 1)
            if sez.strip() and par.strip():
                out[sez.strip()] = par.strip()
    return out


def _fmt(n) -> str:
    if n is None:
        return ""
    n = float(n)
    return str(int(n)) if n.is_integer() else f"{n:g}".replace(".", ",")


def _leggi(conn) -> Dict[str, Any]:
    """Tutto quello che serve al calcolo, in poche query."""
    cfg = _config(conn)
    sez_partita = _mappa_sezioni(cfg)

    piatti = [dict(r) for r in conn.execute("""
        SELECT p.id AS pub_id, p.recipe_id, p.sezione, p.sort_order,
               COALESCE(NULLIF(TRIM(p.titolo_override), ''), NULLIF(TRIM(r.menu_name), ''), r.name) AS nome
          FROM menu_dish_publications p
          JOIN menu_editions e ON e.id = p.edition_id
          LEFT JOIN recipes r  ON r.id = p.recipe_id
         WHERE e.stato = 'in_carta'
           AND p.recipe_id IS NOT NULL
           AND COALESCE(p.is_visible, 1) = 1
         ORDER BY p.sort_order, p.id
    """)]

    righe: Dict[int, List[Tuple[Optional[int], Optional[int]]]] = {}
    for r in conn.execute("SELECT recipe_id, ingredient_id, sub_recipe_id FROM recipe_items"
                          " ORDER BY recipe_id, sort_order, id"):
        righe.setdefault(r["recipe_id"], []).append((r["ingredient_id"], r["sub_recipe_id"]))

    articoli = {r["id"]: dict(r) for r in conn.execute("""
        SELECT id, nome, um, recipe_id, ingredient_id, scorta_min_frigo, scorta_min_gelo
          FROM cucina_articoli WHERE attivo = 1
    """)}
    per_ricetta: Dict[int, List[int]] = {}
    per_ingrediente: Dict[int, List[int]] = {}
    for a in articoli.values():
        if a["recipe_id"]:
            per_ricetta.setdefault(a["recipe_id"], []).append(a["id"])
        if a["ingredient_id"]:
            per_ingrediente.setdefault(a["ingredient_id"], []).append(a["id"])

    linea: Dict[str, Dict[int, dict]] = {}
    for r in conn.execute("""
        SELECT id, articolo_id, partita, linea_qta, linea_note, ordine, COALESCE(generale, 0) AS generale
          FROM cucina_linea_elementi WHERE attivo = 1 ORDER BY partita, ordine, id
    """):
        if r["articolo_id"] in articoli:
            linea.setdefault(r["partita"], {}).setdefault(r["articolo_id"], dict(r))

    extra: Dict[str, List[dict]] = {}
    for r in conn.execute("SELECT id, partita, titolo, note FROM cucina_linea_voci_extra"
                          " WHERE attivo = 1 ORDER BY partita, ordine, id"):
        extra.setdefault(r["partita"], []).append(dict(r))

    return {"cfg": cfg, "sez_partita": sez_partita, "piatti": piatti, "righe": righe,
            "articoli": articoli, "per_ricetta": per_ricetta,
            "per_ingrediente": per_ingrediente, "linea": linea, "extra": extra}


def _elementi_piatto(d: Dict[str, Any], recipe_id: int) -> List[int]:
    """Gli articoli di un piatto, in ordine di ricetta, senza doppioni.

    Una preparazione che ha un suo articolo si ferma li' (il fondo e' un
    articolo, le ossa che lo fanno no); una che non ce l'ha si esplode (il
    risotto della combo ossobuco porta riso, zafferano, burro).
    """
    out: List[int] = []
    visti = set()

    def add(ids):
        for i in ids:
            if i not in out:
                out.append(i)

    def visita(rid: int, prof: int):
        if rid in visti or prof > 6:
            return
        visti.add(rid)
        for ing, sub in d["righe"].get(rid, []):
            if ing:
                add(d["per_ingrediente"].get(ing, []))
            elif sub:
                propri = d["per_ricetta"].get(sub)
                if propri:
                    add(propri)
                else:
                    visita(sub, prof + 1)

    add(d["per_ricetta"].get(recipe_id, []))   # il piatto stesso (lasagnetta)
    visita(recipe_id, 0)
    return out


# ─────────────────────────────────────────────────────────────
# Calcolo delle voci
# ─────────────────────────────────────────────────────────────

def _voci_articolo(a: dict, riga: dict, gruppo: str, ref_gruppo: str,
                   con_scorte: bool) -> List[dict]:
    um = _UM.get((a["um"] or "").upper(), (a["um"] or "").lower())
    qta = (riga["linea_qta"] or "").strip()
    voci = [{
        "linea_ref": f"A{a['id']}:L:{ref_gruppo}",
        "tipo": "LINEA",
        "titolo": f"{a['nome']} — {qta}" if qta else f"{a['nome']} — in linea",
        "gruppo": gruppo, "articolo_id": a["id"], "recipe_id": a["recipe_id"],
        "min_valore": None, "unita_misura": None, "note": riga["linea_note"],
    }]
    if con_scorte:
        for tipo, campo, dove in (("SCORTA_FRIGO", "scorta_min_frigo", "frigo"),
                                  ("SCORTA_GELO", "scorta_min_gelo", "gelo")):
            if a[campo] is not None:
                voci.append({
                    "linea_ref": f"A{a['id']}:{tipo[7]}",
                    "tipo": tipo,
                    "titolo": f"{a['nome']} — scorta {dove}: min {_fmt(a[campo])} {um}".rstrip(),
                    "gruppo": gruppo, "articolo_id": a["id"], "recipe_id": a["recipe_id"],
                    "min_valore": a[campo], "unita_misura": a["um"], "note": None,
                })
    return voci


def calcola(conn=None) -> Dict[str, Dict[str, Any]]:
    """{partita: {voci: [...], non_usati: [nomi], piatti: [nomi]}} — nessuna scrittura."""
    chiudi = conn is None
    conn = conn or get_foodcost_connection()
    try:
        d = _leggi(conn)
    finally:
        if chiudi:
            conn.close()

    partite = sorted(set(d["linea"]) | set(d["extra"]))
    out: Dict[str, Dict[str, Any]] = {}
    for partita in partite:
        righe_p = d["linea"].get(partita, {})
        piatti = [p for p in d["piatti"] if d["sez_partita"].get(p["sezione"]) == partita]
        voci: List[dict] = []
        con_scorte_fatte = set()
        usati = set()

        def metti(art_id: int, gruppo: str, ref_gruppo: str):
            a, riga = d["articoli"][art_id], righe_p[art_id]
            prima = art_id not in con_scorte_fatte
            con_scorte_fatte.add(art_id)
            voci.extend(_voci_articolo(a, riga, gruppo, ref_gruppo, prima))

        generali = [aid for aid, r in righe_p.items() if r["generale"]]
        for aid in generali:
            metti(aid, GRUPPO_GENERALE, "G")
            usati.add(aid)
        for x in d["extra"].get(partita, []):
            voci.append({"linea_ref": f"X{x['id']}", "tipo": "CHECKBOX", "titolo": x["titolo"],
                         "gruppo": GRUPPO_GENERALE, "articolo_id": None, "recipe_id": None,
                         "min_valore": None, "unita_misura": None, "note": x["note"]})

        nomi_piatti = []
        for p in piatti:
            nel_piatto = [aid for aid in _elementi_piatto(d, p["recipe_id"])
                          if aid in righe_p and not righe_p[aid]["generale"]]
            nel_piatto.sort(key=lambda aid: (righe_p[aid]["ordine"], righe_p[aid]["id"]))
            nomi_piatti.append({"nome": p["nome"], "voci": len(nel_piatto)})
            for aid in nel_piatto:
                metti(aid, p["nome"], f"P{p['pub_id']}")
                usati.add(aid)

        for i, v in enumerate(voci):
            v["ordine"] = (i + 1) * 10
        out[partita] = {
            "voci": voci,
            "piatti": nomi_piatti,
            "non_usati": [d["articoli"][aid]["nome"] for aid in righe_p if aid not in usati],
            "ora": {t: d["cfg"].get(k) for t, _, k in TURNI_LINEA},
        }
    return out


# ─────────────────────────────────────────────────────────────
# Scrittura (tasks.sqlite3)
# ─────────────────────────────────────────────────────────────

_CAMPI = ("titolo", "tipo", "gruppo", "ordine", "articolo_id", "recipe_id",
          "min_valore", "unita_misura", "note")


def _tasks_conn() -> Optional[sqlite3.Connection]:
    if not TASKS_DB.exists():
        return None
    conn = sqlite3.connect(TASKS_DB, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _ha_colonne(conn) -> bool:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(checklist_item)")}
    tcols = {r[1] for r in conn.execute("PRAGMA table_info(checklist_template)")}
    return {"linea_ref", "articolo_id", "disattivo_at"} <= cols and "generato_da" in tcols


def _nome_template(partita: str, etichetta: str) -> str:
    return f"Linea {partita.capitalize()} · {etichetta}"


def _sync_template(tk, tid: int, voci: List[dict], ora: str) -> Dict[str, int]:
    esistenti = {r["linea_ref"]: dict(r) for r in tk.execute(
        "SELECT * FROM checklist_item WHERE template_id = ? AND linea_ref IS NOT NULL", (tid,))}
    nuove = aggiornate = tolte = 0
    viste = set()
    for v in voci:
        ref = v["linea_ref"]
        viste.add(ref)
        e = esistenti.get(ref)
        if e is None:
            tk.execute(f"""
                INSERT INTO checklist_item
                    (template_id, linea_ref, obbligatorio, {", ".join(_CAMPI)})
                VALUES (?, ?, 1, {", ".join("?" * len(_CAMPI))})
            """, (tid, ref, *[v[c] for c in _CAMPI]))
            nuove += 1
        elif e["disattivo_at"] or any(e[c] != v[c] for c in _CAMPI):
            tk.execute(f"""
                UPDATE checklist_item SET disattivo_at = NULL, {", ".join(f"{c} = ?" for c in _CAMPI)}
                 WHERE id = ?
            """, (*[v[c] for c in _CAMPI], e["id"]))
            aggiornate += 1
    for ref, e in esistenti.items():
        if ref not in viste and not e["disattivo_at"]:
            tk.execute("UPDATE checklist_item SET disattivo_at = ? WHERE id = ?", (ora, e["id"]))
            tolte += 1
    if nuove or aggiornate or tolte:
        tk.execute("UPDATE checklist_template SET updated_at = ? WHERE id = ?", (ora, tid))
    return {"nuove": nuove, "aggiornate": aggiornate, "tolte": tolte}


def sincronizza(forza: bool = True) -> Dict[str, Any]:
    """Riscrive le checklist generate dal menu. Idempotente: se niente e'
    cambiato non scrive niente. `forza=False` (richiamo dalla Home) salta se
    l'ultimo giro e' di meno di un minuto fa."""
    global _ultimo_giro
    if not forza and time.time() - _ultimo_giro < _THROTTLE_S:
        return {"saltato": True}
    _ultimo_giro = time.time()

    calcolo = calcola()
    tk = _tasks_conn()
    if tk is None or not _ha_colonne(tk):
        if tk:
            tk.close()
        return {"ok": False, "motivo": "tasks.sqlite3 senza colonne della mig 207"}
    ora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    esito: Dict[str, Any] = {"ok": True, "partite": {}}
    try:
        for partita, c in calcolo.items():
            for turno, etichetta, chiave_ora in TURNI_LINEA:
                gen = f"linea:{partita}:{turno}"
                row = tk.execute("SELECT id FROM checklist_template WHERE generato_da = ?",
                                 (gen,)).fetchone()
                if row:
                    tid = row["id"]
                else:
                    if not c["voci"]:
                        continue
                    cur = tk.execute("""
                        INSERT INTO checklist_template
                            (nome, reparto, frequenza, turno, ora_scadenza_entro, attivo,
                             note, created_by, generato_da, created_at, updated_at)
                        VALUES (?, 'cucina', 'GIORNALIERA', ?, ?, 0, ?, 'linea', ?, ?, ?)
                    """, (_nome_template(partita, etichetta), turno, c["ora"].get(turno),
                          "Generata dal menu in carta e dalla scheda Linea delle ricette.",
                          gen, ora, ora))
                    tid = cur.lastrowid
                esito["partite"][gen] = {"template_id": tid, **_sync_template(tk, tid, c["voci"], ora)}
        tk.commit()
    except sqlite3.Error as e:
        tk.rollback()
        logger.warning("linea_checklist: sincronizzazione fallita: %s", e)
        return {"ok": False, "motivo": str(e)}
    finally:
        tk.close()
    return esito


def attiva(accendi: bool = True) -> Dict[str, Any]:
    """Accende le checklist generate e spegne le vecchie scritte a mano con lo
    stesso nome (o il contrario, per tornare indietro). Le vecchie non si
    cancellano: storico e spunte restano."""
    tk = _tasks_conn()
    if tk is None or not _ha_colonne(tk):
        return {"ok": False, "motivo": "tasks.sqlite3 senza colonne della mig 207"}
    try:
        gen = tk.execute("SELECT id, nome FROM checklist_template WHERE generato_da LIKE 'linea:%'").fetchall()
        nomi = [g["nome"] for g in gen]
        ph = ",".join("?" * len(nomi)) or "''"
        vecchie = tk.execute(
            f"SELECT id, nome FROM checklist_template WHERE generato_da IS NULL AND nome IN ({ph})",
            nomi).fetchall()
        tk.executemany("UPDATE checklist_template SET attivo = ? WHERE id = ?",
                       [(1 if accendi else 0, g["id"]) for g in gen])
        tk.executemany("UPDATE checklist_template SET attivo = ? WHERE id = ?",
                       [(0 if accendi else 1, v["id"]) for v in vecchie])
        # Le istanze di oggi della parte che si spegne, se nessuno le ha ancora
        # toccate, si chiudono come SALTATE con il motivo: niente doppioni
        # nella schermata Oggi. Quelle gia' iniziate restano com'erano.
        spente = [v["id"] for v in vecchie] if accendi else [g["id"] for g in gen]
        oggi = datetime.now().strftime("%Y-%m-%d")
        motivo = ("Sostituita dalla linea generata dal menu" if accendi
                  else "Tornati alla linea scritta a mano")
        saltate = 0
        for tid in spente:
            cur = tk.execute("""
                UPDATE checklist_instance
                   SET stato = 'SALTATA', note = ?, completato_at = datetime('now','localtime'),
                       completato_da = 'linea'
                 WHERE template_id = ? AND data_riferimento >= ? AND stato = 'APERTA'
                   AND NOT EXISTS (SELECT 1 FROM checklist_execution e WHERE e.instance_id = checklist_instance.id)
            """, (motivo, tid, oggi))
            saltate += cur.rowcount
        tk.commit()
        return {"ok": True, "generate": [dict(g) for g in gen], "vecchie": [dict(v) for v in vecchie],
                "accese": "generate" if accendi else "vecchie", "istanze_saltate": saltate}
    finally:
        tk.close()
