# Modulo: vini — [core]
"""
Migrazione 176 — seed alert_config per il checker giacenze vini (2026-09-10)

  - vini_giacenze_incoerenti → vini con QTA_LOC3 ≠ celle in matrice o
    QTA_TOTALE ≠ somma dei posti. soglia_giorni non usata (0),
    antidup_ore = 24 (una notifica aggregata al giorno finché resta qualcosa
    da sistemare).

Nato dal #607 Toscana 50 e 50 (Marco 2026-09-10): 1 bt in matrice senza
celle, invisibile nei posti e impossibile da togliere dalla scheda.

INSERT OR IGNORE → idempotente. Se Marco ha già cambiato la config da
Impostazioni → Notifiche, il suo valore resta.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    """conn = foodcost.db (passato dal runner, non usato). Apre notifiche.sqlite3."""
    notif_path = locale_data_path("notifiche.sqlite3")
    if not notif_path.exists():
        print("  [176] notifiche.sqlite3 non esiste — seed saltato (fallback _DEFAULT_CONFIG)")
        return

    nconn = sqlite3.connect(str(notif_path), timeout=30)
    try:
        row = nconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alert_config'"
        ).fetchone()
        if not row:
            print("  [176] alert_config non ancora presente — seed saltato")
            return

        nconn.execute(
            """
            INSERT OR IGNORE INTO alert_config
                (checker, attivo, soglia_giorni, antidup_ore, dest_ruolo)
            VALUES ('vini_giacenze_incoerenti', 1, 0, 24, 'admin')
            """
        )
        nconn.commit()
        print("  ✔ [176] alert_config seed: vini_giacenze_incoerenti (1/giorno, admin)")
    finally:
        nconn.close()
