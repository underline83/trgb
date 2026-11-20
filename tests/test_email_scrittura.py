#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test di bozze e invii (email_scrittura_service, mattone M.D scrittura).
File temporanei, caselle IMAP e SMTP finti: non tocca produzione, non va in rete.

    cd /Users/underline83/trgb && python3 tests/test_email_scrittura.py
"""

import base64
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from datetime import datetime
from email import message_from_bytes, policy
from email.message import EmailMessage
from email.utils import make_msgid
from zoneinfo import ZoneInfo

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
TMP = tempfile.mkdtemp(prefix="trgb_email_scrittura_")
TZ = ZoneInfo("Europe/Rome")

_ld = types.ModuleType("app.utils.locale_data")
_ld.locale_data_path = lambda n: __import__("pathlib").Path(TMP) / n
_ld.locale_data_dir = lambda: __import__("pathlib").Path(TMP)
_ld.locale_timezone = lambda: TZ
_ld.locale_info = lambda: {}
sys.modules["app.utils.locale_data"] = _ld


class _FernetFinto:
    def encrypt(self, b):
        return b"F:" + base64.b64encode(b[::-1])

    def decrypt(self, b):
        return base64.b64decode(b[2:])[::-1]


INVII = []
ESITO = {"ok": True}


class _Esito:
    def __init__(self, ok, errore=None, message_id=None, eml=None):
        self.ok, self.errore, self.message_id, self.eml = ok, errore, message_id, eml


def _costruisci(to, subject, body="", cc=None, intestazioni=None, account=None):
    m = EmailMessage()
    m["From"] = (account or {}).get("from_addr", "trgb@tregobbi.it")
    m["To"] = ", ".join(to)
    if cc:
        m["Cc"] = ", ".join(cc)
    m["Subject"] = subject
    m["Message-ID"] = make_msgid(domain="tregobbi.it")
    for k, v in (intestazioni or {}).items():
        if v:
            m[k] = v
    m.set_content(body)
    return m


def _invia(to, subject, body="", allegati=None, cc=None, reply_to=None, intestazioni=None, account=None):
    INVII.append({"to": to, "subject": subject, "body": body, "cc": cc, "intestazioni": intestazioni or {},
                  "account": account})
    if not ESITO["ok"]:
        return _Esito(False, "SMTPAuthenticationError: rifiutato")
    m = _costruisci(to, subject, body, cc, intestazioni, account)
    return _Esito(True, message_id=m["Message-ID"], eml=m.as_bytes())


_es = types.ModuleType("app.services.email_service")
_es._cfg = lambda: {"host": "smtps.aruba.it", "port": "465", "user": "trgb@tregobbi.it", "password": "x",
                    "from_addr": "trgb@tregobbi.it", "from_name": "Osteria Tre Gobbi"}
_es.mancanti = lambda: []
_es._fernet = lambda: _FernetFinto()
_es.genera_chiave = lambda: "K"
_es.costruisci_messaggio = _costruisci
_es.invia_email = _invia
sys.modules["app.services.email_service"] = _es
_ns = types.ModuleType("app.services.notifiche_service")
_ns.crea_notifica = lambda **k: 1
sys.modules["app.services.notifiche_service"] = _ns

import app.services  # noqa: E402
app.services.email_service = _es
app.services.notifiche_service = _ns

from app.services import email_caselle_service as C     # noqa: E402
from app.services import email_scrittura_service as W   # noqa: E402
from app.models.email_db import init_email_db, get_email_conn  # noqa: E402


class ScrittoreFinto:
    """Fa le veci di ScrittoreImap: cartelle in memoria."""
    def __init__(self, senza_bozze=False):
        self.cartelle = {"INBOX": {}, "INBOX.Sent": {}, "INBOX.Trash": {}}
        if not senza_bozze:
            self.cartelle["INBOX.Drafts"] = {}
        self.login = None

    def __call__(self, c, pw):
        self.login = (c["utente"], pw)
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def elenco_cartelle(self):
        fl = {"INBOX.Sent": ["\\sent"], "INBOX.Drafts": ["\\drafts"], "INBOX.Trash": ["\\trash"]}
        return [{"nome": n, "leggibile": n, "flag": fl.get(n, []), "delim": "."} for n in self.cartelle]

    def aggiungi(self, cartella, raw, flag):
        uid = len(self.cartelle[cartella]) + 1
        self.cartelle[cartella][uid] = (raw, flag)
        return uid

    def togli_bozza(self, cartella, mid):
        for uid, (raw, _) in list(self.cartelle[cartella].items()):
            if message_from_bytes(raw, policy=policy.default)["Message-ID"] == mid:
                del self.cartelle[cartella][uid]
                return True
        return False


def msg(raw):
    return message_from_bytes(raw, policy=policy.default)


class Base(unittest.TestCase):
    def setUp(self):
        for f in os.listdir(TMP):
            if f.startswith("email"):
                os.remove(os.path.join(TMP, f))
        INVII.clear()
        ESITO["ok"] = True
        init_email_db()
        C.salva_casella({"indirizzo": "info@tregobbi.it", "imap_host": "imaps.aruba.it", "password": "pw-info"})
        C.salva_casella({"indirizzo": "tregobbi@pec.it", "imap_host": "imaps.pec.aruba.it", "password": "pw-pec"})
        C.salva_casella({"indirizzo": "prenotazioni@tregobbi.it", "imap_host": "imaps.aruba.it", "password": "pw-pren"})
        conn = get_email_conn()
        conn.execute(
            """INSERT INTO email_posta (id, casella, cartella, ruolo, uid, uidvalidity, message_id, riferimenti, mittente,
               mittente_nome, a, cc, oggetto, data, testo, presente) VALUES
               (10, 'info-tregobbi-it', 'INBOX', 'in_arrivo', 1, 1, '<laura@gmail.com>', '<prima@tregobbi.it>',
                'laura@gmail.com', 'Laura', 'info@tregobbi.it', 'marito@gmail.com, prenotazioni@tregobbi.it',
                'Prenotazione Cenone', ?, 'Confermo per 10 persone.', 1)""",
            (datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"),))
        conn.execute(
            """INSERT INTO email_posta (id, casella, cartella, ruolo, uid, uidvalidity, message_id, mittente, a, oggetto,
               data, testo, presente) VALUES (11, 'tregobbi-pec-it', 'INBOX', 'in_arrivo', 1, 1, '<pec1@pec.it>',
               'protocollo@ader.gov.it', 'tregobbi@pec.it', 'Avviso', '2026-11-19 10:00:00', 'Atto', 1)""")
        conn.execute(
            """INSERT INTO email_in (id, message_id, mittente, a, cc, oggetto, data, testo, stato) VALUES
               (5, '<abb@abb.com>', 'marta@abb.com', 'trgb@tregobbi.it', 'prenotazioni@tregobbi.it',
                'RE: Proposta menù', '2026-11-19 11:57:00', 'Ci aggiorniamo il 1 dicembre', 'nuova')""")
        conn.commit()
        conn.close()


class TestBozze(Base):
    def test_bozza_risposta_in_bozze_della_casella(self):
        s = ScrittoreFinto()
        b = W.crea_bozza("Buongiorno Laura, confermato.\nMarco", "Q", rif_fonte="casella", rif_id=10, apri=s)
        self.assertEqual(b["stato"], "bozza")
        self.assertEqual(b["a"], "laura@gmail.com")
        self.assertEqual(b["cc"], "marito@gmail.com")              # la casella stessa e prenotazioni@ no
        self.assertEqual(b["oggetto"], "RE: Prenotazione Cenone")
        self.assertEqual(s.login, ("info@tregobbi.it", "pw-info"))
        raw, flag = s.cartelle["INBOX.Drafts"][1]
        self.assertIn("\\Draft", flag)
        m = msg(raw)
        self.assertEqual(m["From"], "info@tregobbi.it")
        self.assertEqual(m["In-Reply-To"], "<laura@gmail.com>")
        self.assertIn("<prima@tregobbi.it>", m["References"])
        self.assertIn("> Confermo per 10 persone.", m.get_content())
        self.assertEqual(INVII, [])                                 # niente partito
        el = C.elenco(anche_trgb=False)
        self.assertEqual(el["mail"][0]["bozza"]["id"], b["id"])
        self.assertEqual(C.leggi(10)["bozza"]["testo"], "Buongiorno Laura, confermato.\nMarco")

    def test_nuova_bozza_sostituisce_la_vecchia(self):
        s = ScrittoreFinto()
        b1 = W.crea_bozza("Prima versione", "Q", rif_fonte="casella", rif_id=10, apri=s)
        b2 = W.crea_bozza("Seconda versione", "Q", rif_fonte="casella", rif_id=10, apri=s)
        self.assertEqual(W.leggi_bozza(b1["id"])["stato"], "sostituita")
        self.assertEqual(len(s.cartelle["INBOX.Drafts"]), 1)
        self.assertIn("Seconda versione", msg(list(s.cartelle["INBOX.Drafts"].values())[0][0]).get_content())
        self.assertEqual([x["id"] for x in W.bozze()], [b2["id"]])

    def test_invio_dopo_manda(self):
        s = ScrittoreFinto()
        b = W.crea_bozza("Confermato.", "Q", rif_fonte="casella", rif_id=10, apri=s)
        r = W.invia_bozza(b["id"], "Q", apri=s)
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["da"], "info@tregobbi.it")
        inv = INVII[0]
        self.assertEqual(inv["account"]["host"], "smtps.aruba.it")      # dedotto da imaps.aruba.it
        self.assertEqual(inv["account"]["from_addr"], "info@tregobbi.it")
        self.assertEqual(inv["account"]["password"], "pw-info")
        self.assertEqual(inv["intestazioni"]["In-Reply-To"], "<laura@gmail.com>")
        self.assertIn("> Confermo per 10 persone.", inv["body"])
        self.assertEqual(s.cartelle["INBOX.Drafts"], {})                 # bozza tolta
        self.assertEqual(len(s.cartelle["INBOX.Sent"]), 1)               # copia nell'Inviata
        self.assertEqual(W.leggi_bozza(b["id"])["stato"], "inviata")
        with self.assertRaises(W.ErroreScrittura):                       # mai due volte
            W.invia_bozza(b["id"], "Q", apri=s)

    def test_invio_fallito_resta_bozza(self):
        s = ScrittoreFinto()
        b = W.crea_bozza("Confermato.", "Q", rif_fonte="casella", rif_id=10, apri=s)
        ESITO["ok"] = False
        r = W.invia_bozza(b["id"], "Q", apri=s)
        self.assertFalse(r["ok"])
        self.assertEqual(W.leggi_bozza(b["id"])["stato"], "bozza")
        self.assertIn("SMTPAuthentication", W.leggi_bozza(b["id"])["errore"])
        self.assertEqual(len(s.cartelle["INBOX.Drafts"]), 1)

    def test_pec_solo_bozza(self):
        s = ScrittoreFinto()
        b = W.crea_bozza("Si trasmette…", "Q", rif_fonte="casella", rif_id=11, apri=s)
        self.assertFalse(b["puo_inviare"])
        with self.assertRaises(W.ErroreScrittura) as e:
            W.invia_bozza(b["id"], "Q", apri=s)
        self.assertIn("PEC", str(e.exception))
        self.assertEqual(INVII, [])

    def test_casella_del_gestionale(self):
        b = W.crea_bozza("Perfetto, a presto.", "Q", rif_fonte="trgb", rif_id=5)
        self.assertEqual(b["casella"], "trgb")
        self.assertIn("pagina Posta", b["dove"])
        self.assertEqual(W.bozze_per_mail("trgb", [5])[5]["id"], b["id"])
        r = W.invia_bozza(b["id"], "Q")
        self.assertTrue(r["ok"], r)
        self.assertEqual(INVII[0]["account"], None)                      # parte dal canale del gestionale
        self.assertEqual(INVII[0]["intestazioni"]["In-Reply-To"], "<abb@abb.com>")
        self.assertEqual(W.leggi_bozza(b["id"])["stato"], "inviata")

    def test_mail_nuova_e_validazioni(self):
        s = ScrittoreFinto()
        b = W.crea_bozza("Buongiorno, vi chiedo…", "Q", casella="info", a="fornitore@x.it", oggetto="Ordine", apri=s)
        self.assertEqual(b["a"], "fornitore@x.it")
        with self.assertRaises(W.ErroreScrittura):
            W.crea_bozza("x", "Q", casella="info", a="non-una-mail", oggetto="O", apri=s)
        with self.assertRaises(W.ErroreScrittura):
            W.crea_bozza("x", "Q", a="a@b.it", oggetto="O", apri=s)        # manca la casella
        with self.assertRaises(W.ErroreScrittura):
            W.crea_bozza("", "Q", rif_fonte="casella", rif_id=10, apri=s)
        with self.assertRaises(W.ErroreScrittura) as e:
            W.crea_bozza("x", "Q", rif_fonte="casella", rif_id=10, apri=ScrittoreFinto(senza_bozze=True))
        self.assertIn("Bozze", str(e.exception))

    def test_annulla(self):
        s = ScrittoreFinto()
        b = W.crea_bozza("x", "Q", rif_fonte="casella", rif_id=10, apri=s)
        r = W.annulla_bozza(b["id"], "Q", apri=s)
        self.assertTrue(r["tolta_dalla_casella"])
        self.assertEqual(r["stato"], "annullata")
        self.assertEqual(s.cartelle["INBOX.Drafts"], {})


class TestScrittoreVero(unittest.TestCase):
    def test_togli_solo_la_sua_bozza(self):
        """ScrittoreImap con un imaplib finto: STORE \\Deleted e UID EXPUNGE solo sugli UID trovati."""
        chiamate = []

        class M:
            capabilities = ("IMAP4REV1", "UIDPLUS")

            def login(self, u, p):
                pass

            def select(self, n, readonly=False):
                chiamate.append(("select", n, readonly))
                return "OK", [b"2"]

            def uid(self, cmd, *a):
                chiamate.append((cmd,) + a)
                if cmd == "SEARCH":
                    return "OK", [b"7"]
                return "OK", [b""]

            def append(self, cartella, flag, data, raw):
                chiamate.append(("APPEND", cartella, flag))
                return "OK", [b"[APPENDUID 1795131050 7] Append completed"]

            def logout(self):
                pass

        with W.ScrittoreImap("h", 993, "u", "p", fabbrica=lambda h, p: M()) as cas:
            self.assertEqual(cas.aggiungi("INBOX.Drafts", b"x", "(\\Draft \\Seen)"), 7)
            self.assertTrue(cas.togli_bozza("INBOX.Drafts", "<abc@tregobbi.it>"))
            self.assertFalse(cas.togli_bozza("INBOX.Drafts", "niente"))
        self.assertIn(("STORE", "7", "+FLAGS", "(\\Deleted)"), chiamate)
        self.assertIn(("EXPUNGE", "7"), chiamate)
        self.assertIn(("SEARCH", None, "HEADER", "Message-ID", "abc@tregobbi.it"), chiamate)


if __name__ == "__main__":
    unittest.main(verbosity=1)
