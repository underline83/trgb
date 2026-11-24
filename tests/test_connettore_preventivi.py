#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test degli strumenti dei preventivi nel connettore (server 1.22) e degli argomenti
tolleranti della posta. Lavora su una COPIA dei DB scaricati da push.sh
(locali/tregobbi/data): non tocca produzione, non va in rete (mail finte, niente
TheFork). Se la copia locale dei DB non c'è, si salta.

    cd /Users/underline83/trgb && python3 tests/test_connettore_preventivi.py
"""

import asyncio
import glob
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from zoneinfo import ZoneInfo

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
DATI = os.path.join(RADICE, "locali", "tregobbi", "data")
SORGENTE = "PRE-2026-018"           # 5 menù gruppi (Cuori, Fiori, Jolly, Picche, Quadri), doppio prezzo

TMP = tempfile.mkdtemp(prefix="trgb_conn_prev_")
if os.path.exists(os.path.join(DATI, "clienti.sqlite3")):
    for f in glob.glob(os.path.join(DATI, "*")):
        if f.endswith((".sqlite3", ".db", ".json")):
            shutil.copy2(f, TMP)

_ld = types.ModuleType("app.utils.locale_data")
_ld.locale_data_path = lambda n: __import__("pathlib").Path(TMP) / n
_ld.locale_data_dir = lambda: __import__("pathlib").Path(TMP)
_ld.assert_locale_data_exists = lambda n: __import__("pathlib").Path(TMP) / n
_ld.locale_timezone = lambda: ZoneInfo("Europe/Rome")
_ld.locale_info = lambda: {}
sys.modules["app.utils.locale_data"] = _ld

MAIL = []          # le mail «mandate»
ALLINEA = []       # gli allineamenti prenotazione (niente TheFork nei test)


class _Esito:
    def __init__(self, ok=True, errore=None, message_id="<finto@trgb>"):
        self.ok, self.errore, self.message_id = ok, errore, message_id


@unittest.skipUnless(os.path.exists(os.path.join(TMP, "clienti.sqlite3")), "manca la copia locale dei DB")
class TestConnettorePreventivi(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from app.connettore import server
        from app.services import email_service, evento_confermato_service as ev
        from app.services import preventivi_service as ps
        from app.platform import module_loader
        cls.ps = ps
        server._utente = lambda: {"username": "Q", "role": "superadmin"}
        email_service.invia_email = lambda *a, **k: (MAIL.append(k | {"to": a[0] if a else k.get("to")}), _Esito())[1]
        email_service.stato = lambda: {"configurato": True, "mancanti": [], "mittente": "trgb@tregobbi.it",
                                       "mittente_nome": "Osteria Tre Gobbi"}
        ev.allinea_prenotazione_sicuro = lambda *a, **k: ALLINEA.append(a)
        try:
            import weasyprint  # noqa: F401
        except Exception:                                   # noqa: BLE001 — senza weasyprint un PDF finto
            ps.genera_pdf = lambda pid, stile="menu": (b"%PDF-1.4 finto", f"preventivo-{pid}.pdf")
        module_loader.is_router_active = lambda nome: True
        module_loader.is_module_active = lambda nome: nome in ("clienti",)
        cls.mcp = server.costruisci("https://trgb.esempio.it", "Prova", "0", url_app="https://app.esempio.it")

    def chiama(self, _strumento, **arg):
        res = asyncio.run(self.mcp.call_tool(_strumento, arg))
        self.assertFalse(getattr(res, "is_error", False) or getattr(res, "isError", False), res)
        return json.loads(res.content[0].text)

    def errore(self, _strumento, **arg):
        from mcp.server.mcpserver.exceptions import ToolError
        try:
            res = asyncio.run(self.mcp.call_tool(_strumento, arg))
        except ToolError as e:
            return str(e)
        if getattr(res, "is_error", False) or getattr(res, "isError", False):
            return res.content[0].text
        self.fail(f"{_strumento} doveva dare errore: {res}")

    def test_1_crea_duplicando(self):
        p = self.chiama("preventivo_crea", titolo="Prova gruppo — 01/12 (12 persone)",
                        nuovo_cliente={"nome": "Prova", "cognome": "Test", "email": "prova@esempio.it"},
                        data_evento="2031-12-01", ora_evento="20:00", n_persone=12, da_preventivo=SORGENTE)
        self.assertEqual(p["stato"], "bozza")
        self.assertEqual(len(p["menu"]), 5)
        self.assertTrue(p["pagina"].startswith("https://app.esempio.it/clienti/preventivi/"))
        self.assertNotIn("note_interne", p)                 # le note dell'altro evento non passano
        self.assertEqual(p["email_cliente"], "prova@esempio.it")
        self.assertEqual(p["n_persone"], 12)
        orig = self.ps.get_preventivo(self.ps.lista_preventivi(q=SORGENTE)["items"][0]["id"])
        self.assertNotEqual(p["cliente_id"], orig["cliente_id"])
        type(self).pid = p["id"]

    def test_2_crea_vuoto_con_menu_da(self):
        p = self.chiama("preventivo_crea", titolo="Prova vuoto", data_evento="2031-12-02", n_persone=8,
                        menu_da=[{"preventivo": SORGENTE, "menu": "Quadri"}, {"preventivo": SORGENTE, "menu": "cuori"}])
        self.assertEqual([m["nome"] for m in p["menu"]], ["Quadri", "Cuori"])
        self.assertIn("50 / 55", p["menu"][0]["prezzo"])
        self.assertTrue(any("Senza cliente" in a for a in p["avvisi"]))
        type(self).vuoto = p["id"]

    def test_2b_libreria(self):
        lib = self.chiama("menu_libreria")["risultati"]
        self.assertTrue(lib, "libreria vuota nella copia")
        nome = lib[0]["nome"]
        n_prima = self.ps.lista_preventivi(limit=200)["total"]
        self.assertIn("404", self.errore("preventivo_crea", titolo="Non deve nascere", menu_libreria=["Inesistente"]))
        self.assertEqual(self.ps.lista_preventivi(limit=200)["total"], n_prima)     # niente preventivo a metà
        p = self.chiama("preventivo_crea", titolo="Prova libreria", menu_libreria=[nome])
        self.assertEqual([m["nome"] for m in p["menu"]], [nome])
        self.assertGreater(p["menu"][0]["piatti"], 0)
        p = self.chiama("preventivo_menu", id=p["id"], azione="libreria", libreria=[str(lib[-1]["id"])])
        self.assertEqual(len(p["menu"]), 2)
        self.chiama("preventivo_elimina", id=p["id"])

    def test_3_menu(self):
        pid = self.vuoto
        p = self.chiama("preventivo_menu", id=pid, azione="aggiungi", nome="Menù Prova",
                        piatti=[{"piatto": "Casoncelli", "portata": "Primo"}, {"piatto": "Torta", "portata": "Dolce"}],
                        prezzo=40, prezzo_vino=45)
        m = next(x for x in p["menu"] if x["nome"] == "Prova")   # nome corto, come preventivo_leggi
        self.assertEqual(m["piatti"], 2)
        self.assertIn("40 / 45", m["prezzo"])
        p = self.chiama("preventivo_menu", id=pid, azione="modifica", menu="Menù Prova", prezzo_vino=0, sconto=5,
                        piatti=[{"piatto": "Polenta e stracchino"}])
        m = next(x for x in p["menu"] if x["nome"] == "Prova")   # nome corto, come preventivo_leggi
        self.assertEqual((m["piatti"], m["prezzo"]), (1, "35 € a persona"))
        p = self.chiama("preventivo_menu", id=pid, azione="ordina", ordine=["Menù Prova"])
        self.assertEqual(p["menu"][0]["nome"], "Prova")
        p = self.chiama("preventivo_menu", id=pid, azione="togli", menu="Cuori")
        self.assertEqual([m["nome"] for m in p["menu"]], ["Prova", "Quadri"])
        self.assertIn("409", self.errore("preventivo_menu", id=self.pid, azione="togli", menu="menu gruppi"))
        self.assertIn("404", self.errore("preventivo_menu", id=pid, azione="togli", menu="Fiori"))

    def test_4_aggiorna(self):
        p = self.chiama("preventivo_aggiorna", id=self.pid, n_persone=14, note_cliente="Un vegetariano",
                        extra=[{"descrizione": "Torta di compleanno", "quantita": 1, "prezzo": 30}])
        self.assertEqual(p["n_persone"], 14)
        self.assertEqual(p["extra"][0]["descrizione"], "Torta di compleanno")
        self.assertIn("400", self.errore("preventivo_aggiorna", id=self.pid))

    def test_5_invia_email(self):
        MAIL.clear()
        a = self.chiama("preventivo_invia", id=self.pid)
        self.assertTrue(a["anteprima"])
        self.assertEqual(a["a"], ["prova@esempio.it"])
        self.assertTrue(a["allegato"]["file"].endswith(".pdf"))
        self.assertEqual(MAIL, [])                          # l'anteprima non manda niente
        self.assertIn("409", self.errore("preventivo_invia", id=self.pid, conferma=True, codice="sbagliato"))
        self.assertIn("409", self.errore("preventivo_invia", id=self.pid, conferma=True, codice=a["codice"],
                                         oggetto="Un altro oggetto"))
        self.assertEqual(MAIL, [])
        p = self.chiama("preventivo_invia", id=self.pid, conferma=True, codice=a["codice"])
        self.assertTrue(p["inviato"])
        self.assertEqual(p["stato"], "inviato")
        self.assertEqual(MAIL[0]["to"], ["prova@esempio.it"])
        self.assertEqual(MAIL[0]["allegati"][0][2], "application/pdf")
        inv = self.ps.lista_invii(self.pid)
        self.assertEqual((inv[0]["canale"], inv[0]["esito"]), ("email", "ok"))
        self.assertIn((self.pid, "inviato", "Q"), ALLINEA)

    def test_6_whatsapp(self):
        a = self.chiama("preventivo_invia", id=self.vuoto, canale="whatsapp")
        self.assertTrue(a["senza_telefono"])                # senza cliente: niente link
        p = self.chiama("preventivo_invia", id=self.vuoto, canale="whatsapp", conferma=True)
        self.assertTrue(p["registrato"])
        self.assertEqual(p["stato"], "inviato")

    def test_7_stato_proroga_libera(self):
        p = self.chiama("preventivo_stato", id=self.pid, stato="in_attesa", motivo="Ci pensa fino a lunedì")
        self.assertEqual(p["stato"], "in_attesa")
        storico = [s["testo"] for s in self.ps.get_preventivo(self.pid) and
                   __import__("app.services.preventivi_scadenze", fromlist=["x"]).lista_storico(self.pid)]
        self.assertTrue(any("Ci pensa fino a lunedì" in t for t in storico))
        self.assertIn("400", self.errore("preventivo_stato", id=self.pid, stato="bozza"))
        p = self.chiama("preventivo_proroga", id=self.pid, giorni=3)
        self.assertEqual(p["proroga"]["stato"], "in_attesa")
        p = self.chiama("preventivo_libera_tavolo", id=self.pid)
        self.assertEqual(p["stato"], "scaduto")

    def test_8_elimina(self):
        p = self.chiama("preventivo_elimina", id=self.vuoto)
        self.assertTrue(p["eliminato"])
        self.assertIsNone(self.ps.get_preventivo(self.vuoto))
        self.assertIn("404", self.errore("preventivo_leggi", id=self.vuoto))

    def test_9_posta_argomenti(self):
        from app.connettore import server
        strumenti = {t.name: t for t in asyncio.run(self.mcp.list_tools())}
        dove = json.dumps(strumenti["posta_elenco"].input_schema["properties"]["dove"])
        self.assertIn('"string"', dove)                     # anche una parola sola
        stato = json.dumps(strumenti["posta_bozze"].input_schema["properties"]["stato"])
        self.assertIn("tutte", stato)
        self.assertIn("bozze", self.chiama("posta_bozze", stato="tutte"))
        self.assertIn("bozze", self.chiama("posta_bozze", stato=""))
        self.assertIn("mail", self.chiama("posta_elenco", dove="inviata", limite=1))
        self.assertTrue(server)


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
