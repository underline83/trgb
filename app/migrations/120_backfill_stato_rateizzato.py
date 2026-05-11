"""
Migrazione 120 — Backfill stato RATEIZZATO per fatture origine rateizzate (2026-05-11)

CONTESTO:
  Quando una fattura viene "rateizzata in spesa fissa", in `fe_fatture` viene
  settato `rateizzata_in_spesa_fissa_id` ma in `cg_uscite` lo stato della
  riga origine rimane PROGRAMMATO/SCADUTO. Il backend SELECT della /uscite
  ha un CASE che maschera lo stato come 'RATEIZZATO' a runtime, ma in DB
  resta lo stato originale → incoerenza tra "stato esposto" e "stato reale".

  Conseguenze:
    1. Filtri stato lato frontend non funzionano (stato in JSON = RATEIZZATO,
       ma filtroStato.has('RATEIZZATO') è falso col default attuale).
    2. La GENERATED column stato_macro deriva dal vero stato (PROGRAMMATO →
       APERTO), ignorando il fatto che è in realtà "consumata in piano rate".
    3. La logica "Mostra rateizzate" lato sidebar non funziona come Marco
       si aspettava (in sessione 2026-05-11 ha confermato: "esiste una rata in
       CG ma la fattura non viene più mostrata. questa era la logica").

AZIONE:
  UPDATE su `cg_uscite` per allineare lo stato delle 45 (o N) fatture origine
  rateizzate al valore canonico 'RATEIZZATO'. Solo per quelle che hanno ancora
  stato PROGRAMMATO/SCADUTO (cioè non sono già state pagate manualmente o
  riconciliate, casi che vogliamo preservare).

Idempotente. Re-run no-op (le RATEIZZATO già allineate non vengono toccate).

Codice ancora da fixare (separato, in commit):
  - Endpoint che crea la rateizzazione: deve settare ANCHE cg_uscite.stato
    a 'RATEIZZATO' al momento della creazione, così la prossima volta non
    serve un'altra mig di backfill.
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()
    cur.execute("""
        UPDATE cg_uscite
        SET stato = 'RATEIZZATO',
            updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IN (
            SELECT id FROM fe_fatture WHERE rateizzata_in_spesa_fissa_id IS NOT NULL
        )
        AND stato IN ('PROGRAMMATO', 'SCADUTO')
    """)
    n = cur.rowcount
    print(f"  [120] cg_uscite fatture origine PROGRAMMATO/SCADUTO → RATEIZZATO: {n} righe")
    conn.commit()
    print("  [120] DONE")
