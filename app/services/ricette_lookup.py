# Platform service — lettura ricette per altri moduli (read-only)
"""
ricette_lookup — ponte di SOLA LETTURA verso le ricette (modulo `ricette`).

Serve ai moduli che devono mostrare il nome di una ricetta o linkarla senza
importare il router delle ricette (regola 2/4 della disciplina modulare in
CLAUDE.md): oggi lo usa il Task Manager per le voci di checklist collegate a
una ricetta (mig 201, checklist_item.recipe_id).

Nessuna scrittura. Se il DB ricette non e' raggiungibile ritorna {} e chi chiama
mostra la voce senza nome di ricetta (degrado morbido, mai un 500).
"""
from typing import Dict, Iterable

from app.models.foodcost_db import get_foodcost_connection


def nomi_ricette(ids: Iterable[int]) -> Dict[int, str]:
    """{recipe_id: nome} per gli id dati (ignora None e duplicati)."""
    uniq = sorted({int(i) for i in ids if i})
    if not uniq:
        return {}
    try:
        conn = get_foodcost_connection()
    except Exception:
        return {}
    try:
        ph = ",".join("?" * len(uniq))
        rows = conn.execute(
            f"SELECT id, name FROM recipes WHERE id IN ({ph})", uniq
        ).fetchall()
        return {int(r[0]): r[1] for r in rows}
    except Exception:
        return {}
    finally:
        conn.close()


def righe_ricetta(recipe_id: int) -> list:
    """Le righe di una ricetta (sola lettura): preparazioni e componenti.

    [{tipo: 'preparazione'|'componente', recipe_id, ingredient_id, nome,
      qty, unit, sort_order}] — ordine della ricetta. [] se non leggibile.
    """
    try:
        conn = get_foodcost_connection()
    except Exception:
        return []
    try:
        rows = conn.execute(
            """
            SELECT ri.sub_recipe_id, ri.ingredient_id, ri.qty, ri.unit, ri.sort_order,
                   r.name AS nome_ricetta, i.name AS nome_ingrediente
              FROM recipe_items ri
              LEFT JOIN recipes r     ON r.id = ri.sub_recipe_id
              LEFT JOIN ingredients i ON i.id = ri.ingredient_id
             WHERE ri.recipe_id = ?
             ORDER BY ri.sort_order, ri.id
            """,
            (recipe_id,),
        ).fetchall()
        out = []
        for r in rows:
            prep = r[0] is not None
            out.append({
                "tipo": "preparazione" if prep else "componente",
                "recipe_id": r[0], "ingredient_id": r[1],
                "nome": (r[5] if prep else r[6]) or "?",
                "qty": r[2], "unit": r[3], "sort_order": r[4],
            })
        return out
    except Exception:
        return []
    finally:
        conn.close()


def nomi_ingredienti(ids: Iterable[int]) -> Dict[int, str]:
    """{ingredient_id: nome} per gli id dati — come `nomi_ricette` (2026-11-08,
    per la riga «È: …» della scheda articolo delle scorte cucina)."""
    uniq = sorted({int(i) for i in ids if i})
    if not uniq:
        return {}
    try:
        conn = get_foodcost_connection()
    except Exception:
        return {}
    try:
        ph = ",".join("?" * len(uniq))
        rows = conn.execute(f"SELECT id, name FROM ingredients WHERE id IN ({ph})", uniq).fetchall()
        return {int(r[0]): r[1] for r in rows}
    except Exception:
        return {}
    finally:
        conn.close()


