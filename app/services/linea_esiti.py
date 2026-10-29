# Modulo: platform (ponte task_manager ↔ cucina ↔ lista spesa)  ·  [core]
# @version: v1.0 — linea cucina L3: dagli esiti al lavoro (2026-10-23)
# -*- coding: utf-8 -*-
"""
Linea cucina, fase L3 — gli esiti delle checklist di linea diventano lavoro.

Spec: docs/spec_linea_cucina.md §6. Decisioni di Marco (2026-10-23):

  esito (di oggi)                         preparazione         componente comprato
  ─────────────────────────────────────── ──────────────────── ─────────────────────────
  linea ROSSO («manca la merce»)          task Produrre, ALTA  spesa da confermare, urgente
  scorta confermata sotto il minimo       task Produrre, MEDIA spesa da confermare
  linea GIALLO e checklist scaduta        task Rifornire la linea, MEDIA (per tutti)

  - Il giallo da solo non fa niente: «vado a prendere, ci torno».
  - Un task ALTA nuovo avvisa chef e sous chef (campanello).
  - La spesa proposta NON e' da ordinare finche' non la conferma Marco, lo
    chef o il sous chef (lista_spesa_items.da_confermare, mig 209).

QUANDO
------
`valuta()` gira dopo ogni spunta di linea o di scorta, dopo una conferma di
scorta e un movimento di magazzino, e dalla Home (throttle). E' idempotente:
  · un articolo ha al massimo UN task di linea aperto e UNA proposta di spesa
    aperta: un esito nuovo li aggiorna (e alza la priorita', mai l'abbassa);
  · ogni esito agisce una volta sola: se il task nato da quell'esito e' gia'
    stato chiuso (anche a mano), lo stesso esito non lo riapre;
  · un task aperto di ieri si riporta a oggi (resta nella schermata Oggi).

CHIUSURA DA SOLA
----------------
Solo su un fatto positivo, mai per assenza di dati:
  · articolo con minimi frigo/gelo → quando la giacenza registrata torna a
    coprire tutti i minimi;
  · articolo senza minimi → quando dopo il task la voce di linea e' verde.
Allo stesso modo una proposta di spesa ancora da confermare sparisce (era
solo una proposta). Una spesa gia' confermata non si tocca: e' un ordine.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.models.foodcost_db import get_foodcost_connection
from app.utils.locale_data import locale_data_path

logger = logging.getLogger("trgb.linea_esiti")

TASKS_DB = locale_data_path("tasks.sqlite3")
ORIGINE = "LINEA"
REF_MODULO = "cucina_articoli"
FAMIGLIE = {"FRIGO": ("FRIGO", "CELLA"), "GELO": ("FREEZER", "ABBATTITORE"),
            "DISPENSA": ("DISPENSA", "SCAFFALE")}   # mig 220
CAMPI_MIN = (("FRIGO", "scorta_min_frigo"), ("GELO", "scorta_min_gelo"),
             ("DISPENSA", "scorta_min_dispensa"))
DOVE = {"FRIGO": "frigo", "GELO": "gelo", "DISPENSA": "dispensa"}
_UM = {"PZ": "pz", "CF": "conf.", "KG": "kg", "G": "g", "L": "l", "ML": "ml"}

_ultimo = 0.0
_THROTTLE_S = 60


def _fmt(n) -> str:
    n = float(n)
    return str(int(n)) if n.is_integer() else f"{n:g}".replace(".", ",")


def _ora() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ─────────────────────────────────────────────────────────────
# Lettura degli esiti di oggi (tasks.sqlite3)
# ─────────────────────────────────────────────────────────────

def _esiti(tk, oggi: str) -> Dict[int, Dict[str, Any]]:
    """{articolo_id: {rosso: ts|None, giallo_scaduto: ts|None, scorte: {tipo: ts},
    verde_dopo: [ts...], partite: set}} — ultimo valore di ogni voce, oggi."""
    rows = tk.execute("""
        SELECT it.id AS item_id, it.articolo_id, it.tipo, it.titolo, t.generato_da,
               i.stato AS istato, e.stato, e.valore_testo, e.valore_numerico, e.completato_at
          FROM checklist_execution e
          JOIN checklist_instance i ON i.id = e.instance_id
          JOIN checklist_item it    ON it.id = e.item_id
          JOIN checklist_template t ON t.id = i.template_id
         WHERE i.data_riferimento = ?
           AND t.generato_da LIKE 'linea:%'
           AND it.articolo_id IS NOT NULL
           AND it.tipo IN ('LINEA', 'SCORTA_FRIGO', 'SCORTA_GELO', 'SCORTA_DISPENSA')
         ORDER BY e.completato_at
    """, (oggi,)).fetchall()
    out: Dict[int, Dict[str, Any]] = {}
    ultima_linea: Dict[tuple, sqlite3.Row] = {}
    for r in rows:
        a = out.setdefault(r["articolo_id"], {"rosso": None, "giallo_scaduto": None,
                                              "scorte": {}, "verdi": [], "partite": set()})
        a["partite"].add((r["generato_da"] or "linea:?").split(":")[1])
        if r["tipo"] == "LINEA":
            ultima_linea[(r["articolo_id"], r["titolo"])] = r
            if r["stato"] == "OK" and r["valore_testo"] == "VERDE":
                a["verdi"].append(r["completato_at"])
        elif r["stato"] == "OK" and r["valore_numerico"] is not None:
            a["scorte"][r["tipo"]] = r["completato_at"]
    for (aid, _), r in ultima_linea.items():
        a = out[aid]
        if r["valore_testo"] == "ROSSO" and r["stato"] == "FAIL":
            a["rosso"] = max(a["rosso"] or "", r["completato_at"] or "")
        elif r["valore_testo"] == "GIALLO" and r["istato"] == "SCADUTA":
            a["giallo_scaduto"] = max(a["giallo_scaduto"] or "", r["completato_at"] or "")
    return out


# ─────────────────────────────────────────────────────────────
# Lettura di articoli e giacenze (foodcost.db)
# ─────────────────────────────────────────────────────────────

def _articolo(fc, aid: int) -> Optional[Dict[str, Any]]:
    r = fc.execute("""SELECT id, nome, um, recipe_id, ingredient_id, fornitore_freeform,
                             scorta_min_frigo, scorta_min_gelo, scorta_min_dispensa, qta_riordino
                        FROM cucina_articoli WHERE id = ? AND attivo = 1""", (aid,)).fetchone()
    return dict(r) if r else None


def _giacenza(fc, aid: int, fam: str) -> Optional[float]:
    tipi = FAMIGLIE[fam]
    r = fc.execute(f"""
        SELECT COUNT(*) AS n, SUM(COALESCE(g.qta, 0)) AS tot
          FROM cucina_giacenze g JOIN cucina_ubicazioni u ON u.id = g.ubicazione_id
         WHERE g.articolo_id = ? AND u.attivo = 1 AND u.tipo IN ({",".join("?" * len(tipi))})
           AND g.aggiornato_at IS NOT NULL
    """, (aid, *tipi)).fetchone()
    return float(r["tot"]) if r and r["n"] else None


def _sotto(fc, a: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    """{FRIGO|GELO|DISPENSA: {giacenza, minimo}} per le famiglie sotto il minimo (dato presente)."""
    out = {}
    for fam, campo in CAMPI_MIN:
        if a[campo] is None:
            continue
        g = _giacenza(fc, a["id"], fam)
        if g is not None and g < float(a[campo]):
            out[fam] = {"giacenza": g, "minimo": float(a[campo])}
    return out


def _coperto(fc, a: Dict[str, Any]) -> Optional[bool]:
    """True se la giacenza registrata copre tutti i minimi; None se non ha
    minimi o manca il dato (allora non si chiude da solo per le scorte)."""
    esiti = []
    for fam, campo in CAMPI_MIN:
        if a[campo] is None:
            continue
        g = _giacenza(fc, a["id"], fam)
        if g is None:
            return None
        esiti.append(g >= float(a[campo]))
    return all(esiti) if esiti else None


def _fornitore(fc, a: Dict[str, Any]) -> Optional[str]:
    """Da chi si ordina (Marco 2026-10-23): il preferito, se l'ha segnato,
    «sovrascrive»; altrimenti l'ultimo da cui si e' comprato. Il fornitore
    scritto sull'articolo vale come scelta esplicita per chi non fattura
    elettronicamente, dopo il preferito."""
    def uno(sql):
        try:
            r = fc.execute(sql, (a["ingredient_id"],)).fetchone()
        except sqlite3.Error:
            r = None
        return r[0] if r and r[0] else None

    if a.get("ingredient_id"):
        pref = uno("""SELECT s.name FROM ingredient_supplier_map m JOIN suppliers s ON s.id = m.supplier_id
                       WHERE m.ingredient_id = ? AND m.is_default = 1 ORDER BY m.id LIMIT 1""")
        if pref:
            return pref
    if (a.get("fornitore_freeform") or "").strip():
        return a["fornitore_freeform"].strip()
    if not a.get("ingredient_id"):
        return None
    return uno("""SELECT s.name FROM ingredient_prices p JOIN suppliers s ON s.id = p.supplier_id
                   WHERE p.ingredient_id = ? ORDER BY date(p.price_date) DESC, p.id DESC LIMIT 1""") \
        or uno("""SELECT s.name FROM ingredient_supplier_map m JOIN suppliers s ON s.id = m.supplier_id
                   WHERE m.ingredient_id = ? ORDER BY m.id DESC LIMIT 1""")


def _quanto(a: Dict[str, Any], sotto: Dict[str, Dict[str, float]]) -> Optional[str]:
    um = _UM.get((a["um"] or "").upper(), (a["um"] or "").lower())
    if a.get("qta_riordino"):
        return f"{_fmt(a['qta_riordino'])} {um}".strip()
    if sotto:
        manca = max(v["minimo"] - v["giacenza"] for v in sotto.values())
        return f"almeno {_fmt(manca)} {um}".strip()
    return None


def _motivo(a, e, sotto) -> str:
    um = _UM.get((a["um"] or "").upper(), (a["um"] or "").lower())
    pezzi = []
    if e["rosso"]:
        pezzi.append(f"linea {', '.join(sorted(e['partite']))}: rosso, manca la merce")
    for fam, v in sotto.items():
        pezzi.append(f"scorta {DOVE[fam]} {_fmt(v['giacenza'])} {um}, "
                     f"minimo {_fmt(v['minimo'])}")
    if e["giallo_scaduto"] and not pezzi:
        pezzi.append(f"linea {', '.join(sorted(e['partite']))}: rimasta gialla a fine controllo")
    return "; ".join(pezzi)


# ─────────────────────────────────────────────────────────────
# Il giro
# ─────────────────────────────────────────────────────────────

def valuta(forza: bool = True) -> Dict[str, Any]:
    global _ultimo
    if not forza and time.time() - _ultimo < _THROTTLE_S:
        return {"saltato": True}
    _ultimo = time.time()
    if not TASKS_DB.exists():
        return {"ok": False, "motivo": "tasks.sqlite3 assente"}

    oggi = date.today().isoformat()
    ora = _ora()
    tk = sqlite3.connect(TASKS_DB, timeout=30)
    tk.row_factory = sqlite3.Row
    fc = get_foodcost_connection()
    fatto = {"task_nuovi": 0, "task_aggiornati": 0, "task_chiusi": 0,
             "spesa_nuove": 0, "spesa_aggiornate": 0, "spesa_tolte": 0, "avvisi": []}
    try:
        cols = {r[1] for r in fc.execute("PRAGMA table_info(lista_spesa_items)")}
        spesa_ok = "da_confermare" in cols
        esiti = _esiti(tk, oggi)

        # 1) Esiti di oggi → task e spesa
        for aid, e in esiti.items():
            a = _articolo(fc, aid)
            if not a:
                continue
            sotto = {fam: v for fam, v in _sotto(fc, a).items()
                     if "SCORTA_" + fam in e["scorte"]}
            evento = max([t for t in [e["rosso"], e["giallo_scaduto"],
                          *[e["scorte"]["SCORTA_" + f] for f in sotto]]
                          if t] or [""])
            if not evento:
                continue
            urgente = bool(e["rosso"])
            motivo = _motivo(a, e, sotto)
            quanto = _quanto(a, sotto)
            solo_giallo = not e["rosso"] and not sotto

            if a["recipe_id"] or solo_giallo:
                verbo = "Rifornire la linea" if solo_giallo else "Produrre"
                titolo = f"{verbo}: {a['nome']}" + (f" · {quanto}" if quanto and not solo_giallo else "")
                desc = motivo + (f"\nRicetta: /ricette/{a['recipe_id']}" if a["recipe_id"] and not solo_giallo else "")
                pri = "ALTA" if urgente else "MEDIA"
                aperto = tk.execute("""
                    SELECT * FROM task_singolo
                     WHERE origine = ? AND ref_modulo = ? AND ref_id = ?
                       AND stato IN ('APERTO', 'IN_CORSO', 'SCADUTO')
                     ORDER BY id DESC LIMIT 1
                """, (ORIGINE, REF_MODULO, aid)).fetchone()
                if aperto:
                    nuova_pri = "ALTA" if (aperto["priorita"] == "ALTA" or urgente) else aperto["priorita"]
                    if solo_giallo and aperto["titolo"].startswith("Produrre"):
                        titolo, desc = aperto["titolo"], aperto["descrizione"]
                    if (aperto["titolo"], aperto["descrizione"], aperto["priorita"]) != (titolo, desc, nuova_pri):
                        tk.execute("""UPDATE task_singolo SET titolo = ?, descrizione = ?, priorita = ?,
                                             updated_at = ? WHERE id = ?""",
                                   (titolo, desc, nuova_pri, ora, aperto["id"]))
                        fatto["task_aggiornati"] += 1
                        if nuova_pri == "ALTA" and aperto["priorita"] != "ALTA":
                            fatto["avvisi"].append(titolo)
                else:
                    gia = tk.execute("""SELECT 1 FROM task_singolo WHERE origine = ? AND ref_modulo = ?
                                          AND ref_id = ? AND created_at >= ? LIMIT 1""",
                                     (ORIGINE, REF_MODULO, aid, evento)).fetchone()
                    if not gia:
                        tk.execute("""
                            INSERT INTO task_singolo
                                (titolo, descrizione, data_scadenza, priorita, stato, origine,
                                 ref_modulo, ref_id, created_by, reparto, created_at, updated_at)
                            VALUES (?, ?, ?, ?, 'APERTO', ?, ?, ?, 'linea', 'cucina', ?, ?)
                        """, (titolo, desc, oggi, pri, ORIGINE, REF_MODULO, aid, ora, ora))
                        fatto["task_nuovi"] += 1
                        if pri == "ALTA":
                            fatto["avvisi"].append(titolo)
            elif spesa_ok:
                aperta = fc.execute("""SELECT * FROM lista_spesa_items
                                        WHERE articolo_id = ? AND origine = ? AND fatto = 0
                                        ORDER BY id DESC LIMIT 1""", (aid, ORIGINE)).fetchone()
                if aperta:
                    nuovo_urg = 1 if (aperta["urgente"] or urgente) else 0
                    if (aperta["quantita_libera"], aperta["urgente"], aperta["note"]) != (quanto, nuovo_urg, motivo):
                        fc.execute("""UPDATE lista_spesa_items SET quantita_libera = ?, urgente = ?, note = ?
                                       WHERE id = ?""", (quanto, nuovo_urg, motivo, aperta["id"]))
                        fatto["spesa_aggiornate"] += 1
                else:
                    gia = fc.execute("""SELECT 1 FROM lista_spesa_items WHERE articolo_id = ? AND origine = ?
                                          AND created_at >= ? LIMIT 1""", (aid, ORIGINE, evento)).fetchone()
                    a_mano = fc.execute("""SELECT id FROM lista_spesa_items WHERE fatto = 0
                                             AND lower(titolo) = lower(?) LIMIT 1""", (a["nome"],)).fetchone()
                    if not gia and not a_mano:
                        fc.execute("""
                            INSERT INTO lista_spesa_items
                                (titolo, quantita_libera, urgente, fatto, fornitore_freeform, ingredient_id,
                                 note, created_by, created_at, articolo_id, origine, da_confermare)
                            VALUES (?, ?, ?, 0, ?, ?, ?, 'linea', ?, ?, ?, 1)
                        """, (a["nome"], quanto, 1 if urgente else 0, _fornitore(fc, a),
                              a["ingredient_id"], motivo, ora, aid, ORIGINE))
                        fatto["spesa_nuove"] += 1

        # 2) Task aperti: si chiudono da soli o si riportano a oggi
        for t in tk.execute("""SELECT * FROM task_singolo WHERE origine = ? AND ref_modulo = ?
                                 AND stato IN ('APERTO', 'IN_CORSO', 'SCADUTO')""",
                            (ORIGINE, REF_MODULO)).fetchall():
            a = _articolo(fc, t["ref_id"])
            e = esiti.get(t["ref_id"], {"verdi": [], "rosso": None})
            chiudi = False
            if a is None:
                chiudi = True
            else:
                cop = _coperto(fc, a)
                ancora_rosso = bool(e.get("rosso"))
                if cop is True and not ancora_rosso:
                    chiudi = True
                elif cop is None and not ancora_rosso and any(v > t["created_at"] for v in e["verdi"]):
                    chiudi = True
            if chiudi:
                tk.execute("""UPDATE task_singolo SET stato = 'COMPLETATO', completato_at = ?,
                                     completato_da = 'linea', note_completamento = ?, updated_at = ?
                               WHERE id = ?""",
                           (ora, "Chiuso da solo: la scorta copre il minimo o la linea e' tornata verde", ora, t["id"]))
                fatto["task_chiusi"] += 1
            elif t["data_scadenza"] != oggi or t["stato"] == "SCADUTO":
                tk.execute("UPDATE task_singolo SET data_scadenza = ?, stato = 'APERTO', updated_at = ? WHERE id = ?",
                           (oggi, ora, t["id"]))

        # 3) Proposte di spesa non piu' necessarie (solo quelle da confermare)
        if spesa_ok:
            for s in fc.execute("""SELECT * FROM lista_spesa_items WHERE origine = ? AND fatto = 0
                                     AND da_confermare = 1""", (ORIGINE,)).fetchall():
                a = _articolo(fc, s["articolo_id"]) if s["articolo_id"] else None
                e = esiti.get(s["articolo_id"], {"verdi": [], "rosso": None})
                via = a is None
                if a is not None and not e.get("rosso"):
                    cop = _coperto(fc, a)
                    via = cop is True or (cop is None and any(v > s["created_at"] for v in e["verdi"]))
                if via:
                    fc.execute("DELETE FROM lista_spesa_items WHERE id = ?", (s["id"],))
                    fatto["spesa_tolte"] += 1

        tk.commit()
        fc.commit()
    except sqlite3.Error as ex:
        tk.rollback()
        fc.rollback()
        logger.warning("linea_esiti: giro fallito: %s", ex)
        return {"ok": False, "motivo": str(ex)}
    finally:
        tk.close()
        fc.close()

    # 4) Avvisi a chef e sous chef per gli urgenti (fuori dalle transazioni)
    if fatto["avvisi"]:
        try:
            from app.services.notifiche_service import crea_notifica
            testo = "\n".join(fatto["avvisi"])
            for ruolo in ("chef", "sous_chef"):
                crea_notifica(tipo="linea_cucina", titolo="Linea: manca la merce",
                              messaggio=testo, link="/cucina/mobile/oggi", icona="🔴",
                              urgenza="alta", modulo="cucina", dest_ruolo=ruolo)
        except Exception as ex:  # l'avviso non deve mai rompere il giro
            logger.warning("linea_esiti: avviso non inviato: %s", ex)
    return {"ok": True, **fatto}


def valuta_silenzioso(forza: bool = True) -> None:
    """Per i router: il giro non deve mai far fallire la richiesta che l'ha chiamato."""
    try:
        valuta(forza=forza)
    except Exception as ex:  # pragma: no cover
        logger.warning("linea_esiti: %s", ex)
