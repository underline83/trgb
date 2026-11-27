#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TRGB fonte delle prenotazioni: riconoscimento del cliente, persone della scheda, invio a
TheFork con la coda «da mandare» (decisioni di Marco del 2026-11-26). DB su file
temporaneo, TheFork finto, niente rete.

    cd /Users/underline83/trgb && python3 tests/test_thefork_invio.py
"""

import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.update(THEFORK_CLIENT_ID="x", THEFORK_CLIENT_SECRET="y", THEFORK_RESTAURANT_UUID="R")

from app.services import clienti_riconosci_service as ric  # noqa: E402
from app.services import thefork_invio_service as invio  # noqa: E402
from app.services import thefork_service as tf  # noqa: E402
from app.utils import telefono as tel  # noqa: E402

DOMANI = (date.today() + timedelta(days=1)).isoformat()


class Base(unittest.TestCase):
    def setUp(self):
        self.path = tempfile.mktemp(suffix=".sqlite3")

        def conn():
            c = sqlite3.connect(self.path)
            c.row_factory = sqlite3.Row
            return c
        self.conn = conn
        invio.get_clienti_conn = conn
        invio._cache_modello["quando"] = 0.0
        c = conn()
        c.executescript("""
            CREATE TABLE clienti (id INTEGER PRIMARY KEY, titolo TEXT, nome TEXT, cognome TEXT, email TEXT,
                telefono TEXT, telefono2 TEXT, lingua TEXT, vip INTEGER, allergie TEXT,
                restrizioni_dietetiche TEXT, attivo INTEGER DEFAULT 1);
            CREATE TABLE clienti_persone (id INTEGER PRIMARY KEY, cliente_id INTEGER, nome TEXT, relazione TEXT,
                creato_da TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (cliente_id, nome));
            CREATE TABLE clienti_prenotazioni (id INTEGER PRIMARY KEY, cliente_id INTEGER, thefork_booking_id TEXT UNIQUE,
                data_pasto TEXT, ora_pasto TEXT, stato TEXT, pax INTEGER, canale TEXT, fonte TEXT,
                nota_ristorante TEXT, nota_cliente TEXT, persona_nome TEXT,
                thefork_invio TEXT, thefork_invio_nota TEXT, thefork_invio_at TEXT);
            CREATE TABLE prenotazioni_config (chiave TEXT PRIMARY KEY, valore TEXT NOT NULL, descrizione TEXT);
            INSERT INTO prenotazioni_config VALUES ('thefork_invio_attivo','1',''),
                ('thefork_email_servizio','casella+{numero}@esempio.it',''), ('thefork_titolo_predefinito','mx','');
            INSERT INTO clienti (id, nome, cognome, email, telefono, lingua) VALUES
                (1,'Ciro','Ravelli','ciro@esempio.it','+39 340 123 4567','it_IT'),
                (2,'Emma','Whitfield',NULL,'+447700900123',NULL),
                (3,'Senza','Niente',NULL,NULL,NULL);
        """)
        c.commit()
        c.close()
        self.chiamate = []
        self.modo = "ok"

        def finto(metodo, percorso, params=None, corpo=None, _riprova=True):
            self.chiamate.append((metodo, percorso, corpo))
            if metodo == "POST":
                if self.modo == "chiuso":
                    raise tf.TheForkErroreAPI(400, '{"data":{"code":"NO_AVAILABILITY"}}')
                if self.modo == "no_trattino" and "-" in (corpo["customer"]["firstName"], corpo["customer"]["lastName"]):
                    raise tf.TheForkErroreAPI(400, '{"data":{"code":"INVALID_CUSTOMER_FIRSTNAME"}}')
                if self.modo == "rifiuto":
                    raise tf.TheForkErroreAPI(400, '{"data":{"code":"INVALID_CUSTOMER_EMAIL"}}')
                return {"reservationUuid": f"U{len(self.chiamate)}",
                        "status": "REQUESTED" if corpo["partySize"] >= 10 else "RECORDED",
                        "paymentMethodRequest": {"x": 1} if self.modo == "garanzia" else None}
            return {}
        tf._richiesta = finto

    def tearDown(self):
        os.remove(self.path)

    def pren(self, cliente=1, stato="RECORDED", canale="Telefono", pax=2, persona=None, data=DOMANI):
        c = self.conn()
        cur = c.execute(
            "INSERT INTO clienti_prenotazioni (cliente_id, data_pasto, ora_pasto, stato, pax, canale, fonte, persona_nome) "
            "VALUES (?,?,?,?,?,?,'manuale',?)", (cliente, data, "20:30", stato, pax, canale, persona))
        c.commit()
        c.close()
        return cur.lastrowid

    def riga(self, pid):
        c = self.conn()
        r = dict(c.execute("SELECT * FROM clienti_prenotazioni WHERE id = ?", (pid,)).fetchone())
        c.close()
        return r


class Riconoscimento(Base):
    def test_numero_scritto_in_tanti_modi(self):
        c = self.conn()
        for scritto in ("3401234567", "0039 340.123.4567", "+39 340 1234567", "39 340 123 4567"):
            self.assertEqual([x["id"] for x in ric.riconosci(c, scritto)["clienti"]], [1], scritto)
        self.assertEqual(ric.riconosci(c, "0044 7700 900123")["clienti"][0]["id"], 2)
        self.assertEqual(ric.riconosci(c, "7700 900123", prefisso="+44")["paese"]["paese"], "Regno Unito")
        self.assertEqual(ric.riconosci(c, None, "CIRO@esempio.it")["clienti"][0]["riconosciuto_da"], "email")
        self.assertEqual(ric.riconosci(c, "340 999 0000")["clienti"], [])

    def test_persone_della_scheda(self):
        c = self.conn()
        a = ric.aggiungi_persona(c, 1, " Rosa  Lucia ", "moglie", "paolo")
        self.assertEqual(ric.aggiungi_persona(c, 1, "rosa lucia"), a)      # non la raddoppia
        c.commit()
        self.pren(persona="Rosa Lucia")
        p = ric.riconosci(c, "340 123 4567")["clienti"][0]["persone"]
        self.assertEqual([(x["nome"], x["relazione"], x["prenotazioni"]) for x in p], [("Rosa Lucia", "moglie", 1)])


class Invio(Base):
    def test_parte_coi_dati_della_scheda(self):
        pid = self.pren(persona="Rosa Lucia")
        self.assertEqual(invio.dopo_creazione(pid)["stato"], "inviata")
        corpo = self.chiamate[-1][2]
        self.assertEqual(corpo["customer"]["firstName"], "Ciro")           # mai il nome di chi chiama
        self.assertEqual(corpo["customer"]["email"], "ciro@esempio.it")
        self.assertEqual(corpo["customer"]["phone"], "+393401234567")
        self.assertIn("A nome Rosa Lucia", corpo["restaurantNote"])
        self.assertRegex(corpo["mealDate"], r"T20:30:00[+-]\d\d:\d\d$")    # sempre con l'offset
        r = self.riga(pid)
        self.assertTrue(r["thefork_booking_id"] and r["thefork_invio"] == "inviata")

    def test_senza_email_va_quella_di_servizio(self):
        pid = self.pren(cliente=2)
        invio.dopo_creazione(pid)
        cust = self.chiamate[-1][2]["customer"]
        self.assertEqual(cust["email"], "casella+447700900123@esempio.it")
        self.assertEqual(cust["locale"], "en_GB")                           # lingua dal prefisso
        self.assertTrue(invio.email_di_servizio(cust["email"]))
        self.assertIsNone(invio.email_vera(cust["email"]))
        self.assertEqual(invio.email_vera("ciro@esempio.it"), "ciro@esempio.it")

    def test_orario_chiuso_va_in_coda_e_riparte(self):
        self.modo = "chiuso"
        pid = self.pren()
        self.assertEqual(invio.dopo_creazione(pid)["stato"], "da_mandare")
        self.assertIsNone(self.riga(pid)["thefork_booking_id"])
        self.assertEqual(invio.giro_coda(), {"provate": 1, "inviate": 0})
        self.modo = "ok"
        self.assertEqual(invio.giro_coda(), {"provate": 1, "inviate": 1})
        self.assertEqual(invio.giro_coda(), {"provate": 0, "inviate": 0})

    def test_chi_non_parte(self):
        for kw, atteso in (({"canale": "Walk-in"}, None), ({"stato": "WAITLIST"}, "sospesa"), ({"stato": "OPTION"}, "sospesa")):
            pid = self.pren(**kw)
            invio.dopo_creazione(pid)
            self.assertEqual(self.riga(pid)["thefork_invio"], atteso, kw)
        self.assertEqual([c for c in self.chiamate if c[0] == "POST"], [])
        pid = self.pren(cliente=3)                                          # né email né telefono
        self.assertEqual(invio.dopo_creazione(pid)["stato"], "inviata")     # dal 27/11 senza recapiti parte lo stesso (email di servizio col codice della scheda)

    def test_solo_cognome_va_col_trattino(self):
        """26/11, opzione A di Marco: «Devasini» non deve finire in nome e cognome."""
        c = self.conn()
        c.execute("UPDATE clienti SET nome = NULL, cognome = 'Devasini' WHERE id = 1")
        c.commit(); c.close()
        self.assertEqual(invio.dopo_creazione(self.pren())["stato"], "inviata")
        cli = self.chiamate[-1][2]["customer"]
        self.assertEqual((cli["firstName"], cli["lastName"]), ("-", "Devasini"))
        # se TheFork rifiuta il trattino: una seconda prova col nome ripetuto, e parte lo stesso
        self.modo = "no_trattino"
        self.assertEqual(invio.dopo_creazione(self.pren())["stato"], "inviata")
        cli = self.chiamate[-1][2]["customer"]
        self.assertEqual((cli["firstName"], cli["lastName"]), ("Devasini", "Devasini"))
        # al ritorno da TheFork né il trattino né il nome ripetuto diventano il nome del cliente
        self.assertEqual(tf._nome_vero("-", "Devasini"), {"nome": "", "cognome": "Devasini"})
        self.assertEqual(tf._nome_vero("devasini", "Devasini"), {"nome": "", "cognome": "Devasini"})
        self.assertEqual(tf._nome_vero("Ciro", "Ravelli"), {"nome": "Ciro", "cognome": "Ravelli"})

    def test_senza_numero_parte_lo_stesso(self):
        """27/11: uno che passa e non lascia il numero deve bloccare il tavolo anche su TheFork."""
        pid = self.pren(cliente=3)
        invio.dopo_creazione(pid)
        self.assertEqual(self.riga(pid)["thefork_invio"], "inviata")
        cust = self.chiamate[-1][2]["customer"]
        self.assertEqual(cust["email"], "casella+0000000003@esempio.it")     # «00» + codice della scheda
        self.assertNotIn("phone", cust)
        self.assertTrue(invio.email_di_servizio(cust["email"]))
        # una riga rimasta «solo TRGB» col vecchio codice riparte al giro dopo
        vecchia = self.pren(cliente=3)
        c = self.conn()
        c.execute("UPDATE clienti_prenotazioni SET thefork_invio='no', thefork_invio_nota='Solo in TRGB: il cliente non ha né email né telefono' WHERE id=?", (vecchia,))
        c.commit(); c.close()
        self.assertEqual(invio.giro_coda()["inviate"], 1)
        self.assertEqual(self.riga(vecchia)["thefork_invio"], "inviata")

    def test_opzione_confermata_parte(self):
        pid = self.pren(stato="OPTION")
        invio.dopo_creazione(pid)
        c = self.conn()
        c.execute("UPDATE clienti_prenotazioni SET stato = 'RECORDED' WHERE id = ?", (pid,))
        c.commit()
        c.close()
        self.assertEqual(invio.dopo_modifica(pid, {"stato": "OPTION"})["stato"], "inviata")

    def test_gruppo_da_confermare_e_rifiuto(self):
        pid = self.pren(pax=12)
        invio.dopo_creazione(pid)
        self.assertIn("confermare", self.riga(pid)["thefork_invio_nota"])
        self.modo = "rifiuto"
        pid = self.pren()
        self.assertEqual(invio.dopo_creazione(pid)["stato"], "errore")

    def test_garanzia_senza_email_resta_in_trgb(self):
        self.modo = "garanzia"
        pid = self.pren(cliente=2)
        self.assertEqual(invio.dopo_creazione(pid)["stato"], "no")
        self.assertEqual(self.chiamate[-1][0], "PATCH")                     # ritirata da TheFork
        self.assertIsNone(self.riga(pid)["thefork_booking_id"])
        pid = self.pren(cliente=1)                                          # con l'email vera resta su TheFork
        self.assertEqual(invio.dopo_creazione(pid)["stato"], "inviata")

    def test_modifica_e_cancellazione_tornano_su_thefork(self):
        pid = self.pren()
        invio.dopo_creazione(pid)
        prima = self.riga(pid)
        c = self.conn()
        c.execute("UPDATE clienti_prenotazioni SET pax = 4 WHERE id = ?", (pid,))
        c.commit()
        invio.dopo_modifica(pid, prima)
        self.assertEqual((self.chiamate[-1][0], self.chiamate[-1][2]["partySize"]), ("PATCH", 4))
        n = len(self.chiamate)
        invio.dopo_modifica(pid, self.riga(pid))                            # niente di cambiato: nessuna chiamata
        self.assertEqual(len(self.chiamate), n)
        c.execute("UPDATE clienti_prenotazioni SET stato = 'CANCELED' WHERE id = ?", (pid,))
        c.commit()
        c.close()
        invio.dopo_modifica(pid, {"stato": "RECORDED"})
        self.assertTrue(self.chiamate[-1][1].endswith("/cancel"))

    def test_le_prenotazioni_a_mano_di_prima_non_partono_alla_prima_modifica(self):
        pid = self.pren()                      # nata prima dell'invio: nessun segno
        self.assertIsNone(invio.dopo_modifica(pid, {"pax": 9})["stato"])
        self.assertEqual(self.chiamate, [])

    def test_spento_non_fa_niente(self):
        c = self.conn()
        c.execute("UPDATE prenotazioni_config SET valore = '0' WHERE chiave = 'thefork_invio_attivo'")
        c.commit()
        c.close()
        pid = self.pren()
        self.assertIsNone(invio.dopo_creazione(pid)["stato"])
        self.assertEqual(self.chiamate, [])

    def test_la_sincronizzazione_tiene_i_dati_di_trgb(self):
        pid = self.pren()
        invio.dopo_creazione(pid)
        uuid = self.riga(pid)["thefork_booking_id"]
        rec = {"thefork_booking_id": uuid, "cliente_id": 99, "canale": "TheFork Manager API", "pax": 2}
        c = self.conn()
        invio.tieni_trgb(c, rec)
        self.assertEqual(rec, {"thefork_booking_id": uuid, "pax": 2})
        altra = {"thefork_booking_id": "ALTRA", "cliente_id": 5, "canale": "TheFork"}
        invio.tieni_trgb(c, altra)
        self.assertEqual(altra["cliente_id"], 5)


class Numeri(unittest.TestCase):
    def test_normalizza(self):
        self.assertEqual(tel.normalizza("0044 7700 900123"), "+447700900123")
        self.assertEqual(tel.normalizza("035 123456"), "+39035123456")
        self.assertEqual(tel.normalizza("07700 900123", "+44"), "+447700900123")
        self.assertIsNone(tel.normalizza("12"))
        e = tel.elenco_prefissi(["+44", "+39"])
        self.assertEqual([x["prefisso"] for x in e["frequenti"]], ["+39", "+44"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
