"""
Migrazione 123 — Vini: tabella widget_settings (2026-05-12)

CONTESTO:
  Marco ha esplicitato (sessione 2026-05-12, V-H.G) che soglie operative come
  ore "fresh"/"alert" sui calici, percentuali di tolleranza sul prezzo calice,
  cutoff per "vini fermi", divisore qta_suggerita, ecc. NON devono essere
  hardcoded nel codice ma esposti come variabili configurabili da UI.

OBIETTIVI:
  1. Creare tabella `vini_widget_settings` nel DB `vini_settings.sqlite3`
     (pattern key/value tipato, già usato in `dipendenti_settings`).
  2. Seed dei 12 valori default catturati dal codice attuale.
  3. La cache lato Python ricarica al primo accesso e si invalida via PUT.

DB COLPITO: vini_settings.sqlite3 (locale-aware).
Idempotente. Re-run no-op.

NB: il refactor dei consumer (CaliciDisponibiliCard, DecidiPrezzoCalice,
vini_metrics, vini_magazzino_db dashboard) avviene in commit separati DOPO
questa migration. Pre-refactor: i consumer continuano a usare i loro
hardcode; la migration è no-op operativo. Post-refactor: leggono dai
settings con fallback ai default.
"""
import sqlite3

from app.utils.locale_data import locale_data_path
# I default vivono nel service per essere single-source-of-truth (la migration
# è importabile come modulo Python solo via runner: nome che inizia con digit
# non è importable via importlib).
from app.services.vini_widget_settings_service import WIDGET_DEFAULTS


SETTINGS_DB = locale_data_path("vini_settings.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner, non usato). Apre vini_settings.sqlite3."""
    if not SETTINGS_DB.exists():
        # Caso primo boot: ensure_settings_defaults() ricreerà il DB.
        # La migration deve comunque essere idempotente: skip e re-run
        # avverrà alla prossima esecuzione (improbabile ma safe).
        print("  [123] vini_settings.sqlite3 non esiste, skip — verrà creato al boot")
        return

    sett = sqlite3.connect(SETTINGS_DB)
    try:
        cur = sett.cursor()

        # ── 1. Tabella widget_settings ──
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vini_widget_settings (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                tipo        TEXT NOT NULL DEFAULT 'int',
                descrizione TEXT,
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        print("  [123] tabella vini_widget_settings ok")

        # ── 2. Seed default (INSERT OR IGNORE per idempotenza) ──
        nuove = 0
        for key, value, tipo, descr in WIDGET_DEFAULTS:
            cur.execute(
                """
                INSERT OR IGNORE INTO vini_widget_settings (key, value, tipo, descrizione)
                VALUES (?, ?, ?, ?)
                """,
                (key, value, tipo, descr),
            )
            if cur.rowcount:
                nuove += 1
        print(f"  [123] seed: {nuove} nuove righe, {len(WIDGET_DEFAULTS) - nuove} già presenti")

        sett.commit()
        print("  [123] DONE")
    finally:
        sett.close()