def cerca_ricette_ingredienti(q: str, limite: int = 15) -> Dict[str, list]:
    """Ricerca per nome fra ingredienti e ricette attivi (sola lettura).

    {ingredienti: [{id, nome}], ricette: [{id, nome, base}], parola: str|None}.
    Ogni parola del testo deve comparire nel nome (in qualunque ordine); prima
    chi comincia con la prima parola. Le ricette BASE (preparazioni) vengono
    prima dei piatti. Se il testo intero non trova niente si riprova con la
    sola prima parola («Burro no lattosio» → «Burro»), e `parola` lo dice.
    Serve al «Collega» delle scorte cucina (2026-11-08).
    """
    vuoto = {"ingredienti": [], "ricette": [], "parola": None}
    parole = [w for w in (q or "").split() if len(w) >= 2]
    if not parole:
        return vuoto
    try:
        conn = get_foodcost_connection()
    except Exception:
        return vuoto

    def _giro(ws):
        where = " AND ".join(["name LIKE ? COLLATE NOCASE"] * len(ws))
        args = [f"%{w}%" for w in ws]
        inizio = f"{ws[0]}%"
        ing = conn.execute(
            f"""SELECT id, name FROM ingredients
                 WHERE COALESCE(is_active, 1) = 1 AND {where}
                 ORDER BY (name LIKE ? COLLATE NOCASE) DESC, length(name), name LIMIT ?""",
            (*args, inizio, limite),
        ).fetchall()
        ric = conn.execute(
            f"""SELECT id, name, is_base FROM recipes
                 WHERE COALESCE(is_active, 1) = 1 AND {where}
                 ORDER BY COALESCE(is_base, 0) DESC, (name LIKE ? COLLATE NOCASE) DESC, name LIMIT ?""",
            (*args, inizio, limite),
        ).fetchall()
        return ing, ric

    try:
        ing, ric = _giro(parole)
        parola = None
        if not ing and not ric and len(parole) > 1:
            ing, ric = _giro(parole[:1])
            parola = parole[0]
        return {
            "ingredienti": [{"id": r[0], "nome": r[1]} for r in ing],
            "ricette": [{"id": r[0], "nome": r[1], "base": bool(r[2])} for r in ric],
            "parola": parola,
        }
    except Exception:
        return vuoto
    finally:
        conn.close()


# ─── Abbinamento guidato (scorte cucina, 2026-11-08) ─────────────────────────

_STOP = {"di", "da", "del", "della", "al", "alla", "e", "in", "con", "x", "per", "il",
         "la", "lo", "le", "g", "kg", "dop", "igp", "conf", "uht"}


def _parole(s: str) -> list:
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", s).split() if w not in _STOP]


def punteggio_nome(articolo: str, candidato: str) -> int:
    """Quanto `candidato` somiglia ad `articolo`, 0-100: parole dell'articolo
    ritrovate (55%), somiglianza della stringa (30%), stessa prima parola (15%)."""
    import difflib
    ta, tb = _parole(articolo), _parole(candidato)
    if not ta or not tb:
        return 0
    cov = len(set(ta) & set(tb)) / len(set(ta))
    seq = difflib.SequenceMatcher(None, " ".join(ta), " ".join(tb)).ratio()
    return round(100 * (0.55 * cov + 0.30 * seq + 0.15 * (1 if ta[0] == tb[0] else 0)))


def proponi_collegamenti(articoli: list) -> list:
    """Per ogni (id, nome) la ricetta e l'ingrediente piu' somiglianti.

    [{articolo_id, ingrediente: {id, nome, punteggio}|None, ricetta: {...,
    base}|None}]. Le ricette base (preparazioni) prendono +5: un articolo in
    frigo e' quasi sempre una preparazione, non un piatto. Sola lettura.
    """
    try:
        conn = get_foodcost_connection()
    except Exception:
        return []
    try:
        ing = conn.execute(
            "SELECT id, name FROM ingredients WHERE COALESCE(is_active,1) = 1 AND COALESCE(placeholder,0) = 0"
        ).fetchall()
        ric = conn.execute("SELECT id, name, is_base FROM recipes WHERE COALESCE(is_active,1) = 1").fetchall()
    except Exception:
        return []
    finally:
        conn.close()
    out = []
    for aid, nome in articoli:
        bi = max(((punteggio_nome(nome, r[1]), r) for r in ing), default=(0, None), key=lambda x: x[0])
        br = max(((punteggio_nome(nome, r[1]) + (5 if r[2] else 0), r) for r in ric),
                 default=(0, None), key=lambda x: x[0])
        out.append({
            "articolo_id": aid,
            "ingrediente": {"id": bi[1][0], "nome": bi[1][1], "punteggio": bi[0]} if bi[1] else None,
            "ricetta": {"id": br[1][0], "nome": br[1][1], "base": bool(br[1][2]), "punteggio": br[0]} if br[1] else None,
        })
    return out
