# Modulo: banca
"""
Migration 172 — Soglia del residuo di riconciliazione, configurabile.

## Perché

Fino a oggi il numero "1 euro" era scritto a mano in tre posti diversi:
  - `banca_router.get_cross_ref()` — sotto 1€ di residuo il movimento non
    cerca più suggerimenti;
  - `BancaCrossRef.jsx` `isFullyLinked` / `isPartiallyLinked` — sotto 1€ la
    riga finisce nel tab "Collegati";
  - nessun posto, per il caso opposto: un bonifico che paga MENO della
    fattura marcava comunque l'uscita `PAGATO` per l'intero (v. sotto).

In più `banca_fatture_link` guadagna `importo_applicato`: quanto di QUEL
movimento è finito su QUELLA fattura. Serve per i pagamenti in più tranche
(due bonifici sulla stessa fattura) e la chiedeva già `spec_riconciliazione.md`.
NULL = link storico, si assume il totale della fattura.

La soglia diventa un dato: `carta_match_settings.tolerance_residuo_eur`
(singleton id=1, la stessa riga che già tiene le tolleranze del match carta,
mig 141 + 142). Default 1.00 € = comportamento storico invariato.

Semantica: uno scarto sotto la soglia è arrotondamento (bollo, centesimi,
spese banca) e non produce né un residuo da assegnare né un pagamento
parziale. Sopra la soglia è una differenza vera e il sistema lo dice.

## Le 3 chiusure manuali sullo storico

Con il calcolo del residuo corretto (le uscite CG collegate entrano nel
totale collegato, e i parziali contano per `importo_pagato`), tre movimenti
storici uscirebbero dal tab "Collegati" e tornerebbero fra i lavorabili.
Sono chiusure volute, non dimenticanze:

  - mov 112 (-788,80 del 24/02) e mov 986 (-2032,22 del 02/04) sono i due
    bonifici parziali di Reepack e MALOWINE già trattati dalla mig 110:
    rateizzazioni chiuse fuori sistema, il link c'è, il resto non arriverà.
  - mov 285 (-1769,00 del 13/01) ha un residuo di 112,00 € accettato.

Marco (2026-09-08) ha scelto di marcarli chiusi qui invece di rivederli in
UI. La UPDATE è guardata su importo + data oltre che sull'id: se in
produzione quell'id fosse un altro movimento, la riga non viene toccata e
la migrazione lo dice a video.

ALTER TABLE idempotente. La colonna nasce nullable e viene riempita con una
UPDATE esplicita: su una tabella con righe già dentro, `ADD COLUMN ... NOT
NULL DEFAULT` è la strada che ha già rotto un `integrity_check` in passato
(incidente CC.5.a del 2026-06-02).
"""

import sqlite3

TOLLERANZA_DEFAULT = 1.00

# (id, importo atteso, data_contabile attesa, nota)
MOVIMENTI_DA_CHIUDERE = [
    (112, -788.80, "2026-02-24",
     "Bonifico parziale Reepack — rateizzazione chiusa fuori sistema (mig 110)"),
    (986, -2032.22, "2026-04-02",
     "Bonifico parziale MALOWINE — rateizzazione chiusa fuori sistema (mig 110)"),
    (285, -1769.00, "2026-01-13",
     "Residuo 112,00 € accettato (chiusura decisa il 2026-09-08)"),
]


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def upgrade(conn: sqlite3.Connection) -> int:
    cur = conn.cursor()

    # ── 0. Quota del movimento applicata al singolo link ─────────────────
    # `spec_riconciliazione.md` la chiedeva dal 2026-04-16 e non era mai stata
    # fatta: senza, due bonifici sulla stessa fattura non sono distinguibili e
    # ognuno sembra averla pagata per intero.
    # NULL = link storico, vale il totale della fattura (retrocompatibile).
    if not _column_exists(cur, "banca_fatture_link", "importo_applicato"):
        cur.execute(
            "ALTER TABLE banca_fatture_link ADD COLUMN importo_applicato REAL"
        )
        print("  + banca_fatture_link.importo_applicato")

    # ── 1. Soglia configurabile ──────────────────────────────────────────
    if not _column_exists(cur, "carta_match_settings", "tolerance_residuo_eur"):
        cur.execute(
            "ALTER TABLE carta_match_settings ADD COLUMN tolerance_residuo_eur REAL"
        )
        print("  + carta_match_settings.tolerance_residuo_eur")

    # Backfill esplicito (la colonna nasce nullable, v. docstring)
    cur.execute(
        "UPDATE carta_match_settings SET tolerance_residuo_eur = ? "
        "WHERE tolerance_residuo_eur IS NULL",
        (TOLLERANZA_DEFAULT,),
    )
    if cur.rowcount:
        print(f"  = tolerance_residuo_eur = {TOLLERANZA_DEFAULT:.2f} su {cur.rowcount} riga/e")

    # La riga singleton potrebbe non esistere (DB nuovo, boot prima del primo
    # salvataggio delle settings carta): in quel caso il service usa i DEFAULTS
    # e non c'è nulla da backfillare.

    # ── 2. Chiusure manuali sullo storico ────────────────────────────────
    try:
        cur.execute("PRAGMA table_info(banca_movimenti)")
        cols = {r[1] for r in cur.fetchall()}
    except sqlite3.OperationalError:
        cols = set()

    if "riconciliazione_chiusa" in cols:
        for mov_id, importo, data_c, nota in MOVIMENTI_DA_CHIUDERE:
            cur.execute(
                """
                UPDATE banca_movimenti
                   SET riconciliazione_chiusa = 1,
                       riconciliazione_chiusa_at = COALESCE(riconciliazione_chiusa_at, datetime('now')),
                       riconciliazione_chiusa_note = COALESCE(riconciliazione_chiusa_note, ?)
                 WHERE id = ?
                   AND ABS(importo - ?) < 0.01
                   AND data_contabile = ?
                   AND COALESCE(riconciliazione_chiusa, 0) = 0
                """,
                (nota, mov_id, importo, data_c),
            )
            if cur.rowcount:
                print(f"  🔒 mov {mov_id} ({importo:.2f} € del {data_c}) → riconciliazione chiusa")
            else:
                print(f"  · mov {mov_id}: già chiuso, assente o non corrispondente — non toccato")

    conn.commit()
    print("  Migrazione 172: soglia residuo configurabile + 3 chiusure storiche")
    return 1
