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

    # 1. Ricalcola tutti gli hash
    rows = cur.execute(
        "SELECT id, data_contabile, importo, descrizione FROM banca_movimenti"
    ).fetchall()

    hash_map = {}  # new_hash → [ids]
    for r in rows:
        h = _new_hash(r["data_contabile"], r["importo"], r["descrizione"])
        hash_map.setdefault(h, []).append(r["id"])

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

            # Sposta riferimenti cg_uscite al superstite
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = ?
                WHERE banca_movimento_id = ?
            """, (keep_id, dup_id))

            # Elimina il duplicato
            cur.execute("DELETE FROM banca_movimenti WHERE id = ?", (dup_id,))
            removed += 1

    # 2. Aggiorna tutti gli hash con il nuovo formato case-insensitive
    for r in rows:
        h = _new_hash(r["data_contabile"], r["importo"], r["descrizione"])
        try:
            cur.execute(
                "UPDATE banca_movimenti SET dedup_hash = ? WHERE id = ?",
                (h, r["id"])
            )
        except Exception:
            pass  # id già eliminato come duplicato

    conn.commit()
    print(f"  → Rimossi {removed} movimenti duplicati")
