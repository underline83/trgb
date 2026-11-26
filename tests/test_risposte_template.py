#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test dei template di risposta ai clienti (clienti_risposte_service, mig 246).
DB temporaneo, menù e «c'è posto?» finti: non tocca produzione, non va in rete.

    cd /Users/underline83/trgb && python3 tests/test_risposte_template.py
"""

import importlib.util
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from pathlib import Path

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
TMP = tempfile.mkdtemp(prefix="trgb_risposte_")

_ld = types.ModuleType("app.utils.locale_data")
_ld.locale_data_path = lambda n: Path(TMP) / n
_ld.locale_data_dir = lambda: Path(TMP)
_ld.locale_info = lambda: {}
sys.modules["app.utils.locale_data"] = _ld

DB = Path(TMP) / "clienti.sqlite3"
_c = sqlite3.connect(str(DB))
_c.execute("CREATE TABLE clienti_impostazioni (chiave TEXT PRIMARY KEY, valore TEXT, descrizione TEXT)")
_c.commit()
_c.close()

_cdb = types.ModuleType("app.models.clienti_db")


def _conn():
    c = sqlite3.connect(str(DB))
    c.row_factory = sqlite3.Row
    return c


_cdb.get_clienti_conn = _conn
sys.modules["app.models.clienti_db"] = _cdb

_spec = importlib.util.spec_from_file_location(
    "mig246", os.path.join(RADICE, "app", "migrations", "246_clienti_risposte_template.py"))
mig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mig)
mig.upgrade(None)
mig.upgrade(None)   # idempotente

from app.services import clienti_risposte_service as srv  # noqa: E402

MENU = {"id": 9, "nome": "Natale 2026", "prezzo_persona": 80.0, "righe": [
    {"name": "Millefoglie di polenta", "description": None},
    {"name": "Bis di primi", "description": "Casoncello · Risotto"},
    {"name": "  ", "description": "riga vuota"},
]}
NATALE = {
    "nome": "Pranzo di Natale 2026", "occasione_data": "2026-12-25", "occasione_turno": "pranzo",
    "pax_prova": 2, "menu_template_id": 9, "oggetto": "Pranzo di Natale – {data}",
    "testo_mail": "Buongiorno {nome},\n\ngrazie.\n\n{menu}\n\n{prezzo}, bevande escluse.\n\n{disponibilita}\n\nMarco",
    "testo_wa": "Ciao {nome}! Menù a {prezzo}. {disponibilita}",
    "disp_posto": "Abbiamo ancora posto: prenoti qui\n{link_prenotazione}",
    "disp_pieno": "Purtroppo siamo al completo.",
}


def posto(si, motivo=None):
    return lambda d, t, p: {"data": d, "turno": t, "pax": p, "posto": si, "motivo": motivo,
                            "coperti": 10, "capienza": 40, "orari": ["13:00"] if si else []}


def compila(t=NATALE, **kw):
    kw.setdefault("menu_fn", lambda i: MENU)
    kw.setdefault("prezzo_fn", lambda m: "80 € a persona")
    kw.setdefault("posto_fn", posto(True))
    kw.setdefault("link", "https://esempio.it/prenota")
    return srv.compila(t, **kw)


class Compila(unittest.TestCase):
    def test_posto(self):
        r = compila(nome="Madi")
        self.assertTrue(r["testo"].startswith("Buongiorno Madi,"))
        self.assertIn("Millefoglie di polenta\nBis di primi: Casoncello · Risotto", r["testo"])
        self.assertNotIn("riga vuota", r["testo"])
        self.assertIn("80 € a persona, bevande escluse.", r["testo"])
        self.assertIn("prenoti qui\nhttps://esempio.it/prenota", r["testo"])
        self.assertNotIn("al completo", r["testo"])
        self.assertEqual(r["avvisi"], [])
        self.assertIn("10 coperti su 40", r["disponibilita"]["frase"])
        self.assertIn("c'è posto", r["disponibilita"]["frase"])
        self.assertNotIn("{", r["testo"] + r["oggetto"])

    def test_pieno(self):
        r = compila(posto_fn=posto(False, "pieno"))
        self.assertIn("Purtroppo siamo al completo.", r["testo"])
        self.assertNotIn("prenoti qui", r["testo"])
        self.assertEqual(r["avvisi"], [])          # il link non serve: niente avviso
        self.assertIn("niente posto", r["disponibilita"]["frase"])

    def test_senza_nome(self):
        r = compila()
        self.assertTrue(r["testo"].startswith("Buongiorno,"))

    def test_non_si_sa(self):
        r = compila(posto_fn=posto(None, "senza_orari"))
        self.assertNotIn("al completo", r["testo"])
        self.assertNotIn("prenoti qui", r["testo"])
        self.assertTrue(any("controllare i tavoli" in a for a in r["avvisi"]))
        self.assertNotIn("\n\n\n", r["testo"])

    def test_manca_link(self):
        r = compila(link="")
        self.assertTrue(any("Manca il link" in a for a in r["avvisi"]))

    def test_whatsapp(self):
        r = compila(canale="wa", nome="Madi")
        self.assertTrue(r["testo"].startswith("Ciao Madi! Menù a 80 € a persona."))
        self.assertIsNone(r["oggetto"])

    def test_senza_occasione(self):
        t = dict(NATALE, occasione_data=None, occasione_turno=None, menu_template_id=None)
        r = compila(t)
        self.assertEqual(len(r["avvisi"]), 3)       # giorno (nell'oggetto), menù/prezzo, disponibilità
        self.assertNotIn("{", r["testo"] + (r["oggetto"] or ""))
        self.assertIsNone(r["disponibilita"])

    def test_blocco_ignoto(self):
        r = compila(dict(NATALE, testo_mail="Ciao {nome}, {pippo}"))
        self.assertTrue(any("{pippo}" in a for a in r["avvisi"]))

    def test_canale_sbagliato(self):
        with self.assertRaises(srv.ErroreTemplate):
            compila(canale="sms")


class Tabella(unittest.TestCase):
    def test_giro(self):
        t = srv.salva(NATALE, "marco")
        self.assertEqual(t["pax_prova"], 2)
        self.assertTrue(t["attivo"])
        t2 = srv.salva(dict(NATALE, nome="Natale bis", attivo=False), "marco", template_id=t["id"])
        self.assertEqual(t2["nome"], "Natale bis")
        self.assertFalse(t2["attivo"])
        self.assertEqual(len(srv.elenco()), 1)
        self.assertEqual(srv.elenco(solo_attivi=True), [])
        senza = srv.salva({"nome": "Gruppi", "testo_mail": "Buongiorno {nome},"}, "marco")
        self.assertEqual(senza["pax_prova"], 2)      # valore della tabella, non serve
        self.assertIsNone(senza["occasione_turno"])
        self.assertTrue(srv.elimina(senza["id"]))
        self.assertFalse(srv.elimina(senza["id"]))
        with self.assertRaises(srv.ErroreTemplate):
            srv.salva(NATALE, "marco", template_id=9999)

    def test_validazione(self):
        for sbagliato in ({"nome": " "}, {"nome": "x", "occasione_data": "25/12/2026", "occasione_turno": "pranzo"},
                          {"nome": "x", "occasione_data": "2026-12-25"},
                          {"nome": "x", "occasione_data": "2026-12-25", "occasione_turno": "pranzo", "pax_prova": 0}):
            with self.assertRaises(srv.ErroreTemplate):
                srv.pulisci(sbagliato)

    def test_link(self):
        self.assertEqual(srv.impostazioni()["link_prenotazione"], "")
        self.assertEqual(srv.salva_impostazioni(" https://esempio.it/p ")["link_prenotazione"], "https://esempio.it/p")
        with self.assertRaises(srv.ErroreTemplate):
            srv.salva_impostazioni("esempio.it")
        srv.salva_impostazioni("")


if __name__ == "__main__":
    unittest.main(verbosity=1)
