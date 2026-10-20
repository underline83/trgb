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
