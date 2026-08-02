# Modulo: vini (sub-modulo carta bevande) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 157 — Birre: flag analcolica / 0.0 (sessione 2026-08-02)

Aggiunge alla tabella bevande_voci (DB separato app/data/bevande.sqlite3) una
colonna nuova, gemella di gluten_free (mig 106):

- analcolica  INTEGER DEFAULT 0 → flag 0/1 per le birre analcoliche (0 alcool).

In carta produce un badge "0.0" in brand-blue accanto al nome (stesso pattern
del badge GF verde) piu' una voce di legenda "0.0 = analcolica" in coda alla
sezione. Reso su tutti e tre gli output: HTML web (CartaClienti), HTML preview
server-side e DOCX/PDF.

Aggiorna inoltre lo schema_form della sezione 'birre' aggiungendo la checkbox
"Analcolica (0 alcool)" subito dopo "Gluten free", cosi' che l'editor in
/vini/carta/birre la mostri nel form di creazione/modifica voce.

Nota: la riga meta della scheda salta gia' la gradazione quando vale 0/0.0,
quindi per una birra analcolica non compare un inutile "0,0%": l'informazione
la porta il badge.

Idempotente: ADD COLUMN protetto da controllo su PRAGMA table_info (sqlite3 non
ha "IF NOT EXISTS" su ALTER TABLE), UPDATE schema_form sovrascrive con la nuova
versione.

Riferimento: docs/carta_bevande_design.md
DB toccato: app/data/bevande.sqlite3 (NON foodcost.db). conn ricevuta non usata.
"""

import json
import sqlite3

from app.models.bevande_db import get_bevande_conn, init_bevande_db


def _column_exists(cur: sqlite3.Cursor, table: str, column: str) -> bool:
    rows = cur.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


# Schema form aggiornato per la sezione 'birre' — 106 + checkbox analcolica.
# Copia esplicita per essere autosufficiente: se in futuro
# bevande_db._SCHEMA_FORM cambia ancora, questa migration resta il punto di
# verita' di "com'era a 157".
_BIRRE_SCHEMA_FORM_157 = {
    "fields": [
        {"key": "nome",         "label": "Nome",                "type": "text",     "required": True},
        {"key": "sottotitolo",  "label": "Stile (IPA, Stout…)", "type": "text"},
        {"key": "produttore",   "label": "Birrificio",          "type": "text"},
        {"key": "formato",      "label": "Formato",             "type": "text", "placeholder": "33ml"},
        {"key": "gradazione",   "label": "Gradazione % alc",    "type": "number", "step": 0.1},
        {"key": "ibu",          "label": "IBU",                 "type": "number"},
        {"key": "gluten_free",  "label": "Gluten free",         "type": "checkbox",
         "help": "Spunta se la birra è senza glutine: comparirà un badge GF in carta."},
        {"key": "analcolica",   "label": "Analcolica (0 alcool)", "type": "checkbox",
         "help": "Spunta se la birra è analcolica: comparirà un badge 0.0 in carta."},
        {"key": "descrizione",  "label": "Descrizione",         "type": "textarea", "rows": 3},
        {"key": "abbinamenti",  "label": "Abbinamenti consigliati",
         "type": "textarea", "rows": 2,
         "placeholder": "Hamburger, fish & chips, pizze rustiche…",
         "help": "Suggerimenti dei piatti che si abbinano bene. Compaiono in carta sotto la descrizione."},
        {"key": "prezzo_eur",   "label": "Prezzo €",            "type": "number", "step": 0.5},
        {"key": "note_interne", "label": "Note interne",        "type": "textarea", "rows": 2},
    ]
}


def upgrade(conn: sqlite3.Connection) -> None:
    """Lavora SOLO su bevande.sqlite3. La conn passata (foodcost.db) non viene usata."""
    # Safety net: assicura che lo schema base esista.
    init_bevande_db()

    bconn = get_bevande_conn()
    try:
        cur = bconn.cursor()

        # ── ADD COLUMN analcolica ──
        if not _column_exists(cur, "bevande_voci", "analcolica"):
            cur.execute(
                "ALTER TABLE bevande_voci ADD COLUMN analcolica INTEGER NOT NULL DEFAULT 0"
            )
            print("  [157] bevande_voci.analcolica aggiunta")
        else:
            print("  [157] bevande_voci.analcolica già presente, skip")

        # ── UPDATE schema_form della sezione 'birre' ──
        cur.execute(
            """
            UPDATE bevande_sezioni
               SET schema_form = ?,
                   updated_at = datetime('now','localtime')
             WHERE key = 'birre'
            """,
            (json.dumps(_BIRRE_SCHEMA_FORM_157, ensure_ascii=False),),
        )
        if cur.rowcount:
            print("  [157] schema_form sezione 'birre' aggiornato (analcolica)")
        else:
            print("  [157] sezione 'birre' non trovata, schema_form non aggiornato")

        bconn.commit()
    finally:
        bconn.close()
