"""
Migrazione 050: Aggiunge durata_pranzo e durata_cena alla config prenotazioni

Splitta la durata media in due valori separati per turno.
Il vecchio durata_media_tavolo_min rimane per retrocompatibilita'.

NOTA: prenotazioni_config vive in clienti.sqlite3, non in foodcost.db,
quindi usiamo una connessione dedicata.
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
        # Verifica che la tabella esista (potrebbe non essere stata creata ancora)
        check = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='prenotazioni_config'"
        ).fetchone()
        if not check:
            return  # tabella non esiste ancora, init_clienti_db la creera'

        nuove_chiavi = [
            ("durata_pranzo", "90", "Durata media pranzo in minuti"),
            ("durata_cena", "120", "Durata media cena in minuti"),
        ]

        for chiave, valore, desc in nuove_chiavi:
            cconn.execute(
                "INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES (?, ?, ?)",
                (chiave, valore, desc),
            )

        cconn.commit()
    finally:
        cconn.close()
