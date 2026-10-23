# Modulo: sito — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 210 — Visite del sito (2026-10-23)

Nasce `sito.sqlite3` (cartella dati del locale) con sito_eventi, sito_giorni,
sito_giorni_chiusi, sito_stato. Schema in app/models/sito_db.py (idempotente).
Il sito chiama POST /public/sito/evento con sendBeacon; nessun cookie, nessun IP
o User-Agent salvato. Doc: docs/modulo_sito.md.
"""

from app.models.sito_db import init_sito_db


def upgrade(conn):
    """conn = foodcost.db (ignorato): lo schema vive in sito.sqlite3."""
    init_sito_db()
    print("  + [210] sito.sqlite3: sito_eventi, sito_giorni, sito_giorni_chiusi, sito_stato")
