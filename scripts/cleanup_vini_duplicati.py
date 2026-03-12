#!/usr/bin/env python3
"""
Pulizia duplicati vini_magazzino.

Trova vini duplicati per chiave naturale (DESCRIZIONE+PRODUTTORE+ANNATA+FORMATO)
e rimuove le copie più recenti, mantenendo il vino con l'id più basso (il primo inserito).

Uso:
  python3 scripts/cleanup_vini_duplicati.py            # solo report (dry-run)
  python3 scripts/cleanup_vini_duplicati.py --fix       # rimuove i duplicati
"""
import sqlite3, os, sys

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "data", "vini_magazzino.sqlite3")


def main():
    fix = "--fix" in sys.argv

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Trova gruppi di duplicati per chiave naturale
    rows = conn.execute("""
        SELECT
            UPPER(TRIM(COALESCE(DESCRIZIONE, ''))) AS dk,
            UPPER(TRIM(COALESCE(PRODUTTORE, '')))  AS pk,
            TRIM(COALESCE(ANNATA, ''))              AS ak,
            TRIM(COALESCE(FORMATO, ''))             AS fk,
            COUNT(*) AS cnt,
            GROUP_CONCAT(id, ',') AS ids
        FROM vini_magazzino
        GROUP BY dk, pk, ak, fk
        HAVING cnt > 1
        ORDER BY cnt DESC, dk
    """).fetchall()

    if not rows:
        print("\nNessun duplicato trovato! Il database è pulito.")
        conn.close()
        return

    print(f"\nTrovati {len(rows)} gruppi di duplicati ({sum(r['cnt'] - 1 for r in rows)} vini da rimuovere):\n")
    print(f"  {'DESCRIZIONE':<50} {'PRODUTTORE':<25} {'ANNATA':<8} {'N':<4} IDs")
    print(f"  {'─' * 110}")

    ids_to_delete = []

    for r in rows:
        ids_list = [int(x) for x in r["ids"].split(",")]
        keep_id = min(ids_list)          # mantieni il più vecchio
        delete_ids = [i for i in ids_list if i != keep_id]
        ids_to_delete.extend(delete_ids)

        desc = r["dk"][:48] if r["dk"] else "(vuoto)"
        prod = r["pk"][:23] if r["pk"] else ""
        ann = r["ak"][:6] if r["ak"] else ""

        print(f"  {desc:<50} {prod:<25} {ann:<8} x{r['cnt']:<3} keep={keep_id}, del={delete_ids}")

    print(f"\n  Totale duplicati da eliminare: {len(ids_to_delete)}")

    if fix:
        if ids_to_delete:
            placeholders = ",".join("?" * len(ids_to_delete))
            conn.execute(f"DELETE FROM vini_magazzino WHERE id IN ({placeholders})", ids_to_delete)
            conn.commit()
            print(f"\n  ELIMINATI {len(ids_to_delete)} vini duplicati.")
        else:
            print("\n  Nulla da eliminare.")
    else:
        print(f"\n  (Dry-run: usa --fix per eliminare i duplicati)")

    conn.close()


if __name__ == "__main__":
    main()
