#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test delle push sui dispositivi (app/services/notifiche_push.py, mattone M.A — fase 1).

- la cifratura rifà l'esempio dell'RFC 8291 (appendice A) byte per byte: se torna, i
  telefoni la leggono;
- la firma VAPID si verifica con la chiave pubblica del locale;
- dispositivi: registrazione, stesso dispositivo due volte, indirizzi rifiutati, ognuno i suoi;
- invio: riuscito, dispositivo sparito (410 → tolto), errori di fila → spento, canale ignoto;
- chiavi del locale: generate una volta sola, cifrate se c'è TRGB_SECRET_KEY.

    cd /Users/underline83/trgb && python3 tests/test_notifiche_push.py

Solo libreria standard + cryptography (niente pytest, niente fastapi, niente rete).
"""

import base64
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)

from cryptography.fernet import Fernet  # noqa: E402
from cryptography.hazmat.primitives import hashes  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature  # noqa: E402

from app.models import notifiche_db  # noqa: E402
from app.services import notifiche_push as push  # noqa: E402


def b64(testo):
    return base64.urlsafe_b64decode(testo + "=" * (-len(testo) % 4))


# RFC 8291, sezione 5 e appendice A
RFC = {
    "testo": "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
    "as_privata": "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    "as_pubblica": "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    "ua_pubblica": "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    "auth": "BTBZMqHH6r4Tts7J_aSIgg",
    "salt": "DGv6ra1nlYgDCS1FRnbzlw",
    "intestazione": "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    "cifrato": "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
}

ISCRIZIONE = {"endpoint": "https://web.push.apple.com/QAbc123",
              "keys": {"p256dh": RFC["ua_pubblica"], "auth": RFC["auth"]}}


class TestCifratura(unittest.TestCase):
    def test_esempio_rfc_8291(self):
        as_priv = ec.derive_private_key(int.from_bytes(b64(RFC["as_privata"]), "big"), ec.SECP256R1())
        corpo = push.cifra(b64(RFC["testo"]), b64(RFC["ua_pubblica"]), b64(RFC["auth"]),
                           chiave_as=as_priv, salt=b64(RFC["salt"]))
        self.assertEqual(corpo, b64(RFC["intestazione"]) + b64(RFC["cifrato"]))

    def test_ogni_messaggio_ha_chiave_e_salt_suoi(self):
        a = push.cifra(b"ciao", b64(RFC["ua_pubblica"]), b64(RFC["auth"]))
        b = push.cifra(b"ciao", b64(RFC["ua_pubblica"]), b64(RFC["auth"]))
        self.assertNotEqual(a, b)
        self.assertEqual(len(a), 16 + 4 + 1 + 65 + len(b"ciao") + 1 + 16)


class TestFirma(unittest.TestCase):
    def test_firma_vapid_verificabile(self):
        priv = ec.generate_private_key(ec.SECP256R1())
        h = push.firma_vapid("https://web.push.apple.com/QAbc123", priv, "https://app.esempio.it", ora=1_000_000)
        self.assertTrue(h.startswith("vapid t="))
        token, chiave = h[len("vapid t="):].split(", k=")
        testa, corpo, firma = token.split(".")
        self.assertEqual(json.loads(b64(testa)), {"typ": "JWT", "alg": "ES256"})
        dati = json.loads(b64(corpo))
        self.assertEqual(dati["aud"], "https://web.push.apple.com")
        self.assertEqual(dati["sub"], "https://app.esempio.it")
        self.assertEqual(dati["exp"], 1_000_000 + 12 * 3600)
        f = b64(firma)
        self.assertEqual(len(f), 64)
        der = encode_dss_signature(int.from_bytes(f[:32], "big"), int.from_bytes(f[32:], "big"))
        priv.public_key().verify(der, f"{testa}.{corpo}".encode(), ec.ECDSA(hashes.SHA256()))
        self.assertEqual(len(b64(chiave)), 65)

    def test_carico_link_solo_interno_e_taglio(self):
        self.assertEqual(json.loads(push._carico("T", "c", "https://altro.it/x", None))["link"], "/")
        self.assertEqual(json.loads(push._carico("T", "c", "//altro.it", None))["link"], "/")
        self.assertEqual(json.loads(push._carico("T", "c", "/clienti/5", "giro"))["link"], "/clienti/5")
        lungo = push._carico("T", "à" * 5000, "/", None)
        self.assertLessEqual(len(lungo), push._MAX_CARICO)
        self.assertTrue(json.loads(lungo)["corpo"].endswith("…"))


class ConDb(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = [mock.patch.object(notifiche_db, "DB_PATH", Path(self.tmp.name) / "notifiche.sqlite3"),
                      mock.patch.dict(os.environ, {"TRGB_APP_URL": "https://app.esempio.it"})]
        for p in self.patch:
            p.start()
        os.environ.pop("TRGB_SECRET_KEY", None)
        notifiche_db.init_notifiche_db()
        self.inviate = []

    def tearDown(self):
        for p in self.patch:
            p.stop()
        self.tmp.cleanup()

    def finto(self, codice=201, testo=""):
        def _spedisci(url, corpo, intestazioni):
            self.inviate.append((url, corpo, intestazioni))
            if isinstance(codice, Exception):
                raise codice
            return codice, testo
        return mock.patch.object(push, "_spedisci", _spedisci)

    def riga(self, did):
        c = notifiche_db.get_notifiche_conn()
        try:
            return c.execute("SELECT * FROM notifiche_dispositivi WHERE id = ?", (did,)).fetchone()
        finally:
            c.close()


class TestDispositivi(ConDb):
    def test_registra_e_stato(self):
        d = push.registra("marco", ISCRIZIONE, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X)")
        self.assertEqual(d["nome"], "iPhone")
        self.assertEqual(d["canale"], "webpush")
        self.assertNotIn("indirizzo", d)
        self.assertNotIn("auth", d)
        s = push.stato("marco")
        self.assertEqual(len(b64(s["chiave_pubblica"])), 65)
        self.assertIsNone(s["errore"])
        self.assertEqual([x["id"] for x in s["dispositivi"]], [d["id"]])
        self.assertEqual(push.stato("altro")["dispositivi"], [])

    def test_stesso_dispositivo_due_volte_una_riga(self):
        a = push.registra("marco", ISCRIZIONE, nome="iPhone di Marco")
        b = push.registra("sala1", ISCRIZIONE, nome="iPad sala")
        self.assertEqual(a["id"], b["id"])
        self.assertEqual(push.dispositivi("marco"), [])
        self.assertEqual(push.dispositivi("sala1")[0]["nome"], "iPad sala")

    def test_indirizzi_e_chiavi_rifiutati(self):
        for endpoint in ("http://web.push.apple.com/x", "https://esempio.it/push", "https://127.0.0.1/x",
                         "https://evilpush.apple.com.esempio.it/x", "https://notfcm.googleapis.com.evil.it/x", ""):
            with self.assertRaises(push.PushErrore, msg=endpoint):
                push.registra("marco", {"endpoint": endpoint, "keys": ISCRIZIONE["keys"]})
        with self.assertRaises(push.PushErrore):
            push.registra("marco", {"endpoint": ISCRIZIONE["endpoint"], "keys": {"p256dh": "abc", "auth": RFC["auth"]}})
        with self.assertRaises(push.PushErrore):
            push.registra("marco", {"endpoint": ISCRIZIONE["endpoint"]})
        for buono in ("https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x",
                      "https://wns2-par02p.notify.windows.com/w/?token=x"):
            push.registra("marco", {"endpoint": buono, "keys": ISCRIZIONE["keys"]})
        self.assertEqual(len(push.dispositivi("marco")), 3)

    def test_togli_solo_i_propri(self):
        d = push.registra("marco", ISCRIZIONE)
        self.assertFalse(push.togli("sala1", d["id"]))
        self.assertEqual(len(push.dispositivi("marco")), 1)
        self.assertTrue(push.togli("marco", d["id"]))
        self.assertEqual(push.dispositivi("marco"), [])


class TestInvio(ConDb):
    def test_prova_riuscita(self):
        d = push.registra("marco", ISCRIZIONE)
        with self.finto(201):
            esito = push.prova("marco")
        self.assertEqual((esito["dispositivi"], esito["mandate"], esito["fallite"], esito["tolte"]), (1, 1, 0, 0))
        url, corpo, h = self.inviate[0]
        self.assertEqual(url, ISCRIZIONE["endpoint"])
        self.assertEqual(h["Content-Encoding"], "aes128gcm")
        self.assertEqual(h["TTL"], str(12 * 3600))
        self.assertTrue(h["Authorization"].startswith("vapid t="))
        self.assertEqual(corpo[16:21], b"\x00\x00\x10\x00\x41")
        r = self.riga(d["id"])
        self.assertIsNotNone(r["ultimo_ok"])
        self.assertEqual(r["errori_di_fila"], 0)

    def test_nessun_dispositivo_non_chiama_nessuno(self):
        with self.finto(201):
            esito = push.manda_a_utente("marco", "Titolo")
        self.assertEqual(esito["dispositivi"], 0)
        self.assertEqual(self.inviate, [])

    def test_dispositivo_sparito_viene_tolto(self):
        push.registra("marco", ISCRIZIONE)
        with self.finto(410, "Gone"):
            esito = push.manda_a_utente("marco", "Titolo", "Corpo", "/clienti/whatsapp")
        self.assertEqual((esito["mandate"], esito["tolte"]), (0, 1))
        self.assertEqual(push.dispositivi("marco"), [])

    def test_errori_di_fila_spengono_e_riattivare_riaccende(self):
        d = push.registra("marco", ISCRIZIONE)
        with self.finto(500, "boom"):
            for _ in range(4):
                esito = push.manda_a_utente("marco", "Titolo")
            self.assertEqual(esito["fallite"], 1)
            self.assertIn("500 boom", esito["errori"][0]["errore"])
            self.assertEqual(self.riga(d["id"])["attivo"], 1)
            push.manda_a_utente("marco", "Titolo")
            self.assertEqual(self.riga(d["id"])["attivo"], 0)
            self.assertEqual(push.manda_a_utente("marco", "Titolo")["dispositivi"], 0)
        self.assertEqual(len(self.inviate), 5)
        push.registra("marco", ISCRIZIONE)
        r = self.riga(d["id"])
        self.assertEqual((r["attivo"], r["errori_di_fila"], r["ultimo_errore"]), (1, 0, None))

    def test_rete_giu_non_solleva(self):
        d = push.registra("marco", ISCRIZIONE)
        with self.finto(OSError("rete giù")):
            esito = push.manda_a_utente("marco", "Titolo")
        self.assertEqual(esito["fallite"], 1)
        self.assertIn("rete", self.riga(d["id"])["ultimo_errore"])

    def test_un_successo_azzera_gli_errori(self):
        d = push.registra("marco", ISCRIZIONE)
        with self.finto(503):
            push.manda_a_utente("marco", "Titolo")
        self.assertEqual(self.riga(d["id"])["errori_di_fila"], 1)
        with self.finto(201):
            push.manda_a_utente("marco", "Titolo")
        self.assertEqual(self.riga(d["id"])["errori_di_fila"], 0)

    def test_valori_cambiabili(self):
        d = push.registra("marco", ISCRIZIONE)
        c = notifiche_db.get_notifiche_conn()
        push._cfg_set(c, "ttl_ore", "2")
        push._cfg_set(c, "errori_max", "1")
        c.commit()
        c.close()
        with self.finto(500):
            push.manda_a_utente("marco", "Titolo")
        self.assertEqual(self.inviate[0][2]["TTL"], "7200")
        self.assertEqual(self.riga(d["id"])["attivo"], 0)

    def test_canale_ignoto_non_rompe(self):
        d = push.registra("marco", ISCRIZIONE)
        c = notifiche_db.get_notifiche_conn()
        c.execute("UPDATE notifiche_dispositivi SET canale = 'apns' WHERE id = ?", (d["id"],))
        c.commit()
        c.close()
        with self.finto(201):
            esito = push.manda_a_utente("marco", "Titolo")
        self.assertEqual(esito["fallite"], 1)
        self.assertEqual(self.inviate, [])

    def test_senza_indirizzo_del_gestionale_lo_dice(self):
        push.registra("marco", ISCRIZIONE)
        with mock.patch.dict(os.environ, {"TRGB_APP_URL": ""}), \
                mock.patch("app.utils.locale_data.locale_info", return_value={}), self.finto(201):
            esito = push.manda_a_utente("marco", "Titolo")
        self.assertEqual(esito["fallite"], 1)
        self.assertIn("indirizzo del gestionale", esito["errori"][0]["errore"])


class TestChiavi(ConDb):
    def _salvata(self):
        c = notifiche_db.get_notifiche_conn()
        try:
            return push._cfg_get(c, "vapid_privata")
        finally:
            c.close()

    def test_generate_una_volta_sola(self):
        a = push.stato("marco")["chiave_pubblica"]
        b = push.stato("sala1")["chiave_pubblica"]
        self.assertEqual(a, b)
        self.assertTrue(self._salvata().startswith("chiaro:"))

    def test_cifrate_con_la_chiave_del_locale(self):
        with mock.patch.dict(os.environ, {"TRGB_SECRET_KEY": Fernet.generate_key().decode()}):
            a = push.stato("marco")["chiave_pubblica"]
            salvata = self._salvata()
            self.assertTrue(salvata.startswith("fernet:"))
            self.assertNotIn("PRIVATE KEY", salvata)
            self.assertEqual(push.stato("marco")["chiave_pubblica"], a)
        with mock.patch.dict(os.environ, {"TRGB_SECRET_KEY": Fernet.generate_key().decode()}):
            s = push.stato("marco")
            self.assertIsNone(s["chiave_pubblica"])
            self.assertIn("TRGB_SECRET_KEY", s["errore"])
        self.assertEqual(self._salvata(), salvata)


if __name__ == "__main__":
    unittest.main(verbosity=1)
