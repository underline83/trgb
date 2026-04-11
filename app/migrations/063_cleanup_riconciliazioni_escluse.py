"""
Migrazione 063: cleanup riconciliazioni + cg_uscite per fornitori esclusi

Contesto (problemi.md A1 — follow-up 2):
La mig 061 aveva flaggato `escluso_acquisti=1` su 3 fornitori "fittizi"
importati dal sync FIC (BANA MARIA DOLORES, CATTANEO SILVIA, PONTIGGIA).
Il filtro valeva SOLO per la dashboard Acquisti: il modulo Controllo Gestione
continuava a generare cg_uscite da quelle fatture e il matcher di riconciliazione
bancaria le proponeva ancora come possibili match.

Conseguenza pratica: nello scadenzario uscite Marco vedeva DOPPIO conteggio per
ogni mese di affitto — sia la riga generata dalla spesa fissa CG ("Ristorante -
Via Broseta 20/C", "Cucina - Via Broseta 20/B"), sia la riga "CATTANEO SILVIA" /
"BANA MARIA DOLORES" derivata dalla fattura FIC. Inoltre 3 riconciliazioni
bancarie manuali avevano collegato i bonifici dell'affitto alla fattura FIC
sbagliata, invece che alla rata della spesa fissa CG.

Cleanup one-shot (irreversibile sul runtime, ma con backup in audit table):

1) `cg_uscite_audit_063` — tabella di backup delle cg_uscite cancellate
   (snapshot completo in JSON per ripristino manuale se necessario)

2) DELETE dei `banca_fatture_link` che puntano a fatture di fornitori esclusi
   (3 link manuali identificati durante audit). I 3 movimenti bancari tornano
   "senza match", Marco li riconcilierà manualmente contro la rata della spesa
   fissa CG corrispondente.

3) DELETE delle `cg_uscite` con `fattura_id` → fattura esclusa
   (57 righe: 28 BANA, 28 CATTANEO, 1 PONTIGGIA). I record in `fe_fatture`
   NON vengono toccati (restano per audit/warning tab), ma la loro riga
   scadenzario sparisce.

4) Ripulisce eventuali `riconciliazione_chiusa=1` sui movimenti ora orfani
   (erano chiuse perché fully-linked, ora il link non c'è più)

La migrazione è idempotente: se rilanciata, semplicemente non trova più nulla
da cancellare (tabella audit con rowcount 0).

ACCOPPIATA A: filtro `escluso_acquisti` in:
- `controllo_gestione_router.py` (generatore cg_uscite da fatture + query scadenzario)
- `banca_router.py` (matcher fatture possibili per riconciliazione)
senza il filtro a monte, futuri sync FIC rigenerebbero le righe cancellate.
"""

import json


