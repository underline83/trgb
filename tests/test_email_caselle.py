#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test delle altre caselle del locale (email_caselle_service, mattone M.D lettura).
Gira su file temporanei con caselle IMAP finte: non tocca produzione, non va in rete.

    cd /Users/underline83/trgb && python3 tests/test_email_caselle.py

Solo libreria standard (niente pytest, niente fastapi).
"""

import base64
import json
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from zoneinfo import ZoneInfo

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RADICE)
TMP = tempfile.mkdtemp(prefix="trgb_email_caselle_")
PW_INFO = "Info-Segreta-9!"

_ld = types.ModuleType("app.utils.locale_data")
_ld.locale_data_path = lambda n: __import__("pathlib").Path(TMP) / n
_ld.locale_data_dir = lambda: __import__("pathlib").Path(TMP)
_ld.locale_timezone = lambda: ZoneInfo("Europe/Rome")
_ld.locale_info = lambda: {}
sys.modules["app.utils.locale_data"] = _ld


class _FernetFinto:
    def encrypt(self, b):
        return b"F:" + base64.b64encode(b[::-1])

    def decrypt(self, b):
        assert b.startswith(b"F:")
        return base64.b64decode(b[2:])[::-1]


CHIAVE = {"c": _FernetFinto()}
_es = types.ModuleType("app.services.email_service")
_es._cfg = lambda: {"host": "smtps.aruba.it", "port": "465", "user": "trgb@tregobbi.it",
                    "password": "x", "from_addr": "trgb@tregobbi.it", "from_name": "Osteria"}
_es.mancanti = lambda: []
_es._fernet = lambda: CHIAVE["c"]
_es.genera_chiave = lambda: "CHIAVE-NUOVA"
sys.modules["app.services.email_service"] = _es
_ns = types.ModuleType("app.services.notifiche_service")
_ns.crea_notifica = lambda **k: 1
sys.modules["app.services.notifiche_service"] = _ns

import app.services  # noqa: E402
app.services.email_service = _es
app.services.notifiche_service = _ns

from app.services import email_in_service as E    # noqa: E402
from app.services import email_caselle_service as C  # noqa: E402
from app.models.email_db import init_email_db, get_email_conn  # noqa: E402

TZ = ZoneInfo("Europe/Rome")


def mail(mid, mittente, oggetto, testo="Buongiorno, vorrei prenotare.", a="info@tregobbi.it", data=None,
         in_reply_to=None, references=None, intest=None, senza_data=False):
    m = EmailMessage()
    m["From"] = mittente
    m["To"] = a
    m["Subject"] = oggetto
    if not senza_data:
        m["Date"] = (data or datetime.now(TZ)).strftime("%a, %d %b %Y %H:%M:%S %z")
    m["Message-ID"] = mid
    if in_reply_to:
        m["In-Reply-To"] = in_reply_to
    if references:
        m["References"] = references
    for k, v in (intest or {}).items():
        m[k] = v
    m.set_content(testo)
    return m.as_bytes()


def pec(mid, mittente_vero, oggetto, testo):
    interno = EmailMessage()
    interno["From"] = mittente_vero
    interno["To"] = "tregobbi@pec.it"
    interno["Subject"] = oggetto
    interno["Date"] = datetime.now(TZ).strftime("%a, %d %b %Y %H:%M:%S %z")
    interno["Message-ID"] = "<interno-" + mid.strip("<>") + ">"
    interno.set_content(testo)
    busta = EmailMessage()
    busta["From"] = f'"Per conto di: {mittente_vero}" <posta-certificata@pec.aruba.it>'
    busta["To"] = "tregobbi@pec.it"
    busta["Subject"] = f"POSTA CERTIFICATA: {oggetto}"
    busta["Date"] = datetime.now(TZ).strftime("%a, %d %b %Y %H:%M:%S %z")
    busta["Message-ID"] = mid
    busta["X-Trasporto"] = "posta-certificata"
    busta.set_content("Messaggio di posta certificata")
    busta.add_attachment(interno, filename="postacert.eml")
    busta.add_attachment(b"<daticert/>", maintype="application", subtype="xml", filename="daticert.xml")
    return busta.as_bytes()


def ricevuta(mid):
    m = EmailMessage()
    m["From"] = "posta-certificata@pec.aruba.it"
    m["To"] = "tregobbi@pec.it"
    m["Subject"] = "CONSEGNA: Risposta avviso"
    m["Date"] = datetime.now(TZ).strftime("%a, %d %b %Y %H:%M:%S %z")
    m["Message-ID"] = mid
    m["X-Ricevuta"] = "avvenuta-consegna"
    m.set_content("Il messaggio è stato consegnato")
    return m.as_bytes()


class CasellaFinta:
    """Fa le veci di CasellaImap con più cartelle. cartelle = {nome: {"flag": [...], "uv": n,
    "msg": {uid: (bytes, {flag})}}}"""
    def __init__(self, cartelle, rotta=False):
        self.cartelle = cartelle
        self.rotta = rotta
        self.sel = None
        self.uidvalidity = None
        self.scaricati = []
        self.login = None

    def __call__(self, c, password):           # usata come «apri(c, password)»
        self.login = (c["utente"], password)
        if self.rotta:
            raise OSError(f"[Errno 111] Connection refused (login {c['utente']} / {password})")
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def elenco_cartelle(self):
        return [{"nome": n, "leggibile": E.nome_cartella_leggibile(n), "flag": v.get("flag", []), "delim": "."}
                for n, v in self.cartelle.items()]

    def seleziona(self, nome):
        self.sel = nome
        self.uidvalidity = self.cartelle[nome].get("uv", 1)
        return self.uidvalidity

    def _m(self):
        return self.cartelle[self.sel]["msg"]

    def tutti_uid(self):
        return sorted(self._m())

    def uid_dal_giorno(self, giorno):
        return sorted(self._m())

    def flag(self, uids):
        return {u: {f.lower() for f in self._m()[u][1]} for u in uids if u in self._m()}

    def dimensioni(self, uids):
        return {u: len(self._m()[u][0]) for u in uids}

    def date_interne(self, uids):
        return {u: self.cartelle[self.sel].get("interne", {}).get(u, "2026-11-18 09:15:00") for u in uids if u in self._m()}

    def scarica(self, uid, solo_intestazione=False):
        self.scaricati.append((self.sel, uid, solo_intestazione))
        raw = self._m()[uid][0]
        return raw.split(b"\n\n", 1)[0] + b"\n\n" if solo_intestazione else raw


def righe(sql, *par):
    c = sqlite3.connect(os.path.join(TMP, "email.sqlite3"))
    c.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in c.execute(sql, par)]
    finally:
        c.close()


class Base(unittest.TestCase):
    def setUp(self):
        for f in os.listdir(TMP):
            if f.startswith("email"):
                os.remove(os.path.join(TMP, f))
        CHIAVE["c"] = _FernetFinto()
        os.environ.pop("POSTA_PASSWORD_PRENOTAZIONI_TREGOBBI_IT", None)
        init_email_db()
        C.salva_casella({"indirizzo": "info@tregobbi.it", "nome": "info@", "imap_host": "imaps.aruba.it",
                         "password": PW_INFO})


class TestConfig(Base):
    def test_password_cifrata_e_mai_fuori(self):
        raw = open(os.path.join(TMP, "email_caselle.json"), encoding="utf-8").read()
        self.assertNotIn(PW_INFO, raw)
        st = json.dumps(C.stato())
        self.assertNotIn(PW_INFO, st)
        self.assertNotIn("password_cifrata", st)
        cas = C.stato()["caselle"][0]
        self.assertTrue(cas["ha_password"])
        self.assertEqual(cas["password_da"], "gestionale")
        self.assertEqual(cas["utente"], "info@tregobbi.it")
        self.assertEqual(cas["id"], "info-tregobbi-it")

    def test_password_dal_env(self):
        C.salva_casella({"indirizzo": "prenotazioni@tregobbi.it", "imap_host": "imaps.aruba.it"})
        self.assertEqual(C.stato()["caselle"][1]["mancanti"], ["password"])
        os.environ["POSTA_PASSWORD_PRENOTAZIONI_TREGOBBI_IT"] = "dal-env"
        cas = C.stato()["caselle"][1]
        self.assertTrue(cas["ha_password"])
        self.assertEqual(cas["password_da"], "env")

    def test_senza_chiave_non_salva_in_chiaro(self):
        CHIAVE["c"] = None
        with self.assertRaises(ValueError) as e:
            C.salva_casella({"indirizzo": "marco@tregobbi.it", "imap_host": "imaps.aruba.it", "password": "x"})
        self.assertIn("TRGB_SECRET_KEY", str(e.exception))

    def test_validazioni(self):
        with self.assertRaises(ValueError):
            C.salva_casella({"indirizzo": "non-una-mail", "imap_host": "h"})
        with self.assertRaises(ValueError):
            C.salva_casella({"indirizzo": "info@tregobbi.it", "imap_host": "h"})       # doppione
        with self.assertRaises(ValueError):
            C.salva_casella({"indirizzo": "pec@x.it"})                               # manca server
        with self.assertRaises(ValueError):
            C.salva_casella({"id": "info-tregobbi-it", "ruoli": []})
        # modifica senza password: la password resta
        C.salva_casella({"id": "info-tregobbi-it", "nome": "Info", "ruoli": ["in_arrivo", "spam"]})
        cas = C.stato()["caselle"][0]
        self.assertTrue(cas["ha_password"])
        self.assertEqual(cas["ruoli"], ["in_arrivo", "spam"])


class TestCartelle(unittest.TestCase):
    def test_special_use_e_nomi(self):
        elenco = E.analizza_list([
            b'(\\HasNoChildren) "." INBOX',
            b'(\\HasNoChildren \\Sent) "." "INBOX.Sent"',
            b'(\\HasNoChildren \\Trash) "." "INBOX.Trash"',
            b'(\\HasNoChildren) "." "INBOX.Spam"',
            b'(\\HasNoChildren \\Drafts) "." "INBOX.Drafts"',
            b'(\\HasNoChildren) "." "Deleted Messages"',
            b'(\\HasNoChildren) "." "Sent Messages"',
            b'(\\Noselect \\HasChildren) "." "Archivio"',
            b'(\\HasNoChildren) "." "Posta &AOg- inviata"',
        ])
        self.assertEqual(elenco[1]["nome"], "INBOX.Sent")
        self.assertEqual(elenco[-1]["leggibile"], "Posta è inviata")
        r = C.trova_cartelle(elenco)
        self.assertEqual(r["in_arrivo"], ["INBOX"])
        self.assertIn("INBOX.Sent", r["inviata"])
        self.assertIn("Sent Messages", r["inviata"])
        self.assertEqual(r["spam"], ["INBOX.Spam"])
        self.assertEqual(r["cestino"], ["INBOX.Trash", "Deleted Messages"])
        self.assertNotIn("INBOX.Drafts", sum(r.values(), []))

    def test_quota(self):
        self.assertEqual(E.quota_cartella("INBOX"), "INBOX")
        self.assertEqual(E.quota_cartella("INBOX.Sent"), "INBOX.Sent")
        self.assertEqual(E.quota_cartella("Posta inviata"), '"Posta inviata"')

    def test_casella_imap_vera_in_sola_lettura(self):
        """CasellaImap con un imaplib finto: select readonly, mai STORE/COPY/MOVE/EXPUNGE."""
        chiamate = []

        class M:
            def login(self, u, p):
                chiamate.append(("login", u))

            def select(self, nome, readonly=False):
                chiamate.append(("select", nome, readonly))
                return "OK", [b"3"]

            def response(self, k):
                return k, [b"77"]

            def list(self):
                return "OK", [b'(\\HasNoChildren) "/" INBOX', b'(\\HasNoChildren \\Junk) "/" "Posta indesiderata"']

            def uid(self, cmd, *a):
                chiamate.append(("uid", cmd) + a)
                if cmd == "SEARCH":
                    return "OK", [b"1 5 9"]
                if "INTERNALDATE" in a[-1]:
                    return "OK", [b'1 (UID 5 INTERNALDATE "19-Nov-2026 22:06:54 +0000")']
                return "OK", [(b"1 (UID 5 FLAGS (\\Seen \\Answered))", b""), b"2 (UID 9 FLAGS ())"]

            def logout(self):
                pass

        with E.CasellaImap("h", 993, "u", "p", fabbrica=lambda h, p: M(), cartella=None) as cas:
            self.assertIsNone(cas.cartella)
            cart = C.trova_cartelle(cas.elenco_cartelle())
            self.assertEqual(cart["spam"], ["Posta indesiderata"])
            self.assertEqual(cas.seleziona("Posta indesiderata"), 77)
            self.assertEqual(cas.tutti_uid(), [1, 5, 9])
            self.assertEqual(cas.flag([5, 9]), {5: {"\\seen", "\\answered"}, 9: set()})
            self.assertEqual(cas.date_interne([5]), {5: "2026-11-19 23:06:54"})     # ora di Roma
        self.assertIn(("select", '"Posta indesiderata"', True), chiamate)
        vietati = {"STORE", "COPY", "MOVE", "EXPUNGE", "APPEND"}
        self.assertFalse([c for c in chiamate if c[0] == "uid" and c[1] in vietati])


class TestGiro(Base):
    def casella(self):
        ieri = datetime.now(TZ) - timedelta(days=1)
        return CasellaFinta({
            "INBOX": {"uv": 10, "msg": {
                1: (mail("<a1@gmail.com>", "Giulia <giulia@gmail.com>", "Cena per 12 sabato"), set()),
                2: (mail("<n1@news.it>", "Newsletter <news@vini.it>", "Le offerte",
                         intest={"List-Unsubscribe": "<mailto:x@vini.it>"}), {"\\Seen"}),
                3: (mail("<a2@studio.it>", "Studio Rizzo <rizzo@studio.it>", "Buste paga", data=ieri),
                    {"\\Seen", "\\Answered"}),
                4: (mail("<s1@x.ru>", "x <x@x.ru>", "*****SPAM***** guadagna"), set()),
            }},
            "INBOX.Sent": {"flag": ["\\Sent"], "uv": 20, "msg": {
                1: (mail("<r1@tregobbi.it>", "info@tregobbi.it", "Re: Buste paga", a="rizzo@studio.it",
                         in_reply_to="<a2@studio.it>"), {"\\Seen"}),
            }},
            "INBOX.Spam": {"uv": 30, "msg": {
                1: (mail("<c1@libero.it>", "Paolo <paolo@libero.it>", "Comunione 40 persone"), set()),
            }},
            "INBOX.Trash": {"flag": ["\\Trash"], "uv": 40, "msg": {}},
        })

    def test_primo_giro_e_classificazione(self):
        cas = self.casella()
        res = C.esegui_giro(apri=cas)
        self.assertEqual(res["esito"], "ok", res)
        self.assertEqual(cas.login, ("info@tregobbi.it", PW_INFO))
        self.assertEqual(res["nuove"], 6)
        # Inviata: solo intestazione
        self.assertIn(("INBOX.Sent", 1, True), cas.scaricati)
        self.assertIn(("INBOX", 1, False), cas.scaricati)
        el = C.elenco(anche_trgb=False)
        ogg = {m["oggetto"]: m for m in el["mail"]}
        self.assertIn("Cena per 12 sabato", ogg)
        self.assertFalse(ogg["Cena per 12 sabato"]["risposto"])
        self.assertFalse(ogg["Cena per 12 sabato"]["letta"])
        self.assertTrue(ogg["Buste paga"]["risposto"])
        self.assertIn("info@tregobbi.it", ogg["Buste paga"]["risposto_come"])
        self.assertEqual(ogg["Comunione 40 persone"]["dove"], "spam")
        self.assertNotIn("*****SPAM***** guadagna", ogg)                 # marcata spam: con le massive
        self.assertIn(("*****SPAM***** guadagna", "marcata spam dal provider"),
                      [(m["oggetto"], m["perche"]) for m in el["massive"]])
        self.assertNotIn("Le offerte", ogg)                          # massiva: a parte
        self.assertIn(("Le offerte", "List-Unsubscribe"), [(m["oggetto"], m["perche"]) for m in el["massive"]])
        self.assertNotIn("Re: Buste paga", ogg)                      # le inviate non sono nella lista
        da = {m["oggetto"] for m in C.elenco(solo_da_rispondere=True, anche_trgb=False)["mail"]}
        self.assertIn("Cena per 12 sabato", da)
        self.assertNotIn("Buste paga", da)
        self.assertEqual(el["caselle"][0]["errori_di_fila"], 0)
        self.assertEqual(el["caselle"][0]["cartelle"]["spam"], ["INBOX.Spam"])
        # giro dopo: niente di nuovo, niente riscaricato
        cas.scaricati.clear()
        res = C.esegui_giro(apri=cas)
        self.assertEqual(res["nuove"], 0)
        self.assertEqual(cas.scaricati, [])

    def test_spostata_nel_cestino_e_flag_aggiornati(self):
        cas = self.casella()
        C.esegui_giro(apri=cas)
        # Marco cestina la mail di Giulia e legge quella dello spam
        m = cas.cartelle["INBOX"]["msg"].pop(1)
        cas.cartelle["INBOX.Trash"]["msg"][1] = m
        cas.cartelle["INBOX.Spam"]["msg"][1] = (cas.cartelle["INBOX.Spam"]["msg"][1][0], {"\\Seen"})
        C.esegui_giro(apri=cas)
        el = C.elenco(anche_trgb=False)
        ogg = {m["oggetto"]: m for m in el["mail"]}
        self.assertEqual(ogg["Cena per 12 sabato"]["dove"], "cestino")
        self.assertTrue(ogg["Comunione 40 persone"]["letta"])
        vecchia = righe("SELECT presente, sparita_at FROM email_posta WHERE cartella='INBOX' AND message_id='<a1@gmail.com>'")[0]
        self.assertEqual(vecchia["presente"], 0)
        self.assertTrue(vecchia["sparita_at"])
        # una volta sola nella lista
        self.assertEqual(sum(1 for m in el["mail"] if m["oggetto"] == "Cena per 12 sabato"), 1)

    def test_risposta_da_unaltra_casella(self):
        C.salva_casella({"indirizzo": "marco@tregobbi.it", "imap_host": "imaps.aruba.it", "password": "m"})
        info = self.casella()
        marco = CasellaFinta({
            "INBOX": {"uv": 1, "msg": {}},
            "Sent": {"flag": ["\\Sent"], "uv": 2, "msg": {
                1: (mail("<r9@tregobbi.it>", "marco@tregobbi.it", "Re: Cena per 12 sabato", a="giulia@gmail.com",
                         references="<a1@gmail.com>"), set())}},
        })
        C.esegui_giro(apri=lambda c, pw: info(c, pw) if c["id"] == "info-tregobbi-it" else marco(c, pw))
        ogg = {m["oggetto"]: m for m in C.elenco(anche_trgb=False)["mail"]}
        self.assertTrue(ogg["Cena per 12 sabato"]["risposto"])
        self.assertIn("marco@tregobbi.it", ogg["Cena per 12 sabato"]["risposto_come"])

    def test_pec_e_ricevuta(self):
        C.salva_casella({"indirizzo": "tregobbi@pec.it", "imap_host": "imaps.pec.aruba.it", "password": "p"})
        p = CasellaFinta({"INBOX": {"uv": 5, "msg": {
            1: (pec("<opec1@pec.aruba.it>", "protocollo@pec.agenziariscossione.gov.it",
                    "Intimazione di pagamento n. 123", "In allegato l'atto."), set()),
            2: (ricevuta("<ric1@pec.aruba.it>"), set()),
        }}})
        res = C.esegui_giro(apri=lambda c, pw: p(c, pw) if c["id"] == "tregobbi-pec-it" else self.casella()(c, pw))
        self.assertEqual(res["esito"], "ok", res)
        el = C.elenco(casella="tregobbi@pec.it")
        ogg = {m["oggetto"]: m for m in el["mail"]}
        m = ogg["Intimazione di pagamento n. 123"]
        self.assertEqual(m["mittente"], "protocollo@pec.agenziariscossione.gov.it")
        self.assertEqual(m["pec"]["tipo"], "messaggio")
        self.assertIn("POSTA CERTIFICATA", m["pec"]["busta"])
        self.assertIn("In allegato l'atto.", m["estratto"])
        self.assertEqual(ogg["CONSEGNA: Risposta avviso"]["pec"]["tipo"], "ricevuta")
        da = {x["oggetto"] for x in C.elenco(casella="tregobbi@pec.it", solo_da_rispondere=True)["mail"]}
        self.assertEqual(da, {"Intimazione di pagamento n. 123"})
        tutto = C.leggi(m["id"])
        self.assertNotIn("postacert.eml", tutto.get("allegati") or [])     # la busta non è un allegato vero
        self.assertEqual(tutto["parte_nuova"], "In allegato l'atto.")

    def test_errore_senza_password_nei_log(self):
        cas = CasellaFinta({}, rotta=True)
        res = C.esegui_giro(apri=cas)
        self.assertEqual(res["esito"], "errore")
        err = res["caselle"][0]["errore"]
        self.assertNotIn(PW_INFO, err)
        self.assertIn("***", err)
        self.assertNotIn(PW_INFO, json.dumps(righe("SELECT * FROM email_posta_giri")))
        self.assertEqual(C.elenco()["caselle"][0]["errori_di_fila"], 1)

    def test_casella_spenta_e_senza_password(self):
        C.salva_casella({"indirizzo": "prenotazioni@tregobbi.it", "imap_host": "imaps.aruba.it"})
        C.salva_casella({"id": "info-tregobbi-it", "attiva": False})
        res = C.esegui_giro(apri=self.casella())
        self.assertEqual(len(res["caselle"]), 1)
        self.assertEqual(res["caselle"][0]["esito"], "saltato")
        self.assertIn("password", res["caselle"][0]["nota"])

    def test_dal_e_in_ritardo(self):
        cas = self.casella()
        C.esegui_giro(apri=cas)
        dopo = datetime.now(TZ).replace(tzinfo=None) + timedelta(minutes=1)
        # una PEC arrivata adesso ma datata tre giorni fa
        vecchia = datetime.now(TZ) - timedelta(days=3)
        cas.cartelle["INBOX"]["msg"][9] = (mail("<late@comune.it>", "Comune <suap@comune.it>", "SCIA", data=vecchia), set())
        cas.cartelle["INBOX"].setdefault("interne", {})[9] = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")  # il server l'ha appena ricevuta
        # e una vecchia che TRGB legge solo adesso (primo import a rate): NON è in ritardo
        cas.cartelle["INBOX"]["msg"][10] = (mail("<rata@x.it>", "x <x@x.it>", "Vecchia letta tardi", data=vecchia), set())
        cas.cartelle["INBOX"]["interne"][10] = vecchia.strftime("%Y-%m-%d %H:%M:%S")
        C.esegui_giro(apri=cas)
        conn = get_email_conn()
        conn.execute("UPDATE email_posta SET ricevuta_at = ? WHERE message_id IN ('<late@comune.it>', '<rata@x.it>')",
                     ((dopo + timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S"),))
        conn.commit()
        conn.close()
        el = C.elenco(dal=dopo.strftime("%Y-%m-%d %H:%M"), anche_trgb=False)
        self.assertEqual([m["oggetto"] for m in el["mail"]], ["SCIA"])
        self.assertTrue(el["mail"][0]["in_ritardo"])

    def test_casella_del_gestionale_nella_stessa_lista(self):
        conn = get_email_conn()
        conn.execute("INSERT INTO email_in (message_id, mittente, oggetto, data, testo, stato) VALUES "
                     "('<a1@gmail.com>', 'giulia@gmail.com', 'RE: Proposta menù', ?, 'Va bene', 'nuova')",
                     (datetime.now().strftime("%Y-%m-%d %H:%M:%S"),))
        conn.commit()
        conn.close()
        C.esegui_giro(apri=self.casella())
        el = C.elenco()
        trgb = [m for m in el["mail"] if m["fonte"] == "trgb"]
        self.assertEqual(len(trgb), 1)
        self.assertFalse(trgb[0]["risposto"])
        giulia = next(m for m in el["mail"] if m.get("oggetto") == "Cena per 12 sabato")
        self.assertIn("trgb (gestionale)", giulia["anche_in"])

    def test_senza_data_e_copie_da_noi(self):
        """Le copie dei preventivi che TRGB mandava senza Date (in cc a prenotazioni@): data dal
        server, e non sono «da rispondere» perché le ha mandate una nostra casella."""
        cas = CasellaFinta({"INBOX": {"uv": 3, "interne": {1: "2026-11-12 18:40:00"}, "msg": {
            1: (mail("<p15@tregobbi.it>", "Osteria <trgb@tregobbi.it>", "Proposta menù — 22 novembre",
                     a="cliente@x.it", senza_data=True), {"\\Seen"}),
        }}})
        C.esegui_giro(apri=cas)
        r = righe("SELECT data FROM email_posta WHERE message_id = '<p15@tregobbi.it>'")[0]
        self.assertEqual(r["data"], "2026-11-12 18:40:00")
        el = C.elenco(giorni=30, anche_trgb=False)
        m = el["mail"][0]
        self.assertTrue(m["da_noi"])
        self.assertTrue(m["risposto"])
        self.assertEqual(C.elenco(giorni=30, solo_da_rispondere=True, anche_trgb=False)["mail"], [])

    def test_ripara_date_gia_lette(self):
        """Mail lette dalla v1.1 senza Date: data = ora della lettura. Il giro dopo la ripara."""
        cas = CasellaFinta({"INBOX": {"uv": 3, "interne": {1: "2026-11-10 08:00:00"}, "msg": {
            1: (mail("<old@tregobbi.it>", "x@y.it", "Senza data", senza_data=True), set()),
        }}})
        C.esegui_giro(apri=cas)
        conn = get_email_conn()
        conn.execute("UPDATE email_posta SET data = ricevuta_at, data_origine = NULL")   # come le aveva salvate la v1.1
        conn.commit()
        conn.close()
        C.esegui_giro(apri=cas)
        self.assertEqual(righe("SELECT data FROM email_posta")[0]["data"], "2026-11-10 08:00:00")

    def test_ripara_ritardi_gia_letti(self):
        """Righe salvate prima della v1.3 come nuove ma lette tardi: il giro le verifica col server."""
        vecchia = datetime.now(TZ) - timedelta(days=5)
        cas = CasellaFinta({"INBOX": {"uv": 3, "interne": {1: vecchia.strftime("%Y-%m-%d %H:%M:%S")}, "msg": {
            1: (mail("<v1@x.it>", "x@y.it", "Vecchia", data=vecchia), set())}}})
        C.esegui_giro(apri=cas)
        conn = get_email_conn()
        conn.execute("UPDATE email_posta SET primo_import = 0")         # come le aveva salvate la v1.2
        conn.commit()
        conn.close()
        C.esegui_giro(apri=cas)
        self.assertEqual(righe("SELECT primo_import FROM email_posta")[0]["primo_import"], 1)
        self.assertEqual(C.elenco(dal=datetime.now(TZ).strftime("%Y-%m-%d"), anche_trgb=False)["mail"], [])

    def test_scartate_da_marco(self):
        """Cancellata o archiviata da Marco = vista: fuori da «da rispondere», resta sotto «Tutte».
        Finita nel cestino da sola e mai letta: resta da rispondere. Letta nel cestino: vista."""
        cas = self.casella()
        cas.cartelle["INBOX.Trash"]["msg"][7] = (mail("<filtro@x.it>", "Anna <anna@x.it>", "Tavolo sabato"), set())
        cas.cartelle["INBOX.Trash"]["msg"][8] = (mail("<vecchia@x.it>", "Bob <bob@x.it>", "Già vista"), {"\\Seen"})
        C.esegui_giro(apri=cas)
        cas.cartelle["INBOX.Trash"]["msg"][9] = cas.cartelle["INBOX"]["msg"].pop(1)     # Giulia: cancellata (UID nuovo, come IMAP)
        cas.cartelle["INBOX"]["msg"].pop(3)                                              # Rizzo: archiviata
        C.esegui_giro(apri=cas)
        da = {m["oggetto"] for m in C.elenco(solo_da_rispondere=True, anche_trgb=False)["mail"]}
        self.assertNotIn("Cena per 12 sabato", da)
        self.assertNotIn("Già vista", da)
        self.assertIn("Tavolo sabato", da)
        self.assertIn("Comunione 40 persone", da)
        tutte = {m["oggetto"]: m for m in C.elenco(anche_trgb=False)["mail"]}
        self.assertEqual(tutte["Cena per 12 sabato"]["scartata"], "cancellata da te")
        self.assertEqual(tutte["Buste paga"]["scartata"], "archiviata o cancellata da te")
        self.assertEqual(tutte["Già vista"]["scartata"], "letta nel cestino")
        self.assertNotIn("scartata", tutte["Tavolo sabato"])
        self.assertEqual(C.leggi(tutte["Cena per 12 sabato"]["id"])["scartata"], "cancellata da te")

    def test_prova(self):
        r = C.prova("info-tregobbi-it", apri=self.casella())
        self.assertTrue(r["ok"])
        self.assertEqual(r["cartelle_trovate"]["inviata"], ["INBOX.Sent"])
        r = C.prova("info-tregobbi-it", apri=CasellaFinta({}, rotta=True))
        self.assertFalse(r["ok"])
        self.assertNotIn(PW_INFO, r["errore"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
