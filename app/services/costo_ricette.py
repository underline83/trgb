# Modulo: platform (servizio condiviso ricette ↔ menu pranzo)
# @version: v1.0 — costo di riga unico (2026-11-15)
# -*- coding: utf-8 -*-
"""
Costo di una riga ricetta e di una ricetta — UN SOLO CONTO per tutti.

PERCHE' ESISTE
--------------
Fino al 14/11/2026 il costo di riga era calcolato in cinque posti (totale
ricetta, scheda, ricette per ingrediente, storico del food cost, costi medi
del menu pranzo), con regole diverse. Il totale e la scheda, se l'unità della
riga non si convertiva verso l'unità base dell'ingrediente (o verso la resa
della base), moltiplicavano la quantità grezza: 40 ml di una base che rende
in kg = 40 kg (risotto Kissabel, 241 € a porzione). Storico e pranzo non
convertivano proprio: 70 g su un ingrediente a kg = 70 kg.

REGOLE (decise da Marco il 15/11/2026)
--------------------------------------
1. Unità non convertibile → la riga resta SENZA COSTO (motivo «unita»), mai
   la quantità grezza. La ricetta risulta parziale, come con un ingrediente
   senza prezzo.
2. Niente densità inventate: ml ↔ g solo con la conversione personalizzata
   dell'ingrediente (ingredient_unit_conversions). Per le basi non c'è:
   la riga si riscrive nell'unità della resa.
3. Una funzione sola (`costo_riga`) usata da tutti; `costo_ricetta` la applica
   ricorsivamente e conta righe senza costo e basi parziali.
4. Il motivo si dice: «unità non convertibile: g → ml» è diverso da
   «ingrediente senza prezzo» (`testo_motivo`).

Il prezzo dell'ingrediente si passa come funzione (`prezzo_ingrediente`):
di default il prezzo corrente (servizio platform prezzi_ingredienti, mediana),
lo storico passa il prezzo vigente a una data.

Le conversioni (UNIT_TO_BASE, convert_qty…) sono state spostate qui da
foodcost_recipes_router, che le riesporta con lo stesso nome.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Set, Tuple

from app.services.prezzi_ingredienti import finestra_giorni, prezzo_corrente
from app.services.ricette_qb import is_qb


# ─────────────────────────────────────────────
#   CONVERSIONE UNITÀ (spostata da foodcost_recipes_router, 2026-11-15)
# ─────────────────────────────────────────────

# Fattori di conversione verso l'unità base (kg per peso, L per liquidi)
UNIT_TO_BASE = {
    "kg": 1.0,
    "g": 0.001,
    "mg": 0.000001,
    "L": 1.0,
    "l": 1.0,
    "ml": 0.001,
    "cl": 0.01,
    "pz": 1.0,
    # Sinonimi frequenti nelle fatture elettroniche (fix 2026-06-07)
    "gr": 0.001,    # grammi scritti "GR"
    "hg": 0.1,      # ettogrammi
    "lt": 1.0,      # litri scritti "LT"
    "lit": 1.0,
    # Pezzi come li scrivono le fatture (2026-10-23): «PEZZI» di Milesi,
    # «N.», «NR», «NUM.», «PCS», «EA», «CAD». Stessa famiglia di «pz»: un
    # prezzo a pezzo entra come prezzo a pezzo. CF/CT (confezione, cartone)
    # restano fuori apposta: lì serve il fattore.
    "pezzi": 1.0,
    "pezzo": 1.0,
    "n": 1.0,
    "nr": 1.0,
    "num": 1.0,
    "pcs": 1.0,
    "ea": 1.0,
    "cad": 1.0,
}


def _norm_unit(u: str) -> str:
    """Normalizza un'unità fattura: trim, minuscole, via punti ('KG.' → 'kg')."""
    return (u or "").strip().lower().replace(".", "")


