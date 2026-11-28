#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Modulo: prenotazioni
"""
Percorso unico delle prenotazioni (2026-11-27): form e sito fanno gli stessi passi e gli
stessi controlli; cambia solo chi può dire sì quando un controllo dice no. DB su file
temporaneo, fasce/tavoli/chiusure finti, TheFork finto, niente rete né email.

    cd /Users/underline83/trgb && python3 tests/test_prenotazioni_percorso_unico.py
"""

import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.update(THEFORK_CLIENT_ID="x", THEFORK_CLIENT_SECRET="y", THEFORK_RESTAURANT_UUID="R")

from app.services import prenotazioni_inserimento_service as ins  # noqa: E402
from app.services import prenotazioni_sito_service as sito  # noqa: E402
from app.services import prenotazioni_fasce_service as fasce_srv  # noqa: E402
from app.services import prenotazioni_sale_service as sale_srv  # noqa: E402
from app.services import prenotazioni_tavoli_service as tavoli_srv  # noqa: E402
from app.services import prenotazioni_stati as stati_srv  # noqa: E402
from app.services import prenotazioni_online_auto_service as online_auto  # noqa: E402
from app.services import prenotazioni_doppioni_service as doppioni_srv  # noqa: E402
from app.services import thefork_invio_service as invio  # noqa: E402
from app.services import thefork_service as tf  # noqa: E402

DOMANI = (date.today() + timedelta(days=1)).isoformat()
ORE = ["19:30", "20:00", "20:30", "21:00"]

SCHEMA = """
CREATE TABLE clienti (id INTEGER PRIMARY KEY, titolo TEXT, nome TEXT, cognome TEXT, email TEXT,
    telefono TEXT, telefono2 TEXT, lingua TEXT, vip INTEGER, allergie TEXT, restrizioni_dietetiche TEXT,
    origine TEXT, protetto INTEGER, attivo INTEGER DEFAULT 1, updated_at TEXT);
CREATE TABLE clienti_persone (id INTEGER PRIMARY KEY, cliente_id INTEGER, nome TEXT, relazione TEXT,
    creato_da TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (cliente_id, nome));
CREATE TABLE clienti_prenotazioni (id INTEGER PRIMARY KEY, cliente_id INTEGER, thefork_booking_id TEXT UNIQUE,
    data_pasto TEXT, ora_pasto TEXT, stato TEXT, pax INTEGER, tavolo TEXT, canale TEXT, occasione TEXT,
    nota_ristorante TEXT, nota_cliente TEXT, allergie_segnalate TEXT, tavolo_esterno INTEGER, seggioloni TEXT,
    data_prenotazione TEXT, prenotato_da TEXT, turno TEXT, fonte TEXT, creato_da TEXT,
    token_cancellazione TEXT, tenuto_fino_al TEXT, persona_nome TEXT, durata_min INTEGER,
    nome_ospite TEXT, cognome_ospite TEXT, updated_at TEXT,
    thefork_invio TEXT, thefork_invio_nota TEXT, thefork_invio_at TEXT);
CREATE TABLE prenotazioni_config (chiave TEXT PRIMARY KEY, valore TEXT NOT NULL, descrizione TEXT);
INSERT INTO prenotazioni_config VALUES ('thefork_invio_attivo','1',''),
    ('thefork_email_servizio','casella+{numero}@esempio.it',''), ('thefork_titolo_predefinito','mx',''),
    ('widget_max_automatica','6',''), ('widget_max_richiesta','35',''), ('soglia_pranzo_cena','15:00',''),
    ('capienza_cena','50',''), ('opzione_giorni_default','7','');
INSERT INTO clienti (id, nome, cognome, email, telefono, lingua) VALUES
    (1,'Ciro','Ravelli','ciro@esempio.it','+393401234567','it_IT'),
    (4,'Anna','Bossi','anna@esempio.it','+393479999999','it_IT');
"""


