"""
Migrazione 041: rimuove movimenti bancari duplicati (case-insensitive).

Il dedup_hash originale era case-sensitive, quindi lo stesso movimento importato
con case diverso (es. CSV diversi) produceva due record.
Questa migrazione:
1. Ricalcola gli hash con .lower()
2. Elimina i duplicati mantenendo l'id più basso
3. Sposta eventuali link (banca_fatture_link) sul record superstite
"""
import hashlib


def _new_hash(data_contabile, importo, descrizione):
    raw = f"{data_contabile}|{importo:.2f}|{(descrizione or '').strip().lower()}"
    return hashlib.md5(raw.encode()).hexdigest()


def upgrade(conn):
    cur = conn.cursor()

    # 1. Leggi tutti i movimenti (accesso per indice — il runner non setta row_factory)
    rows = cur.execute(
        "SELECT id, data_contabile, importo, descrizione FROM banca_movimenti"
    ).fetchall()

    hash_map = {}  # new_hash → [ids]
    for r in rows:
        rid, data_c, importo, desc = r[0], r[1], r[2], r[3]
        h = _new_hash(data_c, importo, desc)
        hash_map.setdefault(h, []).append(rid)

    removed = 0
    for h, ids in hash_map.items():
        if len(ids) <= 1:
            continue

        # Tieni l'id più basso come superstite
        ids.sort()
        keep_id = ids[0]
        dup_ids = ids[1:]

        for dup_id in dup_ids:
            # Sposta link fatture al superstite (ignora se già esiste)
            cur.execute("""
                UPDATE OR IGNORE banca_fatture_link
                SET movimento_id = ?
                WHERE movimento_id = ?
            """, (keep_id, dup_id))

            # Elimina link orfani (se il superstite aveva già un link per la stessa fattura)
            cur.execute("""
                DELETE FROM banca_fatture_link WHERE movimento_id = ?
            """, (dup_id,))

            # Sposta riferimenti cg_uscite al superstite
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = ?
                WHERE banca_movimento_id = ?
            """, (keep_id, dup_id))

            # Elimina il duplicato
            cur.execute("DELETE FROM banca_movimenti WHERE id = ?", (dup_id,))
            removed += 1

    # 2. Aggiorna tutti gli hash al nuovo formato case-insensitive
    # Disabilita temporaneamente il constraint UNIQUE per evitare conflitti
    # durante l'aggiornamento in batch (i duplicati sono già stati rimossi)
    deleted_ids = set()
    for h, ids in hash_map.items():
        if len(ids) > 1:
            for did in ids[1:]:
                deleted_ids.add(did)

    for r in rows:
        rid, data_c, importo, desc = r[0], r[1], r[2], r[3]
        if rid in deleted_ids:
            continue  # già eliminato
        h = _new_hash(data_c, importo, desc)
        cur.execute(
            "UPDATE banca_movimenti SET dedup_hash = ? WHERE id = ?",
            (h, rid)
        )

    conn.commit()
    print(f"  -> Rimossi {removed} movimenti duplicati")
