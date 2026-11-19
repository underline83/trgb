#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test del calendario chiusure unico e di chi lo usa (Turni, Prenotazioni, TheFork).
Gira su COPIE temporanee dei DB locali con un TheFork finto: non tocca
produzione, non va in rete.

    cd /Users/underline83/trgb && python3 tests/test_chiusure.py

Solo libreria standard (niente pytest, niente fastapi).
"""

import os
import shutil
import sqlite3
import sys
import tempfile
import types
import unittest
from datetime import date, timedelta
from pathlib import Path

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
TMP = Path(tempfile.mkdtemp(prefix="trgb_chiusure_"))
DATI = Path(RADICE) / "locali" / "tregobbi" / "data"

# ── copie dei DB veri (backup API: prende anche il WAL) ──
for nome in ("clienti.sqlite3", "dipendenti.sqlite3"):
    src = DATI / nome
    if src.exists():
        a = sqlite3.connect(src)
        b = sqlite3.connect(TMP / nome)
        a.backup(b)
        a.close(); b.close()

# ── stub: path dati, router del calendario, TheFork e moduli che non servono ──
_ld = types.ModuleType("app.utils.locale_data")
_ld.locale_data_path = lambda n: TMP / n
sys.modules["app.utils.locale_data"] = _ld

OGGI = date.today()
D1 = (OGGI + timedelta(days=10)).isoformat()   # cena chiusa
D2 = (OGGI + timedelta(days=11)).isoformat()   # cena chiusa (poi riaperta)
D3 = (OGGI + timedelta(days=12)).isoformat()   # giorno intero
D4 = (OGGI + timedelta(days=13)).isoformat()   # pranzo + cena chiusi = giorno
PASSATO = (OGGI - timedelta(days=5)).isoformat()
CAL = {
    "giorno_chiusura_settimanale": 2,
    "giorni_chiusi": [D3, PASSATO],
    "turni_chiusi": [
        {"data": D1, "turno": "cena", "motivo": "vigilia"},
        {"data": D2, "turno": "cena", "motivo": "Natale"},
        {"data": D4, "turno": "pranzo", "motivo": ""},
        {"data": D4, "turno": "cena", "motivo": ""},
    ],
}
_cr = types.ModuleType("app.routers.closures_config_router")
_cr.get_closures_config = lambda: CAL
sys.modules["app.routers.closures_config_router"] = _cr

CHIAMATE_TF = []
_tf = types.ModuleType("app.services.thefork_service")
_tf.credenziali_presenti = lambda: True
_tf._restaurant_uuid_atteso = lambda: "uuid-finto"
def _imposta_online(data, ini, fine, aperta):
    CHIAMATE_TF.append((data, ini, fine, aperta))
    return {}
_tf.imposta_online = _imposta_online
class _E(Exception):
    pass
_tf.TheForkNonConfigurato = _E
_tf.TheForkErroreAPI = _E
sys.modules["app.services.thefork_service"] = _tf
for nome, attr in (("app.services.notifiche_service", "crea_notifica"),
                   ("app.services.clienti_thefork_service", "pulisci_telefono")):
    m = types.ModuleType(nome)
    setattr(m, attr, lambda *a, **k: None)
    sys.modules[nome] = m

from app.services import calendario_chiusure as cc  # noqa: E402


def _primo_mercoledi_dopo(d):
    while d.weekday() != 2:
        d += timedelta(days=1)
    return d


class TestCalendario(unittest.TestCase):
    def test_turno_solo(self):
        self.assertEqual(cc.turni_chiusi(D1), {"cena": "vigilia"})
        self.assertEqual(cc.chiuso(D1, "CENA"), "vigilia")
        self.assertIsNone(cc.chiuso(D1, "pranzo"))
        self.assertFalse(cc.giorno_chiuso(D1))

    def test_giorno_fisso_e_intero(self):
        mer = _primo_mercoledi_dopo(OGGI)
        self.assertTrue(cc.giorno_chiuso(mer))
        self.assertTrue(cc.giorno_chiuso(D3))
        self.assertTrue(cc.giorno_chiuso(D4), "pranzo + cena chiusi = giorno chiuso")

    def test_range(self):
        giorni = [OGGI + timedelta(days=i) for i in range(20)]
        self.assertIn(D3, cc.giorni_chiusi(giorni))
        self.assertIn(D4, cc.giorni_chiusi(giorni))
        parz = cc.turni_chiusi_parziali(giorni)
        self.assertEqual(parz[D1], {"cena": "vigilia"})
        self.assertNotIn(D3, parz)

    def test_date_esplicite(self):
        es = cc.date_esplicite(CAL, dal=OGGI)
        self.assertIn((D1, "cena"), es)
        self.assertIn((D3, "pranzo"), es)
        self.assertNotIn((PASSATO, "cena"), es, "il passato non va su TheFork")
        self.assertNotIn((D1, "pranzo"), es)

    def test_apertura_straordinaria(self):
        mer = _primo_mercoledi_dopo(OGGI + timedelta(days=20)).isoformat()
        CAL["giorni_aperti"] = [mer]
        try:
            self.assertEqual(cc.turni_chiusi(mer), {}, "mercoledì aperto straordinario")
            self.assertTrue(cc.aperto_straordinario(mer))
            # con il giorno di chiusura delle prenotazioni (3 = mercoledì) resta aperto
            from app.services.prenotazioni_sito_service import turni_chiusi_motivi
            self.assertEqual(turni_chiusi_motivi({"giorno_chiusura": "3"}, date.fromisoformat(mer)), {})
            # aperto ma pranzo chiuso = solo cena
            CAL["turni_chiusi"].append({"data": mer, "turno": "pranzo", "motivo": ""})
            self.assertEqual(set(cc.turni_chiusi(mer)), {"pranzo"})
            # chiuso esplicitamente vince
            CAL["giorni_chiusi"].append(mer)
            self.assertTrue(cc.giorno_chiuso(mer))
        finally:
            CAL["giorni_aperti"] = []
            CAL["turni_chiusi"] = [t for t in CAL["turni_chiusi"] if t["data"] != mer]
            CAL["giorni_chiusi"] = [g for g in CAL["giorni_chiusi"] if g != mer]
        mer2 = _primo_mercoledi_dopo(OGGI + timedelta(days=20))
        from app.services.prenotazioni_sito_service import turni_chiusi_motivi
        self.assertEqual(set(turni_chiusi_motivi({"giorno_chiusura": "3"}, mer2)), {"pranzo", "cena"})

    def test_descrivi(self):
        self.assertTrue(cc.descrivi(D2, "cena", "Natale").startswith("La cena del "))
        self.assertIn("(Natale)", cc.descrivi(D2, "cena", "Natale"))

    def test_ascoltatori(self):
        visti = []
        def a(p, d, u): visti.append(u)
        def rotto(p, d, u): raise RuntimeError("x")
        cc.al_cambio(rotto); cc.al_cambio(a); cc.al_cambio(a)
        cc.notifica_cambio({}, {}, "marco")
        self.assertEqual(visti, ["marco"])
        cc._ascoltatori.remove(rotto); cc._ascoltatori.remove(a)


@unittest.skipUnless((TMP / "dipendenti.sqlite3").exists(), "manca dipendenti.sqlite3 locale")
class TestTurni(unittest.TestCase):
    def setUp(self):
        from app.services import turni_service
        self.ts = turni_service

    def test_servizi_chiusi(self):
        giorni = [date.fromisoformat(D1), date.fromisoformat(D3)]
        self.assertEqual(self.ts.servizi_chiusi_nel_range(giorni), {D1: {"CENA": "vigilia"}})
        self.assertEqual(self.ts.giorni_chiusi_nel_range(giorni), [D3])
        self.assertIn("non", (self.ts.servizio_chiuso(D1, "CENA") or "niente").lower() + "non")
        self.assertIsNotNone(self.ts.servizio_chiuso(D1, "CENA"))
        self.assertIsNone(self.ts.servizio_chiuso(D1, "PRANZO"))

    def test_copia_salta_servizio_chiuso(self):
        conn = self.ts.get_dipendenti_conn()
        # settimana sorgente: quella con più turni nel DB
        r = conn.execute("""SELECT data, COUNT(*) n FROM turni_calendario GROUP BY data ORDER BY n DESC LIMIT 1""").fetchone()
        conn.close()
        if not r:
            self.skipTest("nessun turno nel DB")
        src = self.ts.iso_settimana_from_date(date.fromisoformat(r["data"]))
        dst = self.ts.iso_settimana_from_date(date.fromisoformat(D1))
        for reparto in (1, 2):
            self.ts.copia_settimana(reparto, src, dst, sovrascrivi=True)
        conn = self.ts.get_dipendenti_conn()
        righe = conn.execute("""
            SELECT tc.data, UPPER(COALESCE(tt.servizio,'')) s FROM turni_calendario tc
            JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id WHERE tc.data IN (?, ?, ?)""", (D1, D3, D4)).fetchall()
        conn.close()
        for x in righe:
            self.assertFalse(x["data"] == D1 and x["s"] == "CENA", "cena chiusa copiata")
            self.assertNotIn(x["data"], (D3, D4), "giorno chiuso copiato")


@unittest.skipUnless((TMP / "clienti.sqlite3").exists(), "manca clienti.sqlite3 locale")
class TestPrenotazioniTheFork(unittest.TestCase):
    def test_sito_motivi(self):
        from app.services.prenotazioni_sito_service import turni_chiusi_motivi, turni_chiusi
        self.assertEqual(turni_chiusi_motivi({}, date.fromisoformat(D1)), {"cena": "vigilia"})
        self.assertEqual(turni_chiusi({}, date.fromisoformat(D3)), {"pranzo", "cena"})

    def test_allinea_chiude_riapre(self):
        from app.services import prenotazioni_chiusure_service as pcs
        from app.services import prenotazioni_fasce_service as fasce_srv
        from app.models.clienti_db import get_clienti_conn
        CHIAMATE_TF.clear()
        r = pcs.allinea("test")
        fatti = {(c["data"], c["turno"]) for c in r["cambi"]}
        self.assertIn((D1, "cena"), fatti)
        self.assertIn((D3, "pranzo"), fatti)
        self.assertNotIn((D1, "pranzo"), fatti)
        conn = get_clienti_conn()
        cena = fasce_srv.fasce_giorno(conn, D1, "cena")["fasce"]
        pranzo = fasce_srv.fasce_giorno(conn, D1, "pranzo")["fasce"]
        conn.close()
        self.assertTrue(cena and all(not f["aperta"] and not f["online_aperta"] for f in cena))
        self.assertTrue(all(f["aperta"] for f in pranzo), "il pranzo del giorno resta aperto")
        # override sul turno intero per ogni turno chiuso (soglia pranzo/cena dalla config vera)
        conn = get_clienti_conn()
        cfg = {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM prenotazioni_config")}
        conn.close()
        ini, fine = pcs.finestra_turno(cfg, "cena")
        self.assertIn((D1, ini, fine, False), CHIAMATE_TF)
        # seconda volta: niente da fare, nessuna chiamata TheFork
        CHIAMATE_TF.clear()
        self.assertEqual(pcs.allinea("test")["cambi"], [])
        self.assertEqual(CHIAMATE_TF, [])
        # Natale riaperto nel calendario → fasce e TheFork riaperti
        CAL["turni_chiusi"] = [t for t in CAL["turni_chiusi"] if t["data"] != D2]
        try:
            r = pcs.allinea("test")
        finally:
            CAL["turni_chiusi"].append({"data": D2, "turno": "cena", "motivo": "Natale"})
        self.assertEqual([(c["data"], c["turno"], c["azione"]) for c in r["cambi"]], [(D2, "cena", "riaperto")])
        self.assertIn((D2, ini, fine, True), CHIAMATE_TF)
        conn = get_clienti_conn()
        cena2 = fasce_srv.fasce_giorno(conn, D2, "cena")["fasce"]
        conn.close()
        self.assertTrue(all(f["aperta"] and f["online_aperta"] for f in cena2))

    def test_motore_online_non_riapre(self):
        from app.services import prenotazioni_online_auto_service as oa
        from app.models.clienti_db import get_clienti_conn
        conn = get_clienti_conn()
        voci = oa.calcola(conn, D2, "cena", {})
        conn.close()
        self.assertTrue(all(not v["vuole_aperto"] for v in voci))
        self.assertTrue(all("turno chiuso" in v["motivo"] for v in voci))

    def test_finestra(self):
        from app.services.prenotazioni_chiusure_service import finestra_turno
        self.assertEqual(finestra_turno({"soglia_pranzo_cena": "15:00"}, "pranzo"), ("06:00", "14:45"))
        self.assertEqual(finestra_turno({}, "cena"), ("15:00", "23:45"))


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
