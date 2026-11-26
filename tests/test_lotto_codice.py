#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Codice lotto di produzione (decisione di Marco del 2026-11-26): 6 caratteri che
TRGB rilegge in data, persona e numero produzione. Solo calcolo, niente DB.

    cd /Users/underline83/trgb && python3 tests/test_lotto_codice.py
"""

import os
import random
import sys
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import cucina_lotto_codice as lc  # noqa: E402

K = "chiave-di-prova"


class CodiceLotto(unittest.TestCase):
    def test_andata_e_ritorno(self):
        rnd = random.Random(7)
        for _ in range(20000):
            d = date(2026, 1, 1) + timedelta(days=rnd.randrange(3728))
            p, n = rnd.randint(1, 90), rnd.randrange(100)
            c = lc.genera(d, p, n, K)
            self.assertEqual(len(c), 6)
            self.assertTrue(all(ch in lc.ALFABETO for ch in c))
            self.assertEqual(lc.leggi(c, K), lc.Lotto(d, p, n))

    def test_estremi(self):
        for d, p, n in [(date(2026, 1, 1), 1, 0), (lc.ULTIMO_GIORNO, 90, 99)]:
            self.assertEqual(lc.leggi(lc.genera(d, p, n, K), K), lc.Lotto(d, p, n))

    def test_un_giorno_intero_senza_doppioni(self):
        d = date(2027, 3, 14)
        codici = {lc.genera(d, p, n, K) for p in range(1, 91) for n in range(100)}
        self.assertEqual(len(codici), 9000)

    def test_vicini_non_si_somigliano(self):
        # Stessa persona, stesso giorno, produzioni 1..99: in media i codici
        # consecutivi non devono avere quasi niente in comune (a caso: ~1/32 per posto).
        d = date(2027, 3, 14)
        cs = [lc.genera(d, 5, n, K) for n in range(100)]
        uguali = sum(a[i] == b[i] for a, b in zip(cs, cs[1:]) for i in range(6))
        self.assertLess(uguali / (99 * 6), 0.10)

    def test_battuto_male_viene_rifiutato(self):
        c = lc.genera(date(2027, 3, 14), 5, 3, K)
        rifiutati = totale = 0
        for i in range(6):
            for ch in lc.ALFABETO:
                if ch == c[i]:
                    continue
                totale += 1
                try:
                    lc.leggi(c[:i] + ch + c[i + 1:], K)
                except lc.CodiceLottoErrore:
                    rifiutati += 1
        self.assertGreater(rifiutati / totale, 0.90)

    def test_chiave_diversa_non_legge(self):
        letti = 0
        for n in range(100):
            c = lc.genera(date(2027, 3, 14), 5, n, K)
            try:
                if lc.leggi(c, "altra-chiave") == lc.Lotto(date(2027, 3, 14), 5, n):
                    letti += 1
            except lc.CodiceLottoErrore:
                pass
        self.assertEqual(letti, 0)

    def test_scritto_con_spazi_e_minuscole(self):
        c = lc.genera(date(2027, 3, 14), 5, 3, K)
        self.assertEqual(lc.leggi(f" {c[:3].lower()}-{c[3:]} ", K).persona, 5)

    def test_fuori_formato(self):
        for d, p, n in [(date(2025, 12, 31), 1, 1), (lc.ULTIMO_GIORNO + timedelta(days=1), 1, 1),
                        (date(2027, 1, 1), 0, 1), (date(2027, 1, 1), 91, 1), (date(2027, 1, 1), 1, 100)]:
            with self.assertRaises(lc.CodiceLottoErrore):
                lc.genera(d, p, n, K)
        for brutto in ["", "ABC", "ABCDEFG", "A0CDEF", "ABCDE1"]:
            with self.assertRaises(lc.CodiceLottoErrore):
                lc.leggi(brutto, K)


if __name__ == "__main__":
    unittest.main(verbosity=2)
