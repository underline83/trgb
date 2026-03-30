"""
Migrazione 043: pulizia link orfani in banca_fatture_link.

Alcuni link puntano a fatture che non esistono più (cancellate).
Questo causa discrepanza tra il conteggio "collegati" nel cross-ref
e le riconciliazioni nello scadenzario.

Rimuove i link dove:
  - fattura_id non esiste in fe_fatture
  - movimento_id non esiste in banca_movimenti
"""


def upgrade(conn):
    cur = conn.cursor()

    # 1. Link a fatture inesistenti
    orphan_fat = cur.execute("""
        DELETE FROM banca_fatture_link
        WHERE fattura_id NOT IN (SELECT id FROM fe_fatture)
    """).rowcount

    # 2. Link a movimenti inesistenti
    orphan_mov = cur.execute("""
        DELETE FROM banca_fatture_link
        WHERE movimento_id NOT IN (SELECT id FROM banca_movimenti)
    """).rowcount

    # 3. Link duplicati: stessa fattura collegata a più movimenti → tieni solo il primo
    dups = cur.execute("""
        SELECT fattura_id, MIN(id) AS keep_id
        FROM banca_fatture_link
        GROUP BY fattura_id
        HAVING COUNT(*) > 1
    """).fetchall()
    dup_removed = 0
    for fat_id, keep_id in dups:
        n = cur.execute("""
            DELETE FROM banca_fatture_link
            WHERE fattura_id = ? AND id != ?
        """, (fat_id, keep_id)).rowcount
        dup_removed += n

    conn.commit()
    print(f"  -> Rimossi {orphan_fat} link a fatture inesistenti")
    print(f"  -> Rimossi {orphan_mov} link a movimenti inesistenti")
    print(f"  -> Rimossi {dup_removed} link duplicati (stessa fattura)")
