"""
Migrazione 070: Preventivi — menu proposto strutturato + luoghi configurabili.

Contesto (sessione 32, feedback Marco):
- Le "voci preventivo" attuali sono adatte solo a elementi extra liberi
  (noleggio attrezzatura, tovagliato, suppl.). NON servono per comporre
  il menu del ristorante da proporre al cliente (piatti per portata).
- I luoghi erano hardcoded (sala/terrazza/esterno/altro); Marco vuole i
  valori reali dell'Osteria (Sala, Giardino, Dehor) configurabili in
  Impostazioni.

Passi:
  1. Aggiunge 3 colonne a clienti_preventivi:
     - menu_nome          TEXT   (es. "Menu Degustazione 5 portate")
     - menu_prezzo_persona REAL  (prezzo a testa)
     - menu_descrizione   TEXT   (testo libero strutturato per portata)
  2. Inserisce in clienti_impostazioni la chiave preventivi_luoghi con
     valore JSON ["Sala","Giardino","Dehor"] come default.

NOTA: clienti_preventivi vive in clienti.sqlite3, non in foodcost.db.
"""

import sqlite3
import json
from pathlib import Path

CLIENTI_DB = Path(__file__).resolve().parent.parent / "data" / "clienti.sqlite3"


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        return  # DB non ancora creato, init_clienti_db lo fara'

    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        # ── 1. Aggiunta colonne menu a clienti_preventivi ──
        check = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_preventivi'"
        ).fetchone()
        if check:
            existing_cols = {
                row[1] for row in cconn.execute("PRAGMA table_info(clienti_preventivi)").fetchall()
            }
            nuove = [
                ("menu_nome",           "TEXT"),
                ("menu_prezzo_persona", "REAL DEFAULT 0"),
                ("menu_descrizione",    "TEXT"),
            ]
            for col_name, col_type in nuove:
                if col_name not in existing_cols:
                    try:
                        cconn.execute(f"ALTER TABLE clienti_preventivi ADD COLUMN {col_name} {col_type}")
                        print(f"  + clienti_preventivi.{col_name} aggiunta")
                    except sqlite3.OperationalError as e:
                        print(f"  ⚠ {col_name}: {e}")
        else:
            print("  · clienti_preventivi non esiste ancora (verra' creata da init_clienti_db)")

        # ── 2. Seed luoghi default in clienti_impostazioni ──
        check_imp = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_impostazioni'"
        ).fetchone()
        if check_imp:
            luoghi_default = json.dumps(["Sala", "Giardino", "Dehor"], ensure_ascii=False)
            cconn.execute(
                """INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione)
                   VALUES ('preventivi_luoghi', ?, 'Luoghi disponibili per preventivi eventi (JSON array)')""",
                (luoghi_default,),
            )
            print("  + preventivi_luoghi seedato (Sala, Giardino, Dehor)")

        cconn.commit()
    finally:
        cconn.close()
