# Modulo: cassa
"""
Migrazione 170 — Omaggi / non riscosso (2026-09-03).

Problema (caso 28/08/2026, Marco): sulla Chiusura Giornaliera RT convivono due
numeri diversi che finora il gestionale confondeva in uno solo.

    TOTALE GIORNO VENDITE      2.478,00   <- incassato davvero
    TOTALE GIORNO OMAGGI           8,00   <- battuto, mai incassato
    CORRISPETTIVO (10%)        2.486,00   <- vendite + omaggi
    AMMONTARE (imponibile)     2.260,00
    IMPOSTA                      226,00
    NON RISCOSSO OMAGGIO           7,27   <- imponibile dell'omaggio

Il campo `shift_closures.preconto` contiene storicamente il TOTALE GIORNO
VENDITE (2.478). Il PDF corrispettivi lo trattava come corrispettivo lordo e ci
faceva lo scorporo /1,10 → imponibile 2.252,73 invece di 2.260,00: ogni giorno
con omaggi il prospetto interno risultava sotto di quanto già trasmesso all'AdE
dal registratore.

Riferimento normativo: nel tracciato dei corrispettivi telematici il campo
<NonRiscossoOmaggio> è da INCLUDERE nell'ammontare imponibile da assoggettare a
IVA. La cessione gratuita resta operazione imponibile: l'IVA c'è, semplicemente
non la paga il cliente ma l'esercente. Quindi iPratico e AdE sono corretti, era
il gestionale a sbagliare.

Soluzione scelta da Marco (2026-09-03): campo dedicato `omaggi` sulla chiusura.
  - `preconto` NON cambia semantica (6 anni di dati dentro) → resta l'incassato.
  - Il corrispettivo fiscale diventa una derivata: preconto + omaggi.
  - Con omaggi = 0 (tutto lo storico) il calcolo è identico a prima: nessuna
    regressione sui giorni già chiusi.
  - Gli omaggi NON entrano negli incassi attesi: la quadratura di cassa resta
    invariata (i soldi non sono entrati).

Questa migrazione aggiunge la colonna `omaggi REAL DEFAULT 0` a:
  - shift_closures  (fine turno)
  - daily_closures  (import Excel corrispettivi)
entrambe in admin_finance.sqlite3.

Idempotente: PRAGMA table_info check prima di ALTER (stile 146).
Colonna nullable con DEFAULT 0 → niente violazioni integrity_check su righe
esistenti (vedi feedback_sqlite_alter_add_column_not_null).

DB: locali/<locale>/data/admin_finance.sqlite3
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
ADMIN_FINANCE_DB = locale_data_path("admin_finance.sqlite3")

TABLES = ["shift_closures", "daily_closures"]


def _has_column(cur: sqlite3.Cursor, table: str, col: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cur.fetchall())


def _table_exists(cur: sqlite3.Cursor, table: str) -> bool:
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    """Aggiunge omaggi su shift_closures e daily_closures."""
    if not ADMIN_FINANCE_DB.exists():
        print("  [170] admin_finance.sqlite3 non esiste, skip")
        return

    cu = sqlite3.connect(ADMIN_FINANCE_DB)
    try:
        cur = cu.cursor()
        toccate = 0

        for table in TABLES:
            if not _table_exists(cur, table):
                continue
            if _has_column(cur, table, "omaggi"):
                continue
            cur.execute(f"ALTER TABLE {table} ADD COLUMN omaggi REAL DEFAULT 0")
            toccate += 1

        cu.commit()
        print(f"  [170] omaggi: {toccate} tabelle toccate su admin_finance.sqlite3")
    finally:
        cu.close()
