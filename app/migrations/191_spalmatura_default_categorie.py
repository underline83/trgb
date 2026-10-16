# Modulo: acquisti (categorie fornitori) — usato dal Conto Economico (controllo_gestione) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 191 — Spalmatura di default per categoria/sottocategoria (2026-10-16)

Marco 16/10/2026: «il vino lo setterei di base a 3 mesi». Decisione (opzione 2):
la regola vale per RIGA, non per fattura. Il Conto Economico spalma su N mesi
solo le righe la cui categoria effettiva (riga → fornitore, stessa gerarchia
del CE) ha un default; il resto della stessa fattura resta nel suo mese.

Campi nuovi su fe_categorie e fe_sottocategorie:
  spalmatura_mesi_default  INTEGER  NULL = nessuna regola (la sottocategoria
                                    eredita dalla categoria); 1 = «non spalmare»
                                    (serve per escludere una sottocategoria
                                    quando la categoria ha una regola); N>1 = N mesi
  spalmatura_valida_dal    TEXT     'YYYY-MM-01': la regola vale per le fatture
                                    con mese di competenza da qui in avanti,
                                    così i mesi già chiusi non cambiano

Priorità nel CE: spalmatura manuale della fattura > regola sottocategoria >
regola categoria > mese di competenza. La regola parte dal mese di competenza
della fattura (competenza_anno_mese o data_fattura).

Solo ADD COLUMN, idempotente. DB: foodcost.db.
"""


def upgrade(conn):
    for tabella in ("fe_categorie", "fe_sottocategorie"):
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({tabella})").fetchall()}
        for col, tipo in (("spalmatura_mesi_default", "INTEGER"),
                          ("spalmatura_valida_dal", "TEXT")):
            if col not in cols:
                try:
                    conn.execute(f"ALTER TABLE {tabella} ADD COLUMN {col} {tipo}")
                    print(f"  [191] aggiunta {tabella}.{col}")
                except Exception as e:  # già presente (corsa) → ok
                    print(f"  [191] {tabella}.{col}: {e}")
    conn.commit()
