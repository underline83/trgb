# @version: v1.2 (2026-11-20) — email_posta.data_origine (intestazione | server): da dove viene la data della mail
# v1.1 (2026-11-19) — le altre caselle del locale: email_posta, email_posta_cursore, email_posta_giri
# v1.0 (2026-11-13) — posta in arrivo della casella del locale (mattone M.D, lettura)
# Modulo: platform (M.D email) — [core]
# -*- coding: utf-8 -*-
"""
Database della posta in arrivo — TRGB Gestionale (mattone M.D, lettura IMAP).

DB separato: <cartella dati del locale>/email.sqlite3

email_in — una mail arrivata nella casella del gestionale (INBOX, sola lettura)
  message_id   TEXT UNIQUE  Message-ID dell'header (o uno sintetico stabile se manca):
                            lo stesso messaggio non entra due volte, anche dopo un
                            cambio di UIDVALIDITY
  in_reply_to, riferimenti  header In-Reply-To e References («references» è parola
                            riservata in SQL, quindi la colonna si chiama riferimenti)
  uid, uidvalidity          dove stava sul server all'ultima lettura
  mittente, mittente_nome, a, cc, oggetto, data (locale, AAAA-MM-GG HH:MM:SS)
  testo        TEXT         testo semplice (l'HTML è convertito e ripulito: niente tag,
                            niente immagini, niente link attivi)
  testo_troncato INTEGER    1 se il testo è stato tagliato al limite di caratteri
  allegati     TEXT (JSON)  [{nome, tipo, dimensione}] — i file NON si scaricano
  dimensione   INTEGER      byte del messaggio sul server
  oltre_limite INTEGER      1 = messaggio oltre il limite: letta solo l'intestazione
  preventivo_id, cliente_id abbinamento al preventivo (modulo preventivi, via hook)
  abbinamento  TEXT         in_reply_to | numero | mittente | nessuno
  abbinamento_nota TEXT     es. «2 preventivi aperti per questo indirizzo»
  cc_nuovi     TEXT (JSON)  indirizzi del thread non ancora noti per quel preventivo
  stato        TEXT         nuova | gestita  (+ gestita_da, gestita_at)

email_in_cursore — per cartella: UIDVALIDITY e ultimo UID letto
email_in_risposte — risposte mandate dalla pagina Posta (a, cc, oggetto, testo, esito,
                   message_id, chi e quando): la mail parte da M.D con In-Reply-To/References
email_in_giri    — registro dei giri del job (esito, quante nuove, errore). Niente
                   contenuto delle mail, niente credenziali.

LE ALTRE CASELLE DEL LOCALE (2026-11-19, email_caselle_service)
email_posta — una mail di una casella in più (info@, prenotazioni@, la PEC…), in UNA cartella:
  casella      TEXT         id della casella (slug dell'indirizzo, es. info-tregobbi-it)
  cartella     TEXT         nome IMAP della cartella; ruolo = in_arrivo | inviata | spam | cestino
  message_id …              come email_in; UNIQUE(casella, cartella, message_id): la stessa
                            mail spostata nel cestino è una riga nuova, quella vecchia diventa
                            presente = 0
  letta, risposta_flag, contrassegnata   flag del server (Seen, Answered, Flagged),
                            riletti a ogni giro per gli ultimi N giorni (NULL = mai letti)
  presente     INTEGER      1 = ancora in quella cartella sul server; sparita_at quando non c'è più
  massiva, massiva_perche   newsletter/notifica automatica (List-Id, List-Unsubscribe, Precedence…)
  spam_marcato INTEGER      l'antispam del provider ha marcato l'oggetto (es. «*****SPAM*****»)
  pec_tipo     TEXT         NULL | messaggio | ricevuta | anomalia; pec_busta = oggetto della busta
                            (mittente, oggetto e testo sono quelli del messaggio dentro postacert.eml)
  primo_import INTEGER      1 = entrata col primo import (non è «arrivata adesso»)
  data_origine TEXT         intestazione = dalla Date della mail | server = INTERNALDATE (mail senza
                            Date, es. quelle mandate da TRGB prima del 2026-11-20) | NULL = letta
                            prima della v1.2 (la data può essere l'ora della lettura: il giro la ripara)
  Inviata: solo intestazioni (testo vuoto), servono a sapere a cosa si è risposto.
email_posta_cursore — per casella e cartella: UIDVALIDITY e ultimo UID letto
email_posta_giri    — registro dei giri per casella (esito, nuove, errore). Niente contenuti.

Nessuna password qui dentro: le credenziali sono quelle del canale email (M.D) per la
casella del gestionale e quelle di email_caselle.json (cifrate) o del .env per le altre.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("email.sqlite3")

_INDICI = {
    "idx_email_in_data": "CREATE INDEX idx_email_in_data ON email_in(data)",
    "idx_email_in_prev": "CREATE INDEX idx_email_in_prev ON email_in(preventivo_id)",
    "idx_email_in_stato": "CREATE INDEX idx_email_in_stato ON email_in(stato)",
    "idx_email_in_giri_inizio": "CREATE INDEX idx_email_in_giri_inizio ON email_in_giri(iniziato_at)",
    "idx_email_in_risposte_mail": "CREATE INDEX idx_email_in_risposte_mail ON email_in_risposte(email_in_id)",
    "idx_email_posta_data": "CREATE INDEX idx_email_posta_data ON email_posta(data)",
    "idx_email_posta_casella": "CREATE INDEX idx_email_posta_casella ON email_posta(casella, cartella, uid)",
    "idx_email_posta_mid": "CREATE INDEX idx_email_posta_mid ON email_posta(message_id)",
    "idx_email_posta_ruolo": "CREATE INDEX idx_email_posta_ruolo ON email_posta(ruolo, data)",
    "idx_email_posta_giri": "CREATE INDEX idx_email_posta_giri ON email_posta_giri(casella, id)",
}


def get_email_conn(path=None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path or DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_email_db(path=None) -> None:
    """Crea le tabelle se mancano (idempotente: CREATE IF NOT EXISTS, indici solo se
    assenti, così a regime non si scrive su sqlite_master)."""
    conn = get_email_conn(path)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_in (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id       TEXT NOT NULL UNIQUE,
                in_reply_to      TEXT,
                riferimenti      TEXT,
                cartella         TEXT NOT NULL DEFAULT 'INBOX',
                uid              INTEGER,
                uidvalidity      INTEGER,
                mittente         TEXT,
                mittente_nome    TEXT,
                a                TEXT,
                cc               TEXT,
                oggetto          TEXT,
                data             TEXT,
                testo            TEXT,
                testo_troncato   INTEGER NOT NULL DEFAULT 0,
                allegati         TEXT,
                dimensione       INTEGER,
                oltre_limite     INTEGER NOT NULL DEFAULT 0,
                preventivo_id    INTEGER,
                cliente_id       INTEGER,
                abbinamento      TEXT NOT NULL DEFAULT 'nessuno',
                abbinamento_nota TEXT,
                cc_nuovi         TEXT,
                stato            TEXT NOT NULL DEFAULT 'nuova' CHECK (stato IN ('nuova','gestita')),
                gestita_da       TEXT,
                gestita_at       TEXT,
                ricevuta_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_in_cursore (
                cartella      TEXT PRIMARY KEY,
                uidvalidity   INTEGER,
                ultimo_uid    INTEGER NOT NULL DEFAULT 0,
                aggiornato_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        # Risposte mandate dalla pagina Posta (2026-11-16): una riga per invio, anche fallito
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_in_risposte (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                email_in_id  INTEGER NOT NULL,
                a            TEXT,
                cc           TEXT,
                oggetto      TEXT,
                testo        TEXT,
                message_id   TEXT,
                esito        TEXT NOT NULL,          -- ok | errore
                errore       TEXT,
                inviato_da   TEXT,
                inviato_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_in_giri (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                iniziato_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                finito_at   TEXT,
                esito       TEXT,          -- ok | errore | saltato
                nuove       INTEGER NOT NULL DEFAULT 0,
                lette       INTEGER NOT NULL DEFAULT 0,
                errore      TEXT,
                nota        TEXT
            )
        """)
        # Le altre caselle del locale (2026-11-19): una riga per casella + cartella + Message-ID
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_posta (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                casella          TEXT NOT NULL,
                cartella         TEXT NOT NULL,
                ruolo            TEXT NOT NULL CHECK (ruolo IN ('in_arrivo','inviata','spam','cestino')),
                uid              INTEGER,
                uidvalidity      INTEGER,
                message_id       TEXT NOT NULL,
                in_reply_to      TEXT,
                riferimenti      TEXT,
                mittente         TEXT,
                mittente_nome    TEXT,
                a                TEXT,
                cc               TEXT,
                oggetto          TEXT,
                data             TEXT,
                testo            TEXT,
                testo_troncato   INTEGER NOT NULL DEFAULT 0,
                allegati         TEXT,
                dimensione       INTEGER,
                oltre_limite     INTEGER NOT NULL DEFAULT 0,
                letta            INTEGER,
                risposta_flag    INTEGER,
                contrassegnata   INTEGER,
                flag_at          TEXT,
                presente         INTEGER NOT NULL DEFAULT 1,
                sparita_at       TEXT,
                massiva          INTEGER NOT NULL DEFAULT 0,
                massiva_perche   TEXT,
                spam_marcato     INTEGER NOT NULL DEFAULT 0,
                pec_tipo         TEXT,
                pec_busta        TEXT,
                primo_import     INTEGER NOT NULL DEFAULT 0,
                ricevuta_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE (casella, cartella, message_id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_posta_cursore (
                casella       TEXT NOT NULL,
                cartella      TEXT NOT NULL,
                uidvalidity   INTEGER,
                ultimo_uid    INTEGER NOT NULL DEFAULT 0,
                aggiornato_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (casella, cartella)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_posta_giri (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                casella     TEXT NOT NULL,
                iniziato_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                finito_at   TEXT,
                esito       TEXT,          -- ok | errore | saltato
                nuove       INTEGER NOT NULL DEFAULT 0,
                lette       INTEGER NOT NULL DEFAULT 0,
                errore      TEXT,
                nota        TEXT,
                cartelle    TEXT           -- JSON {ruolo: [nomi]} trovate in quel giro
            )
        """)
        # 2026-11-20 (mig 240): da dove viene la data. Colonna libera (niente NOT NULL), solo se manca.
        if "data_origine" not in {r[1] for r in conn.execute("PRAGMA table_info(email_posta)")}:
            conn.execute("ALTER TABLE email_posta ADD COLUMN data_origine TEXT")
        esistenti = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        for nome, sql in _INDICI.items():
            if nome not in esistenti:
                conn.execute(sql)
        conn.commit()
    finally:
        conn.close()
