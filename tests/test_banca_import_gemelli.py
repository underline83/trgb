#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Modulo: banca
"""
Import CSV della banca: le righe "gemelle" (stessa data, stesso importo, stesso
inizio di descrizione) sono movimenti diversi e non vanno scartate come doppioni.
Casi veri del novembre 2026: due stipendi da 1.800 € il 14/11, dieci commissioni
da 0,85 € il 2/11. DB temporaneo, niente rete.

    cd /Users/underline83/trgb && python3 tests/test_banca_import_gemelli.py
"""

import asyncio
import os
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.routers import banca_router as br  # noqa: E402

TESTA = '"Data contabile";"Data valuta";"Importo";"Divisa";"Causale";"Descrizione";"Canale";"Categoria";"Sotto Categoria"\n'


def _riga(data, importo, descr):
    return f'"{data}";"{data}";"{importo}";"EUR";"260";"{descr}";"";"";""\n'


STIP_A = "vostra disposizione - vs.disp. rif. mb0b45561794/90000150  favore beneficiari vari distinta           - add.tot"
STIP_B = "vostra disposizione - vs.disp. rif. mb0b45561787/90000109  favore beneficiari vari distinta           - add.tot"


class _File:
    def __init__(self, nome, testo):
        self.filename = nome
        self._t = testo.encode("utf-8")

    async def read(self):
        return self._t


