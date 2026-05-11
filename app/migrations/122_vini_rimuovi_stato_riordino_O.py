"""
Migrazione 122 — Rimuovi stato_riordino 'O' (Finito/Ordina) (2026-05-11)

CONTESTO:
  Lo stato 'O' (Finito/Ordina) era ridondante con 'D' (Da ordinare): entrambi
  identificano un vino che va riordinato. Marco l'ha rimosso per semplificare
  la UX (sessione 2026-05-11).

AZIONE:
  UPDATE vini_magazzino SET STATO_RIORDINO='D' WHERE STATO_RIORDINO='O'
  Idempotente. Re-run no-op.

NB: le query backend continuano a includere 'O' nelle IN list per safety, ma
dopo questa mig non ci sarà nessun record con quel valore. Da R8 in poi si
potrà rimuovere anche dalle IN list. Per ora lasciate per compat.

DB: vini_magazzino.sqlite3 (locale-aware).
"""
import sqlite3

from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner, non usato). Apre vini_magazzino.sqlite3."""
    if not VINI_MAG_DB.exists():
        print("  [122] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()
        cur.execute("""
            UPDATE vini_magazzino
            SET STATO_RIORDINO = 'D',
                UPDATED_AT = datetime('now')
            WHERE STATO_RIORDINO = 'O'
        """)
        n = cur.rowcount
        print(f"  [122] STATO_RIORDINO 'O' → 'D': {n} righe")
        mag.commit()
        print("  [122] DONE")
    finally:
        mag.close()
