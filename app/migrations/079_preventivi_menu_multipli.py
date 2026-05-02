"""
Migrazione 079: Preventivi — menu multipli alternativi.

Contesto (sessione 39, feedback Marco):
- Un preventivo deve poter presentare al cliente PIU' menu alternativi
  (es. "Opzione A - Menu carne 55€/pax", "Opzione B - Menu pesce 65€/pax").
- Non sono compresenti: il cliente ne sceglie UNO.
- Regole totale:
    0 menu  → totale = solo righe Extra
    1 menu  → totale = (menu.prezzo_persona × n_persone) + righe Extra (invariato)
    >= 2    → NO totale (per non creare confusione); si mostra "alternative"

Struttura:
  1. CREATE TABLE clienti_preventivi_menu
     - id, preventivo_id, nome, sort_order, sconto, subtotale, prezzo_persona, created_at
     - FK preventivo_id ON DELETE CASCADE
  2. ALTER clienti_preventivi_menu_righe ADD menu_id INTEGER
     (FK verso clienti_preventivi_menu — SQLite ALTER non supporta FK inline, la logica FK è gestita da service + ON DELETE manuale)
  3. Backfill: per ogni preventivo_id che ha gia' righe menu (mig 075), crea
     un record menu "Menu" (sort_order=0) copiando i denorma dalla testata
     (menu_subtotale, menu_sconto, menu_prezzo_persona) e assegna menu_id
     a tutte le righe di quel preventivo.
  4. Indici su menu(preventivo_id, sort_order) e righe(menu_id).

Retro-compat:
- Le colonne denorma su clienti_preventivi (menu_subtotale/sconto/prezzo_persona)
  restano come cache del "menu principale" (primo per sort_order) per
  eventuali query esistenti (es. lista preventivi). Il service tiene sincronizzato.

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
    cconn.row_factory = sqlite3.Row
    try:
        # Guard: serve la tabella righe (mig 075)
        check = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_preventivi_menu_righe'"
        ).fetchone()
        if not check:
            print("  · clienti_preventivi_menu_righe non esiste ancora, skip (serve mig 075)")
            return

        # ── 1. CREATE clienti_preventivi_menu ──
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_preventivi_menu (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id   INTEGER NOT NULL,
                nome            TEXT    NOT NULL DEFAULT 'Menu',
                sort_order      INTEGER NOT NULL DEFAULT 0,
                sconto          REAL    NOT NULL DEFAULT 0,
                subtotale       REAL    NOT NULL DEFAULT 0,
                prezzo_persona  REAL    NOT NULL DEFAULT 0,
                created_at      TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (preventivo_id) REFERENCES clienti_preventivi(id) ON DELETE CASCADE
            )
        """)
        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cpm_preventivo ON clienti_preventivi_menu(preventivo_id, sort_order)"
        )
        print("  + clienti_preventivi_menu (tabella + index)")

        # ── 2. ALTER clienti_preventivi_menu_righe ADD menu_id ──
        righe_cols = {
            row[1] for row in cconn.execute(
                "PRAGMA table_info(clienti_preventivi_menu_righe)"
            ).fetchall()
        }
        if "menu_id" not in righe_cols:
            cconn.execute(
                "ALTER TABLE clienti_preventivi_menu_righe ADD COLUMN menu_id INTEGER"
            )
            print("  + clienti_preventivi_menu_righe.menu_id aggiunta")
        else:
            print("  · clienti_preventivi_menu_righe.menu_id gia' presente")

        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cpmr_menu ON clienti_preventivi_menu_righe(menu_id)"
        )

        # ── 3. Backfill: un menu "Menu" per ogni preventivo con righe esistenti ──
        # Trova i preventivi che hanno righe menu (mig 075) ma nessun record menu ancora
        preventivi_con_righe = cconn.execute("""
            SELECT DISTINCT r.preventivo_id
            FROM clienti_preventivi_menu_righe r
            LEFT JOIN clienti_preventivi_menu m ON m.preventivo_id = r.preventivo_id
            WHERE m.id IS NULL
        """).fetchall()

        if not preventivi_con_righe:
            print("  · nessun preventivo da backfillare")
        else:
            # Legge i denorma dalla testata per copiarli nel menu backfillato
            testata_cols = {
                row[1] for row in cconn.execute(
                    "PRAGMA table_info(clienti_preventivi)"
                ).fetchall()
            }
            has_denorma = all(
                c in testata_cols
                for c in ("menu_subtotale", "menu_sconto", "menu_prezzo_persona")
            )

            backfilled = 0
            for row in preventivi_con_righe:
                pid = row["preventivo_id"]

                if has_denorma:
                    testata = cconn.execute(
                        "SELECT menu_subtotale, menu_sconto, menu_prezzo_persona FROM clienti_preventivi WHERE id = ?",
                        (pid,),
                    ).fetchone()
                    sub = float(testata["menu_subtotale"] or 0) if testata else 0.0
                    sco = float(testata["menu_sconto"] or 0) if testata else 0.0
                    ppp = float(testata["menu_prezzo_persona"] or 0) if testata else 0.0
                else:
                    sub = sco = ppp = 0.0

                cur = cconn.execute(
                    """INSERT INTO clienti_preventivi_menu
                       (preventivo_id, nome, sort_order, sconto, subtotale, prezzo_persona)
                       VALUES (?, 'Menu', 0, ?, ?, ?)""",
                    (pid, sco, sub, ppp),
                )
                menu_id = cur.lastrowid

                # Associa TUTTE le righe del preventivo a questo menu
                cconn.execute(
                    "UPDATE clienti_preventivi_menu_righe SET menu_id = ? WHERE preventivo_id = ? AND menu_id IS NULL",
                    (menu_id, pid),
                )
                backfilled += 1

            print(f"  + backfill: creato record menu 'Menu' per {backfilled} preventivi esistenti")

        cconn.commit()
    finally:
        cconn.close()