class ImportGemelli(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self._vecchio = br.DB_PATH
        br.DB_PATH = self.tmp.name
        c = sqlite3.connect(self.tmp.name)
        c.executescript("""
            CREATE TABLE banca_import_log (id INTEGER PRIMARY KEY, filename TEXT, num_rows INTEGER,
                num_new INTEGER, num_duplicates INTEGER, date_from TEXT, date_to TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE banca_movimenti (id INTEGER PRIMARY KEY, import_id INTEGER, ragione_sociale TEXT,
                data_contabile TEXT, data_valuta TEXT, banca TEXT, rapporto TEXT, importo REAL, divisa TEXT,
                descrizione TEXT, categoria_banca TEXT, sottocategoria_banca TEXT, hashtag TEXT,
                dedup_hash TEXT UNIQUE);
        """)
        c.commit()
        c.close()

    def tearDown(self):
        br.DB_PATH = self._vecchio
        os.unlink(self.tmp.name)

    def _importa(self, testo, nome="MovimentiCC_OnLine.csv"):
        return asyncio.run(br.import_csv(_File(nome, testo)))

    def _quanti(self, dove="1=1"):
        c = sqlite3.connect(self.tmp.name)
        n = c.execute(f"SELECT COUNT(*) FROM banca_movimenti WHERE {dove}").fetchone()[0]
        c.close()
        return n

    def test_due_bonifici_gemelli_entrano_tutti_e_due(self):
        csv = TESTA + _riga("14/11/2026", "-1800", STIP_A) + _riga("14/11/2026", "-1800", STIP_B)
        r = self._importa(csv)
        self.assertEqual(r["new"], 2)
        self.assertEqual(self._quanti("importo = -1800"), 2)

    def test_ricaricare_lo_stesso_file_non_duplica(self):
        csv = TESTA + _riga("14/11/2026", "-1800", STIP_A) + _riga("14/11/2026", "-1800", STIP_B)
        self._importa(csv)
        r = self._importa(csv)
        self.assertEqual(r["new"], 0)
        self.assertEqual(self._quanti(), 2)

    def test_recupera_il_gemello_perso_da_un_import_vecchio(self):
        # Stato di oggi in produzione: c'è solo il primo, con l'hash base.
        c = sqlite3.connect(self.tmp.name)
        c.execute(
            "INSERT INTO banca_movimenti (ragione_sociale, data_contabile, importo, descrizione, dedup_hash) "
            "VALUES ('', '2026-11-14', -1800, ?, ?)",
            (STIP_A, br._dedup_hash("2026-11-14", -1800.0, STIP_A)),
        )
        c.commit()
        c.close()
        csv = TESTA + _riga("14/11/2026", "-1800", STIP_A) + _riga("14/11/2026", "-1800", STIP_B)
        r = self._importa(csv)
        self.assertEqual(r["new"], 1)
        self.assertEqual(self._quanti("descrizione LIKE '%45561787%'"), 1)

    def test_commissioni_due_gia_presenti_nell_altro_formato(self):
        # Due commissioni già importate dal formato "pieno" (ragione sociale valorizzata).
        rif = ["mbvt94317305", "mbvt94316457", "mbvt94315632", "mbvt94314592", "mbvt94313034",
               "mbvt94311556", "mbvt94309191", "mbvt94307514", "mbvt93248958", "mbvt93248909"]
        descr = [f"comm.su bonifici - rif.{x}    comm.bon. telematico sct/ ist" for x in rif]
        c = sqlite3.connect(self.tmp.name)
        for d in descr[-2:]:
            c.execute(
                "INSERT INTO banca_movimenti (ragione_sociale, data_contabile, importo, descrizione, dedup_hash) "
                "VALUES ('TRE GOBBI S.R.L.', '2026-11-02', -0.85, ?, ?)",
                (d.upper(), br._dedup_hash("2026-11-02", -0.85, d.upper())),
            )
        c.commit()
        c.close()
        csv = TESTA + "".join(_riga("02/11/2026", "-0,85", d) for d in descr)
        r = self._importa(csv)
        self.assertEqual(r["new"], 8)
        self.assertEqual(self._quanti("importo = -0.85"), 10)

    def test_stesso_movimento_nei_due_formati_resta_uno(self):
        # Il caso per cui il soft dedup esiste (mig 058): stesso movimento, descrizione diversa nei due formati.
        c = sqlite3.connect(self.tmp.name)
        pieno = "BONIF. VS. FAVORE - BON.DA ROSSI MARIO - Acconto"
        c.execute(
            "INSERT INTO banca_movimenti (ragione_sociale, data_contabile, importo, descrizione, dedup_hash) "
            "VALUES ('TRE GOBBI S.R.L.', '2026-11-10', 120, ?, ?)",
            (pieno, br._dedup_hash("2026-11-10", 120.0, pieno)),
        )
        c.commit()
        c.close()
        csv = TESTA + _riga("10/11/2026", "120", "bonif. vs. favore - bonifico da rossi mario acconto - acconto")
        r = self._importa(csv)
        self.assertEqual(r["new"], 0)
        self.assertEqual(self._quanti(), 1)


class DuplicatiGemelli(unittest.TestCase):
    """La pagina «possibili duplicati» non deve proporre di eliminare movimenti veri."""

    def test_riferimenti_diversi_non_sono_doppioni(self):
        g = br._separa_per_riferimento([{"id": 1, "descrizione": STIP_A}, {"id": 2, "descrizione": STIP_B}])
        self.assertEqual([len(x) for x in g], [1, 1])

    def test_stessa_riga_nei_due_formati_resta_un_gruppo(self):
        g = br._separa_per_riferimento([
            {"id": 1, "descrizione": STIP_A},
            {"id": 2, "descrizione": STIP_A.upper().replace("  ", " ")},
        ])
        self.assertEqual([len(x) for x in g], [2])

    def test_senza_riferimenti_resta_come_prima(self):
        g = br._separa_per_riferimento([
            {"id": 1, "descrizione": "effetti ritirati - add.effetto - caseificio latini s.r.l."},
            {"id": 2, "descrizione": "effetti ritirati - add.effetto - caseificio latini s.r.l."},
        ])
        self.assertEqual([len(x) for x in g], [2])

    def test_incassi_pos_dello_stesso_giorno_restano_un_gruppo(self):
        d = "inc.pos carte credit - numia-inter  del 24/11/26 pdv 4820863/00004 antica trattoria dei tre bg"
        g = br._separa_per_riferimento([{"id": 1, "descrizione": d}, {"id": 2, "descrizione": d}])
        self.assertEqual([len(x) for x in g], [2])


if __name__ == "__main__":
    unittest.main(verbosity=2)
