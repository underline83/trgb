"""
Migrazione 042: dedup aggressivo movimenti bancari.

La migrazione 041 usava il dedup_hash case-insensitive, ma i due CSV importati
hanno descrizioni leggermente diverse per lo stesso movimento:
  - Spazi multipli vs singolo
  - Troncatura a lunghezze diverse
  - Padding con spazi finali

Questa migrazione normalizza le descrizioni (lowercase, collasso spazi, primi 50 char)
e raggruppa per (data_contabile, importo, desc_normalizzata). I duplicati vengono
rimossi mantenendo l'id più basso; link in banca_fatture_link e cg_uscite vengono
spostati al superstite.
"""
import re


def _normalize_desc(desc):
    """Normalizza descrizione: lower, collasso spazi, primi 50 char."""
    if not desc:
        return ""
    d = desc.strip().lower()
    d = re.sub(r"\s+", " ", d)   # collassa spazi multipli
    return d[:50]


def upgrade(conn):
    cur = conn.cursor()

    # 1. Leggi tutti i movimenti
    rows = cur.execute(
        "SELECT id, data_contabile, importo, descrizione FROM banca_movimenti"
    ).fetchall()

    # 2. Raggruppa per chiave normalizzata
    groups = {}  # (data, importo, desc50) → [ids]
    for r in rows:
        rid, data_c, importo, desc = r[0], r[1], r[2], r[3]
        key = (data_c, importo, _normalize_desc(desc))
        groups.setdefault(key, []).append(rid)

    removed = 0
    for key, ids in groups.items():
        if len(ids) <= 1:
            continue

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

            # Elimina link orfani
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

    # 3. Ricalcola dedup_hash per i superstiti con il formato normalizzato
    import hashlib

    remaining = cur.execute(
        "SELECT id, data_contabile, importo, descrizione FROM banca_movimenti"
    ).fetchall()

    for r in remaining:
        rid, data_c, importo, desc = r[0], r[1], r[2], r[3]
        raw = f"{data_c}|{importo:.2f}|{(desc or '').strip().lower()}"
        h = hashlib.md5(raw.encode()).hexdigest()
        cur.execute(
            "UPDATE banca_movimenti SET dedup_hash = ? WHERE id = ?",
            (h, rid)
        )

    conn.commit()
    print(f"  -> Rimossi {removed} movimenti duplicati (dedup aggressivo)")
