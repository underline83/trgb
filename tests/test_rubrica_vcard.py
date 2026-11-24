#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test del contatto della rubrica del telefono (clienti_rubrica_service._vcard).

Dal 2026-11-24 ogni contatto ha il link «TRGB» alla scheda del cliente nel
gestionale: dal telefono non si scrive (CardDAV in sola lettura), si tocca il
link e si corregge in TRGB.

    cd /Users/underline83/trgb && python3 tests/test_rubrica_vcard.py

Solo libreria standard (niente pytest, niente fastapi).
"""

import os
import sys
import unittest
from unittest import mock

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)

from app.services import clienti_rubrica_service as rub  # noqa: E402


def _cliente(**extra):
    c = {"id": 3647, "uid": "trgb-cliente-3647", "nome": "", "cognome": "Agazzi", "telefoni": ["+393333812403"],
         "stelle": 2, "nere": 2, "argento": 0, "oro": 0, "segmento": "affezionato",
         "visite": 4, "etichette": []}
    c.update(extra)
    return c


def _righe(vcard):
    return vcard.split("\r\n")


class TestLinkTrgb(unittest.TestCase):
    def test_link_alla_scheda_con_etichetta(self):
        righe = _righe(rub._vcard(_cliente(), "TG", "https://app.tregobbi.it"))
        self.assertIn("item1.URL:https://app.tregobbi.it/clienti/3647", righe)
        self.assertIn("item1.X-ABLabel:TRGB", righe)
        # il resto del contatto non cambia
        self.assertIn("FN:TG Agazzi ★★", righe)
        self.assertIn("N:Agazzi;;;TG;★★", righe)
        self.assertEqual(righe[-2], "END:VCARD")

    def test_senza_indirizzo_niente_link(self):
        v = rub._vcard(_cliente(), "TG")
        self.assertNotIn("URL", v)
        self.assertNotIn("X-ABLabel", v)

    def test_url_app_da_env(self):
        with mock.patch.dict(os.environ, {"TRGB_APP_URL": "https://prova.example/ "}):
            self.assertEqual(rub._url_app(), "https://prova.example")

    def test_url_app_da_locale(self):
        with mock.patch.dict(os.environ, {"TRGB_APP_URL": ""}), \
             mock.patch("app.utils.locale_data.locale_info", return_value={"dominio_app": "app.tregobbi.it"}):
            self.assertEqual(rub._url_app(), "https://app.tregobbi.it")

    def test_url_app_assente(self):
        with mock.patch.dict(os.environ, {"TRGB_APP_URL": ""}), \
             mock.patch("app.utils.locale_data.locale_info", return_value={}):
            self.assertEqual(rub._url_app(), "")

    def test_locale_vero_tregobbi(self):
        # locali/tregobbi/locale.json ha dominio_app = app.tregobbi.it
        with mock.patch.dict(os.environ, {"TRGB_APP_URL": "", "TRGB_LOCALE": "tregobbi"}):
            self.assertEqual(rub._url_app(), "https://app.tregobbi.it")


if __name__ == "__main__":
    unittest.main(verbosity=2)
