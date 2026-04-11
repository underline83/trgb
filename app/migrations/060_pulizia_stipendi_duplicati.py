"""
Migrazione 060: Pulizia stipendi duplicati in cg_uscite con nome corrotto

Marco ha segnalato (problemi.md A2) che alcuni stipendi in cg_uscite risultano
raddoppiati (o triplicati) perché una prima importazione ha parseato male il
nome del dipendente. Casi trovati:

  Marco Carminati, Gennaio 2026, €2509 — 3 righe:
    id 1659  'Stipendio - MARCO CARMINATI'   (uppercase, primo import)
    id 1670  'Stipendio - Marco Carminatio'  (typo, secondo import)
    id 2094  'Stipendio - Marco Carminati'   (canonico, terzo import)

  Marco Carminati, Febbraio 2026, €2800 — 2 righe:
    id 1678  'Stipendio - Marco Carminatio'  (typo, collegato a banca)
    id 2095  'Stipendio - Marco Carminati'   (canonico)

  Dos Santos Mirla Stefane Albuquerque, Gennaio 2026, €209 — 2 righe:
    id 1663  'Stipendio - Dos Santos Mirla S Albuquerque'         (troncato)
    id 1669  'Stipendio - Dos Santos Mirla Stefane Albuquerque'   (canonico)

Strategia:
1. Raggruppa cg_uscite.tipo_uscita='STIPENDIO' per (periodo_riferimento, totale)
   con >= 2 righe
2. Normalizza ciascun fornitore_nome (strip "Stipendio - ", lowercase, squash spaces)
3. Confronta con i nomi canonici dei dipendenti (tabella dipendenti in
   dipendenti.sqlite3) costruiti come "nome cognome" lowercase
4. Un record è CANONICO se il suo nome normalizzato == nome canonico di un
   dipendente
5. Keeper = preferisce:
   (a) canonico con banca_movimento_id NOT NULL (già collegato)
   (b) canonico più recente (max created_at)
   (c) se nessun canonico, quello più recente
6. Migra banca_movimento_id dal duplicato al keeper se keeper è NULL
7. Elimina i duplicati

La migrazione è idempotente: se non trova gruppi da fondere, non fa nulla.
"""

import re
import sqlite3
from difflib import SequenceMatcher
from pathlib import Path


def _normalize_name(nome_grezzo: str) -> str:
    """'Stipendio - MARCO CARMINATI' → 'marco carminati'"""
    if not nome_grezzo:
        return ""
    s = nome_grezzo.strip()
    # Rimuovi prefisso "Stipendio - " o "Stipendio -" (case insensitive)
    s = re.sub(r"^stipendio\s*-\s*", "", s, flags=re.IGNORECASE)
    s = s.lower().strip()
    # Squash spazi multipli
    s = re.sub(r"\s+", " ", s)
    return s


def _load_canonical_names(dip_db_path: Path) -> set:
    """Carica l'insieme dei nomi canonici 'nome cognome' lowercase dei dipendenti."""
    if not dip_db_path.exists():
        return set()
    dconn = sqlite3.connect(dip_db_path)
    try:
        rows = dconn.execute("SELECT nome, cognome FROM dipendenti").fetchall()
    finally:
        dconn.close()
    canon = set()
    for nome, cogn in rows:
        n = (nome or "").strip().lower()
        c = (cogn or "").strip().lower()
        if n or c:
            full = re.sub(r"\s+", " ", f"{n} {c}".strip())
            canon.add(full)
    return canon


def _is_canonical(normalized: str, canonical_set: set) -> bool:
    """Match esatto contro un dipendente canonico."""
    return normalized in canonical_set


