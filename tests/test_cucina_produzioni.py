#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Registro produzioni e codice lotto (decisioni di Marco del 2026-11-26): numero del
giorno, numero persona mai riusato, correzioni, annullo, lettura del codice.
DB in memoria, chiave di prova, persone finte.

    cd /Users/underline83/trgb && python3 tests/test_cucina_produzioni.py
"""

import os
import sqlite3
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["LOTTO_CHIAVE"] = "chiave-di-prova"

from app.models.cucina_produzioni_db import apply_schema  # noqa: E402
from app.services import cucina_lotto_codice as lc  # noqa: E402
from app.services import cucina_produzioni_service as svc  # noqa: E402

OGGI = date(2026, 11, 26)
PERSONE = [{"username": "marco", "nome": "Marco"}, {"username": "anna", "nome": "Anna"}]


class Base(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        apply_schema(self.c)
        apply_schema(self.c)  # due volte: non deve rompersi
        self.c.execute("CREATE TABLE recipes (id INTEGER PRIMARY KEY, name TEXT, is_active INTEGER)")
        self.c.executemany("INSERT INTO recipes (name, is_active) VALUES (?, ?)",
                           [("Amaro dell'Oste", 1), ("Amaretti", 1), ("Amatriciana vecchia", 0)])
        self._vere = svc.persone_possibili
        svc.persone_possibili = lambda: list(PERSONE)

    def tearDown(self):
        svc.persone_possibili = self._vere
        self.c.close()

    def reg(self, **k):
        base = dict(nome="Amaro dell'Oste", persona="marco", utente="marco", oggi=OGGI)
        base.update(k)
        return svc.registra(self.c, **base)


class Registro(Base):
    def test_numeri_del_giorno_e_codice(self):
        a, b, c = self.reg(), self.reg(persona="anna"), self.reg()
        self.assertEqual([a["numero"], b["numero"], c["numero"]], [1, 2, 3])
        self.assertEqual([a["persona_numero"], b["persona_numero"], c["persona_numero"]], [1, 2, 1])
        self.assertEqual(len({a["codice"], b["codice"], c["codice"]}), 3)
        self.assertEqual(lc.leggi(c["codice"]), lc.Lotto(OGGI, 1, 3))
        self.assertEqual(c["persona_nome"], "Marco")

    def test_ogni_giorno_riparte_da_uno(self):
        self.reg(); self.reg()
        ieri = self.reg(data="2026-11-25")
        self.assertEqual(ieri["numero"], 1)
        self.assertEqual(ieri["data"], "2026-11-25")

    def test_numero_persona_non_si_riusa(self):
        self.reg(persona="anna")
        self.c.execute("DELETE FROM cucina_produzioni")
        self.assertEqual(self.reg(persona="marco")["persona_numero"], 2)
        self.assertEqual(self.reg(persona="anna")["persona_numero"], 1)

    def test_rifiuti(self):
        for k in (dict(nome="  "), dict(nome="x" * 81), dict(persona="sconosciuto"),
                  dict(data="2026-11-27"), dict(data="boh"), dict(etichette=0),
                  dict(data_scadenza="2026-11-20")):
            with self.assertRaises(svc.ProduzioneErrore, msg=str(k)):
                self.reg(**k)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM cucina_produzioni").fetchone()[0], 0)

    def test_novantanove_al_giorno(self):
        for _ in range(99):
            self.reg()
        with self.assertRaises(svc.ProduzioneErrore):
            self.reg()

    def test_annullata_tiene_numero_e_codice(self):
        a = self.reg()
        ann = svc.annulla(self.c, a["id"], "marco")
        self.assertTrue(ann["annullata"])
        self.assertEqual(ann["codice"], a["codice"])
        self.assertEqual(self.reg()["numero"], 2)
        with self.assertRaises(svc.ProduzioneErrore):
            svc.correggi(self.c, a["id"], utente="marco", nome="Altro")

    def test_correggi_solo_cio_che_non_sta_nel_codice(self):
        a = self.reg(recipe_id=1, data_scadenza="2027-11-26", etichette=6)
        b = svc.correggi(self.c, a["id"], utente="marco", nome="Amaro (prova)", etichette=8, togli_scadenza=True)
        self.assertEqual((b["nome"], b["etichette"], b["data_scadenza"], b["recipe_id"]), ("Amaro (prova)", 8, None, None))
        self.assertEqual((b["codice"], b["data"], b["numero"], b["persona_numero"]),
                         (a["codice"], a["data"], a["numero"], a["persona_numero"]))
        with self.assertRaises(svc.ProduzioneErrore):
            svc.correggi(self.c, a["id"], utente="marco", data_scadenza="2026-01-01")

    def test_elenco(self):
        self.reg(); self.reg(data="2026-11-25"); self.reg(data="2026-11-01")
        righe = svc.elenco(self.c, date(2026, 11, 20), OGGI)
        self.assertEqual([r["data"] for r in righe], ["2026-11-26", "2026-11-25"])


class Leggi(Base):
    def test_a_registro_anche_scritto_male(self):
        a = self.reg()
        r = svc.leggi_codice(self.c, f" {a['codice'][:3].lower()}-{a['codice'][3:]} ")
        self.assertTrue(r["a_registro"])
        self.assertEqual((r["nome"], r["persona_nome"], r["numero"]), ("Amaro dell'Oste", "Marco", 1))

    def test_a_registro_anche_senza_chiave(self):
        a = self.reg()
        os.environ["LOTTO_CHIAVE"] = "chiave-cambiata"
        try:
            self.assertTrue(svc.leggi_codice(self.c, a["codice"])["a_registro"])
        finally:
            os.environ["LOTTO_CHIAVE"] = "chiave-di-prova"

    def test_valido_ma_non_a_registro(self):
        a = self.reg()
        self.c.execute("DELETE FROM cucina_produzioni")
        r = svc.leggi_codice(self.c, a["codice"])
        self.assertFalse(r["a_registro"])
        self.assertEqual((r["data"], r["numero"], r["persona_nome"], r["nome"]), ("2026-11-26", 1, "Marco", None))

    def test_non_valido(self):
        for brutto in ("", "ABC", "A0CDEF"):
            with self.assertRaises(svc.ProduzioneErrore):
                svc.leggi_codice(self.c, brutto)


class Suggerimenti(Base):
    def test_gia_prodotto_poi_ricette_attive(self):
        self.reg(nome="Amaro di prova")
        s = svc.suggerimenti(self.c, "ama")
        self.assertEqual(s[0], {"nome": "Amaro di prova", "recipe_id": None, "origine": "gia_prodotto"})
        self.assertEqual({x["nome"] for x in s[1:]}, {"Amaro dell'Oste", "Amaretti"})
        self.assertEqual(svc.suggerimenti(self.c, "a"), [])

    def test_senza_tabella_ricette(self):
        self.c.execute("DROP TABLE recipes")
        self.reg(nome="Giardiniera")
        self.assertEqual([x["nome"] for x in svc.suggerimenti(self.c, "giard")], ["Giardiniera"])


class Chiave(unittest.TestCase):
    def test_nasce_da_sola_e_resta(self):
        import tempfile
        from pathlib import Path
        from app.utils import locale_data
        vecchia = os.environ.pop("LOTTO_CHIAVE")
        vero = locale_data.locale_data_path
        with tempfile.TemporaryDirectory() as d:
            locale_data.locale_data_path = lambda f: Path(d) / f
            try:
                c1 = lc.genera(OGGI, 1, 1)
                self.assertTrue((Path(d) / "lotto_chiave.json").exists())
                self.assertEqual(lc.genera(OGGI, 1, 1), c1)
                self.assertEqual(lc.leggi(c1), lc.Lotto(OGGI, 1, 1))
                (Path(d) / "lotto_chiave.json").write_text("rotto", encoding="utf-8")
                with self.assertRaises(lc.CodiceLottoErrore):
                    lc.genera(OGGI, 1, 1)
            finally:
                locale_data.locale_data_path = vero
                os.environ["LOTTO_CHIAVE"] = vecchia


if __name__ == "__main__":
    unittest.main(verbosity=2)
