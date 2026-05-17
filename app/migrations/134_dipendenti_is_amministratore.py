"""
Migrazione 134 — dipendenti: flag is_amministratore (G.3 Fase E, 2026-05-16)

CONTESTO:
  Marco 2026-05-16: nel Conto Economico c'è la macro-categoria `STAFF`
  (operai/dipendenti subordinati) e `AMMINISTRATORI` (compensi amministratori
  non soci). Il consulente paghe distingue chiaramente queste due tipologie
  nell'ELAB:
    - Operai: codici 72/05/010 "Salari" e 72/05/015 "Salari t.indeterminato"
    - Amministratori non soci: codice 68/05/152 "Compensi amministratori non soci"

  Sul modulo Dipendenti finora NON c'è distinzione: Marco amministratore
  appare con tipo_rapporto='Indeterminato', ruolo='Cucina - Chef', come tutti
  gli altri. Il CE quindi mette tutti in STAFF, gonfiando STAFF e svuotando
  AMMINISTRATORI.

SOLUZIONE:
  Campo booleano `is_amministratore` su `dipendenti`. Marco lo marca a mano
  dall'anagrafica per chi è effettivamente amministratore (probabilmente solo
  lui). Default 0 = subordinato/operaio.

  Il service Conto Economico legge il flag al join con dipendenti_costo_consuntivo:
    - is_amministratore=1 → categoria CE = 'AMMINISTRATORI'
    - is_amministratore=0 → categoria CE = 'STAFF'

DB: dipendenti.sqlite3. Idempotente (try/except colonna).

PROSSIMO STEP:
  - Endpoint backend già accetta campo extra (verifica)
  - UI anagrafica dipendenti: checkbox "È un amministratore"
  - app/services/conto_economico.py: JOIN dipendenti per leggere flag
"""
import sqlite3
from pathlib import Path


def _resolve_dipendenti_db(conn: sqlite3.Connection) -> Path | None:
    """Ricava il path di dipendenti.sqlite3 dalla connessione foodcost.db
    (pattern già usato dalle mig 060, 132)."""
    db_list = conn.execute("PRAGMA database_list").fetchall()
    for _, name, path in db_list:
        if name == "main":
            main_path = Path(path)
            return main_path.parent / "dipendenti.sqlite3"
    return None


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner). Apre dipendenti.sqlite3 a parte."""
    dip_path = _resolve_dipendenti_db(conn)
    if dip_path is None or not dip_path.exists():
        print("  [134] ⚠ dipendenti.sqlite3 non trovato — skip")
        return

    dip_conn = sqlite3.connect(str(dip_path))
    try:
        cur = dip_conn.cursor()

        # Verifica idempotente
        cols = {r[1] for r in cur.execute("PRAGMA table_info(dipendenti)").fetchall()}
        if "is_amministratore" in cols:
            print("  [134] colonna dipendenti.is_amministratore già presente — no-op")
            return

        cur.execute(
            "ALTER TABLE dipendenti ADD COLUMN is_amministratore INTEGER DEFAULT 0"
        )
        dip_conn.commit()
        print("  [134] aggiunta colonna dipendenti.is_amministratore (INTEGER DEFAULT 0)")
        print("  [134] DONE")
    finally:
        dip_conn.close()
