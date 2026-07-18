"""
Migrazione 152: seed alert_config per i 2 checker Analisi Utenze (U4, spec_utenze.md §7)

  - utenze_scadenza_condizioni  → soglia_giorni = giorni di preavviso (default 60)
  - utenze_consumi_stimati      → soglia_giorni usata come SOGLIA PERCENTUALE
                                  (default 30 = 30% di consumo stimato sull'ultima
                                  bolletta gas; interpretazione per-checker come
                                  da commento schema alert_config)

antidup_ore = 168 (una notifica a settimana max: sono promemoria, non allarmi).
Le soglie restano modificabili da Impostazioni → Notifiche (regola: niente
soglie hardcoded). La tabella alert_config vive in notifiche.sqlite3: questa
migrazione apre la sua connessione dedicata (il runner passa quella di
foodcost.db). INSERT OR IGNORE → idempotente, non tocca config esistenti.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

SEED = [
    ("utenze_scadenza_condizioni", 60),
    ("utenze_consumi_stimati", 30),
]


def upgrade(conn):
    notif_path = locale_data_path("notifiche.sqlite3")
    nconn = sqlite3.connect(notif_path)
    try:
        # La tabella è creata dall'init di notifiche_db; se questo locale non
        # ha ancora il modulo notifiche inizializzato, non seminiamo nulla
        # (il fallback _DEFAULT_CONFIG di alert_engine copre comunque).
        row = nconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alert_config'"
        ).fetchone()
        if not row:
            print("  alert_config non ancora presente — seed saltato (fallback ai default engine)")
            return
        for checker, soglia in SEED:
            nconn.execute(
                """
                INSERT OR IGNORE INTO alert_config
                    (checker, attivo, soglia_giorni, antidup_ore, dest_ruolo)
                VALUES (?, 1, ?, 168, 'admin')
                """,
                (checker, soglia),
            )
        nconn.commit()
        print("  ✔ alert_config seed: utenze_scadenza_condizioni (60gg), utenze_consumi_stimati (30%)")
    finally:
        nconn.close()
