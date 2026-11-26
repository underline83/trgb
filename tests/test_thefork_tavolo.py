#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Il tavolo nella sincronizzazione TheFork → TRGB (regola di Marco, 2026-11-26):
il tavolo arrivato da TheFork segue TheFork, quello messo a mano in TRGB resta.
DB in memoria, niente rete.

    cd /Users/underline83/trgb && python3 tests/test_thefork_tavolo.py
"""

import os
import sqlite3
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import thefork_service as tf  # noqa: E402
from app.services.clienti_thefork_service import upsert_prenotazione  # noqa: E402


def _db(con_colonna=True):
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute(
        "CREATE TABLE clienti_prenotazioni (id INTEGER PRIMARY KEY, thefork_booking_id TEXT UNIQUE, "
        "stato TEXT, tavolo TEXT, nota_ristorante TEXT"
        + (", tavolo_thefork TEXT" if con_colonna else "") + ")"
    )
    return c


def _arriva(c, tavolo_tf, uuid="u1"):
    """Quello che fa _sincronizza_prenotazione col tavolo: mappa → priorità → upsert."""
    rec = {"thefork_booking_id": uuid, "stato": "RECORDED"}
    if tavolo_tf:
        rec["tavolo"] = tavolo_tf
        rec["tavolo_thefork"] = tavolo_tf
    tenuti = tf._priorita_trgb(c, rec)
    upsert_prenotazione(c, rec)
    return tenuti


def _tavolo(c, uuid="u1"):
    return c.execute("SELECT tavolo FROM clienti_prenotazioni WHERE thefork_booking_id = ?", (uuid,)).fetchone()[0]


def _a_mano(c, tavolo, uuid="u1"):
    c.execute("UPDATE clienti_prenotazioni SET tavolo = ? WHERE thefork_booking_id = ?", (tavolo, uuid))


class Tavolo(unittest.TestCase):
    def test_nato_da_thefork_segue_thefork(self):
        c = _db()
        _arriva(c, "7")
        self.assertEqual(_arriva(c, "11"), [])
        self.assertEqual(_tavolo(c), "11")
        _arriva(c, "3")
        self.assertEqual(_tavolo(c), "3")

    def test_messo_a_mano_resta(self):
        c = _db()
        _arriva(c, "7")
        _a_mano(c, "10")
        self.assertEqual(_arriva(c, "11"), ["tavolo"])
        self.assertEqual(_tavolo(c), "10")
        self.assertEqual(_arriva(c, "5"), ["tavolo"])   # e resta anche dopo
        self.assertEqual(_tavolo(c), "10")

    def test_a_mano_senza_tavolo_thefork(self):
        c = _db()
        _arriva(c, None)
        _a_mano(c, "10")
        self.assertEqual(_arriva(c, "7"), ["tavolo"])
        self.assertEqual(_tavolo(c), "10")

    def test_vuoto_prende_thefork(self):
        c = _db()
        _arriva(c, None)
        _arriva(c, "7")
        self.assertEqual(_tavolo(c), "7")
        _arriva(c, "8")
        self.assertEqual(_tavolo(c), "8")

    def test_thefork_toglie_il_tavolo_non_cancella(self):
        c = _db()
        _arriva(c, "7")
        _arriva(c, None)
        self.assertEqual(_tavolo(c), "7")

    def test_thefork_arriva_a_quello_di_trgb_poi_si_segue(self):
        c = _db()
        _arriva(c, "7")
        _a_mano(c, "10")
        self.assertEqual(_arriva(c, "10"), [])
        _arriva(c, "12")
        self.assertEqual(_tavolo(c), "12")

    def test_arrivata_prima_della_regola_non_si_sovrascrive(self):
        c = _db()
        c.execute("INSERT INTO clienti_prenotazioni (thefork_booking_id, stato, tavolo) VALUES ('u1','RECORDED','7')")
        self.assertEqual(_arriva(c, "11"), ["tavolo"])
        self.assertEqual(_tavolo(c), "7")

    def test_arrivata_prima_ma_uguale_poi_si_segue(self):
        c = _db()
        c.execute("INSERT INTO clienti_prenotazioni (thefork_booking_id, stato, tavolo) VALUES ('u1','RECORDED','7')")
        _arriva(c, "7")
        _arriva(c, "11")
        self.assertEqual(_tavolo(c), "11")

    def test_tavoli_uniti_ordine_diverso(self):
        c = _db()
        _arriva(c, "7+9")
        _a_mano(c, "9+7")
        self.assertEqual(_arriva(c, "7+9+4"), [])
        self.assertEqual(_tavolo(c), "7+9+4")

    def test_la_nota_resta_di_trgb(self):
        c = _db()
        _arriva(c, "7")
        c.execute("UPDATE clienti_prenotazioni SET nota_ristorante = 'nostra'")
        rec = {"thefork_booking_id": "u1", "stato": "RECORDED", "nota_ristorante": "loro",
               "tavolo": "8", "tavolo_thefork": "8"}
        self.assertEqual(tf._priorita_trgb(c, rec), ["nota_ristorante"])

    def test_db_senza_colonna_come_prima(self):
        c = _db(con_colonna=False)
        c.execute("INSERT INTO clienti_prenotazioni (thefork_booking_id, stato, tavolo) VALUES ('u1','RECORDED','7')")
        rec = {"thefork_booking_id": "u1", "stato": "RECORDED", "tavolo": "11"}
        self.assertEqual(tf._priorita_trgb(c, rec), ["tavolo"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
