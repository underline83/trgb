"""
Migrazione 076: Preventivi — flag is_bozza_auto per auto-salvataggio silenzioso.

Contesto (sessione 36, Opzione A):
- Per permettere a Marco di comporre il menu dal ricettario GIA' sulla schermata
  di un preventivo nuovo (URL /nuovo), il frontend deve creare in modo silenzioso
  un preventivo embrionale al primo tocco del composer. Quel preventivo e' una
  "bozza automatica", diversa dallo stato 'bozza' (che Marco invece sceglie
  consapevolmente).
- La lista preventivi e le stats DEVONO ignorare le bozze automatiche di default,
  altrimenti ogni pagina /nuovo aperta e chiusa crea rumore nella lista.
- Quando Marco clicca "Salva modifiche" il flag viene azzerato → il preventivo
  diventa una normale bozza utente (stato='bozza', is_bozza_auto=0).

Passi:
  1. ALTER clienti_preventivi ADD COLUMN is_bozza_auto INTEGER DEFAULT 0
  2. Index su is_bozza_auto per filtri lista/stats veloci.

NOTA: clienti_preventivi vive in clienti.sqlite3, non in foodcost.db.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
CLIENTI_DB = locale_data_path("clienti.sqlite3")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return

    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        check = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_preventivi'"
        ).fetchone()
        if not check:
            print("  · clienti_preventivi non esiste ancora, skip")
            return

        existing_cols = {
            row[1] for row in cconn.execute("PRAGMA table_info(clienti_preventivi)").fetchall()
        }
        if "is_bozza_auto" not in existing_cols:
            try:
                cconn.execute(
                    "ALTER TABLE clienti_preventivi ADD COLUMN is_bozza_auto INTEGER DEFAULT 0"
                )
                print("  + clienti_preventivi.is_bozza_auto aggiunta")
            except sqlite3.OperationalError as e:
                print(f"  ⚠ is_bozza_auto: {e}")
        else:
            print("  · is_bozza_auto gia' presente")

        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cp_bozza_auto ON clienti_preventivi(is_bozza_auto)"
        )
        print("  + idx_cp_bozza_auto")

        cconn.commit()
    finally:
        cconn.close()
