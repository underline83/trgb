"""
Migrazione 051: Pulizia duplicati banca v2 — normalizzazione aggressiva

I duplicati rimasti dalla migrazione 046 sono causati da formati CSV diversi:
- Formato 1: "BONIF. VS. FAVORE - BON.DA STRIPE - THEFORK PAY" (uppercase, trattini)
- Formato 2: "bonif. vs. favore - bon.da stripe thefork pay" (lowercase, senza trattini)

La vecchia normalizzazione (solo lowercase + primi 50 char) non bastava.
Nuova: rimuovi punteggiatura, lowercase, collassa spazi, primi 40 char.

NON tocca gruppi con stessa data+importo ma descrizioni diverse
(es. commissioni bonifici diversi nello stesso giorno).

Strategia:
1. Calcola nuovo hash normalizzato per ogni movimento
2. Raggruppa per (data, importo, hash_normalizzato)
3. Per gruppi con >1 riga: tieni il più vecchio, migra link, elimina duplicati
4. Aggiorna dedup_hash di tutti i movimenti
"""

import hashlib
import re


def _normalize_v2(descrizione: str) -> str:
    """Normalizzazione aggressiva: rimuovi punteggiatura, lowercase, collassa spazi."""
    d = (descrizione or "").strip().lower()
    d = re.sub(r"[^\w\s]", " ", d)
    d = re.sub(r"\s+", " ", d).strip()
    return d[:40]


def _hash_v2(data_contabile: str, importo: float, descrizione: str) -> str:
    d = _normalize_v2(descrizione)
    raw = f"{data_contabile}|{importo:.2f}|{d}"
    return hashlib.md5(raw.encode()).hexdigest()


def run(conn):
    cur = conn.cursor()

    # 1. Calcola hash per tutti i movimenti
    cur.execute("SELECT id, data_contabile, importo, descrizione FROM banca_movimenti ORDER BY id")
    rows = cur.fetchall()

    # Raggruppa per nuovo hash
    groups = {}  # hash → [ids]
    for r in rows:
        h = _hash_v2(r[1], r[2], r[3])
        groups.setdefault(h, []).append(r[0])

    # 2. Trova duplicati
    total_deleted = 0
    total_migrated = 0

    for h, ids in groups.items():
        if len(ids) < 2:
            continue

        keeper = ids[0]  # ID più basso = più vecchio
        to_delete = ids[1:]

        for did in to_delete:
            # Migra banca_fatture_link
            cur.execute("""
                UPDATE banca_fatture_link SET movimento_id = ?
                WHERE movimento_id = ?
                  AND fattura_id NOT IN (
                      SELECT fattura_id FROM banca_fatture_link WHERE movimento_id = ?
                  )
            """, (keeper, did, keeper))
            total_migrated += cur.rowcount

            # Migra cg_uscite
            cur.execute("""
                UPDATE cg_uscite SET banca_movimento_id = ?
                WHERE banca_movimento_id = ?
            """, (keeper, did))
            total_migrated += cur.rowcount

            # Migra cg_entrate
            cur.execute("""
                UPDATE cg_entrate SET banca_movimento_id = ?
                WHERE banca_movimento_id = ?
            """, (keeper, did))
            total_migrated += cur.rowcount

            # Elimina link orfani rimasti
            cur.execute("DELETE FROM banca_fatture_link WHERE movimento_id = ?", (did,))

            # Elimina il duplicato
            cur.execute("DELETE FROM banca_movimenti WHERE id = ?", (did,))
            total_deleted += 1

    # 3. Ricalcola dedup_hash per tutti i movimenti con il nuovo algoritmo
    cur.execute("SELECT id, data_contabile, importo, descrizione FROM banca_movimenti")
    for r in cur.fetchall():
        new_hash = _hash_v2(r[1], r[2], r[3])
        cur.execute("UPDATE banca_movimenti SET dedup_hash = ? WHERE id = ?", (new_hash, r[0]))

    conn.commit()
    print(f"  Migrazione 051: eliminati {total_deleted} duplicati, migrati {total_migrated} link")
    return total_deleted