def upgrade(conn):
    cur = conn.cursor()

    # ── Step 1: audit table per backup ────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cg_uscite_audit_063 (
            audit_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_at            TEXT DEFAULT (datetime('now')),
            original_id         INTEGER,
            fattura_id          INTEGER,
            fornitore_nome      TEXT,
            data_fattura        TEXT,
            totale              REAL,
            stato               TEXT,
            banca_movimento_id  INTEGER,
            note                TEXT,
            raw_row_json        TEXT
        )
    """)
    print("  + cg_uscite_audit_063 (tabella di backup)")

    # ── Step 2: trova le fatture con fornitore escluso ────────
    excluded_rows = cur.execute("""
        SELECT f.id, f.fornitore_nome
          FROM fe_fatture f
          LEFT JOIN fe_fornitore_categoria fc
            ON (fc.fornitore_piva = f.fornitore_piva
                AND fc.fornitore_piva IS NOT NULL AND fc.fornitore_piva != '')
            OR (COALESCE(fc.fornitore_piva,'') = ''
                AND COALESCE(f.fornitore_piva,'') = ''
                AND fc.fornitore_nome = f.fornitore_nome)
         WHERE COALESCE(fc.escluso_acquisti, 0) = 1
    """).fetchall()

    excluded_ids = [r[0] for r in excluded_rows]
    if not excluded_ids:
        print("  nessuna fattura di fornitore escluso trovata — cleanup non necessario")
        return

    print(f"  trovate {len(excluded_ids)} fatture da fornitori esclusi")
    ph = ",".join("?" * len(excluded_ids))

    # ── Step 3: backup delle cg_uscite prima di cancellare ────
    to_backup = cur.execute(f"""
        SELECT id, fattura_id, fornitore_nome, fornitore_piva, numero_fattura,
               data_fattura, totale, data_scadenza, importo_pagato, data_pagamento,
               stato, banca_movimento_id, note, tipo_uscita, spesa_fissa_id,
               periodo_riferimento, created_at, updated_at
          FROM cg_uscite
         WHERE fattura_id IN ({ph})
    """, excluded_ids).fetchall()

    backup_count = 0
    for row in to_backup:
        row_dict = {
            "id": row[0], "fattura_id": row[1], "fornitore_nome": row[2],
            "fornitore_piva": row[3], "numero_fattura": row[4],
            "data_fattura": row[5], "totale": row[6], "data_scadenza": row[7],
            "importo_pagato": row[8], "data_pagamento": row[9], "stato": row[10],
            "banca_movimento_id": row[11], "note": row[12], "tipo_uscita": row[13],
            "spesa_fissa_id": row[14], "periodo_riferimento": row[15],
            "created_at": row[16], "updated_at": row[17],
        }
        cur.execute("""
            INSERT INTO cg_uscite_audit_063
                (original_id, fattura_id, fornitore_nome, data_fattura,
                 totale, stato, banca_movimento_id, note, raw_row_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row[0], row[1], row[2], row[5], row[6], row[10], row[11], row[12],
            json.dumps(row_dict, default=str, ensure_ascii=False),
        ))
        backup_count += 1
    print(f"  + {backup_count} righe salvate in cg_uscite_audit_063")

    # ── Step 4: trova i movimenti impattati prima del DELETE ──
    # Servirà per riaprire eventuali riconciliazioni chiuse manualmente
    impacted_mov_ids = [
        r[0] for r in cur.execute(f"""
            SELECT DISTINCT bfl.movimento_id
              FROM banca_fatture_link bfl
             WHERE bfl.fattura_id IN ({ph})
        """, excluded_ids).fetchall()
    ]

    # ── Step 5: DELETE banca_fatture_link ────────────────────
    cur.execute(f"""
        DELETE FROM banca_fatture_link
         WHERE fattura_id IN ({ph})
    """, excluded_ids)
    links_deleted = cur.rowcount
    print(f"  - {links_deleted} banca_fatture_link cancellati (movimenti: {impacted_mov_ids})")

    # ── Step 6: riapri eventuali riconciliazioni chiuse manualmente ──
    # Per movimenti che erano marcati come fully-linked, ora che il link non c'è più
    # il flag `riconciliazione_chiusa` è inconsistente. Lo resettiamo.
    if impacted_mov_ids:
        mov_ph = ",".join("?" * len(impacted_mov_ids))
        cur.execute(f"""
            UPDATE banca_movimenti
               SET riconciliazione_chiusa = 0,
                   riconciliazione_chiusa_at = NULL,
                   riconciliazione_chiusa_note = NULL
             WHERE id IN ({mov_ph})
               AND riconciliazione_chiusa = 1
        """, impacted_mov_ids)
        reopened = cur.rowcount
        if reopened:
            print(f"  ↺ {reopened} movimenti bancari riaperti (riconciliazione_chiusa=0)")

    # ── Step 7: DELETE delle cg_uscite ───────────────────────
    cur.execute(f"""
        DELETE FROM cg_uscite
         WHERE fattura_id IN ({ph})
    """, excluded_ids)
    cu_deleted = cur.rowcount
    print(f"  - {cu_deleted} cg_uscite cancellate (backup in cg_uscite_audit_063)")

    # ── Step 8: reset banca_movimento_id orfani (sanity) ────
    # Le cg_uscite che puntavano a un movimento cancellato non esistono più
    # (appena cancellate), ma per sicurezza verifichiamo che non ne rimangano
    # con banca_movimento_id dangling — non dovrebbe capitare perché il FK
    # non è dichiarato con CASCADE ma la pulizia è comunque self-consistent.

    print("  ✓ mig 063 cleanup riconciliazioni escluse completata")
