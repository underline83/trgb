#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test della previsione coperti (app/services/previsione_coperti.py).
DB finto in una cartella temporanea + prova all'indietro sul DB vero (sola lettura).

    cd /Users/underline83/trgb && python3 tests/test_previsione_coperti.py

Solo libreria standard.
"""

import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
from app.services import previsione_coperti as pc  # noqa: E402

VERO = Path(RADICE) / "locali" / "tregobbi" / "data" / "clienti.sqlite3"
OGGI = date(2026, 6, 10)  # mercoledì


def _db_finto() -> Path:
    p = Path(tempfile.mkdtemp(prefix="trgb_prev_")) / "clienti.sqlite3"
    c = sqlite3.connect(p)
    c.execute("""CREATE TABLE clienti_prenotazioni (id INTEGER PRIMARY KEY, data_pasto TEXT, ora_pasto TEXT,
                 turno TEXT, pax INTEGER, stato TEXT, data_prenotazione TEXT)""")
    # 20 sabati passati: cena 40 coperti = 20 prenotati 5 giorni prima + 20 il giorno stesso
    for i in range(1, 21):
        g = OGGI + timedelta(days=3) - timedelta(weeks=i)
        for _ in range(10):
            c.execute("INSERT INTO clienti_prenotazioni VALUES (NULL,?,?,?,?,?,?)",
                      (g.isoformat(), "20:00", "cena", 2, "SEATED", (g - timedelta(days=5)).isoformat() + " 10:00"))
            c.execute("INSERT INTO clienti_prenotazioni VALUES (NULL,?,?,?,?,?,?)",
                      (g.isoformat(), "20:00", "cena", 2, "SEATED", g.isoformat() + " 19:00"))
    # sabato prossimo: 10 coppie già prenotate (20 coperti), come al solito
    g = OGGI + timedelta(days=3)
    for _ in range(10):
        c.execute("INSERT INTO clienti_prenotazioni VALUES (NULL,?,?,?,?,?,?)",
                  (g.isoformat(), "20:00", "cena", 2, "RECORDED", (OGGI - timedelta(days=2)).isoformat() + " 10:00"))
    c.commit(); c.close()
    return p


class TestPrevisione(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = _db_finto()

    def test_sabato_come_al_solito(self):
        sab = OGGI + timedelta(days=3)
        r = pc.prevedi([sab], oggi=OGGI, db_path=self.db, chiusi={})["giorni"][sab.isoformat()]["cena"]
        self.assertEqual(r["prenotati"], 20)
        self.assertEqual(r["solito"], 40)
        self.assertTrue(36 <= r["previsti"] <= 44, r)
        self.assertLessEqual(r["min"], r["previsti"])
        self.assertGreaterEqual(r["max"], r["previsti"])

    def test_chiuso_e_passato(self):
        sab_scorso = OGGI + timedelta(days=3) - timedelta(weeks=1)
        sab = OGGI + timedelta(days=3)
        r = pc.prevedi([sab_scorso, sab], oggi=OGGI, db_path=self.db,
                       chiusi={sab.isoformat(): {"cena": "evento"}})["giorni"]
        self.assertEqual(r[sab_scorso.isoformat()]["cena"], {"fatti": 40})
        self.assertTrue(r[sab.isoformat()]["cena"]["chiuso"])

    def test_futuro_lontano_usa_settimane_passate(self):
        # fra 6 settimane: le settimane «di confronto» sono quelle prima di oggi, non quelle vuote
        lontano = OGGI + timedelta(days=3) + timedelta(weeks=6)
        r = pc.prevedi([lontano], oggi=OGGI, db_path=self.db, chiusi={})["giorni"][lontano.isoformat()]["cena"]
        self.assertEqual(r["solito"], 40)

    def test_festivi(self):
        self.assertEqual(pc.festivo(date(2027, 3, 28)), "Pasqua")
        self.assertEqual(pc.festivo(date(2027, 3, 29)), "Pasquetta")
        self.assertEqual(pc.festivo(date(2026, 12, 25)), "Natale")
        self.assertIsNone(pc.festivo(date(2026, 11, 23)))

    @unittest.skipUnless(VERO.exists(), "DB vero assente")
    def test_prova_indietro_db_vero(self):
        """Il giorno stesso la previsione sbaglia in media meno di 9 coperti (solo prenotati: ~15)."""
        c = sqlite3.connect(f"file:{VERO}?mode=ro", uri=True)
        s = pc._Storia(c, date(2022, 1, 1))
        oggi = date.today()
        s.oggi = oggi
        err = []
        for i in range(1, 61):
            g = oggi - timedelta(days=i)
            for t in pc.TURNI:
                k = (g.isoformat(), t)
                v = s.finali.get(k, 0)
                if v <= 0:
                    continue
                r = pc._stima(s, g, t, 0, s.prenotati_prima(k, 0))
                if r:
                    err.append(abs(v - r["stima"]))
        c.close()
        self.assertGreater(len(err), 40)
        mae = sum(err) / len(err)
        print(f"\n  prova all'indietro (60 giorni, il giorno stesso): errore medio {mae:.1f} coperti su {len(err)} turni")
        self.assertLess(mae, 9)


if __name__ == "__main__":
    unittest.main(verbosity=2)
