#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test dell'unita' del contenuto di un articolo di Scorte (contenuto_um).

Fino al 2026-11-24 il router la validava con la valida() generica, che mette
tutto in MAIUSCOLO: «ml» diventava «ML» e veniva rifiutato contro {g, ml, pz,
porz}. Il contenuto del pezzo si poteva scrivere solo dal Controllo menu.

    cd /Users/underline83/trgb && python3 tests/test_contenuto_um.py

Solo libreria standard (niente pytest, niente fastapi).
"""

import os
import sys
import unittest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)

from app.services import controllo_menu  # noqa: E402


class TestContenutoUm(unittest.TestCase):
    def test_valori_ammessi_in_ogni_forma(self):
        for scritto, atteso in (("ml", "ml"), ("ML", "ml"), (" Ml ", "ml"),
                                ("g", "g"), ("G", "g"), ("pz", "pz"), ("PORZ", "porz")):
            self.assertEqual(controllo_menu.normalizza_um_contenuto(scritto), atteso, scritto)

    def test_vuoto_e_none(self):
        self.assertIsNone(controllo_menu.normalizza_um_contenuto(None))
        self.assertIsNone(controllo_menu.normalizza_um_contenuto(""))
        self.assertIsNone(controllo_menu.normalizza_um_contenuto("   "))

    def test_valore_sbagliato(self):
        for scritto in ("kg", "l", "litri", "porzioni"):
            with self.assertRaises(ValueError) as e:
                controllo_menu.normalizza_um_contenuto(scritto)
            self.assertIn("contenuto_um non valido", str(e.exception))

    def test_router_non_usa_piu_valida(self):
        # La riga del router deve passare dal servizio, non dalla valida() generica.
        src = open(os.path.join(RADICE, "app", "routers", "cucina_scorte_router.py"), encoding="utf-8").read()
        self.assertIn("controllo_menu.normalizza_um_contenuto(d[\"contenuto_um\"])", src)
        self.assertNotIn("controllo_menu.UM_CONTENUTO, \"contenuto_um\"", src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
