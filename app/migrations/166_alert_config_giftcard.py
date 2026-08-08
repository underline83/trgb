# Modulo: clienti
"""
Migrazione 166 — seed alert_config per il checker gift card (2026-08-08)

  - giftcard_scadenza → soglia_giorni = giorni di preavviso prima della
    scadenza (default 30), antidup_ore = 168 (max una notifica a settimana:
    e' un promemoria commerciale, non un allarme).

Le tabelle clienti_giftcard / clienti_giftcard_movimenti NON sono create qui:
nascono da `init_clienti_db()` con CREATE TABLE IF NOT EXISTS, che gira
all'import del router a ogni boot. Qui serve solo il seed della config alert,
che vive in un altro DB (notifiche.sqlite3).

INSERT OR IGNORE → idempotente. Se Marco ha gia' cambiato la soglia da
Impostazioni → Notifiche, il suo valore resta.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    """conn = foodcost.db (passato dal runner, non usato). Apre notifiche.sqlite3."""
    notif_path = locale_data_path("notifiche.sqlite3")
    if not notif_path.exists():
        print("  [166] notifiche.sqlite3 non esiste — seed saltato (fallback _DEFAULT_CONFIG)")
        return

    nconn = sqlite3.connect(str(notif_path), timeout=30)
    try:
        row = nconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alert_config'"
        ).fetchone()
        if not row:
            print("  [166] alert_config non ancora presente — seed saltato")
            return

        nconn.execute(
            """
            INSERT OR IGNORE INTO alert_config
                (checker, attivo, soglia_giorni, antidup_ore, dest_ruolo)
            VALUES ('giftcard_scadenza', 1, 30, 168, 'admin')
            """
        )
        nconn.commit()
        print("  ✔ [166] alert_config seed: giftcard_scadenza (30gg, 1/settimana)")
    finally:
        nconn.close()
