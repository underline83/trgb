# Modulo: vini (ordini ai fornitori) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 158 — Ordini ai fornitori: testata + righe (sessione 2026-08-02)

Crea in `vini_magazzino.sqlite3` le due tabelle che oggi mancano:

- `vini_ordini`        testata: un ordine = un fornitore + uno stato + una data
- `vini_ordini_righe`  le bottiglie ordinate, con qta ordinata E ricevuta

PERCHE' SERVE (vedi docs/modulo_vini_ordini.md §2):
Fino a oggi esisteva solo `vini_ordini_pending`, con `UNIQUE(vino_id)`: una
riga per vino, nessuna testata, nessuno stato, nessuna data di invio. E alla
conferma dell'arrivo il record veniva CANCELLATO, quindi dello storico ordini
non restava niente: impossibile sapere cosa si e' ordinato a un distributore,
quando, e quanto ci ha messo ad arrivare.

SCELTE DI SCHEMA:
- `fornitore_nome` e' DENORMALIZZATO sulla testata e `descrizione`/`prezzo_unit`
  sono SNAPSHOT sulla riga. Un ordine e' un documento storico: deve restare
  leggibile anche se il vino viene cancellato o il listino cambia. Senza lo
  snapshot, riaprire un ordine di marzo mostrerebbe i prezzi di oggi.
- `qta_ricevuta` sta sulla RIGA, non sulla testata: e' l'unico modo di
  gestire un arrivo parziale (ordini 6 bottiglie, ne arrivano 4).
- NESSUN vincolo UNIQUE sul vino: lo stesso vino puo' stare in un ordine
  chiuso di marzo e in una bozza di oggi. E' esattamente cio' che mancava.
- Stato `annullato` incluso: "ho ordinato e poi ho disdetto" oggi si risolve
  cancellando il record, cioe' perdendo di nuovo l'informazione.
- `ON DELETE SET NULL` sul fornitore e non CASCADE: se un distributore viene
  fuso o cancellato dall'anagrafica, i suoi ordini passati NON devono sparire.
  Restano leggibili grazie a `fornitore_nome`.

COSA NON FA:
Non tocca `vini_ordini_pending`, che resta viva e in uso finche' la nuova UI
non e' completa. Il travaso dei pending residui in bozze e il drop della
vecchia tabella sono una migrazione separata, da fare solo a UI verificata in
produzione (memoria `feedback_no_blocchi_accoppiati`: mai due cambiamenti
infrastrutturali nello stesso push).

Idempotente: ogni CREATE e' protetto da un controllo su sqlite_master
(`CREATE TABLE IF NOT EXISTS` non basterebbe a rendere idempotenti gli indici
su una tabella che potrebbe essere stata creata a mano in un test).

DB toccato: vini_magazzino.sqlite3 (NON foodcost.db). La conn ricevuta dal
runner non viene usata.
"""

import sqlite3

from app.models.vini_magazzino_db import get_magazzino_connection


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    row = cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def upgrade(conn: sqlite3.Connection) -> None:
    """Lavora SOLO su vini_magazzino.sqlite3. La conn passata non viene usata."""
    vconn = get_magazzino_connection()
    try:
        cur = vconn.cursor()

        # ── 1. Testata ────────────────────────────────────────
        if not _table_exists(cur, "vini_ordini"):
            cur.execute("""
                CREATE TABLE vini_ordini (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    fornitore_id   INTEGER,
                    fornitore_nome TEXT NOT NULL,
                    stato          TEXT NOT NULL DEFAULT 'bozza'
                                   CHECK (stato IN ('bozza','inviato','parziale','chiuso','annullato')),
                    canale         TEXT,
                    data_invio     TEXT,
                    data_chiusura  TEXT,
                    note           TEXT,
                    utente         TEXT,
                    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (fornitore_id) REFERENCES vini_fornitori(id) ON DELETE SET NULL
                )
            """)
            cur.execute("CREATE INDEX idx_vo_fornitore ON vini_ordini (fornitore_id, stato)")
            cur.execute("CREATE INDEX idx_vo_stato ON vini_ordini (stato, data_invio DESC)")
            # Un solo ordine in bozza per fornitore: e' la regola operativa
            # ("un fornitore, un carrello aperto") ed evita che due click
            # ravvicinati su "+ ordina" creino due bozze concorrenti.
            # Indice UNIQUE PARZIALE: vincola solo le bozze, gli ordini
            # inviati/chiusi dello stesso fornitore restano liberi di essere N.
            cur.execute(
                "CREATE UNIQUE INDEX idx_vo_una_bozza "
                "ON vini_ordini (fornitore_nome) WHERE stato = 'bozza'"
            )
            print("  [158] CREATE TABLE vini_ordini")
        else:
            print("  [158] vini_ordini già esistente, skip")

        # ── 2. Righe ──────────────────────────────────────────
        if not _table_exists(cur, "vini_ordini_righe"):
            cur.execute("""
                CREATE TABLE vini_ordini_righe (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    ordine_id    INTEGER NOT NULL,
                    vino_id      INTEGER NOT NULL,
                    descrizione  TEXT NOT NULL,
                    annata       TEXT,
                    qta_ordinata INTEGER NOT NULL CHECK (qta_ordinata > 0),
                    qta_ricevuta INTEGER NOT NULL DEFAULT 0 CHECK (qta_ricevuta >= 0),
                    prezzo_unit  REAL,
                    note         TEXT,
                    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (ordine_id) REFERENCES vini_ordini(id) ON DELETE CASCADE,
                    FOREIGN KEY (vino_id)   REFERENCES vini_bottiglie(id) ON DELETE CASCADE
                )
            """)
            cur.execute("CREATE INDEX idx_vor_ordine ON vini_ordini_righe (ordine_id)")
            cur.execute("CREATE INDEX idx_vor_vino ON vini_ordini_righe (vino_id)")
            # Lo stesso vino non puo' comparire due volte NELLO STESSO ordine
            # (si aumenta la quantita' della riga esistente, non se ne crea
            # un'altra). Fra ordini diversi nessun vincolo: e' il punto.
            cur.execute(
                "CREATE UNIQUE INDEX idx_vor_ordine_vino "
                "ON vini_ordini_righe (ordine_id, vino_id)"
            )
            print("  [158] CREATE TABLE vini_ordini_righe")
        else:
            print("  [158] vini_ordini_righe già esistente, skip")

        vconn.commit()
    finally:
        vconn.close()
