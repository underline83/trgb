# Modulo: acquisti
"""
Migration 223 — Note di credito collegate alla fattura che stornano.

## Perché

Roadmap A.1 fase 3. Fino a oggi una nota di credito (TD04) non aveva nessun
effetto sui pagamenti: la fattura restava «da pagare» per l'intero anche
quando il fornitore ne aveva stornata una parte. Caso reale 2026-11-02:
Orobica Pesca, fattura 206649/FTM da 7.625,93 € pagata con RiBa da
7.621,12 € + nota di credito 101745/NCV da 4,81 € → la fattura restava
«parziale» per sempre. Decisione Marco 2026-11-02: «sistema».
Una NC NON collegata continua a non avere effetto in CG (decisione
2026-10-02); nel conto economico conta già col segno meno (fase 2).

## Cosa fa

Crea `fe_nc_collegamenti`: una riga per ogni quota di nota di credito
applicata a un'uscita (`cg_uscite`) di una fattura. L'importo della NC si
somma al pagato dell'uscita, come una tranche (vedi
`app/services/note_credito_service.py`).

Idempotente: CREATE TABLE IF NOT EXISTS, indici creati solo se mancano.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS fe_nc_collegamenti (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            nota_id     INTEGER NOT NULL,
            fattura_id  INTEGER NOT NULL,
            uscita_id   INTEGER NOT NULL,
            importo     REAL    NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now')),
            UNIQUE (nota_id, uscita_id)
        )
        """
    )
    for nome, col in (("idx_fe_nc_coll_fattura", "fattura_id"),
                      ("idx_fe_nc_coll_nota", "nota_id")):
        if not cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (nome,)
        ).fetchone():
            cur.execute(f"CREATE INDEX {nome} ON fe_nc_collegamenti({col})")
    print("  = fe_nc_collegamenti pronta (note di credito collegate alle fatture)")
    conn.commit()