def convert_qty(qty: float, from_unit: str, to_unit: str,
                ingredient_id: int = None, cur=None) -> Optional[float]:
    """
    Converte una quantità da from_unit a to_unit.

    1. Se ingredient_id e cur sono forniti, cerca prima conversioni personalizzate
       nella tabella ingredient_unit_conversions (es. 1 pz = 60g per le uova)
    2. Altrimenti usa le conversioni standard (kg↔g↔mg, L↔ml↔cl)
    3. Ritorna None se la conversione non è possibile (unità incompatibili).
    """
    fu = _norm_unit(from_unit)
    tu = _norm_unit(to_unit)

    if fu == tu:
        return qty

    # 1. Prova conversione personalizzata per ingrediente
    if ingredient_id and cur:
        custom = _get_custom_conversion(cur, ingredient_id, fu, tu)
        if custom is not None:
            return qty * custom

    # 2. Conversione standard
    f_base = UNIT_TO_BASE.get(fu)
    t_base = UNIT_TO_BASE.get(tu)

    if f_base is None or t_base is None:
        return None

    # Verifica compatibilità STRETTA per famiglia (fix 2026-06-07):
    # peso↔peso, volume↔volume, pz↔pz. Prima il check era lasco e 'pz'
    # convertiva implicitamente verso peso/volume come se 1 pz = 1 kg/L —
    # fonte di prezzi sballati. pz→peso/volume ora richiede SEMPRE una
    # conversione personalizzata (gestita sopra, punto 1).
    weight_units = {"kg", "g", "mg", "gr", "hg"}
    volume_units = {"l", "ml", "cl", "lt", "lit"}

    def _family(u: str) -> Optional[str]:
        if u in weight_units:
            return "peso"
        if u in volume_units:
            return "volume"
        if u in {"pz", "pezzi", "pezzo", "n", "nr", "num", "pcs", "ea", "cad"}:
            return "pz"
        return None

    if _family(fu) is None or _family(fu) != _family(tu):
        return None

    return qty * f_base / t_base


def _get_custom_conversion(cur, ingredient_id: int, fu: str, tu: str) -> Optional[float]:
    """
    Cerca una conversione personalizzata per un ingrediente.
    Cerca sia diretta (from→to) sia inversa (to→from con 1/factor).
    """
    # Diretta
    row = cur.execute(
        """
        SELECT factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND LOWER(from_unit) = ? AND LOWER(to_unit) = ?
        """,
        (ingredient_id, fu, tu),
    ).fetchone()
    if row:
        return row["factor"]

    # Inversa
    row = cur.execute(
        """
        SELECT factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND LOWER(from_unit) = ? AND LOWER(to_unit) = ?
        """,
        (ingredient_id, tu, fu),
    ).fetchone()
    if row and row["factor"] != 0:
        return 1.0 / row["factor"]

    # Prova conversione a catena: from → intermediario → to
    # Es: pz → g (custom) poi g → kg (standard)
    customs = cur.execute(
        """
        SELECT from_unit, to_unit, factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND (LOWER(from_unit) = ? OR LOWER(to_unit) = ?)
        """,
        (ingredient_id, fu, fu),
    ).fetchall()

    for c in customs:
        c_from = c["from_unit"].strip().lower()
        c_to = c["to_unit"].strip().lower()

        if c_from == fu:
            # from → c_to (custom), c_to → to (standard?)
            intermediate = c["factor"]
            std = _standard_convert(c_to, tu)
            if std is not None:
                return intermediate * std
        elif c_to == fu:
            # from → c_from (inverse custom), c_from → to (standard?)
            if c["factor"] != 0:
                intermediate = 1.0 / c["factor"]
                std = _standard_convert(c_from, tu)
                if std is not None:
                    return intermediate * std

    # Catena lato DESTINAZIONE (fix 2026-06-07, "cose pesabili"):
    # standard prima, custom dopo. Es. ingrediente a numero con "1 n = 20 g":
    # KG → n  =  KG → g (standard, 1000)  ×  g → n (custom inversa, 1/20)  =  50.
    # Copre fatture a peso/volume per ingredienti contati a numero e viceversa.
    customs_tu = cur.execute(
        """
        SELECT from_unit, to_unit, factor FROM ingredient_unit_conversions
        WHERE ingredient_id = ? AND (LOWER(from_unit) = ? OR LOWER(to_unit) = ?)
        """,
        (ingredient_id, tu, tu),
    ).fetchall()

    for c in customs_tu:
        c_from = c["from_unit"].strip().lower()
        c_to = c["to_unit"].strip().lower()

        if c_from == tu and c["factor"] != 0:
            # from → c_to (standard), poi c_to → tu (custom inversa)
            std = _standard_convert(fu, c_to)
            if std is not None:
                return std / c["factor"]
        elif c_to == tu:
            # from → c_from (standard), poi c_from → tu (custom diretta)
            std = _standard_convert(fu, c_from)
            if std is not None:
                return std * c["factor"]

    return None


