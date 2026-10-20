# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 205 — Prenotazioni dal sito (widget pubblico) (2026-10-20)

Pagina pubblica /prenota (anche dentro il sito in iframe): il cliente sceglie
giorno, persone e orario fra le fasce aperte e non piene, lascia i dati e
riceve l'email. Fino a widget_max_automatica persone è confermata subito, oltre
arriva come richiesta (REQUESTED) da accettare nel Planning. Le prenotazioni
hanno fonte='sito', canale='Sito'.

Solo INSERT OR IGNORE in prenotazioni_config (DB clienti.sqlite3):
  widget_max_automatica   6    persone confermate in automatico
  widget_max_richiesta    35   oltre: «chiamaci»
  widget_ora_promemoria   10:00  ora dell'email di promemoria del giorno prima ('' = niente)
  widget_email_attive     1    email al cliente (conferma, richiesta, promemoria, annullamento)
  widget_url_pubblico     https://app.tregobbi.it  base dei link nelle email
  widget_telefono         ''   numero mostrato nella pagina e nelle email
  widget_nota             ''   testo mostrato sopra il modulo (es. «Il tavolo resta 2 ore»)
Esistenti e ora usate: widget_attivo, widget_messaggio_pieno,
giorni_anticipo_max, giorni_anticipo_min_ore.
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
        try:
            cconn.execute("""
                INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
                ('widget_max_automatica', '6', 'Prenotazioni dal sito: confermate in automatico fino a queste persone'),
                ('widget_max_richiesta', '35', 'Prenotazioni dal sito: oltre queste persone si chiede di telefonare'),
                ('widget_ora_promemoria', '10:00', 'Ora dell''email di promemoria il giorno prima (vuoto = niente promemoria)'),
                ('widget_email_attive', '1', 'Email automatiche ai clienti del sito (0/1)'),
                ('widget_url_pubblico', 'https://app.tregobbi.it', 'Indirizzo del gestionale usato nei link delle email'),
                ('widget_telefono', '', 'Telefono mostrato nella pagina di prenotazione e nelle email'),
                ('widget_nota', '', 'Testo mostrato sopra il modulo di prenotazione')
            """)
        except sqlite3.OperationalError:
            pass  # prenotazioni_config nasce con init_clienti_db
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_pren_token ON clienti_prenotazioni(token_cancellazione)")
        cconn.execute("CREATE INDEX IF NOT EXISTS idx_pren_email_log ON prenotazioni_email_log(prenotazione_id, tipo)")
        cconn.commit()
        print("  + [205] prenotazioni dal sito: config")
    finally:
        cconn.close()
