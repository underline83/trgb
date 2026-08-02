# Modulo: vini (ordini ai fornitori) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 159 — Travaso di `vini_ordini_pending` nel modello ordini (2026-08-02)

Sposta gli ordini pending ancora aperti dentro `vini_ordini` + `vini_ordini_righe`
(migrazione 158) e svuota la vecchia tabella.

PERCHE' SUBITO E NON DOPO
Il piano (docs/modulo_vini_ordini.md §O4) prevedeva di tenere vivo il vecchio
sistema finche' la nuova UI non fosse verificata in produzione. La review del
codice ha mostrato che la convivenza e' peggio del travaso:

1. Un vino con un pending aperto ha `STATO_RIORDINO='0'` (Ordinato) e quindi
   ricompare nella lista "da ordinare" della pagina nuova SENZA alcun segnale
   che sia gia' stato ordinato: si riordina la stessa merce due volte.
2. Confermando l'arrivo da tutt'e due i sistemi, `QTA_TOTALE` viene incrementata
   DUE volte, con due movimenti CARICO indistinguibili nello storico.
3. Da quando la dashboard rimanda alla pagina nuova, i pending residui non sono
   piu' ne' modificabili ne' chiudibili da nessuna schermata: restano nel DB a
   fare da mina, pronti a sparare un carico fantasma quando qualcuno rimette il
   vino in stato 'D'.

Al 2026-08-02 i pending aperti in produzione sono 2 (3 bottiglie in totale):
un travaso minuscolo, il momento migliore per farlo e' adesso.

COME
Ogni pending diventa un ordine a se' in stato 'inviato' (era gia' partito: e'
esattamente cio' che 'pending' significava), con `data_invio` = `data_ordine`
originale e `canale='manuale'`. La riga porta gli stessi snapshot che userebbe
il modello nuovo. Poi il pending viene cancellato.

NON droppa `vini_ordini_pending`: la tabella resta, vuota, insieme ai suoi
endpoint. Droppare tabella + endpoint + codice frontend nello stesso push
sarebbe il "blocco accoppiato" che la memoria `feedback_no_blocchi_accoppiati`
vieta. La rimozione e' censita in docs/inventario_pulizia.md.

Idempotente: se non ci sono pending non fa niente. Se rigirata dopo un travaso
riuscito, la tabella e' vuota e la migrazione e' un no-op.

DB toccato: vini_magazzino.sqlite3. La conn ricevuta dal runner non e' usata.
"""

import sqlite3

from app.models.vini_magazzino_db import get_magazzino_connection


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    return cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    vconn = get_magazzino_connection()
    vconn.row_factory = sqlite3.Row
    try:
        cur = vconn.cursor()

        for t in ("vini_ordini", "vini_ordini_righe"):
            if not _table_exists(cur, t):
                print(f"  [159] {t} assente: la 158 non è girata, salto il travaso")
                return
        if not _table_exists(cur, "vini_ordini_pending"):
            print("  [159] vini_ordini_pending assente, niente da travasare")
            return

        pendenti = cur.execute(
            """
            SELECT p.id, p.vino_id, p.qta, p.data_ordine, p.note, p.utente,
                   b.DESCRIZIONE, b.ANNATA, b.EURO_LISTINO,
                   TRIM(COALESCE(b.DISTRIBUTORE, '')) AS distributore,
                   m.fornitore_id
              FROM vini_ordini_pending p
              LEFT JOIN vini_bottiglie b ON b.id = p.vino_id
              LEFT JOIN vini_madre     m ON m.id = b.madre_id
            """
        ).fetchall()

        if not pendenti:
            print("  [159] nessun ordine pending aperto, niente da fare")
            return

        creati = 0
        for p in pendenti:
            nome = p["distributore"] or "— Non assegnato"
            data = p["data_ordine"] or "1970-01-01T00:00:00"

            cur.execute(
                """INSERT INTO vini_ordini
                     (fornitore_id, fornitore_nome, stato, canale, data_invio,
                      note, utente, created_at, updated_at)
                   VALUES (?, ?, 'inviato', 'manuale', ?, ?, ?, ?, ?)""",
                (
                    p["fornitore_id"], nome, data,
                    ((p["note"] or "") + " (travasato da ordine pending #%s)" % p["id"]).strip(),
                    p["utente"], data, data,
                ),
            )
            ordine_id = cur.lastrowid

            prezzo = p["EURO_LISTINO"]
            try:
                prezzo = float(prezzo) if prezzo not in (None, "") else None
            except (TypeError, ValueError):
                prezzo = None

            cur.execute(
                """INSERT INTO vini_ordini_righe
                     (ordine_id, vino_id, descrizione, annata, qta_ordinata,
                      qta_ricevuta, prezzo_unit, created_at)
                   VALUES (?, ?, ?, ?, ?, 0, ?, ?)""",
                (
                    ordine_id, p["vino_id"],
                    p["DESCRIZIONE"] or f"Vino #{p['vino_id']}",
                    p["ANNATA"], int(p["qta"]), prezzo, data,
                ),
            )
            cur.execute("DELETE FROM vini_ordini_pending WHERE id = ?", (p["id"],))
            creati += 1
            print(f"  [159] pending #{p['id']} → ordine #{ordine_id} ({nome}, {p['qta']} bt)")

        vconn.commit()
        print(f"  [159] travasati {creati} ordini pending, tabella svuotata")
    finally:
        vconn.close()