def _standard_convert(fu: str, tu: str) -> Optional[float]:
    """
    Conversione solo standard (senza custom), usata internamente.
    Fix 2026-06-07: famiglie STRETTE come convert_qty (peso↔peso,
    volume↔volume, pz↔pz) — prima 'pz' convertiva a peso come 1 pz = 1 kg.
    """
    fu = _norm_unit(fu)
    tu = _norm_unit(tu)
    if fu == tu:
        return 1.0
    f_base = UNIT_TO_BASE.get(fu)
    t_base = UNIT_TO_BASE.get(tu)
    if f_base is None or t_base is None:
        return None

    weight_units = {"kg", "g", "mg", "gr", "hg"}
    volume_units = {"l", "ml", "cl", "lt", "lit"}

    def _family(u: str) -> Optional[str]:
        if u in weight_units:
            return "peso"
        if u in volume_units:
            return "volume"
        if u in {"pz", "pezzi", "pezzo", "n", "nr", "num", "pcs", "ea", "cad"}:
            return "pz"
        return None

    if _family(fu) is None or _family(fu) != _family(tu):
        return None

    return f_base / t_base


# ─────────────────────────────────────────────
#   COSTO DI RIGA
# ─────────────────────────────────────────────

# Motivi per cui una riga non ha costo (o lo ha incompleto)
QB = "qb"                                  # voce «qb»: fuori dal food cost (costo 0)
SENZA_PREZZO = "senza_prezzo"              # ingrediente senza prezzo
UNITA = "unita"                            # unità della riga non convertibile
UNITA_BASE_MANCANTE = "unita_base_mancante"  # ingrediente senza unità base
BASE_SENZA_COSTO = "base_senza_costo"      # la base non ha nessuna riga con costo
RESA_MANCANTE = "resa_mancante"            # la base non ha resa
VOCE_VUOTA = "voce_vuota"                  # riga senza ingrediente né base

PrezzoFn = Callable[[int], Optional[float]]


def testo_motivo(motivo: Optional[str], da_unita: Optional[str] = None,
                 a_unita: Optional[str] = None) -> Optional[str]:
    """Il motivo in parole, per la scheda e il connettore. None se la riga ha costo."""
    if motivo == UNITA:
        return f"unità non convertibile: {da_unita or '?'} → {a_unita or '?'}"
    return {
        SENZA_PREZZO: "ingrediente senza prezzo",
        UNITA_BASE_MANCANTE: "ingrediente senza unità base",
        BASE_SENZA_COSTO: "base senza costo",
        RESA_MANCANTE: "base senza resa",
        VOCE_VUOTA: "voce senza ingrediente",
    }.get(motivo)


def _riga(costo, costo_unitario=None, motivo=None, da=None, a=None,
          base_parziale=False) -> Dict[str, Any]:
    return {
        "costo": costo,                    # € della riga; None = senza costo
        "costo_unitario": costo_unitario,  # €/unità base o €/unità di resa
        "motivo": motivo,                  # uno dei codici sopra, None se ok
        "da_unita": da, "a_unita": a,      # solo per motivo UNITA
        "base_parziale": base_parziale,    # la base usata ha righe senza costo
        "testo": testo_motivo(motivo, da, a) if motivo != QB else None,
    }