class Base(unittest.TestCase):
    def setUp(self):
        self.path = tempfile.mktemp(suffix=".sqlite3")

        def conn():
            c = sqlite3.connect(self.path)
            c.row_factory = sqlite3.Row
            return c
        self.conn = conn
        c = conn()
        c.executescript(SCHEMA)
        c.commit()
        c.close()
        for m in (ins, sito, invio, stati_srv):
            m.get_clienti_conn = conn
        stati_srv.svuota_cache()
        invio._cache_modello["quando"] = 0.0

        # Il mondo intorno, finto: una fascia per ora, tutte aperte, nessun limite
        self.fasce = {o: {"ora": o, "aperta": True, "online_aperta": True, "max_coperti": None,
                          "max_online": None, "coperti": 0, "online": 0} for o in ORE}
        self.chiusi = {}
        self.thefork_chiuse = []
        fasce_srv.fasce_giorno = lambda c, d, t, cfg=None: {"fasce": [dict(f) for f in self.fasce.values()] if t == "cena" else []}
        fasce_srv.confronto_thefork = lambda c, d, t, adesso=None: {"controllato": True, "non_prenotabili": list(self.thefork_chiuse)}
        sale_srv.capienza = lambda c, d, t: None
        tavoli_srv.Verificatore = lambda c, d, t, escludi_id=None: type("V", (), {"ha_tavoli": False})()
        tavoli_srv.dividi_se_meta = lambda c, pid, u=None: None
        ins.turni_chiusi = lambda cfg, d, chiusure=None: dict(self.chiusi)
        online_auto.ricalcola_presto = lambda: None
        doppioni_srv.doppioni_di = lambda c, pid: []
        self.email, self.avvisi_staff = [], []
        sito._invia_in_background = lambda pid, tipo: self.email.append((pid, tipo))
        sito._avvisa_staff = lambda pid, stato, *a, **k: self.avvisi_staff.append((pid, stato))

        self.chiamate = []

        def finto(metodo, percorso, params=None, corpo=None, _riprova=True):
            self.chiamate.append((metodo, percorso, corpo))
            if metodo == "POST":
                return {"reservationUuid": f"U{len(self.chiamate)}", "status": "RECORDED", "paymentMethodRequest": None}
            return {}
        tf._richiesta = finto

    def tearDown(self):
        os.remove(self.path)

    def riga(self, pid):
        c = self.conn()
        r = dict(c.execute("SELECT * FROM clienti_prenotazioni WHERE id = ?", (pid,)).fetchone())
        c.close()
        return r

    def dal_sito(self, **k):
        d = {"data": DOMANI, "ora": "20:00", "pax": 2, "nome": "Giulia", "cognome": "Neri",
             "telefono": "333 111 2222", "email": "giulia@esempio.it", "lingua": "it"}
        d.update(k)
        return sito.crea(d)

    def dal_form(self, **k):
        d = {"data_pasto": DOMANI, "ora_pasto": "20:00", "pax": 2, "cliente_id": 1, "stato": "RECORDED"}
        d.update(k)
        return ins.inserisci(d, ins.OPERATORE, autore="paolo")


class Form(Base):
    def test_come_prima(self):
        r = self.dal_form(canale="Telefono", nota_ristorante="vicino alla finestra")
        p = self.riga(r["id"])
        self.assertEqual((p["fonte"], p["canale"], p["ora_pasto"], p["turno"], p["creato_da"]),
                         ("manuale", "Telefono", "20:00", "cena", "paolo"))
        self.assertEqual(p["thefork_invio"], "inviata")
        self.assertEqual(r["avvisi"], [])

    def test_turno_chiuso_blocca_tutti(self):
        self.chiusi = {"cena": "giorno chiuso"}
        with self.assertRaises(ins.Rifiutata) as e:
            self.dal_form()
        self.assertEqual(e.exception.http, 409)
        with self.assertRaises(sito.NonDisponibile):
            self.dal_sito()

    def test_fascia_piena_avvisa_e_salva(self):
        self.fasce["20:00"].update(max_coperti=4, coperti=4)
        r = self.dal_form()
        self.assertEqual([a["codice"] for a in r["avvisi"]], ["tetto_coperti"])
        self.assertEqual(self.riga(r["id"])["stato"], "RECORDED")

    def test_numero_noto_vuole_la_scheda(self):
        with self.assertRaises(ins.Rifiutata) as e:
            self.dal_form(cliente_id=None, nuovo_cognome="Altro", nuovo_telefono="340 123 4567")
        self.assertEqual(e.exception.codice, "cliente_noto")

    def test_stato_non_valido(self):
        with self.assertRaises(ins.Rifiutata) as e:
            self.dal_form(stato="SEATED")
        self.assertEqual(e.exception.http, 400)

    def test_opzione_sospesa(self):
        r = self.dal_form(stato="OPTION")
        p = self.riga(r["id"])
        self.assertEqual(p["thefork_invio"], "sospesa")
        self.assertTrue(p["tenuto_fino_al"])


