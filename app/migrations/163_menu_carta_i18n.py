"""
Migrazione 163 — Menu Carta multilingua: tabella traduzioni — [core]

Modulo: menu_carta

Aggiunge la dimensione lingua al modulo Menu Carta. L'italiano resta la lingua
madre e NON vive qui: sta nei campi originali (`menu_dish_publications.
titolo_override` / `descrizione_override`, `recipes.menu_name` /
`menu_description`, `menu_tasting_paths.sottotitolo` / `note`). Questa tabella
contiene SOLO le traduzioni.

Perche' una tabella e non delle colonne
---------------------------------------
L'alternativa scartata era `titolo_en`, `titolo_fr`, `descrizione_en`, ... su
`menu_dish_publications`: 6 lingue x 4 campi = 24 colonne, e ogni lingua nuova
o campo nuovo e' un ALTER TABLE su DB live. Con una tabella di traduzione
aggiungere l'ucraino e' un INSERT, e la stessa tabella serve piatti,
degustazioni ed edizioni senza duplicare nulla.

Nome tabella: `menu_translations` (deciso con Marco, 2026-08-07)
---------------------------------------------------------------
La regola 3 del CLAUDE.md prescrive il prefisso `<modulo>_*`, che per
`menu_carta` sarebbe `menu_carta_*`. Ma le 4 tabelle gia' a DB del modulo
(mig 098) usano tutte il prefisso `menu_`: menu_editions,
menu_dish_publications, menu_tasting_paths, menu_tasting_path_steps.
Il prefisso REALE del modulo menu_carta e' quindi `menu_`, e questa tabella lo
rispetta. A R8 il `module.json` di menu_carta dichiarera' `menu_*` come suo
prefisso di tabelle — un prefisso solo, non due.

Struttura
---------
Chiave logica (entita, entita_id, lang, campo) -> valore.
  entita : 'publication' | 'tasting_path' | 'edition'
  campo  : 'titolo' | 'descrizione' | 'sottotitolo' | 'note' | 'prezzo_label'
           | 'storia'
  rivisto: 0 = entrata col seed / bozza, 1 = approvata da Marco dal backoffice.
           Serve a distinguere cio' che e' stato letto da un umano da cio' che
           e' stato importato in blocco. La pagina pubblica NON filtra su
           questo campo: mostra anche le non riviste, perche' una traduzione
           non ancora approvata resta meglio dell'italiano per chi non lo legge.

Niente FOREIGN KEY verso menu_dish_publications: `entita_id` e' polimorfico
(punta a tabelle diverse a seconda di `entita`), quindi un vincolo FK non e'
esprimibile. La pulizia delle righe orfane e' a carico del router quando
cancella una publication.

Idempotenza
-----------
Solo CREATE TABLE IF NOT EXISTS e CREATE INDEX IF NOT EXISTS.
Nessun DROP, nessun RENAME, nessun ALTER su tabelle esistenti.
Rilanciarla su DB live e' un no-op.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS menu_translations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entita      TEXT    NOT NULL,   -- 'publication'|'tasting_path'|'edition'
            entita_id   INTEGER NOT NULL,
            lang        TEXT    NOT NULL,   -- 'en'|'fr'|'es'|'de'|'uk' (mai 'it')
            campo       TEXT    NOT NULL,   -- 'titolo'|'descrizione'|'sottotitolo'
                                            -- |'note'|'prezzo_label'|'storia'
            valore      TEXT    NOT NULL,
            rivisto     INTEGER NOT NULL DEFAULT 0,
            updated_at  TEXT    DEFAULT (datetime('now')),

            UNIQUE (entita, entita_id, lang, campo)
        )
    """)

    # Indice di lettura: la pagina pubblica carica in una query sola tutte le
    # traduzioni di una lingua per la lista di publication dell'edizione in
    # carta. Senza questo e' una scansione piena a ogni scansione di QR.
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_menu_translations_lookup
        ON menu_translations(entita, entita_id, lang)
    """)

    # Indice di copertura: "quante righe tradotte ho in EN?" dal backoffice.
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_menu_translations_lang
        ON menu_translations(lang)
    """)

    conn.commit()
    print("  [163] menu_translations creata (+2 indici) — Menu Carta multilingua")
