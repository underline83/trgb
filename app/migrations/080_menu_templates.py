"""
Migrazione 080: Libreria Menu Template riutilizzabili.

Contesto (sessione 39, feedback Marco):
- Dopo i menu multipli alternativi (mig 079), i menu ricorrenti (banchetti,
  compleanni, pranzi di lavoro) vanno salvati come TEMPLATE riutilizzabili
  su altri preventivi.
- Il template e' uno snapshot immutabile di righe + prezzo suggerito a persona
  (scelta Marco: prezzo incluso come default). Quando lo carichi su un menu
  di preventivo, le righe vengono COPIATE come snapshot: eventuali modifiche
  al template successive NON toccano i preventivi gia' compilati.
- Ogni template e' legato a un tipo_servizio (service_type in foodcost.db)
  per organizzazione e filtro, coerente con la categorizzazione delle
  ricette in Cucina (mig 074).

Struttura:
  1. CREATE TABLE clienti_menu_template
     - id, nome, descrizione, service_type_id (soft FK verso foodcost.db),
       prezzo_persona, sconto, created_at, updated_at
  2. CREATE TABLE clienti_menu_template_righe
     - id, template_id, recipe_id (soft FK verso foodcost.db), sort_order,
       category_name, name, description, price, created_at
     - FK template_id ON DELETE CASCADE
  3. Indici: idx_cmt_service_type(service_type_id, nome),
            idx_cmtr_template(template_id, sort_order)

NOTA: clienti_menu_template vive in clienti.sqlite3, non in foodcost.db.
service_type_id e' soft FK (no constraint): i service_types vivono in
foodcost.db, la coerenza e' gestita a livello service.
"""

import sqlite3
from pathlib import Path

CLIENTI_DB = Path(__file__).resolve().parent.parent / "data" / "clienti.sqlite3"


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return

    cconn = sqlite3.connect(str(CLIENTI_DB))
    cconn.row_factory = sqlite3.Row
    try:
        # ── 1. CREATE clienti_menu_template ──
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_menu_template (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                nome            TEXT    NOT NULL,
                descrizione     TEXT,
                service_type_id INTEGER,
                prezzo_persona  REAL    NOT NULL DEFAULT 0,
                sconto          REAL    NOT NULL DEFAULT 0,
                created_at      TEXT    DEFAULT (datetime('now')),
                updated_at      TEXT    DEFAULT (datetime('now'))
            )
        """)
        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cmt_service_type "
            "ON clienti_menu_template(service_type_id, nome)"
        )
        print("  + clienti_menu_template (tabella + index)")

        # ── 2. CREATE clienti_menu_template_righe ──
        cconn.execute("""
            CREATE TABLE IF NOT EXISTS clienti_menu_template_righe (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id    INTEGER NOT NULL,
                recipe_id      INTEGER,
                sort_order     INTEGER NOT NULL DEFAULT 0,
                category_name  TEXT,
                name           TEXT    NOT NULL,
                description    TEXT,
                price          REAL    NOT NULL DEFAULT 0,
                created_at     TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (template_id) REFERENCES clienti_menu_template(id) ON DELETE CASCADE
            )
        """)
        cconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cmtr_template "
            "ON clienti_menu_template_righe(template_id, sort_order)"
        )
        print("  + clienti_menu_template_righe (tabella + index)")

        cconn.commit()
    finally:
        cconn.close()
