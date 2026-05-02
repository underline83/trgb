#!/usr/bin/env python3
# TODO R6.5: script one-shot lanciato MANUALMENTE da Marco. Path foodcost.db
# ricavato dinamicamente. Adattare al locale corrente se rilanciato in futuro
# su un'istanza diversa da tregobbi (usare locale_data_path).
"""
apply_backfill_057.py — applica il backfill delle rateizzazioni su fe_fatture.

Parte della release CG v2.0a2.

Questo script va lanciato MANUALMENTE da Marco dopo aver rivisto e
approvato il CSV generato dalla migrazione 057. Lo script:

  1) verifica l'esistenza del file backfill_057_approved.csv
  2) esegue un backup automatico di foodcost.db con timestamp
  3) parsa le righe approvate (colonna 'approvato' = Y/Yes/1/X/y)
  4) applica gli UPDATE in una singola transazione
  5) stampa un report finale con il conteggio delle modifiche

Se qualcosa va storto durante gli UPDATE, la transazione viene
rollback-ata automaticamente. Il backup del DB resta comunque come
rete di sicurezza.

WORKFLOW UTENTE
===============

1. Il CSV dry-run e' gia' stato generato dalla mig 057 in
   app/data/backfill_057_dryrun.csv

2. Marco scarica il CSV, lo apre in Excel, rivede i match, marca
   'Y' nella colonna 'approvato' per le righe da applicare, salva
   come backfill_057_approved.csv (CSV UTF-8)

3. Marco uploada il file approvato:
     scp backfill_057_approved.csv \\
         trgb:/home/marco/trgb/trgb/app/data/

4. Marco lancia questo script sul VPS:
     ssh trgb "cd /home/marco/trgb/trgb && \\
               ../venv-trgb/bin/python scripts/apply_backfill_057.py"

5. Lo script stampa il report e i conteggi; se tutto ok il DB e'
   aggiornato. Se serve rollback, c'e' il backup pre-apply sul disco.

COLONNE CSV RICHIESTE
=====================

sf_id, fattura_id, approvato

Tutte le altre colonne sono ignorate (servono solo a Marco per rivedere
il CSV in Excel). Una riga e' considerata 'approvata' se la colonna
'approvato' contiene uno dei valori: Y, y, Yes, yes, 1, X, x, true, TRUE.

SICUREZZA
=========

Lo script e' idempotente in caso di esecuzioni multiple se il match e'
lo stesso (scrive sempre lo stesso valore), ma se Marco rigenera il CSV
dopo aver fatto altri cambiamenti, potrebbe sovrascrivere scelte vecchie.
Prima di rilanciare in una seconda occasione, verificare che i sf_id nel
CSV siano ancora corretti.

Lo script RIFIUTA l'apply se trova righe approvate con fattura_id che:
  - non esiste in fe_fatture (errore)
  - risulta gia' flaggata con un sf_id DIVERSO da quello del CSV
    (evita di sovrascrivere assegnamenti gia' fatti)

Lo script ACCETTA righe dove la fattura risulta gia' flaggata con lo
stesso sf_id (no-op, stampa skip).
"""

import csv
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


# Valori che indicano "approvato" nella colonna CSV
APPROVED_MARKERS = {'y', 'yes', '1', 'x', 'true', 'si', 'sì'}


def is_approved(value):
    if not value:
        return False
    return str(value).strip().lower() in APPROVED_MARKERS