class Sito(Base):
    def test_confermata_e_su_thefork(self):
        r = self.dal_sito()
        p = self.riga(r["id"])
        self.assertEqual((r["stato"], p["fonte"], p["canale"], p["ora_pasto"]), ("RECORDED", "sito", "Sito", "20:00:00"))
        self.assertEqual(p["thefork_invio"], "inviata")
        self.assertEqual(self.chiamate[-1][2]["customer"]["email"], "giulia@esempio.it")
        self.assertEqual(self.email, [(r["id"], "conferma")])
        c = self.conn()
        cli = c.execute("SELECT origine, lingua, telefono FROM clienti WHERE id = ?", (p["cliente_id"],)).fetchone()
        self.assertEqual(tuple(cli), ("sito", "it_IT", "+393331112222"))

    def test_fascia_piena_solo_lista_d_attesa(self):
        self.fasce["20:00"].update(max_coperti=4, coperti=4)
        with self.assertRaises(sito.NonDisponibile):
            self.dal_sito()
        r = self.dal_sito(lista_attesa=True)
        p = self.riga(r["id"])
        self.assertEqual((r["stato"], p["thefork_invio"]), ("WAITLIST", "sospesa"))
        self.assertEqual(self.email[-1], (r["id"], "attesa"))

    def test_lista_d_attesa_mai_su_fascia_chiusa(self):
        self.fasce["20:00"]["aperta"] = False
        with self.assertRaises(sito.NonDisponibile):
            self.dal_sito(lista_attesa=True)

    def test_gruppo_richiesta_sospesa_poi_parte(self):
        r = self.dal_sito(pax=8)
        self.assertEqual((r["stato"], self.riga(r["id"])["thefork_invio"]), ("REQUESTED", "sospesa"))
        c = self.conn()
        c.execute("UPDATE clienti_prenotazioni SET stato = 'RECORDED' WHERE id = ?", (r["id"],))
        c.commit()
        invio.dopo_modifica(r["id"], {"stato": "REQUESTED"})
        self.assertEqual(self.riga(r["id"])["thefork_invio"], "inviata")

    def test_richiesta_rifiutata_non_parte(self):
        r = self.dal_sito(pax=8)
        c = self.conn()
        c.execute("UPDATE clienti_prenotazioni SET stato = 'REFUSED' WHERE id = ?", (r["id"],))
        c.commit()
        invio.dopo_modifica(r["id"], {"stato": "REQUESTED"})
        self.assertEqual(self.riga(r["id"])["thefork_invio"], "no")

    def test_oltre_il_gruppo_chiamaci(self):
        with self.assertRaises(sito.NonDisponibile) as e:
            self.dal_sito(pax=40)
        self.assertEqual(e.exception.codice, "gruppo")

    def test_chiusa_su_thefork_non_si_vende(self):
        self.thefork_chiuse = ["20:00"]
        with self.assertRaises(sito.NonDisponibile):
            self.dal_sito()
        r = self.dal_form()   # dal form si salva: l'invio dirà se TheFork la prende
        self.assertTrue(r["id"])

    def test_numero_vince_sull_email(self):
        r = self.dal_sito(telefono="340 123 4567", email="anna@esempio.it", nome="Ciro", cognome="Ravelli")
        p = self.riga(r["id"])
        self.assertEqual(p["cliente_id"], 1)
        self.assertIn("anna@esempio.it", p["nota_ristorante"])
        c = self.conn()
        self.assertEqual(c.execute("SELECT email FROM clienti WHERE id = 1").fetchone()[0], "ciro@esempio.it")

    def test_stesso_numero_altro_nome(self):
        r = self.dal_sito(telefono="340 123 4567", email="rosa@esempio.it", nome="Rosa", cognome="Lucia")
        p = self.riga(r["id"])
        self.assertEqual((p["cliente_id"], p["persona_nome"]), (1, "Rosa Lucia"))
        c = self.conn()
        self.assertEqual(c.execute("SELECT nome FROM clienti_persone WHERE cliente_id = 1").fetchone()[0], "Rosa Lucia")

    def test_stessa_persona_nome_al_contrario(self):
        r = self.dal_sito(telefono="340 123 4567", email="ciro@esempio.it", nome="Ravelli", cognome="Ciro")
        self.assertIsNone(self.riga(r["id"])["persona_nome"])

    def test_niente_anticipo(self):
        tra_poco = datetime.now() + timedelta(minutes=30)
        ora = tra_poco.strftime("%H:%M")
        if ora < "15:00" or tra_poco.date() != date.today():
            self.skipTest("serve una sera di oggi")
        self.fasce = {ora: {"ora": ora, "aperta": True, "online_aperta": True, "max_coperti": None,
                            "max_online": None, "coperti": 0, "online": 0}}
        r = self.dal_sito(data=date.today().isoformat(), ora=ora)
        self.assertEqual(r["stato"], "RECORDED")

    def test_lontano_si_prenota(self):
        lontano = (date.today() + timedelta(days=200)).isoformat()
        self.assertEqual(self.dal_sito(data=lontano)["stato"], "RECORDED")

    def test_orari_liberi_e_lista(self):
        self.fasce["20:30"].update(max_coperti=2, coperti=2)
        self.fasce["21:00"]["online_aperta"] = False
        self.fasce["19:30"]["aperta"] = False
        c = self.conn()
        o = sito.orari(c, DOMANI, 2)
        orari = {x["ora"]: (x["libero"], x["attesa"]) for x in o["turni"][0]["orari"]}
        self.assertEqual(orari, {"19:30": (False, False), "20:00": (True, False),
                                 "20:30": (False, True), "21:00": (False, True)})

    def test_annullata_dal_link_anche_su_thefork(self):
        r = self.dal_sito()
        uuid = self.riga(r["id"])["thefork_booking_id"]
        sito.avvisa_posto_liberato_sicuro = lambda *a: None
        import app.services.prenotazioni_attese_service as att
        att.avvisa_posto_liberato_sicuro = lambda *a: None
        sito.crea_notifica = lambda **k: None
        sito.annulla(r["token"])
        self.assertEqual(self.riga(r["id"])["stato"], "CANCELED")
        self.assertTrue(any(m == "PATCH" and uuid in p and "cancel" in p for m, p, _ in self.chiamate), self.chiamate)


class TettoOnline(unittest.TestCase):
    """Marco 28/11: il tetto dei coperti conta tutti, quello online solo chi ha prenotato da solo online."""
    def test_chi_conta_come_online(self):
        e = fasce_srv.e_online
        self.assertTrue(e("thefork", "TheFork"))
        self.assertTrue(e("thefork", "TripAdvisor"))
        self.assertTrue(e("widget", "Booking Module"))
        self.assertTrue(e("sito", "Sito"))
        self.assertFalse(e("thefork", "Offline"))              # scritta a mano su TheFork Manager
        self.assertFalse(e("thefork", "Walk-in"))
        self.assertFalse(e("thefork", "TheFork Manager API"))  # mandata da TRGB
        self.assertFalse(e("manuale", "Telefono"))              # anche se è partita per TheFork


if __name__ == "__main__":
    unittest.main(verbosity=1)
