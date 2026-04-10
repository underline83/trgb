"""
Migrazione 052: Backfill cg_uscite per rateizzazioni esistenti

Le rateizzazioni create PRIMA del fix del POST /spese-fisse (v1.6)
hanno le righe in cg_piano_rate ma NON le corrispondenti cg_uscite.
Risultato: il riepilogo pagato/residuo (che legge da cg_uscite) restava 0/0
e il blocco non compariva in tabella.

Questa migrazione scorre le cg_spese_fisse di tipo RATEIZZAZIONE e PRESTITO
con piano rate e, per ogni rata senza uscita corrispondente
(stesso spesa_fissa_id + periodo_riferimento), ne crea una con stato
DA_PAGARE o SCADUTA in base alla data odierna.

I prestiti BPM (mig. 047) hanno già le uscite, quindi questo backfill
colpirà solo le rateizzazioni inserite manualmente dal wizard.
"""

import calendar
from datetime import date


def upgrade(conn):
    cur = conn.cursor()
    oggi = date.today()

    # Spese fisse candidate: hanno almeno una riga in cg_piano_rate
    spese = cur.execute("""
        SELECT sf.id, sf.tipo, sf.titolo, sf.giorno_scadenza
        FROM cg_spese_fisse sf
        WHERE sf.tipo IN ('RATEIZZAZIONE', 'PRESTITO')
          AND EXISTS (SELECT 1 FROM cg_piano_rate pr WHERE pr.spesa_fissa_id = sf.id)
    """).fetchall()

    totali_create = 0
    totali_skip = 0

    for sf in spese:
        sf_id = sf[0]
        tipo = sf[1]
        titolo = (sf[2] or "").strip()
        try:
            giorno_scad = int(sf[3] or 1)
        except Exception:
            giorno_scad = 1

        rate = cur.execute("""
            SELECT numero_rata, periodo, importo, note
            FROM cg_piano_rate
            WHERE spesa_fissa_id = ?
            ORDER BY periodo
        """, (sf_id,)).fetchall()

        for r in rate:
            numero_rata, periodo, importo, note = r[0], r[1], r[2], r[3]

            # Salta se l'uscita esiste già
            exists = cur.execute("""
                SELECT 1 FROM cg_uscite
                WHERE spesa_fissa_id = ? AND periodo_riferimento = ?
            """, (sf_id, periodo)).fetchone()
            if exists:
                totali_skip += 1
                continue

            # Calcola data_scadenza clampando giorno al max del mese
            try:
                anno_p, mese_p = periodo.split("-")
                anno_p = int(anno_p)
                mese_p = int(mese_p)
                max_g = calendar.monthrange(anno_p, mese_p)[1]
                g = min(giorno_scad, max_g)
                data_scad = date(anno_p, mese_p, g).isoformat()
            except Exception:
                continue

            try:
                ds = date.fromisoformat(data_scad)
                stato = "SCADUTA" if ds < oggi else "DA_PAGARE"
            except Exception:
                stato = "DA_PAGARE"

            try:
                cur.execute("""
                    INSERT INTO cg_uscite
                        (spesa_fissa_id, tipo_uscita, fornitore_nome, numero_fattura,
                         totale, data_scadenza, data_fattura,
                         importo_pagato, stato, periodo_riferimento, note)
                    VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, 0, ?, ?, ?)
                """, (
                    sf_id, titolo, tipo,
                    float(importo), data_scad, data_scad,
                    stato, periodo, note
                ))
                totali_create += 1
            except Exception as e:
                print(f"  skip rata {sf_id}/{periodo}: {e}")

    print(f"  Backfill uscite: {totali_create} create, {totali_skip} già presenti")
