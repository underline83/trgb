"""
Migrazione 117 — Rinomina residui + TRIGGER di validazione stato (2026-05-11)

BUG SCOPERTO OGGI:
  `app/routers/dipendenti.py` riga 1415 e 1425 scriveva INSERT/UPDATE in cg_uscite
  con `stato='DA_PAGARE'` (vecchio nome pre-G.6). Non era stato aggiornato durante
  G.6 rename. Le buste paga caricate post-G.6 finivano in DB con uno stato non più
  riconosciuto → invisibili allo Scadenzario. 9 righe contaminate trovate (caricate
  oggi 19:32 da Marco).

DIAGNOSI ALLARGATA:
  Il grep su codice runtime backend ha trovato SOLO dipendenti.py come colpevole
  (gli altri match sono migrazioni storiche o domini diversi tipo HACCP/Tasks).
  Ma il problema architetturale resta: nessuno impedisce a un futuro endpoint di
  scrivere ancora con vecchi nomi. Censimento testuale è fragile.

DIFESA STRUTTURALE (questa mig):
  1. UPDATE cg_uscite per rimappare residui dei 6 vecchi nomi → nuovi nomi
     (idempotente: se il DB è già pulito, 0 update).
  2. Crea TRIGGER `trg_cg_uscite_stato_valido_*` BEFORE INSERT/UPDATE che ABORT
     se viene scritto uno stato non in STATI_VALIDI.
  3. Da ora qualunque codice (presente o futuro) che provi a inserire un valore
     non valido fallisce con eccezione SQLite ESPLICITA: niente più silent
     corruption.

STATI VALIDI (post-G.6/G.8):
  PROGRAMMATO, SCADUTO, VERIFICARE, SPOSTATO, RATEIZZATO, PARZIALE,
  PAGATO_MANUALE, PAGATO
  (+ NULL ammesso per stub temporanei)

Idempotente. Re-run no-op.
"""
import sqlite3


# Mappa rinomina (vecchio → nuovo). Stessa di mig 114 ma applicata di nuovo
# per intercettare eventuali scritture dopo mig 114 con vecchi nomi.
RENAME_MAP = [
    ("DA_PAGARE",      "PROGRAMMATO"),
    ("SCADUTA",        "SCADUTO"),
    ("DA_VERIFICARE",  "VERIFICARE"),
    ("RATEIZZATA",     "RATEIZZATO"),
    ("PAGATA",         "PAGATO"),
    ("PAGATA_MANUALE", "PAGATO_MANUALE"),
]


TRIGGER_INSERT_SQL = """
CREATE TRIGGER IF NOT EXISTS trg_cg_uscite_stato_valido_insert
BEFORE INSERT ON cg_uscite
FOR EACH ROW
WHEN NEW.stato IS NOT NULL
 AND NEW.stato NOT IN (
    'PROGRAMMATO','SCADUTO','VERIFICARE','SPOSTATO','RATEIZZATO','PARZIALE',
    'PAGATO_MANUALE','PAGATO'
 )
BEGIN
    SELECT RAISE(ABORT,
        'cg_uscite.stato non valido: usare STATI_VALIDI in app/services/stati_pagamento.py');
END
"""

TRIGGER_UPDATE_SQL = """
CREATE TRIGGER IF NOT EXISTS trg_cg_uscite_stato_valido_update
BEFORE UPDATE OF stato ON cg_uscite
FOR EACH ROW
WHEN NEW.stato IS NOT NULL
 AND NEW.stato NOT IN (
    'PROGRAMMATO','SCADUTO','VERIFICARE','SPOSTATO','RATEIZZATO','PARZIALE',
    'PAGATO_MANUALE','PAGATO'
 )
BEGIN
    SELECT RAISE(ABORT,
        'cg_uscite.stato non valido: usare STATI_VALIDI in app/services/stati_pagamento.py');
END
"""


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. Rinomina residui (idempotente) ──
    n_tot = 0
    for old, new in RENAME_MAP:
        cur.execute(
            "UPDATE cg_uscite SET stato = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE stato = ?",
            (new, old),
        )
        n = cur.rowcount
        if n:
            print(f"  [117] residui {old} → {new}: {n} righe")
            n_tot += n
    if n_tot == 0:
        print("  [117] nessun residuo da rinominare (DB già pulito)")
    else:
        print(f"  [117] totale residui rinominati: {n_tot}")

    # ── 2. Crea trigger di validazione ──
    cur.execute(TRIGGER_INSERT_SQL)
    cur.execute(TRIGGER_UPDATE_SQL)
    print("  [117] TRIGGER trg_cg_uscite_stato_valido_insert/_update creati")

    # ── 3. Stats finali ──
    rows = cur.execute("""
        SELECT stato, COUNT(*) AS n
        FROM cg_uscite WHERE stato IS NOT NULL
        GROUP BY stato ORDER BY n DESC
    """).fetchall()
    print(f"  [117] distribuzione cg_uscite.stato post-mig:")
    for r in rows:
        print(f"       {r[0]:20s} {r[1]}")

    conn.commit()
    print("  [117] DONE — vecchi nomi puliti + trigger di validazione attivo")