def upgrade(conn):
    cur = conn.cursor()

    # DB dipendenti: stesso app/data/
    # conn è foodcost.db, ricaviamo la directory da PRAGMA database_list
    db_list = cur.execute("PRAGMA database_list").fetchall()
    main_path = None
    for _, name, path in db_list:
        if name == "main":
            main_path = Path(path)
            break
    if main_path is None:
        print("  Migrazione 060: impossibile determinare path main db, skip")
        return 0
    dip_path = main_path.parent / "dipendenti.sqlite3"
    canonical = _load_canonical_names(dip_path)
    if not canonical:
        print(f"  Migrazione 060: nessun dipendente canonico trovato in {dip_path}, skip")
        return 0

    # 1. Trova gruppi di stipendi duplicati per (periodo_riferimento, totale)
    cur.execute("""
        SELECT periodo_riferimento, totale, COUNT(*) as n
        FROM cg_uscite
        WHERE tipo_uscita = 'STIPENDIO'
          AND periodo_riferimento IS NOT NULL
        GROUP BY periodo_riferimento, totale
        HAVING COUNT(*) >= 2
    """)
    groups = cur.fetchall()

    total_deleted = 0
    total_migrated = 0

    for periodo, totale, _n in groups:
        cur.execute("""
            SELECT id, fornitore_nome, banca_movimento_id, created_at, stato
            FROM cg_uscite
            WHERE tipo_uscita = 'STIPENDIO'
              AND periodo_riferimento = ?
              AND totale = ?
            ORDER BY created_at DESC
        """, (periodo, totale))
        rows = [dict(zip(["id", "fornitore_nome", "banca_movimento_id", "created_at", "stato"], r))
                for r in cur.fetchall()]

        if len(rows) < 2:
            continue

        # Classifica ogni riga
        for r in rows:
            norm = _normalize_name(r["fornitore_nome"])
            r["_norm"] = norm
            r["_canonical"] = _is_canonical(norm, canonical)

        # Verifica che tutte le righe si riferiscano allo stesso dipendente logico:
        # almeno una canonica e tutte le altre devono condividere il cognome o
        # essere prefissi/suffissi una dell'altra. Evita di unire
        # stipendi legittimi diversi con stesso importo.
        canonical_rows = [r for r in rows if r["_canonical"]]
        if not canonical_rows:
            # Niente di canonico → troppo rischioso, skip
            continue

        # Tutte le righe non canoniche devono essere "plausibilmente stesso dipendente"
        # di almeno una canonica. Usiamo: un nome è token-subset dell'altro OR viceversa.
        def is_same_person(a: str, b: str) -> bool:
            if not a or not b:
                return False
            if a == b:
                return True
            ta = a.split()
            tb = b.split()
            if not ta or not tb:
                return False
            sa, sb = set(ta), set(tb)
            # Subset check
            if sa.issubset(sb) or sb.issubset(sa):
                return True
            # Fuzzy ratio sull'intera stringa: typo singolo → ratio alto
            if SequenceMatcher(None, a, b).ratio() >= 0.85:
                return True
            # Overlap 75% token esatti
            common = sa & sb
            return len(common) / max(len(sa), len(sb)) >= 0.75

        canonical_norms = [r["_norm"] for r in canonical_rows]
        all_match = all(
            any(is_same_person(r["_norm"], cn) for cn in canonical_norms)
            for r in rows
        )
        if not all_match:
            # Gruppo eterogeneo (nomi troppo diversi), skip per sicurezza
            continue

        # Keeper: canonico con banca_movimento_id NOT NULL, altrimenti canonico
        # con stato="PAGATA" (collegato), altrimenti canonico più recente
        canonical_rows.sort(
            key=lambda r: (
                0 if r["banca_movimento_id"] is not None else 1,
                0 if r["stato"] == "PAGATA" else 1,
                r["created_at"] or "",
            )
        )
        # Primo (in ordine crescente): priorità alta
        # Ma vogliamo il created_at più recente come tie-breaker → invertiamo
        canonical_rows.sort(
            key=lambda r: (
                0 if r["banca_movimento_id"] is not None else 1,
                0 if r["stato"] == "PAGATA" else 1,
            )
        )
        # Tra canonici a parità di priorità, scegli il più recente
        top_prio = (
            0 if canonical_rows[0]["banca_movimento_id"] is not None else 1,
            0 if canonical_rows[0]["stato"] == "PAGATA" else 1,
        )
        same_prio = [
            r for r in canonical_rows
            if (0 if r["banca_movimento_id"] is not None else 1,
                0 if r["stato"] == "PAGATA" else 1) == top_prio
        ]
        keeper = max(same_prio, key=lambda r: r["created_at"] or "")

        dups = [r for r in rows if r["id"] != keeper["id"]]

        # Se il keeper non ha banca_movimento_id, prendilo da un dup collegato
        if keeper["banca_movimento_id"] is None:
            for d in dups:
                if d["banca_movimento_id"] is not None:
                    cur.execute("""
                        UPDATE cg_uscite
                        SET banca_movimento_id = ?,
                            stato = 'PAGATA',
                            data_pagamento = COALESCE(data_pagamento,
                                (SELECT data_contabile FROM banca_movimenti WHERE id = ?)),
                            importo_pagato = totale,
                            updated_at = datetime('now')
                        WHERE id = ?
                    """, (d["banca_movimento_id"], d["banca_movimento_id"], keeper["id"]))
                    total_migrated += 1
                    keeper["banca_movimento_id"] = d["banca_movimento_id"]
                    # Scollega il dup prima di cancellarlo (evita cascade inattesi)
                    cur.execute(
                        "UPDATE cg_uscite SET banca_movimento_id = NULL WHERE id = ?",
                        (d["id"],))
                    break

        # Elimina i duplicati
        for d in dups:
            # Se il dup aveva banca_movimento_id ancora (e non l'abbiamo migrato
            # perché keeper era già collegato), scollega e delete
            if d["banca_movimento_id"] is not None and d["banca_movimento_id"] != keeper["banca_movimento_id"]:
                cur.execute(
                    "UPDATE cg_uscite SET banca_movimento_id = NULL WHERE id = ?",
                    (d["id"],))
            cur.execute("DELETE FROM cg_uscite WHERE id = ?", (d["id"],))
            total_deleted += 1

    conn.commit()
    print(f"  Migrazione 060: eliminati {total_deleted} stipendi duplicati, migrati {total_migrated} link banca")
    return total_deleted
