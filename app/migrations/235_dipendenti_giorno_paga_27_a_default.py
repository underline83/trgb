"""
Migrazione 235 — Dipendenti: giorno di paga 27 → default di Impostazioni (2026-11-16)

Modulo: dipendenti  ·  [core]  ·  Doc: docs/modulo_dipendenti.md

CONTESTO:
  Marco 16/11: «di base tutte le buste paga le mettiamo al 15». Gli stipendi
  di ottobre di Paolo Nicoli e Giulia Spuri scadevano il 27/11 invece del
  15/11 ed erano rimasti fuori dalla distinta del 13/11.

  Causa: la colonna `dipendenti.giorno_paga` ha DEFAULT 27 nello schema
  (default storico sbagliato). La mig 118 (maggio) aveva portato a 15 i
  dipendenti di allora, ma la creazione da Anagrafica non passava il campo:
  chi e' nato dopo (Nicoli, Spuri, Verderio) ha preso 27, e il default 15 di
  Impostazioni non scattava perche' il campo non era vuoto. La causa e'
  tolta nel codice (dipendenti._giorno_paga_default: ogni INSERT passa il
  valore di Impostazioni).

AZIONE (idempotente):
  1. foodcost.db — gli stipendi NON pagati di quei dipendenti, con scadenza
     al giorno 27 e mai spostati a mano (data_scadenza_originale vuota),
     passano al giorno di Impostazioni dello stesso mese. Non diventano
     SPOSTATI: e' una correzione, non una data rinegoziata.
  2. dipendenti.sqlite3 — giorno_paga 27 → valore di Impostazioni.
  L'ordine conta: prima le scadenze (che trovano i dipendenti dal 27), poi
  l'anagrafica. Re-run: nessun dipendente a 27 → no-op.
"""
import sqlite3

from app.utils.locale_data import locale_data_path

DIP_DB = locale_data_path("dipendenti.sqlite3")
GIORNO_SBAGLIATO = 27  # il DEFAULT storico della colonna, da correggere


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner). Apre dipendenti.sqlite3 a parte."""
    if not DIP_DB.exists():
        print("  [235] dipendenti.sqlite3 non esiste, skip")
        return

    dip = sqlite3.connect(DIP_DB)
    try:
        row = dip.execute(
            "SELECT value FROM dipendenti_settings WHERE key = 'giorno_pagamento_stipendi_default'"
        ).fetchone()
        try:
            giorno = int(row[0]) if row else 15
        except (TypeError, ValueError):
            giorno = 15
        if giorno == GIORNO_SBAGLIATO:
            print(f"  [235] default di Impostazioni = {giorno}: niente da correggere")
            return

        dip_ids = [r[0] for r in dip.execute(
            "SELECT id FROM dipendenti WHERE giorno_paga = ?", (GIORNO_SBAGLIATO,)
        ).fetchall()]
        if not dip_ids:
            print("  [235] nessun dipendente col giorno di paga 27, no-op")
            return

        ph = ",".join("?" * len(dip_ids))
        uscite_ids = [r[0] for r in dip.execute(
            f"SELECT uscita_netto_id FROM buste_paga "
            f"WHERE dipendente_id IN ({ph}) AND uscita_netto_id IS NOT NULL",
            dip_ids,
        ).fetchall()]

        # ── 1. Scadenze stipendio non pagate (foodcost.db) ──
        n_uscite = 0
        if uscite_ids:
            ph_u = ",".join("?" * len(uscite_ids))
            cur = conn.execute(
                f"""
                UPDATE cg_uscite
                   SET data_scadenza = substr(data_scadenza, 1, 8) || printf('%02d', ?),
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id IN ({ph_u})
                   AND tipo_uscita = 'STIPENDIO'
                   AND substr(data_scadenza, 9, 2) = printf('%02d', ?)
                   AND data_scadenza_originale IS NULL
                   AND stato IN ('PROGRAMMATO', 'SCADUTO')
                   AND banca_movimento_id IS NULL
                   AND COALESCE(importo_pagato, 0) = 0
                """,
                [giorno, *uscite_ids, GIORNO_SBAGLIATO],
            )
            n_uscite = cur.rowcount or 0
            conn.commit()
        print(f"  [235] stipendi non pagati dal giorno 27 al {giorno}: {n_uscite}")

        # ── 2. Anagrafica (dipendenti.sqlite3) ──
        cur = dip.execute(
            f"UPDATE dipendenti SET giorno_paga = ? WHERE id IN ({ph}) AND giorno_paga = ?",
            [giorno, *dip_ids, GIORNO_SBAGLIATO],
        )
        dip.commit()
        print(f"  [235] dipendenti col giorno di paga 27 → {giorno}: {cur.rowcount} (id {dip_ids})")
    finally:
        dip.close()
    print("  [235] DONE")
