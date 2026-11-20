#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test delle intestazioni di collegamento delle mail in uscita (email_service, mattone M.D).
Caso del 20/11/2026: la risposta a un cliente su Exchange partiva con In-Reply-To e
References codificati «=?utf-8?q?=3C…?=» perché il Message-ID supera i 78 caratteri.
Non va in rete, non tocca produzione.

    cd /Users/underline83/trgb && python3 tests/test_email_intestazioni.py
"""

import os
import sys
import tempfile
import types
import unittest
from email import message_from_bytes, policy
from pathlib import Path

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
TMP = tempfile.mkdtemp(prefix="trgb_email_intestazioni_")

_ld = types.ModuleType("app.utils.locale_data")
_ld.locale_data_path = lambda n: Path(TMP) / n
_ld.locale_data_dir = lambda: Path(TMP)
sys.modules.setdefault("app.utils.locale_data", _ld)

from app.services import email_service as E   # noqa: E402

EXCH = "<BESPR01MB594171AA763DB8AD44ACDFEE3E8C782@BESPR01MB594171.eurprd01.prod.exchangelabs.com>"
EXCH_PRIMA = "<BESPR01MB594171D29D420581546DF341B68C702@BESPR01MB594171.eurprd01.prod.exchangelabs.com>"
CONTO = {"host": "smtps.aruba.it", "port": "465", "user": "info@tregobbi.it", "password": "x",
         "from_addr": "info@tregobbi.it", "from_name": "Osteria Tre Gobbi"}


def testa(raw: bytes) -> str:
    return raw.split(b"\n\n", 1)[0].decode("ascii")


class TestIntestazioni(unittest.TestCase):
    def _msg(self, irt, refs, subject="Re: Dinner December 31"):
        return E.costruisci_messaggio(["stephen@barlibrary.com"], subject, "Dear Stephen,\nè tutto ok",
                                      intestazioni={"In-Reply-To": irt, "References": refs}, account=CONTO)

    def test_id_lunghi_in_chiaro(self):
        refs = f"<18c7279b-1256-42c9-bfa7-1fdc435568af@barlibrary.com> {EXCH_PRIMA} <ea95a0bc@tregobbi.it> {EXCH}"
        raw = self._msg(EXCH, refs).as_bytes()
        h = testa(raw)
        self.assertNotIn("=?", h)
        self.assertIn(f"In-Reply-To: {EXCH}", h)
        for riga in h.splitlines():          # si va a capo solo tra un ID e l'altro
            if riga.startswith((" ", "\t")) or riga.startswith("References"):
                for pezzo in riga.replace("References:", "").split():
                    self.assertTrue(pezzo.startswith("<") and pezzo.endswith(">"), pezzo)
        m = message_from_bytes(raw, policy=policy.default)
        self.assertEqual(str(m["In-Reply-To"]), EXCH)                   # maiuscole intatte
        self.assertEqual(str(m["References"]).split(), refs.split())

    def test_righe_crlf_per_smtp(self):
        raw = self._msg(EXCH, f"{EXCH_PRIMA} {EXCH}").as_bytes(policy=E.POLICY_POSTA.clone(linesep="\r\n"))
        intest = raw.split(b"\r\n\r\n", 1)[0]
        self.assertNotIn(b"=?", intest)
        self.assertIn(b"References: " + EXCH_PRIMA.encode() + b"\r\n " + EXCH.encode(), intest)

    def test_id_corti_come_prima(self):
        raw = self._msg("<CAF=abc@mail.gmail.com>", "<a@b.it> <CAF=abc@mail.gmail.com>").as_bytes()
        self.assertIn("In-Reply-To: <CAF=abc@mail.gmail.com>", testa(raw))
        self.assertIn("References: <a@b.it> <CAF=abc@mail.gmail.com>", testa(raw))

    def test_oggetto_accentato_resta_codificato(self):
        h = testa(self._msg(EXCH, EXCH, subject="Re: Cenone è confermato").as_bytes())
        self.assertIn("=?utf-8?q?=C3=A8?=", h)                           # l'oggetto sì, gli ID no
        self.assertIn(f"In-Reply-To: {EXCH}", h)

    def test_spazzatura_scartata(self):
        m = self._msg("non un id", None)
        self.assertIsNone(m["In-Reply-To"])
        self.assertIsNone(m["References"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
