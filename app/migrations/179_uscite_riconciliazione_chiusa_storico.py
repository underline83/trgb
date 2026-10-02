# Modulo: controllo_gestione
"""
Migration 179 — Chiude come PAGATO lo storico pre-estratti bancari.

## Perché

Il KPI «Da riconciliare» dello Scadenzario conta le uscite PAGATO_MANUALE
senza `banca_movimento_id`. Al 2026-10-02 erano ~1.300, ma ~1.200 erano
fatture/rate precedenti al primo estratto del conto corrente caricato in TRGB:
non potranno mai essere riconciliate perché gli estratti vecchi non verranno
importati. Decisione Marco 2026-10-02: «mettile chiuse come la banca, senza
fare un altro flag — è come se lo fossero».

## Cosa fa

PAGATO_MANUALE senza movimento, con data documento (data_fattura →
data_scadenza → periodo) anteriore al primo movimento del conto corrente
(carta esclusa) → `stato = 'PAGATO'`, con una nota in coda. La soglia è
ricavata dai dati, non scritta nel codice. Nessuna colonna nuova.

Idempotente: tocca solo PAGATO_MANUALE.
"""

import sqlite3

NOTA = "[Chiusa: storico anteriore agli estratti bancari in TRGB]"


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    try:
        row = cur.execute(
            "SELECT MIN(data_contabile) FROM banca_movimenti WHERE banca NOT LIKE 'CARTA_%'"
        ).fetchone()
    except sqlite3.OperationalError:
        row = None
    soglia = row[0][:10] if row and row[0] else None
    if not soglia:
        print("  = nessun movimento bancario: nulla da chiudere")
        return

    cur.execute(
        """
        UPDATE cg_uscite
           SET stato = 'PAGATO',
               note = CASE WHEN note IS NULL OR note = '' THEN ?
                           ELSE note || ' ' || ? END,
               updated_at = datetime('now')
         WHERE stato = 'PAGATO_MANUALE'
           AND banca_movimento_id IS NULL
           AND COALESCE(data_fattura, data_scadenza,
                        CASE WHEN periodo_riferimento IS NOT NULL
                             THEN substr(periodo_riferimento, 1, 7) || '-01' END) < ?
        """,
        (NOTA, NOTA, soglia),
    )
    print(f"  = storico < {soglia}: {cur.rowcount} uscite PAGATO_MANUALE → PAGATO")
    conn.commit()
