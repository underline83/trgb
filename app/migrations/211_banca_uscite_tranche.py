# Modulo: banca
"""
Migration 211 — Uscite dirette pagate in più bonifici (tranche).

## Perché

`cg_uscite.banca_movimento_id` è una colonna sola: un'uscita SENZA fattura
(stipendio, affitto, rata, spesa fissa) poteva essere collegata a un solo
movimento bancario. Le fatture no — hanno `banca_fatture_link` con
`importo_applicato` (mig 172) e si chiudono al secondo bonifico.
Caso reale 2026-10-23: lo stipendio di gennaio di Ekaterina Beretta
(3.339,46 €) pagato in due bonifici da 1.669,73 € (17/02 e 22/10): il
secondo veniva rifiutato con «Uscita già collegata o non trovata».
Limite documentato in docs/modulo_banca.md §6.5. Decisione Marco
2026-10-23: «sistema».

## Cosa fa

Crea `banca_uscite_link`: una riga per ogni movimento che paga una quota di
un'uscita diretta, con `importo_applicato`. Si usa SOLO quando un'uscita ha
più di un movimento: al secondo bonifico si scrive la riga del primo (con
l'importo già pagato) e quella del nuovo. Le uscite con un solo movimento
restano come prima (solo `banca_movimento_id`), quindi niente da migrare.
`banca_movimento_id` resta al PRIMO movimento, come per le fatture.

Idempotente: CREATE TABLE IF NOT EXISTS, indice creato solo se manca.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS banca_uscite_link (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            movimento_id      INTEGER NOT NULL,
            uscita_id         INTEGER NOT NULL,
            importo_applicato REAL    NOT NULL,
            created_at        TEXT    DEFAULT (datetime('now')),
            UNIQUE (movimento_id, uscita_id)
        )
        """
    )
    if not cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_banca_uscite_link_uscita'"
    ).fetchone():
        cur.execute(
            "CREATE INDEX idx_banca_uscite_link_uscita ON banca_uscite_link(uscita_id)"
        )
    print("  = banca_uscite_link pronta (tranche delle uscite dirette)")
    conn.commit()
