"""
Migrazione 130 — Vino madre: nome etichetta + flag descrizione automatica (2026-05-16)

CONTESTO:
  Marco ha codificato (sessione 2026-05-16) la regola di composizione del
  "nome di una bottiglia" come unione strutturata di 4 ingredienti:
    {denominazione} {nome_etichetta} ({vitigni}) {grado}%
  Esempio:
    "Barolo DOCG Castiglione (Nebbiolo 100%) 14.5%"
    "Langhe Rosso DOC Sorì Tildin (Nebbiolo 95%, Barbera 5%) 14%"

  Finora il campo `descrizione` su `vini_madre_v2` (e in `vini_magazzino`)
  era libero TEXT: l'utente lo scriveva a mano in Excel come gli pareva.
  Da oggi, per i NUOVI vini creati via wizard, la descrizione viene
  composta automaticamente dai 4 sotto-campi e ri-sincronizzata se uno
  cambia.

  I 1287 vini esistenti restano INVARIATI: la migrazione aggiunge solo
  le 2 colonne nuove con default che non impattano (nome_etichetta NULL,
  descrizione_auto = 0 = manuale). La regola di ricomposizione si attiva
  solo dove `descrizione_auto = 1`. Quando in futuro vorremo migrare i
  vecchi vini a descrizione automatica, sarà una mig separata.

SCHEMA:
  ALTER TABLE vini_madre_v2 ADD COLUMN nome_etichetta TEXT
  ALTER TABLE vini_madre_v2 ADD COLUMN descrizione_auto INTEGER DEFAULT 0

CAMPI:
  - nome_etichetta:  nome aggiuntivo del vino oltre la denominazione (cru,
                     fantasia, nome enologico, "Castiglione"/"Sorì Tildin"/
                     "Bricco delle Viole"). NULL = nessun nome aggiuntivo
                     (es. "Barolo" base senza cru).
  - descrizione_auto: 1 = la descrizione viene composta automaticamente
                     dai sotto-campi (denominazione+nome+vitigni+grado).
                     0 = testo libero immutabile (default per vini storici).

DB: vini_magazzino.sqlite3 (locale-aware), tabella vini_madre_v2.
Idempotente: ADD COLUMN con check pragma.
"""
import sqlite3
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [130] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # Verifica esistenza tabella
        row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_madre_v2'"
        ).fetchone()
        if not row:
            print("  [130] vini_madre_v2 non esiste, skip (refactor V.6+V.7+V.8 non applicato)")
            return

        # Check colonne esistenti (idempotenza)
        cols = [c[1] for c in cur.execute("PRAGMA table_info(vini_madre_v2)").fetchall()]

        if "nome_etichetta" not in cols:
            cur.execute("ALTER TABLE vini_madre_v2 ADD COLUMN nome_etichetta TEXT")
            print("  [130] colonna nome_etichetta aggiunta")
        else:
            print("  [130] colonna nome_etichetta già presente, skip")

        if "descrizione_auto" not in cols:
            cur.execute("ALTER TABLE vini_madre_v2 ADD COLUMN descrizione_auto INTEGER DEFAULT 0")
            print("  [130] colonna descrizione_auto aggiunta (default 0 = manuale)")
        else:
            print("  [130] colonna descrizione_auto già presente, skip")

        mag.commit()
        print("  [130] DONE — vini esistenti invariati (descrizione_auto=0)")
    finally:
        mag.close()
