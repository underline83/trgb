# Modulo: ricette
"""
Voci «qb» (quanto basta) delle ricette — un solo punto (2026-10-25).

Una voce qb (sale, pepe, olio a crudo…) si salva con qty 0 e unit "qb": resta
nell'elenco delle voci, porta i suoi allergeni ed è FUORI dal food cost, che
l'ingrediente abbia un prezzo o no (non rende la ricetta «incompleta»).
Lo usano l'import ricette, la validazione delle voci (pagina di modifica,
connettore), il calcolo del costo e lo storico del food cost.
"""

QB_UNITS = {"qb", "q.b.", "q.b", "qb.", "q b", "quanto basta",
            "a piacere", "qs", "q.s.", "qbas"}


def is_qb(unita) -> bool:
    """True se l'unità indica 'quanto basta' / a piacere."""
    return (unita or "").strip().lower() in QB_UNITS
