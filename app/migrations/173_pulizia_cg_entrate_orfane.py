# Modulo: banca
"""
Migration 173 — Via le 65 entrate POS rimaste appese a movimenti cancellati.

## Come sono nate

Il 31/03/2026, alle 20:40 e 20:41, gli incassi POS di febbraio e marzo sono
stati registrati in blocco dal cross-ref. Alle **21:15 dello stesso giorno** è
girata la migrazione 046, che ripuliva i movimenti bancari entrati due volte da
un doppio import CSV. La 046 sapeva spostare `cg_uscite` e `banca_fatture_link`
dal duplicato al keeper, ma **non `cg_entrate`** — quella tabella era nata il
giorno prima (mig 044) e nessuno l'aveva aggiunta. Cancellati i movimenti
duplicati, 65 entrate sono rimaste puntate a righe che non esistono più. La
migrazione 058, tre settimane dopo, ha imparato a gestirle: troppo tardi.

## Perché si possono cancellare

Ognuna delle 65 ha una **gemella valida**: stessa data, stesso importo,
collegata al movimento sopravvissuto. Sono copie morte, non incassi persi —
58.433,66 € che non risultano da nessuna parte perché `cg_entrate` è letta solo
dal modulo Banca, e queste righe non compaiono nemmeno lì (la worklist parte dai
movimenti, e il loro movimento non c'è). L'unico effetto pratico è il rumore nel
`foreign_key_check` del DB, che sporca ogni audit.

Il caso era stato visto il 2026-07-10 (audit FK, sessione 3) e lasciato lì
perché non si era ancora verificato che fossero doppioni. Verificato il
2026-09-08, Marco ha chiesto di ripulire.

## Prudenza

La migrazione **non cancella al buio**: per ogni orfana cerca la gemella e la
cancella solo se la trova. Un'orfana senza gemella verrebbe conservata e
segnalata a video — sarebbe un incasso davvero registrato una volta sola, da
guardare a mano. Idempotente: alla seconda esecuzione non trova più nulla.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> int:
    cur = conn.cursor()

    try:
        orfane = cur.execute("""
            SELECT e.id, e.data_entrata, e.importo, e.categoria, e.banca_movimento_id
              FROM cg_entrate e
             WHERE e.banca_movimento_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM banca_movimenti m
                                WHERE m.id = e.banca_movimento_id)
        """).fetchall()
    except sqlite3.OperationalError:
        print("  Migrazione 173: cg_entrate o banca_movimenti assenti — niente da fare")
        return 0

    if not orfane:
        print("  Migrazione 173: nessuna entrata orfana (già ripulite)")
        return 0

    da_cancellare, senza_gemella = [], []
    for eid, data, importo, categoria, mov_morto in orfane:
        gemella = cur.execute("""
            SELECT e2.id FROM cg_entrate e2
             WHERE e2.id != ?
               AND e2.data_entrata = ?
               AND ABS(e2.importo - ?) < 0.01
               AND e2.banca_movimento_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM banca_movimenti m WHERE m.id = e2.banca_movimento_id)
             LIMIT 1
        """, (eid, data, importo)).fetchone()
        if gemella:
            da_cancellare.append((eid, data, importo, gemella[0]))
        else:
            senza_gemella.append((eid, data, importo, categoria, mov_morto))

    if da_cancellare:
        cur.executemany(
            "DELETE FROM cg_entrate WHERE id = ?",
            [(r[0],) for r in da_cancellare],
        )
        tot = sum(r[2] for r in da_cancellare)
        print(f"  Migrazione 173: cancellate {len(da_cancellare)} entrate doppie "
              f"(€ {tot:,.2f}), ognuna con la sua gemella valida")

    if senza_gemella:
        print(f"  ⚠ {len(senza_gemella)} entrate orfane SENZA gemella: conservate, "
              f"da guardare a mano")
        for eid, data, importo, categoria, mov in senza_gemella[:10]:
            print(f"     · id {eid} · {data} · € {importo:,.2f} · {categoria} "
                  f"· puntava al movimento {mov}")

    conn.commit()
    return len(da_cancellare)
