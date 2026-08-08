# Modulo: vini
"""
Migrazione 165 — Vini: sync chiavi mancanti in vini_widget_settings (2026-08-08)

CONTESTO:
  La mig 123 ha creato `vini_widget_settings` e seedato le chiavi esistenti a
  quel momento. Da allora WIDGET_DEFAULTS è cresciuto (settings ordini O5,
  soglia giacenza widget riordino RD.1) ma nessuna migration le ha inserite:
  il service le risolveva dal `_FALLBACK` in-process, quindi funzionavano in
  lettura ma NON comparivano nella UI Impostazioni → non erano configurabili
  da Marco, che è esattamente il punto per cui i settings esistono
  (`get_all_widget_settings` legge solo dal DB, e `set_widget_setting` rifiuta
  le chiavi assenti in tabella).

OBIETTIVO:
  Allineare la tabella a WIDGET_DEFAULTS con INSERT OR IGNORE. Nessun valore
  esistente viene toccato: se Marco ha già cambiato una soglia, resta la sua.

DB COLPITO: vini_settings.sqlite3 (locale-aware).
Idempotente. Re-run no-op. Solo INSERT, nessun ALTER/DROP.
"""
import sqlite3

from app.utils.locale_data import locale_data_path
from app.services.vini_widget_settings_service import WIDGET_DEFAULTS


SETTINGS_DB = locale_data_path("vini_settings.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner, non usato). Apre vini_settings.sqlite3."""
    if not SETTINGS_DB.exists():
        print("  [165] vini_settings.sqlite3 non esiste, skip")
        return

    sett = sqlite3.connect(SETTINGS_DB, timeout=30)
    try:
        cur = sett.cursor()
        row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_widget_settings'"
        ).fetchone()
        if not row:
            print("  [165] tabella vini_widget_settings assente (mig 123 non applicata), skip")
            return

        nuove = []
        for key, value, tipo, descr in WIDGET_DEFAULTS:
            cur.execute(
                """
                INSERT OR IGNORE INTO vini_widget_settings (key, value, tipo, descrizione)
                VALUES (?, ?, ?, ?)
                """,
                (key, value, tipo, descr),
            )
            if cur.rowcount:
                nuove.append(key)

        sett.commit()
        if nuove:
            print(f"  [165] {len(nuove)} chiavi aggiunte: {', '.join(nuove)}")
        else:
            print("  [165] nessuna chiave mancante, no-op")
        print("  [165] DONE")
    finally:
        sett.close()