def main():
    # Paths assoluti calcolati rispetto alla root del progetto
    # Assumo che lo script sia in trgb/scripts/, quindi root = parent.parent
    root = Path(__file__).resolve().parent.parent
    db_path = root / 'app' / 'data' / 'foodcost.db'
    csv_path = root / 'app' / 'data' / 'backfill_057_approved.csv'

    print("=" * 60)
    print("  apply_backfill_057 — Backfill rateizzazioni v2.0a2")
    print("=" * 60)
    print(f"  DB:  {db_path}")
    print(f"  CSV: {csv_path}")
    print()

    # --- Step 1: verifica esistenza file ---
    if not db_path.exists():
        print(f"ERRORE: DB non trovato in {db_path}")
        sys.exit(1)
    if not csv_path.exists():
        print(f"ERRORE: CSV approvato non trovato in {csv_path}")
        print("  Assicurati di aver uploadato backfill_057_approved.csv")
        print("  scp backfill_057_approved.csv trgb:{}".format(csv_path))
        sys.exit(1)

    # --- Step 2: backup automatico DB ---
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = db_path.with_suffix(f'.db.backup_pre_057_{timestamp}')
    print(f"  Backup DB -> {backup_path.name}")
    shutil.copy2(db_path, backup_path)
    backup_size_mb = backup_path.stat().st_size / (1024 * 1024)
    print(f"    size: {backup_size_mb:.2f} MB")
    print()

    # --- Step 3: parse CSV approvato ---
    approved_rows = []
    total_rows = 0
    with open(csv_path, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        required_cols = {'sf_id', 'fattura_id', 'approvato'}
        missing = required_cols - set(reader.fieldnames or [])
        if missing:
            print(f"ERRORE: colonne mancanti nel CSV: {missing}")
            print(f"  colonne trovate: {reader.fieldnames}")
            sys.exit(2)

        for row in reader:
            total_rows += 1
            if is_approved(row.get('approvato')):
                # Valida i tipi
                try:
                    sf_id = int(row['sf_id'])
                except (TypeError, ValueError):
                    print(f"ERRORE: sf_id non intero in riga {total_rows}: {row.get('sf_id')!r}")
                    sys.exit(3)
                try:
                    fattura_id = int(row['fattura_id'])
                except (TypeError, ValueError):
                    print(f"ERRORE: fattura_id non intero in riga {total_rows} (sf_id={sf_id}): {row.get('fattura_id')!r}")
                    sys.exit(3)
                approved_rows.append({
                    'sf_id': sf_id,
                    'fattura_id': fattura_id,
                    'titolo': row.get('sf_titolo', ''),
                    'fornitore': row.get('fornitore_nome', ''),
                    'num': row.get('fattura_numero', ''),
                    'totale': row.get('fattura_totale', ''),
                })

    print(f"  CSV letto: {total_rows} righe totali, {len(approved_rows)} approvate")
    if not approved_rows:
        print("  Nessuna riga approvata, niente da fare. Exit.")
        return
    print()

    # --- Step 4: apply UPDATE in transazione ---
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    applied = 0
    skipped_already_same = 0
    errors = []

    try:
        cur.execute("BEGIN IMMEDIATE")

        # Pre-check: verifica che tutte le sf_id esistano
        sf_ids_in_csv = sorted({r['sf_id'] for r in approved_rows})
        placeholders = ','.join('?' * len(sf_ids_in_csv))
        existing_sfs = {
            r[0] for r in cur.execute(
                f"SELECT id FROM cg_spese_fisse WHERE id IN ({placeholders})",
                sf_ids_in_csv,
            ).fetchall()
        }
        missing_sfs = set(sf_ids_in_csv) - existing_sfs
        if missing_sfs:
            raise RuntimeError(
                f"Spese fisse non trovate in DB: {sorted(missing_sfs)}"
            )

        # Applica ogni riga
        for row in approved_rows:
            fattura_id = row['fattura_id']
            sf_id = row['sf_id']

            # Verifica esistenza fattura + stato corrente
            f = cur.execute(
                "SELECT id, rateizzata_in_spesa_fissa_id, numero_fattura, totale_fattura "
                "FROM fe_fatture WHERE id = ?",
                (fattura_id,),
            ).fetchone()

            if f is None:
                errors.append(f"fattura_id={fattura_id} non trovata (sf={sf_id})")
                continue

            current_sf = f['rateizzata_in_spesa_fissa_id']
            if current_sf is not None:
                if current_sf == sf_id:
                    skipped_already_same += 1
                    print(f"  skip (gia' flaggata con stesso sf_id): fattura #{fattura_id} -> sf {sf_id}")
                    continue
                else:
                    errors.append(
                        f"CONFLITTO: fattura #{fattura_id} gia' flaggata con sf_id={current_sf}, "
                        f"CSV chiede sf_id={sf_id}"
                    )
                    continue

            # Applica UPDATE
            cur.execute(
                "UPDATE fe_fatture SET rateizzata_in_spesa_fissa_id = ? WHERE id = ?",
                (sf_id, fattura_id),
            )
            applied += 1
            print(f"  + #{fattura_id} [{row['num']}] -> sf {sf_id} "
                  f"({row['fornitore'][:40]}, {row['totale']})")

        if errors:
            print()
            print(f"  !!! {len(errors)} errori rilevati, rollback della transazione:")
            for e in errors:
                print(f"      - {e}")
            conn.rollback()
            print()
            print("  ROLLBACK eseguito. Il DB NON e' stato modificato.")
            print(f"  Il backup resta disponibile in {backup_path}")
            sys.exit(4)

        conn.commit()

    except Exception as exc:
        conn.rollback()
        print(f"\nERRORE durante l'apply: {exc}")
        print("  Transazione rollbackata, DB non modificato.")
        print(f"  Backup disponibile in {backup_path}")
        sys.exit(5)
    finally:
        conn.close()

    # --- Step 5: report finale ---
    print()
    print("=" * 60)
    print("  REPORT FINALE")
    print("=" * 60)
    print(f"  Righe approvate nel CSV:       {len(approved_rows)}")
    print(f"  UPDATE applicati:              {applied}")
    print(f"  Skip (gia' stesso sf_id):      {skipped_already_same}")
    print(f"  Errori:                        {len(errors)}")
    print()
    print(f"  Backup pre-apply: {backup_path.name}")
    print(f"  Backup size:      {backup_size_mb:.2f} MB")
    print()
    if applied > 0:
        print("  Apply completato con successo.")
        print("  Le fatture flaggate ora verranno nascoste dallo Scadenzario")
        print("  (tranne col toggle 'Mostra fatture rateizzate' ON).")
    else:
        print("  Nessun UPDATE applicato.")
    print()


if __name__ == '__main__':
    main()
