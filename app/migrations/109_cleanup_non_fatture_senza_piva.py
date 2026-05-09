"""
Migrazione 109 — Cleanup "non-fatture" senza P.IVA importate da FIC (sessione 2026-05-09)

Storia del problema:
  Il client FIC (Fatture in Cloud) durante l'import storico ha generato righe
  in `fe_fatture` per fornitori che NON erano vere fatture, ma bonifici / spese
  cassa registrate nel gestionale FIC (es. affitto pagato in contanti al
  proprietario, spese per pulizie pagate al collaboratore).

  Caratteristiche tipiche:
    - `fornitore_piva` vuoto/NULL (le vere fatture italiane hanno sempre P.IVA)
    - `numero_fattura` vuoto o assente
    - non hanno proiezione in `cg_uscite` (il proiettore le skippa per
      mancanza di scadenza)

  Marco le aveva già marcate `escluso_acquisti=1` su
  `fe_fornitore_categoria` con motivo "Non-fattura importata da FIC", così il
  modulo Acquisti → Fatture le nascondeva. Ma il widget Home Acquisti le
  sommava comunque, gonfiando il totale "fatture in sospeso" di ~€70k
  fantasma. La regola di Marco: "se non c'è P.IVA non è una fattura,
  inutile lasciarle nei dati che creano confusione".

Cosa fa questa migrazione:
  1. Crea tabella di backup `fe_fatture_archive_109` se non esiste, con tutte
     le colonne di `fe_fatture` + timestamp di archiviazione.
  2. Copia le righe candidate in archivio.
  3. Cancella da `cg_uscite_audit_063` (audit log storico) le righe che
     referenziano le fatture candidate (FK lieve, audit non più rilevante).
  4. Cancella da `fe_fatture` le righe candidate.
  5. NON tocca `fe_fornitore_categoria`: lascia le 3 categorie esistenti
     (CATTANEO/BANA/PONTIGGIA) marcate escluso_acquisti=1 come safety net
     contro futuri re-import accidentali da FIC dello stesso tipo.

  Criterio "non-fattura":
    - `COALESCE(fornitore_piva, '') = ''` (no P.IVA)

  Tabelle verificate VUOTE per questi id (controllo del 2026-05-09):
    - fe_righe        (0)
    - ingredient_prices (0)
    - banca_fatture_link (0)
    - finanza_scadenze (0)
    - cg_uscite        (0)
    - fe_proforme      (0)
  Solo `cg_uscite_audit_063` ha 57 righe da pulire (audit storico, non FK).

Idempotente:
  - Tabella archive con `IF NOT EXISTS`
  - INSERT OR IGNORE basato su id (re-run no-op)
  - DELETE su id già archiviati (re-run no-op se già fatto)
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. Crea tabella archive ──
    # Replica schema fe_fatture + colonna archived_at
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_fatture_archive_109 (
            -- Replica fedele di fe_fatture (tutti i campi nullable per resilienza)
            id INTEGER PRIMARY KEY,
            fornitore_nome TEXT,
            fornitore_piva TEXT,
            numero_fattura TEXT,
            data_fattura TEXT,
            data_scadenza TEXT,
            data_pagamento TEXT,
            totale_fattura REAL,
            netto REAL,
            iva REAL,
            pagato INTEGER,
            stato TEXT,
            note TEXT,
            is_autofattura INTEGER,
            xml_path TEXT,
            tipo_documento TEXT,
            fonte TEXT,
            rateizzata_in_spesa_fissa_id INTEGER,
            -- Colonne meta archive
            archived_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            archive_reason TEXT NOT NULL DEFAULT 'mig109: non-fattura senza P.IVA'
        )
    """)
    print("  [109] tabella fe_fatture_archive_109 pronta")

    # ── 2. Conta candidate e archivia ──
    candidate_ids = [r[0] for r in cur.execute(
        "SELECT id FROM fe_fatture WHERE COALESCE(fornitore_piva, '') = ''"
    ).fetchall()]
    n_candidate = len(candidate_ids)
    print(f"  [109] candidate alla cancellazione: {n_candidate} righe (no P.IVA)")

    if n_candidate == 0:
        print("  [109] nessuna candidata, migrazione no-op")
        return

    # Capisci quali colonne replicare (intersezione tra schema corrente e archive)
    fe_cols = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}
    archive_cols = {
        "id", "fornitore_nome", "fornitore_piva", "numero_fattura",
        "data_fattura", "data_scadenza", "data_pagamento",
        "totale_fattura", "netto", "iva", "pagato", "stato", "note",
        "is_autofattura", "xml_path", "tipo_documento", "fonte",
        "rateizzata_in_spesa_fissa_id",
    }
    common_cols = sorted(fe_cols & archive_cols)
    cols_csv = ", ".join(common_cols)

    # INSERT OR IGNORE basato su PK id → re-run sicuro
    cur.execute(f"""
        INSERT OR IGNORE INTO fe_fatture_archive_109 ({cols_csv})
        SELECT {cols_csv}
        FROM fe_fatture
        WHERE COALESCE(fornitore_piva, '') = ''
    """)
    n_archived = cur.rowcount if cur.rowcount >= 0 else n_candidate
    print(f"  [109] archiviate {n_archived} righe in fe_fatture_archive_109")

    # ── 3. Cancella riferimenti audit log ──
    placeholders = ",".join("?" * len(candidate_ids))
    cur.execute(
        f"DELETE FROM cg_uscite_audit_063 WHERE fattura_id IN ({placeholders})",
        candidate_ids,
    )
    n_audit = cur.rowcount
    print(f"  [109] rimosse {n_audit} righe da cg_uscite_audit_063 (audit log)")

    # ── 4. Cancella le fatture ──
    cur.execute(
        f"DELETE FROM fe_fatture WHERE id IN ({placeholders})",
        candidate_ids,
    )
    n_deleted = cur.rowcount
    print(f"  [109] cancellate {n_deleted} righe da fe_fatture")

    # ── 5. fe_fornitore_categoria: NON tocco. Lascio le 3 categorie come ──
    # safety net contro futuri re-import dello stesso fornitore da FIC.
    # Se in futuro FIC ricrea una "non-fattura" CATTANEO, il flag
    # escluso_acquisti=1 la nasconderà comunque dal modulo Acquisti.

    conn.commit()
    print(
        f"  [109] DONE: archiviate {n_archived}, "
        f"cancellate {n_deleted} fatture + {n_audit} righe audit. "
        f"Backup in fe_fatture_archive_109."
    )
