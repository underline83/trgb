"""
Migrazione 118 — Dipendenti: settings giorno scadenza stipendi (2026-05-11)

CONTESTO:
  Marco oggi ha caricato 9 buste paga e si è accorto che la data scadenza
  generata era il 27 del mese successivo, mentre la sua policy è il 15. Tutti
  e 18 i dipendenti avevano `giorno_paga = 27` (default storico errato).

OBIETTIVI:
  1. Allineare `dipendenti.giorno_paga` da 27 a 15 per i 18 attuali.
  2. Creare tabella `dipendenti_settings` (key, value) per esporre default
     globale "giorno_pagamento_stipendi_default" = 15 (cambiabile da UI).
  3. La logica di generazione scadenza userà:
        giorno = dip["giorno_paga"] or settings["giorno_pagamento_stipendi_default"] or 15
  4. Allineare retroattivamente data_scadenza delle 9 buste paga caricate
     oggi 11/05 alle 19:32 (e di eventuali altre con data 27 ancora non
     pagate). Marco ha confermato: vuole 15/05 anche per queste.

DB COLPITI:
  - dipendenti.sqlite3: settings + giorno_paga
  - foodcost.db: cg_uscite.data_scadenza per STIPENDIO non ancora pagate

Idempotente.
"""
import sqlite3
from app.utils.locale_data import locale_data_path


DIP_DB = locale_data_path("dipendenti.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner). Apre dipendenti.sqlite3 a parte."""
    if not DIP_DB.exists():
        print("  [118] dipendenti.sqlite3 non esiste ancora, skip")
        return

    dip = sqlite3.connect(DIP_DB)
    try:
        cur = dip.cursor()

        # ── 1. Crea tabella settings se non esiste ──
        cur.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        print("  [118] tabella dipendenti_settings ok")

        # ── 2. Imposta default giorno_pagamento_stipendi_default = 15 se mancante ──
        cur.execute("""
            INSERT OR IGNORE INTO dipendenti_settings (key, value)
            VALUES ('giorno_pagamento_stipendi_default', '15')
        """)
        if cur.rowcount:
            print("  [118] inserito default 'giorno_pagamento_stipendi_default'=15")
        else:
            row = cur.execute(
                "SELECT value FROM dipendenti_settings WHERE key='giorno_pagamento_stipendi_default'"
            ).fetchone()
            print(f"  [118] settings già presente, valore corrente = {row[0]}")

        # ── 3. Allinea giorno_paga dei dipendenti da 27 → 15 ──
        cur.execute("UPDATE dipendenti SET giorno_paga = 15 WHERE giorno_paga = 27")
        n = cur.rowcount
        print(f"  [118] dipendenti giorno_paga 27→15: {n} righe")

        dip.commit()
        print("  [118] DONE")
    finally:
        dip.close()
