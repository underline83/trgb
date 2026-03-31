"""
Migrazione 046: Pulizia duplicati banca_movimenti

Due import con formato CSV diverso (ElentoEntrateUscite vs MovimentiCC)
hanno creato ~398 movimenti duplicati perché le descrizioni avevano case diverso
e il dedup_hash originale non normalizzava il case.

Strategia:
1. Raggruppa movimenti per hash normalizzato (lowercase)
2. Per i gruppi con >1 riga, tieni il più vecchio (id minore)
3. Sposta eventuali cg_uscite/link dal duplicato al keeper
4. Elimina le cg_uscite rimaste orfane (collegate a duplicati)
5. Elimina i movimenti duplicati
6. Ricalcola dedup_hash per tutti i movimenti (normalizzato)
7. Aggiorna contatori nell'import_log
"""

import hashlib
import re


def _norm_hash(data_contabile, importo, descrizione):
    d = (descrizione or "").strip().lower()
    d = re.sub(r"\s+", " ", d)[:50]
    raw = f"{data_contabile}|{importo:.2f}|{d}"
    return hashlib.md5(raw.encode()).hexdigest()


def upgrade(conn):
    cur = conn.cursor()

    # ── 1. Leggi tutti i movimenti ──
    rows = cur.execute("""
        SELECT id, data_contabile, importo, descrizione FROM banca_movimenti
    """).fetchall()

    # Raggruppa per hash normalizzato
    groups = {}
    for r in rows:
        mid, data_c, importo, desc = r[0], r[1], r[2], r[3]
        h = _norm_hash(data_c, importo, desc)
        groups.setdefault(h, []).append(mid)

    # Identifica keeper (id più basso) e duplicati
    keepers = {}     # hash → keeper_id
    to_delete = []   # id movimenti da eliminare
    remap = {}       # old_id → keeper_id (per spostare collegamenti)

    for h, ids in groups.items():
        if len(ids) == 1:
            keepers[h] = ids[0]
            continue
        ids_sorted = sorted(ids)
        keeper = ids_sorted[0]
        keepers[h] = keeper
        for dup_id in ids_sorted[1:]:
            to_delete.append(dup_id)
            remap[dup_id] = keeper

    if not to_delete:
        return  # niente da fare

    # ── 2. Sposta collegamenti CG dai duplicati ai keeper ──
    for dup_id, keeper_id in remap.items():
        # Controlla se il dupe ha una cg_uscite collegata
        cg = cur.execute(
            "SELECT id FROM cg_uscite WHERE banca_movimento_id = ?", (dup_id,)
        ).fetchone()
        if not cg:
            continue

        # Controlla se il keeper ha già una cg_uscite
        keeper_cg = cur.execute(
            "SELECT id FROM cg_uscite WHERE banca_movimento_id = ?", (keeper_id,)
        ).fetchone()

        if keeper_cg:
            # Entrambi hanno CG — elimina quella del dupe
            cur.execute("DELETE FROM cg_uscite WHERE id = ?", (cg[0],))
        else:
            # Solo il dupe ha CG — sposta al keeper
            cur.execute(
                "UPDATE cg_uscite SET banca_movimento_id = ? WHERE id = ?",
                (keeper_id, cg[0])
            )

    # ── 3. Sposta banca_fatture_link ──
    for dup_id, keeper_id in remap.items():
        links = cur.execute(
            "SELECT id, fattura_id FROM banca_fatture_link WHERE movimento_id = ?",
            (dup_id,)
        ).fetchall()
        for link in links:
            link_id, fat_id = link[0], link[1]
            # Controlla se il keeper ha già un link per la stessa fattura
            existing = cur.execute(
                "SELECT id FROM banca_fatture_link WHERE movimento_id = ? AND fattura_id = ?",
                (keeper_id, fat_id)
            ).fetchone()
            if existing:
                cur.execute("DELETE FROM banca_fatture_link WHERE id = ?", (link_id,))
            else:
                cur.execute(
                    "UPDATE banca_fatture_link SET movimento_id = ? WHERE id = ?",
                    (keeper_id, link_id)
                )

    # ── 4. Elimina movimenti duplicati ──
    for batch_start in range(0, len(to_delete), 100):
        batch = to_delete[batch_start:batch_start + 100]
        placeholders = ",".join("?" * len(batch))
        cur.execute(f"DELETE FROM banca_movimenti WHERE id IN ({placeholders})", batch)

    # ── 5. Ricalcola dedup_hash per tutti ──
    remaining = cur.execute(
        "SELECT id, data_contabile, importo, descrizione FROM banca_movimenti"
    ).fetchall()
    for r in remaining:
        new_hash = _norm_hash(r[1], r[2], r[3])
        try:
            cur.execute(
                "UPDATE banca_movimenti SET dedup_hash = ? WHERE id = ?",
                (new_hash, r[0])
            )
        except Exception:
            # Hash collision (movimenti identici reali) — lascia il vecchio
            pass

    # ── 6. Aggiorna contatori import_log ──
    logs = cur.execute("SELECT id FROM banca_import_log").fetchall()
    for log in logs:
        cnt = cur.execute(
            "SELECT COUNT(*) FROM banca_movimenti WHERE import_id = ?", (log[0],)
        ).fetchone()
        cur.execute(
            "UPDATE banca_import_log SET num_rows = ?, num_new = ? WHERE id = ?",
            (cnt[0], cnt[0], log[0])
        )

    deleted_count = len(to_delete)
    print(f"  Pulizia banca: eliminati {deleted_count} movimenti duplicati, "
          f"restano {len(remaining)} movimenti")