def costo_riga(cur, item, prezzo_ingrediente: PrezzoFn,
               costo_base: Callable[[int], Tuple[Optional[float], bool]]) -> Dict[str, Any]:
    """Costo di UNA riga ricetta (item con ingredient_id, sub_recipe_id, qty, unit).

    prezzo_ingrediente(id) → €/unità base dell'ingrediente, o None.
    costo_base(id)         → (costo totale della base, base parziale?).
    """
    qty = item["qty"] or 0
    unit = item["unit"]

    # Voce «qb»: fuori dal food cost, anche se l'ingrediente non ha prezzo
    # (non deve rendere la ricetta parziale).
    if is_qb(unit):
        return _riga(0.0, motivo=QB)

    if item["ingredient_id"]:
        iid = item["ingredient_id"]
        unit_cost = prezzo_ingrediente(iid)
        if unit_cost is None:
            return _riga(None, motivo=SENZA_PREZZO)
        row = cur.execute("SELECT default_unit FROM ingredients WHERE id = ?", (iid,)).fetchone()
        default_unit = row["default_unit"] if row else None
        if not default_unit:
            return _riga(None, unit_cost, UNITA_BASE_MANCANTE)
        # Conversione nell'unità base, con le conversioni personalizzate
        converted = convert_qty(qty, unit, default_unit, ingredient_id=iid, cur=cur)
        if converted is None:
            return _riga(None, unit_cost, UNITA, unit, default_unit)
        return _riga(converted * unit_cost, unit_cost)

    if item["sub_recipe_id"]:
        sid = item["sub_recipe_id"]
        sub_cost, parziale = costo_base(sid)
        if sub_cost is None:
            return _riga(None, motivo=BASE_SENZA_COSTO)
        sub = cur.execute(
            "SELECT yield_qty, yield_unit FROM recipes WHERE id = ?", (sid,),
        ).fetchone()
        if not sub or not sub["yield_qty"]:
            return _riga(None, motivo=RESA_MANCANTE)
        cpu = sub_cost / sub["yield_qty"]
        # Le basi non hanno conversioni personalizzate: ml ↔ g non si fa
        converted = convert_qty(qty, unit, sub["yield_unit"] or "")
        if converted is None:
            return _riga(None, cpu, UNITA, unit, sub["yield_unit"])
        return _riga(converted * cpu, cpu, base_parziale=parziale)

    return _riga(None, motivo=VOCE_VUOTA)


def prezzo_corrente_fn(cur) -> PrezzoFn:
    """Il prezzo corrente (mediana nella finestra) con la finestra letta una volta."""
    finestra = finestra_giorni(cur)
    cache: Dict[int, Optional[float]] = {}

    def _p(iid: int) -> Optional[float]:
        if iid not in cache:
            cache[iid] = prezzo_corrente(cur, iid, finestra)
        return cache[iid]
    return _p


def costo_ricetta(cur, recipe_id: int, prezzo_ingrediente: Optional[PrezzoFn] = None,
                  _visited: Optional[Set[int]] = None) -> Dict[str, Any]:
    """Costo di una ricetta, risolvendo le basi.

    Ritorna {"totale", "righe": [(item, riga)], "senza_costo", "basi_parziali", "parziale"}.
    totale: somma delle righe con costo; None se nessuna riga ha costo (e non
    sono tutte a posto) o se la ricetta è già nel percorso (ciclo).
    senza_costo: righe senza costo (qb escluse). basi_parziali: righe che usano
    una base a sua volta parziale.
    """
    if prezzo_ingrediente is None:
        prezzo_ingrediente = prezzo_corrente_fn(cur)
    visited = set(_visited or ())
    vuoto = {"totale": None, "righe": [], "senza_costo": 0, "basi_parziali": 0, "parziale": False}
    if recipe_id in visited:
        return vuoto  # ciclo
    visited.add(recipe_id)

    items = cur.execute(
        """
        SELECT ingredient_id, sub_recipe_id, qty, unit
        FROM recipe_items
        WHERE recipe_id = ?
        ORDER BY sort_order, id
        """,
        (recipe_id,),
    ).fetchall()

    def _base(sid: int) -> Tuple[Optional[float], bool]:
        r = costo_ricetta(cur, sid, prezzo_ingrediente, visited)
        return r["totale"], r["parziale"]

    total = 0.0
    righe = []
    senza = 0
    parziali = 0
    for it in items:
        r = costo_riga(cur, it, prezzo_ingrediente, _base)
        righe.append((it, r))
        if r["costo"] is None:
            senza += 1
        else:
            total += r["costo"]
            if r["base_parziale"]:
                parziali += 1

    all_priced = senza == 0
    return {
        "totale": total if total > 0 or all_priced else None,
        "righe": righe,
        "senza_costo": senza,
        "basi_parziali": parziali,
        "parziale": senza > 0 or parziali > 0,
    }


def testo_parziale(senza_costo: int, basi_parziali: int) -> Optional[str]:
    """«parziale: 2 righe senza costo, 1 base incompleta» — None se completo."""
    pezzi = []
    if senza_costo:
        pezzi.append(f"{senza_costo} {'riga' if senza_costo == 1 else 'righe'} senza costo")
    if basi_parziali:
        pezzi.append(f"{basi_parziali} {'base incompleta' if basi_parziali == 1 else 'basi incomplete'}")
    return ("parziale: " + ", ".join(pezzi)) if pezzi else None
