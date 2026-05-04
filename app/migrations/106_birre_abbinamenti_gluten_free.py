# Modulo: vini (sub-modulo carta bevande) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 106 — Birre: abbinamenti + flag gluten free (sessione 2026-05-04)

Aggiunge alla tabella bevande_voci (DB separato app/data/bevande.sqlite3) due
colonne nuove, utili in particolare alla sezione "birre" della Carta Bevande:

- abbinamenti  TEXT             → suggerimento testuale dei piatti che la birra
                                  accompagna bene ("amaca con hamburger, fish &
                                  chips, pizze rustiche").
- gluten_free  INTEGER DEFAULT 0 → flag 0/1 per le birre senza glutine.

Aggiorna inoltre lo schema_form della sezione 'birre' aggiungendo i due nuovi
campi (textarea + checkbox) cosi' che l'editor in /vini/carta/birre li mostri
nel form di creazione/modifica voce.

Idempotente: ADD COLUMN protetto da try/except (sqlite3 non ha "IF NOT EXISTS"
su ALTER TABLE), UPDATE schema_form sovrascrive con la nuova versione.

Le colonne sono generiche a livello DB: il rendering speciale (badge + sezione
Abbinamenti) si applica al layout 'scheda_estesa' usato dalla sezione birre,
ma i campi restano disponibili anche per altre sezioni se in futuro servono.

Riferimento: docs/carta_bevande_design.md
DB toccato: app/data/bevande.sqlite3 (NON foodcost.db). conn ricevuta non usata.
"""

import json
import sqlite3

from app.models.bevande_db import get_bevande_conn, init_bevande_db


def _column_exists(cur: sqlite3.Cursor, table: str, column: str) -> bool:
    rows = cur.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


# Schema form aggiornato per la sezione 'birre' — aggiunge abbinamenti + gluten_free.
# Tenuto qui come copia esplicita per essere autosufficiente: se in futuro
# bevande_db._SCHEMA_FORM cambia ancora, questa migration resta il punto di
# verita' di "com'era a 106".
_BIRRE_SCHEMA_FORM_106 = {
    "fields": [
        {"key": "nome",         "label": "Nome",                "type": "text",     "required": True},
        {"key": "sottotitolo",  "label": "Stile (IPA, Stout…)", "type": "text"},
        {"key": "produttore",   "label": "Birrificio",          "type": "text"},
        {"key": "formato",      "label": "Formato",             "type": "text", "placeholder": "33ml"},
        {"key": "gradazione",   "label": "Gradazione % alc",    "type": "number", "step": 0.1},
        {"key": "ibu",          "label": "IBU",                 "type": "number"},
        {"key": "gluten_free",  "label": "Gluten free",         "type": "checkbox",
         "help": "Spunta se la birra è senza glutine: comparirà un badge GF in carta."},
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
    # Safety net: assicura che lo schema base esista (in caso 089 non sia ancora
    # girato in qualche dev locale).
    init_bevande_db()

    bconn = get_bevande_conn()
    try:
        cur = bconn.cursor()

        # ── ADD COLUMN abbinamenti ──
        if not _column_exists(cur, "bevande_voci", "abbinamenti"):
            cur.execute("ALTER TABLE bevande_voci ADD COLUMN abbinamenti TEXT")
            print("  [106] bevande_voci.abbinamenti aggiunta")
        else:
            print("  [106] bevande_voci.abbinamenti già presente, skip")

        # ── ADD COLUMN gluten_free ──
        if not _column_exists(cur, "bevande_voci", "gluten_free"):
            cur.execute(
                "ALTER TABLE bevande_voci ADD COLUMN gluten_free INTEGER NOT NULL DEFAULT 0"
            )
            print("  [106] bevande_voci.gluten_free aggiunta")
        else:
            print("  [106] bevande_voci.gluten_free già presente, skip")

        # ── UPDATE schema_form della sezione 'birre' ──
        cur.execute(
            """
            UPDATE bevande_sezioni
               SET schema_form = ?,
                   updated_at = datetime('now','localtime')
             WHERE key = 'birre'
            """,
            (json.dumps(_BIRRE_SCHEMA_FORM_106, ensure_ascii=False),),
        )
        if cur.rowcount:
            print(f"  [106] schema_form sezione 'birre' aggiornato (abbinamenti + gluten_free)")
        else:
            print("  [106] sezione 'birre' non trovata, schema_form non aggiornato")

        bconn.commit()
    finally:
        bconn.close()
