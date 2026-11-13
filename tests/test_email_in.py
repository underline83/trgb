#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test della posta in arrivo (mattone M.D lettura) e dell'abbinamento ai preventivi.
Gira su DB temporanei con una casella finta: non tocca produzione, non va in rete.

    cd /Users/underline83/trgb && python3 tests/test_email_in.py

Solo libreria standard (niente pytest, niente fastapi).
"""

import os
import shutil
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
TMP = tempfile.mkdtemp(prefix="trgb_email_in_")
PASSWORD = "Segreta-123!"

# ── finti: cartella dati, canale email (credenziali), campanello ──
_ld = types.ModuleType("app.utils.locale_data")
_ld.locale_data_path = lambda n: __import__("pathlib").Path(TMP) / n
_ld.locale_data_dir = lambda: __import__("pathlib").Path(TMP)
_ld.locale_timezone = lambda: ZoneInfo("Europe/Rome")
_ld.locale_info = lambda: {}
sys.modules["app.utils.locale_data"] = _ld

_es = types.ModuleType("app.services.email_service")
_es._cfg = lambda: {"host": "smtps.aruba.it", "port": "465", "user": "trgb@tregobbi.it",
                    "password": PASSWORD, "from_addr": "trgb@tregobbi.it", "from_name": "Osteria"}
sys.modules["app.services.email_service"] = _es

CAMPANELLO = []
_ns = types.ModuleType("app.services.notifiche_service")
_ns.crea_notifica = lambda **k: CAMPANELLO.append(k) or len(CAMPANELLO)
sys.modules["app.services.notifiche_service"] = _ns

import app.services  # noqa: E402  (pacchetto reale)
app.services.email_service = _es
app.services.notifiche_service = _ns

from app.services import email_in_service as E          # noqa: E402
from app.services import preventivi_email_risposte as P  # noqa: E402

E.registra_abbinatore(P.abbina, dopo=P.dopo, descrivi=P.descrivi, nome="preventivi")

OGGI = date.today()
DOMANI = (OGGI + timedelta(days=1)).isoformat()


def prepara_clienti():
    p = os.path.join(TMP, "clienti.sqlite3")
    if os.path.exists(p):
        os.remove(p)
    c = sqlite3.connect(p)
    c.executescript(f"""
        CREATE TABLE clienti (id INTEGER PRIMARY KEY, nome TEXT, cognome TEXT, email TEXT, telefono TEXT);
        CREATE TABLE clienti_preventivi (id INTEGER PRIMARY KEY, numero TEXT, cliente_id INTEGER, titolo TEXT,
            stato TEXT, data_evento TEXT, ora_evento TEXT, n_persone INTEGER, scadenza_conferma TEXT,
            is_bozza_auto INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
        CREATE TABLE clienti_preventivi_invii (id INTEGER PRIMARY KEY AUTOINCREMENT, preventivo_id INTEGER,
            canale TEXT, destinatario TEXT, oggetto TEXT, esito TEXT, errore TEXT, message_id TEXT,
            inviato_da TEXT, created_at TEXT DEFAULT (datetime('now')), cc TEXT, reply_to TEXT);
        CREATE TABLE clienti_preventivi_storico (id INTEGER PRIMARY KEY AUTOINCREMENT, preventivo_id INTEGER,
            tipo TEXT, testo TEXT, utente TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE clienti_impostazioni (chiave TEXT PRIMARY KEY, valore TEXT, descrizione TEXT);
        INSERT INTO clienti_impostazioni VALUES ('preventivi_email_copia', 'prenotazioni@tregobbi.it', '');
        INSERT INTO clienti_impostazioni VALUES ('preventivi_avviso_ruoli', 'admin,capo_sala', '');
        INSERT INTO clienti VALUES (1, 'Ben', 'Lovejoy', 'ben@interpath.com', NULL);
        INSERT INTO clienti VALUES (2, 'Giulia', 'Rossetti', 'giulia@gmail.com', NULL);
        INSERT INTO clienti VALUES (3, 'Marta', 'Galvani', 'marta@abb.com', NULL);
        INSERT INTO clienti_preventivi VALUES (22, 'PRE-2026-022', 1, 'Cena Interpath', 'inviato',
            '2026-12-10', '20:00', 30, '{DOMANI}', 0, '2026-11-01', '2026-11-01');
        INSERT INTO clienti_preventivi VALUES (21, 'PRE-2026-021', 2, 'Compleanno', 'inviato',
            '2026-12-12', '13:00', 12, '{DOMANI}', 0, '2026-11-01', '2026-11-01');
        INSERT INTO clienti_preventivi VALUES (19, 'PRE-2026-019', 3, 'ABB pranzo', 'inviato',
            '2026-12-15', '13:00', 20, '{DOMANI}', 0, '2026-11-01', '2026-11-02');
        INSERT INTO clienti_preventivi VALUES (18, 'PRE-2026-018', 3, 'ABB cena', 'in_attesa',
            '2026-12-20', '20:00', 25, '{DOMANI}', 0, '2026-10-01', '2026-10-01');
        INSERT INTO clienti_preventivi VALUES (17, 'PRE-2026-017', 2, 'Vecchio', 'rifiutato',
            '2026-10-20', '20:00', 8, NULL, 0, '2026-09-01', '2026-09-01');
        INSERT INTO clienti_preventivi_invii (preventivo_id, canale, destinatario, esito, message_id, cc)
            VALUES (22, 'email', 'ben@interpath.com', 'ok', '<179458473738.1@tregobbi.it>', 'prenotazioni@tregobbi.it');
        INSERT INTO clienti_preventivi_invii (preventivo_id, canale, destinatario, esito, message_id, cc)
            VALUES (21, 'whatsapp', '+39333', 'ok', NULL, NULL);
        INSERT INTO clienti_preventivi_invii (preventivo_id, canale, destinatario, esito, message_id, cc)
            VALUES (18, 'email', 'marta@abb.com', 'ok', '<18@tregobbi.it>', 'prenotazioni@tregobbi.it');
        INSERT INTO clienti_preventivi_invii (preventivo_id, canale, destinatario, esito, message_id, cc)
            VALUES (19, 'email', 'marta@abb.com', 'ok', '<19@tregobbi.it>', 'prenotazioni@tregobbi.it');
    """)
    c.commit()
    c.close()


def mail(mid, mittente, oggetto, testo="Va bene, confermo.", html=None, in_reply_to=None, references=None,
         cc=None, a="trgb@tregobbi.it", data=None, allegato=None):
    m = EmailMessage()
    m["From"] = mittente
    m["To"] = a
    if cc:
        m["Cc"] = cc
    m["Subject"] = oggetto
    m["Date"] = (data or datetime.now(ZoneInfo("Europe/Rome"))).strftime("%a, %d %b %Y %H:%M:%S %z")
    if mid:
        m["Message-ID"] = mid
    if in_reply_to:
        m["In-Reply-To"] = in_reply_to
    if references:
        m["References"] = references
    m.set_content(testo)
    if html:
        m.add_alternative(html, subtype="html")
    if allegato:
        m.add_attachment(b"%PDF-1.4 finto", maintype="application", subtype="pdf", filename=allegato)
    return m.as_bytes()


class CasellaFinta:
    """Fa le veci di CasellaImap: stessi metodi, nessuna rete."""
    def __init__(self, uidvalidity, messaggi, rotta=False):
        self.uidvalidity = uidvalidity
        self.messaggi = dict(messaggi)       # uid -> bytes
        self.rotta = rotta
        self.scaricati = []

    def __call__(self, cfg):                 # usata come «apri(cfg)»
        assert cfg["password"] == PASSWORD and cfg["imap_host"] == "imaps.aruba.it"
        if self.rotta:
            raise OSError(f"[Errno 111] Connection refused (login {cfg['user']} / {cfg['password']})")
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def uid_da(self, primo):
        return sorted(u for u in self.messaggi if u >= primo)

    def uid_dal_giorno(self, giorno):
        return sorted(self.messaggi)

    def dimensioni(self, uids):
        return {u: len(self.messaggi[u]) for u in uids}

    def scarica(self, uid, solo_intestazione=False):
        self.scaricati.append((uid, solo_intestazione))
        raw = self.messaggi[uid]
        return raw.split(b"\n\n", 1)[0] + b"\n\n" if solo_intestazione else raw


def righe(sql, *par):
    c = sqlite3.connect(os.path.join(TMP, "email.sqlite3"))
    c.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in c.execute(sql, par)]
    finally:
        c.close()


def storico(pid):
    c = sqlite3.connect(os.path.join(TMP, "clienti.sqlite3"))
    try:
        return [r[0] for r in c.execute("SELECT testo FROM clienti_preventivi_storico WHERE preventivo_id = ?", (pid,))]
    finally:
        c.close()


class Base(unittest.TestCase):
    def setUp(self):
        for f in os.listdir(TMP):
            if f.startswith("email"):
                os.remove(os.path.join(TMP, f))
        prepara_clienti()
        CAMPANELLO.clear()

    def giro(self, casella, **cfg_extra):
        cfg = E.config()
        cfg.update(cfg_extra)
        return E.esegui_giro(apri=casella, cfg=cfg)


class TestAbbinamento(Base):
    def test_in_reply_to(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)  # primo import (vuoto)
        cas.messaggi[1] = mail("<r1@interpath.com>", "Ben Lovejoy <ben@interpath.com>", "Re: Preventivo cena",
                               in_reply_to="<179458473738.1@tregobbi.it>",
                               cc="Ezra Huan <ezra@interpath.com>, prenotazioni@tregobbi.it")
        r = self.giro(cas)
        self.assertEqual(r["esito"], "ok")
        self.assertEqual(r["nuove"], 1)
        m = righe("SELECT * FROM email_in")[0]
        self.assertEqual((m["preventivo_id"], m["cliente_id"], m["abbinamento"]), (22, 1, "in_reply_to"))
        # il collega in cc è segnalato, lo staff e la casella no; il cliente non si tocca
        self.assertIn("ezra@interpath.com", m["cc_nuovi"])
        self.assertNotIn("prenotazioni", m["cc_nuovi"])
        self.assertNotIn("trgb@", m["cc_nuovi"])
        st = storico(22)
        self.assertTrue(st and st[0].startswith("Risposta del cliente via email, "), st)
        self.assertIn("ezra@interpath.com", st[0])
        self.assertEqual(sorted(n["dest_ruolo"] for n in CAMPANELLO), ["admin", "capo_sala"])
        self.assertIn("ezra@interpath.com", CAMPANELLO[0]["messaggio"])
        c = sqlite3.connect(os.path.join(TMP, "clienti.sqlite3"))
        self.assertEqual(c.execute("SELECT email FROM clienti WHERE id = 1").fetchone()[0], "ben@interpath.com")
        c.close()

    def test_references_e_thread(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<a1@x.it>", "ben@interpath.com", "Re: cena",
                               references="<altro@x.it> <179458473738.1@tregobbi.it>")
        # risposta alla mail del cliente (non a un invio del gestionale): eredita dal thread
        cas.messaggi[2] = mail("<a2@x.it>", "ezra@interpath.com", "Re: Re: cena", in_reply_to="<a1@x.it>")
        self.giro(cas)
        m = {r["message_id"]: r for r in righe("SELECT * FROM email_in")}
        self.assertEqual(m["<a1@x.it>"]["abbinamento"], "in_reply_to")
        self.assertEqual(m["<a2@x.it>"]["preventivo_id"], 22)
        self.assertEqual(m["<a2@x.it>"]["abbinamento"], "in_reply_to")

    def test_numero_nell_oggetto(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<n1@x.it>", "Segreteria <segreteria@altra.it>", "Domanda su pre-2026-021 per sabato")
        self.giro(cas)
        m = righe("SELECT * FROM email_in")[0]
        self.assertEqual((m["preventivo_id"], m["cliente_id"], m["abbinamento"]), (21, 2, "numero"))
        self.assertIn("segreteria@altra.it", m["cc_nuovi"])

    def test_mittente(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<g1@x.it>", "giulia@gmail.com", "Ciao!")
        self.giro(cas)
        m = righe("SELECT * FROM email_in")[0]
        self.assertEqual((m["preventivo_id"], m["abbinamento"]), (21, "mittente"))
        self.assertIsNone(m["abbinamento_nota"])   # il preventivo 17 di Giulia è rifiutato: non conta

    def test_mittente_in_cc_e_piu_preventivi(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<m1@x.it>", "assistente@abb.com", "Pranzo", cc="marta@abb.com")
        self.giro(cas)
        m = righe("SELECT * FROM email_in")[0]
        self.assertEqual((m["preventivo_id"], m["abbinamento"]), (19, "mittente"))  # inviato per ultimo
        self.assertIn("PRE-2026-018", m["abbinamento_nota"])

    def test_nessun_abbinamento(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<x1@x.it>", "newsletter@fornitore.it", "Offerte di novembre")
        self.giro(cas)
        m = righe("SELECT * FROM email_in")[0]
        self.assertEqual((m["preventivo_id"], m["abbinamento"]), (None, "nessuno"))
        self.assertEqual(CAMPANELLO, [])
        el = E.elenco(abbinamento="nessuno")
        self.assertEqual(el["quante"], 1)

    def test_staff_nel_thread_niente_campanello(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<s1@x.it>", "prenotazioni@tregobbi.it", "Re: cena",
                               in_reply_to="<179458473738.1@tregobbi.it>")
        self.giro(cas)
        self.assertEqual(righe("SELECT preventivo_id FROM email_in")[0]["preventivo_id"], 22)
        self.assertEqual(CAMPANELLO, [])
        self.assertIn("(staff)", storico(22)[0])


class TestCasella(Base):
    def test_primo_import_senza_campanello(self):
        cas = CasellaFinta(7, {
            1: mail("<v1@x.it>", "ben@interpath.com", "Re", in_reply_to="<179458473738.1@tregobbi.it>",
                    data=datetime.now(ZoneInfo("Europe/Rome")) - timedelta(days=20)),
            2: mail("<v2@x.it>", "uno@x.it", "Ciao"),
        })
        r = self.giro(cas)
        self.assertEqual((r["esito"], r["nuove"]), ("ok", 2))
        self.assertIn("primo import", r["nota"])
        self.assertEqual(CAMPANELLO, [])            # mail vecchie: niente campanello
        self.assertEqual(len(storico(22)), 1)       # ma lo storico sì
        self.assertEqual(righe("SELECT ultimo_uid, uidvalidity FROM email_in_cursore")[0],
                         {"ultimo_uid": 2, "uidvalidity": 7})

    def test_doppioni(self):
        raw = mail("<dup@x.it>", "uno@x.it", "Ciao")
        cas = CasellaFinta(7, {1: raw})
        self.giro(cas)
        cas.messaggi[2] = raw                       # stesso Message-ID, altro UID (es. copiata di nuovo)
        r = self.giro(cas)
        self.assertEqual(r["nuove"], 0)
        self.assertEqual(r["lette"], 1)
        rows = righe("SELECT uid FROM email_in")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["uid"], 2)         # aggiornato solo dove sta
        r = self.giro(cas)                          # giro senza novità
        self.assertEqual((r["nuove"], r["lette"]), (0, 0))

    def test_senza_message_id_non_duplica(self):
        raw = mail(None, "uno@x.it", "Senza id")
        cas = CasellaFinta(7, {1: raw})
        self.giro(cas)
        cas.uidvalidity = 8                         # rilettura completa
        self.giro(cas)
        self.assertEqual(len(righe("SELECT * FROM email_in")), 1)

    def test_cambio_uidvalidity(self):
        a = mail("<u1@x.it>", "uno@x.it", "Uno")
        b = mail("<u2@x.it>", "due@x.it", "Due")
        cas = CasellaFinta(100, {5: a, 6: b})
        self.giro(cas)
        # casella ricreata sul server: UIDVALIDITY nuova, UID ripartiti da 1, più una mail nuova
        cas2 = CasellaFinta(200, {1: a, 2: b, 3: mail("<u3@x.it>", "tre@x.it", "Tre")})
        r = self.giro(cas2)
        self.assertEqual(r["esito"], "ok")
        self.assertEqual(r["nuove"], 1)
        self.assertIn("UIDVALIDITY", r["nota"])
        self.assertEqual(len(righe("SELECT * FROM email_in")), 3)
        self.assertEqual(righe("SELECT uidvalidity, ultimo_uid FROM email_in_cursore")[0],
                         {"uidvalidity": 200, "ultimo_uid": 3})
        self.assertEqual({r["uidvalidity"] for r in righe("SELECT uidvalidity FROM email_in")}, {200})
        cas2.messaggi[4] = mail("<u4@x.it>", "quattro@x.it", "Quattro")
        r = self.giro(cas2)                         # e poi riprende incrementale
        self.assertEqual((r["nuove"], r["lette"]), (1, 1))

    def test_casella_irraggiungibile(self):
        rotta = CasellaFinta(7, {}, rotta=True)
        r = self.giro(rotta)                        # non solleva
        self.assertEqual(r["esito"], "errore")
        self.assertNotIn(PASSWORD, r["errore"])
        g = righe("SELECT * FROM email_in_giri ORDER BY id DESC")[0]
        self.assertEqual(g["esito"], "errore")
        self.assertIn("Connection refused", g["errore"])
        self.assertNotIn(PASSWORD, g["errore"])
        self.giro(rotta)
        self.assertEqual(E.aggiornamento()["errori_di_fila"], 2)
        sana = CasellaFinta(7, {1: mail("<ok@x.it>", "uno@x.it", "Ciao")})
        r = self.giro(sana)                         # il giro dopo riprova e va
        self.assertEqual((r["esito"], r["nuove"]), ("ok", 1))
        self.assertEqual(E.aggiornamento()["errori_di_fila"], 0)

    def test_errore_a_meta_non_perde_niente(self):
        cas = CasellaFinta(7, {1: mail("<p1@x.it>", "a@x.it", "1"), 2: mail("<p2@x.it>", "b@x.it", "2")})
        vera = cas.scarica

        def rotta(uid, solo_intestazione=False):
            if uid == 2:
                raise OSError("connessione caduta")
            return vera(uid, solo_intestazione)
        cas.scarica = rotta
        r = self.giro(cas)
        self.assertEqual((r["esito"], r["nuove"]), ("errore", 1))
        cas.scarica = vera
        r = self.giro(cas)
        self.assertEqual((r["esito"], r["nuove"]), ("ok", 1))
        self.assertEqual(len(righe("SELECT * FROM email_in")), 2)

    def test_lettura_spenta_o_senza_credenziali(self):
        cas = CasellaFinta(7, {1: mail("<z@x.it>", "a@x.it", "1")})
        self.assertEqual(self.giro(cas, attiva=False)["esito"], "saltato")
        self.assertEqual(self.giro(cas, password="")["esito"], "saltato")
        self.assertEqual(righe("SELECT COUNT(*) n FROM email_in")[0]["n"], 0)

    def test_limite_dimensione(self):
        cas = CasellaFinta(7, {1: mail("<big@x.it>", "a@x.it", "Grosso", testo="x" * 5000, allegato="menu.pdf")})
        self.giro(cas, max_mb=0)                    # 0 MB: tutto è oltre il limite
        self.assertEqual(cas.scaricati, [(1, True)])
        m = righe("SELECT * FROM email_in")[0]
        self.assertEqual(m["oltre_limite"], 1)
        self.assertEqual(m["oggetto"], "Grosso")
        self.assertIn("oltre il limite", m["testo"])

    def test_max_per_giro(self):
        cas = CasellaFinta(7, {i: mail(f"<g{i}@x.it>", "a@x.it", str(i)) for i in range(1, 6)})
        r = self.giro(cas, max_per_giro=3)
        self.assertEqual(r["nuove"], 3)
        self.assertIn("2 messaggi rimandati", r["nota"])
        r = self.giro(cas, max_per_giro=3)
        self.assertEqual(r["nuove"], 2)


class TestImapSolaLettura(unittest.TestCase):
    """CasellaImap contro un finto imaplib: EXAMINE, BODY.PEEK, nessun comando che scrive."""
    class M:
        def __init__(self):
            self.comandi = []

        def login(self, u, p):
            self.comandi.append(("LOGIN", u))

        def select(self, cartella, readonly=False):
            self.comandi.append(("SELECT", cartella, readonly))
            return "OK", [b"3"]

        def response(self, nome):
            return nome, [b"4242"]

        def uid(self, cmd, *args):
            self.comandi.append(("UID", cmd) + args)
            if cmd == "SEARCH":
                return "OK", [b"9 10"]
            if "RFC822.SIZE" in args[-1]:
                return "OK", [b"1 (UID 9 RFC822.SIZE 120)", b"2 (UID 10 RFC822.SIZE 99999)"]
            return "OK", [(b"1 (UID 9 BODY[] {5}", b"ciao!"), b")"]

        def logout(self):
            self.comandi.append(("LOGOUT",))

        def __getattr__(self, nome):            # store, copy, move, expunge… non devono esistere
            raise AssertionError(f"comando vietato: {nome}")

    def test_sola_lettura(self):
        finto = self.M()
        cas = E.CasellaImap("imaps.aruba.it", 993, "trgb@tregobbi.it", PASSWORD, fabbrica=lambda h, p: finto)
        with cas as c:
            self.assertEqual(c.uidvalidity, 4242)
            self.assertEqual(c.uid_da(10), [10])
            self.assertEqual(c.dimensioni([9, 10]), {9: 120, 10: 99999})
            self.assertEqual(c.scarica(9), b"ciao!")
            c.scarica(10, solo_intestazione=True)
            self.assertEqual(c.uid_dal_giorno(date(2026, 9, 14))[:1], [9])
        self.assertIn(("SELECT", "INBOX", True), finto.comandi)
        fetch = [x for x in finto.comandi if x[:2] == ("UID", "FETCH") and "BODY" in x[-1]]
        self.assertTrue(fetch and all("BODY.PEEK[" in x[-1] for x in fetch))
        self.assertIn(("UID", "SEARCH", None, "SINCE", "14-Sep-2026"), finto.comandi)
        self.assertEqual(finto.comandi[-1], ("LOGOUT",))
        self.assertIsNone(cas._cred)             # la password non resta nell'oggetto
        self.assertNotIn(PASSWORD, repr(vars(cas)))


class TestTesto(unittest.TestCase):
    def test_html_ripulito(self):
        h = ('<html><head><style>p{color:red}</style><script>alert(1)</script></head><body>'
             '<p>Ciao&nbsp;Marco,</p><p>confermiamo &egrave; tutto ok.<img src="https://track.x/p.gif"></p>'
             '<a href="https://phish.example">clicca qui</a><ul><li>uno</li><li>due</li></ul></body></html>')
        t = E.html_a_testo(h)
        self.assertIn("Ciao Marco,", t)
        self.assertIn("confermiamo è tutto ok.", t)
        self.assertIn("clicca qui", t)
        for vietato in ("alert", "color:red", "track.x", "phish.example", "<", ">"):
            self.assertNotIn(vietato, t)
        self.assertIn("• uno", t)

    def test_solo_html_e_allegati(self):
        m = EmailMessage()
        m["From"], m["Subject"], m["Message-ID"] = "a@x.it", "Solo html", "<h@x.it>"
        m.set_content("<p>Ciao <b>Marco</b></p>", subtype="html")
        m.add_attachment(b"x" * 1234, maintype="application", subtype="pdf", filename="conferma.pdf")
        r = E.analizza(m.as_bytes())
        self.assertEqual(r["testo"], "Ciao Marco")
        self.assertEqual(r["allegati"], [{"nome": "conferma.pdf", "tipo": "application/pdf", "dimensione": 1234}])

    def test_parte_nuova(self):
        t = ("Perfetto, confermiamo il menù Quadri.\n\nIl giorno ven 13 nov 2026 alle ore 10:00 Osteria\n"
             "<trgb@tregobbi.it> ha scritto:\n> Gentile cliente...\n> ecco il preventivo")
        self.assertEqual(E.parte_nuova(t), "Perfetto, confermiamo il menù Quadri.")
        self.assertEqual(E.parte_nuova("ok\n> citato"), "ok")

    def test_codifica_storta(self):
        self.assertEqual(E.ripara_codifica("il messaggio Ã¨ stato inviato"), "il messaggio è stato inviato")
        self.assertEqual(E.ripara_codifica("con oggetto \"Test\" ï¿½ stato inviato"), 'con oggetto "Test" \ufffd stato inviato')
        self.assertEqual(E.ripara_codifica("già giusto: è"), "già giusto: è")
        # parte dichiarata latin-1 ma scritta in UTF-8
        m = EmailMessage()
        m["From"], m["Subject"], m["Message-ID"] = "a@x.it", "Prova", "<c@x.it>"
        m.set_payload("Il messaggio è arrivato".encode("utf-8"), charset="iso-8859-1")
        self.assertEqual(E.analizza(m.as_bytes())["testo"], "Il messaggio è arrivato")

    def test_troncato(self):
        r = E.analizza(mail("<t@x.it>", "a@x.it", "Lungo", testo="a" * 500), max_caratteri=100)
        self.assertEqual(len(r["testo"]), 100)
        self.assertTrue(r["testo_troncato"])


class TestLetture(Base):
    def test_elenco_leggi_stato(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<l1@x.it>", "ben@interpath.com", "Re: cena", in_reply_to="<179458473738.1@tregobbi.it>",
                               testo="Confermiamo.\n\nOn Fri, Nov 13, 2026 Osteria wrote:\n> preventivo")
        cas.messaggi[2] = mail("<l2@x.it>", "spam@x.it", "Offerta",
                               data=datetime.now(ZoneInfo("Europe/Rome")) - timedelta(days=10))
        self.giro(cas)
        el = E.elenco(giorni=7)
        self.assertEqual(el["quante"], 1)
        voce = el["mail"][0]
        self.assertEqual(voce["preventivo"]["numero"], "PRE-2026-022")
        self.assertEqual(voce["preventivo"]["scadenza_conferma"], DOMANI)
        self.assertEqual(voce["preventivo"]["data_evento"], "2026-12-10")
        self.assertEqual(voce["estratto"], "Confermiamo.")
        self.assertEqual(E.elenco(preventivo_id=22)["quante"], 1)
        self.assertEqual(E.elenco(q="Offerta")["quante"], 1)
        # «dal» + anche_nuove: il giro del mattino vede le nuove anche se vecchie
        dal = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M")
        self.assertEqual(E.elenco(dal=dal)["quante"], 1)
        self.assertEqual(E.elenco(dal=dal, anche_nuove=True)["quante"], 2)
        with self.assertRaises(ValueError):
            E.elenco(dal="ieri")
        d = E.leggi(voce["id"])
        self.assertIn("wrote:", d["testo"])
        self.assertEqual(d["parte_nuova"], "Confermiamo.")
        g = E.imposta_stato(voce["id"], "gestita", "marco")
        self.assertEqual((g["stato"], g["gestita_da"]), ("gestita", "marco"))
        self.assertEqual(E.nuove_per_preventivo(), {})
        self.assertEqual(E.elenco(stato="nuova")["quante"], 1)
        self.assertIsNone(E.imposta_stato(9999, "gestita", "marco"))

    def test_senza_risposta(self):
        cas = CasellaFinta(7, {})
        self.giro(cas)
        cas.messaggi[1] = mail("<sr@x.it>", "ben@interpath.com", "Re", in_reply_to="<179458473738.1@tregobbi.it>")
        self.giro(cas)
        ids = {p["numero"]: p for p in P.senza_risposta(giorni=3)}
        self.assertNotIn("PRE-2026-022", ids)        # ha risposto
        self.assertNotIn("PRE-2026-017", ids)        # rifiutato
        self.assertIn("PRE-2026-021", ids)
        self.assertIn("WhatsApp", ids["PRE-2026-021"]["nota"])
        self.assertEqual(ids["PRE-2026-021"]["giorni_alla_scadenza"], 1)
        self.assertEqual(P.senza_risposta(giorni=0), [])   # scadono domani: non entro 0 giorni


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
