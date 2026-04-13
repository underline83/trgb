"""
Migrazione 068: Aggiunge nome_ospite / cognome_ospite a clienti_prenotazioni

Contesto:
- L'export TheFork (tfm-search-results XLSX) contiene colonne
  "Customer first name" / "Customer last name" anche per prenotazioni senza
  Customer ID (walk-in registrati in TFM, prenotazioni anonimizzate GDPR,
  clienti rimossi). Prima di questa migrazione tali colonne venivano scartate
  e la prenotazione risultava senza nome nel planning (~22% delle righe).

- Aggiungiamo due campi snapshot sulla prenotazione stessa, cosi' il nome
  sopravvive anche quando cliente_id e' NULL e il JOIN con clienti non
  restituisce nulla.

- Il planning usera' COALESCE(c.nome, p.nome_ospite) per mostrare il nome
  preferendo il dato CRM (aggiornabile) ma con fallback al dato TheFork.

NOTA: clienti_prenotazioni vive in clienti.sqlite3, non in foodcost.db.
"""

import sqlite3
from pathlib import Path

CLIENTI_DB = Path(__file__).resolve().parent.parent / "data" / "clienti.sqlite3"


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        return  # DB non ancora creato, init_clienti_db lo fara'

    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        # Verifica che la tabella esista
        check = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_prenotazioni'"
        ).fetchone()
        if not check:
            return  # tabella non esiste ancora, init_clienti_db la creera'

        existing_cols = {
            row[1] for row in cconn.execute("PRAGMA table_info(clienti_prenotazioni)").fetchall()
        }

        if "nome_ospite" not in existing_cols:
            cconn.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN nome_ospite TEXT")
        if "cognome_ospite" not in existing_cols:
            cconn.execute("ALTER TABLE clienti_prenotazioni ADD COLUMN cognome_ospite TEXT")

        cconn.commit()
    finally:
        cconn.close()
