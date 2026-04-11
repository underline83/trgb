"""
Migrazione 058: Pulizia duplicati banca_movimenti — pattern formato vuoto+pieno

Marco ha segnalato (problemi.md D3) che il 26/01/2026 appare due volte un
versamento contanti da €5000. Analisi DB: 10 casi dove lo stesso movimento
compare due volte perché esportato da due formati CSV diversi della banca:
  - Formato A: ragione_sociale='TRE GOBBI S.R.L.', banca/rapporto pieni,
               descrizione UPPERCASE tipo "VERS. CONTANTI - VVVVV"
  - Formato B: ragione_sociale='', banca='', rapporto parziale ('780'),
               descrizione lowercase tipo "vers. contanti -"

La migrazione 051 usava normalizzazione prefix-based, ma il prefisso comune
tra i due formati è spesso solo 3-4 caratteri (es. "comm" vs "commissioni")
quindi non cattura il pattern. La differenza vera è SEMANTICA:
  un record ha i metadati della banca (ragione_sociale pieno), l'altro no.

Strategia:
1. Raggruppa per (data_contabile, importo) con esattamente 2 righe
2. Se uno ha ragione_sociale vuoto e l'altro pieno → duplicati
3. Keeper = quello con ragione_sociale pieno (più metadati = migliore)
4. Migra banca_fatture_link, cg_uscite.banca_movimento_id,
   cg_entrate.banca_movimento_id dal duplicato al keeper
5. Elimina il duplicato

NON tocca i gruppi con 3+ righe (commissioni bonifici multiple nello stesso
giorno, tutte legittime con RIF diversi).
"""


def upgrade(conn):
    cur = conn.cursor()

    # 1. Trova tutti i gruppi (data_contabile, importo) con esattamente 2 righe
    cur.execute("""
        SELECT data_contabile, importo
        FROM banca_movimenti
        GROUP BY data_contabile, importo
        HAVING COUNT(*) = 2
    """)
    groups = cur.fetchall()

    total_deleted = 0
    total_migrated = 0

    for data_c, importo in groups:
        # Recupera i 2 record del gruppo
        cur.execute("""
            SELECT id, ragione_sociale, banca, descrizione
            FROM banca_movimenti
            WHERE data_contabile = ? AND importo = ?
            ORDER BY id
        """, (data_c, importo))
        rows = cur.fetchall()

        if len(rows) != 2:
            continue

        r1, r2 = rows[0], rows[1]
        rs1 = (r1[1] or "").strip()
        rs2 = (r2[1] or "").strip()

        # Pattern: uno vuoto e l'altro pieno
        if bool(rs1) == bool(rs2):
            continue  # entrambi pieni o entrambi vuoti → non è il pattern

        # Keeper = quello con ragione_sociale pieno
        if rs1:
            keeper_id, dup_id = r1[0], r2[0]
        else:
            keeper_id, dup_id = r2[0], r1[0]

        # 2. Migra banca_fatture_link (evita conflitti su UNIQUE fattura_id)
        cur.execute("""
            UPDATE banca_fatture_link
            SET movimento_id = ?
            WHERE movimento_id = ?
              AND fattura_id NOT IN (
                  SELECT fattura_id FROM banca_fatture_link WHERE movimento_id = ?
              )
        """, (keeper_id, dup_id, keeper_id))
        total_migrated += cur.rowcount

        # Elimina link orfani rimasti (quelli che avrebbero creato conflitto)
        cur.execute("DELETE FROM banca_fatture_link WHERE movimento_id = ?", (dup_id,))

        # 3. Migra cg_uscite.banca_movimento_id
        has_keeper_uscita = cur.execute(
            "SELECT 1 FROM cg_uscite WHERE banca_movimento_id = ?", (keeper_id,)
        ).fetchone()
        if has_keeper_uscita:
            cur.execute(
                "UPDATE cg_uscite SET banca_movimento_id = NULL WHERE banca_movimento_id = ?",
                (dup_id,))
        else:
            cur.execute(
                "UPDATE cg_uscite SET banca_movimento_id = ? WHERE banca_movimento_id = ?",
                (keeper_id, dup_id))
            total_migrated += cur.rowcount

        # 4. Migra cg_entrate.banca_movimento_id
        has_keeper_entrata = cur.execute(
            "SELECT 1 FROM cg_entrate WHERE banca_movimento_id = ?", (keeper_id,)
        ).fetchone()
        if has_keeper_entrata:
            cur.execute(
                "UPDATE cg_entrate SET banca_movimento_id = NULL WHERE banca_movimento_id = ?",
                (dup_id,))
        else:
            cur.execute(
                "UPDATE cg_entrate SET banca_movimento_id = ? WHERE banca_movimento_id = ?",
                (keeper_id, dup_id))
            total_migrated += cur.rowcount

        # 5. Elimina il duplicato
        cur.execute("DELETE FROM banca_movimenti WHERE id = ?", (dup_id,))
        total_deleted += 1

    conn.commit()
    print(f"  Migrazione 058: eliminati {total_deleted} duplicati formato vuoto+pieno, migrati {total_migrated} link")
    return total_deleted
