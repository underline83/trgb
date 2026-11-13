# @version: v1.0 (2026-11-13) — posta in arrivo della casella del locale (mattone M.D, lettura)
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
email_in_giri    — registro dei giri del job (esito, quante nuove, errore). Niente
                   contenuto delle mail, niente credenziali.

Nessuna password qui dentro: le credenziali sono quelle del canale email (M.D).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("email.sqlite3")

_INDICI = {
    "idx_email_in_data": "CREATE INDEX idx_email_in_data ON email_in(data)",
    "idx_email_in_prev": "CREATE INDEX idx_email_in_prev ON email_in(preventivo_id)",
    "idx_email_in_stato": "CREATE INDEX idx_email_in_stato ON email_in(stato)",
    "idx_email_in_giri_inizio": "CREATE INDEX idx_email_in_giri_inizio ON email_in_giri(iniziato_at)",
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
        esistenti = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        for nome, sql in _INDICI.items():
            if nome not in esistenti:
                conn.execute(sql)
        conn.commit()
    finally:
        conn.close()
