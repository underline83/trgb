#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
Durata propria di una prenotazione (2026-11-26): se c'è vince sulla regola del turno e
sulla regola «gruppo = tutto il turno»; se manca vale la regola.

    cd /Users/underline83/trgb && python3 tests/test_prenotazioni_durata.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import prenotazioni_tavoli_service as t  # noqa: E402


class Durata(unittest.TestCase):
    def test_senza_durata_vale_la_regola(self):
        self.assertEqual(t._intervallo({"ora_pasto": "20:00", "pax": 2, "durata_min": None}, 120, 8), (1200, 1320))

    def test_durata_propria_vince(self):
        self.assertEqual(t._intervallo({"ora_pasto": "20:00", "pax": 2, "durata_min": 90}, 120, 8), (1200, 1290))

    def test_gruppo_tiene_tutto_il_turno(self):
        self.assertEqual(t._intervallo({"ora_pasto": "20:00", "pax": 10}, 120, 8), (0, t.TUTTO_TURNO))

    def test_gruppo_con_durata_propria(self):
        self.assertEqual(t._intervallo({"ora_pasto": "20:00", "pax": 10, "durata_min": 150}, 120, 8), (1200, 1350))


if __name__ == "__main__":
    unittest.main()
