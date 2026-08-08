# Modulo: clienti
"""
Migrazione 168 — allinea la lettera di serie delle gift card (2026-08-08)

CONTESTO:
  La prima versione del modulo generava codici casuali (`TG-4KMP-9XQD`) e
  seminava `giftcard_prefisso = 'TG'`. Marco ha chiarito che i codici Tre
  Gobbi seguono uno schema preciso: <lettera>1<AA>-<progressivo>, dove la
  lettera identifica il bollettario (A fino al 2025, B dal 2026), l'anno
  sta nel codice e il progressivo prosegue senza azzerarsi a Capodanno.

  Il generatore ora segue quello schema. Questa migrazione porta il valore
  gia' seminato da 'TG' a 'B', altrimenti il primo codice nuovo uscirebbe
  `TG126-354` invece di `B126-354`.

PRUDENZA:
  aggiorna SOLO se il valore e' ancora 'TG' (cioe' mai toccato da Marco).
  Se lui l'ha gia' cambiato da Impostazioni, la sua scelta resta.

DB COLPITO: clienti.sqlite3 (locale-aware). Solo UPDATE di una riga di
configurazione, nessuna modifica di schema o di dati operativi.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    """conn = foodcost.db (passato dal runner, non usato). Apre clienti.sqlite3."""
    path = locale_data_path("clienti.sqlite3")
    if not path.exists():
        print("  [168] clienti.sqlite3 non esiste, skip")
        return

    cconn = sqlite3.connect(str(path), timeout=30)
    try:
        cconn.execute("PRAGMA busy_timeout=30000")
        tabella = cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_impostazioni'"
        ).fetchone()
        if not tabella:
            print("  [168] clienti_impostazioni non presente, skip")
            return

        cur = cconn.execute(
            """
            UPDATE clienti_impostazioni
            SET valore = 'B',
                descrizione = 'Lettera di serie dei codici gift card (schema <lettera>1<anno>-<progressivo>, es. B126-354). Cambiare quando cambia bollettario'
            WHERE chiave = 'giftcard_prefisso' AND valore = 'TG'
            """
        )
        cconn.commit()
        if cur.rowcount:
            print("  ✔ [168] lettera di serie gift card: TG → B")
        else:
            attuale = cconn.execute(
                "SELECT valore FROM clienti_impostazioni WHERE chiave = 'giftcard_prefisso'"
            ).fetchone()
            print(f"  [168] nessun aggiornamento (valore attuale: {attuale[0] if attuale else 'assente'})")
    finally:
        cconn.close()
