"""
Migrazione 130 — Normalizza periodo_riferimento STIPENDI a YYYY-MM (2026-05-16)

CONTESTO:
  Bug scoperto durante verifica Fase D di G.3 (Conto Economico). Le righe
  `cg_uscite tipo='STIPENDIO'` hanno `periodo_riferimento` salvato come stringa
  italiana ("Aprile 2026", "marzo 2026", "Gennaio 2026", ecc.) invece del
  formato YYYY-MM atteso dal service Conto Economico.

  Effetto: il service `compute_pl` filtra `WHERE periodo_riferimento = '2026-05'`
  e non matcha mai gli stipendi → "Utile Netto" è gonfiato perché manca il
  costo del personale.

  Bug nel codice di `app/routers/dipendenti.py:1478` (sessione 2026-05-16):
    periodo_rif = f"{MESI_IT[mese]} {anno}"   # produce "Aprile 2026"

  Fix applicato nello stesso push:
    periodo_rif = f"{anno}-{int(mese):02d}"   # produce "2026-04"

OBIETTIVO MIGRAZIONE:
  Normalizzare le righe ESISTENTI in cg_uscite (35 righe, dati da gennaio
  ad aprile 2026) da formato italiano testuale a YYYY-MM.

  Casi reali osservati nel DB:
    - "Gennaio 2026"   → 2026-01
    - "Febbraio 2026"  → 2026-02
    - "Marzo 2026" / "marzo 2026" (case mista) → 2026-03
    - "Aprile 2026"    → 2026-04
    - (e in futuro: maggio/giugno/.../dicembre)

LOGICA:
  - Match case-insensitive (LOWER) sul nome del mese italiano.
  - Filtro PROTEZIONE: NOT GLOB 'YYYY-MM' → non tocca righe già normalizzate.
  - Solo `cg_uscite` (tipo_uscita='STIPENDIO'): per le spese fisse il formato
    è già corretto via codice (controllo_gestione_router scrive YYYY-MM).
  - Backfill anche `note` se contiene "Cedolino <mese italiano>" → standardizza
    a "Cedolino YYYY-MM" per consistenza? NO: le note sono display, lasciamo
    il testo italiano. Solo periodo_riferimento normalizzato.

DB: foodcost.db. Idempotente. Re-run = no-op (filtri NOT GLOB).
"""
import sqlite3

# Mapping italiano → numero mese (case-insensitive, lookup su LOWER)
MESI_IT_TO_NUM = {
    "gennaio": "01",
    "febbraio": "02",
    "marzo": "03",
    "aprile": "04",
    "maggio": "05",
    "giugno": "06",
    "luglio": "07",
    "agosto": "08",
    "settembre": "09",
    "ottobre": "10",
    "novembre": "11",
    "dicembre": "12",
}


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner)."""
    cur = conn.cursor()

    # ── 1. Diagnostica pre-normalizzazione ──
    pre = cur.execute("""
        SELECT periodo_riferimento, COUNT(*) AS n
        FROM cg_uscite
        WHERE tipo_uscita = 'STIPENDIO'
          AND periodo_riferimento IS NOT NULL
          AND periodo_riferimento NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        GROUP BY periodo_riferimento
        ORDER BY periodo_riferimento
    """).fetchall()

    if not pre:
        print("  [130] nessuna riga STIPENDIO con periodo non-normalizzato — no-op")
        return

    print(f"  [130] trovate {len(pre)} stringhe periodo non-normalizzate da convertire:")
    for row in pre:
        print(f"        '{row[0]}' ({row[1]} righe)")

    # ── 2. Normalizzazione: per ogni mese italiano, UPDATE su match ──
    total_updated = 0
    for mese_it, mese_num in MESI_IT_TO_NUM.items():
        # Match case-insensitive: "Aprile 2026" / "aprile 2026" / "APRILE 2026"
        # → estrae l'anno dagli ultimi 4 caratteri (SUBSTR -4)
        # Filtro NOT GLOB protegge contro re-run (idempotenza).
        cur.execute(f"""
            UPDATE cg_uscite
               SET periodo_riferimento = SUBSTR(periodo_riferimento, -4) || '-{mese_num}'
             WHERE tipo_uscita = 'STIPENDIO'
               AND LOWER(periodo_riferimento) LIKE ?
               AND periodo_riferimento NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        """, [f"{mese_it} %"])
        if cur.rowcount > 0:
            print(f"  [130]   {mese_it}: {cur.rowcount} righe → 2026-{mese_num}")
            total_updated += cur.rowcount

    # ── 3. Diagnostica post-normalizzazione ──
    residui = cur.execute("""
        SELECT COUNT(*) AS n,
               GROUP_CONCAT(DISTINCT periodo_riferimento) AS valori
        FROM cg_uscite
        WHERE tipo_uscita = 'STIPENDIO'
          AND periodo_riferimento IS NOT NULL
          AND periodo_riferimento NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
    """).fetchone()

    print(f"  [130] totale aggiornate: {total_updated}")

    if residui and residui[0] > 0:
        print(f"  [130] ⚠ ATTENZIONE: {residui[0]} righe ancora non-normalizzate")
        print(f"  [130]   valori residui: {residui[1]}")
        print(f"  [130]   (probabile formato sconosciuto — verifica manuale)")
    else:
        print(f"  [130] ✓ tutte le righe STIPENDIO ora in formato YYYY-MM")

    print("  [130] DONE")
