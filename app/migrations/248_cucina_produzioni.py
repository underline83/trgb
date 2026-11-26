# Modulo: cucina (registro produzioni e codice lotto) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 248 — Produzioni e codice lotto (2026-11-26)

Contesto (Marco, 26/11): un codice lotto di 6 caratteri che il pubblico non capisce e
che TRGB rilegge in data di produzione, persona e numero produzione; nasce da una
pagina nuova «Produzioni» in Cucina (non dalle Scorte), che salva nel registro e
stampa l'etichetta.

Tabelle nuove in foodcost.db: cucina_produzioni_persone, cucina_produzioni
(schema e commenti in app/models/cucina_produzioni_db.py).

Solo CREATE TABLE IF NOT EXISTS.
"""

import sqlite3

from app.models.cucina_produzioni_db import apply_schema


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    apply_schema(conn)
    print("  [248] cucina_produzioni e cucina_produzioni_persone pronte")
