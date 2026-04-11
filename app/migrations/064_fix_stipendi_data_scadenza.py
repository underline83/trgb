"""
Migrazione 064: fix data_scadenza stipendi + giorno_paga default

Contesto (sessione 23 — debug Scadenzario):
Nel modulo Scadenzario CG gli stipendi di marzo 2026 apparivano con
data_scadenza=2026-03-27 (giorno_paga di default applicato al mese di riferimento).
In realtà gli stipendi del mese N vengono pagati il giorno 15 del mese N+1
(es. stipendio marzo → pagamento 15 aprile).

Bug nel codice di `_genera_scadenza_stipendio` in app/routers/dipendenti.py:
- `data_scadenza = f"{anno}-{mese:02d}-{giorno_eff:02d}"`  ← mese di riferimento
- default giorno_paga = 27 (legacy, mai usato in produzione)

Fix codice (già applicato, vedi commit della sessione 23):
- `data_scadenza` calcolata sul mese N+1 con rollover anno
- default giorno_paga = 15 (giorno effettivo di pagamento Osteria Tre Gobbi)

Cleanup one-shot (questa migrazione):

1) UPDATE cg_uscite WHERE tipo_uscita='STIPENDIO' AND stato IN ('DA_PAGARE','SCADUTA')
   → sposta data_scadenza al 15 del mese successivo al periodo_riferimento.
   Solo righe NON ancora pagate. Storici PAGATA/PAGATA_MANUALE vengono lasciati
   intatti: sono chiusi, non impattano lo scadenzario, e riscriverli darebbe
   false "modifiche" nell'audit trail dei pagamenti.

2) UPDATE dipendenti.db SET giorno_paga = 15 WHERE giorno_paga = 27 (vecchio default)
   → aggiorna solo i dipendenti che avevano il default legacy.
   Se qualcuno ha un valore diverso (giorno_paga personalizzato), viene rispettato.

Idempotente: se rilanciata, l'UPDATE su cg_uscite trova già le date al 15 del mese
successivo e non modifica nulla (WHERE filtra per data_scadenza "sbagliata" per mese).
"""

import sqlite3
import calendar
from pathlib import Path


# Mappa mesi italiani → numero
MESI_IT = {
    "Gennaio": 1, "Febbraio": 2, "Marzo": 3, "Aprile": 4,
    "Maggio": 5, "Giugno": 6, "Luglio": 7, "Agosto": 8,
    "Settembre": 9, "Ottobre": 10, "Novembre": 11, "Dicembre": 12,
}


def _parse_periodo(periodo):
    """Es. 'Marzo 2026' → (3, 2026). Ritorna None se non parsabile."""
    if not periodo:
        return None
    parts = periodo.strip().split()
    if len(parts) != 2:
        return None
    mese_name, anno_s = parts
    mese = MESI_IT.get(mese_name.capitalize())
    try:
        anno = int(anno_s)
    except ValueError:
        return None
    if not mese:
        return None
    return (mese, anno)


def _target_scadenza(mese, anno, giorno=15):
    """Stipendio del mese N → pagamento il giorno N+1."""
    mese_paga = mese + 1
    anno_paga = anno
    if mese_paga > 12:
        mese_paga = 1
        anno_paga += 1
    max_gg = calendar.monthrange(anno_paga, mese_paga)[1]
    giorno_eff = min(giorno, max_gg)
    return f"{anno_paga}-{mese_paga:02d}-{giorno_eff:02d}"


def upgrade(conn):
    cur = conn.cursor()

    # ── Step 1: fix cg_uscite stipendi non pagati ───────────────
    rows = cur.execute("""
        SELECT id, fornitore_nome, data_scadenza, periodo_riferimento, stato
          FROM cg_uscite
         WHERE tipo_uscita = 'STIPENDIO'
           AND stato IN ('DA_PAGARE', 'SCADUTA')
    """).fetchall()

    updated = 0
    skipped = 0
    for row in rows:
        uid, forn, data_scad_cur, periodo, stato = row
        parsed = _parse_periodo(periodo)
        if not parsed:
            skipped += 1
            print(f"  ⚠ skip id={uid} ({forn}): periodo '{periodo}' non parsabile")
            continue
        mese, anno = parsed
        target = _target_scadenza(mese, anno, giorno=15)
        if data_scad_cur == target:
            continue  # già corretta
        cur.execute(
            "UPDATE cg_uscite SET data_scadenza = ? WHERE id = ?",
            (target, uid),
        )
        updated += 1
        print(f"  ~ id={uid} {forn}: {data_scad_cur} → {target}")

    print(f"  ✓ stipendi aggiornati: {updated}, skipped: {skipped}")

    # ── Step 2: ricalcola stato (SCADUTA vs DA_PAGARE) sui record appena aggiornati ──
    # Dopo aver spostato data_scadenza al 15 del mese successivo, alcune righe
    # che erano SCADUTA potrebbero dover tornare DA_PAGARE (se 15/next_month > oggi).
    from datetime import date
    oggi_str = date.today().isoformat()
    cur.execute("""
        UPDATE cg_uscite
           SET stato = CASE
                   WHEN data_scadenza < ? THEN 'SCADUTA'
                   ELSE 'DA_PAGARE'
               END
         WHERE tipo_uscita = 'STIPENDIO'
           AND stato IN ('DA_PAGARE', 'SCADUTA')
    """, (oggi_str,))
    print(f"  ✓ ricalcolato stato stipendi non pagati (oggi = {oggi_str})")

    # ── Step 3: fix giorno_paga default in dipendenti.db ────────
    # dipendenti.db è un DB separato, non è lo stesso conn di foodcost.db
    DIPENDENTI_DB = Path(__file__).resolve().parent.parent / "data" / "dipendenti.db"
    if DIPENDENTI_DB.exists():
        dip_conn = sqlite3.connect(str(DIPENDENTI_DB))
        try:
            dip_cur = dip_conn.cursor()
            # Verifica che la colonna esista
            cols = [r[1] for r in dip_cur.execute("PRAGMA table_info(dipendenti)").fetchall()]
            if "giorno_paga" not in cols:
                print("  ⚠ dipendenti.giorno_paga non presente, skip step 3")
            else:
                dip_cur.execute(
                    "UPDATE dipendenti SET giorno_paga = 15 WHERE giorno_paga = 27"
                )
                count = dip_cur.rowcount
                dip_conn.commit()
                print(f"  ~ dipendenti.giorno_paga: {count} righe aggiornate (27 → 15)")
        finally:
            dip_conn.close()
    else:
        print(f"  ⚠ dipendenti.db non trovato a {DIPENDENTI_DB}")

    print("  ✓ mig 064 fix stipendi data_scadenza completata")
