"""
Migrazione 078: Backfill menu_prezzo_persona per preventivi esistenti.

Contesto (sessione 38, bugfix):
- _ricalcola_menu calcolava erroneamente menu_prezzo_persona = (subtotale - sconto) / n_persone.
  Questo e' SBAGLIATO: ogni riga del menu e' gia' il prezzo PER 1 PERSONA (Marco
  inserisce il prezzo di 1 menu, es. Brasato 20 EUR e' il prezzo per 1 coperto).
  Il prezzo/persona e' quindi semplicemente (subtotale - sconto); va MOLTIPLICATO
  per n_persone quando si calcola il totale complessivo.
- Fix applicato in preventivi_service._ricalcola_menu + frontend composer.
- Questa migrazione sistema i preventivi esistenti:
    UPDATE clienti_preventivi
    SET menu_prezzo_persona = MAX(0, menu_subtotale - menu_sconto)
  e ricalcola totale_calcolato = menu_prezzo_persona * n_persone + somma righe (voci - sconti).

Idempotente: il fix e' un semplice re-compute, rilanciarla e' safe.

NOTA: clienti_preventivi vive in clienti.sqlite3, non in foodcost.db.
"""

import sqlite3
from pathlib import Path

CLIENTI_DB = Path(__file__).resolve().parent.parent / "data" / "clienti.sqlite3"


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return

    cconn = sqlite3.connect(str(CLIENTI_DB))
    cconn.row_factory = sqlite3.Row
    try:
        check = cconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_preventivi'"
        ).fetchone()
        if not check:
            print("  · clienti_preventivi non esiste ancora, skip")
            return

        # Controlla che le colonne menu_* esistano (mig 070 + 075)
        cols = {row[1] for row in cconn.execute("PRAGMA table_info(clienti_preventivi)").fetchall()}
        required = {"menu_subtotale", "menu_sconto", "menu_prezzo_persona", "n_persone", "totale_calcolato"}
        if not required.issubset(cols):
            missing = required - cols
            print(f"  · colonne mancanti {missing}, skip (serve mig 070+075)")
            return

        # 1. Ricalcola menu_prezzo_persona come (menu_subtotale - menu_sconto), con floor a 0
        cconn.execute("""
            UPDATE clienti_preventivi
            SET menu_prezzo_persona = MAX(0, COALESCE(menu_subtotale, 0) - COALESCE(menu_sconto, 0))
        """)
        n_prev = cconn.execute("SELECT COUNT(*) FROM clienti_preventivi").fetchone()[0]
        print(f"  + aggiornato menu_prezzo_persona su {n_prev} preventivi (= menu_subtotale - menu_sconto)")

        # 2. Ricalcola totale_calcolato per ogni preventivo = menu_prezzo_persona * n_persone + somma righe
        rows = cconn.execute(
            "SELECT id, menu_prezzo_persona, n_persone FROM clienti_preventivi"
        ).fetchall()
        updated = 0
        for prev in rows:
            pid = prev["id"]
            prezzo_p = float(prev["menu_prezzo_persona"] or 0)
            n_pers = int(prev["n_persone"] or 0)
            tot_menu = prezzo_p * n_pers

            # somma righe extra (voci +, sconti -)
            tot_righe = 0.0
            for r in cconn.execute(
                "SELECT qta, prezzo_unitario, tipo_riga FROM clienti_preventivi_righe WHERE preventivo_id = ?",
                (pid,),
            ).fetchall():
                sub = float(r["qta"] or 0) * float(r["prezzo_unitario"] or 0)
                if r["tipo_riga"] == "sconto":
                    tot_righe -= abs(sub)
                else:
                    tot_righe += sub

            tot = round(tot_menu + tot_righe, 2)
            cconn.execute(
                "UPDATE clienti_preventivi SET totale_calcolato = ? WHERE id = ?",
                (tot, pid),
            )
            updated += 1

        print(f"  + ricalcolato totale_calcolato su {updated} preventivi")
        cconn.commit()
    finally:
        cconn.close()
