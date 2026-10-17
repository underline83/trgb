# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 197 — Recensioni TheFork in TRGB (2026-10-17)

Le recensioni arrivano dalla B2B API (GET /v1/reviews + /v1/reviews/{id}) e si
risponde da TRGB (PUT /v1/reviews/{id}/reply). Collegate al cliente
(clienti.thefork_id = customerUuid) e alla prenotazione
(clienti_prenotazioni.thefork_booking_id = reservationUuid).

thefork_recensioni: una riga per review_uuid (voti, commento, risposta, stati di
moderazione, json originale). `letta` = vista in TRGB.

Config (prenotazioni_config):
  recensioni_soglia_avviso  voto globale (su 10) sotto cui avvisare gli admin (default 8)

Solo CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE. DB: clienti.sqlite3.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS thefork_recensioni (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                review_uuid       TEXT NOT NULL UNIQUE,
                valida            INTEGER NOT NULL DEFAULT 1,
                cliente_id        INTEGER,
                prenotazione_id   INTEGER,
                customer_uuid     TEXT,
                reservation_uuid  TEXT,
                nome              TEXT,
                cognome           TEXT,
                data_pasto        TEXT,
                voto              REAL,
                voto_cibo         INTEGER,
                voto_servizio     INTEGER,
                voto_ambiente     INTEGER,
                prezzo            TEXT,
                attesa            TEXT,
                rumore            TEXT,
                occasione         TEXT,
                commento          TEXT,
                lingua            TEXT,
                commento_stato    TEXT,
                risposta          TEXT,
                risposta_lingua   TEXT,
                risposta_stato    TEXT,
                risposta_motivo   TEXT,
                risposta_da       TEXT,
                risposta_at       TEXT,
                letta             INTEGER NOT NULL DEFAULT 0,
                creata_ts         TEXT,
                aggiornata_ts     TEXT,
                payload           TEXT,
                sincronizzata_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_tf_recensioni_data ON thefork_recensioni(data_pasto)")
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_tf_recensioni_cliente ON thefork_recensioni(cliente_id)")
        try:
            cconn.execute("""
                INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
                ('recensioni_soglia_avviso', '8', 'Recensioni TheFork: avvisa gli admin sotto questo voto (su 10)')
            """)
        except sqlite3.OperationalError:
            pass
        cconn.commit()
        print("  + [197] thefork_recensioni")
    finally:
        cconn.close()
